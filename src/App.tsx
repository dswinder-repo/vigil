import { useMemo } from 'react';
import { ScanlineOverlay } from '@/components/shared/ScanlineOverlay';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { HeaderBar } from '@/components/layout/HeaderBar';
import { PanelShell } from '@/components/layout/PanelShell';
import { BottomTicker } from '@/components/layout/BottomTicker';
import { MilitaryTicker } from '@/components/layout/MilitaryTicker';
import { MarketsTicker } from '@/components/layout/MarketsTicker';
import { useNuclearActivity } from '@/hooks/useNuclearActivity';
import { WorldMap } from '@/components/map/WorldMap';
import { IntelFeed } from '@/components/intel/IntelFeed';
import { EventDetail } from '@/components/intel/EventDetail';
import { MarketsPanel } from '@/components/panels/MarketsPanel';
import { PredictionsPanel } from '@/components/panels/PredictionsPanel';
import { OSINTPanel } from '@/components/panels/OSINTPanel';
import { ShippingPanel } from '@/components/panels/ShippingPanel';
import { ThreatPanel } from '@/components/panels/ThreatPanel';
import { useUSGS } from '@/hooks/useUSGS';
import { useEONET } from '@/hooks/useEONET';
import { useGDELT } from '@/hooks/useGDELT';
import { useReliefWeb } from '@/hooks/useReliefWeb';
import { useReliefWebConflict } from '@/hooks/useReliefWebConflict';
import { useNWSAlerts } from '@/hooks/useNWSAlerts';
import { useGDACS } from '@/hooks/useGDACS';
import { useCISA } from '@/hooks/useCISA';
import { useNASAFIRMS } from '@/hooks/useNASAFIRMS';
import { useWHO } from '@/hooks/useWHO';
import { useSpaceWeather } from '@/hooks/useSpaceWeather';
import { useMeteoalarm } from '@/hooks/useMeteoalarm';
import { useAlerts } from '@/hooks/useAlerts';
import { useFAATFR } from '@/hooks/useFAATFR';
import { useNuclearProximityAlerts } from '@/hooks/useNuclearProximityAlerts';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { NormalizedEvent } from '@/lib/types';
import { deduplicateEvents } from '@/lib/deduplicateEvents';

export default function App() {
  const usgs = useUSGS();
  const eonet = useEONET();
  const gdelt = useGDELT();
  const reliefweb = useReliefWeb();
  const reliefwebConflict = useReliefWebConflict();
  const nws = useNWSAlerts();
  const gdacs = useGDACS();
  const cisa = useCISA();
  const firms = useNASAFIRMS();
  const who = useWHO();
  const spaceWeather = useSpaceWeather();
  const meteoalarm = useMeteoalarm();
  const faaTfr = useFAATFR();
  const nuclearActivity = useNuclearActivity();
  const selectedEvent = useDashboardStore((s) => s.selectedEvent);
  const filters = useDashboardStore((s) => s.filters);

  useKeyboardShortcuts();

  const allEvents: NormalizedEvent[] = useMemo(
    () => deduplicateEvents([
      ...(usgs.data ?? []),
      ...(eonet.data ?? []),
      ...(gdelt.data ?? []),
      ...(reliefweb.data ?? []),
      ...(reliefwebConflict.data ?? []),
      ...(nws.data?.events ?? []),
      ...(gdacs.data ?? []),
      ...(cisa.data ?? []),
      ...(firms.data ?? []),
      ...(who.data ?? []),
      ...(spaceWeather.data ?? []),
      ...(meteoalarm.data ?? []),
      ...(faaTfr.data ?? []),
      ...(nuclearActivity.data ?? []),
    ]),
    [usgs.data, eonet.data, gdelt.data, reliefweb.data, reliefwebConflict.data, nws.data, gdacs.data, cisa.data,
     firms.data, who.data, spaceWeather.data, meteoalarm.data, faaTfr.data, nuclearActivity.data]
  );

  useAlerts(allEvents);
  useNuclearProximityAlerts(allEvents);

  const filteredEvents = useMemo(() => {
    const enabled = new Set(
      filters.filter((f) => f.enabled).map((f) => f.category)
    );
    return allEvents.filter((e) => {
      if (!enabled.has(e.category)) return false;
      // Political events now have a dedicated GDELT query — keep severity 2+
      // (severity 1 = generic diplomatic filler, not worth displaying)
      if (e.category === 'political' && e.severity < 2) return false;
      // Conflict severity floor — with business-context filtering in normalizers,
      // severity 1 conflict events are likely low-signal noise
      if (e.category === 'conflict' && e.severity < 2) return false;
      return true;
    });
  }, [allEvents, filters]);

  // Only sources that can actually return something. ReliefWeb, Meteoalarm and
  // the FAA TFR feed were retired upstream; listing them put permanent red
  // lights in the header for feeds that are never coming back.
  const sourceStatuses = {
    usgs: getStatus(usgs),
    eonet: getStatus(eonet),
    gdelt: getStatus(gdelt),
    nws: getStatus(nws),
    gdacs: getStatus(gdacs),
    cisa: getStatus(cisa),
    firms: getStatus(firms),
    who: getStatus(who),
    'space-weather': getStatus(spaceWeather),
    'nuclear-activity': getStatus(nuclearActivity),
  };

  return (
    <div className="command-grid">
      <ScanlineOverlay />

      {/* HEADER */}
      <div data-area="header">
        <HeaderBar sourceStatuses={sourceStatuses} events={filteredEvents} />
      </div>

      {/* LEFT — Intel Feed + Sea Routes */}
      <div data-area="left">
        <div className="left-stack">
          {selectedEvent ? (
            <EventDetail />
          ) : (
            <PanelShell title="INTEL FEED">
              <IntelFeed events={allEvents} />
            </PanelShell>
          )}
          <PanelShell title="SEA ROUTES">
            <ShippingPanel />
          </PanelShell>
        </div>
      </div>

      {/* CENTER — Globe */}
      <div data-area="globe">
        <ErrorBoundary>
          <WorldMap events={filteredEvents} />
        </ErrorBoundary>
      </div>

      {/* RIGHT — Stacked Panels */}
      <div data-area="right">
        <div className="right-stack">
          <PanelShell title="MARKETS">
            <MarketsPanel />
          </PanelShell>
          <PanelShell title="PREDICTIONS">
            <PredictionsPanel />
          </PanelShell>
          <PanelShell title="OSINT FEED">
            <OSINTPanel />
          </PanelShell>
          <PanelShell title="BILATERAL THREAT INDEX">
            <ThreatPanel />
          </PanelShell>
        </div>
      </div>

      {/* BOTTOM ROW 1 — Military Ticker */}
      <div data-area="ticker1">
        <MilitaryTicker />
      </div>

      {/* BOTTOM ROW 2 — News Ticker */}
      <div data-area="ticker2">
        <BottomTicker />
      </div>

      {/* BOTTOM ROW 3 — Markets Ticker */}
      <div data-area="ticker3">
        <MarketsTicker />
      </div>
    </div>
  );
}

function getStatus(query: {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
}): 'online' | 'degraded' | 'offline' {
  if (query.isError) return 'offline';
  if (query.isLoading) return 'degraded';
  if (query.data) return 'online';
  return 'degraded';
}
