import { useDashboardStore } from '@/stores/dashboard-store';

export function FilterBar() {
  const filters = useDashboardStore((s) => s.filters);
  const toggleCategory = useDashboardStore((s) => s.toggleCategory);

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
      {filters.map((f) => (
        <button
          key={f.category}
          onClick={() => toggleCategory(f.category)}
          className={`flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
            f.enabled ? 'text-text-primary' : 'text-text-muted opacity-40'
          }`}
          style={{
            backgroundColor: f.enabled ? `${f.color}15` : 'transparent',
            border: `1px solid ${f.enabled ? `${f.color}40` : 'var(--color-border)'}`,
          }}
        >
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: f.enabled ? f.color : 'var(--color-text-muted)' }}
          />
          {f.label}
        </button>
      ))}
    </div>
  );
}
