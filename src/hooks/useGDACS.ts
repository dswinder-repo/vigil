import { useQuery } from '@tanstack/react-query';
import { API_GDACS, POLL_GDACS } from '@/lib/constants';
import { normalizeGDACS } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useGDACS() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['gdacs-events'],
    queryFn: fetchGDACS,
    refetchInterval: POLL_GDACS,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 5_000,
  });
}

async function fetchGDACS(): Promise<NormalizedEvent[]> {
  const res = await fetch(API_GDACS, {
    cache: 'no-cache',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GDACS: ${res.status}`);
  return normalizeGDACS(await res.text());
}
