import { useQuery } from '@tanstack/react-query';
import { API_NUCLEAR_ACTIVITY, POLL_NUCLEAR, CORS_PROXIES } from '@/lib/constants';
import type { NormalizedEvent } from '@/lib/types';

type GdeltArticle = {
  url: string;
  title: string;
  domain: string;
  seendate: string;
  sourcecountry: string;
};

const NUCLEAR_HARD_TERMS = [
  /nuclear/i, /radiation/i, /radioactive/i, /iaea/i,
  /enrichment/i, /uranium/i, /plutonium/i,
  /reactor/i, /warhead/i, /dirty bomb/i,
  /nuclear test/i, /nuclear plant/i, /meltdown/i,
  /fallout/i, /isotope/i, /fissile/i, /proliferation/i,
];

function isClearlyNuclear(title: string): boolean {
  return NUCLEAR_HARD_TERMS.some((re) => re.test(title));
}

function classifyNuclearSeverity(title: string): 1 | 2 | 3 | 4 | 5 {
  const lower = title.toLowerCase();
  if (/dirty bomb|nuclear test|nuclear strike|meltdown|explosion|detonation/.test(lower)) return 5;
  if (/weapons grade|warhead|proliferation|enrichment violation|leak|contamination/.test(lower)) return 4;
  if (/iaea inspection|nuclear talks|treaty|sanctions|nuclear deal|facility|plant/.test(lower)) return 3;
  if (/nuclear energy|reactor|capacity|fuel|waste/.test(lower)) return 2;
  return 2;
}

function formatGdeltDate(dateStr: string): string {
  const s = dateStr.replace('T', '').replace('Z', '');
  if (s.length >= 14) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  }
  return new Date().toISOString();
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchNuclearActivity(): Promise<NormalizedEvent[]> {
  let text: string | null = null;

  try {
    const res = await fetch(API_NUCLEAR_ACTIVITY, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const t = await res.text();
      if (t.trim().startsWith('{')) text = t;
    }
  } catch { /* fall through */ }

  if (!text) {
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy + encodeURIComponent(API_NUCLEAR_ACTIVITY), {
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const t = await res.text();
        if (t.trim().startsWith('{')) { text = t; break; }
      } catch { continue; }
    }
  }

  if (!text) throw new Error('Nuclear activity: all fetches failed');

  const data = JSON.parse(text) as { articles?: GdeltArticle[] };
  if (!data?.articles?.length) return [];

  return data.articles
    .filter((a) => {
      if (!a.title || a.title.length < 10) return false;
      if (/^ERROR:/i.test(a.title)) return false;
      return isClearlyNuclear(a.title);
    })
    .map((a, i) => {
      const title = decodeEntities(a.title);
      const severity = classifyNuclearSeverity(title);
      const timestamp = a.seendate ? formatGdeltDate(a.seendate) : new Date().toISOString();
      return {
        id: `nuclear-${a.seendate || i}-${i}`,
        source: 'gdelt' as const,
        category: 'conflict' as const,
        severity,
        title,
        summary: a.domain || 'Nuclear/Radiological',
        coordinates: [0, 0] as [number, number],
        timestamp,
        url: a.url,
        metadata: { domain: a.domain, sourcecountry: a.sourcecountry, tag: 'nuclear' },
      };
    })
    .slice(0, 50);
}

export function useNuclearActivity() {
  return useQuery({
    queryKey: ['nuclear-activity'],
    queryFn: fetchNuclearActivity,
    refetchInterval: POLL_NUCLEAR,
    staleTime: 280_000,
    retry: 1,
    retryDelay: 2_000,
    placeholderData: [],
  });
}
