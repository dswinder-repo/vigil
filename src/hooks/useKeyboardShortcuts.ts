import { useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';

/**
 * Global keyboard shortcuts for VIGIL command center.
 *
 * Escape       — Deselect event / close detail panel
 * 1-7          — Toggle category filters (conflict, disaster, disease, political, cyber, weather, humanitarian)
 * 0            — Reset all filters to enabled
 * Shift+0      — Disable all filters
 */

const CATEGORY_KEYS: Record<string, number> = {
  '1': 0, // conflict
  '2': 1, // disaster
  '3': 2, // disease
  '4': 3, // political
  '5': 4, // cyber
  '6': 5, // weather
  '7': 6, // humanitarian
};

export function useKeyboardShortcuts() {
  const selectEvent = useDashboardStore((s) => s.selectEvent);
  const toggleCategory = useDashboardStore((s) => s.toggleCategory);
  const setAllFilters = useDashboardStore((s) => s.setAllFilters);
  const filters = useDashboardStore((s) => s.filters);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Escape — deselect event
      if (e.key === 'Escape') {
        e.preventDefault();
        selectEvent(null);
        return;
      }

      // Shift+0 — disable all filters
      if (e.key === ')' || (e.key === '0' && e.shiftKey)) {
        e.preventDefault();
        setAllFilters(false);
        return;
      }

      // 0 — reset all filters to enabled
      if (e.key === '0') {
        e.preventDefault();
        setAllFilters(true);
        return;
      }

      // 1-7 — toggle category
      if (CATEGORY_KEYS[e.key] !== undefined) {
        e.preventDefault();
        const idx = CATEGORY_KEYS[e.key];
        if (idx < filters.length) {
          toggleCategory(filters[idx].category);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectEvent, toggleCategory, setAllFilters, filters]);
}
