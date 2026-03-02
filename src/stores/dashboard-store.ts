import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NormalizedEvent, EventCategory, CategoryFilter, Severity } from '@/lib/types';
import { DEFAULT_FILTERS } from '@/lib/constants';

interface DashboardState {
  selectedEvent: NormalizedEvent | null;
  filters: CategoryFilter[];
  collapsedPanels: Record<string, boolean>;
  alertsEnabled: boolean;
  alertMinSeverity: Severity;
  alertCategories: EventCategory[];
  alertSound: boolean;
  showMilitaryBases: boolean;
  showFlights: boolean;
  showNuclearFacilities: boolean;
  aiApiKey: string;
  aiProvider: 'openai' | 'anthropic' | '';
  selectEvent: (event: NormalizedEvent | null) => void;
  toggleCategory: (category: EventCategory) => void;
  setAllFilters: (enabled: boolean) => void;
  togglePanel: (panelId: string) => void;
  toggleAlerts: () => void;
  setAlertMinSeverity: (s: Severity) => void;
  toggleAlertCategory: (cat: EventCategory) => void;
  toggleMilitaryBases: () => void;
  toggleFlights: () => void;
  toggleNuclearFacilities: () => void;
  setAIKey: (key: string, provider: 'openai' | 'anthropic' | '') => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedEvent: null,
      filters: DEFAULT_FILTERS,
      collapsedPanels: {},
      alertsEnabled: false,
      alertMinSeverity: 4,
      alertCategories: ['conflict', 'disaster', 'disease', 'cyber'],
      alertSound: true,
      showMilitaryBases: false,
      showFlights: false,
      showNuclearFacilities: false,
      aiApiKey: '',
      aiProvider: '',
      selectEvent: (event) => set({ selectedEvent: event }),
      toggleCategory: (category) =>
        set((state) => ({
          filters: state.filters.map((f) =>
            f.category === category ? { ...f, enabled: !f.enabled } : f
          ),
        })),
      setAllFilters: (enabled) =>
        set((state) => ({
          filters: state.filters.map((f) => ({ ...f, enabled })),
        })),
      togglePanel: (panelId) =>
        set((state) => ({
          collapsedPanels: {
            ...state.collapsedPanels,
            [panelId]: !state.collapsedPanels[panelId],
          },
        })),
      toggleAlerts: () => set((state) => ({ alertsEnabled: !state.alertsEnabled })),
      setAlertMinSeverity: (s) => set({ alertMinSeverity: s }),
      toggleAlertCategory: (cat) =>
        set((state) => ({
          alertCategories: state.alertCategories.includes(cat)
            ? state.alertCategories.filter((c) => c !== cat)
            : [...state.alertCategories, cat],
        })),
      toggleMilitaryBases: () =>
        set((state) => ({ showMilitaryBases: !state.showMilitaryBases })),
      toggleFlights: () =>
        set((state) => ({ showFlights: !state.showFlights })),
      toggleNuclearFacilities: () =>
        set((state) => ({ showNuclearFacilities: !state.showNuclearFacilities })),
      setAIKey: (key, provider) => set({ aiApiKey: key, aiProvider: provider }),
    }),
    {
      name: 'vigil-dashboard',
      partialize: (state) => ({
        filters: state.filters,
        collapsedPanels: state.collapsedPanels,
        alertsEnabled: state.alertsEnabled,
        alertMinSeverity: state.alertMinSeverity,
        alertCategories: state.alertCategories,
        alertSound: state.alertSound,
        showMilitaryBases: state.showMilitaryBases,
        showFlights: state.showFlights,
        showNuclearFacilities: state.showNuclearFacilities,
        aiApiKey: state.aiApiKey,
        aiProvider: state.aiProvider,
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<DashboardState>;
        if (!p?.filters) return current;
        const validCats = new Set(['conflict','disaster','disease','political','cyber','unrest','humanitarian']);
        const migratedFilters = current.filters.map(f => {
          const old = p.filters!.find(pf => pf.category === f.category);
          return old ? { ...f, enabled: old.enabled } : f;
        });
        void validCats;
        return {
          ...current,
          filters: migratedFilters,
          collapsedPanels: p.collapsedPanels ?? {},
          alertsEnabled: p.alertsEnabled ?? false,
          alertMinSeverity: p.alertMinSeverity ?? 4,
          alertCategories: p.alertCategories ?? ['conflict', 'disaster', 'disease', 'cyber'],
          alertSound: p.alertSound ?? true,
          showMilitaryBases: p.showMilitaryBases ?? false,
          showFlights: p.showFlights ?? false,
          showNuclearFacilities: p.showNuclearFacilities ?? false,
          aiApiKey: p.aiApiKey ?? '',
          aiProvider: p.aiProvider ?? '',
        };
      },
    }
  )
);
