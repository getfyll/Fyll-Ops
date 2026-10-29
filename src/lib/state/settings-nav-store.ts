import { create } from 'zustand';
import type { SettingsNavKey } from '@/lib/settings-nav';

// Shared between the Settings screen (which knows which page is open) and the sidebar (which lists the pages).
interface SettingsNavStore {
  activeKey: SettingsNavKey;
  // The last page the person was on before opening Settings, for "Back to Fyll Ops".
  lastPath: string | null;
  setActiveKey: (key: SettingsNavKey) => void;
  setLastPath: (path: string | null) => void;
}

const useSettingsNavStore = create<SettingsNavStore>((set) => ({
  activeKey: 'profile',
  lastPath: null,
  setActiveKey: (activeKey) => set((state) => (state.activeKey === activeKey ? state : { activeKey })),
  setLastPath: (lastPath) => set((state) => (state.lastPath === lastPath ? state : { lastPath })),
}));

export default useSettingsNavStore;
