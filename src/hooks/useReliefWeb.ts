import { useQuery } from '@tanstack/react-query';
import { API_RELIEFWEB, CORS_PROXIES, POLL_RELIEFWEB } from '@/lib/constants';
import { normalizeReliefWeb } from '@/lib/normalizers';

export function useReliefWeb() {
  return useQuery({
    queryKey: ['reliefweb-disasters'],
    queryFn: fetchReliefWeb,
    refetchInterval: POLL_RELIEFWEB,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 2_000,
  });
}

async function fetchReliefWeb() {
  // Try direct first (ReliefWeb API may serve CORS headers)
  try {
    const res = await fetch(API_RELIEFWEB, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = await res.json();
      return normalizeReliefWeb(data);
    }
  } catch {
    // fall through to proxies
  }

  // Fall back to CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(API_RELIEFWEB), {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return normalizeReliefWeb(data);
    } catch {
      continue;
    }
  }
  throw new Error('ReliefWeb: all endpoints failed');
}
