import { Shield } from 'lucide-react';
import { useMilitaryTracker } from '@/hooks/useMilitaryTracker';
import { formatDistanceToNow } from 'date-fns';

const TYPE_COLORS: Record<string, string> = {
  naval: '#3B82F6',
  air: '#60A5FA',
  strike: '#EF4444',
  deployment: '#22C55E',
  movement: '#F59E0B',
  exercise: '#A855F7',
  general: '#6B7280',
};

export function MilitaryTicker() {
  const { data: events, isLoading, isError } = useMilitaryTracker();

  if (isLoading || !events || events.length === 0) {
    return (
      <div className="flex h-full items-center px-3 gap-2">
        <Shield className="h-3 w-3 text-accent-red shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-red shrink-0">
          MIL-TRACK
        </span>
        <span className="text-[10px] text-text-muted animate-pulse">
          {isLoading
            ? 'SCANNING...'
            : isError
              ? 'SOURCE UNAVAILABLE'
              : 'NO EVENTS IN CURRENT WINDOW'}
        </span>
      </div>
    );
  }

  const entries = events.slice(0, 25).map((ev) => {
    let ago = '';
    try {
      ago = formatDistanceToNow(new Date(ev.timestamp), { addSuffix: false });
    } catch {
      ago = '';
    }
    const color = TYPE_COLORS[ev.type] || '#6B7280';
    const typeTag = `<span style="color:${color}">[${ev.type.toUpperCase()}]</span>`;
    const regionTag = ev.region ? `<span class="text-text-muted">${escapeHtml(ev.region)}</span> ` : '';
    const agoTag = ago ? ` <span class="text-text-muted">(${escapeHtml(ago)})</span>` : '';
    const inner = `${typeTag} ${regionTag}${escapeHtml(ev.title)}${agoTag}`;
    return ev.url
      ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${inner}</a>`
      : inner;
  });

  const tickerHtml = entries.join('&nbsp;&nbsp;\u25C6&nbsp;&nbsp;');
  const duration = Math.max(180, entries.length * 12);

  return (
    <div className="flex h-full items-center overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-r border-border px-3 h-full">
        <Shield className="h-3 w-3 text-accent-red" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-red whitespace-nowrap">
          MIL-TRACK
        </span>
      </div>
      <div className="flex flex-1 items-center overflow-hidden">
        <div
          className="flex whitespace-nowrap text-[11px] text-text-secondary"
          style={{ animation: `ticker-scroll ${duration}s linear infinite` }}
        >
          <span className="px-4" dangerouslySetInnerHTML={{ __html: tickerHtml }} />
          <span className="px-4" dangerouslySetInnerHTML={{ __html: tickerHtml }} />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
