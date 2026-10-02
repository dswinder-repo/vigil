import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { NormalizedEvent } from '@/lib/types';
import { CATEGORY_COLORS, MAP_STYLE, INITIAL_VIEW } from '@/lib/constants';
import { useDashboardStore } from '@/stores/dashboard-store';
import { shippingRoutesToGeoJSON, chokepointsToGeoJSON } from '@/lib/geo/shipping-routes';
import { militaryBasesToGeoJSON, BRANCH_COLORS } from '@/lib/geo/military-bases';
import { NUCLEAR_FACILITIES } from '@/lib/geo/nuclear-facilities';
import { useOpenSky } from '@/hooks/useOpenSky';

const SOURCE_ID = 'events';
const MARKER_LAYER = 'event-markers';
const GLOW_LAYER = 'event-markers-glow';
const CLUSTER_LAYER = 'event-clusters';
const CLUSTER_COUNT_LAYER = 'event-cluster-count';

// Shipping / Military layer IDs
const SHIPPING_ROUTES_SOURCE = 'shipping-routes';
const SHIPPING_ROUTES_LAYER = 'shipping-route-lines';
const CHOKEPOINTS_SOURCE = 'chokepoints';
const CHOKEPOINTS_LAYER = 'chokepoint-markers';
const CHOKEPOINTS_GLOW = 'chokepoint-glow';
const MIL_BASES_SOURCE = 'military-bases';
const MIL_BASES_LAYER = 'mil-base-markers';
const MIL_BASES_GLOW = 'mil-base-glow';
const FLIGHTS_SOURCE = 'flights';
const FLIGHTS_LAYER = 'flight-markers';
const FLIGHTS_GLOW = 'flight-markers-glow';
const NUCLEAR_SOURCE = 'nuclear-facilities';
const NUCLEAR_LAYER = 'nuclear-markers';
const NUCLEAR_GLOW = 'nuclear-glow';

const STROKE_COLORS: Record<string, string> = {
  conflict: '#FF6B6B',
  disaster: '#FFB84D',
  disease: '#C084FC',
  political: '#60A5FA',
  cyber: '#22D3EE',
  unrest: '#FB923C',
  humanitarian: '#F472B6',
};

function eventsToGeoJSON(
  events: NormalizedEvent[],
  selectedId?: string
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events
      .filter(
        (e) =>
          Array.isArray(e.coordinates) &&
          e.coordinates.length >= 2 &&
          isFinite(e.coordinates[0]) &&
          isFinite(e.coordinates[1])
      )
      .map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: e.coordinates },
        properties: {
          id: e.id,
          category: e.category,
          severity: e.severity,
          selected: e.id === selectedId ? 1 : 0,
        },
      })),
  };
}

function nuclearFacilitiesToGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: NUCLEAR_FACILITIES.map((f) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
      properties: {
        id: f.id,
        name: f.name,
        country: f.country,
        status: f.status,
        reactors: f.reactors,
        color: f.status === 'operational' ? '#FCD34D' : f.status === 'under_construction' ? '#F97316' : '#6B7280',
      },
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function catMatch(colors: Record<string, string>): any {
  const expr: unknown[] = ['match', ['get', 'category']];
  for (const [cat, color] of Object.entries(colors)) {
    expr.push(cat, color);
  }
  expr.push('#00cc44');
  return expr;
}

export function WorldMap({ events }: { events: NormalizedEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // State as well as a ref: the effects below need to run again once the map
  // is ready, and a ref changing does not re-render anything.
  const [mapReady, setMapReady] = useState(false);
  const eventsRef = useRef(events);
  const selectEvent = useDashboardStore((s) => s.selectEvent);
  const selectedEvent = useDashboardStore((s) => s.selectedEvent);
  const showMilitaryBases = useDashboardStore((s) => s.showMilitaryBases);
  const toggleMilitaryBases = useDashboardStore((s) => s.toggleMilitaryBases);
  const showFlights = useDashboardStore((s) => s.showFlights);
  const toggleFlights = useDashboardStore((s) => s.toggleFlights);
  const showNuclearFacilities = useDashboardStore((s) => s.showNuclearFacilities);
  const toggleNuclearFacilities = useDashboardStore((s) => s.toggleNuclearFacilities);
  const openSky = useOpenSky();
  const selectRef = useRef(selectEvent);

  eventsRef.current = events;
  selectRef.current = selectEvent;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
        zoom: INITIAL_VIEW.zoom,
        attributionControl: false,
      });
    } catch (err) {
      console.error('[WorldMap] Failed to create map:', err);
      return;
    }

    // Global error handler for MapLibre
    map.on('error', (e) => {
      console.warn('[WorldMap] MapLibre error:', e.error?.message ?? e);
    });

    map.on('load', () => {
      try {
        // Globe projection — set after load for safety
        map.setProjection({ type: 'globe' });
      } catch (err) {
        console.warn('[WorldMap] Globe projection not supported, using mercator:', err);
      }

      try {
        // Atmosphere effect for globe edges
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog?.({
          range: [0.5, 10],
          color: '#000000',
          'high-color': '#050510',
          'horizon-blend': 0.03,
          'space-color': '#000000',
          'star-intensity': 0.5,
        });
      } catch {
        // Fog not supported in this version
      }

      try {
        // GeoJSON source for all events — with native clustering enabled
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: eventsToGeoJSON(eventsRef.current),
          cluster: true,
          clusterMaxZoom: 7,   // Stop clustering above zoom 7 (country-level)
          clusterRadius: 60,   // Pixel radius for clustering
        });

        // Cluster circles (rendered before individual markers so markers appear on top)
        map.addLayer({
          id: CLUSTER_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#6366F1',   // indigo for small clusters (< 10)
              10,
              '#F59E0B',   // amber for medium clusters (10–50)
              50,
              '#EF4444',   // red for large clusters (50+)
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16,    // 16px for < 10
              10,
              22,    // 22px for 10–50
              50,
              30,    // 30px for 50+
            ],
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.3)',
          },
        });

        // Cluster count labels
        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
          },
          paint: {
            'text-color': '#ffffff',
          },
        });

        // Outer glow / halo — only for unclustered points
        map.addLayer({
          id: GLOW_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 1, 8, 5, 22],
            'circle-color': catMatch(CATEGORY_COLORS),
            'circle-opacity': 0.15,
            'circle-blur': 1,
          },
        });

        // Main markers — only for unclustered points
        map.addLayer({
          id: MARKER_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 1, 3, 5, 10],
            'circle-color': catMatch(CATEGORY_COLORS),
            'circle-opacity': 0.9,
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 1.5],
            'circle-stroke-color': catMatch(STROKE_COLORS),
          },
        });

        // ── Shipping route lines ──
        map.addSource(SHIPPING_ROUTES_SOURCE, {
          type: 'geojson',
          data: shippingRoutesToGeoJSON(),
        });
        map.addLayer({
          id: SHIPPING_ROUTES_LAYER,
          type: 'line',
          source: SHIPPING_ROUTES_SOURCE,
          paint: {
            'line-color': [
              'match', ['get', 'type'],
              'oil', '#F59E0B',
              'container', '#06B6D4',
              'bulk', '#A855F7',
              '#06B6D4',
            ],
            'line-width': 1.2,
            'line-opacity': 0.35,
            'line-dasharray': [4, 3],
          },
        });

        // ── Chokepoint markers ──
        map.addSource(CHOKEPOINTS_SOURCE, {
          type: 'geojson',
          data: chokepointsToGeoJSON(),
        });
        map.addLayer({
          id: CHOKEPOINTS_GLOW,
          type: 'circle',
          source: CHOKEPOINTS_SOURCE,
          paint: {
            'circle-radius': 8,
            'circle-color': '#F59E0B',
            'circle-opacity': 0.12,
            'circle-blur': 0.8,
          },
        });
        map.addLayer({
          id: CHOKEPOINTS_LAYER,
          type: 'circle',
          source: CHOKEPOINTS_SOURCE,
          paint: {
            'circle-radius': 4,
            'circle-color': '#F59E0B',
            'circle-opacity': 0.8,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#FCD34D',
          },
        });

        // ── Military base markers ──
        map.addSource(MIL_BASES_SOURCE, {
          type: 'geojson',
          data: militaryBasesToGeoJSON(),
        });

        // Branch-based color matching
        const branchMatch: unknown[] = ['match', ['get', 'branch']];
        for (const [branch, color] of Object.entries(BRANCH_COLORS)) {
          branchMatch.push(branch, color);
        }
        branchMatch.push('#A855F7'); // fallback

        map.addLayer({
          id: MIL_BASES_GLOW,
          type: 'circle',
          source: MIL_BASES_SOURCE,
          layout: {
            visibility: 'none',
          },
          paint: {
            'circle-radius': 10,
            'circle-color': branchMatch as maplibregl.ExpressionSpecification,
            'circle-opacity': 0.1,
            'circle-blur': 0.8,
          },
        });
        map.addLayer({
          id: MIL_BASES_LAYER,
          type: 'circle',
          source: MIL_BASES_SOURCE,
          layout: {
            visibility: 'none',
          },
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              2, 3,
              8, 5,
            ],
            'circle-color': '#4ADE80',
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.5,
          },
        });

        // Click event markers
        map.on('click', MARKER_LAYER, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) {
            const ev = eventsRef.current.find((x) => x.id === id);
            if (ev) selectRef.current(ev);
          }
        });

        map.on('mouseenter', MARKER_LAYER, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', MARKER_LAYER, () => {
          map.getCanvas().style.cursor = '';
        });

        // Click on cluster → zoom to expand
        map.on('click', CLUSTER_LAYER, (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
          if (!features.length) return;
          const clusterId = features[0].properties?.cluster_id as number;
          const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
          source
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => {
              const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
              map.easeTo({ center: coords, zoom: zoom + 0.5 });
            })
            .catch(() => {});
        });

        // Pointer cursor on cluster hover
        map.on('mouseenter', CLUSTER_LAYER, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', CLUSTER_LAYER, () => {
          map.getCanvas().style.cursor = '';
        });

        // ── Chokepoint popups ──
        map.on('click', CHOKEPOINTS_LAYER, (e) => {
          const props = e.features?.[0]?.properties;
          const coords = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
          if (!props || !coords) return;
          const ships = props.dailyShips ? `<div class="vigil-popup-stat">Daily vessels: ~${Number(props.dailyShips).toLocaleString()}</div>` : '';
          const oil = props.oilFlow ? `<div class="vigil-popup-stat">Oil flow: ${props.oilFlow}</div>` : '';
          new maplibregl.Popup({ className: 'vigil-popup', closeButton: false, maxWidth: '260px' })
            .setLngLat(coords as [number, number])
            .setHTML(
              `<div class="vigil-popup-inner">
                <div class="vigil-popup-title">${props.name}</div>
                <div class="vigil-popup-desc">${props.description || ''}</div>
                ${ships}${oil}
              </div>`
            )
            .addTo(map);
        });

        // ── Military base popups ──
        map.on('click', MIL_BASES_LAYER, (e) => {
          const props = e.features?.[0]?.properties;
          const coords = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
          if (!props || !coords) return;
          new maplibregl.Popup({ className: 'vigil-popup', closeButton: false, maxWidth: '260px' })
            .setLngLat(coords as [number, number])
            .setHTML(
              `<div class="vigil-popup-inner">
                <div class="vigil-popup-title">${props.name}</div>
                <div class="vigil-popup-meta">${(props.branch ?? '').toUpperCase()} · ${props.country ?? ''}</div>
              </div>`
            )
            .addTo(map);
        });

        // ── Shipping route popups ──
        map.on('click', SHIPPING_ROUTES_LAYER, (e) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          new maplibregl.Popup({ className: 'vigil-popup', closeButton: false, maxWidth: '240px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="vigil-popup-inner">
                <div class="vigil-popup-title">${props.name}</div>
                <div class="vigil-popup-meta">Type: ${props.type ?? 'trade route'}</div>
              </div>`
            )
            .addTo(map);
        });

        // Cursor change for overlay layers
        for (const layer of [CHOKEPOINTS_LAYER, MIL_BASES_LAYER, SHIPPING_ROUTES_LAYER]) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }

        // ── Flight tracking layer ──
        map.addSource(FLIGHTS_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: FLIGHTS_GLOW,
          type: 'circle',
          source: FLIGHTS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 8,
            'circle-color': '#67E8F9',
            'circle-opacity': 0.1,
            'circle-blur': 0.6,
          },
        });
        map.addLayer({
          id: FLIGHTS_LAYER,
          type: 'circle',
          source: FLIGHTS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 3,
            'circle-color': '#67E8F9',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.4,
          },
        });

        // Flight popups
        map.on('click', FLIGHTS_LAYER, (e) => {
          const props = e.features?.[0]?.properties;
          const coords = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
          if (!props || !coords) return;
          const alt = props.altitude ? `<div class="vigil-popup-stat">Alt: ${Math.round(props.altitude).toLocaleString()}m</div>` : '';
          const spd = props.velocity ? `<div class="vigil-popup-stat">Speed: ${Math.round(props.velocity * 3.6)} km/h</div>` : '';
          new maplibregl.Popup({ className: 'vigil-popup', closeButton: false, maxWidth: '220px' })
            .setLngLat(coords as [number, number])
            .setHTML(
              `<div class="vigil-popup-inner">
                <div class="vigil-popup-title">${props.callsign || props.icao24 || 'Unknown'}</div>
                ${alt}${spd}
              </div>`
            )
            .addTo(map);
        });
        map.on('mouseenter', FLIGHTS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', FLIGHTS_LAYER, () => { map.getCanvas().style.cursor = ''; });

        // ── Nuclear facility layer ──
        map.addSource(NUCLEAR_SOURCE, {
          type: 'geojson',
          data: nuclearFacilitiesToGeoJSON(),
        });
        map.addLayer({
          id: NUCLEAR_GLOW,
          type: 'circle',
          source: NUCLEAR_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 12,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.12,
            'circle-blur': 0.8,
          },
        });
        map.addLayer({
          id: NUCLEAR_LAYER,
          type: 'circle',
          source: NUCLEAR_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              2, 3,
              8, 5,
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.5,
          },
        });

        // Nuclear facility popups
        map.on('click', NUCLEAR_LAYER, (e) => {
          const props = e.features?.[0]?.properties;
          const coords = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
          if (!props || !coords) return;
          const statusLabel = props.status === 'operational' ? 'Operational' : props.status === 'under_construction' ? 'Under Construction' : 'Shutdown';
          new maplibregl.Popup({ className: 'vigil-popup', closeButton: false, maxWidth: '260px' })
            .setLngLat(coords as [number, number])
            .setHTML(
              `<div class="vigil-popup-inner">
                <div class="vigil-popup-title">${props.name}</div>
                <div class="vigil-popup-meta">${props.country} · ${statusLabel}</div>
                <div class="vigil-popup-stat">Reactors: ${props.reactors}</div>
              </div>`
            )
            .addTo(map);
        });
        map.on('mouseenter', NUCLEAR_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', NUCLEAR_LAYER, () => { map.getCanvas().style.cursor = ''; });

        readyRef.current = true;
        setMapReady(true);
      } catch (err) {
        console.error('[WorldMap] Failed to setup layers:', err);
      }
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;

    // MapLibre sizes its canvas when it is created and ignores the first
    // resize notice after that. If the layout settles in between (panels
    // filling in, the window opening), the canvas stays at its first size and
    // the map shows blank. Follow the container ourselves.
    const container = containerRef.current;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    map.once('load', () => map.resize());

    return () => {
      resizeObserver.disconnect();
      try {
        readyRef.current = false;
        setMapReady(false);
        map.remove();
      } catch {
        // Ignore cleanup errors
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync event data to map source
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    try {
      const src = mapRef.current.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      src?.setData(eventsToGeoJSON(events, selectedEvent?.id));
    } catch (err) {
      console.warn('[WorldMap] Failed to update source data:', err);
    }
  }, [events, selectedEvent, mapReady]);

  // Sync military bases layer visibility from store
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    try {
      const visibility = showMilitaryBases ? 'visible' : 'none';
      mapRef.current.setLayoutProperty(MIL_BASES_LAYER, 'visibility', visibility);
      mapRef.current.setLayoutProperty(MIL_BASES_GLOW, 'visibility', visibility);
    } catch (err) {
      console.warn('[WorldMap] Failed to toggle military bases layer:', err);
    }
  }, [showMilitaryBases, mapReady]);

  // Sync flight data to map source
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    try {
      const src = mapRef.current.getSource(FLIGHTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
      const aircraft = openSky.data ?? [];
      src?.setData({
        type: 'FeatureCollection',
        features: aircraft.map((a) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [a.longitude, a.latitude] },
          properties: {
            icao24: a.icao24,
            callsign: a.callsign,
            altitude: a.altitude,
            velocity: a.velocity,
            heading: a.heading,
          },
        })),
      });
    } catch (err) {
      console.warn('[WorldMap] Failed to update flights:', err);
    }
  }, [openSky.data, mapReady]);

  // Sync flights layer visibility
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    try {
      const visibility = showFlights ? 'visible' : 'none';
      mapRef.current.setLayoutProperty(FLIGHTS_LAYER, 'visibility', visibility);
      mapRef.current.setLayoutProperty(FLIGHTS_GLOW, 'visibility', visibility);
    } catch (err) {
      console.warn('[WorldMap] Failed to toggle flights layer:', err);
    }
  }, [showFlights, mapReady]);

  // Sync nuclear facilities layer visibility
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    try {
      const visibility = showNuclearFacilities ? 'visible' : 'none';
      mapRef.current.setLayoutProperty(NUCLEAR_LAYER, 'visibility', visibility);
      mapRef.current.setLayoutProperty(NUCLEAR_GLOW, 'visibility', visibility);
    } catch (err) {
      console.warn('[WorldMap] Failed to toggle nuclear facilities layer:', err);
    }
  }, [showNuclearFacilities, mapReady]);

  // Fly to selected
  const flyTo = useCallback((event: NormalizedEvent) => {
    try {
      mapRef.current?.flyTo({ center: event.coordinates, zoom: 6, duration: 1500 });
    } catch (err) {
      console.warn('[WorldMap] flyTo failed:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedEvent) flyTo(selectedEvent);
  }, [selectedEvent, flyTo]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Map layer controls — top-right corner */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={toggleMilitaryBases}
          title={showMilitaryBases ? 'Hide military bases' : 'Show military bases'}
          className={[
            'px-2 py-1 text-[10px] font-bold tracking-widest uppercase rounded',
            'border transition-colors duration-150',
            'shadow-sm focus:outline-none focus:ring-1 focus:ring-offset-0',
            showMilitaryBases
              ? 'bg-[#4ADE80] text-black border-[#4ADE80] focus:ring-[#4ADE80]'
              : 'bg-black/60 text-[#4ADE80] border-[#4ADE80]/50 hover:bg-[#4ADE80]/10 focus:ring-[#4ADE80]',
          ].join(' ')}
        >
          BASES
        </button>
        <button
          onClick={toggleFlights}
          title={showFlights ? 'Hide flights' : 'Show live flights'}
          className={[
            'px-2 py-1 text-[10px] font-bold tracking-widest uppercase rounded',
            'border transition-colors duration-150',
            'shadow-sm focus:outline-none focus:ring-1 focus:ring-offset-0',
            showFlights
              ? 'bg-[#67E8F9] text-black border-[#67E8F9] focus:ring-[#67E8F9]'
              : 'bg-black/60 text-[#67E8F9] border-[#67E8F9]/50 hover:bg-[#67E8F9]/10 focus:ring-[#67E8F9]',
          ].join(' ')}
        >
          FLIGHTS
        </button>
        <button
          onClick={toggleNuclearFacilities}
          title={showNuclearFacilities ? 'Hide nuclear facilities' : 'Show nuclear facilities'}
          className={[
            'px-2 py-1 text-[10px] font-bold tracking-widest uppercase rounded',
            'border transition-colors duration-150',
            'shadow-sm focus:outline-none focus:ring-1 focus:ring-offset-0',
            showNuclearFacilities
              ? 'bg-[#FCD34D] text-black border-[#FCD34D] focus:ring-[#FCD34D]'
              : 'bg-black/60 text-[#FCD34D] border-[#FCD34D]/50 hover:bg-[#FCD34D]/10 focus:ring-[#FCD34D]',
          ].join(' ')}
        >
          NUCLEAR
        </button>
      </div>
    </div>
  );
}
