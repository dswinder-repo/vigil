import { useEffect, useState, useMemo, useRef } from 'react';
import { Activity, Crosshair, ChevronDown } from 'lucide-react';
import { StatusLED } from '@/components/shared/StatusLED';
import type { NormalizedEvent, Severity } from '@/lib/types';

type ThreatLevel = 'DEFCON 1' | 'CRITICAL' | 'ELEVATED' | 'GUARDED' | 'NOMINAL';

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

  const { level, score } = useMemo(() => computeThreatLevel(events), [events]);
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
            title="Click for threat level details"
          >
            <Crosshair className={`h-3 w-3 ${threatColor}`} style={{ filter: threatGlow }} />
            <span className={`text-[10px] font-bold tracking-wider ${threatColor}`}>
              {level}
            </span>
            <span className="text-[8px] tabular-nums text-text-muted">
              {score.toFixed(0)}
            </span>
          </button>

          {showDefconInfo && (
            <div className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-border bg-bg-panel-1 p-3 shadow-xl">
              <div className="mb-2 text-xs font-bold text-text-primary">Threat Level: {level}</div>
              <div className="mb-2 text-[10px] leading-relaxed text-text-secondary">
                Composite score ({score.toFixed(1)}/100) based on the top 20% most intense events out of {events.length.toLocaleString()} tracked.
                Factors: event severity, category (conflict/disaster weighted highest), recency (last hour 2×), and event volume (minor bonus). Low-severity noise is filtered out so real crises drive the score.
              </div>
              <div className="space-y-1 text-[9px] text-text-muted">
                <div className="flex justify-between"><span className="text-accent-red">DEFCON 1</span><span>Score &ge; 80</span></div>
                <div className="flex justify-between"><span className="text-accent-red">CRITICAL</span><span>Score &ge; 55</span></div>
                <div className="flex justify-between"><span className="text-accent-amber">ELEVATED</span><span>Score &ge; 35</span></div>
                <div className="flex justify-between"><span className="text-accent-cyan">GUARDED</span><span>Score &ge; 15</span></div>
                <div className="flex justify-between"><span className="text-accent-green">NOMINAL</span><span>Score &lt; 15</span></div>
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

// --- Threat Level Calculator ---
// Weighted composite: severity distribution × category weights × recency × volume

const SEVERITY_WEIGHT: Record<Severity, number> = { 1: 0.5, 2: 1, 3: 2, 4: 4, 5: 8 };
const CATEGORY_WEIGHT: Record<string, number> = {
  conflict: 2.0,
  disaster: 1.5,
  disease: 1.5,
  cyber: 1.3,
  humanitarian: 1.2,
  political: 0.8,
  unrest: 1.5,
};

function computeThreatLevel(events: NormalizedEvent[]): { level: ThreatLevel; score: number } {
  if (events.length === 0) return { level: 'NOMINAL', score: 0 };

  const now = Date.now();

  // Calculate per-event intensity scores
  const intensities: number[] = [];
  for (const e of events) {
    const sevW = SEVERITY_WEIGHT[e.severity] || 1;
    const catW = CATEGORY_WEIGHT[e.category] || 1;
    // Recency: events in last hour get 2×, last 6h get 1.5×, last 24h get 1×, older get 0.5×
    const ageMs = now - new Date(e.timestamp).getTime();
    const ageH = ageMs / 3_600_000;
    const recency = ageH < 1 ? 2.0 : ageH < 6 ? 1.5 : ageH < 24 ? 1.0 : 0.5;
    intensities.push(sevW * catW * recency);
  }

  // Sort descending — focus on the WORST events, not the overall average.
  // A pure average gets diluted by hundreds of low-severity political events.
  // Instead, the top 20% (min 10) of events determine the threat level.
  intensities.sort((a, b) => b - a);
  const topN = Math.max(10, Math.floor(intensities.length * 0.2));
  const topSlice = intensities.slice(0, topN);
  const topAvg = topSlice.reduce((s, v) => s + v, 0) / topSlice.length;

  // topAvg baselines: calm ~1-2, tense ~4-6, crisis ~8+
  // Multiplier of 10 maps: calm(1.5)→15 GUARDED, tense(5)→50 ELEVATED, crisis(8)→80 DEFCON 1
  // Volume bonus: more events = slightly higher score (log scale, adds up to ~10 points)
  const volumeBonus = Math.min(10, Math.log2(events.length / 50) * 3);
  const score = Math.min(100, topAvg * 10 + Math.max(0, volumeBonus));

  let level: ThreatLevel;
  if (score >= 80) level = 'DEFCON 1';
  else if (score >= 55) level = 'CRITICAL';
  else if (score >= 35) level = 'ELEVATED';
  else if (score >= 15) level = 'GUARDED';
  else level = 'NOMINAL';

  return { level, score };
}

const THREAT_COLORS: Record<ThreatLevel, string> = {
  'DEFCON 1': 'text-accent-red',
  CRITICAL: 'text-accent-red',
  ELEVATED: 'text-accent-amber',
  GUARDED: 'text-accent-cyan',
  NOMINAL: 'text-accent-green',
};

const THREAT_GLOW: Record<ThreatLevel, string> = {
  'DEFCON 1': 'drop-shadow(0 0 6px rgba(239,68,68,0.8))',
  CRITICAL: 'drop-shadow(0 0 4px rgba(239,68,68,0.5))',
  ELEVATED: 'drop-shadow(0 0 4px rgba(245,158,11,0.5))',
  GUARDED: 'drop-shadow(0 0 3px rgba(6,182,212,0.4))',
  NOMINAL: 'drop-shadow(0 0 3px rgba(0,204,68,0.4))',
};

const SEV_COLORS: Record<number, string> = {
  5: 'text-accent-red',
  4: 'text-accent-red',
  3: 'text-accent-amber',
  2: 'text-accent-cyan',
  1: 'text-text-muted',
};
