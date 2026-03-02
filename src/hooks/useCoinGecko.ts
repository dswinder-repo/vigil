import { useQuery } from '@tanstack/react-query';
import { API_COINGECKO, POLL_COINGECKO } from '@/lib/constants';
import type { MarketQuote } from '@/lib/types';

interface CoinGeckoResponse {
  [id: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

const COIN_MAP: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  solana: { symbol: 'SOL', name: 'Solana' },
  dogecoin: { symbol: 'DOGE', name: 'Dogecoin' },
};

export function useCoinGecko() {
  return useQuery<MarketQuote[]>({
    queryKey: ['coingecko-prices'],
    queryFn: async () => {
      const res = await fetch(API_COINGECKO);
      if (!res.ok) throw new Error(`CoinGecko: ${res.status}`);
      const data: CoinGeckoResponse = await res.json();

      return Object.entries(data).map(([id, info]) => {
        const meta = COIN_MAP[id] ?? { symbol: id.toUpperCase(), name: id };
        const change = info.usd_24h_change ?? 0;
        return {
          symbol: meta.symbol,
          name: meta.name,
          price: info.usd,
          change24h: (info.usd * change) / 100,
          changePercent: change,
          source: 'coingecko' as const,
        };
      });
    },
    refetchInterval: POLL_COINGECKO,
    retry: 1,
  });
}
