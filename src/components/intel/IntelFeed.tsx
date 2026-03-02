import type { NormalizedEvent } from '@/lib/types';
import { useDashboardStore } from '@/stores/dashboard-store';
import { EventCard } from './EventCard';
import { FilterBar } from './FilterBar';

interface IntelFeedProps {
  events: NormalizedEvent[];
}

export function IntelFeed({ events }: IntelFeedProps) {
  const filters = useDashboardStore((s) => s.filters);
  const selectedEvent = useDashboardStore((s) => s.selectedEvent);
  const selectEvent = useDashboardStore((s) => s.selectEvent);

  const enabledCategories = new Set(
    filters.filter((f) => f.enabled).map((f) => f.category)
  );

  const filtered = events
    .filter((e) => enabledCategories.has(e.category))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
          {filtered.length} EVENTS // {events.length} TOTAL
        </span>
      </div>
    </div>
  );
}
