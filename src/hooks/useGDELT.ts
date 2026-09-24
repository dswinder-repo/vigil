import { useQuery } from '@tanstack/react-query';
import { GDELT_FEED_URL, POLL_GDELT } from '@/lib/constants';
import { normalizeGdeltDoc } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

/**
 * World events with a country attached, collected server-side.
 *
 * This used to make ten calls from the browser to GDELT's geo endpoint through
 * public relays. The endpoint has since been retired and answers 404, and the
 * relays were never reliable. The scheduled job now asks GDELT's article
 * endpoint a few wide questions instead, sorts the results into categories and
 * writes one file.
 */
export function useGDELT() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['gdelt-events'],
    queryFn: async () => {
      const res = await fetch(GDELT_FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`gdelt.json: ${res.status}`);
      const data = await res.json();
      if (data?.failed && !data?.items?.length) throw new Error('GDELT feed unavailable');
      return normalizeGdeltDoc(data);
    },
    refetchInterval: POLL_GDELT,
    staleTime: 840_000,
    retry: 2,
  });
}
