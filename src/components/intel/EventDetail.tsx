import { X, ExternalLink, MapPin, Clock, AlertTriangle, TrendingUp, Brain, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/constants';
import { useDashboardStore } from '@/stores/dashboard-store';
import { CamerasPanel } from '@/components/panels/CamerasPanel';
import { usePolymarket } from '@/hooks/usePolymarket';
import { useManifold } from '@/hooks/useManifold';
import { matchEventsToMarkets } from '@/lib/matchEventsToMarkets';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import type { ReactNode } from 'react';
import type { NormalizedEvent } from '@/lib/types';

const STUB_EVENT: NormalizedEvent = {
  id: '',
  source: 'gdelt',
  category: 'conflict',
  severity: 1,
  title: '',
  summary: '',
  coordinates: [0, 0],
  timestamp: '',
  metadata: {},
};

export function EventDetail() {
  const event = useDashboardStore((s) => s.selectedEvent);
  const selectEvent = useDashboardStore((s) => s.selectEvent);
  const aiApiKey = useDashboardStore((s) => s.aiApiKey);
  const setAIKey = useDashboardStore((s) => s.setAIKey);

  // Reuse the same query keys that PredictionsPanel uses — React Query dedupes,
  // so these calls hit the shared cache and never trigger extra network requests.
  const { data: polyData } = usePolymarket();
  const { data: manifoldData } = useManifold();

  // useAIAnalysis must be called unconditionally (Rules of Hooks), so we pass a
  // stub when no event is selected; the result is only rendered after the guard.
  const { loading, analysis, error: aiError, analyze } = useAIAnalysis(event ?? STUB_EVENT);
  const [showKeyForm, setShowKeyForm] = useState(false);

  const relatedMarkets = useMemo(() => {
    if (!event) return [];
    return matchEventsToMarkets(
      event,
      polyData ?? [],
      manifoldData ?? [],
    );
  }, [event, polyData, manifoldData]);

  if (!event) return null;

  const color = CATEGORY_COLORS[event.category];

  return (
    <div className="flex h-full flex-col bg-bg-panel-1">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {CATEGORY_LABELS[event.category]} // {event.source.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => selectEvent(null)}
          className="text-text-muted transition-colors hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <h2 className="font-mono text-base font-bold leading-tight text-text-primary">
          {event.title}
        </h2>

        <div className="mt-3 flex flex-col gap-2">
          <DetailRow icon={<Clock className="h-3 w-3" />} label="TIME">
            {format(new Date(event.timestamp), 'yyyy-MM-dd HH:mm:ss')} UTC
          </DetailRow>
          <DetailRow icon={<MapPin className="h-3 w-3" />} label="COORDS">
            {event.coordinates[1].toFixed(4)}, {event.coordinates[0].toFixed(4)}
          </DetailRow>
          <DetailRow icon={<AlertTriangle className="h-3 w-3" />} label="SEVERITY">
            <SeverityBar severity={event.severity} color={color} />
          </DetailRow>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm leading-relaxed text-text-secondary">{event.summary}</p>
        </div>

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-accent-green transition-colors hover:text-accent-green-glow"
          >
            <ExternalLink className="h-3 w-3" />
            VIEW SOURCE
          </a>
        )}

        {Object.keys(event.metadata).length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              RAW INTEL
            </span>
            <div className="mt-2 space-y-1">
              {Object.entries(event.metadata).map(
                ([key, value]) =>
                  value != null && (
                    <div key={key} className="flex justify-between gap-2">
                      <span className="font-mono text-[10px] text-text-muted">
                        {key}
                      </span>
                      <span className="max-w-[60%] truncate font-mono text-[10px] text-text-secondary">
                        {String(value)}
                      </span>
                    </div>
                  )
              )}
            </div>
          </div>
        )}

        {/* Related prediction markets */}
        {relatedMarkets.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-text-muted" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                RELATED MARKETS
              </span>
            </div>
            <div className="space-y-1">
              {relatedMarkets.map((market) => (
                <MarketRow key={`${market.source}-${market.id}`} market={market} />
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-text-muted" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                AI ANALYSIS
              </span>
            </div>
            {!aiApiKey ? (
              <button
                onClick={() => setShowKeyForm((v) => !v)}
                className="flex items-center gap-1 font-mono text-[10px] text-text-muted transition-colors hover:text-text-primary"
              >
                CONFIGURE KEY
                {showKeyForm ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            ) : (
              <button
                onClick={analyze}
                disabled={loading}
                className="flex items-center gap-1 font-mono text-[10px] text-accent-green transition-colors hover:text-accent-green-glow disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                {loading ? 'ANALYZING...' : 'ANALYZE'}
              </button>
            )}
          </div>

          {showKeyForm && !aiApiKey && (
            <AIKeyForm onSave={(key, provider) => { setAIKey(key, provider); setShowKeyForm(false); }} />
          )}

          {analysis && (
            <div className="rounded-[2px] bg-bg-panel-2 p-2">
              <p className="font-mono text-[11px] leading-relaxed text-text-secondary">{analysis}</p>
            </div>
          )}
          {aiError && (
            <p className="font-mono text-[10px] text-red-400">{aiError}</p>
          )}
        </div>

        {/* Satellite imagery context */}
        <CamerasPanel event={event} />
      </div>
    </div>
  );
}

function AIKeyForm({ onSave }: { onSave: (key: string, provider: 'openai' | 'anthropic') => void }) {
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('anthropic');
  return (
    <div className="mb-2 space-y-2 rounded-[2px] bg-bg-panel-2 p-2">
      <div className="flex gap-2">
        {(['anthropic', 'openai'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`flex-1 rounded-[2px] px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              provider === p
                ? 'bg-bg-panel-3 text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
        className="w-full rounded-[2px] bg-bg-panel-3 px-2 py-1 font-mono text-[10px] text-text-primary outline-none placeholder:text-text-muted"
      />
      <button
        onClick={() => key && onSave(key, provider)}
        disabled={!key}
        className="w-full rounded-[2px] bg-bg-panel-3 py-1 font-mono text-[10px] uppercase tracking-wider text-accent-green transition-colors hover:bg-bg-panel-2 disabled:opacity-40"
      >
        SAVE KEY
      </button>
    </div>
  );
}

function MarketRow({ market }: { market: import('@/lib/matchEventsToMarkets').MarketMatch }) {
  const truncated =
    market.question.length > 60
      ? market.question.slice(0, 57) + '...'
      : market.question;

  const probLabel =
    market.probability != null
      ? `${Math.round(market.probability * 100)}%`
      : '—';

  const sourceBadge = market.source === 'polymarket' ? 'PM' : 'MF';

  const inner = (
    <div className="group flex items-center gap-2 rounded-[2px] py-1 transition-colors hover:bg-bg-panel-2">
      <span className="flex-1 truncate font-mono text-[10px] leading-tight text-text-secondary group-hover:text-text-primary">
        {truncated}
      </span>
      <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-accent-green">
        {probLabel}
      </span>
      <span className="shrink-0 rounded-[2px] bg-bg-panel-3 px-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
        {sourceBadge}
      </span>
      {market.url && (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  );

  if (market.url) {
    return (
      <a href={market.url} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }

  return <div>{inner}</div>;
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{icon}</span>
      <span className="w-16 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className="font-mono text-xs text-text-secondary">{children}</span>
    </div>
  );
}

function SeverityBar({ severity, color }: { severity: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-2 w-3 rounded-[1px]"
            style={{
              backgroundColor: i < severity ? color : 'var(--color-border)',
            }}
          />
        ))}
      </div>
      <span className="ml-1 font-mono text-[10px] text-text-muted">
        {severity}/5
      </span>
    </div>
  );
}
