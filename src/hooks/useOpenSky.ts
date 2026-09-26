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
 * Military aircraft currently transmitting a position.
 *
 * This used to call OpenSky from the browser, which answers 401 there. The
 * scheduled job collects it instead, from adsb.lol's military feed — no
 * credentials, and it carries the aircraft worth looking at rather than every
 * airliner in the sky.
 *
 * Positions are as of the last collection. Anything older than 90 minutes is
 * not shown.
 */
const FEED_URL = `${import.meta.env.BASE_URL}data/raw/aircraft.json`;

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  t?: string;
  desc?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
}

export function useOpenSky() {
  return useQuery<Aircraft[]>({
    queryKey: ['military-aircraft'],
    queryFn: async () => {
      const res = await fetch(FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`aircraft.json: ${res.status}`);
      const data = (await res.json()) as { ac?: AdsbAircraft[]; now?: number };
      // The collector runs every few hours in practice (GitHub throttles
      // scheduled jobs), and a plane plotted where it was four hours ago is
      // worse than no plane. Past 90 minutes, show nothing.
      if (typeof data.now === 'number' && Date.now() - data.now > 90 * 60 * 1000) return [];
      return (data.ac ?? [])
        .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
        .map((a) => ({
          icao24: a.hex ?? '',
          callsign: (a.flight ?? '').trim() || (a.hex ?? '').toUpperCase(),
          country: a.desc ?? a.t ?? 'Military',
          longitude: a.lon as number,
          latitude: a.lat as number,
          altitude: typeof a.alt_baro === 'number' ? a.alt_baro : 0,
          velocity: a.gs ?? 0,
          heading: a.track ?? 0,
        }));
    },
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: 2,
    placeholderData: [],
  });
}
