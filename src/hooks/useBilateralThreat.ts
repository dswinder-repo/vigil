import { useQuery } from '@tanstack/react-query';

/**
 * Bilateral attention index, collected server-side into /vigil/data/bilateral.json.
 *
 * This used to be measured in the browser, one call per country pair, through
 * public relay servers. When a call failed the pair was recorded as zero, so a
 * network problem read on screen as "no tension between Russia and Ukraine".
 * The scheduled job now measures every pair from a server, carries the last
 * good reading when a pair cannot be measured, and leaves a pair out entirely
 * rather than inventing a zero.
 */

export interface ThreatPair {
  id: string;
  a: string;
  b: string;
  score: number;    // 0-100, article volume over the last 24 hours
  articles: number; // raw article count
  trend: 'up' | 'stable' | 'down';
  stale?: boolean;  // carried from the previous run
}

const FEED_URL = `${import.meta.env.BASE_URL}data/bilateral.json`;

interface FeedFile {
  fetchedAt: string;
  failed?: boolean;
  items: ThreatPair[];
}

export function useBilateralThreat(): {
  data: ThreatPair[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery<ThreatPair[]>({
    queryKey: ['bilateral-threat'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`bilateral.json: ${res.status}`);
      const file = (await res.json()) as FeedFile;
      if (file.failed || !file.items?.length) throw new Error('bilateral index unavailable');
      return [...file.items].sort((a, b) => b.score - a.score);
    },
    refetchInterval: 900_000,
    staleTime: 840_000,
    retry: 2,
  });

  return { data, isLoading, isError };
}
