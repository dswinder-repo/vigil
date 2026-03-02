import { useQuery } from '@tanstack/react-query';
import { API_CISA_KEV, POLL_CISA } from '@/lib/constants';
import { normalizeCISA } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useCISA() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['cisa-kev'],
    queryFn: async () => {
      const res = await fetch(API_CISA_KEV, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`CISA: ${res.status}`);
      const data = await res.json();
      return normalizeCISA(data);
    },
    refetchInterval: POLL_CISA,
    staleTime: 1_800_000,
    retry: 1,
    retryDelay: 10_000,
  });
}
