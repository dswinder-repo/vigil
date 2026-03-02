import { useQuery } from '@tanstack/react-query';
import { XMLParser } from 'fast-xml-parser';
import { RSS_FEEDS, CORS_PROXIES, POLL_NEWS } from '@/lib/constants';
import type { NewsItem } from '@/lib/types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export function useNewsFeed() {
  return useQuery({
    queryKey: ['news-feed'],
    queryFn: async () => {
      const results = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchFeed(feed.name, feed.url))
      );

      const items: NewsItem[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          items.push(...result.value);
        }
      }

      // Sort by timestamp descending, take top 50
      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      return items.slice(0, 50);
    },
    refetchInterval: POLL_NEWS,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 2_000,
  });
}

async function fetchFeed(
  sourceName: string,
  url: string
): Promise<NewsItem[]> {
  // Try each CORS proxy in order until one works
  let text = '';
  let fetched = false;
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      text = await res.text();
      if (text && text.length > 100) { fetched = true; break; }
    } catch { /* try next proxy */ }
  }
  if (!fetched) throw new Error(`RSS ${sourceName}: all proxies failed`);

  try {
    const parsed = parser.parse(text);
    // Handle both RSS 2.0 and Atom formats
    const channel = parsed?.rss?.channel;
    const atomFeed = parsed?.feed;

    if (channel?.item) {
      const rawItems = Array.isArray(channel.item)
        ? channel.item
        : [channel.item];
      return rawItems.slice(0, 15).map(
        (item: Record<string, unknown>, i: number) => ({
          id: `news-${sourceName}-${i}`,
          title: stripHtml(String(item.title || '')),
          source: sourceName,
          url: String(item.link || ''),
          timestamp: parseDate(item.pubDate as string),
        })
      );
    }

    if (atomFeed?.entry) {
      const entries = Array.isArray(atomFeed.entry)
        ? atomFeed.entry
        : [atomFeed.entry];
      return entries.slice(0, 15).map(
        (entry: Record<string, unknown>, i: number) => {
          const link = entry.link as
            | { '@_href'?: string }
            | Array<{ '@_href'?: string }>
            | string;
          let href = '';
          if (typeof link === 'string') {
            href = link;
          } else if (Array.isArray(link)) {
            href = link[0]?.['@_href'] || '';
          } else if (link) {
            href = link['@_href'] || '';
          }
          return {
            id: `news-${sourceName}-${i}`,
            title: stripHtml(String(entry.title || '')),
            source: sourceName,
            url: href,
            timestamp: parseDate(
              (entry.updated as string) || (entry.published as string)
            ),
          };
        }
      );
    }

    return [];
  } catch {
    return [];
  }
}

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
