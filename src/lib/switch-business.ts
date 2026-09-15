import { publishBusinessSwitch } from '@/lib/business-switch-tabs';
import type { QueryClient } from '@tanstack/react-query';
import { createBusinessVerificationClient, supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useBusinessSwitcherStore, type SavedBusiness, type SavedBusinessSession } from '@/lib/state/business-switcher-store';
import { verifyBusinessLogin, verifySavedBusinessSession, type VerifiedBusinessLogin } from '@/lib/business-login';
import { areBusinessIdsEquivalent } from '@/lib/business-id';
import { beginWorkspaceTransition, endWorkspaceTransition } from '@/lib/workspace-transition';
import { storage } from '@/lib/storage';
import type { SupabaseClient } from '@supabase/supabase-js';

let verifying = false;

// Keyed by `${businessId}:${userId}`. Lets a live switch attempt wait for an in-flight
// background validation of the SAME business instead of racing it for the same refresh
// token (Supabase rejects whichever request loses the race as "already used").
const pendingValidations = new Map<string, Promise<boolean>>();

const savedBusinessKey = (businessId: string, userId: string) => `${businessId}:${userId}`;

function createSavedBusiness(verified: VerifiedBusinessLogin): SavedBusiness {
  const session: SavedBusinessSession = {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    expires_at: verified.session.expires_at,
    expires_in: verified.session.expires_in,
    token_type: verified.session.token_type,
    user: verified.session.user,
  };
  return {
    businessId: verified.user.businessId,
    userId: verified.user.id,
    name: verified.businessName,
    email: verified.user.email,
    session,
  };
}

async function installVerifiedBusiness(
  verified: VerifiedBusinessLogin,
  previousUserId: string | undefined,
  queryClient: QueryClient,
  navigateHome: () => void,
  onTransitionStarted: () => void,
): Promise<boolean> {
  if (useAuthStore.getState().currentUser?.id !== previousUserId) {
    throw new Error('Your sign-in changed. Please try again.');
  }

  const saved = createSavedBusiness(verified);
  if (
    verified.user.id === previousUserId
    && areBusinessIdsEquivalent(verified.user.businessId, useAuthStore.getState().businessId ?? undefined)
  ) {
    useBusinessSwitcherStore.getState().remember(saved);
    navigateHome();
    return false;
  }

  onTransitionStarted();
  useBusinessSwitcherStore.setState({ isSwitching: true });
  publishBusinessSwitch('starting');
  await queryClient.cancelQueries();
  await beginWorkspaceTransition();
  await supabase.removeAllChannels();
  useAuthStore.setState({
    businessId: null,
    currentUser: null,
    isAuthenticated: false,
    teamMembers: [],
    pendingInvites: [],
    isAuthLoading: true,
  });
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) throw new Error('Could not close the previous session. Please sign in again.');
  useFyllStore.getState().resetStore();
  queryClient.clear();
  await storage.removeItem('fyll-storage');
  await storage.removeItem('fyll_business_settings');

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (sessionError) throw new Error('Could not open the business session. Please sign in again.');
  await storage.setItem(
    `fyll_business_settings:${verified.user.businessId}`,
    JSON.stringify({ businessName: verified.businessName }),
  );
  useBusinessSwitcherStore.getState().remember(saved);
  useAuthStore.setState({
    currentUser: verified.user,
    businessId: verified.user.businessId,
    isAuthenticated: true,
    isAuthLoading: false,
    isOfflineMode: false,
    teamMembers: [],
    pendingInvites: [],
  });
  navigateHome();
  return true;
}

async function runBusinessSwitch(
  queryClient: QueryClient,
  navigateHome: () => void,
  verify: (client: SupabaseClient) => Promise<VerifiedBusinessLogin>,
  onSavedSessionExpired?: () => void,
) {
  if (verifying || useBusinessSwitcherStore.getState().isSwitching) throw new Error('A business switch is already in progress.');
  if (useAuthStore.getState().isOfflineMode) throw new Error('Connect to the internet to switch businesses.');
  if (queryClient.isMutating() > 1) throw new Error('Please wait for your changes to finish saving.');
  verifying = true;
  const previousUserId = useAuthStore.getState().currentUser?.id;
  let installed = false;
  let transitioning = false;
  let client: SupabaseClient | null = null;
  try {
    client = createBusinessVerificationClient();
    const verified = await verify(client);
    installed = await installVerifiedBusiness(verified, previousUserId, queryClient, navigateHome, () => {
      transitioning = true;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('saved sign-in expired')) onSavedSessionExpired?.();
    if (transitioning && !useAuthStore.getState().businessId) {
      // Fail closed if a failure occurs after the old session was closed.
      useFyllStore.getState().resetStore();
      queryClient.clear();
      useAuthStore.setState({ isAuthenticated: false, currentUser: null, businessId: null, isAuthLoading: false });
    }
    throw error;
  } finally {
    // Clear an unused verification session without revoking the token used by the installed business.
    if (client && !installed) await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    client?.auth.stopAutoRefresh();
    if (transitioning) {
      endWorkspaceTransition();
      useBusinessSwitcherStore.setState({ isSwitching: false });
      publishBusinessSwitch('finished');
    }
    verifying = false;
  }
}

export async function switchBusiness(
  input: { email: string; password: string; expectedBusinessId?: string },
  queryClient: QueryClient,
  navigateHome: () => void,
) {
  await runBusinessSwitch(queryClient, navigateHome, (client) =>
    verifyBusinessLogin(client, input.email, input.password, input.expectedBusinessId));
}

export async function switchToSavedBusiness(
  business: SavedBusiness,
  queryClient: QueryClient,
  navigateHome: () => void,
) {
  if (!business.session) throw new Error('Sign in once to save this business on this device.');
  // If a background validation for this exact business is mid-flight, wait for it instead of
  // racing it for the same refresh token, then use whatever it left in the store (freshest).
  const pending = pendingValidations.get(savedBusinessKey(business.businessId, business.userId));
  if (pending) await pending.catch(() => undefined);
  const latest = useBusinessSwitcherStore.getState().businesses.find((b) =>
    b.businessId === business.businessId && b.userId === business.userId) ?? business;
  if (!latest.session) throw new Error('Your saved sign-in expired. Please sign in again.');
  await runBusinessSwitch(
    queryClient,
    navigateHome,
    (client) => verifySavedBusinessSession(client, latest.session!, latest.businessId),
    () => useBusinessSwitcherStore.getState().clearSession(latest.businessId, latest.userId),
  );
}

/**
 * Checks a saved (non-active) business's session in the background, using a throwaway
 * verification client -- never touches the primary session or app state. Surfaces staleness
 * (and refreshes a still-good token) before the user taps to switch, instead of only finding
 * out mid-switch. Concurrent calls for the same business share one in-flight promise so a live
 * switch attempt never races this for the same refresh token.
 */
export function validateSavedBusinessSession(business: SavedBusiness): Promise<boolean> {
  if (!business.session) return Promise.resolve(false);
  const key = savedBusinessKey(business.businessId, business.userId);
  const existing = pendingValidations.get(key);
  if (existing) return existing;

  const run = async (): Promise<boolean> => {
    const client = createBusinessVerificationClient();
    try {
      const verified = await verifySavedBusinessSession(client, business.session!, business.businessId);
      useBusinessSwitcherStore.getState().refreshSession(business.businessId, business.userId, {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
        expires_at: verified.session.expires_at,
        expires_in: verified.session.expires_in,
        token_type: verified.session.token_type,
        user: verified.session.user,
      });
      return true;
    } catch (error) {
      console.warn(`Saved session for business ${business.businessId} failed background validation:`, error instanceof Error ? error.message : error);
      useBusinessSwitcherStore.getState().clearSession(business.businessId, business.userId);
      return false;
    } finally {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      client.auth.stopAutoRefresh();
    }
  };

  const promise = run().finally(() => {
    if (pendingValidations.get(key) === promise) pendingValidations.delete(key);
  });
  pendingValidations.set(key, promise);
  return promise;
}
