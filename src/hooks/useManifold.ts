import { useQuery } from '@tanstack/react-query';
import { API_MANIFOLD, POLL_MANIFOLD } from '@/lib/constants';
import type { PredictionMarket } from '@/lib/types';

interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  volume24Hours?: number;
  url: string;
  outcomeType?: string;
  closeTime?: number;
  createdTime?: number;
}

export function useManifold() {
  return useQuery<PredictionMarket[]>({
    queryKey: ['manifold-markets'],
    queryFn: async () => {
      const res = await fetch(API_MANIFOLD);
      if (!res.ok) throw new Error(`Manifold: ${res.status}`);
      const data: ManifoldMarket[] = await res.json();

      const now = Date.now();
      return data
        .filter(
          (m) =>
            m.outcomeType === 'BINARY' &&
            m.probability != null &&
            // Only show markets that haven't closed yet
            (!m.closeTime || m.closeTime > now)
        )
        .slice(0, 10)
        .map((m) => ({
          id: m.id,
          question: m.question,
          probability: m.probability ?? 0.5,
          volume24h: m.volume24Hours ?? 0,
          url: m.url ?? `https://manifold.markets/${m.id}`,
          source: 'manifold' as const,
        }));
    },
    refetchInterval: POLL_MANIFOLD,
    retry: 1,
  });
}
