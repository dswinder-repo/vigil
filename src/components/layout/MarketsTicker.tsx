import { TrendingUp } from 'lucide-react';
import { useMarketsTicker } from '@/hooks/useMarketsTicker';

const UP_COLOR = '#00cc44';
const DOWN_COLOR = '#EF4444';

export function MarketsTicker() {
  const { data: quotes, isError } = useMarketsTicker();

  if (!quotes || quotes.length === 0) {
    return (
      <div className="flex h-full items-center px-3 gap-2">
        <TrendingUp className="h-3 w-3 text-accent-amber shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-amber shrink-0">
          MARKETS
        </span>
        <span className="text-[10px] text-text-muted animate-pulse">
          {isError ? 'MARKET DATA UNAVAILABLE' : 'LOADING MARKET DATA...'}
        </span>
      </div>
    );
  }

  const tickerHtml = quotes
    .map((q) => {
      const color = q.up ? UP_COLOR : DOWN_COLOR;
      const sign = q.up ? '+' : '';
      const pct = q.changePercent.toFixed(2);
      const price = q.price < 10
        ? q.price.toFixed(4)
        : q.price < 1000
        ? q.price.toFixed(2)
        : q.price.toFixed(0);
      return (
        `<span style="color:${color};font-weight:600">${escapeHtml(q.symbol)}</span>` +
        ` <span style="color:#8a9ab5">${escapeHtml(q.name)}</span>` +
        ` <span style="color:${color}">${price} ${sign}${pct}%</span>`
      );
    })
    .join('&nbsp;&nbsp;<span style="color:#3a4560">|</span>&nbsp;&nbsp;');

  const duration = Math.max(120, quotes.length * 5);

  return (
    <div className="flex h-full items-center overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-r border-border px-3 h-full">
        <TrendingUp className="h-3 w-3 text-accent-amber" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-amber whitespace-nowrap">
          MARKETS
        </span>
      </div>
      <div className="flex flex-1 items-center overflow-hidden">
        <div
          className="flex whitespace-nowrap text-[11px] text-text-secondary"
          style={{ animation: `ticker-scroll ${duration}s linear infinite` }}
        >
          <span className="px-4" dangerouslySetInnerHTML={{ __html: tickerHtml }} />
          <span className="px-4" dangerouslySetInnerHTML={{ __html: tickerHtml }} />
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
