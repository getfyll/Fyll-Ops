import { isAnotherTabSwitching } from '@/lib/business-switch-tabs';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';

export type SavedBusinessSession = Pick<Session, 'access_token' | 'refresh_token' | 'expires_at' | 'expires_in' | 'token_type' | 'user'>;

export interface SavedBusiness {
  businessId: string;
  userId: string;
  name: string;
  email: string;
  session?: SavedBusinessSession;
}

interface BusinessSwitcherStore {
  businesses: SavedBusiness[];
  isSwitching: boolean;
  remember: (business: SavedBusiness) => void;
  refreshSession: (businessId: string, userId: string, session: SavedBusinessSession) => void;
  clearSession: (businessId: string, userId: string) => void;
  forget: (businessId: string, userId: string) => void;
}

export const useBusinessSwitcherStore = create<BusinessSwitcherStore>()(persist(
  (set) => ({
    businesses: [],
    isSwitching: isAnotherTabSwitching(),
    remember: (business) => set((state) => {
      const existing = state.businesses.find((item) =>
        item.businessId === business.businessId && item.userId === business.userId);
      const nextBusiness = {
        ...existing,
        ...business,
        session: business.session ?? existing?.session,
      };
      return {
        businesses: [nextBusiness, ...state.businesses.filter((item) =>
          item.businessId !== business.businessId || item.userId !== business.userId)],
      };
    }),
    refreshSession: (businessId, userId, session) => set((state) => ({
      businesses: state.businesses.map((item) => (
        item.businessId === businessId && item.userId === userId
          ? { ...item, session }
          : item
      )),
    })),
    clearSession: (businessId, userId) => set((state) => ({
      businesses: state.businesses.map((item) => {
        if (item.businessId !== businessId || item.userId !== userId) return item;
        const { session: _session, ...rest } = item;
        return rest;
      }),
    })),
    forget: (businessId, userId) => set((state) => ({
      businesses: state.businesses.filter((item) =>
        item.businessId !== businessId || item.userId !== userId),
    })),
  }),
  {
    name: 'fyll-saved-businesses',
    storage: createJSONStorage(() => storage),
    partialize: (state) => ({ businesses: state.businesses }),
  },
));

// Supabase rotates the refresh token in the background every time it auto-refreshes
// the active session. Without this, the saved sign-in for the currently active
// business would silently go stale, so switching away and back later would fail
// with "saved sign-in expired" and force a password re-entry every time.
supabase.auth.onAuthStateChange((event, session) => {
  if (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') return;
  if (!session) return;
  const { businessId, currentUser } = useAuthStore.getState();
  if (!businessId || !currentUser?.id || currentUser.id !== session.user?.id) return;
  useBusinessSwitcherStore.getState().refreshSession(businessId, currentUser.id, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });
});
