import { useQuery } from '@tanstack/react-query';

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const INTERVAL_MS = 30_000;

export interface Aircraft {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;      // baro_altitude in metres
  velocity: number;      // m/s
  heading: number;       // true_track in degrees
  onGround: boolean;
}

function parseStates(data: unknown): Aircraft[] {
  if (!data || typeof data !== 'object') return [];
  const states = (data as { states?: unknown[][] }).states;
  if (!Array.isArray(states)) return [];

  const result: Aircraft[] = [];
  for (const s of states) {
    if (!Array.isArray(s)) continue;
    const lon = s[5];
    const lat = s[6];
    const onGround = s[8];
    // Skip: on ground, or no position
    if (onGround === true) continue;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (!isFinite(lon) || !isFinite(lat)) continue;

    result.push({
      icao24: String(s[0] ?? ''),
      callsign: String(s[1] ?? '').trim(),
      longitude: lon,
      latitude: lat,
      altitude: typeof s[7] === 'number' ? s[7] : 0,
      velocity: typeof s[9] === 'number' ? s[9] : 0,
      heading: typeof s[10] === 'number' ? s[10] : 0,
      onGround: false,
    });
  }
  // Cap at 1500 for performance
  return result.slice(0, 1500);
}

export function useOpenSky() {
  return useQuery({
    queryKey: ['opensky'],
    queryFn: async () => {
      const res = await fetch(OPENSKY_URL);
      if (!res.ok) throw new Error(`OpenSky ${res.status}`);
      const data = await res.json();
      return parseStates(data);
    },
    refetchInterval: INTERVAL_MS,
    staleTime: INTERVAL_MS,
    retry: 1,
    // Don't throw — just return empty array on error
    throwOnError: false,
  });
}
