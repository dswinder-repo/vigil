import { useQuery } from '@tanstack/react-query';
import { API_NWS_ALERTS, POLL_NWS } from '@/lib/constants';
import { normalizeNWS } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

export interface NWSAlert {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  areaDesc: string;
  headline?: string;
  description?: string;
  onset?: string;
  expires?: string;
  senderName?: string;
}

export function useNWSAlerts() {
  return useQuery({
    queryKey: ['nws-alerts'],
    queryFn: async () => {
      const res = await fetch(API_NWS_ALERTS, {
        headers: { 'User-Agent': 'vigil-dashboard' },
      });
      if (!res.ok) throw new Error(`NWS: ${res.status}`);
      const data = await res.json();
      return {
        events: normalizeNWS(data) as NormalizedEvent[],
        alerts: extractAlerts(data),
      };
    },
    refetchInterval: POLL_NWS,
    retry: 1,
  });
}

function extractAlerts(data: unknown): NWSAlert[] {
  const d = data as { features?: Array<Record<string, unknown>> };
  if (!d?.features) return [];
  return d.features.slice(0, 20).map((f) => {
    const p = f.properties as Record<string, unknown>;
    return {
      id: (p.id as string) || String(f.id),
      event: (p.event as string) || 'Unknown Alert',
      severity: (p.severity as string) || 'Unknown',
      urgency: (p.urgency as string) || 'Unknown',
      areaDesc: (p.areaDesc as string) || 'Unknown Area',
      headline: p.headline as string | undefined,
      description: p.description as string | undefined,
      onset: p.onset as string | undefined,
      expires: p.expires as string | undefined,
      senderName: p.senderName as string | undefined,
    };
  });
}
