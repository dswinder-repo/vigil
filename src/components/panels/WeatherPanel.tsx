import { AlertTriangle, CloudLightning, Loader2 } from 'lucide-react';
import { useNWSAlerts } from '@/hooks/useNWSAlerts';
import type { NWSAlert } from '@/hooks/useNWSAlerts';

const SEVERITY_COLORS: Record<string, string> = {
  Extreme: '#EF4444',
  Severe: '#F59E0B',
  Moderate: '#3B82F6',
  Minor: '#10B981',
  Unknown: '#6B7280',
};

export function WeatherPanel() {
  const { data, isLoading, isError } = useNWSAlerts();
  const alerts = data?.alerts ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (isError || alerts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          <CloudLightning className="h-4 w-4 text-text-muted" />
          <span className="text-[9px] text-text-muted">
            {isError ? 'NWS OFFLINE' : 'NO ACTIVE ALERTS'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {alerts.slice(0, 8).map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}
    </div>
  );
}

function AlertRow({ alert }: { alert: NWSAlert }) {
  const color = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.Unknown;

  return (
    <div className="flex items-start gap-1.5 border-b border-border/50 px-2 py-1.5">
      <AlertTriangle
        className="mt-0.5 h-2.5 w-2.5 shrink-0"
        style={{ color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className="inline-block rounded px-1 py-px text-[7px] font-bold uppercase"
            style={{ backgroundColor: color, color: '#000' }}
          >
            {alert.severity}
          </span>
          <span className="truncate text-[9px] font-semibold text-text-primary">
            {alert.event}
          </span>
        </div>
        <p className="truncate text-[8px] text-text-muted">
          {alert.areaDesc.split(';')[0]}
        </p>
      </div>
    </div>
  );
}
