import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from '@/lib/types';

/**
 * News now comes from our own domain.
 *
 * It used to be fetched in the browser from ~20 outlets, which the browser is
 * not allowed to do directly, so it went through free public relay servers.
 * Those throttled us and failed silently. A scheduled job now collects
 * everything server-side every 15 minutes and writes /vigil/data/news.json.
 */
const FEED_URL = `${import.meta.env.BASE_URL}data/news.json`;

interface FeedFile {
  fetchedAt: string;
  sourcesOk: number;
  sourcesTotal: number;
  items: Array<{ title: string; url: string; source: string; timestamp: string; stale?: boolean }>;
}

export function useNewsFeed() {
  return useQuery<NewsItem[]>({
    queryKey: ['news-feed'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`news.json: ${res.status}`);
      const data = (await res.json()) as FeedFile;
      return (data.items ?? []).map((i, idx) => ({
        id: `news-${idx}-${i.timestamp}`,
        title: i.title,
        source: i.source,
        url: i.url,
        timestamp: i.timestamp,
      }));
    },
    // The file is rebuilt every 15 minutes; checking every 5 is plenty.
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: 2,
  });
}
