import { useQuery } from '@tanstack/react-query';
import { GDELT_FEED_URL, POLL_NUCLEAR } from '@/lib/constants';
import { normalizeGdeltDoc } from '@/lib/normalizers';
import type { NormalizedEvent } from '@/lib/types';

const NUCLEAR_TERMS =
  /\b(nuclear|radiation|radioactive|IAEA|enrichment|uranium|plutonium|reactor|warhead|dirty bomb|meltdown|fallout|isotope|fissile|proliferation)\b/i;

function nuclearSeverity(title: string): NormalizedEvent['severity'] {
  const t = title.toLowerCase();
  if (/dirty bomb|nuclear test|nuclear strike|meltdown|detonation/.test(t)) return 5;
  if (/weapons grade|warhead|proliferation|enrichment|leak|contamination/.test(t)) return 4;
  if (/iaea|nuclear talks|treaty|sanctions|nuclear deal|facility|plant/.test(t)) return 3;
  return 2;
}

/**
 * Nuclear and radiological items, pulled out of the same collected feed the
 * map uses rather than asking GDELT a second time — GDELT allows very few
 * calls per run and the map needs them.
 */
export function useNuclearActivity() {
  return useQuery<NormalizedEvent[]>({
    queryKey: ['nuclear-activity'],
    queryFn: async () => {
      const res = await fetch(GDELT_FEED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`gdelt.json: ${res.status}`);
      return normalizeGdeltDoc(await res.json())
        .filter((e) => NUCLEAR_TERMS.test(e.title))
        .map((e) => ({
          ...e,
          id: e.id.replace('gdelt-', 'nuclear-'),
          severity: nuclearSeverity(e.title),
          metadata: { ...e.metadata, tag: 'nuclear' },
        }))
        .slice(0, 50);
    },
    refetchInterval: POLL_NUCLEAR,
    staleTime: 280_000,
    retry: 2,
    placeholderData: [],
  });
}
