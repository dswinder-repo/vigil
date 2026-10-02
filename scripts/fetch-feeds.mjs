#!/usr/bin/env node
/**
 * Vigil feed fetcher.
 *
 * Runs on GitHub Actions (a server), NOT in the browser. That is the whole
 * point: servers are not subject to the browser's cross-origin rules, so we
 * do not need public CORS relays, which were the cause of feeds silently
 * failing to load.
 *
 * Output: public/data/*.json. Each commit redeploys the site on Vercel, and
 * the dashboard reads the files from its own domain at /vigil/data/.
 *
 * Failure policy: one bad source never empties a panel. If a source fails we
 * keep the previous run's items and mark the source stale in status.json.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'public', 'data');

const CONFIG = JSON.parse(await readFile(path.join(HERE, 'feeds.config.json'), 'utf8'));

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const UA =
  'Mozilla/5.0 (compatible; VigilBot/1.0; +https://winder.works/vigil/) AppleWebKit/537.36';

const status = [];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with backoff. A 429 ("slow down") or a 5xx is usually temporary —
 * GDELT in particular rate-limits shared CI addresses — so waiting and asking
 * again recovers the feed instead of reporting it dead.
 */
async function get(url, { asText = true, retries = 3, timeoutMs = TIMEOUT_MS } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep([0, 5_000, 15_000, 40_000][attempt] ?? 40_000);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: '*/*' },
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // worth another try
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`); // 403/404 will not improve
      return asText ? res.text() : res.json();
    } catch (err) {
      lastErr = err;
      // A timeout or socket error is also worth retrying; a thrown 4xx is not.
      if (/HTTP 4\d\d/.test(String(err.message))) throw err;
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

/** Run tasks with a small concurrency cap so we are a polite client. */
async function pool(items, fn, limit = CONCURRENCY) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const decode = (s = '') =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

// Decode entities first, then strip tags, then decode again: feeds routinely
// ship HTML that has been escaped once or twice over.
const strip = (s = '') =>
  decode(decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ''))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
};

/** Minimal RSS + Atom item extraction. Good enough for headlines and links. */
function parseFeed(xml, sourceName) {
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []),
  ];
  const items = [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    if (!title || title.length < 8) continue;

    let url = tag(b, 'link');
    if (!url) {
      const href = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (href) url = href[1];
    }

    const published =
      tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const ts = published ? new Date(published) : null;

    items.push({
      title,
      url,
      source: sourceName,
      summary: (tag(b, 'description') || tag(b, 'summary')).slice(0, 300),
      timestamp: ts && !isNaN(ts) ? ts.toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  ('the a an and or but of to in on for with from at by as is are was were be been' +
   ' has have had says say said after before over under new report reports amid').split(' '),
);

/** Content words, used to tell "same story, different headline" apart. */
function fingerprint(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * Twelve outlets covering one event used to fill the panel with twelve rows.
 * Matching on the first 80 characters never caught that, because each outlet
 * writes its own headline. This compares the meaningful words instead, so the
 * same story lands once and the panel shows twelve different things.
 */
function dedupe(items, threshold = 0.6) {
  const kept = [];
  const prints = [];
  for (const item of items) {
    const fp = fingerprint(item.title);
    let dupe = false;
    for (let i = 0; i < prints.length; i++) {
      if (overlap(fp, prints[i]) >= threshold) {
        dupe = true;
        break;
      }
    }
    if (dupe) continue;
    kept.push(item);
    prints.push(fp);
  }
  return kept;
}

/**
 * Google News appends " - Publisher" to every headline. On a feed scoped to
 * one site that is noise. On a topic search it is the only place the real
 * publisher appears, so it becomes the source.
 */
function cleanGoogleTitle(item, { keepSource }) {
  const cut = item.title.lastIndexOf(' - ');
  if (cut < 10) return item;
  const head = item.title.slice(0, cut).trim();
  const tail = item.title.slice(cut + 3).trim();
  // A publisher name, not the tail of a hyphenated headline: short, few words.
  if (!head || !tail || tail.length > 40 || tail.split(/\s+/).length > 5) return item;
  const out = { ...item, title: head };
  if (!keepSource) out.source = tail;
  return out;
}

async function readPrevious(file) {
  const p = path.join(OUT, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(file, payload) {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, file), JSON.stringify(payload, null, 1));
  console.log(`wrote public/data/${file} — ${payload.items?.length ?? 0} items`);
}

const WORLD_NOISE = [
  // Football vocabulary that reads as war: "offensive line", "blitz", "trenches".
  /\b(offensive line|defensive line|o-line|linebackers?|wide receivers?|running backs?|cornerbacks?|head coach|super bowl|preseason|training camp)\b/i,
  // Commentary, not events. "How likely is the extreme tail risk of a US
  // invasion of Canada?" led the board as a CONFLICT item, which is the kind
  // of thing that makes the whole page look unserious.
  /^(opinion|analysis|comment|editorial|explainer|profile|review|interview|podcast|in pictures)\b/i,
  /^(how|why|what|who|when|where|is|are|can|could|should|would|will|does|do|did)\b.*\?\s*$/i,
  /\b(tail risk|thought experiment|hypothetical|what if|imagine if|here's why|here is why|the case for|the case against|ranked|explained)\b/i,
  /\b(concert|album|singer|rapper|actor|actress|celebrity|hollywood|box office|netflix|grammy|oscar|red carpet)\b/i,
  /\b(football|soccer|cricket|basketball|baseball|hockey|tennis|golf|olympic|world cup|premier league|transfer window|playoffs?)\b/i,
  /\b(NFL|NBA|NCAA|MLB|NHL|quarterback|touchdown|halftime|season opener|matchup|head coach|starting lineup|draft pick|bowl game|Georgia Tech|Notre Dame)\b/,
  /\b(seeks|sparks?|boosts?) \w+ (?:spark|offense|defense)\b/i,
  /\b(recipe|restaurant|product recall|food recall|vehicle recall|lawsuit filed|class action|sued after|dealership|horoscope|lottery)\b/i,
  /\b(back to school|parenting|dating|weight loss|skincare|black friday|discount code|coupon)\b/i,
  /\b(stock (?:jumps|falls|rises)|earnings call|quarterly results|share price|IPO|dividend)\b/i,
];

const NOISE_PUBLISHERS =
  /\b(heavy\.com|espn|bleacher ?report|sports illustrated|si\.com|cbs ?sports|fox ?sports|the athletic|yahoo sports|sportskeeda|tmz|people\.com|us weekly|e! news|variety|hollywood reporter|deadline|pagesix|page six)\b/i;

/**
 * Fetch a set of RSS/Atom feeds into one merged, de-duplicated file.
 * Sources that fail are reported but do not remove previously-good items.
 */
async function buildFeedFile({ file, sources, cap = 150 }) {
  const results = await pool(sources, async (s) => {
    try {
      const xml = await get(s.url);
      let items = parseFeed(xml, s.name || s.account);
      if (!items.length) throw new Error('no items parsed');
      // Topic searches pull in sport and entertainment that happens to use the
      // same words — an offensive line is not an offensive.
      items = items.filter(
        (i) => !WORLD_NOISE.some((re) => re.test(i.title)) && !NOISE_PUBLISHERS.test(i.source ?? ''),
      );
      if (s.url.includes('news.google.com')) {
        // A site:-scoped search already knows its publisher; a topic search does not.
        const keepSource = s.url.includes('site%3A') || s.url.includes('site:');
        items = items.map((i) => cleanGoogleTitle(i, { keepSource }));
      }
      status.push({ source: s.name || s.account, group: file, ok: true, count: items.length });
      return items;
    } catch (err) {
      status.push({
        source: s.name || s.account,
        group: file,
        ok: false,
        error: String(err.message || err).slice(0, 120),
      });
      return [];
    }
  });

  let items = results.flat();

  // Keep last-good items from sources that failed this run, so a transient
  // outage never blanks the panel.
  const failed = new Set(status.filter((s) => s.group === file && !s.ok).map((s) => s.source));
  if (failed.size) {
    const prev = await readPrevious(file);
    if (prev?.items?.length) {
      const carried = prev.items.filter((i) => failed.has(i.source));
      items = items.concat(
        carried
          .filter((i) => !WORLD_NOISE.some((re) => re.test(i.title)) && !NOISE_PUBLISHERS.test(i.source ?? ''))
          .map((i) => ({ ...i, stale: true })),
      );
    }
  }

  // Newest first, one row per story, capped.
  items = dedupe(
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  ).slice(0, cap);

  const okCount = status.filter((s) => s.group === file && s.ok).length;
  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    sourcesOk: okCount,
    sourcesTotal: sources.length,
    items,
  });
}

// ---------------------------------------------------------------------------
// military — GDELT news query (server-side, no relay)
// ---------------------------------------------------------------------------

async function buildMilitary() {
  const file = 'military.json';
  try {
    // GDELT is rate-limited to a handful of calls a run and that budget is
    // spent on the map, which has no other source. The news queries below
    // fill this panel perfectly well.
    if (!CONFIG.militaryUrl) throw new Error('GDELT not used for this panel');
    const raw = await get(CONFIG.militaryUrl);
    const data = JSON.parse(raw);
    const articles = data?.articles ?? [];
    if (!articles.length) throw new Error('GDELT returned no articles');

    const items = articles
      .filter((a) => a.title && a.title.length >= 10)
      .map((a) => ({
        title: strip(a.title),
        url: a.url,
        source: a.domain || 'GDELT',
        timestamp: gdeltDate(a.seendate),
        country: a.sourcecountry || null,
      }));

    const unique = dedupe(items);
    status.push({ source: 'GDELT Military', group: file, ok: true, count: unique.length });
    await writeJson(file, {
      fetchedAt: new Date().toISOString(),
      sourcesOk: 1,
      sourcesTotal: 1,
      items: unique.slice(0, 120),
    });
    return;
  } catch (err) {
    status.push({
      source: 'GDELT Military',
      group: file,
      ok: false,
      error: String(err.message || err).slice(0, 120),
    });
  }

  // GDELT is the better source but rate-limits shared CI addresses. Rather
  // than show an empty military panel — which reads as "no wars on" — fall
  // back to a second source before giving up.
  const fallbackUrls = CONFIG.militaryFallbackUrls ??
    (CONFIG.militaryFallbackUrl ? [CONFIG.militaryFallbackUrl] : []);

  if (fallbackUrls.length) {
    try {
      const batches = await pool(fallbackUrls, async (u) => {
        try {
          return parseFeed(await get(u), 'News');
        } catch {
          return [];
        }
      }, 3);
      const parsed = batches
        .flat()
        .map((i) => cleanGoogleTitle(i, { keepSource: false }))
        .filter((i) => !WORLD_NOISE.some((re) => re.test(i.title)) && !NOISE_PUBLISHERS.test(i.source ?? ''))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const items = dedupe(parsed);
      if (items.length) {
        status.push({
          source: `Military fallback (${fallbackUrls.length} queries)`,
          group: file,
          ok: true,
          count: items.length,
        });
        await writeJson(file, {
          fetchedAt: new Date().toISOString(),
          sourcesOk: 1,
          sourcesTotal: 1,
          fallback: true,
          items: items.slice(0, 120),
        });
        return;
      }
      throw new Error('no items parsed');
    } catch (err) {
      status.push({
        source: 'Military fallback',
        group: file,
        ok: false,
        error: String(err.message || err).slice(0, 120),
      });
    }
  }

  const prev = await readPrevious(file);
  await writeJson(file, {
    fetchedAt: prev?.fetchedAt ?? null,
    sourcesOk: 0,
    sourcesTotal: 1,
    failed: true,
    items: (prev?.items ?? []).map((i) => ({ ...i, stale: true })),
  });
}

/** GDELT stamps look like 20260924T153000Z. */
function gdeltDate(s) {
  if (!s || s.length < 15) return new Date().toISOString();
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(
    11,
    13,
  )}:${s.slice(13, 15)}Z`;
  const d = new Date(iso);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

// ---------------------------------------------------------------------------
// markets — Yahoo chart endpoint (blocks browsers, fine from a server)
// ---------------------------------------------------------------------------

async function buildMarkets() {
  const file = 'markets.json';
  const bases = [
    'https://query1.finance.yahoo.com/v8/finance/chart/',
    'https://query2.finance.yahoo.com/v8/finance/chart/',
  ];

  const quotes = await pool(
    CONFIG.symbols,
    async (sym) => {
      for (const base of bases) {
        try {
          const raw = await get(`${base}${encodeURIComponent(sym)}?range=1d&interval=5m`);
          const meta = JSON.parse(raw)?.chart?.result?.[0]?.meta;
          if (!meta?.regularMarketPrice) continue;
          const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
          const price = meta.regularMarketPrice;
          const change = price - prev;
          return {
            symbol: sym,
            name: meta.shortName || sym,
            price,
            change,
            changePercent: prev ? (change / prev) * 100 : 0,
            up: change >= 0,
            currency: meta.currency || 'USD',
          };
        } catch {
          /* try the other host */
        }
      }
      return null;
    },
    4,
  );

  const items = quotes.filter(Boolean);

  if (!items.length) {
    status.push({ source: 'Yahoo Finance', group: file, ok: false, error: 'no quotes returned' });
    const prev = await readPrevious(file);
    await writeJson(file, {
      fetchedAt: prev?.fetchedAt ?? null,
      sourcesOk: 0,
      sourcesTotal: 1,
      failed: true,
      items: (prev?.items ?? []).map((i) => ({ ...i, stale: true })),
    });
    return;
  }

  status.push({ source: 'Yahoo Finance', group: file, ok: true, count: items.length });
  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    sourcesOk: 1,
    sourcesTotal: 1,
    items,
  });
}

// ---------------------------------------------------------------------------
// bilateral — media attention volume per country pair
// ---------------------------------------------------------------------------

/**
 * The old version asked GDELT's geo endpoint from the browser and, whenever
 * that call failed, recorded the pair as zero. A failed network call then
 * rendered as "no tension between Russia and Ukraine", which is worse than
 * showing nothing at all.
 *
 * This counts how many articles each pair drew in the last 24 hours. A pair
 * that could not be measured is left out of the file entirely, so the panel
 * never shows an invented zero.
 */
async function buildBilateral() {
  const file = 'bilateral.json';
  const pairs = CONFIG.bilateral ?? [];
  const prev = await readPrevious(file);
  const prevCounts = Object.fromEntries((prev?.items ?? []).map((p) => [p.id, p.articles]));

  const measured = await pool(pairs, async (p) => {
    try {
      const xml = await get(
        `https://news.google.com/rss/search?q=${encodeURIComponent(p.q)}+when:1d&hl=en-US&gl=US&ceid=US:en`,
      );
      // Count distinct stories. Wire copy syndicated to thirty outlets is one
      // event, and counting it thirty times made quiet pairs look like crises.
      const items = dedupe(
        parseFeed(xml, p.id).map((i) => cleanGoogleTitle(i, { keepSource: false })),
        0.55,
      );
      status.push({ source: `pair:${p.id}`, group: file, ok: true, count: items.length });
      return { id: p.id, a: p.a, b: p.b, articles: items.length };
    } catch (err) {
      status.push({
        source: `pair:${p.id}`,
        group: file,
        ok: false,
        error: String(err.message || err).slice(0, 120),
      });
      // Carry the last good reading rather than reporting a false zero.
      const last = (prev?.items ?? []).find((x) => x.id === p.id);
      return last ? { ...last, stale: true } : null;
    }
  });

  const peak = Math.max(1, ...measured.filter(Boolean).map((p) => p.articles));
  const items = measured
    .filter(Boolean)
    .map((p) => {
      const before = prevCounts[p.id];
      let trend = 'stable';
      if (typeof before === 'number' && before > 0) {
        if (p.articles > before * 1.15) trend = 'up';
        else if (p.articles < before * 0.85) trend = 'down';
      }
      return { ...p, score: Math.round((p.articles / peak) * 100), trend };
    })
    .sort((a, b) => b.score - a.score);

  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    failed: items.length === 0,
    sourcesOk: items.filter((i) => !i.stale).length,
    sourcesTotal: pairs.length,
    items,
  });
}

// ---------------------------------------------------------------------------
// snapshots — sources the browser is not allowed to call
// ---------------------------------------------------------------------------

/**
 * Most of these refuse cross-origin requests, so the dashboard used to route
 * them through free public relays that throttled and returned error pages.
 * We copy each one here instead and serve it from our own domain, unchanged.
 *
 * When a source is down we keep the copy we already have. GDELT in particular
 * rate-limits heavily, and a map drawn from a twenty-minute-old reading is far
 * better than an empty one.
 */
/**
 * These files are committed to the repository every fifteen minutes, so their
 * size is not free: the CISA catalogue alone is 1.7 MB and 1,723 entries, of
 * which the dashboard shows the last thirty days. Trimming to what is actually
 * read keeps years of history from piling up in git for no benefit.
 */
function trimSnapshot(body, trim) {
  if (!trim) return body;
  try {
    if (trim.items) {
      // XML: keep the newest N <item> blocks and the envelope around them.
      const blocks = body.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
      if (blocks.length <= trim.items) return body;
      const first = body.indexOf(blocks[0]);
      const lastKept = blocks[trim.items - 1];
      const endOfLast = body.indexOf(lastKept) + lastKept.length;
      const afterAll = body.indexOf(blocks[blocks.length - 1]) + blocks[blocks.length - 1].length;
      return body.slice(0, endOfLast) + body.slice(afterAll);
      void first;
    }
    if (trim.path) {
      const data = JSON.parse(body);
      const arr = data?.[trim.path];
      if (!Array.isArray(arr) || arr.length <= trim.keep) return body;
      const sorted = trim.sortBy
        ? [...arr].sort((a, b) => String(b[trim.sortBy] ?? '').localeCompare(String(a[trim.sortBy] ?? '')))
        : arr;
      data[trim.path] = sorted.slice(0, trim.keep);
      if (typeof data.count === 'number') data.count = data[trim.path].length;
      return JSON.stringify(data);
    }
  } catch {
    // A trim that fails is not worth losing the data over.
  }
  return body;
}

async function buildSnapshots() {
  const list = CONFIG.snapshots ?? [];
  if (!list.length) return;
  const dir = path.join(OUT, 'raw');
  await mkdir(dir, { recursive: true });

  let fresh = 0;
  let carried = 0;

  const take = async (s) => {
    const dest = path.join(dir, s.file);
    try {
      // Some of these are a megabyte or more; the default budget is too tight.
      const body = await get(s.url, { timeoutMs: s.timeoutMs ?? 60_000 });
      const head = body.trim().slice(0, 1);
      if (s.expect === 'json' && head !== '{' && head !== '[') throw new Error('not JSON');
      if (s.expect === 'xml' && head !== '<') throw new Error('not XML');
      await writeFile(dest, trimSnapshot(body, s.trim));
      fresh++;
      status.push({ source: `snapshot:${s.file}`, group: 'snapshots', ok: true, count: body.length });
    } catch (err) {
      const had = existsSync(dest);
      if (!had) {
        await writeFile(dest, s.expect === 'xml' ? '<rss><channel></channel></rss>' : '{"features":[],"data":[],"vulnerabilities":[],"articles":[]}');
      } else {
        carried++;
      }
      status.push({
        source: `snapshot:${s.file}`,
        group: 'snapshots',
        ok: false,
        carried: had,
        error: String(err.message || err).slice(0, 120),
      });
    }
  };

  // GDELT allows one request every five seconds and answers 429 to anything
  // faster, so those run one at a time with a gap. The rest run in parallel.
  const throttled = list.filter((s) => s.throttleMs);
  const rest = list.filter((s) => !s.throttleMs);

  await Promise.all([
    (async () => {
      for (const s of throttled) {
        await take(s);
        await sleep(s.throttleMs);
      }
    })(),
    pool(rest, take, 3),
  ]);

  console.log(`wrote public/data/raw — ${fresh} fresh, ${carried} carried forward, ${list.length} total`);
}


// ---------------------------------------------------------------------------
// gdelt — world events with a country attached
// ---------------------------------------------------------------------------

const GDELT_NOISE_CHECK = (t) => WORLD_NOISE.some((re) => re.test(t));

const GDELT_CATEGORY = [
  ['cyber', /\b(cyberattack|ransomware|malware|hacker|hacking|phishing|spyware|DDoS|botnet|data breach)\b/i],
  ['disease', /\b(outbreak|epidemic|pandemic|cholera|ebola|mpox|dengue|measles|tuberculosis|influenza)\b/i],
  ['humanitarian', /\b(famine|starvation|displacement|refugee|genocide|atrocit|malnutrition|aid convoy|civilian casualties|war crimes)\b/i],
  ['unrest', /\b(riot|coup|uprising|crackdown|insurrection|looting|mutiny|junta|martial law|state of emergency|curfew|protest)\b/i],
  ['conflict', /\b(airstrike|shelling|bombardment|counteroffensive|invasion|ceasefire|artillery|drone strike|missile|warship|troops|warhead|nuclear test|(?:military|ground|major|renewed) offensive)\b/i],
  ['political', /\b(sanction|impeachment|assassination|referendum|peace treaty|embargo|trade war|export controls|asset freeze|arms deal|security council)\b/i],
  ['disaster', /\b(earthquake|tsunami|hurricane|flood|wildfire|eruption|tornado|cyclone|typhoon)\b/i],
];

function gdeltCategory(title) {
  if (GDELT_NOISE_CHECK(title)) return null;
  for (const [cat, re] of GDELT_CATEGORY) if (re.test(title)) return cat;
  return null;
}

function gdeltSeverity(title) {
  const t = title.toLowerCase();
  if (/massacre|genocide|nuclear test|invasion|coup|mass casualt/.test(t)) return 5;
  if (/airstrike|bombardment|offensive|killed|missile strike|atrocit|famine/.test(t)) return 4;
  if (/clash|attack|strike|sanction|crackdown|outbreak|ransomware/.test(t)) return 3;
  return 2;
}

/**
 * The geo endpoint this used to call was retired and now answers 404, so the
 * article endpoint stands in. It gives a headline and a source country rather
 * than a mapped location, which is enough to place an item on a map by country
 * and more than enough to list it.
 */
async function buildGdelt() {
  const file = 'gdelt.json';
  const queries = CONFIG.gdelt ?? [];
  const gap = CONFIG.gdeltGapMs ?? 25_000;
  if (!queries.length) return;

  const collected = [];
  let ok = 0;

  for (let i = 0; i < queries.length; i++) {
    if (i) await sleep(gap);
    const q = queries[i];
    // q.q is already encoded in the config. Encoding it again turns the
    // parentheses into %28 / %29 and GDELT's parser rejects the request.
    const url =
      'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      q.q +
      '%20sourcelang%3Aenglish&mode=artlist&maxrecords=75&format=json&timespan=1440&sort=DateDesc';
    try {
      // One slow retry rather than the usual ladder: GDELT punishes bursts and
      // the whole run has to finish inside the workflow's time budget.
      const raw = await get(url, { retries: 2, timeoutMs: 45_000 });
      const articles = JSON.parse(raw)?.articles ?? [];
      if (!articles.length) throw new Error('no articles');
      for (const a of articles) {
        const title = decode(String(a.title ?? '')).trim();
        if (title.length < 12 || /^ERROR:/i.test(title)) continue;
        const category = gdeltCategory(title);
        if (!category) continue;
        collected.push({
          title,
          url: a.url,
          domain: a.domain ?? '',
          // Deliberately not a.sourcecountry: that is where the outlet is, not
          // where the event happened, so a Manila paper covering New York put a
          // New York protest in the Philippines.
          country: '',
          timestamp: gdeltDate(a.seendate),
          category,
          severity: gdeltSeverity(title),
        });
      }
      ok++;
      status.push({ source: `gdelt:${q.key}`, group: file, ok: true, count: articles.length });
    } catch (err) {
      status.push({
        source: `gdelt:${q.key}`,
        group: file,
        ok: false,
        error: String(err.message || err).slice(0, 120),
      });
    }
  }

  const items = dedupe(
    collected.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  ).slice(0, 250);

  if (!items.length) {
    // Keep the last good reading. An empty world map reads as "nothing is
    // happening anywhere", which is never true and looks broken.
    const prev = await readPrevious(file);
    await writeJson(file, {
      fetchedAt: prev?.fetchedAt ?? null,
      failed: true,
      sourcesOk: 0,
      sourcesTotal: queries.length,
      items: (prev?.items ?? []).map((i) => ({ ...i, stale: true })),
    });
    return;
  }

  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    sourcesOk: ok,
    sourcesTotal: queries.length,
    items,
  });
}

// ---------------------------------------------------------------------------
// world — conflict and political events, placed on the map
// ---------------------------------------------------------------------------

/**
 * This layer used to come entirely from GDELT's geo endpoint. That endpoint has
 * been retired, and GDELT's remaining endpoint rate-limits too aggressively to
 * depend on, so the map went blank wherever conflict was meant to be.
 *
 * Everything here is now built from the RSS sources that already load reliably
 * every run. Each headline is sorted into a category and placed by whichever
 * country it names. GDELT is merged in on top when it happens to answer, so it
 * adds to the picture instead of being the whole picture.
 */

const PLACES = [
  // Ukraine / Russia
  ['ukraine', [31.2, 49.0]], ['kyiv', [30.5, 50.5]], ['kiev', [30.5, 50.5]],
  ['kharkiv', [36.2, 50.0]], ['odesa', [30.7, 46.5]], ['odessa', [30.7, 46.5]],
  ['crimea', [34.1, 45.3]], ['donetsk', [37.8, 48.0]], ['luhansk', [39.3, 48.6]],
  ['zaporizhzhia', [35.1, 47.8]], ['kherson', [32.6, 46.6]], ['mariupol', [37.5, 47.1]],
  ['dnipro', [35.0, 48.5]], ['lviv', [24.0, 49.8]], ['sumy', [34.8, 50.9]],
  ['belgorod', [36.6, 50.6]], ['kursk', [36.2, 51.7]], ['sevastopol', [33.5, 44.6]],
  ['russia', [37.6, 55.8]], ['moscow', [37.6, 55.8]], ['kremlin', [37.6, 55.8]],
  ['st petersburg', [30.3, 59.9]], ['vladivostok', [131.9, 43.1]],
  ['kaliningrad', [20.5, 54.7]], ['chechnya', [45.7, 43.3]],

  // Middle East
  ['gaza', [34.4, 31.4]], ['rafah', [34.3, 31.3]], ['khan younis', [34.3, 31.3]],
  ['israel', [34.9, 31.5]], ['tel aviv', [34.8, 32.1]], ['jerusalem', [35.2, 31.8]],
  ['west bank', [35.3, 31.9]], ['ramallah', [35.2, 31.9]], ['jenin', [35.3, 32.5]],
  ['golan', [35.8, 33.0]], ['idf', [34.8, 32.1]],
  ['lebanon', [35.9, 33.9]], ['beirut', [35.5, 33.9]], ['hezbollah', [35.5, 33.9]],
  ['syria', [38.6, 34.8]], ['damascus', [36.3, 33.5]], ['aleppo', [37.2, 36.2]],
  ['idlib', [36.6, 35.9]], ['quneitra', [35.8, 33.1]],
  ['iran', [53.7, 32.4]], ['tehran', [51.4, 35.7]], ['isfahan', [51.7, 32.7]],
  ['natanz', [51.9, 33.7]], ['fordow', [50.9, 34.9]], ['hormuz', [56.5, 26.6]],
  ['iraq', [43.7, 33.2]], ['baghdad', [44.4, 33.3]], ['erbil', [44.0, 36.2]],
  ['mosul', [43.1, 36.3]], ['basra', [47.8, 30.5]],
  ['yemen', [48.5, 15.6]], ['houthi', [44.2, 15.4]], ['sanaa', [44.2, 15.4]],
  ['aden', [45.0, 12.8]], ['hodeidah', [42.9, 14.8]],
  ['red sea', [38.0, 20.0]], ['bab el-mandeb', [43.3, 12.6]], ['suez', [32.3, 30.0]],
  ['saudi arabia', [45.1, 23.9]], ['saudi', [45.1, 23.9]], ['riyadh', [46.7, 24.7]],
  ['jeddah', [39.2, 21.5]], ['qatar', [51.2, 25.3]], ['doha', [51.5, 25.3]],
  ['uae', [53.8, 23.4]], ['dubai', [55.3, 25.2]], ['abu dhabi', [54.4, 24.5]],
  ['kuwait', [47.5, 29.3]], ['bahrain', [50.6, 26.0]], ['oman', [56.0, 21.5]],
  ['jordan', [36.2, 30.6]], ['amman', [35.9, 32.0]],
  ['egypt', [30.8, 26.8]], ['cairo', [31.2, 30.0]], ['sinai', [33.8, 29.5]],
  ['turkey', [35.2, 39.0]], ['ankara', [32.9, 39.9]], ['istanbul', [29.0, 41.0]],
  ['kurdish', [43.0, 36.5]], ['kurdistan', [44.0, 36.2]],

  // Asia-Pacific
  ['china', [104.2, 35.9]], ['beijing', [116.4, 39.9]], ['shanghai', [121.5, 31.2]],
  ['xinjiang', [85.0, 41.0]], ['tibet', [88.0, 31.0]],
  ['taiwan', [120.9, 23.7]], ['taipei', [121.6, 25.0]], ['taiwan strait', [119.5, 24.5]],
  ['hong kong', [114.2, 22.3]], ['south china sea', [114.0, 13.0]],
  ['east china sea', [125.0, 29.0]], ['senkaku', [123.5, 25.7]],
  ['north korea', [127.5, 40.3]], ['pyongyang', [125.8, 39.0]], ['dprk', [127.5, 40.3]],
  ['south korea', [127.8, 35.9]], ['seoul', [127.0, 37.6]],
  ['japan', [138.3, 36.2]], ['tokyo', [139.7, 35.7]], ['okinawa', [127.8, 26.3]],
  ['philippines', [122.9, 12.9]], ['manila', [121.0, 14.6]],
  ['vietnam', [108.3, 14.1]], ['hanoi', [105.8, 21.0]],
  ['myanmar', [95.9, 21.9]], ['burma', [95.9, 21.9]], ['rakhine', [93.5, 20.1]],
  ['thailand', [101.0, 15.9]], ['bangkok', [100.5, 13.8]],
  ['cambodia', [104.9, 12.6]], ['laos', [102.5, 19.9]],
  ['indonesia', [113.9, -0.8]], ['jakarta', [106.8, -6.2]], ['papua', [140.0, -4.0]],
  ['malaysia', [102.0, 4.2]], ['singapore', [103.8, 1.35]],
  ['india', [78.9, 20.6]], ['new delhi', [77.2, 28.6]], ['mumbai', [72.9, 19.1]],
  ['pakistan', [69.3, 30.4]], ['islamabad', [73.1, 33.7]], ['karachi', [67.0, 24.9]],
  ['kashmir', [75.3, 34.1]], ['balochistan', [65.0, 28.5]],
  ['afghanistan', [67.7, 33.9]], ['kabul', [69.2, 34.5]], ['taliban', [69.2, 34.5]],
  ['kandahar', [65.7, 31.6]],
  ['bangladesh', [90.4, 23.7]], ['dhaka', [90.4, 23.8]],
  ['sri lanka', [80.8, 7.9]], ['nepal', [84.1, 28.4]],
  ['kazakhstan', [66.9, 48.0]], ['uzbekistan', [64.6, 41.4]],
  ['kyrgyzstan', [74.8, 41.2]], ['tajikistan', [71.3, 38.9]],
  ['mongolia', [103.8, 46.9]],

  // Africa
  ['sudan', [29.9, 15.6]], ['khartoum', [32.5, 15.6]], ['darfur', [24.9, 13.6]],
  ['el fasher', [25.3, 13.6]], ['port sudan', [37.2, 19.6]],
  ['south sudan', [31.3, 7.9]], ['juba', [31.6, 4.9]],
  ['ethiopia', [40.5, 9.1]], ['addis ababa', [38.8, 9.0]], ['tigray', [38.5, 14.0]],
  ['amhara', [37.5, 11.5]], ['oromia', [39.0, 8.0]],
  ['eritrea', [39.8, 15.2]], ['asmara', [38.9, 15.3]],
  ['somalia', [46.2, 6.0]], ['mogadishu', [45.3, 2.0]], ['al-shabaab', [45.3, 2.0]],
  ['somaliland', [45.0, 9.6]], ['djibouti', [43.0, 11.6]],
  ['kenya', [37.9, 0.0]], ['nairobi', [36.8, -1.3]], ['mombasa', [39.7, -4.0]],
  ['uganda', [32.3, 1.4]], ['kampala', [32.6, 0.3]],
  ['tanzania', [34.9, -6.4]], ['dar es salaam', [39.3, -6.8]],
  ['rwanda', [29.9, -1.9]], ['kigali', [30.1, -1.9]],
  ['burundi', [29.9, -3.4]],
  ['congo', [23.7, -2.9]], ['drc', [23.7, -2.9]], ['goma', [29.2, -1.7]],
  ['kinshasa', [15.3, -4.3]], ['m23', [29.2, -1.7]], ['bukavu', [28.8, -2.5]],
  ['nigeria', [8.7, 9.1]], ['abuja', [7.5, 9.1]], ['lagos', [3.4, 6.5]],
  ['boko haram', [13.2, 11.8]], ['sahel', [-2.0, 15.0]],
  ['mali', [-2.0, 17.6]], ['bamako', [-8.0, 12.6]],
  ['burkina faso', [-1.6, 12.4]], ['burkina', [-1.6, 12.4]],
  ['niger', [8.1, 17.6]], ['niamey', [2.1, 13.5]],
  ['chad', [18.7, 15.5]], ["n'djamena", [15.0, 12.1]],
  ['libya', [17.2, 26.3]], ['tripoli', [13.2, 32.9]], ['benghazi', [20.1, 32.1]],
  ['cameroon', [12.4, 3.9]], ['central african republic', [20.9, 6.6]],
  ['mozambique', [35.5, -18.7]], ['cabo delgado', [39.3, -12.3]],
  ['zimbabwe', [29.2, -19.0]], ['zambia', [27.9, -13.1]],
  ['south africa', [22.9, -30.6]], ['johannesburg', [28.0, -26.2]],
  ['cape town', [18.4, -33.9]], ['pretoria', [28.2, -25.7]],
  ['ghana', [-1.0, 7.9]], ['accra', [-0.2, 5.6]],
  ['senegal', [-14.5, 14.5]], ['dakar', [-17.4, 14.7]],
  ['ivory coast', [-5.5, 7.5]], ["cote d'ivoire", [-5.5, 7.5]],
  ['guinea', [-11.8, 11.0]], ['sierra leone', [-11.8, 8.5]], ['liberia', [-9.4, 6.4]],
  ['morocco', [-7.1, 31.8]], ['rabat', [-6.8, 34.0]],
  ['algeria', [3.0, 28.0]], ['algiers', [3.1, 36.8]],
  ['tunisia', [9.5, 33.9]], ['angola', [17.9, -11.2]], ['botswana', [24.7, -22.3]],
  ['namibia', [17.1, -22.6]], ['malawi', [34.3, -13.3]], ['madagascar', [46.9, -18.8]],

  // Americas
  ['venezuela', [-66.6, 6.4]], ['caracas', [-66.9, 10.5]], ['essequibo', [-59.0, 6.0]],
  ['guyana', [-58.9, 4.9]], ['colombia', [-74.3, 4.6]], ['bogota', [-74.1, 4.7]],
  ['santa marta', [-74.2, 11.2]], ['medellin', [-75.6, 6.2]],
  ['brazil', [-51.9, -14.2]], ['brasilia', [-47.9, -15.8]], ['amazon', [-60.0, -3.0]],
  ['mexico', [-102.6, 23.6]], ['mexico city', [-99.1, 19.4]], ['sinaloa', [-107.4, 25.0]],
  ['haiti', [-72.3, 18.9]], ['port-au-prince', [-72.3, 18.5]],
  ['cuba', [-77.8, 21.5]], ['havana', [-82.4, 23.1]],
  ['argentina', [-63.6, -38.4]], ['chile', [-71.5, -35.7]], ['peru', [-75.0, -9.2]],
  ['ecuador', [-78.2, -1.8]], ['quito', [-78.5, -0.2]], ['guayaquil', [-79.9, -2.2]],
  ['bolivia', [-63.6, -16.3]], ['panama', [-80.8, 8.5]], ['honduras', [-86.2, 15.2]],
  ['el salvador', [-88.9, 13.8]], ['guatemala', [-90.2, 15.8]], ['nicaragua', [-85.2, 12.9]],
  ['united states', [-95.7, 37.1]], ['washington', [-77.0, 38.9]],
  ['pentagon', [-77.1, 38.9]], ['white house', [-77.0, 38.9]],
  ['new york', [-74.0, 40.7]], ['los angeles', [-118.2, 34.1]], ['chicago', [-87.6, 41.9]],
  ['texas', [-99.9, 31.5]], ['florida', [-81.5, 27.7]], ['california', [-119.4, 36.8]],
  ['canada', [-106.3, 56.1]], ['ottawa', [-75.7, 45.4]], ['toronto', [-79.4, 43.7]],

  // Europe
  ['united kingdom', [-3.4, 55.4]], ['britain', [-3.4, 55.4]], ['london', [-0.1, 51.5]],
  ['france', [2.2, 46.2]], ['paris', [2.4, 48.9]],
  ['germany', [10.5, 51.2]], ['berlin', [13.4, 52.5]],
  ['poland', [19.1, 51.9]], ['warsaw', [21.0, 52.2]],
  ['belarus', [28.0, 53.5]], ['minsk', [27.6, 53.9]],
  ['moldova', [28.4, 47.4]], ['transnistria', [29.6, 46.8]],
  ['romania', [25.0, 45.9]], ['bucharest', [26.1, 44.4]],
  ['hungary', [19.5, 47.2]], ['budapest', [19.0, 47.5]],
  ['slovakia', [19.7, 48.7]], ['czech', [15.5, 49.8]], ['austria', [14.6, 47.5]],
  ['serbia', [21.0, 44.0]], ['belgrade', [20.5, 44.8]],
  ['kosovo', [20.9, 42.6]], ['bosnia', [17.7, 44.0]], ['croatia', [15.2, 45.1]],
  ['greece', [21.8, 39.1]], ['athens', [23.7, 38.0]],
  ['italy', [12.6, 41.9]], ['rome', [12.5, 41.9]],
  ['spain', [-3.7, 40.4]], ['madrid', [-3.7, 40.4]], ['portugal', [-8.2, 39.4]],
  ['netherlands', [5.3, 52.1]], ['the hague', [4.3, 52.1]],
  ['belgium', [4.5, 50.5]], ['brussels', [4.4, 50.8]],
  ['nato', [4.4, 50.8]], ['european union', [4.4, 50.8]],
  ['sweden', [18.6, 60.1]], ['stockholm', [18.1, 59.3]],
  ['norway', [8.5, 60.5]], ['oslo', [10.7, 59.9]],
  ['finland', [25.7, 61.9]], ['helsinki', [24.9, 60.2]],
  ['denmark', [9.5, 56.3]], ['copenhagen', [12.6, 55.7]],
  ['baltic', [20.0, 57.0]], ['estonia', [25.0, 58.6]], ['latvia', [24.6, 56.9]],
  ['lithuania', [23.9, 55.2]], ['iceland', [-19.0, 64.9]], ['ireland', [-8.2, 53.4]],
  ['switzerland', [8.2, 46.8]], ['geneva', [6.1, 46.2]],
  ['georgia country', [43.4, 42.3]], ['tbilisi', [44.8, 41.7]],
  ['armenia', [45.0, 40.1]], ['yerevan', [44.5, 40.2]],
  ['azerbaijan', [47.6, 40.1]], ['baku', [49.9, 40.4]], ['karabakh', [46.8, 39.8]],

  // Oceania and global bodies
  ['australia', [133.8, -25.3]], ['canberra', [149.1, -35.3]], ['sydney', [151.2, -33.9]],
  ['new zealand', [174.9, -40.9]], ['papua new guinea', [143.9, -6.3]],
  ['united nations', [-73.97, 40.75]], ['security council', [-73.97, 40.75]],
  ['arctic', [0.0, 80.0]], ['antarctica', [0.0, -82.0]],
];

/** Longest names first so "south sudan" wins over "sudan". */
const PLACES_SORTED = [...PLACES].sort((a, b) => b[0].length - a[0].length);

function placeOf(text) {
  const t = ` ${text.toLowerCase()} `;
  for (const [name, coords] of PLACES_SORTED) {
    if (t.includes(` ${name} `) || t.includes(` ${name},`) || t.includes(` ${name}'`)) {
      return { name, coords };
    }
  }
  return null;
}

const WORLD_CATEGORY = [
  ['cyber', /\b(cyber ?attack|ransomware|malware|hackers?|hacking|phishing|spyware|DDoS|botnet|data breach|zero-day)\b/i],
  ['disease', /\b(outbreak|epidemic|pandemic|cholera|ebola|mpox|dengue|measles|tuberculosis|influenza|bird flu)\b/i],
  ['humanitarian', /\b(famine|starvation|displac|refugees?|genocide|atrociti|malnutrition|aid convoy|civilian casualties|war crimes|humanitarian)\b/i],
  ['unrest', /\b(riots?|coup|uprising|crackdown|insurrection|looting|mutiny|junta|martial law|state of emergency|curfew|mass protests?)\b/i],
  ['conflict', /\b(air ?strikes?|shelling|bombardment|counteroffensive|invasion|ceasefire|artillery|drone strikes?|missiles?|warships?|troops|warhead|militants?|insurgents?|killed in|fighting|(?:military|ground|major|renewed|new) offensive)\b/i],
  ['political', /\b(sanctions?|impeachment|assassination|referendum|peace treaty|embargo|trade war|export controls|arms deal|expel(?:s|led)? (?:the )?ambassador|severs? ties|state visit|war crimes tribunal|security council)\b/i],
  ['disaster', /\b(earthquake|tsunami|hurricane|floods?|wildfires?|eruption|tornado|cyclone|typhoon|landslide)\b/i],
];

/**
 * A board about war and politics should not carry concert announcements,
 * transfer rumours or food recalls, and each of those matched something on the
 * first pass. Anything here is dropped no matter what else it matched.
 */

function worldCategory(title) {
  if (WORLD_NOISE.some((re) => re.test(title))) return null;
  for (const [cat, re] of WORLD_CATEGORY) if (re.test(title)) return cat;
  return null;
}

function worldSeverity(title) {
  const t = title.toLowerCase();
  if (/massacre|genocide|nuclear test|invasion|coup|mass casualt/.test(t)) return 5;
  if (/air ?strike|bombardment|offensive|killed|missile strike|atrociti|famine/.test(t)) return 4;
  if (/clash|attack|strike|sanction|crackdown|outbreak|ransomware|militant/.test(t)) return 3;
  return 2;
}

async function buildWorld() {
  const file = 'world.json';
  const collected = [];

  // Reuse what the feeds already brought in — no extra requests.
  for (const src of ['news.json', 'osint.json', 'military.json']) {
    const f = await readPrevious(src);
    for (const item of f?.items ?? []) {
      const category = worldCategory(item.title);
      if (!category) continue;
      const place = placeOf(item.title);
      if (!place) continue;
      collected.push({
        title: item.title,
        url: item.url,
        domain: item.source ?? '',
        country: place.name,
        // Send the coordinates, not just the name. The browser cannot resolve
        // "kyiv" or "gaza" on its own and was silently dropping those pins.
        coordinates: place.coords,
        timestamp: item.timestamp,
        category,
        severity: worldSeverity(item.title),
      });
    }
  }

  const fromFeeds = collected.length;

  // GDELT on top when it answers. It often does not, and that is fine now.
  const gd = await readPrevious('gdelt.json');
  for (const item of gd?.items ?? []) {
    if (item.stale) continue;
    const place = placeOf(item.title);
    if (!place) continue;
    collected.push({ ...item, country: place.name, coordinates: place.coords });
  }

  const items = dedupe(
    collected.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  ).slice(0, 300);

  if (!items.length) {
    const prev = await readPrevious(file);
    await writeJson(file, {
      fetchedAt: prev?.fetchedAt ?? null,
      failed: true,
      items: (prev?.items ?? []).map((i) => ({ ...i, stale: true })),
    });
    return;
  }

  console.log(
    `  world: ${fromFeeds} from feeds, ${collected.length - fromFeeds} from GDELT, ${items.length} after de-duplication`,
  );
  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    sourcesOk: items.length,
    sourcesTotal: items.length,
    items,
  });
}

// ---------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });

await buildFeedFile({ file: 'news.json', sources: CONFIG.news, cap: 120 });
await buildFeedFile({ file: 'osint.json', sources: CONFIG.osint, cap: 150 });
await buildMilitary();
await buildMarkets();
await buildBilateral();
await buildSnapshots();
await buildGdelt();
await buildWorld();

const ok = status.filter((s) => s.ok).length;
await writeJson('status.json', {
  fetchedAt: new Date().toISOString(),
  sourcesOk: ok,
  sourcesTotal: status.length,
  items: status.sort((a, b) => Number(a.ok) - Number(b.ok)),
});

console.log(`\n${ok}/${status.length} sources OK`);
for (const s of status.filter((s) => !s.ok)) console.log(`  FAILED  ${s.source}: ${s.error}`);
