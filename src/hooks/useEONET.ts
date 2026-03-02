import { useQuery } from '@tanstack/react-query';
import { API_EONET, POLL_EONET } from '@/lib/constants';
import { normalizeEONET } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useEONET() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['eonet-events'],
    queryFn: async () => {
      const res = await fetch(API_EONET, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`EONET: ${res.status}`);
      const data = await res.json();
      return normalizeEONET(data);
    },
    refetchInterval: POLL_EONET,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 2_000,
  });
}
