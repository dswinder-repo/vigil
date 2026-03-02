import { useQuery } from '@tanstack/react-query';
import { CORS_PROXIES, API_METEOALARM, POLL_METEOALARM } from '@/lib/constants';
import { normalizeMeteoalarm } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

async function fetchMeteoalarm(): Promise<NormalizedEvent[]> {
  // Try each CORS proxy until one works
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(API_METEOALARM)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return normalizeMeteoalarm(data);
    } catch {
      continue;
    }
  }
  return [];
}

export function useMeteoalarm() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['meteoalarm'],
    queryFn: fetchMeteoalarm,
    staleTime: POLL_METEOALARM,
    refetchInterval: POLL_METEOALARM,
  });
}
