import { useQuery } from '@tanstack/react-query';
import { API_USGS, POLL_USGS } from '@/lib/constants';
import { normalizeUSGS } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export function useUSGS() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['usgs-earthquakes'],
    queryFn: async () => {
      const res = await fetch(API_USGS);
      if (!res.ok) throw new Error(`USGS: ${res.status}`);
      const data = await res.json();
      return normalizeUSGS(data);
    },
    refetchInterval: POLL_USGS,
  });
}
