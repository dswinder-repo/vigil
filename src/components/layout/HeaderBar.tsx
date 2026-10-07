import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Crosshair, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { StatusLED } from '@/components/shared/StatusLED';
import { HOTSPOTS_URL, POLL_GDELT } from '@/lib/constants';
import type { NormalizedEvent } from '@/lib/types';

type TensionLevel = 'SEVERE' | 'HIGH' | 'ELEVATED' | 'GUARDED' | 'LOW';

/** Computed by the feed job from the hotspot list; see scripts/world.mjs, tensionIndex(). */
interface TensionIndex {
  score: number;
  level: TensionLevel;
  trend: 'new' | 'rising' | 'steady' | 'falling';
  situations: number;
  contributors: Array<{ id: string; name: string; intensity: number }>;
}

const TIMEZONES: Array<{ label: string; tz: string }> = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'EST', tz: 'America/New_York' },
  { label: 'CST', tz: 'America/Chicago' },
  { label: 'MST', tz: 'America/Denver' },
  { label: 'PST', tz: 'America/Los_Angeles' },
  { label: 'GMT', tz: 'Europe/London' },
  { label: 'CET', tz: 'Europe/Berlin' },
  { label: 'JST', tz: 'Asia/Tokyo' },
  { label: 'CST (CN)', tz: 'Asia/Shanghai' },
  { label: 'IST', tz: 'Asia/Kolkata' },
  { label: 'AEST', tz: 'Australia/Sydney' },
];

interface HeaderBarProps {
  sourceStatuses: Record<string, 'online' | 'degraded' | 'offline'>;
  events: NormalizedEvent[];
}

export function HeaderBar({ sourceStatuses, events }: HeaderBarProps) {
  const [selectedTz, setSelectedTz] = useState(TIMEZONES[0]);
  const [clock, setClock] = useState('');
  const [showTzMenu, setShowTzMenu] = useState(false);
  const [showDefconInfo, setShowDefconInfo] = useState(false);
  const [showEventInfo, setShowEventInfo] = useState(false);
  const [showLedInfo, setShowLedInfo] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);
  const defconRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);
  const ledRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const formatted = now.toLocaleTimeString('en-GB', {
        timeZone: selectedTz.tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setClock(`${formatted} ${selectedTz.label}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selectedTz]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setShowTzMenu(false);
      if (defconRef.current && !defconRef.current.contains(e.target as Node)) setShowDefconInfo(false);
      if (eventRef.current && !eventRef.current.contains(e.target as Node)) setShowEventInfo(false);
      if (ledRef.current && !ledRef.current.contains(e.target as Node)) setShowLedInfo(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Same query key as the hotspots panel, so this is one request, not two.
  const { data: hotspots } = useQuery<{ index?: TensionIndex }>({
    queryKey: ['hotspots'],
    queryFn: async () => {
      const res = await fetch(HOTSPOTS_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`hotspots.json: ${res.status}`);
      return res.json();
    },
    refetchInterval: POLL_GDELT,
    staleTime: 840_000,
  });
  const tension = hotspots?.index;
  const level: TensionLevel = tension?.level ?? 'GUARDED';
  const score = tension?.score ?? 0;
  const threatColor = THREAT_COLORS[level];
  const threatGlow = THREAT_GLOW[level];

  const eventStats = useMemo(() => {
    const byCat = new Map<string, number>();
    const bySev: Record<number, number> = {};
    for (const e of events) {
      byCat.set(e.category, (byCat.get(e.category) || 0) + 1);
      bySev[e.severity] = (bySev[e.severity] || 0) + 1;
    }
    return { byCat, bySev };
  }, [events]);

  return (
    <header className="flex h-10 shrink-0 items-center justify-between bg-bg-panel-1 px-4">
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-4 w-4 candle-flicker">
            <line x1="16" y1="2" x2="16" y2="8" stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
            <rect x="9" y="8" width="14" height="17" rx="1.5" fill="#10B981"/>
            <line x1="16" y1="25" x2="16" y2="30" stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        <span className="text-sm font-bold tracking-widest text-accent-green glow-text">
          VIGIL
        </span>
        <span className="text-xs text-text-muted">//</span>
        <span className="text-xs text-text-secondary">GLOBAL INTELLIGENCE</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Threat Level — clickable with explanation dropdown */}
        <div className="relative" ref={defconRef}>
          <button
            onClick={() => setShowDefconInfo((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition hover:bg-white/5"
            title="Click for what this measures"
          >
            <Crosshair className={`h-3 w-3 ${threatColor}`} style={{ filter: threatGlow }} />
            <span className="text-[8px] uppercase tracking-wider text-text-muted">World tension</span>
            <span className={`text-[10px] font-bold tracking-wider ${threatColor}`}>
              {tension ? level : '—'}
            </span>
            <span className="text-[8px] tabular-nums text-text-muted">
              {tension ? score : ''}
            </span>
            {tension?.trend === 'rising' && <TrendingUp className="h-2.5 w-2.5 text-accent-red" />}
            {tension?.trend === 'falling' && <TrendingDown className="h-2.5 w-2.5 text-accent-green" />}
          </button>

          {showDefconInfo && (
            <div className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-border bg-bg-panel-1 p-3 shadow-xl">
              <div className="mb-2 text-xs font-bold text-text-primary">World tension: {level} ({score}/100)</div>
              <div className="mb-2 text-[10px] leading-relaxed text-text-secondary">
                How many serious conflicts and crises are active right now, and how intense they are
                ({tension?.situations ?? 0} countries with an active situation). Each country's most serious
                situation counts once; a major war counts as much as fifteen simmering disputes, and more when a
                nuclear-armed state is directly involved. It rates situations, not headlines, so a busy news day
                does not move it. A typical recent year reads about 50.
                {tension && tension.trend !== 'new' && ` Trend: ${tension.trend}, comparing the last two days of events with the past month.`}
              </div>
              {tension?.contributors?.length ? (
                <div className="mb-2">
                  <div className="mb-1 text-[8px] uppercase tracking-widest text-text-muted">Driving it now</div>
                  {tension.contributors.map((c) => (
                    <div key={c.id} className="flex justify-between py-0.5 text-[9px]">
                      <span className="truncate text-text-secondary">{c.name}</span>
                      <span className="ml-2 shrink-0 tabular-nums text-text-muted">{c.intensity}/5</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1 text-[9px] text-text-muted">
                <div className="flex justify-between"><span className="text-accent-red">SEVERE</span><span>80+: war between nuclear-armed states</span></div>
                <div className="flex justify-between"><span className="text-accent-red">HIGH</span><span>60–79: several major wars at once</span></div>
                <div className="flex justify-between"><span className="text-accent-amber">ELEVATED</span><span>40–59: a typical troubled year</span></div>
                <div className="flex justify-between"><span className="text-accent-cyan">GUARDED</span><span>20–39: few serious conflicts</span></div>
                <div className="flex justify-between"><span className="text-accent-green">LOW</span><span>under 20</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Event Count */}
        <div className="relative" ref={eventRef}>
          <button
            onClick={() => setShowEventInfo((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition hover:bg-white/5"
            title="Click for event breakdown"
          >
            <Activity className="h-3 w-3 text-text-muted" />
            <span className="text-[10px] tabular-nums text-text-muted">
              <span className="text-text-secondary">{events.length.toLocaleString()}</span>{' '}
              EVENTS
            </span>
          </button>
          {showEventInfo && (
            <div className="absolute right-0 top-8 z-50 w-64 rounded-lg border border-border bg-bg-panel-1 p-3 shadow-xl">
              <div className="mb-2 text-xs font-bold text-text-primary">Event Breakdown</div>
              <div className="mb-2">
                <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">By Category</div>
                {Array.from(eventStats.byCat.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => (
                    <div key={cat} className="flex justify-between text-[9px] py-0.5">
                      <span className="capitalize text-text-secondary">{cat}</span>
                      <span className="tabular-nums text-text-muted">{count}</span>
                    </div>
                  ))}
              </div>
              <div>
                <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">By Severity</div>
                {([5, 4, 3, 2, 1] as const).map((sev) => {
                  const count = eventStats.bySev[sev] || 0;
                  if (count === 0) return null;
                  return (
                    <div key={sev} className="flex justify-between text-[9px] py-0.5">
                      <span className={SEV_COLORS[sev]}>SEV {sev}</span>
                      <span className="tabular-nums text-text-muted">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Source LEDs */}
        <div className="relative" ref={ledRef}>
          <button
            onClick={() => setShowLedInfo((v) => !v)}
            className="flex cursor-pointer items-center gap-3 rounded px-1.5 py-0.5 transition hover:bg-white/5"
            title="Click for source status details"
          >
            {Object.entries(sourceStatuses).map(([name, status]) => (
              <StatusLED key={name} status={status} label={name.toUpperCase()} />
            ))}
          </button>
          {showLedInfo && (
            <div className="absolute right-0 top-8 z-50 w-52 rounded-lg border border-border bg-bg-panel-1 p-3 shadow-xl">
              <div className="mb-2 text-xs font-bold text-text-primary">Data Sources</div>
              {Object.entries(sourceStatuses).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between py-0.5">
                  <span className="font-mono text-[9px] uppercase text-text-secondary">{name}</span>
                  <span className={`font-mono text-[9px] font-semibold uppercase ${
                    status === 'online' ? 'text-accent-green' : status === 'degraded' ? 'text-accent-amber' : 'text-accent-red'
                  }`}>{status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Clock with timezone selector */}
        <div className="relative" ref={tzRef}>
          <button
            onClick={() => setShowTzMenu((v) => !v)}
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white/5"
            title="Click to change timezone"
          >
            <span className="text-xs tabular-nums text-accent-green">{clock}</span>
            <ChevronDown className="h-2.5 w-2.5 text-text-muted" />
          </button>

          {showTzMenu && (
            <div className="absolute right-0 top-8 z-50 w-36 rounded-lg border border-border bg-bg-panel-1 py-1 shadow-xl">
              {TIMEZONES.map((tz) => (
                <button
                  key={tz.tz}
                  onClick={() => { setSelectedTz(tz); setShowTzMenu(false); }}
                  className={`flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-[10px] transition hover:bg-white/5 ${
                    selectedTz.tz === tz.tz ? 'text-accent-green font-bold' : 'text-text-secondary'
                  }`}
                >
                  <span>{tz.label}</span>
                  {selectedTz.tz === tz.tz && <span className="text-accent-green">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const THREAT_COLORS: Record<TensionLevel, string> = {
  SEVERE: 'text-accent-red',
  HIGH: 'text-accent-red',
  ELEVATED: 'text-accent-amber',
  GUARDED: 'text-accent-cyan',
  LOW: 'text-accent-green',
};

const THREAT_GLOW: Record<TensionLevel, string> = {
  SEVERE: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))',
  HIGH: 'drop-shadow(0 0 4px rgba(239,68,68,0.5))',
  ELEVATED: 'drop-shadow(0 0 4px rgba(245,158,11,0.5))',
  GUARDED: 'drop-shadow(0 0 3px rgba(6,182,212,0.4))',
  LOW: 'drop-shadow(0 0 3px rgba(0,204,68,0.4))',
};

const SEV_COLORS: Record<number, string> = {
  5: 'text-accent-red',
  4: 'text-accent-red',
  3: 'text-accent-amber',
  2: 'text-accent-cyan',
  1: 'text-text-muted',
};
