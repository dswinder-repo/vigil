import { useState, useMemo } from 'react';
import { Satellite, AlertCircle, ExternalLink } from 'lucide-react';
import type { NormalizedEvent } from '@/lib/types';

interface Props {
  event: NormalizedEvent;
}

/** NASA GIBS WMS — VIIRS True Color (~375 m res, daily refresh) */
function gibsUrl(lon: number, lat: number, span: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const date = d.toISOString().split('T')[0];
  // WMS 1.3.0 EPSG:4326 BBOX = south, west, north, east
  const south = Math.max(-90, lat - span);
  const north = Math.min(90, lat + span);
  const west = Math.max(-180, lon - span * 1.6);
  const east = Math.min(180, lon + span * 1.6);
  return (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi' +
    '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor' +
    '&FORMAT=image/jpeg&TRANSPARENT=false&CRS=EPSG:4326' +
    `&WIDTH=480&HEIGHT=300&BBOX=${south},${west},${north},${east}&TIME=${date}`
  );
}

/** Regional weather satellite based on longitude */
function weatherSatUrl(lon: number): { url: string; label: string } {
  if (lon < -20) {
    return {
      url: 'https://cdn.star.nesdis.noaa.gov/GOES16/ABI/FD/GEOCOLOR/339x339.jpg',
      label: 'GOES-East',
    };
  }
  if (lon < 80) {
    // Europe / Africa / Middle East — Meteosat coverage, but GOES-East full disk covers Atlantic
    return {
      url: 'https://cdn.star.nesdis.noaa.gov/GOES16/ABI/FD/GEOCOLOR/339x339.jpg',
      label: 'GOES-East (Full Disk)',
    };
  }
  return {
    url: 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/339x339.jpg',
    label: 'GOES-West',
  };
}

function worldviewUrl(lon: number, lat: number): string {
  return `https://worldview.earthdata.nasa.gov/?v=${lon - 5},${lat - 5},${lon + 5},${lat + 5}&l=VIIRS_SNPP_CorrectedReflectance_TrueColor,Coastlines_15m`;
}

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function CamerasPanel({ event }: Props) {
  const [lon, lat] = event.coordinates;
  const [satLoaded, setSatLoaded] = useState(false);
  const [satError, setSatError] = useState(false);
  const [wxError, setWxError] = useState(false);

  const satUrl = useMemo(() => gibsUrl(lon, lat, 5), [lon, lat]);
  const wx = useMemo(() => weatherSatUrl(lon), [lon]);
  const wvUrl = useMemo(() => worldviewUrl(lon, lat), [lon, lat]);

  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  return (
    <div className="mt-4 border-t border-border pt-3">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Satellite className="h-3 w-3 text-accent-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            SATELLITE CONTEXT
          </span>
        </div>
        <a
          href={wvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[8px] text-accent-cyan hover:text-accent-cyan-glow transition-colors flex items-center gap-1"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          NASA WORLDVIEW
        </a>
      </div>

      <div className="space-y-2">
        {/* VIIRS satellite view centered on event */}
        {!satError ? (
          <div className="relative rounded border border-border overflow-hidden bg-bg-panel-2">
            {!satLoaded && (
              <div className="flex items-center justify-center h-24">
                <span className="font-mono text-[9px] text-text-muted animate-pulse">
                  ACQUIRING SATELLITE IMAGERY...
                </span>
              </div>
            )}
            <img
              src={satUrl}
              alt={`Satellite view near ${event.title}`}
              className={`w-full h-auto block ${satLoaded ? '' : 'hidden'}`}
              loading="lazy"
              onLoad={() => setSatLoaded(true)}
              onError={() => setSatError(true)}
            />
            {satLoaded && (
              <>
                {/* Crosshair target overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-5 h-5 border border-accent-red/80 rounded-full" />
                  <div className="absolute w-px h-3 bg-accent-red/50" />
                  <div className="absolute w-3 h-px bg-accent-red/50" />
                </div>
                {/* Info strip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-0.5 flex items-center justify-between">
                  <span className="font-mono text-[8px] text-text-muted">
                    NASA VIIRS · {yesterday}
                  </span>
                  <span className="font-mono text-[8px] text-accent-cyan">
                    {formatCoord(lat, lon)}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded border border-border bg-bg-panel-2 px-3 py-4 justify-center">
            <AlertCircle className="h-3 w-3 text-text-muted" />
            <span className="font-mono text-[9px] text-text-muted">
              SATELLITE FEED UNAVAILABLE
            </span>
          </div>
        )}

        {/* Live weather satellite — hemisphere-aware */}
        {!wxError && (
          <div className="relative rounded border border-border overflow-hidden bg-bg-panel-2">
            <img
              src={wx.url}
              alt={`${wx.label} weather satellite`}
              className="w-full h-auto block"
              loading="lazy"
              onError={() => setWxError(true)}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-0.5">
              <span className="font-mono text-[8px] text-text-muted">
                {wx.label} · GEOCOLOR · Live
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
