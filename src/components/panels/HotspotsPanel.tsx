import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { HOTSPOTS_URL, POLL_GDELT } from '@/lib/constants';
import { useDashboardStore } from '@/stores/dashboard-store';

interface Hotspot {
  id: string;
  name: string;
  kind: string;
  intensity: number;
  countries: string[];
  center: [number, number] | null;
  summary: string;
  pins48h: number;
  trend: 'new' | 'rising' | 'steady' | 'falling';
  status: 'covered' | 'thin' | 'quiet';
  source: 'curated' | 'watchlist' | 'surge';
  signals: string;
}

const KIND_LABEL: Record<string, string> = {
  war: 'War',
  insurgency: 'Insurgency',
  flashpoint: 'Flashpoint',
  unrest: 'Unrest',
  'political-crisis': 'Political crisis',
  humanitarian: 'Humanitarian',
};

const INTENSITY_COLOR = ['#64748B', '#64748B', '#FCD34D', '#F59E0B', '#F97316', '#EF4444'];

/**
 * The places that matter right now, hottest first. The list is a curated
 * floor plus whatever the outside watchlists (Wikipedia, CrisisWatch,
 * Carnegie) and the surge detector add, rebuilt on every feed run. Each row
 * says how many events the map holds for it in the last 48 hours, so a thin
 * spot is visible rather than looking calm.
 */
export function HotspotsPanel() {
  const focusOn = useDashboardStore((s) => s.focusOn);
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, isError } = useQuery<{ items: Hotspot[]; reviewed: string }>({
    queryKey: ['hotspots'],
    queryFn: async () => {
      const res = await fetch(HOTSPOTS_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`hotspots.json: ${res.status}`);
      return res.json();
    },
    refetchInterval: POLL_GDELT,
    staleTime: 840_000,
  });

  if (isLoading) return <div className="p-3 text-[10px] text-text-muted">Loading hotspots…</div>;
  if (isError || !data) return <div className="p-3 text-[10px] text-text-muted">Hotspots unavailable</div>;

  // One row per place: several curated entries can share a country (Haiti's
  // gang war and its displacement crisis); keep the hotter.
  const seen = new Set<string>();
  const items = data.items.filter((h) => {
    const key = h.countries.join(',') + h.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return h.intensity >= 2;
  });
  const visible = showAll ? items : items.slice(0, 25);
  const surging = items.filter((h) => h.source === 'surge').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Flame className="h-3 w-3 text-accent-amber" />
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          {items.length} tracked{surging ? ` · ${surging} surging` : ''}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {visible.map((h) => (
          <HotspotRow key={h.id} h={h} onFocus={() => h.center && focusOn(h.center, h.kind === 'unrest' ? 5 : 4.5)} />
        ))}
        {items.length > 25 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full py-1 text-[9px] uppercase tracking-wider text-text-muted hover:text-text-primary"
          >
            {showAll ? 'Show fewer' : `Show all ${items.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function HotspotRow({ h, onFocus }: { h: Hotspot; onFocus: () => void }) {
  const [open, setOpen] = useState(false);
  const color = INTENSITY_COLOR[Math.max(0, Math.min(5, h.intensity))];
  return (
    <div className="border-b border-border/30">
      <div className="flex items-center gap-1.5 py-1">
        <button onClick={onFocus} className="flex flex-1 min-w-0 items-center gap-1.5 text-left hover:bg-bg-panel-2 rounded px-0.5" title="Show on map">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[10px] text-text-primary">{h.name}</span>
          {h.source !== 'curated' && (
            <span className="shrink-0 rounded border border-accent-cyan/40 px-1 text-[7px] uppercase tracking-wider text-accent-cyan">
              {h.source === 'surge' ? 'surging' : 'watch'}
            </span>
          )}
          {h.trend === 'rising' && <TrendingUp className="h-2.5 w-2.5 shrink-0 text-accent-red" />}
          {h.trend === 'falling' && <TrendingDown className="h-2.5 w-2.5 shrink-0 text-accent-green" />}
        </button>
        <span
          className={`shrink-0 text-[9px] tabular-nums ${h.status === 'covered' ? 'text-text-muted' : 'text-accent-amber'}`}
          title={h.status === 'covered' ? 'Events on the map, last 48 hours' : 'Few events found in the last 48 hours: coverage may be thin'}
        >
          {h.pins48h}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-text-muted hover:text-text-primary" aria-label="Details">
          {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>
      </div>
      {open && (
        <div className="pb-1.5 pl-3.5 pr-1 text-[9px] leading-snug text-text-muted">
          <div className="mb-0.5 uppercase tracking-wider">
            {KIND_LABEL[h.kind] ?? h.kind} · intensity {h.intensity}/5
          </div>
          {h.summary && <div className="text-text-secondary">{h.summary}</div>}
          {h.signals && h.signals !== h.summary && <div className="mt-0.5">{h.signals}</div>}
        </div>
      )}
    </div>
  );
}
