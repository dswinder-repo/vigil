import type { NormalizedEvent, Severity } from './types';

// --- USGS Earthquake GeoJSON ---

export function normalizeUSGS(data: unknown): NormalizedEvent[] {
  const d = data as { features?: Array<Record<string, unknown>> };
  if (!d?.features) return [];
  return d.features
    .filter((f: Record<string, unknown>) => {
      const geo = f.geometry as { coordinates?: number[] } | undefined;
      return geo?.coordinates;
    })
    .map((f: Record<string, unknown>) => {
      const props = f.properties as Record<string, unknown>;
      const geo = f.geometry as { coordinates: number[] };
      const mag = (props.mag as number) ?? 0;
      return {
        id: `usgs-${f.id}`,
        source: 'usgs' as const,
        category: 'disaster' as const,
        severity: magToSeverity(mag),
        title: `M${mag.toFixed(1)} Earthquake`,
        summary: (props.place as string) || 'Unknown location',
        coordinates: [geo.coordinates[0], geo.coordinates[1]] as [number, number],
        timestamp: new Date(props.time as number).toISOString(),
        url: props.url as string | undefined,
        metadata: {
          magnitude: mag,
          depth: geo.coordinates[2],
          tsunami: props.tsunami,
          felt: props.felt,
          alert: props.alert,
        },
      };
    });
}

function magToSeverity(mag: number): Severity {
  if (mag >= 7) return 5;
  if (mag >= 6) return 4;
  if (mag >= 5) return 3;
  if (mag >= 4) return 2;
  return 1;
}

// --- NASA EONET v3 ---

export function normalizeEONET(data: unknown): NormalizedEvent[] {
  const d = data as { events?: Array<Record<string, unknown>> };
  if (!d?.events) return [];
  return d.events
    .filter((e: Record<string, unknown>) => {
      const geo = e.geometry as Array<Record<string, unknown>> | undefined;
      return geo && geo.length > 0;
    })
    .map((e: Record<string, unknown>) => {
      const geo = e.geometry as Array<Record<string, unknown>>;
      const latest = geo[geo.length - 1];
      const cats = e.categories as Array<{ id: string; title: string }> | undefined;
      const cat = cats?.[0];
      const coords = latest.coordinates as number[] | number[][];
      const point: [number, number] =
        latest.type === 'Point'
          ? [coords[0] as number, coords[1] as number]
          : [(coords as number[][])[0][0], (coords as number[][])[0][1]];
      const sources = e.sources as Array<{ id: string; url: string }> | undefined;
      return {
        id: `eonet-${e.id}`,
        source: 'eonet' as const,
        category: eonetCategoryMap(cat?.id || ''),
        severity: eonetSeverity(cat?.id || ''),
        title: e.title as string,
        summary: `${cat?.title || 'Natural Event'} — ${sources?.map((s) => s.id).join(', ') || 'NASA EONET'}`,
        coordinates: point,
        timestamp: latest.date as string,
        url: sources?.[0]?.url,
        metadata: {
          eonetCategory: cat?.title,
          closed: e.closed,
        },
      };
    });
}

function eonetSeverity(id: string): Severity {
  const map: Record<string, Severity> = {
    volcanoes: 5,
    wildfires: 2,
    severeStorms: 3,
    floods: 3,
    earthquakes: 4,
    landslides: 3,
    seaLakeIce: 3,
    drought: 3,
    tempExtremes: 3,
    dustHaze: 2,
    snow: 2,
    waterColor: 2,
    manmade: 3,
  };
  return map[id] || 3;
}

function eonetCategoryMap(id: string): NormalizedEvent['category'] {
  const map: Record<string, NormalizedEvent['category']> = {
    drought: 'disaster',
    dustHaze: 'disaster',
    earthquakes: 'disaster',
    floods: 'disaster',
    landslides: 'disaster',
    manmade: 'disaster',
    seaLakeIce: 'disaster',
    severeStorms: 'disaster',
    snow: 'disaster',
    tempExtremes: 'disaster',
    volcanoes: 'disaster',
    waterColor: 'disaster',
    wildfires: 'disaster',
  };
  return map[id] || 'disaster';
}

// --- GDELT Business-Context & Domain Signal Utilities ---
// These power the multi-layer false-positive filter: business stories using
// conflict vocabulary ("Berkshire besieged by activist investors") are demoted,
// while actual geopolitical conflict from trusted outlets is boosted.

/** Detect business/financial context that indicates metaphorical use of conflict language */
function isBusinessContext(text: string): boolean {
  return /\b(investors?|shareholders?|board of directors|activist investor|hedge fund|stocks?|shares|market(?:s|\s+cap)|CEO|quarterly|earnings|revenue|dividends?|portfolio|acquisition|merger|IPO|valuation|Wall Street|Nasdaq|NYSE|S&P|Dow Jones|Berkshire|CNBC|Bloomberg|Fortune 500|startups?|venture capital|VC|private equity|fiscal|profits?|margins?|capitalization|buyout|equity|assets under management|AUM|ticker|bull(?:ish)?|bear(?:ish)?|trading|financial|banking|fintech|commodit(?:y|ies)|index fund|ETF|bond(?:s|\s+yield)|treasury|market share|balance sheet|cash flow|debt|credit rating|stock(?:\s+)?price|market rally|sell.off|initial public offering)\b/i.test(text);
}

/** Financial/business news domains — conflict stories from these are almost always metaphorical */
function isFinancialDomain(domain?: string): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return /^(www\.)?(bloomberg\.com|cnbc\.com|marketwatch\.com|fortune\.com|businessinsider\.com|forbes\.com|investopedia\.com|seekingalpha\.com|barrons\.com|finance\.yahoo\.com|ft\.com|benzinga\.com|nasdaq\.com|fool\.com|thestreet\.com|economist\.com|wsj\.com|bnnbloomberg\.ca|moneycontrol\.com|livemint\.com|morningstar\.com|kiplinger\.com)$/i.test(d);
}

/** Trusted geopolitical/conflict reporting outlets — high credibility for conflict categorization */
function isBoostDomain(domain?: string): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return /^(www\.)?(reuters\.com|apnews\.com|aljazeera\.(com|net)|bbc\.(com|co\.uk)|theguardian\.com|france24\.com|dw\.com|cnn\.com|npr\.org|foreignpolicy\.com|crisisgroup\.org|reliefweb\.int|un\.org|liveuamap\.com|understandingwar\.org|kyivindependent\.com|timesofisrael\.com|jpost\.com|middleeasteye\.net|i24news\.tv|icrc\.org|hrw\.org|amnesty\.org)$/i.test(d);
}

/** Lightweight check for geopolitical/military signal — used for hintCategory fallback trust */
function hasGeopoliticalSignal(text: string): boolean {
  return /\b(military|government|ministry|president|prime minister|troops|forces|border|territory|region|province|civilians?|humanitarian|NATO|UN(?:\s|$)|EU(?:\s|$)|missiles?|weapons?|army|navy|airforce|pentagon|kremlin|Tehran|Kyiv|Gaza|Beirut|Damascus|Kabul|Mogadishu|Khartoum|soldiers|armed|ceasefire|frontline|battlefield|casualties|killed in|wounded|embassy|diplomat|sanctions|invasion|occupied|sovereignty|coalition|peacekeep|warzone|checkpoint|militia|insurgent)\b/i.test(text);
}

// --- GDELT GEO 2.0 GeoJSON ---
// Note: GDELT may not have CORS headers — will show as offline if blocked

export function normalizeGDELT(data: unknown, hintCategory?: string): NormalizedEvent[] {
  const d = data as { features?: Array<Record<string, unknown>> };
  if (!d?.features) return [];
  return d.features
    .filter((f: Record<string, unknown>) => {
      const geo = f.geometry as { coordinates?: number[] } | undefined;
      if (!geo?.coordinates) return false;
      const props = f.properties as Record<string, unknown> | undefined;
      const name = (props?.name as string) || '';
      if (/^ERROR:/i.test(name)) return false;
      if (!name || name.length < 5) return false;
      if (!isLikelyEnglish(name)) return false;
      const IRRELEVANT_GDELT = /\b(shark|alligator|crocodile|bear attack|snake|celebrity|kardashian|grammy|oscar|emmy|super bowl|nfl|nba|mlb|nhl|world cup|olympic|documentary|film festival|box office|reality tv|concert tour|stock split|quarterly results|price target|buy rating|sell rating|market cap|stock buyback|share repurchase|earnings per share|EPS|credit suisse|goldman sachs|morgan stanley|wall street analyst|mutual fund|index fund|yield curve|interest rate hike|federal reserve|rate cut|bull market|bear market)\b/i;
      if (IRRELEVANT_GDELT.test(name)) return false;
      return true;
    })
    .map((f: Record<string, unknown>, i: number) => {
      const props = f.properties as Record<string, unknown>;
      const geo = f.geometry as { coordinates: number[] };
      const tone = (props.urltone as number) ?? 0;
      const name = (props.name as string) || '';
      const url = (props.url as string) || '';
      const html = (props.html as string) || '';
      const summary = cleanGdeltSummary(html, (props.domain as string) || '', url);
      const domainStr = (props.domain as string) || '';
      const cat = gdeltCategoryMap(name + ' ' + summary, tone, hintCategory, domainStr);
      let sev = keywordSeverity(name + ' ' + summary, domainStr);
      // Boost domain floor: trusted geopolitical outlets reporting conflict/unrest → at least severity 3
      if (isBoostDomain(domainStr) && (cat === 'conflict' || cat === 'unrest') && sev < 3) sev = 3 as typeof sev;
      // Enhanced impact scoring: fatality weighting + geographic significance floor
      sev = applyImpactFactors(sev, name + ' ' + summary);
      return {
        id: `gdelt-${hintCategory || 'misc'}-${(props.urlpubtimedate as string) || i}-${i}`,
        source: 'gdelt' as const,
        category: cat,
        severity: sev,
        title: decodeEntities(name) || 'Global Event',
        summary,
        coordinates: [geo.coordinates[0], geo.coordinates[1]] as [number, number],
        timestamp: props.urlpubtimedate
          ? formatGdeltDate(props.urlpubtimedate as string)
          : new Date().toISOString(),
        url: url || undefined,
        metadata: {
          domain: props.domain,
          tone,
          sharingimage: props.sharingimage,
        },
      };
    });
}

/** Clean GDELT HTML context into a readable summary */
function cleanGdeltSummary(html: string, domain: string, url: string): string {
  if (!html) return domain || url || 'No additional details';
  let text = html
    // Strip all HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode HTML entities
    .replace(/&[a-zA-Z]+;/g, (m) => decodeEntities(m))
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove email addresses
    .replace(/\S+@\S+\.\S+/g, '')
    // Collapse whitespace (newlines, tabs, multiple spaces)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Filter out text that's mostly non-English (backup for API filter)
  if (text.length > 20 && !isLikelyEnglish(text)) {
    return domain || 'Source: ' + (url ? new URL(url).hostname : 'unknown');
  }

  // Truncate to a readable length — find a sentence boundary near 250 chars
  if (text.length > 250) {
    const cut = text.lastIndexOf('.', 250);
    text = cut > 100 ? text.slice(0, cut + 1) : text.slice(0, 250) + '…';
  }

  return text || domain || url || 'No additional details';
}

/** Heuristic: text is likely English if >70% of chars are basic Latin + common punctuation */
function isLikelyEnglish(text: string): boolean {
  if (!text || text.length < 3) return true; // too short to judge
  const latinChars = text.replace(/[\s\d\p{P}\p{S}]/gu, ''); // strip whitespace, digits, punctuation, symbols
  if (latinChars.length === 0) return true; // all punctuation/digits
  const basicLatin = latinChars.replace(/[^a-zA-Z\u00C0-\u024F]/g, ''); // basic Latin + extended Latin
  return basicLatin.length / latinChars.length > 0.7;
}

function gdeltCategoryMap(name: string, tone: number, hintCategory?: string, domain?: string): NormalizedEvent['category'] {
  const lower = name.toLowerCase();
  const bizCtx = isBusinessContext(lower);
  const finDomain = isFinancialDomain(domain);

  // --- Layer 1+2: Business-context gate ---
  // If BOTH business context detected AND financial domain → skip conflict/unrest regex entirely.
  // If ONLY business context (no financial domain) → still skip conflict, but allow other categories.
  // This prevents "Berkshire besieged by activist investors" from becoming conflict.

  // Conflict: active combat vocabulary — "besieged" removed (too metaphorical)
  if (!bizCtx && /\b(airstrikes?|shelling|bombardment|frontline|warzone|counteroffensive|invasion|invaded|ceasefire|combat|battlefield|warship|infantry|armed conflict|drone strikes?|insurgent|militia|ambush|sniper|siege|war\s+crimes?|artillery|missiles?|ground offensive|military offensive|troops deployed|military operation|escalation|occupied territor(?:y|ies)|arms shipment)\b/.test(lower)) return 'conflict';
  // Standalone "war" catches "war in Ukraine" etc — exclude metaphorical AND business uses
  if (!bizCtx && /\bwars?\b/.test(lower) && !/\b(cold war|star wars?|culture war|trade war|price war|war on \w+|cyberwar(?:fare)?)\b/.test(lower)) return 'conflict';
  // Unrest: high-intensity civil disorder — also gated by business context
  if (!bizCtx && /\b(riot|coup|uprising|crackdown|insurrection|looting|mutiny|junta|revolution|martial law|state of emergency|mass arrests|curfew)\b/.test(lower)) return 'unrest';
  // Cyber: compound word patterns (business context doesn't affect — cyberattacks are real in any domain)
  if (/cyber(?:attack|security|espionage|war(?:fare)?)|hack(?:ers?|ing|ed)|ransomware|malware|phishing|DDoS|botnet|spyware|data\s+breach|zero.day/i.test(lower)) return 'cyber';
  // Disaster: natural catastrophes
  if (/\b(earthquake|quake|flood(?:s|ing)?|hurricane|wildfire|tsunami|volcano|eruption|tornado|typhoon|cyclone|avalanche|landslide|blizzard|mudslide)\b/.test(lower)) return 'disaster';
  // Disease: specific pathogens only
  if (/\b(outbreak|epidemic|cholera|ebola|mpox|dengue|measles|tuberculosis|influenza|plague|pathogen)\b/.test(lower)) return 'disease';
  // Humanitarian: crisis-scale terms — gated by business context
  if (!bizCtx && /\b(famine|starvation|genocide|atrocit(?:y|ies)|malnutrition|mass\s+displacement|trafficking|aid convoy|civilian casualties|war crimes|ethnic cleansing)\b/.test(lower)) return 'humanitarian';
  // Political: significant political events
  if (/\b(sanctions?|impeachment|assassination|referendum|embargo|geopolitical)\b/.test(lower)) return 'political';

  // --- Layer 3: Smarter hintCategory fallback ---
  // Don't blindly trust hintCategory — require geopolitical signal and no business context
  if (hintCategory && hintCategory !== 'political') {
    if (bizCtx || finDomain) return 'political'; // business story, not actual conflict
    if (hasGeopoliticalSignal(lower)) return hintCategory as NormalizedEvent['category']; // geo signal → trust hint
    return 'political'; // no signal either way — safest default
  }
  // Tone-based last resort (also gated)
  if (!bizCtx && tone < -10) return 'conflict';
  if (!bizCtx && tone < -6) return 'unrest';
  return 'political';
}

/** Keyword-based severity scoring — business-context-aware (Layer 6) + multi-factor impact */
export function keywordSeverity(text: string, domain?: string): Severity {
  const lower = text.toLowerCase();

  // --- Layer 6: Business-context severity cap ---
  // If the text is a business/financial story or from a financial domain,
  // score normally but cap at severity 2 — it's not a real crisis.
  const bizCap = isBusinessContext(lower) || isFinancialDomain(domain);

  // Severity 5 — catastrophic: invasion, mass casualties, nuclear, genocide
  if (/\b(invasion|invaded|massacre|genocide|nuclear(?:\s+(?:strike|weapon|attack))?|mass casualt(?:y|ies)|pandemic declared|chemical weapon|ethnic cleansing)\b/.test(lower)) return bizCap ? 2 : 5;
  if (/\bwar\s+(?:erupts?|begins?|breaks?\s+out|declared|escalat|rag(?:es?|ing))\b/.test(lower)) return bizCap ? 2 : 5;
  if (/\ball.out war\b/.test(lower)) return bizCap ? 2 : 5;
  // Severity 4 — major escalation: active warfare, coup, assassination, catastrophic natural event
  // "besieged" removed — too often metaphorical in English business press
  if (/\b(airstrikes?|shelling|bombardment|counteroffensive|coup|martial law|epidemic|state of emergency|siege|blockade|assassination|major offensive|artillery|ground offensive|military offensive)\b/.test(lower)) return bizCap ? 2 : 4;
  if (/\bhurricane\s+categor[y\s]+[4-5]\b|\bmagnitude\s+[7-9]\b/.test(lower)) return bizCap ? 2 : 4;
  // Standalone "war" → severity 4
  if (/\bwars?\b/.test(lower) && !/\b(cold war|star wars?|culture war|trade war|price war|war on \w+|cyberwar(?:fare)?)\b/.test(lower)) return bizCap ? 2 : 4;
  // Severity 3 — notable: clashes, cyberattacks, floods, missiles, casualties reported
  if (/\b(clash(?:es)?|skirmish|cyberattack|ransomware|flood(?:s|ing)?|wildfire|outbreak|riot(?:s)?|armed conflict|missiles?|drone strikes?|insurgent|ambush|casualties|killed|wounded|bombing(?:s)?|sanctions?|impeachment|crackdown|offensive|escalation)\b/.test(lower)) return bizCap ? 2 : 3;
  // Severity 2 — tensions, advisories, demonstrations, displacement
  if (/\b(tensions?|demonstration|vulnerability|tremor|drought|advisory|standoff|unrest|refugees?|displaced|famine|geopolitical|embargo|protest)\b/.test(lower)) return 2;
  // Severity 1 — routine / low-level
  return 1;
}

/** --- Enhanced Impact Scoring helpers ---
 *
 * These supplement keywordSeverity with multi-factor adjustments:
 *  1. Fatality weighting — extract casualty counts from text, boost severity
 *  2. Geographic significance — capital cities and megacities elevate floor
 *
 * Usage: call `applyImpactFactors(baseSeverity, text)` after keywordSeverity.
 */

// High-population capitals and megacities that warrant elevated concern when mentioned
const HIGH_SIGNIFICANCE_CITIES = new Set([
  // Geopolitical capitals with high strategic weight
  'washington', 'beijing', 'moscow', 'london', 'paris', 'berlin', 'tokyo',
  'brussels', 'kyiv', 'kiev', 'tehran', 'riyadh', 'jerusalem', 'tel aviv',
  'islamabad', 'new delhi', 'delhi', 'mumbai', 'karachi', 'dhaka',
  'beijing', 'shanghai', 'istanbul', 'ankara', 'cairo', 'nairobi',
  'lagos', 'kinshasa', 'khartoum', 'kabul', 'baghdad', 'damascus',
  'beirut', 'tripoli', 'mogadishu', 'colombo', 'yangon', 'kathmandu',
  'pyongyang', 'taipei', 'seoul', 'bangkok', 'jakarta', 'manila',
  'caracas', 'bogota', 'lima', 'buenos aires', 'santiago', 'havana',
  'mexico city', 'ottawa', 'canberra', 'pretoria', 'abuja',
]);

/**
 * Extract the largest casualty count from free text.
 * Returns 0 if no count found.
 */
function extractCasualtyCount(text: string): number {
  // Patterns: "12 killed", "at least 50 dead", "hundreds killed", "dozens dead", "1,200 casualties"
  const lower = text.toLowerCase();
  let max = 0;

  // Numeric patterns with commas/spaces (e.g. "1,200 dead", "45 killed")
  const numericMatches = lower.matchAll(/(\d[\d,]*)\s*(?:people\s+)?(?:killed|dead|died|fatalities|casualties|deaths)/g);
  for (const m of numericMatches) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }

  // Approximate patterns
  if (max === 0) {
    if (/\b(thousands?|hundreds of thousands)\s+(?:killed|dead|died|casualties)\b/.test(lower)) max = 1000;
    else if (/\bhundreds?\s+(?:killed|dead|died|casualties)\b/.test(lower)) max = 100;
    else if (/\bdozens?\s+(?:killed|dead|died|casualties)\b/.test(lower)) max = 12;
  }

  return max;
}

/**
 * Boost severity based on casualty count.
 * Thresholds: 1-9 → +0, 10-99 → +1, 100-999 → +2, 1000+ → +3
 */
function casualtyBoost(count: number): number {
  if (count >= 1000) return 3;
  if (count >= 100) return 2;
  if (count >= 10) return 1;
  return 0;
}

/**
 * Returns true if the text mentions a high-significance city or capital.
 * Used to apply a minimum severity floor for events in major population centers.
 */
function mentionsHighSignificanceCity(text: string): boolean {
  const lower = text.toLowerCase();
  for (const city of HIGH_SIGNIFICANCE_CITIES) {
    if (lower.includes(city)) return true;
  }
  return false;
}

/**
 * Apply multi-factor impact adjustments on top of a base keyword severity.
 * Returns a clamped 1-5 severity after considering casualties and geography.
 */
export function applyImpactFactors(base: Severity, text: string): Severity {
  let score = base as number;

  // Factor 1: Fatality weighting
  const casualties = extractCasualtyCount(text);
  score += casualtyBoost(casualties);

  // Factor 2: Geographic significance floor — events in major capitals/megacities
  // get at least severity 2 (don't suppress meaningful geopolitical events)
  if (mentionsHighSignificanceCity(text) && score < 2) {
    score = 2;
  }

  return Math.min(5, Math.max(1, score)) as Severity;
}

function formatGdeltDate(dateStr: string): string {
  if (dateStr.length >= 14) {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(8, 10);
    const min = dateStr.slice(10, 12);
    const s = dateStr.slice(12, 14);
    return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
  }
  return new Date().toISOString();
}

// --- ReliefWeb Disasters ---

export function normalizeReliefWeb(data: unknown): NormalizedEvent[] {
  const d = data as { data?: Array<Record<string, unknown>> };
  if (!d?.data) return [];
  return d.data
    .filter((item) => {
      const fields = item.fields as Record<string, unknown> | undefined;
      if (!fields) return false;
      const country = fields.country as Array<Record<string, unknown>> | undefined;
      if (!country?.[0]) return false;
      const loc = country[0].location as Record<string, unknown> | undefined;
      return loc?.lat != null && loc?.lon != null;
    })
    .map((item) => {
      const fields = item.fields as Record<string, unknown>;
      const name = (fields.name as string) || 'Unknown Disaster';
      const status = (fields.status as string) || '';
      const country = fields.country as Array<Record<string, unknown>>;
      const primaryCountry = country[0];
      const loc = primaryCountry.location as Record<string, unknown>;
      const lat = loc.lat as number;
      const lon = loc.lon as number;
      const types = fields.type as Array<Record<string, unknown>> | undefined;
      const primaryType = types?.[0]?.name as string | undefined;
      const dateEvent = (fields.date as Record<string, unknown>)?.event as string | undefined;
      const url = (fields.url_alias as string) || (fields.url as string) || undefined;

      return {
        id: `reliefweb-${item.id}`,
        source: 'reliefweb' as const,
        category: reliefwebCategoryMap(primaryType || name),
        severity: reliefwebSeverity(status),
        title: name,
        summary: `${primaryType || 'Disaster'} — ${(primaryCountry.name as string) || 'Unknown'}${status ? ` (${status})` : ''}`,
        coordinates: [lon, lat] as [number, number],
        timestamp: dateEvent || new Date().toISOString(),
        url: url ? `https://reliefweb.int${url}` : undefined,
        metadata: {
          type: primaryType,
          status,
          country: primaryCountry.name,
        },
      };
    });
}

function reliefwebCategoryMap(typeStr: string): NormalizedEvent['category'] {
  const lower = typeStr.toLowerCase();
  if (/earthquake|tsunami|volcano|landslide/.test(lower)) return 'disaster';
  if (/flood|cyclone|hurricane|typhoon|storm|drought/.test(lower)) return 'disaster';
  if (/epidemic|outbreak|disease/.test(lower)) return 'disease';
  if (/conflict|war/.test(lower)) return 'conflict';
  if (/famine|displacement|refugee/.test(lower)) return 'humanitarian';
  return 'disaster';
}

function reliefwebSeverity(status: string): Severity {
  const lower = status.toLowerCase();
  if (lower === 'alert') return 5;
  if (lower === 'ongoing') return 4;
  if (lower === 'current') return 3;
  if (lower === 'past') return 1;
  return 3;
}

// --- NWS Alerts (GeoJSON) ---

export function normalizeNWS(data: unknown): NormalizedEvent[] {
  const d = data as { features?: Array<Record<string, unknown>> };
  if (!d?.features) return [];
  return d.features
    .filter((f) => {
      // NWS alerts don't always have point geometry — use centroid of bbox if available
      const geo = f.geometry as Record<string, unknown> | null;
      const props = f.properties as Record<string, unknown> | undefined;
      // Need at least properties to create an event
      if (!props) return false;
      // Accept if we have geometry OR geocode with UGC (we'll derive approximate coords)
      return geo != null || props.geocode != null;
    })
    .map((f, i) => {
      const props = f.properties as Record<string, unknown>;
      const geo = f.geometry as Record<string, unknown> | null;
      const event = (props.event as string) || 'Weather Alert';
      const severity = (props.severity as string) || 'Unknown';
      const area = (props.areaDesc as string) || 'Unknown Area';
      const headline = (props.headline as string) || '';
      const description = (props.description as string) || '';

      // Try to extract coordinates from geometry
      let coords: [number, number] = [-98.5, 39.8]; // US center fallback
      if (geo?.type === 'Polygon') {
        const polyCoords = (geo.coordinates as number[][][])?.[0];
        if (polyCoords?.length) {
          const lngs = polyCoords.map((c) => c[0]);
          const lats = polyCoords.map((c) => c[1]);
          coords = [
            (Math.min(...lngs) + Math.max(...lngs)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2,
          ];
        }
      } else if (geo?.type === 'Point') {
        const pt = geo.coordinates as number[];
        coords = [pt[0], pt[1]];
      }

      return {
        id: `nws-${(props.id as string) || i}`,
        source: 'nws' as const,
        category: 'disaster' as const,
        severity: nwsSeverity(severity),
        title: event,
        summary: headline || `${event} — ${area.split(';')[0]}`,
        coordinates: coords,
        timestamp: (props.onset as string) || (props.effective as string) || new Date().toISOString(),
        url: (props.id as string) ? `https://alerts.weather.gov/search?id=${props.id}` : undefined,
        metadata: {
          severity,
          urgency: props.urgency,
          certainty: props.certainty,
          area,
          expires: props.expires,
          description: description.slice(0, 200),
          sender: props.senderName,
        },
      };
    })
    // A board about the world should not be mostly US county weather. The
    // most serious alerts are kept; the long tail of routine warnings is not.
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 60);
}

function nwsSeverity(severity: string): Severity {
  const lower = severity.toLowerCase();
  if (lower === 'extreme') return 5;
  if (lower === 'severe') return 3;
  if (lower === 'moderate') return 3;
  if (lower === 'minor') return 2;
  return 1;
}

// --- GDACS RSS XML ---

export function normalizeGDACS(xml: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  // Parse RSS items from XML text
  const items = xml.split('<item>').slice(1);
  for (const item of items) {
    const get = (tag: string): string => {
      const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : '';
    };
    const title = get('title');
    const description = get('description');
    const link = get('link');
    const pubDate = get('pubDate');
    const alertLevel = get('gdacs:alertlevel') || get('alertlevel') || '';

    // Extract coordinates from georss:point (format: "lat lng")
    const pointMatch = item.match(/<georss:point>([\d.\-]+)\s+([\d.\-]+)<\/georss:point>/);
    if (!pointMatch) continue;
    const lat = parseFloat(pointMatch[1]);
    const lng = parseFloat(pointMatch[2]);
    if (isNaN(lat) || isNaN(lng)) continue;

    const severity = gdacsAlertSeverity(alertLevel);
    const category = gdacsCategory(title + ' ' + description);

    events.push({
      id: `gdacs-${link || title.slice(0, 30)}-${pubDate}`,
      source: 'gdacs' as const,
      category,
      severity,
      title: title || 'GDACS Alert',
      summary: description.slice(0, 250) || 'Global Disaster Alert',
      coordinates: [lng, lat],
      timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      url: link || undefined,
      metadata: { alertLevel },
    });
  }
  return events;
}

function gdacsAlertSeverity(level: string): Severity {
  const lower = level.toLowerCase().trim();
  if (lower === 'red') return 5;
  if (lower === 'orange') return 4;
  // Green is GDACS saying "this happened and nobody is at risk". Rated the
  // same as an orange alert it buried everything else on the board.
  if (lower === 'green') return 1;
  return 2;
}

function gdacsCategory(text: string): NormalizedEvent['category'] {
  const lower = text.toLowerCase();
  if (/earthquake|seismic/.test(lower)) return 'disaster';
  if (/flood/.test(lower)) return 'disaster';
  if (/cyclone|hurricane|typhoon|storm/.test(lower)) return 'disaster';
  if (/volcano|eruption/.test(lower)) return 'disaster';
  if (/tsunami/.test(lower)) return 'disaster';
  if (/drought|famine/.test(lower)) return 'humanitarian';
  return 'disaster';
}

// --- CISA Known Exploited Vulnerabilities ---

export function normalizeCISA(data: unknown): NormalizedEvent[] {
  const d = data as { vulnerabilities?: Array<Record<string, unknown>> };
  if (!d?.vulnerabilities) return [];

  // Filter to vulnerabilities added in the last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return d.vulnerabilities
    .filter((v) => {
      const added = (v.dateAdded as string) || '';
      return added >= cutoffStr;
    })
    .map((v) => {
      const cveID = (v.cveID as string) || 'Unknown CVE';
      const vendor = (v.vendorProject as string) || 'Unknown';
      const product = (v.product as string) || '';
      const name = (v.vulnerabilityName as string) || cveID;
      const description = (v.shortDescription as string) || '';
      const dateAdded = (v.dateAdded as string) || new Date().toISOString();
      const dueDate = (v.dueDate as string) || '';
      const knownRansomware = (v.knownRansomwareCampaignUse as string) || 'Unknown';

      return {
        id: `cisa-${cveID}`,
        source: 'cisa' as const,
        category: 'cyber' as const,
        severity: cisaSeverity(vendor, knownRansomware),
        title: `${cveID}: ${vendor} ${product}`,
        summary: description.slice(0, 250) || name,
        // Place at Washington DC (CISA HQ)
        coordinates: [-77.0369, 38.9072] as [number, number],
        timestamp: dateAdded.includes('T') ? dateAdded : `${dateAdded}T00:00:00Z`,
        url: `https://nvd.nist.gov/vuln/detail/${cveID}`,
        metadata: {
          cveID,
          vendor,
          product,
          knownRansomware,
          dueDate,
        },
      };
    });
}

function cisaSeverity(vendor: string, ransomware: string): Severity {
  const lower = vendor.toLowerCase();
  // Known ransomware exploitation = critical
  if (ransomware.toLowerCase() === 'known') return 5;
  // Critical infrastructure vendors
  if (/microsoft|apple|google|cisco|fortinet|palo alto|vmware|citrix|adobe|oracle/.test(lower)) return 4;
  return 3;
}

// --- NASA FIRMS (Active Fire / VIIRS) ---

export function normalizeNASAFIRMS(csv: string): NormalizedEvent[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => headers.indexOf(name);
  const latI = idx('latitude');
  const lngI = idx('longitude');
  const frpI = idx('frp');
  const confI = idx('confidence');
  const dateI = idx('acq_date');
  const timeI = idx('acq_time');

  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line, i) => {
      const cols = line.split(',');
      const lat = parseFloat(cols[latI]);
      const lng = parseFloat(cols[lngI]);
      const frp = parseFloat(cols[frpI]) || 0;
      const conf = (cols[confI] ?? '').trim().toLowerCase();
      const acqDate = (cols[dateI] ?? '').trim();
      const acqTime = (cols[timeI] ?? '').trim().padStart(4, '0');
      const timestamp = acqDate
        ? `${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2)}:00Z`
        : new Date().toISOString();

      if (isNaN(lat) || isNaN(lng)) return null;
      if (conf === 'l' || conf === 'low') return null; // skip low-confidence detections

      const severity: Severity =
        frp >= 1000 ? 5 : frp >= 300 ? 4 : frp >= 100 ? 3 : frp >= 20 ? 2 : 1;

      return {
        id: `firms-${acqDate}-${i}`,
        source: 'firms' as const,
        category: 'disaster' as const,
        severity,
        title: `Active Fire Detection (FRP: ${frp.toFixed(0)} MW)`,
        summary: `Satellite-detected fire hotspot. Fire Radiative Power: ${frp.toFixed(0)} MW. Confidence: ${conf.toUpperCase()}.`,
        coordinates: [lng, lat] as [number, number],
        timestamp,
        url: 'https://firms.modaps.eosdis.nasa.gov/map/',
        metadata: { frp, confidence: conf },
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    // NASA reports thousands of hotspots a day, most of them agricultural
    // burning. Plotted in full they clustered into bubbles reading 300 and 500
    // that covered whole continents and buried every real event underneath.
    // The largest fires are worth showing; the rest are background.
    .sort((a, b) => (b.metadata.frp as number) - (a.metadata.frp as number))
    .slice(0, 120);
}

// --- WHO Disease Outbreak News (RSS) ---

const WHO_COUNTRY_COORDS: Record<string, [number, number]> = {
  afghanistan: [67.7, 33.9], angola: [17.9, -11.2], bangladesh: [90.4, 23.7],
  brazil: [-51.9, -14.2], cameroon: [12.4, 3.9], chad: [18.7, 15.5],
  china: [104.2, 35.9], colombia: [-74.3, 4.6], 'congo': [15.8, -0.2],
  'democratic republic': [23.7, -2.9], drc: [23.7, -2.9], egypt: [30.8, 26.8],
  ethiopia: [40.5, 9.1], ghana: [-1.0, 7.9], haiti: [-72.3, 18.9],
  india: [78.9, 20.6], indonesia: [113.9, -0.8], iran: [53.7, 32.4],
  iraq: [43.7, 33.2], kenya: [37.9, 0.0], lebanon: [35.9, 33.9],
  libya: [17.2, 26.3], madagascar: [46.9, -18.8], malawi: [34.3, -13.3],
  mali: [-2.0, 17.6], mozambique: [35.5, -18.7], myanmar: [95.9, 21.9],
  niger: [8.1, 17.6], nigeria: [8.7, 9.1], pakistan: [69.3, 30.4],
  philippines: [122.9, 12.9], 'sierra leone': [-11.8, 8.5], somalia: [46.2, 6.0],
  sudan: [29.9, 15.6], syria: [38.6, 34.8], tanzania: [34.9, -6.4],
  ukraine: [31.2, 49.0], uganda: [32.3, 1.4], venezuela: [-66.6, 6.4],
  yemen: [48.5, 15.6], zambia: [27.9, -13.1], zimbabwe: [29.9, -20.1],
};

export function normalizeWHO(xml: string): NormalizedEvent[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items
    .map((item, i) => {
      const title = decodeEntities(
        (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ??
          item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? ''
      );
      const link = (item.match(/<link>(.*?)<\/link>/) ?? [])[1]?.trim() ?? '';
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1]?.trim() ?? '';
      const description = decodeEntities(
        (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
          item.match(/<description>([\s\S]*?)<\/description>/))?.[1]
          ?.replace(/<[^>]+>/g, '')
          .trim() ?? ''
      );

      if (!title) return null;

      // Derive severity from keywords
      const lower = title.toLowerCase();
      const severity: Severity =
        /pandemic|pheic|global emergency/.test(lower) ? 5 :
        /ebola|marburg|plague|cholera|mpox|haemorrhagic/.test(lower) ? 4 :
        /outbreak|epidemic|alert|emergency/.test(lower) ? 3 : 2;

      // Try to map country mention to coordinates
      // Left null when no country matches; the item is dropped below rather
      // than pinned at [0, 0], which is open ocean off west Africa.
      let coordinates: [number, number] | null = null;
      for (const [country, coords] of Object.entries(WHO_COUNTRY_COORDS)) {
        if (lower.includes(country)) { coordinates = coords; break; }
      }
      if (!coordinates) return null;

      return {
        id: `who-${i}-${Date.parse(pubDate) || Date.now()}`,
        source: 'who' as const,
        category: 'disease' as const,
        severity,
        title,
        summary: description.slice(0, 300),
        coordinates,
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: link,
        metadata: {},
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

// --- NOAA Space Weather Alerts ---

export function normalizeSpaceWeather(data: unknown): NormalizedEvent[] {
  if (!Array.isArray(data)) return [];
  // NOAA Boulder, CO — source of space weather alerts
  const NOAA_COORDS: [number, number] = [-105.2705, 40.015];

  return (data as Record<string, string>[])
    .filter((item) => item.message && item.issue_time)
    .slice(0, 20)
    .map((item, i) => {
      const msg: string = item.message ?? '';
      const issueTime: string = item.issue_time ?? '';

      // Extract NOAA scale (G1-G5, S1-S5, R1-R5)
      const scaleMatch = msg.match(/\b([GSR][1-5])\b/);
      const scale = scaleMatch?.[1] ?? '';
      const scaleNum = scale ? parseInt(scale[1]) : 0;

      const severity: Severity =
        scaleNum >= 5 ? 5 : scaleNum >= 4 ? 4 : scaleNum >= 3 ? 3 : scaleNum >= 1 ? 2 : 1;

      const firstLine = msg.split('\n').find((l) => l.trim()) ?? 'Space Weather Alert';

      return {
        id: `space-weather-${i}-${issueTime}`,
        source: 'space-weather' as const,
        category: 'disaster' as const,
        severity,
        title: firstLine.slice(0, 100),
        summary: msg.slice(0, 400),
        coordinates: NOAA_COORDS,
        timestamp: issueTime ? new Date(issueTime).toISOString() : new Date().toISOString(),
        url: 'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings',
        metadata: { scale },
      };
    });
}

// --- Shared Utilities ---

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// --- Meteoalarm European Weather Warnings ---

export function normalizeMeteoalarm(data: unknown): NormalizedEvent[] {
  const raw = data as { features?: Array<{
    geometry?: { coordinates?: number[][][] } | null;
    properties?: {
      awareness_level?: string;
      awareness_type?: string;
      country?: string;
      headline?: string;
      description?: string;
      effective?: string;
      web?: string;
    };
  }> };

  const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
    AT: [47.8, 13.0], BE: [50.5, 4.5], BG: [42.7, 25.5], HR: [45.1, 15.2],
    CY: [35.1, 33.4], CZ: [49.8, 15.5], DK: [56.3, 9.5], EE: [58.6, 25.0],
    FI: [64.0, 26.0], FR: [46.2, 2.2], DE: [51.2, 10.5], GR: [39.1, 21.8],
    HU: [47.2, 19.5], IE: [53.4, -8.2], IT: [42.8, 12.8], LV: [56.9, 24.6],
    LT: [55.2, 23.9], LU: [49.8, 6.1], MT: [35.9, 14.5], NL: [52.3, 5.3],
    NO: [64.5, 11.5], PL: [51.9, 19.1], PT: [39.4, -8.2], RO: [45.9, 24.9],
    SK: [48.7, 19.7], SI: [46.1, 14.8], ES: [40.4, -3.7], SE: [62.0, 15.0],
    CH: [46.8, 8.2], GB: [54.4, -3.4],
  };

  const levelToSeverity = (level: string): number => {
    if (level === 'red') return 5;
    if (level === 'orange') return 4;
    if (level === 'yellow') return 3;
    return 1;
  };

  const features = raw?.features ?? [];
  const results: NormalizedEvent[] = [];

  for (const f of features) {
    const p = f.properties;
    if (!p) continue;

    const severity = levelToSeverity(p.awareness_level ?? '');
    if (severity < 2) continue; // filter green/unknown

    // Compute coordinates — NormalizedEvent uses [lng, lat] order
    let lng = 0;
    let lat = 0;
    const country = p.country ?? '';
    if (f.geometry?.coordinates?.[0]) {
      const ring = f.geometry.coordinates[0];
      const lons = ring.map((c) => c[0]);
      const lats = ring.map((c) => c[1]);
      lng = lons.reduce((a, b) => a + b, 0) / lons.length;
      lat = lats.reduce((a, b) => a + b, 0) / lats.length;
    } else if (COUNTRY_CENTROIDS[country]) {
      // Centroids stored as [lat, lng] — reorder for coordinates tuple
      [lat, lng] = COUNTRY_CENTROIDS[country];
    } else {
      continue; // no coordinates available, skip
    }

    const title = p.headline ?? `${p.awareness_type ?? 'Weather'} Warning`;
    const summary = p.description ?? `${p.awareness_level ?? ''} level ${p.awareness_type ?? 'weather'} warning for ${country}`;

    results.push({
      id: `meteoalarm-${country}-${p.effective ?? Date.now()}-${title.slice(0, 20)}`,
      source: 'meteoalarm' as const,
      category: 'disaster' as const,
      title,
      summary,
      coordinates: [lng, lat],
      severity: severity as 1 | 2 | 3 | 4 | 5,
      timestamp: p.effective ? new Date(p.effective).toISOString() : new Date().toISOString(),
      url: p.web,
      metadata: {
        awareness_type: p.awareness_type,
        awareness_level: p.awareness_level,
        country,
      },
    });
  }

  return results;
}

// --- FAA Temporary Flight Restrictions (TFR) ---
// Source: https://tfr.faa.gov/tfr2/tfr_feed_geojson.json
// NOTE: The FAA TFR GeoJSON endpoint may be unreliable and can fail CORS checks.
// The hook and normalizer are wired in and will silently return [] on failure.
// Property paths are defensive with optional chaining because the FAA schema
// varies between TFR types and has changed historically.

export function normalizeFAATFR(geojson: unknown): NormalizedEvent[] {
  try {
    const gj = geojson as {
      features?: Array<Record<string, unknown>>;
      type?: string;
    };

    if (!gj?.features || !Array.isArray(gj.features)) return [];

    const results: NormalizedEvent[] = [];

    for (const feature of gj.features) {
      try {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const geometry = feature.geometry as {
          type?: string;
          coordinates?: unknown;
        } | null;

        // --- Extract ID ---
        const notamNumber =
          (props.notamNumber as string | undefined) ??
          ((props.coreNOTAMData as Record<string, unknown> | undefined)
            ?.notam as Record<string, unknown> | undefined)?.number as
            | string
            | undefined ??
          String(feature.id ?? Math.random());
        const id = `faa-tfr-${notamNumber}`;

        // --- Extract classification / type ---
        const classification =
          (props.classification as string | undefined) ??
          (props.type as string | undefined) ??
          '';

        // --- Map classification to category + severity ---
        let category: NormalizedEvent['category'] = 'political';
        let severity: NormalizedEvent['severity'] = 2;

        const cls = classification.toLowerCase();
        if (cls.includes('security') || cls.includes('vip')) {
          category = 'political';
          severity = 3;
        } else if (
          cls.includes('military') ||
          cls.includes('air defense') ||
          cls.includes('defense')
        ) {
          category = 'conflict';
          severity = 3;
        } else if (
          cls.includes('emergency') ||
          cls.includes('disaster') ||
          cls.includes('hazard') ||
          cls.includes('wildfire') ||
          cls.includes('fire')
        ) {
          category = 'disaster';
          severity = 4;
        }

        // --- Extract location / title text ---
        const facilityDesignation =
          (props.facilityDesignation as string | undefined) ??
          (props.facilityName as string | undefined) ??
          (props.location as string | undefined) ??
          '';

        const notamText =
          (
            (props.coreNOTAMData as Record<string, unknown> | undefined)
              ?.notam as Record<string, unknown> | undefined
          )?.text as string | undefined ??
          (props.text as string | undefined) ??
          '';

        const title = facilityDesignation
          ? `TFR: ${facilityDesignation}${classification ? ` (${classification})` : ''}`
          : `FAA TFR${classification ? `: ${classification}` : ''}`;

        const summary =
          notamText.slice(0, 300) ||
          `Temporary Flight Restriction — ${classification || 'Active'}`;

        // --- Extract coordinates ---
        // Try geometryCentroid property first, then compute from geometry
        let lng = 0;
        let lat = 0;
        let hasCoords = false;

        const centroid = props.geometryCentroid as
          | { longitude?: number; latitude?: number; lng?: number; lat?: number }
          | undefined;
        if (centroid) {
          lng = centroid.longitude ?? centroid.lng ?? 0;
          lat = centroid.latitude ?? centroid.lat ?? 0;
          if (lng !== 0 || lat !== 0) hasCoords = true;
        }

        if (!hasCoords && geometry) {
          if (geometry.type === 'Point') {
            const coords = geometry.coordinates as number[];
            if (Array.isArray(coords) && coords.length >= 2) {
              lng = coords[0];
              lat = coords[1];
              hasCoords = true;
            }
          } else if (
            geometry.type === 'Polygon' ||
            geometry.type === 'MultiPolygon'
          ) {
            // Compute centroid from first ring
            let ring: number[][] | null = null;
            if (geometry.type === 'Polygon') {
              ring = (geometry.coordinates as number[][][])?.[0] ?? null;
            } else {
              ring =
                (geometry.coordinates as number[][][][])?.[0]?.[0] ?? null;
            }
            if (ring && ring.length > 0) {
              lng =
                ring.reduce((s: number, c: number[]) => s + (c[0] ?? 0), 0) /
                ring.length;
              lat =
                ring.reduce((s: number, c: number[]) => s + (c[1] ?? 0), 0) /
                ring.length;
              hasCoords = true;
            }
          }
        }

        // Skip features with no usable coordinates
        if (!hasCoords) continue;

        // --- Extract timestamp ---
        const effectiveStart =
          (props.effectiveStart as string | undefined) ??
          (props.effective as string | undefined) ??
          new Date().toISOString();
        const timestamp = (() => {
          try {
            return new Date(effectiveStart).toISOString();
          } catch {
            return new Date().toISOString();
          }
        })();

        results.push({
          id,
          source: 'faa-tfr' as const,
          category,
          severity,
          title,
          summary,
          coordinates: [lng, lat],
          timestamp,
          url: 'https://tfr.faa.gov/tfr2/list.html',
          metadata: {
            notamNumber,
            classification,
            facilityDesignation,
          },
        });
      } catch {
        // Skip malformed individual features
        continue;
      }
    }

    return results;
  } catch {
    // Never throw — TFR data is nice-to-have
    return [];
  }
}

// --- ReliefWeb Armed Conflict Reports ---
// Fetched from the /reports endpoint filtered by type "Armed Conflict".
// The reports API returns richer country location data than the disasters endpoint.

const CONFLICT_COUNTRY_COORDS: Record<string, [number, number]> = {
  afghanistan: [67.7, 33.9], albania: [20.2, 41.2], algeria: [3.0, 28.0],
  angola: [17.9, -11.2], armenia: [45.0, 40.1], azerbaijan: [47.6, 40.1],
  bangladesh: [90.4, 23.7], belarus: [28.0, 53.5], brazil: [-51.9, -14.2],
  burkina: [-1.6, 12.4], burundi: [29.9, -3.4], cameroon: [12.4, 3.9],
  'central african': [20.9, 6.6], chad: [18.7, 15.5], chile: [-71.5, -35.7],
  china: [104.2, 35.9], colombia: [-74.3, 4.6], congo: [15.8, -0.2],
  'democratic republic': [23.7, -2.9], drc: [23.7, -2.9],
  egypt: [30.8, 26.8], eritrea: [39.8, 15.2], ethiopia: [40.5, 9.1],
  georgia: [43.4, 42.3], guinea: [-11.8, 11.0], haiti: [-72.3, 18.9],
  india: [78.9, 20.6], indonesia: [113.9, -0.8], iran: [53.7, 32.4],
  iraq: [43.7, 33.2], israel: [34.9, 31.5], kenya: [37.9, 0.0],
  lebanon: [35.9, 33.9], libya: [17.2, 26.3], mali: [-2.0, 17.6],
  mexico: [-102.6, 23.6], moldova: [28.4, 47.4], morocco: [-7.1, 31.8],
  mozambique: [35.5, -18.7], myanmar: [95.9, 21.9], niger: [8.1, 17.6],
  nigeria: [8.7, 9.1], 'north korea': [127.5, 40.3], pakistan: [69.3, 30.4],
  palestine: [35.2, 31.9], panama: [-80.8, 8.5], philippines: [122.9, 12.9],
  russia: [105.3, 61.5], rwanda: [29.9, -1.9], sahel: [-2.0, 15.0],
  senegal: [-14.5, 14.5], serbia: [21.0, 44.0], 'sierra leone': [-11.8, 8.5],
  somalia: [46.2, 6.0], 'south sudan': [31.3, 7.9], spain: [-3.7, 40.4],
  sudan: [29.9, 15.6], syria: [38.6, 34.8], taiwan: [120.9, 23.7],
  tanzania: [34.9, -6.4], thailand: [101.0, 15.9], turkey: [35.2, 39.0],
  ukraine: [31.2, 49.0], uganda: [32.3, 1.4], venezuela: [-66.6, 6.4],
  'west bank': [35.2, 31.9], yemen: [48.5, 15.6], zambia: [27.9, -13.1],
};

function conflictCountryCoords(countryName: string): [number, number] | null {
  const lower = countryName.toLowerCase();
  for (const [key, coords] of Object.entries(CONFLICT_COUNTRY_COORDS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

function conflictReportSeverity(title: string, summary: string): Severity {
  const text = `${title} ${summary}`.toLowerCase();
  if (/offensive|battle|airstrike|bombardment|artillery|massacre/.test(text)) return 4;
  if (/violence|attack|clashes|fighting|killed|wounded|casualt/.test(text)) return 3;
  return 2;
}

export function normalizeReliefWebConflict(data: unknown): NormalizedEvent[] {
  const d = data as { data?: Array<Record<string, unknown>> };
  if (!d?.data) return [];

  const results: NormalizedEvent[] = [];

  for (const item of d.data) {
    const fields = item.fields as Record<string, unknown> | undefined;
    if (!fields) continue;

    const title = (fields.title as string) || 'Armed Conflict Report';
    const body = (fields.body as string) || '';
    const summary = body.replace(/<[^>]+>/g, '').trim().slice(0, 300);

    // Try to extract coordinates from primary_country.location
    let coordinates: [number, number] | null = null;
    const primaryCountry = fields.primary_country as Record<string, unknown> | undefined;
    if (primaryCountry) {
      const loc = primaryCountry.location as Record<string, unknown> | undefined;
      if (loc?.lat != null && loc?.lon != null) {
        coordinates = [loc.lon as number, loc.lat as number];
      }
      if (!coordinates) {
        const countryName = (primaryCountry.name as string) || '';
        coordinates = conflictCountryCoords(countryName);
      }
    }

    // Fall back: try country array
    if (!coordinates) {
      const countries = fields.country as Array<Record<string, unknown>> | undefined;
      if (countries?.length) {
        const first = countries[0];
        const loc = first.location as Record<string, unknown> | undefined;
        if (loc?.lat != null && loc?.lon != null) {
          coordinates = [loc.lon as number, loc.lat as number];
        }
        if (!coordinates) {
          coordinates = conflictCountryCoords((first.name as string) || '');
        }
      }
    }

    // Skip events with no usable location
    if (!coordinates) continue;

    const dateFields = fields.date as Record<string, unknown> | undefined;
    const timestamp =
      (dateFields?.created as string) ||
      (dateFields?.changed as string) ||
      new Date().toISOString();

    const urlAlias = (fields.url_alias as string) || '';
    const url = urlAlias
      ? `https://reliefweb.int${urlAlias}`
      : (fields.url as string) || undefined;

    const countryName = primaryCountry
      ? (primaryCountry.name as string) || 'Unknown'
      : 'Unknown';

    results.push({
      id: `rwconflict-${item.id}`,
      source: 'reliefweb' as const,
      category: 'conflict' as const,
      severity: conflictReportSeverity(title, summary),
      title,
      summary: summary || `Armed conflict report — ${countryName}`,
      coordinates,
      timestamp,
      url,
      metadata: {
        country: countryName,
        type: 'Armed Conflict',
      },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// GDELT article feed
// ---------------------------------------------------------------------------

/**
 * GDELT used to expose a geo endpoint that returned events with coordinates.
 * It was retired and now answers 404, so these come from the article endpoint
 * instead: headlines with a source country rather than a mapped location.
 *
 * An article whose country we cannot place is left out. The alternative is a
 * coordinate of [0, 0], which drops a pin in the Atlantic off west Africa and
 * makes the map look broken.
 */
export interface GdeltFeedItem {
  title: string;
  url?: string;
  domain?: string;
  country?: string;
  coordinates?: [number, number];
  timestamp: string;
  category: string;
  severity: number;
  stale?: boolean;
}

export function normalizeGdeltDoc(data: unknown): NormalizedEvent[] {
  const items = (data as { items?: GdeltFeedItem[] })?.items ?? [];
  const out: NormalizedEvent[] = [];

  items.forEach((a, i) => {
    const title = decodeHtmlEntities((a.title ?? '').trim());
    if (title.length < 12) return;

    // The collector already worked out where this is, down to the city where
    // the headline named one. Only fall back to a country centroid if an older
    // file is being read that predates the coordinates being sent.
    const coords =
      Array.isArray(a.coordinates) && a.coordinates.length === 2
        ? (a.coordinates as [number, number])
        : conflictCountryCoords(a.country ?? '');
    if (!coords) return;

    out.push({
      id: `gdelt-${a.category}-${i}-${a.timestamp}`,
      source: 'gdelt',
      category: a.category as NormalizedEvent['category'],
      severity: (Math.min(5, Math.max(1, a.severity || 2))) as Severity,
      title,
      summary: a.domain ? `${a.domain} — ${a.country}` : (a.country ?? 'GDELT'),
      coordinates: coords,
      timestamp: a.timestamp,
      url: a.url,
      metadata: { domain: a.domain, sourcecountry: a.country, category: a.category },
    });
  });

  return out;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
