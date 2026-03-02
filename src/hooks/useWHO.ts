import { useQuery } from '@tanstack/react-query';
import { API_WHO_DON, CORS_PROXIES, POLL_WHO } from '@/lib/constants';
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
  let text = '';
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(API_WHO_DON), {
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
  if (!text) throw new Error('WHO: all proxies failed');
  return normalizeWHO(text);
}
