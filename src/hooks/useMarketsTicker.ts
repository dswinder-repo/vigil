import { useQuery } from '@tanstack/react-query';
import { GLOBAL_MARKET_SYMBOLS, CORS_PROXIES, POLL_GLOBAL_MARKETS, YAHOO_FINANCE_BASE } from '@/lib/constants';

export interface MarketTickerQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  up: boolean;
}

const SYMBOL_NAMES: Record<string, string> = {
  'SPY': 'S&P 500',
  'QQQ': 'NASDAQ',
  'DIA': 'DOW',
  'IWM': 'Russell',
  'VGK': 'Europe',
  'EWJ': 'Japan',
  'FXI': 'China',
  'EWZ': 'Brazil',
  'EEM': 'EM',
  'TLT': '20Y Bond',
  'IEF': '10Y Bond',
  'GLD': 'Gold',
  'SLV': 'Silver',
  'USO': 'Oil',
  'UNG': 'Nat Gas',
  'COPX': 'Copper',
  'REMX': 'Rare Earth',
  'LIT': 'Lithium',
  'VIXY': 'VIX',
  'UUP': 'USD',
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
  'DX-Y.NYB': 'DXY',
  'XLE': 'Energy',
  'XLF': 'Financials',
};

async function fetchQuote(symbol: string): Promise<MarketTickerQuote | null> {
  const url = `${YAHOO_FINANCE_BASE}${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  let text: string | null = null;

  // Try direct fetch first
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const t = await res.text();
      if (t.trim().startsWith('{')) text = t;
    }
  } catch { /* fall through */ }

  // CORS proxy fallback
  if (!text) {
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy + encodeURIComponent(url), {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) continue;
        const t = await res.text();
        if (t.trim().startsWith('{')) { text = t; break; }
      } catch { continue; }
    }
  }

  if (!text) return null;

  try {
    const data = JSON.parse(text);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prev;
    const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
    return {
      symbol,
      name: SYMBOL_NAMES[symbol] ?? symbol,
      price,
      change,
      changePercent,
      up: change >= 0,
    };
  } catch {
    return null;
  }
}

async function fetchAllQuotes(): Promise<MarketTickerQuote[]> {
  const symbols = GLOBAL_MARKET_SYMBOLS;
  // Fetch in batches of 5 to avoid rate limiting
  const results: MarketTickerQuote[] = [];
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(fetchQuote));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    // Small delay between batches
    if (i + BATCH < symbols.length) await new Promise((res) => setTimeout(res, 300));
  }
  return results;
}

export function useMarketsTicker() {
  return useQuery({
    queryKey: ['markets-ticker'],
    queryFn: fetchAllQuotes,
    refetchInterval: POLL_GLOBAL_MARKETS,
    staleTime: 55_000,
    retry: 1,
    retryDelay: 2_000,
    placeholderData: [],
  });
}
