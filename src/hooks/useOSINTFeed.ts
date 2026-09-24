import { useQuery } from '@tanstack/react-query';
import type { OSINTPost } from '@/lib/types';

/** Collected server-side every 15 minutes into /vigil/data/osint.json. */
const FEED_URL = `${import.meta.env.BASE_URL}data/osint.json`;

interface FeedFile {
  fetchedAt: string;
  sourcesOk: number;
  sourcesTotal: number;
  items: Array<{ title: string; url: string; source: string; timestamp: string; stale?: boolean }>;
}

export function useOSINTFeed() {
  return useQuery<OSINTPost[]>({
    queryKey: ['osint-feed'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`osint.json: ${res.status}`);
      const data = (await res.json()) as FeedFile;
      return (data.items ?? []).map((i, idx) => ({
        id: `osint-${idx}-${i.timestamp}`,
        account: i.source,
        text: i.title,
        timestamp: i.timestamp,
        url: i.url,
      }));
    },
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: 2,
  });
}
