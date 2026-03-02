import { useQuery } from '@tanstack/react-query';
import { CORS_PROXIES, POLL_RELIEFWEB } from '@/lib/constants';
import { normalizeReliefWebConflict } from '@/lib/normalizers';

// ReliefWeb /reports endpoint filtered to Armed Conflict type.
// Separate from useReliefWeb (which hits /disasters) so each endpoint can be
// queried, retried, and cached independently.
const API_RELIEFWEB_CONFLICT =
  'https://api.reliefweb.int/v1/reports' +
  '?appname=vigil' +
  '&limit=30' +
  '&sort[]=date:desc' +
  '&filter[field]=type.name' +
  '&filter[value]=Armed%20Conflict' +
  '&fields[include][]=title' +
  '&fields[include][]=body' +
  '&fields[include][]=date' +
  '&fields[include][]=url_alias' +
  '&fields[include][]=primary_country' +
  '&fields[include][]=country';

export function useReliefWebConflict() {
  return useQuery({
    queryKey: ['reliefweb-conflict'],
    queryFn: fetchReliefWebConflict,
    refetchInterval: POLL_RELIEFWEB,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 2_000,
  });
}

async function fetchReliefWebConflict() {
  // Try direct first (ReliefWeb serves permissive CORS headers)
  try {
    const res = await fetch(API_RELIEFWEB_CONFLICT, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      return normalizeReliefWebConflict(data);
    }
  } catch {
    // fall through to proxies
  }

  // Fall back to CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(API_RELIEFWEB_CONFLICT), {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return normalizeReliefWebConflict(data);
    } catch {
      continue;
    }
  }
  throw new Error('ReliefWeb Conflict: all endpoints failed');
}
