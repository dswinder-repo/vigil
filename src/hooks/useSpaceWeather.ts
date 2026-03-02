import { useQuery } from '@tanstack/react-query';
import { API_NOAA_SPACE_WEATHER, POLL_SPACE_WEATHER } from '@/lib/constants';
import { normalizeSpaceWeather } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useSpaceWeather() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['noaa-space-weather'],
    queryFn: async () => {
      const res = await fetch(API_NOAA_SPACE_WEATHER, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`SpaceWeather: ${res.status}`);
      const data = await res.json();
      return normalizeSpaceWeather(data);
    },
    refetchInterval: POLL_SPACE_WEATHER,
    staleTime: 240_000,
    retry: 1,
    retryDelay: 10_000,
  });
}
