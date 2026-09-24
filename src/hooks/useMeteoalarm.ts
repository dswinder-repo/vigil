import { useQuery } from '@tanstack/react-query';
import type { NormalizedEvent } from '@/lib/types';

/** Off: Meteoalarm retired this feed, the URL now answers 404. */
export function useMeteoalarm() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['meteoalarm'],
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
    placeholderData: [],
  });
}
