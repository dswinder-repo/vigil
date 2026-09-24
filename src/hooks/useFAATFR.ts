import { useQuery } from '@tanstack/react-query';
import type { NormalizedEvent } from '@/lib/types';

/** Off: tfr.faa.gov now serves a web page where the GeoJSON used to be. */
export function useFAATFR() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['faa-tfr'],
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
    placeholderData: [],
  });
}
