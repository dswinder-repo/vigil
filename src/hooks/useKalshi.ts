import { useQuery } from '@tanstack/react-query';
import { API_KALSHI, CORS_PROXIES, POLL_KALSHI } from '@/lib/constants';

export interface KalshiMarket {
  id: string;
  title: string;
  probability: number; // 0-1
  url: string;
  volume: number;
}

async function fetchKalshiWithProxy(proxyUrl: string): Promise<KalshiMarket[]> {
  const targetUrl = `${API_KALSHI}?status=open&limit=30`;
  const url = proxyUrl + encodeURIComponent(targetUrl);

  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Kalshi fetch failed: ${res.status}`);

  const json: unknown = await res.json();
  // Kalshi API wraps in { markets: [...] }
  const raw =
    (json as Record<string, unknown>)?.markets ??
    (Array.isArray(json) ? json : []);

  return (raw as Array<Record<string, unknown>>)
    .filter((m) => {
      const yesPrice = (m.last_price ?? m.yes_ask ?? 0) as number;
      return typeof yesPrice === 'number';
    })
    .map((m) => {
      const rawPrice = (m.last_price ?? m.yes_ask ?? 50) as number;
      // Kalshi prices are in cents (0–100), convert to 0–1
      const probability = Math.min(1, Math.max(0, rawPrice / 100));
      return {
        id: String(m.ticker ?? m.market_url ?? m.title ?? ''),
        title: String(m.title ?? m.question ?? 'Unknown'),
        probability,
        url: `https://kalshi.com/markets/${String(m.ticker ?? '')}`,
        volume: Number(m.volume ?? 0),
      };
    })
    .filter((m) => m.title && m.title !== 'Unknown')
    .slice(0, 20);
}

export function useKalshi() {
  return useQuery<KalshiMarket[]>({
    queryKey: ['kalshi'],
    queryFn: async () => {
      for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
          const result = await fetchKalshiWithProxy(CORS_PROXIES[i]);
          return result;
        } catch {
          if (i === CORS_PROXIES.length - 1) {
            throw new Error('All Kalshi proxies failed');
          }
        }
      }
      return [];
    },
    refetchInterval: POLL_KALSHI,
    staleTime: POLL_KALSHI / 2,
    retry: 1,
  });
}
