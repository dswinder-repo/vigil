import type { NormalizedEvent } from '@/lib/types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';

interface EventCardProps {
  event: NormalizedEvent;
  isSelected: boolean;
  onClick: () => void;
}

export function EventCard({ event, isSelected, onClick }: EventCardProps) {
  const color = CATEGORY_COLORS[event.category];
  const ago = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });

  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-bg-panel-2 ${
        isSelected ? 'bg-bg-panel-2 glow-border' : ''
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {CATEGORY_LABELS[event.category]}
        </span>
        <span className="ml-auto font-mono text-[10px] text-text-muted">{ago}</span>
      </div>
      <p className="text-sm font-medium leading-tight text-text-primary">
        {event.title}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-text-secondary">
        {event.summary}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-1 w-1 rounded-full"
              style={{
                backgroundColor: i < event.severity ? color : 'var(--color-border)',
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase text-text-muted">
          {event.source}
        </span>
      </div>
    </button>
  );
}
