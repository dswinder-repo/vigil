import { useQuery } from '@tanstack/react-query';
import {
  CORS_PROXIES,
  GLOBAL_MARKET_SYMBOLS,
  POLL_GLOBAL_MARKETS,
} from '@/lib/constants';
import type { MarketQuote } from '@/lib/types';

// Yahoo Finance endpoints — query2 is more lenient with CORS
const YAHOO_BASES = [
  'https://query2.finance.yahoo.com/v8/finance/chart/',
  'https://query1.finance.yahoo.com/v8/finance/chart/',
];

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        currency?: string;
        symbol?: string;
      };
    }>;
  };
}

const SYMBOL_NAMES: Record<string, string> = {
  'SPY': 'S&P 500', 'QQQ': 'NASDAQ', 'DIA': 'DOW', 'IWM': 'Russell',
  'VGK': 'Europe', 'EWJ': 'Japan', 'FXI': 'China', 'EWZ': 'Brazil', 'EEM': 'EM',
  'TLT': '20Y Bond', 'IEF': '10Y Bond',
  'GLD': 'Gold', 'SLV': 'Silver', 'USO': 'Oil', 'UNG': 'Nat Gas',
  'COPX': 'Copper', 'REMX': 'Rare Earth', 'LIT': 'Lithium',
  'VIXY': 'VIX', 'UUP': 'USD',
  'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum',
  'DX-Y.NYB': 'DXY', 'XLE': 'Energy', 'XLF': 'Financials',
};

async function fetchQuote(
  symbol: string,
  name: string
): Promise<MarketQuote | null> {
  // Try each Yahoo endpoint with each CORS proxy
  for (const base of YAHOO_BASES) {
    const url = `${base}${symbol}?range=2d&interval=1d`;
    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const data: YahooChartResult = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;

        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose ?? price;
        const change24h = price - prevClose;
        const changePercent = prevClose !== 0 ? (change24h / prevClose) * 100 : 0;

        return { symbol, name, price, change24h, changePercent, source: 'yahoo' as const };
      } catch { /* try next proxy/base */ }
    }
  }
  return null;
}

export function useGlobalMarkets() {
  return useQuery<MarketQuote[]>({
    queryKey: ['global-markets'],
    queryFn: async () => {
      // Batch into groups of 4 to avoid hammering proxies
      const quotes: MarketQuote[] = [];
      for (let i = 0; i < GLOBAL_MARKET_SYMBOLS.length; i += 4) {
        const batch = GLOBAL_MARKET_SYMBOLS.slice(i, i + 4);
        const results = await Promise.allSettled(
          batch.map((s) => fetchQuote(s, SYMBOL_NAMES[s] ?? s))
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            quotes.push(result.value);
          }
        }
      }
      return quotes;
    },
    refetchInterval: POLL_GLOBAL_MARKETS,
    retry: 2,
    staleTime: 30_000,
  });
}
