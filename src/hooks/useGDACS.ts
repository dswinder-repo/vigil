import { useQuery } from '@tanstack/react-query';
import { API_GDACS, CORS_PROXIES, POLL_GDACS } from '@/lib/constants';
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
  // GDACS RSS is XML — needs CORS proxy
  let text = '';
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(API_GDACS), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      text = await res.text();
      if (text.includes('<item>')) break;
      text = '';
    } catch {
      continue;
    }
  }
  if (!text) throw new Error('GDACS: all proxies failed');
  return normalizeGDACS(text);
}
