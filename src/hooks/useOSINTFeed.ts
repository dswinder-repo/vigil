import { useQuery } from '@tanstack/react-query';
import { XMLParser } from 'fast-xml-parser';
import { OSINT_RSS_FEEDS, CORS_PROXIES, POLL_OSINT } from '@/lib/constants';
import type { OSINTPost } from '@/lib/types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

// GDELT GKG (Global Knowledge Graph) as fallback OSINT source
const GDELT_OSINT_URL =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=(OSINT%20OR%20military%20OR%20intelligence%20OR%20conflict%20OR%20geopolitical)%20sourcelang:eng&mode=ArtList&maxrecords=25&format=json';

export function useOSINTFeed() {
  return useQuery({
    queryKey: ['osint-feed'],
    queryFn: async () => {
      // Try RSS feeds first
      const rssResults = await Promise.allSettled(
        OSINT_RSS_FEEDS.map((feed) =>
          fetchOSINTRSS(feed.account, feed.url)
        )
      );

      const posts: OSINTPost[] = [];
      for (const result of rssResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          posts.push(...result.value);
        }
      }

      // If RSS yielded few results, supplement with GDELT articles
      if (posts.length < 5) {
        try {
          const gdeltPosts = await fetchGDELTOSINT();
          posts.push(...gdeltPosts);
        } catch {
          // silent fallback failure
        }
      }

      // Deduplicate by id, sort by timestamp
      const seen = new Set<string>();
      const unique = posts.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      unique.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return unique.slice(0, 30);
    },
    refetchInterval: POLL_OSINT,
    retry: 1,
  });
}

async function fetchOSINTRSS(
  account: string,
  url: string
): Promise<OSINTPost[]> {
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
  if (!fetched) return [];

  try {
    const parsed = parser.parse(text);
    const channel = parsed?.rss?.channel;
    const atomFeed = parsed?.feed;

    if (channel?.item) {
      const items = Array.isArray(channel.item)
        ? channel.item
        : [channel.item];
      return items.slice(0, 8).map(
        (item: Record<string, unknown>, i: number) => ({
          id: `osint-${account}-${i}`,
          account,
          text: stripHtml(
            String(
              item.title || item.description || ''
            )
          ).slice(0, 280),
          timestamp: parseDate(item.pubDate as string),
          url: String(item.link || ''),
        })
      );
    }

    if (atomFeed?.entry) {
      const entries = Array.isArray(atomFeed.entry)
        ? atomFeed.entry
        : [atomFeed.entry];
      return entries.slice(0, 8).map(
        (entry: Record<string, unknown>, i: number) => {
          const link = entry.link as
            | { '@_href'?: string }
            | Array<{ '@_href'?: string }>
            | string;
          let href = '';
          if (typeof link === 'string') href = link;
          else if (Array.isArray(link)) href = link[0]?.['@_href'] || '';
          else if (link) href = link['@_href'] || '';
          return {
            id: `osint-${account}-${i}`,
            account,
            text: stripHtml(String(entry.title || entry.summary || '')).slice(
              0,
              280
            ),
            timestamp: parseDate(
              (entry.updated as string) || (entry.published as string)
            ),
            url: href,
          };
        }
      );
    }

    return [];
  } catch {
    return [];
  }
}

async function fetchGDELTOSINT(): Promise<OSINTPost[]> {
  let data: unknown = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(GDELT_OSINT_URL)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      data = await res.json();
      if (data) break;
    } catch { /* try next proxy */ }
  }
  if (!data) return [];

  const articles = (data as Record<string, unknown>)?.articles as Array<Record<string, unknown>> | undefined;
  if (!articles) return [];

  return articles.slice(0, 15).map((article, i) => ({
    id: `osint-gdelt-${i}`,
    account: `@${(article.domain as string) || 'GDELT'}`,
    text: stripHtml(String(article.title || '')).slice(0, 280),
    timestamp: parseDate(article.seendate as string),
    url: String(article.url || ''),
  }));
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
    // Handle GDELT format: "20260228T150000Z"
    if (/^\d{8}T\d{6}Z?$/.test(dateStr)) {
      const y = dateStr.slice(0, 4);
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      const h = dateStr.slice(9, 11);
      const min = dateStr.slice(11, 13);
      const s = dateStr.slice(13, 15);
      return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
    }
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return new Date().toISOString();
    return dt.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
