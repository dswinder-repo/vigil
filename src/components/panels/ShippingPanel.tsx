import { useMemo, useState } from 'react';
import { Anchor, Ship, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { CHOKEPOINTS, SHIPPING_ROUTES } from '@/lib/geo/shipping-routes';
import { useGDELT } from '@/hooks/useGDELT';
import type { NormalizedEvent } from '@/lib/types';

/**
 * Status comes from the news, not from a fixed list: a chokepoint is flagged
 * when the last 48 hours of conflict and unrest events name it or happen on
 * it. (It used to be hard-coded "Contested" for three straits and "Normal"
 * for the rest, whatever was happening.) Traffic figures are typical
 * peacetime volumes, labelled as such: there is no free live ship-tracking
 * feed.
 */
const CHOKEPOINT_NAMES: Record<string, RegExp> = {
  hormuz: /hormuz/i,
  suez: /suez/i,
  'bab-el-mandeb': /bab[\s-]?el[\s-]?mandeb|red sea shipping|red sea attack/i,
  malacca: /malacca/i,
  panama: /panama canal/i,
  'turkish-straits': /bosphorus|dardanelles|turkish straits/i,
  dover: /strait of dover|english channel/i,
  'good-hope': /cape of good hope/i,
  lombok: /lombok strait/i,
  gibraltar: /strait of gibraltar/i,
};

function incidentsNear(events: NormalizedEvent[], cp: (typeof CHOKEPOINTS)[number]): number {
  const cutoff = Date.now() - 48 * 3_600_000;
  const name = CHOKEPOINT_NAMES[cp.id];
  return events.filter((e) => {
    if (e.category !== 'conflict' && e.category !== 'unrest') return false;
    if (new Date(e.timestamp).getTime() < cutoff) return false;
    if (name?.test(e.title)) return true;
    const [lng, lat] = e.coordinates;
    return Math.abs(lng - cp.coordinates[0]) < 1 && Math.abs(lat - cp.coordinates[1]) < 1;
  }).length;
}

const ROUTE_TYPE_COLORS: Record<string, string> = {
  oil: '#F59E0B',
  container: '#06B6D4',
  bulk: '#A855F7',
};

const ROUTE_TYPE_LABELS: Record<string, string> = {
  oil: 'Oil / Energy',
  container: 'Container Shipping',
  bulk: 'Bulk Cargo',
};

/**
 * Shows global shipping chokepoints and major trade route status.
 * Static data — no live AIS feed (would require commercial API).
 * Acts as a geographic reference layer for the globe.
 */
export function ShippingPanel() {
  const world = useGDELT();
  const incidents = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cp of CHOKEPOINTS) out[cp.id] = incidentsNear(world.data ?? [], cp);
    return out;
  }, [world.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Ship className="h-3 w-3 text-accent-cyan" />
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          {CHOKEPOINTS.length} chokepoints · {SHIPPING_ROUTES.length} routes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Chokepoints */}
        <div className="px-2 py-1">
          <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">
            Strategic Chokepoints
          </div>
          {CHOKEPOINTS.map((cp) => (
            <ChokepointRow key={cp.id} chokepoint={cp} incidents={incidents[cp.id] ?? 0} />
          ))}
        </div>

        {/* Routes */}
        <div className="px-2 py-1 border-t border-border/50">
          <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">
            Major Trade Routes
          </div>
          {SHIPPING_ROUTES.map((route) => (
            <RouteRow key={route.id} route={route} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChokepointRow({
  chokepoint,
  incidents,
}: {
  chokepoint: (typeof CHOKEPOINTS)[number];
  incidents: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isContested = incidents >= 2;
  const mapUrl = `https://maps.google.com?q=${chokepoint.coordinates[1]},${chokepoint.coordinates[0]}`;

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 py-1 hover:bg-bg-panel-2 transition-colors group px-0.5 rounded"
      >
        <div className="shrink-0">
          {isContested ? (
            <AlertTriangle className="h-2.5 w-2.5 text-accent-amber" />
          ) : (
            <CheckCircle className="h-2.5 w-2.5 text-accent-green" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] text-text-primary truncate">
            {chokepoint.name}
          </div>
          <div className="text-[8px] text-text-muted">
            {isContested ? `${incidents} incidents reported (48h) · ` : ''}normally ~{chokepoint.dailyShips} ships/day
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Anchor className="h-2.5 w-2.5 text-text-muted" />
          {expanded ? (
            <ChevronUp className="h-2.5 w-2.5 text-text-muted" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="mx-0.5 mb-1.5 border border-border/50 rounded bg-bg-panel-2 px-2.5 py-1.5 flex flex-col gap-1">
          <p className="font-mono text-[9px] text-text-secondary leading-relaxed">
            {chokepoint.description}
          </p>
          <div className="flex justify-between items-center pt-0.5">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Status</span>
            <span className={`font-mono text-[9px] uppercase font-semibold ${isContested ? 'text-accent-amber' : 'text-accent-green'}`}>
              {isContested ? `${incidents} incidents in 48h` : incidents === 1 ? '1 incident in 48h' : 'No incidents reported'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Normal oil flow</span>
            <span className="font-mono text-[9px] text-text-secondary">{chokepoint.oilFlow}</span>
          </div>
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-text-muted hover:text-text-primary transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View on Google Maps
          </a>
        </div>
      )}
    </div>
  );
}

function RouteRow({
  route,
}: {
  route: (typeof SHIPPING_ROUTES)[number];
}) {
  const [expanded, setExpanded] = useState(false);
  const color = ROUTE_TYPE_COLORS[route.type] || '#06B6D4';
  const label = ROUTE_TYPE_LABELS[route.type] || route.type;

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 py-1 hover:bg-bg-panel-2 transition-colors group px-0.5 rounded"
      >
        <div
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] text-text-primary truncate">{route.name}</div>
          <div className="text-[8px] text-text-muted capitalize">{route.type} route</div>
        </div>
        {expanded ? (
          <ChevronUp className="h-2.5 w-2.5 text-text-muted shrink-0" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
      {expanded && (
        <div className="mx-0.5 mb-1.5 border border-border/50 rounded bg-bg-panel-2 px-2.5 py-1.5 flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Type</span>
            <span className="font-mono text-[9px] font-semibold" style={{ color }}>
              {label}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Waypoints</span>
            <span className="font-mono text-[9px] text-text-secondary">{route.coordinates.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
