import { useQuery } from '@tanstack/react-query';
import type { MilitaryEvent } from '@/lib/types';

/**
 * Military activity, collected server-side into /vigil/data/military.json.
 *
 * GDELT is the preferred source but refuses traffic from data centres, so the
 * scheduled job falls back to a second source when it does. Either way this
 * panel gets real items — it must never render "no military events" because a
 * network call failed.
 */
const FEED_URL = `${import.meta.env.BASE_URL}data/military.json`;

interface FeedFile {
  fetchedAt: string | null;
  failed?: boolean;
  fallback?: boolean;
  items: Array<{
    title: string;
    url: string;
    source: string;
    timestamp: string;
    country?: string | null;
    stale?: boolean;
  }>;
}

/** Requires a hard operational term, and rejects obvious off-topic matches. */
const HARD_MILITARY_TERMS = [
  /\b(airstrike|air strike|airstrikes)\b/i,
  /\b(missile|missiles|ballistic|cruise missile)\b/i,
  /\b(warship|aircraft carrier|destroyer|frigate|submarine|corvette|fleet)\b/i,
  /\b(military operation|military offensive|combat operation)\b/i,
  /\b(artillery|shelling|bombardment|mortar|rocket fire)\b/i,
  /\b(troops deployed|deployment|troop movement|troop surge)\b/i,
  /\b(drone strike|UAV strike|kamikaze drone)\b/i,
  /\b(invasion|incursion|counteroffensive|offensive)\b/i,
  /\b(NATO exercise|military exercise|war game|wargame)\b/i,
  /\b(special forces|infantry|battalion|brigade|regiment)\b/i,
  /\b(naval blockade|sea mine|torpedo|naval patrol)\b/i,
  /\b(fighter jet|F-35|F-16|B-52|bomber|sortie|air patrol)\b/i,
  /\b(nuclear submarine|carrier strike group|battle group)\b/i,
  /\b(killed in action|casualties|death toll)\b/i,
  /\b(ceasefire|armistice|truce)\b/i,
  /\b(Pentagon|CENTCOM|NATO|INDOPACOM|EUCOM|DoD)\b/,
  /\b(warzone|war zone|front line|frontline|battlefield)\b/i,
];

const NOISE = [
  /\b(sports|game|team|player|coach|league|championship|playoff|score)\b/i,
  /\b(earnings|revenue|profit|stock price|market cap|IPO|quarterly)\b/i,
  /\b(movie|film|actor|actress|celebrity|award|Oscar|Grammy)\b/i,
  /\b(recipe|restaurant|chef|dining|cuisine)\b/i,
];

const isClearlyMilitary = (t: string) =>
  HARD_MILITARY_TERMS.some((re) => re.test(t)) && !NOISE.some((re) => re.test(t));

function classify(title: string): MilitaryEvent['type'] {
  if (/\b(airstrike|air strike|bomber|fighter jet|sortie|drone strike|air patrol)\b/i.test(title))
    return 'air';
  if (/\b(warship|carrier|destroyer|frigate|submarine|naval|fleet|torpedo|blockade)\b/i.test(title))
    return 'naval';
  if (/\b(missile|strike|shelling|bombardment|artillery|rocket fire)\b/i.test(title)) return 'strike';
  if (/\b(exercise|war game|wargame|drill)\b/i.test(title)) return 'exercise';
  if (/\b(deploy|deployment|troop surge|reinforce)\b/i.test(title)) return 'deployment';
  if (/\b(advance|withdraw|retreat|movement|incursion|offensive)\b/i.test(title)) return 'movement';
  return 'general';
}

export function useMilitaryTracker() {
  return useQuery<MilitaryEvent[]>({
    queryKey: ['military-tracker'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`military.json: ${res.status}`);
      const data = (await res.json()) as FeedFile;

      // The job marks the file failed when every source was unreachable.
      // Surfacing that as an error is what lets the panel say "source
      // unavailable" instead of claiming there is no military activity.
      if (data.failed && !data.items?.length) throw new Error('military feed unavailable');

      const events = (data.items ?? [])
        .filter((a) => a.title && a.title.length >= 10 && isClearlyMilitary(a.title))
        .map((a, i) => ({
          id: `mil-${i}-${a.timestamp}`,
          title: a.title,
          summary: a.source || 'Military/Defense',
          coordinates: [0, 0] as [number, number], // ticker does not plot these
          timestamp: a.timestamp,
          url: a.url,
          type: classify(a.title),
          region: a.country || 'Global',
        }));

      // If the strict filter removes everything, show the unfiltered items
      // rather than an empty panel that reads as "nothing is happening".
      if (!events.length && data.items?.length) {
        return data.items.slice(0, 40).map((a, i) => ({
          id: `mil-raw-${i}-${a.timestamp}`,
          title: a.title,
          summary: a.source || 'Military/Defense',
          coordinates: [0, 0] as [number, number],
          timestamp: a.timestamp,
          url: a.url,
          type: classify(a.title),
          region: a.country || 'Global',
        }));
      }
      return events;
    },
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: 2,
  });
}
