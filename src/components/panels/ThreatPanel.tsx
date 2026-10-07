import { useState } from 'react';
import { useBilateralThreat } from '@/hooks/useBilateralThreat';
import type { ThreatPair } from '@/hooks/useBilateralThreat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score <= 20) return 'bg-green-500';
  if (score <= 50) return 'bg-yellow-500';
  if (score <= 75) return 'bg-orange-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score <= 20) return 'text-green-500';
  if (score <= 50) return 'text-yellow-500';
  if (score <= 75) return 'text-orange-500';
  return 'text-red-500';
}

function scoreDescription(score: number): string {
  if (score <= 20) return 'low — little or no conflict reported between them';
  if (score <= 50) return 'moderate — some hostile incidents or confrontation';
  if (score <= 75) return 'high — repeated violent incidents';
  return 'severe — sustained war-level reporting';
}

function sourceUrl(a: string, b: string): string {
  const query = encodeURIComponent(`${a} ${b} when:2d`);
  return `https://news.google.com/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
}

function TrendIndicator({ trend }: { trend: ThreatPair['trend'] }) {
  if (trend === 'up') return <span className="text-red-400">↑</span>;
  if (trend === 'down') return <span className="text-green-400">↓</span>;
  return <span className="text-gray-400">→</span>;
}

function trendLabel(trend: ThreatPair['trend']): string {
  if (trend === 'up') return '↑ Coverage rising since the previous reading';
  if (trend === 'down') return '↓ Coverage falling since the previous reading';
  return '— Coverage steady since the previous reading';
}

function trendTextColor(trend: ThreatPair['trend']): string {
  if (trend === 'up') return 'text-red-400';
  if (trend === 'down') return 'text-green-400';
  return 'text-gray-400';
}

// ---------------------------------------------------------------------------
// Expanded detail section
// ---------------------------------------------------------------------------

function ThreatDetail({ pair }: { pair: ThreatPair }) {
  const desc = scoreDescription(pair.score);
  const url = sourceUrl(pair.a, pair.b);

  return (
    <div className="border-l-2 border-green-700 bg-gray-900/70 mx-3 mb-1 px-3 py-2 font-mono text-[11px] text-gray-400 animate-fadeIn space-y-2">
      {/* Summary sentence */}
      <p className="text-gray-300 leading-relaxed">
        How much serious conflict news named both{' '}
        <span className="text-white">{pair.a}</span> and <span className="text-white">{pair.b}</span>{' '}
        in the last 48 hours, weighted by severity: a deadly strike counts far more than talks
        or a statement. The scale is fixed, not relative to other pairs, so a quiet pair reads low
        even on a busy news day.
      </p>

      {/* Signal intensity */}
      <div>
        <span className="text-gray-600 uppercase tracking-widest text-[9px]">Events</span>
        <p className="mt-0.5">
          <span className="text-green-400">{pair.articles}</span> events naming both countries in
          the last 48 hours. Score{' '}
          <span className={scoreTextColor(pair.score)}>{pair.score}</span> ={' '}
          <span className="text-gray-300">{desc}</span>.
          {pair.stale && (
            <span className="text-yellow-600"> Last reading carried forward.</span>
          )}
        </p>
      </div>

      {/* Trend */}
      <div>
        <span className="text-gray-600 uppercase tracking-widest text-[9px]">Trend</span>
        <p className={`mt-0.5 ${trendTextColor(pair.trend)}`}>{trendLabel(pair.trend)}</p>
      </div>

      {/* Source link */}
      <div className="pt-1 border-t border-gray-800">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-500 hover:text-green-300 underline underline-offset-2 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Read the coverage →
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function ThreatRow({
  pair,
  rank,
  isExpanded,
  onToggle,
}: {
  pair: ThreatPair;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const textCol = scoreTextColor(pair.score);
  const barCol = scoreColor(pair.score);

  return (
    <>
      {/* Clickable row */}
      <div
        className={`flex items-center gap-2 px-3 py-1 border-b border-gray-800/50 font-mono text-xs cursor-pointer transition-colors ${
          isExpanded
            ? 'bg-gray-800/60 border-b-0'
            : 'hover:bg-gray-800/40'
        }`}
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Rank */}
        <span className="text-gray-600 w-4 shrink-0 tabular-nums">#{rank}</span>

        {/* Country pair label */}
        <span className="text-gray-300 w-36 shrink-0 truncate">
          {pair.a} <span className="text-gray-600">↔</span> {pair.b}
        </span>

        {/* Score bar */}
        <div className="flex-1 h-1.5 bg-gray-800 rounded-sm overflow-hidden min-w-0">
          <div
            className={`h-full rounded-sm transition-all duration-500 ${barCol}`}
            style={{ width: `${pair.score}%` }}
          />
        </div>

        {/* Numeric score (the event count is in the expanded detail) */}
        <span className={`w-6 shrink-0 tabular-nums text-right ${textCol}`} title={`${pair.articles} events naming both, last 48h`}>
          {pair.score}
        </span>

        {/* Trend arrow */}
        <span className="w-3 shrink-0 text-center">
          <TrendIndicator trend={pair.trend} />
        </span>

        {/* Expand chevron */}
        <span className={`text-gray-600 w-3 shrink-0 text-center transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
          ›
        </span>
      </div>

      {/* Inline expanded detail */}
      {isExpanded && <ThreatDetail pair={pair} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel (inner content only — App.tsx wraps this in a PanelShell)
// ---------------------------------------------------------------------------

export function ThreatPanel() {
  const { data, isLoading, isError } = useBilateralThreat();
  const [expandedPair, setExpandedPair] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] text-red-500 animate-pulse">
          ACQUIRING SIGNAL...
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] text-red-600 uppercase tracking-widest">
          SIGNAL LOST
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800 font-mono text-[8px] uppercase tracking-widest text-gray-600 sticky top-0 bg-bg-panel-1 z-10">
        <span className="w-4 shrink-0">#</span>
        <span className="w-36 shrink-0">Pair</span>
        <span className="flex-1" title="Severity-weighted conflict events naming both countries, last 48 hours. Fixed scale: 100 = sustained war-level reporting.">Tension</span>
        <span className="w-6 text-right" title="Tension score, 0-100. 100 = sustained war-level reporting.">Score</span>
        <span className="w-3 text-center" title="Change since the previous reading: ↑ Rising · ↓ Falling · → Steady">Trend</span>
        <span className="w-3 shrink-0" />
      </div>

      {/* Rows */}
      {data.map((pair, i) => (
        <ThreatRow
          key={pair.id}
          pair={pair}
          rank={i + 1}
          isExpanded={expandedPair === pair.id}
          onToggle={() =>
            setExpandedPair((prev) => (prev === pair.id ? null : pair.id))
          }
        />
      ))}
    </div>
  );
}
