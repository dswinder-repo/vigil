import { usePolymarket } from '@/hooks/usePolymarket';
import { ExternalLink } from 'lucide-react';

type MarketItem = {
  id: string;
  question: string;
  probability: number;
  url: string;
  source: 'POLY';
};

const SOURCE_COLORS: Record<string, string> = {
  POLY: '#7C3AED',
};

export function PredictionsPanel() {
  const poly = usePolymarket();

  const isLoading = poly.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] text-text-muted animate-pulse">
          LOADING PREDICTION MARKETS...
        </span>
      </div>
    );
  }

  const markets: MarketItem[] = [
    ...(poly.data ?? []).map((m) => ({
      id: `poly-${m.id}`,
      question: m.question,
      probability: m.probability,
      url: m.url,
      source: 'POLY' as const,
    })),
  ]
    // A market at 1% or 99% is settled in all but name and says nothing about
    // what might happen. The server already keeps only questions about the
    // world and orders them by trading volume; keep that order.
    .filter((m) => m.probability > 0.03 && m.probability < 0.97);

  if (markets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[10px] text-text-muted">NO MARKETS AVAILABLE</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {markets.map((m) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col gap-1 border-b border-border px-3 py-2 transition-colors hover:bg-bg-panel-2"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="flex-1 font-mono text-[10px] leading-tight text-text-secondary group-hover:text-text-primary">
              {m.question}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="font-mono text-[8px] font-bold px-1 rounded"
                style={{
                  color: SOURCE_COLORS[m.source],
                  border: `1px solid ${SOURCE_COLORS[m.source]}40`,
                }}
              >
                {m.source}
              </span>
              <ExternalLink className="h-2.5 w-2.5 text-text-muted opacity-0 group-hover:opacity-100" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-panel-3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round(m.probability * 100)}%`,
                  backgroundColor:
                    m.probability > 0.7
                      ? '#10B981'
                      : m.probability > 0.4
                        ? '#F59E0B'
                        : '#EF4444',
                }}
              />
            </div>
            <span className="font-mono text-[10px] font-bold tabular-nums text-text-primary">
              {Math.round(m.probability * 100)}%
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
