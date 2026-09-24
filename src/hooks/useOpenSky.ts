import { useQuery } from '@tanstack/react-query';

export interface Aircraft {
  icao24: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
}

/**
 * Off.
 *
 * OpenSky closed anonymous access to the live state feed — it answers 401 now
 * and wants an OAuth client, which means registering an account and holding a
 * secret. A static site cannot hold a secret, so this would have to be fetched
 * by the scheduled job with the credentials kept in GitHub Actions secrets.
 *
 * Until then it returns nothing rather than throwing a 401 on every poll.
 */
export function useOpenSky() {
  return useQuery<Aircraft[]>({
    queryKey: ['opensky'],
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
    placeholderData: [],
  });
}
