import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { CORS_PROXIES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreatPair {
  id: string;
  a: string;
  b: string;
  score: number;    // 0-100 normalized (feature count / 100 * 100)
  articles: number; // raw article count
  trend: 'up' | 'stable' | 'down';
}

// ---------------------------------------------------------------------------
// Country pairs — pre-tuned GDELT query terms
// ---------------------------------------------------------------------------

const PAIRS = [
  { id: 'ru-ua', a: 'Russia', b: 'Ukraine', terms: 'Russia Ukraine (airstrike OR shelling OR offensive OR ceasefire OR casualties)' },
  { id: 'cn-tw', a: 'China', b: 'Taiwan', terms: 'China Taiwan (military OR strait OR invasion OR PLA OR tensions)' },
  { id: 'il-ir', a: 'Israel', b: 'Iran', terms: 'Israel Iran (strike OR nuclear OR missiles OR proxy OR tensions)' },
  { id: 'us-cn', a: 'United States', b: 'China', terms: '"United States" China (sanctions OR tariffs OR military OR confrontation OR Taiwan)' },
  { id: 'in-pk', a: 'India', b: 'Pakistan', terms: 'India Pakistan (ceasefire OR border OR Kashmir OR military OR tensions)' },
  { id: 'kp-us', a: 'North Korea', b: 'United States', terms: '"North Korea" "United States" (missile OR nuclear OR sanctions OR provocation)' },
  { id: 'tr-sy', a: 'Turkey', b: 'Syria', terms: 'Turkey Syria (military OR operation OR Kurdish OR offensive OR border)' },
  { id: 'sa-ye', a: 'Saudi Arabia', b: 'Yemen', terms: '"Saudi Arabia" Yemen (Houthi OR airstrike OR ceasefire OR blockade)' },
  { id: 'az-am', a: 'Azerbaijan', b: 'Armenia', terms: 'Azerbaijan Armenia (Nagorno-Karabakh OR border OR ceasefire OR conflict)' },
  { id: 'rs-xk', a: 'Serbia', b: 'Kosovo', terms: 'Serbia Kosovo (tensions OR NATO OR border OR incident)' },
  { id: 'et-er', a: 'Ethiopia', b: 'Eritrea', terms: 'Ethiopia Eritrea (conflict OR border OR Tigray OR military)' },
  { id: 'us-ir', a: 'United States', b: 'Iran', terms: '"United States" Iran (sanctions OR nuclear OR proxies OR attack OR escalation)' },
] as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_BILATERAL = 900_000; // 15 minutes
const GDELT_GEO = 'https://api.gdeltproject.org/api/v2/geo/geo';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface GeoJSONResponse {
  features?: unknown[];
}

async function fetchPairCount(terms: string): Promise<number> {
  const query = encodeURIComponent(`${terms} sourcelang:english`);
  const url = `${GDELT_GEO}?query=${query}&format=GeoJSON&maxrows=100`;

  // Try direct fetch first (may work in some environments)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('{')) {
        const data = JSON.parse(text) as GeoJSONResponse;
        return Array.isArray(data?.features) ? data.features.length : 0;
      }
    }
  } catch {
    // fall through to proxy chain
  }

  // Try each CORS proxy in sequence
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.startsWith('{')) continue;
      const data = JSON.parse(text) as GeoJSONResponse;
      return Array.isArray(data?.features) ? data.features.length : 0;
    } catch {
      continue;
    }
  }

  return 0;
}

interface RawPairResult {
  id: string;
  a: string;
  b: string;
  count: number;
}

async function fetchAllPairs(): Promise<ThreatPair[]> {
  const results: RawPairResult[] = [];

  // Batch into 3 groups of 4 with 600ms delay between batches
  const batches = [
    PAIRS.slice(0, 4),
    PAIRS.slice(4, 8),
    PAIRS.slice(8),
  ] as const;

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 600));

    const batch = batches[i];
    const counts = await Promise.allSettled(
      batch.map((p) => fetchPairCount(p.terms)),
    );

    batch.forEach((p, j) => {
      const settled = counts[j];
      const count = settled.status === 'fulfilled' ? settled.value : 0;
      results.push({ id: p.id, a: p.a, b: p.b, count });
    });
  }

  return results.map((r) => ({
    id: r.id,
    a: r.a,
    b: r.b,
    score: Math.min(100, r.count),
    articles: r.count,
    trend: 'stable' as const, // trend applied in the hook via ref
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBilateralThreat(): {
  data: ThreatPair[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const prevScores = useRef<Record<string, number>>({});

  const { data, isLoading, isError } = useQuery<ThreatPair[]>({
    queryKey: ['bilateral-threat'],
    queryFn: async () => {
      const pairs = await fetchAllPairs();

      // Apply trend relative to previous fetch
      const withTrend = pairs.map((p) => {
        const prev = prevScores.current[p.id] ?? p.score;
        let trend: ThreatPair['trend'] = 'stable';
        if (p.score > prev * 1.15) trend = 'up';
        else if (p.score < prev * 0.85) trend = 'down';
        return { ...p, trend };
      });

      // Persist scores for next poll cycle
      withTrend.forEach((p) => {
        prevScores.current[p.id] = p.score;
      });

      // Return sorted highest-to-lowest
      return withTrend.sort((a, b) => b.score - a.score);
    },
    staleTime: POLL_BILATERAL,
    refetchInterval: POLL_BILATERAL,
    retry: 1,
    retryDelay: 3_000,
  });

  return { data, isLoading, isError };
}
