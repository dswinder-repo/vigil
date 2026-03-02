import type { EventCategory, CategoryFilter } from './types';

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  conflict: '#EF4444',
  disaster: '#F59E0B',
  disease: '#A855F7',
  political: '#3B82F6',
  cyber: '#06B6D4',
  unrest: '#F97316',
  humanitarian: '#EC4899',
};

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  conflict: 'Conflict',
  disaster: 'Disaster',
  disease: 'Disease',
  political: 'Political',
  cyber: 'Cyber',
  unrest: 'Unrest',
  humanitarian: 'Humanitarian',
};

export const DEFAULT_FILTERS: CategoryFilter[] = (
  Object.keys(CATEGORY_COLORS) as EventCategory[]
).map((cat) => ({
  category: cat,
  enabled: true,
  color: CATEGORY_COLORS[cat],
  label: CATEGORY_LABELS[cat],
}));

export const SEVERITY_RADIUS: Record<number, number> = {
  1: 4, 2: 6, 3: 8, 4: 11, 5: 15,
};

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const INITIAL_VIEW = { longitude: 0, latitude: 20, zoom: 2 };

// --- Event source endpoints ---
export const API_USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
export const API_EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';
// Category-specific GDELT queries — each query uses unambiguous, high-signal terms
// to minimize cross-category contamination. "virus", "disease", "protest", "war"
// (generic) are excluded because GDELT returns geographic context snippets, not full
// articles, so broad terms produce false positives.
const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/geo/geo?query=';
const GDELT_SUFFIX = '%20sourcelang%3Aenglish&format=GeoJSON&maxrows=100';
export const GDELT_QUERIES: Array<{ category: string; url: string }> = [
  // Active combat vocabulary — "besieged" removed (too metaphorical in business press).
  // Added modern warfare terms: artillery, missiles, drone strikes, ground offensive, etc.
  { category: 'conflict', url: `${GDELT_BASE}(airstrike%20OR%20airstrikes%20OR%20shelling%20OR%20frontline%20OR%20warzone%20OR%20bombardment%20OR%20counteroffensive%20OR%20invasion%20OR%20ceasefire%20OR%20casualties%20OR%20artillery%20OR%20missile%20OR%20missiles%20OR%20drone%20strike%20OR%20drone%20attack%20OR%20military%20offensive%20OR%20ground%20offensive%20OR%20troops%20deployed%20OR%20military%20operation%20OR%20escalation%20OR%20occupied%20territory%20OR%20arms%20shipment)${GDELT_SUFFIX}` },
  // High-intensity civil unrest — added martial law, state of emergency, mass arrests, curfew
  { category: 'unrest', url: `${GDELT_BASE}(riot%20OR%20coup%20OR%20uprising%20OR%20crackdown%20OR%20insurrection%20OR%20looting%20OR%20mutiny%20OR%20junta%20OR%20revolution%20OR%20martial%20law%20OR%20state%20of%20emergency%20OR%20mass%20arrests%20OR%20curfew)${GDELT_SUFFIX}` },
  // Cyber compound words — "vulnerability" removed (matches political/economic contexts)
  { category: 'cyber', url: `${GDELT_BASE}(cyberattack%20OR%20ransomware%20OR%20malware%20OR%20hackers%20OR%20hacking%20OR%20phishing%20OR%20cyberespionage%20OR%20spyware%20OR%20DDoS%20OR%20botnet)${GDELT_SUFFIX}` },
  // Specific pathogens only — "virus", "disease" removed (match computer virus, heart disease, etc.)
  { category: 'disease', url: `${GDELT_BASE}(outbreak%20OR%20epidemic%20OR%20cholera%20OR%20ebola%20OR%20mpox%20OR%20dengue%20OR%20measles%20OR%20tuberculosis%20OR%20influenza%20OR%20plague)${GDELT_SUFFIX}` },
  { category: 'disaster', url: `${GDELT_BASE}(earthquake%20OR%20tsunami%20OR%20hurricane%20OR%20flood%20OR%20wildfire%20OR%20eruption%20OR%20tornado%20OR%20cyclone%20OR%20typhoon%20OR%20avalanche)${GDELT_SUFFIX}` },
  // Humanitarian — added aid convoy, civilian casualties, war crimes, ethnic cleansing
  { category: 'humanitarian', url: `${GDELT_BASE}(famine%20OR%20starvation%20OR%20displacement%20OR%20refugees%20OR%20genocide%20OR%20atrocities%20OR%20malnutrition%20OR%20trafficking%20OR%20aid%20convoy%20OR%20civilian%20casualties%20OR%20war%20crimes%20OR%20ethnic%20cleansing)${GDELT_SUFFIX}` },
  // Political — dedicated query for significant political events
  { category: 'political', url: `${GDELT_BASE}(sanctions%20OR%20impeachment%20OR%20assassination%20OR%20referendum%20OR%20treaty%20OR%20embargo%20OR%20geopolitical)${GDELT_SUFFIX}` },
  // Naval / maritime conflict — excludes "warship", "naval fleet", "aircraft carrier" already in
  // API_GDELT_MILITARY; focuses on sea-battle events, blockades, and littoral combat.
  { category: 'conflict', url: `${GDELT_BASE}(naval%20blockade%20OR%20sea%20battle%20OR%20maritime%20conflict%20OR%20naval%20bombardment%20OR%20naval%20strike%20OR%20destroyer%20OR%20frigate%20OR%20submarine%20OR%20naval%20exercise%20OR%20naval%20clash%20OR%20littoral%20combat%20OR%20coast%20guard%20clash)${GDELT_SUFFIX}` },
  // Nuclear / WMD posturing — avoids "missile" (in main conflict query); focuses on
  // nuclear-specific vocabulary and WMD escalation signals.
  { category: 'conflict', url: `${GDELT_BASE}(nuclear%20threat%20OR%20nuclear%20weapons%20OR%20ICBM%20OR%20ballistic%20missile%20OR%20hypersonic%20missile%20OR%20nuclear%20deterrent%20OR%20warhead%20OR%20nuclear%20arsenal%20OR%20tactical%20nuclear%20OR%20strategic%20nuclear%20OR%20nuclear%20test%20OR%20dirty%20bomb)${GDELT_SUFFIX}` },
  // Economic warfare — avoids "sanctions" and "embargo" (in political query); targets
  // coercive economic instruments beyond conventional diplomacy.
  { category: 'political', url: `${GDELT_BASE}(trade%20war%20OR%20export%20controls%20OR%20arms%20embargo%20OR%20technology%20ban%20OR%20asset%20freeze%20OR%20SWIFT%20ban%20OR%20financial%20sanctions%20OR%20economic%20coercion%20OR%20supply%20chain%20attack%20OR%20investment%20ban%20OR%20tariff%20retaliation)${GDELT_SUFFIX}` },
];
// Keep legacy single URL for backward compat reference
export const API_GDELT = GDELT_QUERIES[0].url;
export const API_RELIEFWEB = 'https://api.reliefweb.int/v1/disasters?appname=vigil&limit=50&sort[]=date:desc';
export const API_NWS_ALERTS = 'https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe';

// --- Additional event sources ---
export const API_GDACS = 'https://www.gdacs.org/xml/rss.xml';
export const API_CISA_KEV = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
export const API_NASA_FIRMS = import.meta.env.VITE_FIRMS_API_KEY
  ? `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${import.meta.env.VITE_FIRMS_API_KEY}/VIIRS_SNPP_NRT/world/1`
  : '';
export const API_WHO_DON = 'https://www.who.int/feeds/entity/don/en/rss.xml';
export const API_NOAA_SPACE_WEATHER = 'https://services.swpc.noaa.gov/products/alerts.json';

// --- Market endpoints ---
export const API_COINGECKO = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd&include_24hr_change=true';
export const API_MANIFOLD = 'https://api.manifold.markets/v0/search-markets?sort=score&filter=open&limit=20';
export const API_POLYMARKET = 'https://gamma-api.polymarket.com/markets?closed=false&limit=20';
export const API_KALSHI = 'https://trading-api.kalshi.com/trade-api/v2/markets';

// --- RSS News feeds (fetched via CORS proxy) ---
export const RSS_FEEDS = [
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-topnews' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/' },
  { name: 'ISW', url: 'https://www.understandingwar.org/feeds/news.xml' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss' },
  { name: 'DW World', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { name: 'Atlantic Council', url: 'https://www.atlanticcouncil.org/feed/' },
  { name: 'CFR', url: 'https://www.cfr.org/rss/regions/global' },
  { name: 'Carnegie', url: 'https://carnegieendowment.org/rss/solr/?fa=all&type=external' },
  { name: 'Chatham House', url: 'https://www.chathamhouse.org/rss.xml' },
  { name: 'Crisis Group ICG', url: 'https://www.crisisgroup.org/rss.xml' },
  { name: 'Long War Journal', url: 'https://www.longwarjournal.org/feed' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/' },
  { name: 'Lawfare', url: 'https://www.lawfaremedia.org/feeds/all' },
  { name: 'ProPublica', url: 'https://feeds.propublica.org/propublica/main' },
  { name: 'RFI English', url: 'https://en.rfi.fr/rss' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss' },
];

export const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];
export const CORS_PROXY = CORS_PROXIES[0];

// --- Yahoo Finance (via CORS proxy) ---
export const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export const GLOBAL_MARKET_SYMBOLS = [
  'SPY', 'QQQ', 'DIA', 'IWM',
  'VGK', 'EWJ', 'FXI', 'EWZ', 'EEM',
  'TLT', 'IEF',
  'GLD', 'SLV', 'USO', 'UNG', 'COPX', 'REMX', 'LIT',
  'VIXY', 'UUP',
  'BTC-USD', 'ETH-USD',
  'DX-Y.NYB', 'XLE', 'XLF',
];

// --- OSINT RSS sources (real RSS feeds from defense/intel outlets) ---
export const OSINT_RSS_FEEDS = [
  { account: 'Bellingcat', name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/' },
  { account: 'TheWarZone', name: 'The War Zone', url: 'https://www.thedrive.com/the-war-zone/feed' },
  { account: 'DefenseOne', name: 'Defense One', url: 'https://www.defenseone.com/rss/all/' },
  { account: 'BreakingDef', name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/' },
  { account: 'Janes', name: 'Janes', url: 'https://www.janes.com/feeds/news' },
  { account: 'ArmsControl', name: 'Arms Control Wonk', url: 'https://www.armscontrolwonk.com/feed/' },
  { account: 'Liveuamap', name: 'Liveuamap', url: 'https://liveuamap.com/rss' },
  { account: 'CSIS', name: 'CSIS Analysis', url: 'https://www.csis.org/analysis/feed' },
  { account: 'DefenseNews', name: 'Defense News', url: 'https://www.defensenews.com/rss/' },
  { account: 'NavalNews', name: 'Naval News', url: 'https://www.navalnews.com/feed/' },
  { account: 'AirForceMag', name: 'Air Force Magazine', url: 'https://www.airforcemag.com/feed/' },
  { account: 'C4ISRNET', name: 'C4ISRNET', url: 'https://www.c4isrnet.com/rss/' },
  { account: 'MilTimes', name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/category/news/' },
  { account: 'TaskPurpose', name: 'Task & Purpose', url: 'https://taskandpurpose.com/feed/' },
  { account: 'SOFREP', name: 'SOFREP', url: 'https://sofrep.com/feed/' },
  { account: 'NatDefMag', name: 'National Defense', url: 'https://www.nationaldefensemagazine.org/rss/articles' },
  { account: 'RAND', name: 'RAND', url: 'https://www.rand.org/pubs/rss.xml' },
  { account: 'Brookings', name: 'Brookings', url: 'https://www.brookings.edu/wp-json/wp/v2/posts?_embed&per_page=20&format=rss' },
  { account: 'SIPRI', name: 'SIPRI', url: 'https://www.sipri.org/news/rss.xml' },
  { account: 'HRW', name: 'Human Rights Watch', url: 'https://www.hrw.org/rss' },
  { account: 'Amnesty', name: 'Amnesty International', url: 'https://www.amnesty.org/en/feed/' },
  { account: 'ReliefWebSpot', name: 'ReliefWeb Updates', url: 'https://reliefweb.int/updates/rss.xml' },
  { account: 'KrebsSec', name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
  { account: 'Threatpost', name: 'Threatpost', url: 'https://threatpost.com/feed/' },
  { account: 'DarkReading', name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
  { account: 'SpaceNews', name: 'Space News', url: 'https://spacenews.com/feed/' },
  { account: 'ArsTech', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
];

// --- Military / Shipping ---
// DOC artlist mode returns actual article headlines (vs GeoJSON which returns place names)
export const API_GDELT_MILITARY =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=(aircraft+carrier+OR+naval+fleet+OR+military+deployment+OR+troops+deploy+OR+missile+strike+OR+military+exercise+OR+warship+OR+airstrike+OR+military+operation+OR+carrier+strike+group+OR+fighter+jet+OR+submarine+OR+amphibious+assault)&mode=artlist&maxrecords=75&sort=datedesc&format=json&sourcelang=english&TIMESPAN=1440';

export const API_NUCLEAR_ACTIVITY =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=%22nuclear%22%20OR%20%22radiation%22%20OR%20%22IAEA%22%20OR%20%22radioactive%22%20OR%20%22nuclear%20reactor%22%20OR%20%22enrichment%22%20OR%20%22weapons%20grade%22%20OR%20%22dirty%20bomb%22%20OR%20%22nuclear%20test%22&mode=artlist&maxrecords=50&timespan=1440&sort=DateDesc&format=json';

// --- Poll intervals (ms) ---
export const POLL_MILITARY = 300_000;
export const POLL_NUCLEAR = 300_000;
export const POLL_USGS = 60_000;
export const POLL_EONET = 300_000;
export const POLL_GDELT = 900_000;
export const POLL_RELIEFWEB = 300_000;
export const POLL_NWS = 120_000;
export const POLL_COINGECKO = 60_000;
export const POLL_MANIFOLD = 120_000;
export const POLL_POLYMARKET = 120_000;
export const POLL_KALSHI = 5 * 60 * 1000; // 5 minutes
export const POLL_OSINT = 300_000;
export const POLL_NEWS = 300_000;
export const POLL_GLOBAL_MARKETS = 60_000;
export const POLL_GDACS = 300_000;
export const POLL_CISA = 3_600_000; // hourly — CISA KEV updates ~daily
export const POLL_FIRMS = 300_000;
export const POLL_WHO = 600_000;
export const POLL_SPACE_WEATHER = 300_000;

export const API_METEOALARM = 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-meteoalarm';
export const POLL_METEOALARM = 600_000; // 10 minutes

// --- FAA Temporary Flight Restrictions ---
export const API_FAA_TFR = 'https://tfr.faa.gov/tfr2/tfr_feed_geojson.json';
export const POLL_FAA_TFR = 900_000; // 15 minutes
