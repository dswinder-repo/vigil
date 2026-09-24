import { useQuery } from '@tanstack/react-query';
import type { NormalizedEvent } from '@/lib/types';

/**
 * Off, for the same reason as useReliefWeb: the v1 API is gone and v2 needs an
 * approved app name. Conflict events now come from the world feed instead,
 * built from the RSS sources that load reliably.
 */
export function useReliefWebConflict() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['reliefweb-conflict'],
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
    placeholderData: [],
  });
}
