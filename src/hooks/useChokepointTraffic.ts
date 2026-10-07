import { useQuery } from '@tanstack/react-query';

/**
 * Daily ship transits through the major chokepoints, from IMF PortWatch
 * (satellite AIS data, about three days behind). Written by the feed job to
 * data/chokepoints.json; see scripts/fetch-feeds.mjs, buildChokepoints().
 */
export interface ChokepointTraffic {
  id: string;
  through: string;
  perDay: number;
  tankersPerDay: number;
  /** Same calendar week, median of 2019, 2022 and 2023. */
  normal: number | null;
  tankersNormal: number | null;
  /** Percent change against normal. */
  change: number | null;
  lastYear: number | null;
  tankersLastYear: number | null;
  changeVsLastYear: number | null;
  series: number[];
  stale?: boolean;
}

const URL = `${import.meta.env.BASE_URL}data/chokepoints.json`;

export function useChokepointTraffic() {
  return useQuery<Map<string, ChokepointTraffic>>({
    queryKey: ['chokepoint-traffic'],
    queryFn: async () => {
      const res = await fetch(URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`chokepoints.json: ${res.status}`);
      const data = (await res.json()) as { items: ChokepointTraffic[] };
      return new Map(data.items.map((t) => [t.id, t]));
    },
    refetchInterval: 3_600_000,
    staleTime: 3_000_000,
  });
}
