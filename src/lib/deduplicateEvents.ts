import type { NormalizedEvent } from './types';

/**
 * Deduplicate events across multiple sources.
 * Two events are considered duplicates if:
 * 1. They share the same category
 * 2. Their coordinates are within COORD_THRESHOLD degrees of each other
 * 3. They occurred within TIME_WINDOW_MS of each other
 * 4. Their titles have a Jaccard similarity above TITLE_SIMILARITY_THRESHOLD
 *
 * When duplicates are found, the event with the HIGHEST severity is kept.
 * If severity is equal, prefer the event from the highest-priority source.
 */

const COORD_THRESHOLD = 0.5; // ~55km at equator
const TIME_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const TITLE_SIMILARITY_THRESHOLD = 0.25; // Jaccard similarity

const SOURCE_PRIORITY: Record<string, number> = {
  usgs: 10,
  gdacs: 9,
  reliefweb: 8,
  eonet: 7,
  gdelt: 6,
  nws: 5,
  meteoalarm: 5,
  'nasa-firms': 4,
  firms: 4,
  who: 4,
  'space-weather': 3,
  cisa: 3,
};

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function coordDistance(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

function preferredEvent(a: NormalizedEvent, b: NormalizedEvent): NormalizedEvent {
  if (a.severity !== b.severity) {
    return a.severity > b.severity ? a : b;
  }
  const aPriority = SOURCE_PRIORITY[a.source] ?? 0;
  const bPriority = SOURCE_PRIORITY[b.source] ?? 0;
  return aPriority >= bPriority ? a : b;
}

export function deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  // Split events by whether they have valid coordinates for spatial deduplication
  const withCoords: NormalizedEvent[] = [];
  const noCoords: NormalizedEvent[] = [];

  for (const ev of events) {
    const [lng, lat] = ev.coordinates;
    if (
      lng !== undefined &&
      lat !== undefined &&
      !isNaN(lng) &&
      !isNaN(lat) &&
      // [0, 0] coordinates are often placeholder/missing data — treat as no-coords
      !(lng === 0 && lat === 0)
    ) {
      withCoords.push(ev);
    } else {
      noCoords.push(ev);
    }
  }

  // Sort by timestamp descending so we prefer newer events when all else is equal
  const sorted = [...withCoords].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const kept: NormalizedEvent[] = [];
  const merged = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (merged.has(sorted[i].id)) continue;
    let winner = sorted[i];

    for (let j = i + 1; j < sorted.length; j++) {
      if (merged.has(sorted[j].id)) continue;
      const candidate = sorted[j];

      // The world feed is de-duplicated on the server, story by story. Stories
      // about one country sit close together on purpose, so comparing them
      // here only merged different stories (ten Iran headlines became one).
      if (winner.source === 'gdelt' && candidate.source === 'gdelt') continue;

      // Must be same category
      if (winner.category !== candidate.category) continue;

      // Must be within time window
      const timeDiff = Math.abs(
        new Date(winner.timestamp).getTime() - new Date(candidate.timestamp).getTime(),
      );
      if (timeDiff > TIME_WINDOW_MS) continue;

      // Must be spatially close
      const [wLng, wLat] = winner.coordinates;
      const [cLng, cLat] = candidate.coordinates;
      const dist = coordDistance(wLng, wLat, cLng, cLat);
      if (dist > COORD_THRESHOLD) continue;

      // Must have title similarity above threshold
      const tokensA = tokenize(winner.title);
      const tokensB = tokenize(candidate.title);
      const sim = jaccardSimilarity(tokensA, tokensB);
      if (sim < TITLE_SIMILARITY_THRESHOLD) continue;

      // It's a duplicate — merge
      merged.add(candidate.id);
      winner = preferredEvent(winner, candidate);
    }

    kept.push(winner);
  }

  return [...kept, ...noCoords];
}
