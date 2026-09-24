import { useQuery } from '@tanstack/react-query';
import type { MarketQuote } from '@/lib/types';

/** Same server-collected file the ticker reads. */
const FEED_URL = `${import.meta.env.BASE_URL}data/markets.json`;

const SYMBOL_NAMES: Record<string, string> = {
  SPY: 'S&P 500', QQQ: 'NASDAQ', DIA: 'DOW', IWM: 'Russell',
  VGK: 'Europe', EWJ: 'Japan', FXI: 'China', EWZ: 'Brazil', EEM: 'EM',
  TLT: '20Y Bond', IEF: '10Y Bond',
  GLD: 'Gold', SLV: 'Silver', USO: 'Oil', UNG: 'Nat Gas',
  COPX: 'Copper', REMX: 'Rare Earth', LIT: 'Lithium',
  VIXY: 'VIX', UUP: 'USD',
  'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum',
  'DX-Y.NYB': 'DXY', XLE: 'Energy', XLF: 'Financials',
};

interface FeedFile {
  failed?: boolean;
  items: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }>;
}

export function useGlobalMarkets() {
  return useQuery<MarketQuote[]>({
    queryKey: ['global-markets'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`markets.json: ${res.status}`);
      const data = (await res.json()) as FeedFile;
      if (data.failed && !data.items?.length) throw new Error('market data unavailable');
      return (data.items ?? []).map((q) => ({
        symbol: q.symbol,
        name: SYMBOL_NAMES[q.symbol] || q.name || q.symbol,
        price: q.price,
        change24h: q.change,
        changePercent: q.changePercent,
        source: 'yahoo' as const,
      }));
    },
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: 2,
  });
}
