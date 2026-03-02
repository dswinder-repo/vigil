import { useQuery } from '@tanstack/react-query';
import { API_GDELT_MILITARY, POLL_MILITARY, CORS_PROXIES } from '@/lib/constants';
import type { MilitaryEvent } from '@/lib/types';

/**
 * Fetches military-related events from GDELT DOC API (artlist mode).
 * Applies strict isClearlyMilitary() filter to ensure only genuine military
 * operational reporting passes through (not tangential mentions).
 * Returns article headlines. Uses CORS proxy fallback chain.
 */
export function useMilitaryTracker() {
  return useQuery({
    queryKey: ['military-tracker'],
    queryFn: fetchMilitaryEvents,
    refetchInterval: POLL_MILITARY,
    staleTime: 120_000,
    retry: 1,
    retryDelay: 2_000,
    placeholderData: [],
  });
}

type GdeltArticle = {
  url: string;
  title: string;
  domain: string;
  seendate: string;
  sourcecountry: string;
};

/**
 * Strict filter: requires at least one "hard" military operational term.
 * Rejects tangential mentions (company earnings, sports teams, historical pieces).
 */
const HARD_MILITARY_TERMS = [
  /\b(airstrike|air strike|airstrikes)\b/i,
  /\b(missile|missiles|ballistic|cruise missile)\b/i,
  /\b(warship|aircraft carrier|destroyer|frigate|submarine|corvette|fleet)\b/i,
  /\b(military operation|military offensive|combat operation)\b/i,
  /\b(artillery|shelling|bombardment|mortar|rocket fire)\b/i,
  /\b(troops deployed|deployment|troop movement|troop surge)\b/i,
  /\b(drone strike|UAV strike|kamikaze drone)\b/i,
  /\b(invasion|incursion|counteroffensive|offensive|advance|retreat)\b/i,
  /\b(NATO exercise|military exercise|war game|wargame)\b/i,
  /\b(special forces|infantry|battalion|brigade|regiment)\b/i,
  /\b(naval blockade|sea mine|torpedo|naval patrol)\b/i,
  /\b(fighter jet|F-35|F-16|B-52|bomber|sortie|air patrol)\b/i,
  /\b(nuclear submarine|carrier strike group|battle group)\b/i,
  /\b(sanctions military|arms embargo|weapons shipment|ammunition|weapon)\b/i,
  /\b(killed in action|casualties|wounded|death toll)\b/i,
  /\b(ceasefire|peace deal|armistice|truce)\b/i,
  /\b(Pentagon|CENTCOM|NATO|INDOPACOM|EUCOM|DoD)\b/,
  /\b(warzone|war zone|front line|frontline|battlefield)\b/i,
];

const MILITARY_NOISE_FILTERS = [
  /\b(sports|game|team|player|coach|league|championship|tournament|playoff|match|score)\b/i,
  /\b(earnings|revenue|profit|stock price|market cap|IPO|quarterly)\b/i,
  /\b(movie|film|actor|actress|celebrity|award|Oscar|Grammy)\b/i,
  /\b(recipe|restaurant|food|chef|dining|cuisine)\b/i,
];

function isClearlyMilitary(title: string): boolean {
  // Must have at least one hard military term
  if (!HARD_MILITARY_TERMS.some((re) => re.test(title))) return false;
  // Reject if noise term dominates context
  if (MILITARY_NOISE_FILTERS.some((re) => re.test(title))) return false;
  return true;
}

async function fetchMilitaryEvents(): Promise<MilitaryEvent[]> {
  let text: string | null = null;

  // Try direct fetch first
  try {
    const res = await fetch(API_GDELT_MILITARY, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const t = await res.text();
      if (t.trim().startsWith('{')) text = t;
    }
  } catch {
    // fall through to proxies
  }

  // Try CORS proxies
  if (!text) {
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy + encodeURIComponent(API_GDELT_MILITARY), {
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const t = await res.text();
        if (t.trim().startsWith('{')) { text = t; break; }
      } catch {
        continue;
      }
    }
  }

  if (!text) throw new Error('Military tracker: all fetches failed');

  const data = JSON.parse(text) as { articles?: GdeltArticle[] };
  if (!data?.articles?.length) return [];

  return data.articles
    .filter((a) => {
      if (!a.title || a.title.length < 10) return false;
      if (/^ERROR:/i.test(a.title)) return false;
      return isClearlyMilitary(a.title);
    })
    .map((a, i) => {
      const title = decodeEntities(a.title);
      return {
        id: `mil-${a.seendate || i}-${i}`,
        title,
        summary: a.domain || 'Military/Defense',
        // DOC API has no coordinates — MilitaryTicker doesn't use them
        coordinates: [0, 0] as [number, number],
        timestamp: a.seendate ? formatGdeltDate(a.seendate) : new Date().toISOString(),
        url: a.url,
        type: classifyMilitaryType(title),
        region: classifyRegion(title, a.sourcecountry),
      };
    })
    .slice(0, 75);
}

function classifyMilitaryType(title: string): MilitaryEvent['type'] {
  const lower = title.toLowerCase();
  if (/aircraft carrier|destroyer|frigate|warship|naval|fleet|submarine|navy/.test(lower))
    return 'naval';
  if (/airstrike|airstrike|bomber|fighter jet|f-35|f-16|sortie|air force|airforce|aerial/.test(lower))
    return 'air';
  if (/deploy|troops|soldiers|battalion|brigade|infantry|amphibious/.test(lower)) return 'deployment';
  if (/exercise|drill|maneuver|nato exercise|training/.test(lower)) return 'exercise';
  if (/missile|strike|bomb|attack|shelling/.test(lower)) return 'strike';
  if (/movement|convoy|advance|withdraw|repositioning/.test(lower)) return 'movement';
  return 'general';
}

function classifyRegion(title: string, sourcecountry: string): string {
  const lower = title.toLowerCase();
  // Keyword-based from article headline (most reliable)
  if (/iran|tehran|persian gulf|hormuz/.test(lower)) return 'Middle East';
  if (/ukraine|russia|moscow|kyiv|donbas|crimea|zaporizhzhia/.test(lower)) return 'Eastern Europe';
  if (/china|taiwan|south china sea|beijing|indo-pacific|pla/.test(lower)) return 'Indo-Pacific';
  if (/korea|pyongyang|dprk|north korea/.test(lower)) return 'Korean Peninsula';
  if (/africa|sahel|somalia|niger|mali|sudan|ethiopia/.test(lower)) return 'Africa';
  if (/syria|iraq|yemen|houthi|red sea|israel|gaza|lebanon|hezbollah/.test(lower)) return 'Middle East';
  if (/nato|poland|finland|estonia|latvia|lithuania|baltics/.test(lower)) return 'Europe';
  if (/philippines|japan|south china|pacific|guam|taiwan strait/.test(lower)) return 'Indo-Pacific';
  if (/venezuela|colombia|mexico|latin america/.test(lower)) return 'Americas';

  // Fallback: GDELT sourcecountry code (mix of FIPS and ISO)
  const sc = (sourcecountry || '').toUpperCase();
  if (/^(RS|RU|UP|BY|RUS|UKR|BLR)/.test(sc)) return 'Eastern Europe';
  if (/^(CH|TW|JA|KS|CHN|TWN|JPN|KOR)/.test(sc)) return 'Indo-Pacific';
  if (/^(IR|IZ|SA|SY|YM|IS|IRN|IRQ|SAU|SYR|YEM|ISR)/.test(sc)) return 'Middle East';
  return 'Global';
}

function formatGdeltDate(dateStr: string): string {
  // Handles both "20240301T120000Z" and "20240301120000"
  const s = dateStr.replace('T', '').replace('Z', '');
  if (s.length >= 14) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  }
  return new Date().toISOString();
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
