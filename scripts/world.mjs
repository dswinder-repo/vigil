/**
 * World events: where a headline happened, what kind of event it is, and
 * which parts of the world are hot right now.
 *
 * Three jobs, used by fetch-feeds.mjs:
 *
 * 1. locate()   — place a headline on the map. Every country in the world is
 *    known by its name, its demonym ("Iranian") and its capital, plus a list of
 *    cities, regions and chokepoints. When a headline names several places,
 *    the one the story is about wins, not the one where it was announced
 *    ("Pentagon identifies troops killed in Kuwait amid Iran war" is Kuwait or
 *    Iran, never Washington).
 *
 * 2. classify() — sort a headline into conflict, unrest, political and so on.
 *    Headlines about an active hotspot are kept even when their wording misses
 *    the vocabulary: "US sends third aircraft carrier towards Iran" is war news.
 *
 * 3. trackHotspots() — keep the hotspot list current. The curated list in
 *    hotspots.json is the starting point. On top of it, every run counts
 *    events per country over 30 days; a country whose last two days run well
 *    above its own normal is added automatically, gets its own news searches
 *    on the next run, and drops off again once it goes quiet. Every hotspot's
 *    pin count is checked, so thin coverage is reported instead of hidden.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Gazetteer
// ---------------------------------------------------------------------------

const KIND_WEIGHT = { city: 3, region: 2.5, country: 2, venue: 0.3 };
const KIND_RANK = { city: 4, region: 3, country: 2, venue: 1 };

/** Read the country list, city list and hotspots into one name index. */
export function loadGeo(dir, hotspots = []) {
  const { countries } = JSON.parse(readFileSync(path.join(dir, 'geo', 'countries.json'), 'utf8'));
  const places = JSON.parse(readFileSync(path.join(dir, 'geo', 'places.json'), 'utf8'));

  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const nameToIso = new Map();
  for (const c of countries) {
    nameToIso.set(c.name.toLowerCase(), c.iso3);
    for (const a of c.aliases) nameToIso.set(a, c.iso3);
  }

  const entries = new Map();
  const add = (name, coords, iso3, kind) => {
    const key = name.toLowerCase().trim();
    if (!key || !Array.isArray(coords)) return;
    const prev = entries.get(key);
    // A city beats a country alias of the same spelling, never the reverse.
    if (prev && KIND_RANK[prev.kind] >= KIND_RANK[kind]) return;
    entries.set(key, { name: key, coords, iso3: iso3 ?? null, kind });
  };

  for (const c of countries) for (const a of c.aliases) add(a, c.center, c.iso3, 'country');
  for (const [iso3, list] of Object.entries(places.cities)) {
    for (const [name, coords] of list) add(name, coords, iso3, 'city');
  }
  for (const [name, coords] of places.regions) add(name, coords, null, 'region');
  for (const [name, coords] of places.venues) add(name, coords, null, 'venue');
  for (const h of hotspots) {
    for (const p of h.places ?? []) {
      const [name, coords, iso] = p;
      add(name, coords, iso ?? isoOf(nameToIso, h.countries?.[0]), 'city');
    }
  }

  const names = [...entries.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  return { byIso, nameToIso, entries, regex };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isoOf(nameToIso, name) {
  if (!name) return null;
  if (/^[A-Z]{3}$/.test(name)) return name;
  return nameToIso.get(String(name).toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// locate
// ---------------------------------------------------------------------------

/**
 * Find the place a headline is about.
 *
 * Every place named in the title scores; the summary counts at half weight.
 * Specific beats general (a city over a country, a country over a venue such
 * as "Pentagon" or "Geneva"), "X war" and "in X" lean towards X, and a
 * country that is an active hotspot gets a nudge. Scores add up per country,
 * so "Tehran" and "Iranian" in one headline reinforce each other.
 */
export function locate(geo, title, summary = '', hotIso = new Map()) {
  const groups = new Map();
  score(geo, title, 1, groups, hotIso);
  if (summary) score(geo, summary, 0.5, groups, hotIso);
  if (!groups.size) return null;

  let best = null;
  for (const g of groups.values()) {
    if (!best || g.total > best.total) best = g;
  }
  const e = best.top;
  return { name: e.name, coords: e.coords, iso3: e.iso3, precision: e.kind };
}

function score(geo, text, factor, groups, hotIso) {
  const t = String(text);
  let first = true;
  for (const m of t.matchAll(geo.regex)) {
    const entry = geo.entries.get(m[1].toLowerCase());
    if (!entry) continue;
    let w = KIND_WEIGHT[entry.kind];
    const after = t.slice(m.index + m[1].length, m.index + m[1].length + 24);
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    if (/^['’]?s?\s*(war|conflict|front|offensive|border|coast|strikes?)\b/i.test(after)) w += 3;
    if (/\b(in|across|near|into|inside|over|on|at|from)\s+(the\s+)?$/i.test(before)) w += 1;
    if (entry.iso3 && hotIso.has(entry.iso3)) w += 0.4 * hotIso.get(entry.iso3);
    if (first) w += 0.3;
    first = false;
    w *= factor;

    const key = entry.iso3 ?? entry.name;
    const g = groups.get(key) ?? { total: 0, top: null };
    g.total += w;
    if (!g.top || KIND_RANK[entry.kind] > KIND_RANK[g.top.kind]) g.top = entry;
    groups.set(key, g);
  }
}

// ---------------------------------------------------------------------------
// spread
// ---------------------------------------------------------------------------

/**
 * Ten stories about Iran used to sit on one identical point and read as one
 * dot. Each story now gets its own spot near the place it names: within a few
 * kilometres for a city, across a fair part of the country for a country. The
 * offset comes from the story's URL, so a story does not jump between runs.
 */
export function spread(geo, place, key) {
  const [lon, lat] = place.coords;
  let radius;
  if (place.precision === 'city') radius = 0.12;
  else if (place.precision === 'region') radius = 0.6;
  else if (place.precision === 'venue') radius = 0.05;
  else {
    const area = geo.byIso.get(place.iso3)?.area ?? 100_000;
    radius = Math.min(2, Math.max(0.15, Math.sqrt(area) / 111 / 4));
  }
  const h = hash(key);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff) * radius;
  const out = [lon + r * Math.cos(angle), Math.max(-85, Math.min(85, lat + r * Math.sin(angle)))];
  return out.map((n) => Math.round(n * 1000) / 1000);
}

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

/**
 * Order matters: the first match wins. Disasters come before conflict so
 * "floods kill 20" is a disaster; unrest comes before conflict so "police
 * kill protesters" is unrest.
 */
const CATEGORIES = [
  ['cyber', /\b(cyber ?attacks?|ransomware|malware|hackers?|hacking|phishing|spyware|DDoS|botnet|data breach|zero-day)\b/i],
  ['disease', /\b(outbreak|epidemic|pandemic|cholera|ebola|mpox|marburg|dengue|measles|tuberculosis|influenza|bird flu|polio)\b/i],
  ['disaster', /\b(earthquakes?|tsunami|hurricanes?|(?:tropical |winter )?storms?|tropical depression|floods?|flooding|wildfires?|eruption|tornado(es)?|cyclones?|typhoons?|landslides?|mudslides?|heatwave|drought|blizzard|extreme weather)\b/i],
  ['humanitarian', /\b(famine|starvation|starving|displac\w*|refugees?|genocide|atrocit\w*|malnutrition|aid convoy|civilian casualties|war crimes|humanitarian|ethnic cleansing|massacre)\b/i],
  ['unrest', /\b(riots?|rioters?|rioting|coup|uprising|crackdown|insurrection|looting|mutiny|junta|martial law|state of emergency|curfew|protests?|protesters?|protestors?|demonstrat(ors?|ions?)|tear gas|rubber bullets|water cannon|general strike|nationwide strike|strikers|walkout|unrest|clashes? with police|police (?:fire|shoot|kill|clash)\w*|(?:arrests?|detains?|detained|jail(?:s|ed)?) (?:of )?(?:dozens|hundreds|protesters|activists|opposition|journalists|critics)|opposition leader|disputed election|election (?:violence|fraud|dispute|protests?)|vote rigging|lynch\w*|mob)\b/i],
  ['conflict', /\b(wars?|wartime|warfare|air ?strikes?|strikes? on|struck|shelling|shelled|bombard\w*|bomb(?:s|ing|ings|ed)?|counteroffensive|invasion|invad\w*|ceasefire|truce|artillery|drones?|missiles?|rockets?|mortars?|ballistic|intercept\w*|shot down|warships?|aircraft carriers?|carrier strike group|destroyers?|submarines?|torpedo\w*|sinks?|sank|navy|naval|troops?|soldiers?|army|military|militar\w*|marines|warhead|militants?|militias?|insurgen\w*|jihadis\w*|rebels?|gunmen|fighters|ambush\w*|raids?|attacks?|attacked|assault|retaliat\w*|escalat\w*|hostages?|kidnap\w*|abduct\w*|killed|kills|kill|killing|strikes|dead|wounded|injur\w*|gunfire|shooting|shot|explosions?|blasts?|IED|suicide bomb\w*|fighting|offensive|front ?line|occupied|annex\w*|incursion|skirmish\w*|firefight|casualties|death toll|clashes?)\b/i],
  ['political', /\b(sanctions?|impeach\w*|assassinat\w*|referendum|peace (?:treaty|talks|deal|plan)|talks|negotiat\w*|envoy|delegation|diplomat\w*|embargo|trade war|tariffs?|export controls|arms deal|expel\w*|ambassador|severs? ties|security council|nuclear (?:deal|program|programme|talks)|enrichment|government collapse|no-confidence|snap election|martial)\b/i],
];

/** Hotspot kind → the category its otherwise-unmatched headlines take. */
const KIND_CATEGORY = {
  war: 'conflict',
  insurgency: 'conflict',
  flashpoint: 'conflict',
  unrest: 'unrest',
  'political-crisis': 'political',
  humanitarian: 'humanitarian',
};

/**
 * Defence-industry business news reads like war ("Navy warship sensor deal
 * could reach $1.7B") but is not an event anywhere. Dropped unless something
 * actually happened to someone.
 */
const DEFENCE_BUSINESS =
  /\b(contracts?|deal could|awarded|awards|invest(?:s|ment|ing)?|procure\w*|acquisition|commission(?:s|ed|ing)|fielding|prototype|unveils?|budget|\$\d|billion|industrial base|supplier|manufactur\w*|production line|program to|programme to|selects?|delivers?|deliveries|orders? (?:more|new|additional))\b/i;
const HAPPENED = /\b(killed|kills|dead|attack\w*|struck|strikes? on|clash\w*|fighting|wounded|injured|shot down|sank|seized)\b/i;

const WAR_KINDS = new Set(['war', 'insurgency', 'flashpoint', 'humanitarian']);

/**
 * `viaSearch`: the headline came back from this hotspot's own news search, so
 * it is about the hotspot even when its wording does not say what happened.
 */
export function classify(title, hotspot = null, { viaSearch = false } = {}) {
  // Anniversaries, memorials and "on this day" pieces look back; they are not
  // events happening now and stay off the map.
  if (RETROSPECTIVE.test(title)) return null;
  let cat = null;
  for (const [c, re] of CATEGORIES) {
    if (re.test(title)) {
      cat = c;
      break;
    }
  }
  if (cat === 'conflict' && DEFENCE_BUSINESS.test(title) && !HAPPENED.test(title)) return null;
  if (cat) return cat;
  // A headline whose wording says nothing is kept only when the place vouches
  // for it: in a country at war almost every story is war news. A country
  // with a protest movement or an insurgency in one province also has prison
  // openings and exam dates, so there it takes the hotspot's own search.
  if (!hotspot) return null;
  if (hotspot.intensity >= 4 && WAR_KINDS.has(hotspot.kind)) return KIND_CATEGORY[hotspot.kind];
  if (viaSearch && hotspot.intensity >= 3) return KIND_CATEGORY[hotspot.kind] ?? 'political';
  return null;
}

/** Looking back, not happening now: "UN event marking three years since the massacre". */
const RETROSPECTIVE =
  /\b(anniversary|years since|years after|years on|years ago|marks? (?:\w+ )?years|memorial|commemorat\w*|remembrance|remembering|tribute|in memory|vigil for|on this day|this day in history|history of)\b/i;

/** "kills 18", "18 killed", "death toll rises to 40", "dozens killed". */
function casualties(title) {
  const t = title.replace(/,(\d{3})/g, '$1');
  const n =
    t.match(/\b(\d+)\s+(?:\w+\s+){0,3}(?:killed|dead|deaths|died|slain|massacred)\b/i)?.[1] ??
    t.match(/\b(?:kills?|killing|killed|death toll (?:rises to|reaches|of|at)|at least)\s+(?:at least\s+)?(\d+)\b/i)?.[1];
  if (n) return Number(n);
  if (/\b(dozens|scores|hundreds|thousands)\s+(?:of\s+\w+\s+)?(?:killed|dead)\b/i.test(t)) return 30;
  return 0;
}

export function severityOf(title, hotspot = null) {
  const t = title.toLowerCase();
  if (RETROSPECTIVE.test(title)) return 1;
  let s = 2;
  if (/massacre|nuclear (test|strike|attack)|invasion|coup|mass casualt|famine/.test(t)) s = 5;
  else if (/air ?strike|bombard|offensive|killed|kills|dead|missile|torpedo|sinks|atrocit|shot dead|war\b/.test(t)) s = 4;
  else if (/clash|attack|strike|sanction|crackdown|outbreak|ransomware|militant|riot|protest|curfew|emergency/.test(t)) s = 3;
  const dead = casualties(title);
  if (dead >= 10) s = 5;
  else if (dead >= 3) s = Math.max(s, 4);
  if (hotspot?.intensity >= 4) s = Math.max(s, 3);
  return s;
}

/** Seats of government that stand for their country when naming who is involved. */
const VENUE_COUNTRY = { pentagon: 'USA', 'white house': 'USA', washington: 'USA', kremlin: 'RUS' };

/**
 * Every country a text names. By default: names, demonyms, capitals, cities,
 * seats of government, and "US" in capitals (lower-case "us" is a pronoun,
 * so it is not in the gazetteer). `countriesOnly` counts country names and
 * demonyms alone, so "Florida" or "Chattanooga" is not a country mention.
 */
export function countriesIn(geo, text, { countriesOnly = false } = {}) {
  const t = String(text);
  const out = new Set();
  for (const m of t.matchAll(geo.regex)) {
    const key = m[1].toLowerCase();
    const e = geo.entries.get(key);
    if (!e) continue;
    if (countriesOnly && e.kind !== 'country') continue;
    if (e.iso3) out.add(e.iso3);
    else if (!countriesOnly && VENUE_COUNTRY[key]) out.add(VENUE_COUNTRY[key]);
  }
  if (/\bU\.?S\.?(?![a-z])/.test(t)) out.add('USA');
  return out;
}

// ---------------------------------------------------------------------------
// global tension index
// ---------------------------------------------------------------------------

/**
 * One number for "how dangerous is the world right now", 0-100.
 *
 * It used to average the most alarming headlines, so any day with a dozen
 * war reports scored 100 ("DEFCON 1"), and adding news sources raised it.
 * It now rates situations, not headlines: each country's most serious active
 * hotspot counts once, weighted steeply by intensity (one major war counts
 * for fifteen simmering disputes), more when a nuclear-armed state is a
 * direct party to a war. A saturating curve turns the total into 0-100.
 *
 * Calibration (K = 100): a calm world (one major war, a handful of serious
 * conflicts) reads about 30, GUARDED; a typical recent year such as 2019
 * about 53, ELEVATED; October 2026 about 66-70, HIGH. SEVERE (80+) is
 * reserved for direct war between nuclear-armed states or nuclear use, which
 * only a curated hotspot flag (`nuclearPowersInDirectConflict`) can signal;
 * without it the score stops at 79.
 */
const INTENSITY_WEIGHT = { 5: 6, 4: 3, 3: 1.2, 2: 0.4, 1: 0.1 };
const NUCLEAR_STATES = new Set(['USA', 'RUS', 'CHN', 'GBR', 'FRA', 'IND', 'PAK', 'ISR', 'PRK']);
const TENSION_K = 100;

export const TENSION_BANDS = [
  [80, 'SEVERE'],
  [60, 'HIGH'],
  [40, 'ELEVATED'],
  [20, 'GUARDED'],
  [0, 'LOW'],
];

export function tensionIndex({ hotspots, curated, history, now = Date.now() }) {
  const byId = new Map(curated.map((h) => [h.id, h]));
  const perCountry = new Map();
  let nuclearWar = false;
  for (const h of hotspots) {
    const src = byId.get(h.id);
    const involved = new Set([...(h.countries ?? []), ...((src?.involvedIso3s) ?? [])]);
    const major = ['war', 'insurgency'].includes(h.kind) && h.intensity >= 4 &&
      [...involved].some((c) => NUCLEAR_STATES.has(c));
    if (src?.nuclearPowersInDirectConflict) nuclearWar = true;
    let w = (INTENSITY_WEIGHT[h.intensity] ?? 0) * (major ? 1.5 : 1);
    // A country listed only because an outside list names it in a regional
    // conflict counts half: Belize is on Wikipedia's Mexican drug war row.
    if (h.source === 'watchlist') w *= 0.5;
    const key = h.countries?.[0] ?? h.id;
    const prev = perCountry.get(key);
    if (!prev || w > prev.w) perCountry.set(key, { w, h });
  }
  const total = [...perCountry.values()].reduce((s, x) => s + x.w, 0);
  let score = Math.round(100 * (1 - Math.exp(-total / TENSION_K)));
  if (!nuclearWar) score = Math.min(79, score);
  const level = TENSION_BANDS.find(([min]) => score >= min)[1];

  // Trend from the event history: the last two days against the month.
  const days = Object.entries(history?.days ?? {});
  let trend = 'new';
  if (days.length >= 7) {
    const today = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
    let recent = 0, base = 0, baseDays = 0;
    for (const [d, bucket] of days) {
      const n = Object.values(bucket).reduce((s, l) => s + l.length, 0);
      if (d === today || d === yesterday) recent += n;
      else { base += n; baseDays++; }
    }
    const r = recent / 2, b = base / Math.max(1, baseDays);
    trend = r > b * 1.25 ? 'rising' : r < b * 0.8 ? 'falling' : 'steady';
  }

  const contributors = [...perCountry.values()]
    .sort((a, b) => b.w - a.w)
    .slice(0, 8)
    .map(({ h }) => ({ id: h.id, name: h.name, intensity: h.intensity }));

  return { score, level, trend, situations: perCountry.size, contributors };
}

// ---------------------------------------------------------------------------
// hotspots
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const HISTORY_DAYS = 30;
const TRACKED = new Set(['conflict', 'unrest', 'political', 'humanitarian']);

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Update the 30-day per-country history with this run's world events and
 * decide which hotspots are live.
 *
 * history: { days: { 'YYYY-MM-DD': { ISO3: ['story-hash', ...] } } }
 * Stories are stored by hash so the same story seen on ten runs counts once.
 */
export function trackHotspots({ geo, curated, previous, history, items, now = Date.now() }) {
  const days = history?.days ?? {};

  for (const it of items) {
    if (!it.iso3 || !TRACKED.has(it.category)) continue;
    const ts = new Date(it.timestamp).getTime();
    if (!Number.isFinite(ts) || now - ts > HISTORY_DAYS * DAY || ts - now > DAY) continue;
    const d = dayKey(ts);
    const id = hash(it.url || it.title).toString(36);
    const bucket = (days[d] ??= {});
    const list = (bucket[it.iso3] ??= []);
    if (!list.includes(id)) list.push(id);
  }
  for (const d of Object.keys(days)) {
    if (now - new Date(`${d}T00:00:00Z`).getTime() > (HISTORY_DAYS + 1) * DAY) delete days[d];
  }

  // Per-country daily rates: the last two days against the 28 before them.
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY);
  const daysOfData = Object.keys(days).length;
  const rates = new Map();
  const bump = (iso, field, n) => {
    const r = rates.get(iso) ?? { recent: 0, base: 0, week: 0 };
    r[field] += n;
    rates.set(iso, r);
  };
  for (const [d, bucket] of Object.entries(days)) {
    const age = (new Date(`${today}T00:00:00Z`) - new Date(`${d}T00:00:00Z`)) / DAY;
    for (const [iso, list] of Object.entries(bucket)) {
      if (d === today || d === yesterday) bump(iso, 'recent', list.length);
      else bump(iso, 'base', list.length);
      if (age < 7) bump(iso, 'week', list.length);
    }
  }
  const baseDays = Math.max(1, Math.min(28, daysOfData - 2));
  const rate = (iso) => {
    const r = rates.get(iso) ?? { recent: 0, base: 0, week: 0 };
    return { daily: r.recent / 2, baseline: r.base / baseDays, week: r.week };
  };

  // Curated hotspots are always on. Automatic ones are added on a surge and
  // kept while the country stays busy.
  const curatedIso = new Set(curated.flatMap((h) => h.iso3s));
  const prevAuto = new Map((previous?.items ?? []).filter((h) => h.auto).map((h) => [h.countries[0], h]));
  const auto = [];
  for (const [iso] of rates) {
    if (curatedIso.has(iso)) continue;
    const { daily, baseline, week } = rate(iso);
    const established = daysOfData >= 5;
    const surging = established ? daily >= 3 && daily >= 3 * (baseline + 0.5) : daily >= 8;
    const kept = prevAuto.has(iso) && week >= 3;
    if (!surging && !kept) continue;
    const c = geo.byIso.get(iso);
    if (!c) continue;
    auto.push({
      id: `auto-${iso.toLowerCase()}`,
      name: c.name,
      kind: dominantKind(items, iso),
      intensity: daily >= 10 ? 4 : daily >= 5 ? 3 : 2,
      countries: [iso],
      iso3s: [iso],
      summary: `Added automatically: ${daily.toFixed(1)} events a day, against a usual ${baseline.toFixed(1)}.`,
      searches: [`${c.name} protest`, `${c.name} attack`, `${c.name} crisis`],
      auto: true,
      since: prevAuto.get(iso)?.since ?? new Date(now).toISOString(),
    });
  }

  const recentCut = now - 2 * DAY;
  const pinsFor = (isos) =>
    items.filter((i) => i.iso3 && isos.includes(i.iso3) && new Date(i.timestamp).getTime() >= recentCut).length;

  const out = [...curated, ...auto].map((h) => {
    const pins = pinsFor(h.iso3s);
    const r = h.iso3s.map(rate).reduce(
      (a, b) => ({ daily: a.daily + b.daily, baseline: a.baseline + b.baseline }),
      { daily: 0, baseline: 0 },
    );
    const trend =
      daysOfData < 5 ? 'new' : r.daily > r.baseline * 1.5 + 1 ? 'rising' : r.daily < r.baseline * 0.5 ? 'falling' : 'steady';
    const want = h.intensity >= 4 ? 5 : h.intensity >= 3 ? 3 : 1;
    const c0 = geo.byIso.get(h.iso3s[0]);
    return {
      id: h.id,
      name: h.name,
      kind: h.kind,
      intensity: h.intensity,
      countries: h.iso3s,
      center: h.places?.[0]?.[1] ?? c0?.center ?? null,
      summary: h.summary ?? '',
      pins48h: pins,
      daily: Math.round(r.daily * 10) / 10,
      baseline: Math.round(r.baseline * 10) / 10,
      trend,
      status: pins === 0 ? 'quiet' : pins < want ? 'thin' : 'covered',
      auto: Boolean(h.auto),
      source: h.auto ? 'surge' : h.source ?? 'curated',
      signals: h.signals ?? '',
      since: h.since ?? null,
    };
  });

  out.sort((a, b) => b.intensity - a.intensity || b.pins48h - a.pins48h);
  return { hotspots: out, history: { days }, auto };
}

function dominantKind(items, iso) {
  const counts = {};
  for (const i of items) if (i.iso3 === iso) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { conflict: 'war', unrest: 'unrest', political: 'political-crisis', humanitarian: 'humanitarian' }[top] ?? 'unrest';
}

/** Curated list → runtime shape: country names resolved to ISO codes. */
export function prepareCurated(geo, list) {
  const iso = (c) => isoOf(geo.nameToIso, c);
  return list
    .map((h) => ({
      ...h,
      iso3s: (h.countries ?? []).map(iso).filter(Boolean),
      involvedIso3s: (h.involved ?? []).map(iso).filter(Boolean),
    }))
    .filter((h) => h.iso3s.length);
}

/** Every keyword of every hotspot, for spotting a headline's hotspot by wording. */
export function keywordIndex(hotspots) {
  const pairs = [];
  for (const h of hotspots) for (const k of h.keywords ?? []) if (k.length >= 3) pairs.push([k.toLowerCase(), h]);
  if (!pairs.length) return () => null;
  pairs.sort((a, b) => b[0].length - a[0].length);
  const map = new Map(pairs);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${[...map.keys()].map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
  return (text) => {
    const m = String(text).match(re);
    return m ? map.get(m[1].toLowerCase()) : null;
  };
}

/** Google News search feed for one query, limited to the last two days. */
export function newsSearchUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=en-US&gl=US&ceid=US:en`;
}
