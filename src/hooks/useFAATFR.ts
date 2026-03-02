import { useQuery } from '@tanstack/react-query';
import { API_FAA_TFR, CORS_PROXIES, POLL_FAA_TFR } from '@/lib/constants';
import { normalizeFAATFR } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

// NOTE: The FAA TFR GeoJSON endpoint (tfr.faa.gov) is publicly available but
// frequently blocks CORS requests. All three proxies are tried in sequence.
// If all fail, the hook returns [] silently — TFR data is supplementary.
// The endpoint URL (tfr_feed_geojson.json) may also return HTML or 404 depending
// on FAA server state; the parseJSON guard below handles that gracefully.

export function useFAATFR() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['faa-tfr'],
    queryFn: fetchFAATFR,
    refetchInterval: POLL_FAA_TFR,
    staleTime: 840_000, // 14 minutes
    retry: 0, // all proxies are tried inline; no point retrying at query level
    placeholderData: [],
  });
}

async function fetchFAATFR(): Promise<NormalizedEvent[]> {
  // Try each CORS proxy in order; return as soon as one gives us valid JSON
  for (const proxy of CORS_PROXIES) {
    try {
      const url = proxy + encodeURIComponent(API_FAA_TFR);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const text = await res.text();

      // Guard against HTML error pages (FAA sometimes returns HTML for JSON URLs)
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) continue;

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }

      const events = normalizeFAATFR(json);
      return events;
    } catch {
      // Network error, timeout, or parse failure — try next proxy
      continue;
    }
  }

  // All proxies failed — return empty array gracefully
  return [];
}
