import { useQuery } from '@tanstack/react-query';
import type { NormalizedEvent } from '@/lib/types';

/**
 * Off.
 *
 * ReliefWeb decommissioned the v1 API this used, and v2 refuses requests that
 * do not carry an app name they have approved. Requesting one is a short form
 * at https://apidoc.reliefweb.int — once it is approved, add the endpoint to
 * scripts/feeds.config.json as a snapshot and point this back at it.
 *
 * It stays as an empty result rather than a broken request so the board does
 * not spend every poll retrying something that cannot succeed.
 */
export function useReliefWeb() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['reliefweb-disasters'],
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
    placeholderData: [],
  });
}
