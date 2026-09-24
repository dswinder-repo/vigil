import { useQuery } from '@tanstack/react-query';
import { API_WHO_DON, POLL_WHO } from '@/lib/constants';
import { normalizeWHO } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useWHO() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['who-don'],
    queryFn: fetchWHO,
    refetchInterval: POLL_WHO,
    staleTime: 600_000,
    retry: 1,
    retryDelay: 10_000,
  });
}

async function fetchWHO(): Promise<NormalizedEvent[]> {
  const res = await fetch(API_WHO_DON, {
    cache: 'no-cache',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`WHO: ${res.status}`);
  return normalizeWHO(await res.text());
}
