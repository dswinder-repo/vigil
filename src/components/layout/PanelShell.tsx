import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard-store';

interface PanelShellProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Unique panel ID for collapse persistence. Falls back to title slug. */
  panelId?: string;
}

export function PanelShell({ title, children, className = '', panelId }: PanelShellProps) {
  const id = panelId || title.toLowerCase().replace(/\s+/g, '-');
  const collapsed = useDashboardStore((s) => s.collapsedPanels[id] ?? false);
  const togglePanel = useDashboardStore((s) => s.togglePanel);

  return (
    <div className={`flex flex-col bg-bg-panel-1 ${collapsed ? 'panel-collapsed' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => togglePanel(id)}
        className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-3 w-full text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-text-muted" />
        ) : (
          <ChevronDown className="h-3 w-3 text-text-muted" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-green">
          {title}
        </span>
      </button>
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      )}
    </div>
  );
}
