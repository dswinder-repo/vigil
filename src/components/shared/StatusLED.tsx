const statusConfig = {
  online: { color: 'var(--color-accent-green)', bg: 'bg-accent-green' },
  degraded: { color: 'var(--color-accent-amber)', bg: 'bg-accent-amber' },
  offline: { color: 'var(--color-accent-red)', bg: 'bg-accent-red' },
};

interface StatusLEDProps {
  status: 'online' | 'degraded' | 'offline';
  label: string;
}

const STATUS_LABELS = {
  online: 'receiving data normally',
  degraded: 'partial data / slow response',
  offline: 'not responding',
};

export function StatusLED({ status, label }: StatusLEDProps) {
  const config = statusConfig[status];
  return (
    <div
      className="flex items-center gap-1.5"
      title={`${label}: ${status} — ${STATUS_LABELS[status]}`}
    >
      <div
        className={`h-2 w-2 rounded-full ${config.bg}`}
        style={{ boxShadow: `0 0 6px ${config.color}` }}
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
    </div>
  );
}
