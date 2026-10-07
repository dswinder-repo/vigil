/**
 * Outside watchlists: three lists, kept by people who track conflict and
 * unrest for a living, that tell Vigil which countries are hot without anyone
 * here having to keep up by hand.
 *
 *   Wikipedia, "List of ongoing armed conflicts": every armed conflict, grouped
 *     by deaths (10,000+, 1,000+, 100+, under 100). Edited several times a week.
 *     Licence CC BY-SA; we use only country + tier, with attribution.
 *   Crisis Group, CrisisWatch: each month's conflict risk alerts and the
 *     situations that got worse or better. Read through the site's RSS feed
 *     (the web pages sit behind a bot check). Copyright Crisis Group; used only
 *     as a list of country names, with a link back.
 *   Carnegie Endowment, Global Protest Tracker: mass protests it marks active.
 *     A public Google Sheet, updated about monthly. Used as a country list.
 *
 * Fetched at most once a day. If a source fails or returns something
 * implausible (an edit war blanking half the Wikipedia table), the last good
 * copy is kept.
 */

const WIKI_API =
  'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_ongoing_armed_conflicts&prop=wikitext|revid&format=json&formatversion=2';
const CRISISWATCH_RSS = 'https://www.crisisgroup.org/rss.xml';
const CARNEGIE_CSV =
  'https://docs.google.com/spreadsheets/d/1mEzzfbv40pYeb1_5an2hBdxfMuGRdq7V76rmuFvhHNY/export?format=csv';

const REFRESH_MS = 24 * 3_600_000;

const WIKI_TIER = { conflicts10000: 4, conflicts1000: 3, conflicts100: 2, conflicts1: 1 };

/** Names these sources use that our country list does not know as-is. */
const NAME_FIXES = {
  'democratic republic of the congo': 'COD',
  'republic of the congo': 'COG',
  'state of palestine': 'PSE',
  'west bank': 'PSE',
  'gaza strip': 'PSE',
  'israel-palestine': 'PSE',
  'sahrawi republic': 'ESH',
  'western sahara': 'ESH',
  'somaliland': 'SOM',
  'kosovo': 'UNK',
  'korean-peninsula': 'PRK',
  'nagorno-karabakh': 'AZE',
  'kashmir': 'IND',
  'myanmar': 'MMR',
  'burma': 'MMR',
  'turkey': 'TUR',
  'türkiye': 'TUR',
  'ivory coast': 'CIV',
  'cote divoire': 'CIV',
  'east timor': 'TLS',
  'russia': 'RUS',
  'syria': 'SYR',
  'iran': 'IRN',
  'united states': 'USA',
  'south korea': 'KOR',
  'north korea': 'PRK',
};

export async function refreshWatchlists({ get, previous, isoOf, log = console.log }) {
  const now = Date.now();
  const prev = previous ?? {};
  const fresh = (s) => s?.fetchedAt && now - new Date(s.fetchedAt).getTime() < REFRESH_MS;
  const resolve = (name) => {
    const k = String(name).toLowerCase().replace(/[’']/g, '').trim();
    return NAME_FIXES[k] ?? isoOf(k) ?? isoOf(k.replace(/-/g, ' '));
  };

  const out = { ...prev };

  if (!fresh(prev.wikipedia)) {
    try {
      const data = JSON.parse(await get(WIKI_API));
      const rows = parseWikiConflicts(data.parse.wikitext);
      const prevCount = prev.wikipedia?.rows?.length ?? 0;
      if (rows.length < 10 || (prevCount && rows.length < prevCount * 0.7)) {
        throw new Error(`implausible: ${rows.length} rows (had ${prevCount})`);
      }
      for (const r of rows) r.iso3s = [...new Set(r.countries.map(resolve).filter(Boolean))];
      out.wikipedia = { fetchedAt: new Date().toISOString(), revid: data.parse.revid, rows };
      log(`  watchlists: Wikipedia ${rows.length} conflicts`);
    } catch (err) {
      out.wikipedia = { ...prev.wikipedia, error: String(err.message || err).slice(0, 120) };
      log(`  watchlists: Wikipedia failed (${err.message}); keeping last good copy`);
    }
  }

  if (!fresh(prev.crisiswatch)) {
    try {
      const xml = await get(CRISISWATCH_RSS);
      const cw = parseCrisisWatch(xml);
      if (!cw) throw new Error('no CrisisWatch item in feed');
      for (const k of ['alerts', 'deteriorated', 'improved']) {
        cw[k] = cw[k].map((slug) => ({ slug, iso3: resolve(slug) })).filter((x) => x.iso3);
      }
      out.crisiswatch = { fetchedAt: new Date().toISOString(), parsedAt: new Date().toISOString(), ...cw };
      log(`  watchlists: CrisisWatch "${cw.title}"`);
    } catch (err) {
      // The monthly item drops off the 10-item feed after a while; keep it.
      out.crisiswatch = { ...prev.crisiswatch, fetchedAt: new Date().toISOString(), error: String(err.message || err).slice(0, 120) };
      log(`  watchlists: CrisisWatch not refreshed (${err.message}); keeping last good copy`);
    }
  }

  if (!fresh(prev.carnegie)) {
    try {
      const rows = parseCsv(await get(CARNEGIE_CSV));
      const head = rows[0].map((h) => h.trim().toLowerCase());
      const col = (name) => head.findIndex((h) => h.startsWith(name));
      const ci = col('country');
      const ai = col('active');
      const ni = col('protest name');
      if (ci < 0 || ai < 0) throw new Error('sheet columns changed');
      const active = rows
        .slice(1)
        .filter((r) => /x/i.test(r[ai] ?? ''))
        .map((r) => ({ country: r[ci], name: ni >= 0 ? r[ni] : '', iso3: resolve(r[ci]) }))
        .filter((r) => r.iso3);
      out.carnegie = { fetchedAt: new Date().toISOString(), active };
      log(`  watchlists: Carnegie ${active.length} active protests`);
    } catch (err) {
      out.carnegie = { ...prev.carnegie, error: String(err.message || err).slice(0, 120) };
      log(`  watchlists: Carnegie failed (${err.message}); keeping last good copy`);
    }
  }

  return out;
}

/** Per-country view of all three lists: what each source says about it. */
export function watchByCountry(w) {
  const by = new Map();
  const note = (iso, fn) => {
    const e = by.get(iso) ?? { iso3: iso, tier: 0, conflicts: [], crisiswatch: [], protests: [] };
    fn(e);
    by.set(iso, e);
  };
  for (const r of w?.wikipedia?.rows ?? []) {
    // A conflict listed across fourteen countries is mostly about the first
    // few, which the page lists first.
    for (const iso of r.iso3s.slice(0, 4)) {
      note(iso, (e) => {
        e.tier = Math.max(e.tier, r.tier);
        e.conflicts.push(r.name);
      });
    }
  }
  for (const k of ['alerts', 'deteriorated', 'improved']) {
    for (const x of w?.crisiswatch?.[k] ?? []) note(x.iso3, (e) => e.crisiswatch.push(k));
  }
  for (const p of w?.carnegie?.active ?? []) note(p.iso3, (e) => e.protests.push(p.name || 'active protests'));
  return by;
}

// ---------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------

export function parseWikiConflicts(wikitext) {
  const out = [];
  const clean = (s) => s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>|<!--[\s\S]*?-->/g, '');
  for (const [, id, body] of wikitext.matchAll(/\{\|[^\n]*id="(conflicts\d+)"([\s\S]*?)\n\|\}/g)) {
    const tier = WIKI_TIER[id];
    if (!tier) continue;
    for (const row of body.split(/\n\|-[^\n]*/).slice(1)) {
      const cells = [];
      let cur = null;
      for (const line of row.split('\n')) {
        if (/^\|(?![}\-])/.test(line)) {
          if (cur !== null) cells.push(cur);
          cur = line.slice(1);
        } else if (cur !== null) cur += '\n' + line;
      }
      if (cur !== null) cells.push(cur);
      if (cells.length < 5) continue;
      const [, conflict, , location, , d25, d26] = cells.map(clean);
      // In listed order. The page's italics do not mean one thing consistently
      // (Somalia is italic in its own row), so they are ignored.
      const countries = [...location.matchAll(/\{\{flag(?:country|icon)?\|([^}|]+)/g)].map((m) => m[1].trim());
      const first = conflict
        .split('\n')
        .map((l) => l.replace(/^\*+\s*/, ''))
        .find((l) => /\[\[/.test(l)) ?? '';
      const name = first
        .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const nts = (s) => +((s || '').match(/\{\{nts\|([\d,]+)\}\}/)?.[1] || '0').replace(/,/g, '');
      if (!countries.length || !name) continue;
      out.push({ tier, name, countries, deaths2025: nts(d25), deaths2026: nts(d26) });
    }
  }
  return out;
}

export function parseCrisisWatch(xml) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const it of items) {
    const link = it.match(/<link>([^<]+)<\/link>/i)?.[1] ?? '';
    if (!/\/crisiswatch\/[a-z]+-trends-and-[a-z]+-alerts-\d{4}/.test(link)) continue;
    const title = (it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? '').trim();
    const html = (it.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    const list = (heading) => {
      const at = html.search(new RegExp(`${heading}\\s*</h4>`, 'i'));
      if (at < 0) return [];
      const para = html.slice(at).match(/<p[\s\S]*?<\/p>/i)?.[0] ?? '';
      return [...para.matchAll(/data-entry-target="([^"]+)"/g)].map((m) => m[1]);
    };
    return {
      title,
      link,
      alerts: list('Conflict Risk Alerts'),
      deteriorated: list('Deteriorated Situations'),
      improved: list('Improved Situations'),
    };
  }
  return null;
}

/** Small RFC 4180 CSV parser: quoted fields, doubled quotes, newlines in quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
