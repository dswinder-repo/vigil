import type { NormalizedEvent } from '@/lib/types';
import { useDashboardStore } from '@/stores/dashboard-store';
import { EventCard } from './EventCard';
import { FilterBar } from './FilterBar';

interface IntelFeedProps {
  events: NormalizedEvent[];
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Every source rates its own output on the same 1-5 scale, so a satellite fire
 * pixel over open country and a shelling report both arrive as a 4. Left to
 * sort on severity and time, the board filled with county weather warnings and
 * thousands of fire detections, and the events worth reading fell off the
 * bottom. These weights say how much each source matters on a board about the
 * world, and the score below combines that with severity and freshness.
 */
const SOURCE_WEIGHT: Record<string, number> = {
  gdelt: 100,
  'reliefweb-conflict': 95,
  'nuclear-activity': 90,
  acled: 90,
  gdacs: 80,
  cisa: 72,
  reliefweb: 70,
  who: 68,
  usgs: 55,
  eonet: 42,
  'space-weather': 36,
  'faa-tfr': 32,
  faatfr: 32,
  meteoalarm: 22,
  nws: 18,
  firms: 8,
};

const DEFAULT_WEIGHT = 50;

function rank(e: { source: string; severity: number; timestamp: string }): number {
  const weight = SOURCE_WEIGHT[e.source] ?? DEFAULT_WEIGHT;
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(e.timestamp).getTime()) / 3_600_000,
  );
  // Halves roughly every eighteen hours, so today outranks yesterday without
  // a major event dropping off the board the moment something newer lands.
  const freshness = Math.pow(0.5, ageHours / 18);
  return weight * e.severity * (0.35 + 0.65 * freshness);
}

/** Rendering several thousand rows is slow and nobody scrolls that far. */
const MAX_ROWS = 300;

export function IntelFeed({ events }: IntelFeedProps) {
  const filters = useDashboardStore((s) => s.filters);
  const selectedEvent = useDashboardStore((s) => s.selectedEvent);
  const selectEvent = useDashboardStore((s) => s.selectEvent);

  const enabledCategories = new Set(
    filters.filter((f) => f.enabled).map((f) => f.category)
  );

  const matching = events.filter((e) => enabledCategories.has(e.category));
  const filtered = matching
    .slice()
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, MAX_ROWS);

  return (
    <div className="flex h-full flex-col">
      <FilterBar />
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <span className="font-mono text-xs text-text-muted">
              NO EVENTS MATCH CURRENT FILTERS
            </span>
          </div>
        ) : (
          filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isSelected={selectedEvent?.id === event.id}
              onClick={() => selectEvent(event)}
            />
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-border px-3 py-1.5">
        <span className="font-mono text-[10px] text-text-muted">
          SHOWING {filtered.length} OF {matching.length} // {events.length} TRACKED
        </span>
      </div>
    </div>
  );
}
