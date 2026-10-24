import { create } from 'zustand';
import type { WhatsNewState } from '@/hooks/useWhatsNew';

// Shared between the What's new modal (mounted in the root layout) and the bell panel on Home.
interface WhatsNewStore {
  // A release the person has not acted on yet. Stays after "Later" so the bell can offer it again.
  available: WhatsNewState | null;
  // Bumped when the bell asks for the modal to open.
  openToken: number;
  setAvailable: (state: WhatsNewState | null) => void;
  requestOpen: () => void;
}

const useWhatsNewStore = create<WhatsNewStore>((set) => ({
  available: null,
  openToken: 0,
  setAvailable: (available) => set({ available }),
  requestOpen: () => set((s) => ({ openToken: s.openToken + 1 })),
}));

export default useWhatsNewStore;
