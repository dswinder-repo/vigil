import { Globe } from 'lucide-react';
import { useNewsFeed } from '@/hooks/useNewsFeed';

interface TickerEntry {
  label: string;
  source: string;
  url: string;
  isNews: boolean;
}

export function BottomTicker() {
  const { data: news, isError } = useNewsFeed();

  const entries: TickerEntry[] = [];

  if (news && news.length > 0) {
    for (const item of news.slice(0, 20)) {
      entries.push({
        label: item.title,
        source: item.source,
        url: item.url,
        isNews: true,
      });
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center px-3 gap-2">
        <Globe className="h-3 w-3 text-accent-green shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-green shrink-0">
          INTL NEWS
        </span>
        <span className="text-[10px] text-text-muted animate-pulse">
          {isError ? 'NEWS FEED UNAVAILABLE' : 'AWAITING FEED DATA...'}
        </span>
      </div>
    );
  }

  const tickerHtml = entries
    .map((e) => {
      const inner = e.isNews
        ? `<span class="text-accent-green">[${e.source}]</span> ${escapeHtml(e.label)}`
        : `<span class="text-text-muted">[${escapeHtml(e.source)}]</span> ${escapeHtml(e.label)}`;
      return e.url
        ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${inner}</a>`
        : inner;
    })
    .join('&nbsp;&nbsp;///&nbsp;&nbsp;');

  const duration = Math.max(90, entries.length * 6);

  return (
    <div className="flex h-full items-center overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-r border-border px-3 h-full">
        <Globe className="h-3 w-3 text-accent-green" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-green whitespace-nowrap">
          INTL NEWS
        </span>
      </div>
      <div className="flex flex-1 items-center overflow-hidden">
        <div
          className="flex whitespace-nowrap text-[11px] text-text-secondary"
          style={{
            animation: `ticker-scroll ${duration}s linear infinite`,
          }}
        >
          <span
            className="px-4"
            dangerouslySetInnerHTML={{ __html: tickerHtml }}
          />
          <span
            className="px-4"
            dangerouslySetInnerHTML={{ __html: tickerHtml }}
          />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
