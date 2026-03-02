import {
  Shield,
  Loader2,
  AlertCircle,
  ExternalLink,
  Crosshair,
  Anchor as AnchorIcon,
  Plane,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMilitaryTracker } from '@/hooks/useMilitaryTracker';
import { MILITARY_BASES, BRANCH_COLORS } from '@/lib/geo/military-bases';
import type { MilitaryEvent } from '@/lib/types';

const TYPE_ICONS: Record<MilitaryEvent['type'], typeof Shield> = {
  naval: AnchorIcon,
  air: Plane,
  strike: Crosshair,
  deployment: Shield,
  movement: Shield,
  exercise: Shield,
  general: Shield,
};

const TYPE_COLORS: Record<MilitaryEvent['type'], string> = {
  naval: '#3B82F6',
  air: '#60A5FA',
  strike: '#EF4444',
  deployment: '#22C55E',
  movement: '#F59E0B',
  exercise: '#A855F7',
  general: '#6B7280',
};

export function MilitaryPanel() {
  const { data: events, isLoading, isError } = useMilitaryTracker();

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Shield className="h-3 w-3 text-accent-red" />
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          {isLoading
            ? 'Scanning...'
            : `${events?.length ?? 0} events · ${MILITARY_BASES.length} bases`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Live Events */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <AlertCircle className="h-3 w-3 text-red-500" />
            <span className="text-[9px] text-text-muted">MILTRACK OFFLINE</span>
          </div>
        ) : events && events.length > 0 ? (
          <>
            <div className="px-2 py-1">
              <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">
                Recent Activity
              </div>
              {events.slice(0, 15).map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-4">
            <span className="text-[9px] text-text-muted">No military events detected</span>
          </div>
        )}

        {/* Static Bases */}
        <div className="px-2 py-1 border-t border-border/50">
          <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">
            Major Installations ({MILITARY_BASES.length})
          </div>
          {MILITARY_BASES.map((base) => (
            <BaseRow key={base.id} base={base} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: MilitaryEvent }) {
  const Icon = TYPE_ICONS[event.type] || Shield;
  const color = TYPE_COLORS[event.type] || '#6B7280';

  let ago = '';
  try {
    ago = formatDistanceToNow(new Date(event.timestamp), { addSuffix: false });
  } catch {
    ago = '—';
  }

  return (
    <div className="border-b border-border/30 px-1 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-2.5 w-2.5 shrink-0" style={{ color }} />
        <span
          className="text-[8px] uppercase tracking-wider shrink-0"
          style={{ color }}
        >
          {event.type}
        </span>
        <span className="text-[8px] text-text-muted ml-auto shrink-0">{ago}</span>
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-accent-green transition-colors shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <p className="text-[10px] text-text-primary leading-tight mt-0.5 line-clamp-2">
        {event.title}
      </p>
      <div className="text-[8px] text-text-muted mt-0.5">{event.region}</div>
    </div>
  );
}

function BaseRow({ base }: { base: (typeof MILITARY_BASES)[number] }) {
  const color = BRANCH_COLORS[base.branch] || '#6B7280';

  return (
    <div className="flex items-center gap-1.5 py-1 border-b border-border/30">
      <div
        className="h-2 w-2 rounded-sm shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-text-primary truncate">{base.name}</div>
        <div className="text-[8px] text-text-muted">
          {base.country} · {base.region}
        </div>
      </div>
    </div>
  );
}
