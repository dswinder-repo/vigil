import { useState } from 'react';
import { useCoinGecko } from '@/hooks/useCoinGecko';
import { useGlobalMarkets } from '@/hooks/useGlobalMarkets';
import { TrendingUp, TrendingDown, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { MarketQuote } from '@/lib/types';

const CRYPTO_SLUGS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  DOGE: 'dogecoin',
};

function quoteUrl(q: MarketQuote): string {
  if (q.source === 'coingecko') {
    const slug = CRYPTO_SLUGS[q.symbol] ?? q.symbol.toLowerCase();
    return `https://www.coingecko.com/en/coins/${slug}`;
  }
  return `https://finance.yahoo.com/quote/${encodeURIComponent(q.symbol)}`;
}

const SECTIONS = ['Indices', 'Global', 'Bonds', 'Commodities', 'FX', 'Crypto'];

const SYMBOL_SECTIONS: Record<string, string> = {
  'SPY': 'Indices', 'QQQ': 'Indices', 'DIA': 'Indices', 'IWM': 'Indices',
  'VIXY': 'Indices', 'XLE': 'Indices', 'XLF': 'Indices',
  'VGK': 'Global', 'EWJ': 'Global', 'FXI': 'Global', 'EWZ': 'Global', 'EEM': 'Global',
  'TLT': 'Bonds', 'IEF': 'Bonds',
  'GLD': 'Commodities', 'SLV': 'Commodities', 'USO': 'Commodities',
  'UNG': 'Commodities', 'COPX': 'Commodities', 'REMX': 'Commodities', 'LIT': 'Commodities',
  'UUP': 'FX', 'DX-Y.NYB': 'FX',
  'BTC-USD': 'Crypto', 'ETH-USD': 'Crypto',
};

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

function QuoteRow({ q }: { q: MarketQuote }) {
  const [expanded, setExpanded] = useState(false);
  const isUp = q.changePercent >= 0;
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-[3px] hover:bg-bg-panel-2 transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] font-bold uppercase text-text-primary shrink-0">
            {q.symbol}
          </span>
          <span className="font-mono text-[9px] text-text-muted truncate">{q.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] tabular-nums text-text-secondary">
            ${formatPrice(q.price)}
          </span>
          <span
            className={`flex items-center gap-0.5 font-mono text-[10px] tabular-nums ${
              isUp ? 'text-accent-green' : 'text-accent-red'
            }`}
          >
            {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {isUp ? '+' : ''}{q.changePercent.toFixed(2)}%
          </span>
          {expanded ? (
            <ChevronUp className="h-2.5 w-2.5 text-text-muted" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="mx-3 mb-1 border border-border/50 rounded bg-bg-panel-2 px-2.5 py-1.5 flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">24h Change</span>
            <span className={`font-mono text-[10px] tabular-nums ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
              {isUp ? '+' : ''}{q.change24h != null ? `$${formatPrice(Math.abs(q.change24h))}` : '—'}
              {' '}({isUp ? '+' : ''}{q.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Source</span>
            <span className="font-mono text-[9px] text-text-secondary uppercase">
              {q.source === 'coingecko' ? 'CoinGecko' : q.source === 'finnhub' ? 'Finnhub' : 'Yahoo Finance'}
            </span>
          </div>
          <a
            href={quoteUrl(q)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-text-muted hover:text-text-primary transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View on {q.source === 'coingecko' ? 'CoinGecko' : 'Yahoo Finance'}
          </a>
        </div>
      )}
    </div>
  );
}

export function MarketsPanel() {
  const { data: globalQuotes, isLoading: globalLoading } = useGlobalMarkets();
  const { data: cryptoQuotes, isLoading: cryptoLoading } = useCoinGecko();

  const isLoading = globalLoading && cryptoLoading;
  const hasData = (globalQuotes && globalQuotes.length > 0) || (cryptoQuotes && cryptoQuotes.length > 0);

  if (isLoading || !hasData) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] text-text-muted animate-pulse">
          ACQUIRING MARKET DATA...
        </span>
      </div>
    );
  }

  // Group global market quotes by section
  const sectionMap = new Map<string, MarketQuote[]>();
  if (globalQuotes) {
    for (const q of globalQuotes) {
      const sec = SYMBOL_SECTIONS[q.symbol] ?? 'Other';
      if (!sectionMap.has(sec)) sectionMap.set(sec, []);
      sectionMap.get(sec)!.push(q);
    }
  }
  if (cryptoQuotes && cryptoQuotes.length > 0) {
    sectionMap.set('Crypto', cryptoQuotes);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {SECTIONS.map((section) => {
        const quotes = sectionMap.get(section);
        if (!quotes || quotes.length === 0) return null;
        return (
          <div key={section}>
            <div className="sticky top-0 z-10 bg-bg-panel-1 px-3 py-0.5 border-b border-border/50">
              <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-text-muted">
                {section}
              </span>
            </div>
            {quotes.map((q) => (
              <QuoteRow key={q.symbol} q={q} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
