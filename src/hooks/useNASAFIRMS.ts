import { useQuery } from '@tanstack/react-query';
import { API_NASA_FIRMS, POLL_FIRMS } from '@/lib/constants';
import { normalizeNASAFIRMS } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useNASAFIRMS() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['nasa-firms'],
    queryFn: async () => {
      if (!API_NASA_FIRMS) return [];
      const res = await fetch(API_NASA_FIRMS, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`FIRMS: ${res.status}`);
      const text = await res.text();
      return normalizeNASAFIRMS(text);
    },
    refetchInterval: POLL_FIRMS,
    staleTime: 300_000,
    retry: 1,
    retryDelay: 15_000,
    enabled: Boolean(API_NASA_FIRMS),
  });
}
