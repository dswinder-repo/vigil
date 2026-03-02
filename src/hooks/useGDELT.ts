import { useQuery } from '@tanstack/react-query';
import { GDELT_QUERIES, POLL_GDELT, CORS_PROXIES } from '@/lib/constants';
import { normalizeGDELT } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useGDELT() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['gdelt-events'],
    queryFn: fetchAllGdeltCategories,
    refetchInterval: POLL_GDELT,
    staleTime: 840_000,
    retry: 1,
    retryDelay: 3_000,
  });
}

async function fetchGdeltWithProxy(url: string): Promise<string> {
  // Try direct fetch first
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('{')) return text;
    }
  } catch {
    // fall through to proxies
  }
  // Try each CORS proxy in sequence
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.startsWith('{')) return text;
    } catch {
      continue;
    }
  }
  throw new Error('GDELT: all proxies failed');
}

async function fetchAllGdeltCategories(): Promise<NormalizedEvent[]> {
  const results = await Promise.allSettled(
    GDELT_QUERIES.map(async ({ category, url }) => {
      const text = await fetchGdeltWithProxy(url);
      const data = JSON.parse(text);
      return normalizeGDELT(data, category);
    }),
  );

  // Merge all successful results
  const allEvents: NormalizedEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allEvents.push(...r.value);
  }

  // Deduplicate by coordinate proximity + title similarity
  return deduplicateEvents(allEvents);
}

function deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const seen = new Map<string, NormalizedEvent>();
  for (const ev of events) {
    // Round coords to ~1km grid for proximity grouping
    const gridKey = `${Math.round(ev.coordinates[0] * 10)},${Math.round(ev.coordinates[1] * 10)}`;
    const titleKey = ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    const dedupKey = `${gridKey}:${titleKey}`;
    const existing = seen.get(dedupKey);
    // Keep the higher-severity duplicate
    if (!existing || ev.severity > existing.severity) {
      seen.set(dedupKey, ev);
    }
  }
  return Array.from(seen.values());
}
