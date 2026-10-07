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

// Opens on the whole world rather than Europe and Africa; the Americas and
// Asia were off the edge of the pane at zoom 2.
export const INITIAL_VIEW = { longitude: 10, latitude: 25, zoom: 1.4 };

// --- Event source endpoints ---
// ---------------------------------------------------------------------------
// Server-side snapshots
// ---------------------------------------------------------------------------
// The sources below refuse requests that come from a browser. The dashboard
// used to route them through free public relay servers, which throttled, went
// down, and returned error pages that looked like success — which is why
// panels kept emptying for no visible reason.
//
// A scheduled job now copies each source every fifteen minutes into
// vigil/data/raw/ and the dashboard reads its own domain instead. See
// scripts/fetch-feeds.mjs and .github/workflows/feeds.yml.
const SNAP = `${import.meta.env.BASE_URL}data/raw/`;

export const API_USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
export const API_EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';
// Category-specific GDELT queries — each query uses unambiguous, high-signal terms
// to minimize cross-category contamination. "virus", "disease", "protest", "war"
// (generic) are excluded because GDELT returns geographic context snippets, not full
// articles, so broad terms produce false positives.
// One file, written by the scheduled job, with each item already sorted into
// a category. GDELT's geo endpoint was retired; see scripts/fetch-feeds.mjs.
export const GDELT_FEED_URL = `${import.meta.env.BASE_URL}data/world.json`;
export const HOTSPOTS_URL = `${import.meta.env.BASE_URL}data/hotspots.json`;
// Keep legacy single URL for backward compat reference
export const API_GDELT = GDELT_FEED_URL;
export const API_RELIEFWEB = SNAP + 'reliefweb-disasters.json';
export const API_NWS_ALERTS = 'https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe';

// --- Additional event sources ---
export const API_GDACS = SNAP + 'gdacs.xml';
export const API_CISA_KEV = SNAP + 'cisa-kev.json';
// NASA's public 24-hour fire file needs no key. The feed job downloads it and
// keeps the 400 strongest detections in data/raw/firms.csv.
export const API_NASA_FIRMS = `${import.meta.env.BASE_URL}data/raw/firms.csv`;
export const API_WHO_DON = SNAP + 'who-don.xml';
export const API_NOAA_SPACE_WEATHER = 'https://services.swpc.noaa.gov/products/alerts.json';

// --- Market endpoints ---
export const API_COINGECKO = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd&include_24hr_change=true';
export const API_POLYMARKET = SNAP + 'polymarket.json';

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

export const API_NUCLEAR_ACTIVITY = GDELT_FEED_URL;

// --- Poll intervals (ms) ---
export const POLL_MILITARY = 300_000;
export const POLL_NUCLEAR = 300_000;
export const POLL_USGS = 60_000;
export const POLL_EONET = 300_000;
export const POLL_GDELT = 900_000;
export const POLL_RELIEFWEB = 300_000;
export const POLL_NWS = 120_000;
export const POLL_COINGECKO = 60_000;
export const POLL_POLYMARKET = 120_000;
export const POLL_OSINT = 300_000;
export const POLL_NEWS = 300_000;
export const POLL_GLOBAL_MARKETS = 60_000;
export const POLL_GDACS = 300_000;
export const POLL_CISA = 3_600_000; // hourly — CISA KEV updates ~daily
export const POLL_FIRMS = 300_000;
export const POLL_WHO = 600_000;
export const POLL_SPACE_WEATHER = 300_000;

export const API_METEOALARM = SNAP + 'meteoalarm.json';
export const POLL_METEOALARM = 600_000; // 10 minutes

// --- FAA Temporary Flight Restrictions ---
export const API_FAA_TFR = SNAP + 'faa-tfr.json';
export const POLL_FAA_TFR = 900_000; // 15 minutes
