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
import {
  loadGeo, locate, spread, classify, severityOf, isoOf,
  trackHotspots, prepareCurated, keywordIndex, newsSearchUrl,
} from './world.mjs';
import { refreshWatchlists, watchByCountry } from './watchlists.mjs';

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
    // "2026-10-07T09:46:31-0400" (no colon in the offset) is not valid to
    // Date; some feeds stamp items hours in the future. Fix both.
    const ts = published ? new Date(published.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null;
    if (ts && ts.getTime() > Date.now()) ts.setTime(Date.now());

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
  /^(how|why|what|who|when|where|is|are|can|could|should|would|will|does|do|did|has|have)\b.*\?\s*$/i,
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
async function buildFeedFile({ file, sources, cap = 150, retries = 3 }) {
  const results = await pool(sources, async (s) => {
    try {
      const xml = await get(s.url, { retries });
      let items = parseFeed(xml, s.name || s.account);
      if (s.hint) items = items.map((i) => ({ ...i, hint: s.hint }));
      // A news search with nothing in the last two days is an answer, not a fault.
      if (!items.length && !s.hint && !s.search) throw new Error('no items parsed');
      // Topic searches pull in sport and entertainment that happens to use the
      // same words — an offensive line is not an offensive.
      if (s.url.includes('news.google.com')) {
        // A site:-scoped search already knows its publisher; a topic search does not.
        const keepSource = s.url.includes('site%3A') || s.url.includes('site:');
        items = items.map((i) => cleanGoogleTitle(i, { keepSource }));
      }
      // After the publisher is known: on a Google News search it only appears
      // once the " - Publisher" tail is read off the headline.
      items = items.filter(
        (i) => !WORLD_NOISE.some((re) => re.test(i.title)) && !NOISE_PUBLISHERS.test(i.source ?? ''),
      );
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
// world — conflict, unrest and political events, placed on the map
// ---------------------------------------------------------------------------

/**
 * Built from every headline the job already collected (news, osint, military),
 * the hotspot searches below, and GDELT when it answers. See world.mjs for how
 * a headline is placed, sorted and counted towards a hotspot.
 *
 * The map shows the last 48 hours, not the last run: stories from earlier runs
 * are carried forward until they are two days old, so a quiet hour does not
 * empty a war zone.
 */

const WORLD_WINDOW_MS = 48 * 3_600_000;
const WORLD_CAP = 1200;
const WORLD_PER_COUNTRY = 90;

async function buildWorld(ctx) {
  const file = 'world.json';
  const { geo, active, hotIso, hotspotOfText, byId } = ctx;
  const now = Date.now();
  const collected = [];
  const stats = { seen: 0, noPlace: 0, noCategory: 0 };

  const consider = (item) => {
    if (!item?.title || WORLD_NOISE.some((re) => re.test(item.title))) return;
    stats.seen++;
    const ts = new Date(item.timestamp).getTime();
    if (!Number.isFinite(ts) || now - ts > WORLD_WINDOW_MS) return;

    const hinted = item.hint ? byId.get(item.hint) : null;
    let place = locate(geo, item.title, item.summary ?? '', hotIso);
    // A headline found by a hotspot's own search that names no place, or only
    // where it was announced, belongs to that hotspot.
    if (hinted && (!place || place.precision === 'venue')) {
      const iso3 = hinted.iso3s[0];
      place = { name: hinted.name, coords: geo.byIso.get(iso3)?.center, iso3, precision: 'country' };
    }
    if (!place?.coords) {
      stats.noPlace++;
      return;
    }

    const hotspot =
      (place.iso3 && active.find((h) => h.iso3s.includes(place.iso3))) || hotspotOfText(item.title) || hinted || null;
    const category = classify(item.title, hotspot);
    if (!category) {
      stats.noCategory++;
      return;
    }

    collected.push({
      title: item.title,
      url: item.url,
      domain: item.source ?? item.domain ?? '',
      country: place.iso3 ? geo.byIso.get(place.iso3)?.name ?? place.name : place.name,
      place: place.name,
      iso3: place.iso3 ?? null,
      precision: place.precision,
      // Send the coordinates, not just the name: the browser cannot resolve
      // place names on its own.
      coordinates: spread(geo, place, item.url || item.title),
      timestamp: item.timestamp,
      category,
      severity: severityOf(item.title, hotspot),
      hotspot: hotspot?.id ?? null,
    });
  };

  for (const src of ['news.json', 'osint.json', 'military.json', 'regional.json', 'signals.json']) {
    const f = await readPrevious(src);
    for (const item of f?.items ?? []) consider(item);
  }
  const fresh = collected.length;

  const gd = await readPrevious('gdelt.json');
  for (const item of gd?.items ?? []) if (!item.stale) consider({ ...item, summary: '' });

  // Carry forward the last 48 hours from earlier runs.
  const prev = await readPrevious(file);
  for (const item of prev?.items ?? []) {
    if (now - new Date(item.timestamp).getTime() <= WORLD_WINDOW_MS && item.iso3 !== undefined) {
      collected.push({ ...item, stale: undefined });
    }
  }

  // Newest first, one row per story, and no single country taking more than
  // its share: a war that fills every feed should not push the rest of the
  // world off the map.
  const perCountry = new Map();
  const items = dedupe(
    collected.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  )
    .filter((i) => {
      const k = i.iso3 ?? i.place;
      const n = (perCountry.get(k) ?? 0) + 1;
      perCountry.set(k, n);
      return n <= WORLD_PER_COUNTRY;
    })
    .slice(0, WORLD_CAP);

  if (!items.length) {
    await writeJson(file, {
      fetchedAt: prev?.fetchedAt ?? null,
      failed: true,
      items: (prev?.items ?? []).map((i) => ({ ...i, stale: true })),
    });
    return prev?.items ?? [];
  }

  console.log(
    `  world: ${stats.seen} headlines, ${fresh} placed this run (${stats.noPlace} no place, ${stats.noCategory} not an event), ${items.length} on the map`,
  );
  await writeJson(file, {
    fetchedAt: new Date().toISOString(),
    sourcesOk: items.length,
    sourcesTotal: items.length,
    items,
  });
  return items;
}

// ---------------------------------------------------------------------------
// hotspots — the curated list plus whatever is surging, and their searches
// ---------------------------------------------------------------------------

const HOTSPOTS = JSON.parse(await readFile(path.join(HERE, 'hotspots.json'), 'utf8'));
const MAX_SEARCHES = 160;
const REVIEW_STALE_DAYS = 45;

async function hotspotContext() {
  const geo = loadGeo(HERE, HOTSPOTS.hotspots);
  const curatedOnly = prepareCurated(geo, HOTSPOTS.hotspots);
  const watch = await refreshWatchlists({
    get: (u) => get(u, { retries: 1, timeoutMs: 30_000 }),
    previous: await readPrevious('watchlists.json'),
    isoOf: (n) => isoOf(geo.nameToIso, n),
  });
  await writeFile(path.join(OUT, 'watchlists.json'), JSON.stringify(watch));
  const curated = [...curatedOnly, ...watchHotspots(geo, curatedOnly, watchByCountry(watch))];
  const previous = await readPrevious('hotspots.json');
  const auto = prepareCurated(
    geo,
    (previous?.items ?? []).filter((h) => h.auto).map((h) => ({
      ...h,
      searches: [`${h.name} protest`, `${h.name} attack`, `${h.name} crisis`],
    })),
  );
  const active = [...curated, ...auto].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));
  const hotIso = new Map();
  for (const h of active) for (const iso of h.iso3s) hotIso.set(iso, Math.max(hotIso.get(iso) ?? 0, h.intensity ?? 2));
  return {
    geo,
    watch,
    curated,
    previous,
    active,
    hotIso,
    byId: new Map(active.map((h) => [h.id, h])),
    hotspotOfText: keywordIndex(active),
  };
}

/**
 * Countries the outside watchlists name that the curated list does not cover
 * become hotspots of their own, and leave again when the lists drop them.
 * Curated hotspots are annotated with what the lists say about them.
 */
function watchHotspots(geo, curated, byCountry) {
  const covered = new Set(curated.flatMap((h) => h.iso3s));
  for (const h of curated) {
    const flags = h.iso3s.map((i) => byCountry.get(i)).filter(Boolean);
    h.signals = summariseSignals(flags);
  }
  const out = [];
  for (const [iso, w] of byCountry) {
    if (covered.has(iso)) continue;
    const c = geo.byIso.get(iso);
    if (!c) continue;
    const alert = w.crisiswatch.includes('alerts') || w.crisiswatch.includes('deteriorated');
    let intensity = w.tier;
    let kind = w.tier >= 3 ? 'war' : w.tier === 2 ? 'insurgency' : 'flashpoint';
    if (alert) intensity = Math.max(3, Math.min(5, intensity + 1));
    if (!intensity && w.protests.length) {
      intensity = 2;
      kind = 'unrest';
    }
    if (!intensity) continue;
    out.push({
      id: `watch-${iso.toLowerCase()}`,
      name: c.name,
      kind,
      intensity,
      countries: [iso],
      iso3s: [iso],
      summary: summariseSignals([w]),
      signals: summariseSignals([w]),
      source: 'watchlist',
      searches: intensity >= 2 ? [`${c.name} ${kind === 'unrest' ? 'protest' : 'attack'}`, `${c.name} clashes`] : [],
    });
  }
  return out;
}

function summariseSignals(flags) {
  const parts = [];
  const conflicts = [...new Set(flags.flatMap((f) => f.conflicts))];
  const tier = Math.max(0, ...flags.map((f) => f.tier));
  if (conflicts.length) {
    const deaths = { 4: '10,000+', 3: '1,000+', 2: '100+', 1: 'under 100' }[tier];
    parts.push(`Wikipedia: ${conflicts.slice(0, 2).join('; ')} (${deaths} deaths)`);
  }
  const cw = [...new Set(flags.flatMap((f) => f.crisiswatch))];
  if (cw.length) {
    const words = { alerts: 'conflict risk alert', deteriorated: 'deteriorated', improved: 'improved' };
    parts.push(`CrisisWatch: ${cw.map((k) => words[k]).join(', ')}`);
  }
  const protests = [...new Set(flags.flatMap((f) => f.protests))];
  if (protests.length) parts.push(`Carnegie: ${protests.slice(0, 2).join('; ')}`);
  return parts.join(' · ');
}

/** One Google News search per hotspot query, plus the wide discovery queries. */
function searchSources(active) {
  const out = [];
  const seen = new Set();
  const push = (q, hint) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: `search: ${q}`, url: newsSearchUrl(q), hint, search: true });
  };
  // Hottest first, so the cap trims the quiet end.
  for (const h of [...active].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))) {
    for (const q of h.searches ?? []) push(q, h.id);
  }
  for (const q of HOTSPOTS.discovery ?? []) push(q, null);
  return out.slice(0, MAX_SEARCHES);
}

async function buildHotspots(ctx, worldItems) {
  const history = (await readPrevious('hotspot-history.json')) ?? { days: {} };
  const { hotspots, history: nextHistory } = trackHotspots({
    geo: ctx.geo,
    curated: ctx.curated,
    previous: ctx.previous,
    history,
    items: worldItems,
  });

  for (const h of hotspots) {
    if (h.auto || h.status === 'covered') continue;
    if (h.intensity >= 3) {
      status.push({
        source: `coverage: ${h.name}`,
        group: 'coverage',
        ok: false,
        error: `${h.status}: ${h.pins48h} events in 48h`,
      });
    }
  }
  // CrisisWatch's feed is sometimes refused to GitHub's servers; the last good
  // copy is kept, and this says so once it is more than a month old.
  const cw = ctx.watch?.crisiswatch;
  const cwAge = cw?.parsedAt ? (Date.now() - new Date(cw.parsedAt).getTime()) / 86_400_000 : Infinity;
  if (cwAge > 40) {
    status.push({
      source: 'coverage: CrisisWatch watchlist',
      group: 'coverage',
      ok: false,
      error: cw?.parsedAt ? `last read ${cw.parsedAt.slice(0, 10)}${cw.error ? ` (${cw.error})` : ''}` : `never read${cw?.error ? ` (${cw.error})` : ''}`,
    });
  }
  const reviewedAge = (Date.now() - new Date(HOTSPOTS.reviewed).getTime()) / 86_400_000;
  if (!(reviewedAge <= REVIEW_STALE_DAYS)) {
    status.push({
      source: 'coverage: curated hotspot list',
      group: 'coverage',
      ok: false,
      error: `last reviewed ${HOTSPOTS.reviewed}; due for review`,
    });
  }

  await writeFile(path.join(OUT, 'hotspot-history.json'), JSON.stringify(nextHistory));
  await writeJson('hotspots.json', {
    fetchedAt: new Date().toISOString(),
    reviewed: HOTSPOTS.reviewed,
    items: hotspots,
  });
  const auto = hotspots.filter((h) => h.auto).map((h) => h.name);
  const thin = hotspots.filter((h) => h.status !== 'covered' && !h.auto).map((h) => `${h.name} (${h.pins48h})`);
  console.log(`  hotspots: ${hotspots.length} tracked; automatic: ${auto.join(', ') || 'none'}`);
  if (thin.length) console.log(`  thin coverage: ${thin.join(', ')}`);
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
await buildFeedFile({ file: 'regional.json', sources: CONFIG.regional ?? [], cap: 600 });
const ctx = await hotspotContext();
await buildFeedFile({ file: 'signals.json', sources: searchSources(ctx.active), cap: 900, retries: 1 });
const worldItems = await buildWorld(ctx);
await buildHotspots(ctx, worldItems);

const ok = status.filter((s) => s.ok).length;
await writeJson('status.json', {
  fetchedAt: new Date().toISOString(),
  sourcesOk: ok,
  sourcesTotal: status.length,
  items: status.sort((a, b) => Number(a.ok) - Number(b.ok)),
});

console.log(`\n${ok}/${status.length} sources OK`);
for (const s of status.filter((s) => !s.ok)) console.log(`  FAILED  ${s.source}: ${s.error}`);
