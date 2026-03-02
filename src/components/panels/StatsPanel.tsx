import type { NormalizedEvent, EventCategory } from '@/lib/types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/constants';

export function StatsPanel({ events }: { events: NormalizedEvent[] }) {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.category] = (counts[e.category] || 0) + 1;
  }

  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 py-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          BY CATEGORY
        </span>
        <span className="text-[10px] font-bold tabular-nums text-accent-green">
          {events.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((cat) => {
          const count = counts[cat] || 0;
          const pct = (count / maxCount) * 100;
          return (
            <div key={cat} className="flex items-center gap-1.5">
              <span className="w-12 truncate text-[8px] uppercase text-text-muted">
                {CATEGORY_LABELS[cat].slice(0, 5)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-panel-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: CATEGORY_COLORS[cat],
                  }}
                />
              </div>
              <span className="w-6 text-right text-[9px] tabular-nums text-text-secondary">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
