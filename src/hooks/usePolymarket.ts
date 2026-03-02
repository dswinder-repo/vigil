import { useQuery } from '@tanstack/react-query';
import { API_POLYMARKET, CORS_PROXIES, POLL_POLYMARKET } from '@/lib/constants';

export interface PolymarketMarket {
  id: string;
  question: string;
  probability: number;
  url: string;
}

export function usePolymarket() {
  return useQuery<PolymarketMarket[]>({
    queryKey: ['polymarket'],
    queryFn: fetchPolymarkets,
    refetchInterval: POLL_POLYMARKET,
    staleTime: 60_000,
    retry: 1,
    retryDelay: 2_000,
  });
}

async function fetchPolymarkets(): Promise<PolymarketMarket[]> {
  let data: unknown = null;

  // Try direct first
  try {
    const res = await fetch(API_POLYMARKET, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) data = await res.json();
  } catch {
    // fall through to proxies
  }

  // Fall back to CORS proxies
  if (!data) {
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy + encodeURIComponent(API_POLYMARKET), {
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        data = await res.json();
        if (data) break;
      } catch {
        continue;
      }
    }
  }

  if (!data || !Array.isArray(data)) return [];

  return data
    .filter((m: Record<string, unknown>) => {
      if (typeof m.question !== 'string' || m.question.length === 0) return false;
      // outcomePrices is a JSON-encoded array like '["0.72","0.28"]' — parse accordingly
      if (m.outcomePrices) {
        try {
          const prices = JSON.parse(m.outcomePrices as string) as string[];
          return !isNaN(parseFloat(prices[0] ?? ''));
        } catch {
          return !isNaN(parseFloat(String(m.outcomePrices)));
        }
      }
      return !isNaN(parseFloat(String(m.lastTradePrice ?? '')));
    })
    .slice(0, 20)
    .map((m: Record<string, unknown>) => {
      // outcomePrices is a JSON-encoded array like "[\"0.72\",\"0.28\"]"
      let probability = 0.5;
      if (m.outcomePrices) {
        try {
          const prices = JSON.parse(m.outcomePrices as string) as string[];
          probability = parseFloat(prices[0] ?? '0.5');
        } catch {
          probability = parseFloat(String(m.outcomePrices)) || 0.5;
        }
      } else if (m.lastTradePrice) {
        probability = parseFloat(String(m.lastTradePrice));
      }
      const slug = (m.slug as string) || (m.id as string) || '';
      return {
        id: String(m.id ?? slug),
        question: String(m.question),
        probability: isNaN(probability) ? 0.5 : Math.max(0, Math.min(1, probability)),
        url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com',
      };
    });
}
