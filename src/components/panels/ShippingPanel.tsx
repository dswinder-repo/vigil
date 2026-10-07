import { useMemo, useState, type ReactNode } from 'react';
import { Anchor, Ship, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { CHOKEPOINTS, SHIPPING_ROUTES } from '@/lib/geo/shipping-routes';
import { useGDELT } from '@/hooks/useGDELT';
import { useChokepointTraffic, type ChokepointTraffic as Traffic } from '@/hooks/useChokepointTraffic';
import type { NormalizedEvent } from '@/lib/types';

/**
 * Traffic is measured, not assumed: daily ship transits from IMF PortWatch
 * (satellite AIS data, about three days behind), compared with the same week
 * a year earlier. Until October 2026 this panel showed fixed peacetime
 * figures, so Hormuz read "80 ships/day" while its real traffic was under 3.
 * Incidents come from the last 48 hours of conflict and unrest events that
 * name the chokepoint or happen on it.
 */
function trafficStatus(t?: Traffic): { label: string; color: string; bad: boolean } {
  if (!t || t.change == null) return { label: 'No traffic data', color: 'text-text-muted', bad: false };
  if (t.change <= -50) return { label: 'Severely disrupted', color: 'text-accent-red', bad: true };
  if (t.change <= -20) return { label: 'Below normal', color: 'text-accent-amber', bad: true };
  if (t.change >= 25) return { label: 'Above normal', color: 'text-accent-cyan', bad: false };
  return { label: 'Normal', color: 'text-accent-green', bad: false };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${24 - (v / max) * 22}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const CHOKEPOINT_NAMES: Record<string, RegExp> = {
  'taiwan-strait': /taiwan strait/i,
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

export function ShippingPanel() {
  const world = useGDELT();
  const { data: traffic } = useChokepointTraffic();
  const byId = traffic ?? new Map<string, Traffic>();
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
          {CHOKEPOINTS.length} chokepoints · live transits
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Chokepoints */}
        <div className="px-2 py-1">
          <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">
            Strategic Chokepoints
          </div>
          {[...CHOKEPOINTS]
            .sort((a, b) => (byId.get(a.id)?.change ?? 0) - (byId.get(b.id)?.change ?? 0))
            .map((cp) => (
              <ChokepointRow key={cp.id} chokepoint={cp} incidents={incidents[cp.id] ?? 0} traffic={byId.get(cp.id)} />
            ))}
          <div className="pt-1 text-[8px] text-text-muted">
            Ship transits: <a href="https://portwatch.imf.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-primary">IMF PortWatch</a>, satellite AIS data. 7-day average vs normal (same week in 2019, 2022 and 2023, before the Red Sea attacks).
          </div>
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
  traffic,
}: {
  chokepoint: (typeof CHOKEPOINTS)[number];
  incidents: number;
  traffic?: Traffic;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = trafficStatus(traffic);
  const alarm = status.bad || incidents >= 2;
  const mapUrl = `https://maps.google.com?q=${chokepoint.coordinates[1]},${chokepoint.coordinates[0]}`;
  const change = traffic?.change;

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 py-1 hover:bg-bg-panel-2 transition-colors group px-0.5 rounded"
      >
        <div className="shrink-0">
          {alarm ? (
            <AlertTriangle className={`h-2.5 w-2.5 ${status.bad ? status.color : 'text-accent-amber'}`} />
          ) : (
            <CheckCircle className="h-2.5 w-2.5 text-accent-green" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] text-text-primary truncate">{chokepoint.name}</div>
          <div className="text-[8px] text-text-muted">
            {traffic ? (
              <>
                {traffic.perDay} ships/day
                {change != null && (
                  <span className={status.color}>
                    {' '}· {change > 0 ? '+' : ''}{change}% vs normal
                  </span>
                )}
              </>
            ) : (
              'traffic data unavailable'
            )}
            {incidents >= 2 ? ` · ${incidents} incidents (48h)` : ''}
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
          <p className="font-mono text-[9px] text-text-secondary leading-relaxed">{chokepoint.description}</p>
          <Row label="Traffic" value={<span className={status.color}>{status.label}</span>} />
          {traffic && (
            <>
              <Row label={`Ships/day (7 days to ${fmtDate(traffic.through)})`} value={`${traffic.perDay}`} />
              {traffic.normal != null && <Row label="Normal for this week" value={`${traffic.normal}`} />}
              {traffic.lastYear != null && (
                <Row
                  label="Same week last year"
                  value={`${traffic.lastYear}${traffic.changeVsLastYear != null ? ` (${traffic.changeVsLastYear > 0 ? '+' : ''}${traffic.changeVsLastYear}%)` : ''}`}
                />
              )}
              <Row
                label="Tankers/day"
                value={`${traffic.tankersPerDay}${traffic.tankersNormal != null ? ` (normal ${traffic.tankersNormal})` : ''}`}
              />
              <div className={`pt-0.5 ${status.color}`}>
                <Sparkline values={traffic.series} />
                <div className="flex justify-between font-mono text-[8px] text-text-muted">
                  <span>4 months ago</span>
                  <span>{fmtDate(traffic.through)}</span>
                </div>
              </div>
            </>
          )}
          <Row
            label="Incidents (48h)"
            value={incidents === 0 ? 'None reported' : `${incidents} reported`}
          />
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

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className="font-mono text-[9px] text-text-secondary text-right">{value}</span>
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
