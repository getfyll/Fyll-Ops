import { workspaceGeneration, isWorkspaceTransitioning } from '@/lib/workspace-transition';
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";
import { assertSupabaseConfig, supabase } from "@/lib/supabase";
import useFyllStore from "./fyll-store";
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { slugifyBusinessName } from '@/lib/tracking-url';
import {
  areBusinessIdsEquivalent,
  getCanonicalBusinessId,
  trimBusinessId,
} from '@/lib/business-id';

export type TeamRole = 'admin' | 'manager' | 'staff';
export type InviteStatus = 'pending' | 'joined' | 'cancelled' | 'expired';

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  createdAt: string;
  lastLogin?: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: TeamRole;
  inviteCode: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  businessId: string;
  status?: InviteStatus;
  joinedAt?: string;
  joinedUserId?: string;
  emailSentAt?: string;
  createdByUserId?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  businessId: string;
  isOffline?: boolean;
}

// Role permissions
export const ROLE_PERMISSIONS = {
  admin: {
    canViewInsights: true,
    canViewRevenue: true,
    canViewAnalytics: true,
    canDeleteData: true,
    canManageTeam: true,
    canEditInventory: true,
    canProcessOrders: true,
    canRestock: true,
    canScanQR: true,
    canDoInventoryChecks: true,
  },
  manager: {
    canViewInsights: false,
    canViewRevenue: false,
    canViewAnalytics: false,
    canDeleteData: false,
    canManageTeam: false,
    canEditInventory: true,
    canProcessOrders: true,
    canRestock: true,
    canScanQR: true,
    canDoInventoryChecks: true,
  },
  staff: {
    canViewInsights: false,
    canViewRevenue: false,
    canViewAnalytics: false,
    canDeleteData: false,
    canManageTeam: false,
    canEditInventory: false,
    canProcessOrders: true,
    canRestock: false,
    canScanQR: true,
    canDoInventoryChecks: true,
  },
} as const;

interface AuthStore {
  // Auth state
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isOfflineMode: boolean;
  currentUser: AuthUser | null;
  businessId: string | null;

  // Team management
  teamMembers: TeamMember[];
  pendingInvites: PendingInvite[];

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (input: { businessName: string; name: string; email: string; password: string; accessCode: string }) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  syncWithSupabaseSession: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (name: string, email: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  setOfflineMode: (isOffline: boolean) => void;

  // Team actions (admin only)
  refreshTeamData: () => Promise<void>;
  updateTeamMember: (id: string, updates: Partial<TeamMember>) => Promise<void>;
  removeTeamMember: (id: string) => Promise<void>;

  // Invite actions
  createInvite: (email: string, role: TeamRole, invitedBy: string) => Promise<PendingInvite>;
  cancelInvite: (inviteId: string) => Promise<void>;
  acceptInvite: (inviteCode: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>;
  getInviteByCode: (inviteCode: string) => Promise<PendingInvite | undefined>;

  // Legacy (no-op for now)
  setUserPassword: (email?: string, password?: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 12);
const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (length: number) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FYLL-${pick(4)}-${pick(2)}`;
};

const getAuthErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as { message?: string })?.message;
  if (message) {
    if (message.toLowerCase().includes('invalid login credentials')) {
      return 'Invalid email or password. Please check and try again.';
    }
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'Please verify your email before signing in.';
    }
    if (message.toLowerCase().includes('user already registered')) {
      return 'This email is already registered. Please sign in instead.';
    }
    if (message.toLowerCase().includes('password') && message.toLowerCase().includes('weak')) {
      return 'Password must be at least 6 characters.';
    }
  }

  const code = (error as { code?: string })?.code;
  if (!code) return fallback;

  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already in use.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found for this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    default:
      return fallback;
  }
};

const resolveAuthBusinessId = async (input: {
  profileBusinessId?: string | null;
  teamBusinessId?: string | null;
  email?: string | null;
  userId?: string | null;
}) => {
  const profileBusinessId = trimBusinessId(input.profileBusinessId);
  const teamBusinessId = trimBusinessId(input.teamBusinessId);

  if (!profileBusinessId) return teamBusinessId;
  if (!teamBusinessId) return profileBusinessId;
  if (areBusinessIdsEquivalent(profileBusinessId, teamBusinessId)) {
    return getCanonicalBusinessId(profileBusinessId);
  }

  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail) {
    try {
      const cachedProfile = await storage.getItem(`fyll_user_profile:${normalizedEmail}`);
      if (cachedProfile) {
        const parsed = JSON.parse(cachedProfile) as { businessId?: string | null };
        const cachedBusinessId = trimBusinessId(parsed.businessId);
        if (
          areBusinessIdsEquivalent(cachedBusinessId, profileBusinessId)
          || areBusinessIdsEquivalent(cachedBusinessId, teamBusinessId)
        ) {
          const resolvedBusinessId = getCanonicalBusinessId(cachedBusinessId);
          console.warn(
            `Business ID mismatch for ${input.userId ?? normalizedEmail}. Using canonical cached match ${resolvedBusinessId}.`
          );
          return resolvedBusinessId;
        }
      }
    } catch (error) {
      console.warn('Could not read cached business ID during auth resolution:', error);
    }
  }

  console.warn(
    `Business ID mismatch for ${input.userId ?? normalizedEmail ?? 'unknown user'}: `
    + `profile=${profileBusinessId}, team_member=${teamBusinessId}. Preferring canonical profile business_id.`
  );
  return getCanonicalBusinessId(profileBusinessId);
};

const normalizeRole = (value?: string | null): TeamRole => {
  if (value === 'admin' || value === 'manager' || value === 'staff') {
    return value;
  }
  return 'admin';
};

const sendOnboardingWelcomeEmail = async ({
  type,
  businessId,
  toEmail,
  recipientName,
  role,
  inviterName,
}: {
  type: 'founder_welcome' | 'team_welcome';
  businessId: string;
  toEmail: string;
  recipientName: string;
  role?: string | null;
  inviterName?: string | null;
}) => {
  if (!businessId || !toEmail.trim() || !recipientName.trim()) return;

  const { error } = await supabase.functions.invoke('send-onboarding-welcome', {
    body: {
      type,
      businessId,
      toEmail: toEmail.trim().toLowerCase(),
      recipientName: recipientName.trim(),
      role: role ?? null,
      inviterName: inviterName ?? null,
    },
  });

  if (error) {
    throw error;
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getNameFromAuthUser = (email: string, metadata: Record<string, unknown> | null | undefined) => {
  const meta = metadata ?? {};
  const candidates = [
    typeof meta.name === 'string' ? meta.name : undefined,
    typeof meta.full_name === 'string' ? meta.full_name : undefined,
    typeof meta.businessName === 'string' ? meta.businessName : undefined,
  ].filter(Boolean) as string[];
  return candidates[0] ?? email.split('@')[0] ?? 'User';
};

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isAuthLoading: false,
      isOfflineMode: false,
      currentUser: null,
      businessId: null,
      teamMembers: [],
      pendingInvites: [],
      setOfflineMode: (isOffline) => set({ isOfflineMode: isOffline }),

      syncWithSupabaseSession: async () => {
        const authGeneration = workspaceGeneration();
        const stillCurrent = () => authGeneration === workspaceGeneration() && !isWorkspaceTransitioning();
        if (!stillCurrent()) return { success: false, error: 'Business switch in progress.' };
        try {
          set({ isAuthLoading: true });

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }

          if (!stillCurrent()) return { success: false, error: 'Session changed.' };
          const authUser = sessionData.session?.user;
          if (!authUser?.id) {
            set({
              isAuthenticated: false,
              currentUser: null,
              businessId: null,
              isAuthLoading: false,
            });
            return { success: false, error: 'Not signed in.' };
          }

          let profile: { id: string; email: string | null; name: string | null; role: string | null; business_id: string | null } | null = null;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('id, email, name, role, business_id')
              .eq('id', authUser.id)
              .maybeSingle();

            if (profileError) {
              console.warn('Profile lookup failed:', profileError);
            }

            if (profileData?.business_id) {
              profile = profileData;
              break;
            }

            await wait(500);
          }

          const { data: teamMemberData, error: teamMemberError } = await supabase
            .from('team_members')
            .select('email, name, role, business_id')
            .eq('user_id', authUser.id)
            .maybeSingle();

          if (teamMemberError) {
            console.warn('Team member lookup failed during session sync:', teamMemberError);
          }

          const businessId = await resolveAuthBusinessId({
            profileBusinessId: profile?.business_id,
            teamBusinessId: teamMemberData?.business_id,
            email: teamMemberData?.email ?? profile?.email ?? authUser.email,
            userId: authUser.id,
          });
          if (!stillCurrent()) return { success: false, error: 'Session changed.' };
          if (!businessId) {
            await supabase.auth.signOut({ scope: 'local' });
            set({ isAuthLoading: false });
            return { success: false, error: 'Account data not found. Please contact support.' };
          }

          const normalizedEmail = (teamMemberData?.email ?? profile?.email ?? authUser.email ?? '').trim().toLowerCase();
          const name = teamMemberData?.name
            ?? profile?.name
            ?? getNameFromAuthUser(normalizedEmail || authUser.email || 'user@local', authUser.user_metadata as Record<string, unknown> | undefined);

          const userData: AuthUser = {
            id: authUser.id,
            email: normalizedEmail || authUser.email || 'user@local',
            name,
            role: normalizeRole(teamMemberData?.role ?? profile?.role),
            businessId,
          };

          if (!stillCurrent()) return { success: false, error: 'Session changed.' };
          set({
            isAuthenticated: true,
            currentUser: userData,
            businessId,
            isOfflineMode: false,
            isAuthLoading: false,
          });

          try {
            await get().refreshTeamData();
          } catch (error) {
            console.warn('Could not refresh team data:', error);
          }

          if (userData.email) {
            void storage.setItem(
              `fyll_user_profile:${userData.email}`,
              JSON.stringify({ businessId, name: userData.name })
            );
          }

          return { success: true };
        } catch (error) {
          set({ isAuthLoading: false });
          console.error('Session sync failed:', error);
          return { success: false, error: getAuthErrorMessage(error, 'Could not restore your session. Please sign in again.') };
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ isAuthLoading: true });

          const redirectTo = Linking.createURL('login');
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
            },
          });

          if (error || !data?.url) {
            throw error ?? new Error('Google sign-in could not start.');
          }

          if (Platform.OS === 'web') {
            set({ isAuthLoading: false });
            window.location.assign(data.url);
            return { success: true };
          }

          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (result.type !== 'success' || !result.url) {
            set({ isAuthLoading: false });
            return { success: false, error: 'Sign-in cancelled.' };
          }

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exchangeError) {
            throw exchangeError;
          }

          const syncResult = await get().syncWithSupabaseSession();
          return syncResult;
        } catch (error) {
          set({ isAuthLoading: false });
          console.error('Google sign-in failed:', error);
          return { success: false, error: getAuthErrorMessage(error, 'Google sign-in failed. Please try again.') };
        }
      },

      login: async (email, password) => {
        try {
          set({ isAuthLoading: true });
          assertSupabaseConfig();

          const normalizedEmail = email.trim().toLowerCase();
          const profileKey = `fyll_user_profile:${normalizedEmail}`;
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

          if (authError || !authData.user) {
            throw authError ?? new Error('Login failed');
          }

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, name, role, business_id')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (profileError) {
            console.warn('Auth successful, but profile lookup failed:', profileError);
          }

          const { data: teamMemberData, error: teamMemberError } = await supabase
            .from('team_members')
            .select('email, name, role, business_id')
            .eq('user_id', authData.user.id)
            .maybeSingle();

          if (teamMemberError) {
            console.warn('Auth successful, but team member lookup failed:', teamMemberError);
          }

          const businessId = await resolveAuthBusinessId({
            profileBusinessId: profile?.business_id,
            teamBusinessId: teamMemberData?.business_id,
            email: teamMemberData?.email ?? profile?.email ?? authData.user.email ?? normalizedEmail,
            userId: authData.user.id,
          });

          if (!businessId) {
            await supabase.auth.signOut({ scope: 'local' });
            set({ isAuthLoading: false });
            return {
              success: false,
              error: 'Account data not found. Please contact support.',
            };
          }

          const userData: AuthUser = {
            id: authData.user.id,
            email: teamMemberData?.email ?? profile?.email ?? authData.user.email ?? normalizedEmail,
            name: teamMemberData?.name ?? profile?.name ?? authData.user.email?.split('@')[0] ?? normalizedEmail.split('@')[0],
            role: normalizeRole(teamMemberData?.role ?? profile?.role),
            businessId,
          };

          try {
            await supabase
              .from('team_members')
              .update({ last_login: new Date().toISOString() })
              .eq('user_id', authData.user.id)
              .eq('business_id', businessId);
          } catch (error) {
            console.warn('Failed to update team member login timestamp:', error);
          }

          set({
            isAuthenticated: true,
            currentUser: userData,
            businessId,
            isOfflineMode: false,
            isAuthLoading: false,
          });

          void storage.setItem(
            profileKey,
            JSON.stringify({ businessId, name: userData.name })
          );

          try {
            const { data, error: businessError } = await supabase
              .from('businesses')
              .select('name')
              .eq('id', businessId)
              .maybeSingle();
            if (!businessError && data?.name) {
              void storage.setItem(
                `fyll_business_settings:${businessId}`,
                JSON.stringify({ businessName: data.name })
              );
            }
          } catch (error) {
            console.warn('Failed to cache business settings:', error);
          }

          get()
            .refreshTeamData()
            .catch((refreshError) => {
              console.warn('Could not refresh team data:', refreshError);
            });

          return { success: true };
        } catch (error) {
          set({ isAuthLoading: false });
          console.error('Login failed:', error);
          return { success: false, error: getAuthErrorMessage(error, 'Login failed. Please try again.') };
        }
      },

      signup: async ({ businessName, name, email, password, accessCode }) => {
        try {
          set({ isAuthLoading: true });

          const normalizedAccessCode = accessCode.trim().toUpperCase();
          if (!normalizedAccessCode) {
            set({ isAuthLoading: false });
            return {
              success: false,
              error: 'Access code is required.',
            };
          }

          const normalizedEmail = email.trim().toLowerCase();
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, business_id')
            .eq('email', normalizedEmail)
            .maybeSingle();

          if (existingProfile) {
            set({ isAuthLoading: false });
            return {
              success: false,
              error: 'This email is already registered. Please sign in instead.',
            };
          }

          type AccessCodeValidationResult = {
            is_valid?: boolean;
            valid?: boolean;
            message?: string | null;
          };

          const { data: validationData, error: validationError } = await supabase
            .rpc('validate_access_code', {
              access_code_input: normalizedAccessCode,
            });

          if (validationError) {
            throw validationError;
          }

          const validationRow = (Array.isArray(validationData) ? validationData[0] : validationData) as AccessCodeValidationResult | null;
          const isAccessCodeValid = validationRow?.is_valid ?? validationRow?.valid ?? false;
          if (!isAccessCodeValid) {
            set({ isAuthLoading: false });
            return {
              success: false,
              error: validationRow?.message ?? 'Invalid or inactive access code.',
            };
          }

          const { data: signupData, error: signupError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                name: name.trim(),
                businessName: businessName.trim(),
              },
            },
          });

          if (signupError || !signupData.user) {
            throw signupError ?? new Error('Unable to create account');
          }

          const createdUserId = signupData.user.id;

          let profile: { business_id?: string | null; name?: string | null; role?: string | null } | null = null;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('business_id, name, role')
              .eq('id', createdUserId)
              .maybeSingle();

            if (profileData) {
              profile = profileData;
              break;
            }

            await wait(500);
          }

          const businessId = profile?.business_id ?? null;

          if (!businessId) {
            set({ isAuthLoading: false });
            return {
              success: false,
              error: 'Account created, but profile is not ready yet. Please try logging in.',
            };
          }

          try {
            const { error: redeemAccessCodeError } = await supabase.rpc('redeem_access_code', {
              access_code_input: normalizedAccessCode,
              email_input: normalizedEmail,
              business_name_input: businessName.trim(),
              business_id_input: businessId,
            });
            if (redeemAccessCodeError) {
              throw redeemAccessCodeError;
            }
          } catch (redeemError) {
            console.warn('Access code redemption logging failed (non-fatal):', redeemError);
          }

          try {
            const { error: founderReferralRedeemError } = await supabase.rpc('mark_founder_referral_invite_redeemed', {
              access_code_input: normalizedAccessCode,
              joined_business_id_input: businessId,
              joined_user_id_input: createdUserId,
            });
            if (founderReferralRedeemError) {
              throw founderReferralRedeemError;
            }
          } catch (founderReferralError) {
            console.warn('Founder referral invite history update failed (non-fatal):', founderReferralError);
          }

          set({
            isAuthenticated: true,
            currentUser: {
              id: createdUserId,
              email: normalizedEmail,
              name: profile?.name ?? name.trim(),
              role: normalizeRole(profile?.role),
              businessId,
            },
            businessId,
            isAuthLoading: false,
          });

          // Clear demo data and save business name for new account
          try {
            // Temporarily clear businessId so resetStore doesn't trigger sync deletions
            const newBusinessId = get().businessId;
            set({ businessId: null });
            useFyllStore.getState().resetStore();
            await storage.removeItem('fyll-storage');
            // Restore businessId after reset is safe
            set({ businessId: newBusinessId });
            console.log('Demo data and AsyncStorage cleared for new account');

            const businessSettings = {
              companyName: businessName.trim(),
              businessName: businessName.trim(),
              businessSlug: slugifyBusinessName(businessName.trim()),
              businessNameLastUpdatedAt: null,
              businessLogo: null,
              businessPhone: '',
              businessWebsite: '',
              returnAddress: '',
            };
            await storage.setItem(`fyll_business_settings:${businessId}`, JSON.stringify(businessSettings));
            await storage.setItem(
              `fyll_user_profile:${normalizedEmail}`,
              JSON.stringify({ businessId, name: name.trim() })
            );
            console.log('Business settings saved:', businessName.trim());
          } catch (settingsError) {
            console.warn('Could not save business settings:', settingsError);
          }

          // Try to refresh team data, but don't fail if it doesn't work
          try {
            await get().refreshTeamData();
          } catch (teamError) {
            console.warn('Could not refresh team data:', teamError);
          }

          void sendOnboardingWelcomeEmail({
            type: 'founder_welcome',
            businessId,
            toEmail: normalizedEmail,
            recipientName: profile?.name ?? name.trim(),
            role: profile?.role ?? 'admin',
          }).catch((welcomeError) => {
            console.warn('Founder welcome email failed (non-fatal):', welcomeError);
          });

          return { success: true };
        } catch (error) {
          set({ isAuthLoading: false });
          console.error('Signup failed:', error);
          return { success: false, error: getAuthErrorMessage(error, 'Unable to create account. Please try again.') };
        }
      },

      logout: async () => {
        // CRITICAL: Clear businessId and auth FIRST to prevent sync effects
        // from interpreting resetStore() as "user deleted all products" and
        // wiping them from Supabase.
        set({
          isAuthenticated: false,
          isOfflineMode: false,
          currentUser: null,
          businessId: null,
          teamMembers: [],
          pendingInvites: [],
        });

        try {
          await Promise.race([
            supabase.auth.signOut({ scope: 'local' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
          ]);
        } catch (error) {
          console.warn('Logout failed, clearing local session anyway:', error);
        }

        // Reset the fyll store AFTER businessId is null so sync effects skip deletions
        try {
          useFyllStore.getState().resetStore();
        } catch (resetError) {
          console.warn('Could not reset fyll store:', resetError);
        }

        try {
          await storage.removeItem('fyll-auth-storage');
          // Clear all app data on logout to prevent data leakage between accounts
          await storage.removeItem('fyll-storage');
          await storage.removeItem('fyll_business_settings');
          console.log('All local storage cleared on logout');
        } catch (storageError) {
          console.warn('Could not clear auth storage:', storageError);
        }
      },

      updateProfile: async (name, email) => {
        const currentUser = get().currentUser;
        if (!currentUser) {
          throw new Error('Not signed in');
        }

        const normalizedEmail = email.trim().toLowerCase();

        const { error: authError } = await supabase.auth.updateUser({
          email: normalizedEmail,
          data: { name: name.trim() },
        });

        if (authError) {
          throw authError;
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            name: name.trim(),
            email: normalizedEmail,
          })
          .eq('id', currentUser.id);

        if (profileError) {
          throw profileError;
        }

        const { error: teamError } = await supabase
          .from('team_members')
          .update({
            name: name.trim(),
            email: normalizedEmail,
          })
          .eq('user_id', currentUser.id);

        if (teamError) {
          throw teamError;
        }

        const updatedUser = {
          ...currentUser,
          name: name.trim(),
          email: normalizedEmail,
        };

        set({ currentUser: updatedUser });

        const oldProfileKey = `fyll_user_profile:${currentUser.email}`;
        const newProfileKey = `fyll_user_profile:${normalizedEmail}`;

        if (currentUser.businessId) {
          void storage.setItem(
            newProfileKey,
            JSON.stringify({ businessId: currentUser.businessId, name: updatedUser.name })
          );
        }

        if (oldProfileKey !== newProfileKey) {
          void storage.removeItem(oldProfileKey);
        }
      },

      updatePassword: async (currentPassword, newPassword) => {
        const currentUser = get().currentUser;
        if (!currentUser?.email) {
          return { success: false, error: 'Not signed in.' };
        }

        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: currentPassword,
        });

        if (verifyError) {
          return { success: false, error: 'Current password is incorrect.' };
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          return { success: false, error: getAuthErrorMessage(updateError, 'Failed to update password.') };
        }

        return { success: true };
      },

      refreshTeamData: async () => {
        const businessId = get().businessId;
        if (!businessId) return;

        let members: TeamMember[] = [];

        // Try team_members first
        const { data: teamRows, error: teamError } = await supabase
          .from('team_members')
          .select('*')
          .eq('business_id', businessId);

        if (!teamError && teamRows && teamRows.length > 0) {
          members = teamRows.map((row) => ({
            id: row.user_id ?? row.id,
            email: row.email,
            name: row.name,
            role: normalizeRole(row.role),
            createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
            lastLogin: row.last_login ?? row.lastLogin,
          })) as TeamMember[];
        } else {
          // Fallback: try profiles table (broader RLS for same-business reads)
          if (teamError) {
            console.warn('team_members query failed, trying profiles fallback:', teamError.message);
          }
          const { data: profileRows, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, name, role, created_at')
            .eq('business_id', businessId);

          if (!profileError && profileRows && profileRows.length > 0) {
            members = profileRows.map((row) => ({
              id: row.id,
              email: row.email ?? '',
              name: row.name ?? '',
              role: normalizeRole(row.role),
              createdAt: row.created_at ?? new Date().toISOString(),
            })) as TeamMember[];
          } else if (profileError) {
            console.warn('profiles fallback also failed:', profileError.message);
          }
        }

        let invites: PendingInvite[] = [];
        try {
          const { data: inviteRows, error: inviteError } = await supabase
            .from('invites')
            .select('*')
            .eq('business_id', businessId);

          if (!inviteError) {
            const now = new Date();
            invites = (inviteRows ?? [])
              .map((row) => ({
                id: row.id,
                email: row.email,
                role: normalizeRole(row.role),
                inviteCode: row.invite_code ?? row.inviteCode,
                invitedBy: row.invited_by ?? row.invitedBy,
                invitedAt: row.invited_at ?? row.invitedAt ?? new Date().toISOString(),
                expiresAt: row.expires_at ?? row.expiresAt ?? new Date().toISOString(),
                businessId: row.business_id,
                status: (row.status ?? 'pending') as InviteStatus,
                joinedAt: row.joined_at ?? row.joinedAt,
                joinedUserId: row.joined_user_id ?? row.joinedUserId,
                emailSentAt: row.email_sent_at ?? row.emailSentAt,
                createdByUserId: row.created_by_user_id ?? row.createdByUserId,
              }))
              .filter((invite) => {
                const rawStatus = invite.status ?? 'pending';
                const normalizedStatus = rawStatus === 'joined' || rawStatus === 'cancelled' || rawStatus === 'expired'
                  ? rawStatus
                  : 'pending';
                const isExpired = new Date(invite.expiresAt) <= now;
                return normalizedStatus === 'pending' && !isExpired;
              }) as PendingInvite[];
          }
        } catch (inviteErr) {
          console.warn('Invites query failed (non-fatal):', inviteErr);
        }

        if (get().businessId !== businessId) return;
        set({ teamMembers: members, pendingInvites: invites });
      },

      updateTeamMember: async (id, updates) => {
        const businessId = get().businessId;
        if (!businessId) return;

        const updatePayload: Record<string, unknown> = {};
        if (updates.name) updatePayload.name = updates.name;
        if (updates.email) updatePayload.email = updates.email;
        if (updates.role) updatePayload.role = updates.role;
        if (updates.lastLogin) updatePayload.last_login = updates.lastLogin;

        const { error: teamError } = await supabase
          .from('team_members')
          .update(updatePayload)
          .eq('user_id', id)
          .eq('business_id', businessId);

        if (teamError) {
          throw teamError;
        }

        const profilePayload: Record<string, unknown> = {};
        if (updates.name) profilePayload.name = updates.name;
        if (updates.email) profilePayload.email = updates.email;
        if (updates.role) profilePayload.role = updates.role;

        if (Object.keys(profilePayload).length > 0) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('id', id);

          if (profileError) {
            throw profileError;
          }
        }

        set({
          teamMembers: get().teamMembers.map((member) =>
            member.id === id ? { ...member, ...updates } : member
          ),
        });
      },

      removeTeamMember: async (id) => {
        const businessId = get().businessId;
        if (!businessId) return;

        const { error: teamError } = await supabase
          .from('team_members')
          .delete()
          .eq('user_id', id)
          .eq('business_id', businessId);

        if (teamError) {
          throw teamError;
        }

        set({
          teamMembers: get().teamMembers.filter((member) => member.id !== id),
        });
      },

      createInvite: async (email, role, invitedBy) => {
        const businessId = get().businessId;
        if (!businessId) {
          throw new Error('No business selected');
        }
        const currentUser = get().currentUser;
        if (!currentUser || currentUser.role !== 'admin') {
          throw new Error('Only admins can invite team members');
        }

        const normalizedEmail = email.toLowerCase();
        const existingMember = get().teamMembers.find(
          (member) => member.email.toLowerCase() === normalizedEmail
        );
        if (existingMember) {
          throw new Error('User already exists');
        }

        const invite: PendingInvite = {
          id: generateId(),
          email: normalizedEmail,
          role,
          inviteCode: generateInviteCode(),
          invitedBy,
          invitedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          businessId,
          status: 'pending',
        };

        const { data: rpcInviteRows, error: rpcInviteError } = await supabase.rpc('create_business_invite', {
          email_input: invite.email,
          role_input: invite.role,
          invited_by_input: invite.invitedBy,
        });

        if (!rpcInviteError) {
          const rpcRow = (Array.isArray(rpcInviteRows) ? rpcInviteRows[0] : rpcInviteRows) as Record<string, unknown> | null;
          if (rpcRow) {
            const savedInvite: PendingInvite = {
              id: (rpcRow.id as string) ?? invite.id,
              email: (rpcRow.email as string) ?? invite.email,
              role: normalizeRole((rpcRow.role as string | null) ?? invite.role),
              inviteCode: (rpcRow.invite_code as string) ?? (rpcRow.inviteCode as string) ?? invite.inviteCode,
              invitedBy: (rpcRow.invited_by as string) ?? (rpcRow.invitedBy as string) ?? invite.invitedBy,
              invitedAt: (rpcRow.invited_at as string) ?? (rpcRow.invitedAt as string) ?? invite.invitedAt,
              expiresAt: (rpcRow.expires_at as string) ?? (rpcRow.expiresAt as string) ?? invite.expiresAt,
              businessId: (rpcRow.business_id as string) ?? invite.businessId,
              status: ((rpcRow.status as InviteStatus | undefined) ?? 'pending'),
              emailSentAt: (rpcRow.email_sent_at as string) ?? (rpcRow.emailSentAt as string) ?? undefined,
              createdByUserId: (rpcRow.created_by_user_id as string) ?? (rpcRow.createdByUserId as string) ?? undefined,
            };

            set({ pendingInvites: [...get().pendingInvites, savedInvite] });
            return savedInvite;
          }
        }

        if (rpcInviteError) {
          console.warn('create_business_invite RPC failed, falling back to direct insert:', rpcInviteError.message);
        }

        const { data: inviteRow, error: inviteError } = await supabase
          .from('invites')
          .insert({
            email: invite.email,
            role: invite.role,
            invite_code: invite.inviteCode,
            invited_by: invite.invitedBy,
            invited_at: invite.invitedAt,
            expires_at: invite.expiresAt,
            business_id: invite.businessId,
            status: 'pending',
            created_by_user_id: currentUser.id,
          })
          .select()
          .single();

        if (inviteError) {
          const { data: businessRow } = await supabase
            .from('businesses')
            .select('invite_limit_total')
            .eq('id', businessId)
            .maybeSingle();
          const { count: inviteCount } = await supabase
            .from('invites')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId);
          const inviteLimit = typeof businessRow?.invite_limit_total === 'number' ? businessRow.invite_limit_total : 5;
          if (typeof inviteCount === 'number' && inviteCount >= inviteLimit) {
            throw new Error(`Invite limit reached (${inviteLimit} total).`);
          }
          console.warn('Supabase invite creation failed:', inviteError);
          throw new Error('Invite could not be created. Please try again.');
        }

        const savedInvite: PendingInvite = {
          ...invite,
          id: inviteRow?.id ?? invite.id,
          status: ((inviteRow?.status as InviteStatus | undefined) ?? 'pending'),
          emailSentAt: inviteRow?.email_sent_at ?? inviteRow?.emailSentAt,
          createdByUserId: inviteRow?.created_by_user_id ?? inviteRow?.createdByUserId,
        };

        set({ pendingInvites: [...get().pendingInvites, savedInvite] });

        return savedInvite;
      },

      cancelInvite: async (inviteId) => {
        const { data, error: inviteError } = await supabase
          .rpc('delete_invite', { invite_id_input: inviteId });

        if (inviteError || !data) {
          const { error: softCancelError } = await supabase
            .from('invites')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by_user_id: get().currentUser?.id ?? null,
            })
            .eq('id', inviteId);

          if (softCancelError) {
            const { error: fallbackError } = await supabase
            .from('invites')
            .delete()
            .eq('id', inviteId);

            if (fallbackError) {
              throw inviteError ?? softCancelError ?? fallbackError ?? new Error('Invite could not be deleted.');
            }
          }
        }
        set({
          pendingInvites: get().pendingInvites.filter((invite) => invite.id !== inviteId),
        });
      },

      getInviteByCode: async (inviteCode) => {
        const { data: inviteRows, error: inviteError } = await supabase
          .rpc('get_invite_by_code', { invite_code_input: inviteCode });

        if (inviteError) {
          throw inviteError;
        }

        const row = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
        const invite = row
          ? {
            id: row.id,
            email: row.email,
            role: normalizeRole(row.role),
            inviteCode: row.invite_code ?? row.inviteCode,
            invitedBy: row.invited_by ?? row.invitedBy,
            invitedAt: row.invited_at ?? row.invitedAt ?? new Date().toISOString(),
            expiresAt: row.expires_at ?? row.expiresAt ?? new Date().toISOString(),
            businessId: row.business_id,
            status: (row.status ?? 'pending') as InviteStatus,
            joinedAt: row.joined_at ?? row.joinedAt,
            joinedUserId: row.joined_user_id ?? row.joinedUserId,
          }
          : undefined;
        if (!invite) return undefined;
        if (invite.status && invite.status !== 'pending') return undefined;
        if (new Date(invite.expiresAt) < new Date()) return undefined;
        return invite;
      },

      acceptInvite: async (inviteCode, name, password) => {
        try {
          set({ isAuthLoading: true });
          const invite = await get().getInviteByCode(inviteCode);

          if (!invite) {
            set({ isAuthLoading: false });
            return { success: false, error: 'Invalid or expired invite code' };
          }

          const { data: signupData, error: signupError } = await supabase.auth.signUp({
            email: invite.email,
            password,
            options: {
              data: { name: name.trim() },
            },
          });

          if (signupError || !signupData.user) {
            throw signupError ?? new Error('Invite signup failed');
          }

          const createdUserId = signupData.user.id;
          const createdAt = new Date().toISOString();

          const { error: profileError } = await supabase.from('profiles').upsert({
            id: createdUserId,
            email: invite.email,
            name: name.trim(),
            role: invite.role,
            business_id: invite.businessId,
            created_at: createdAt,
          }, { onConflict: 'id' });

          if (profileError) {
            throw profileError;
          }

          const { error: teamInsertError } = await supabase.from('team_members').insert({
            user_id: createdUserId,
            email: invite.email,
            name: name.trim(),
            role: invite.role,
            business_id: invite.businessId,
            created_at: createdAt,
            last_login: createdAt,
          });

          if (teamInsertError) {
            const { error: teamUpdateError } = await supabase
              .from('team_members')
              .update({
                email: invite.email,
                name: name.trim(),
                role: invite.role,
                business_id: invite.businessId,
                last_login: createdAt,
              })
              .eq('user_id', createdUserId);

            if (teamUpdateError) {
              throw teamUpdateError;
            }
          }

          const joinedAt = new Date().toISOString();
          const { error: inviteStatusError } = await supabase
            .from('invites')
            .update({
              status: 'joined',
              joined_at: joinedAt,
              joined_user_id: createdUserId,
            })
            .eq('id', invite.id);

          if (inviteStatusError) {
            const { error: legacyDeleteInviteError } = await supabase
              .from('invites')
              .delete()
              .eq('id', invite.id);

            if (legacyDeleteInviteError) {
              throw inviteStatusError;
            }
          }

          set({
            isAuthenticated: true,
            currentUser: {
              id: createdUserId,
              email: invite.email,
              name: name.trim(),
              role: invite.role,
              businessId: invite.businessId,
            },
            businessId: invite.businessId,
            isAuthLoading: false,
          });

          await get().refreshTeamData();
          void sendOnboardingWelcomeEmail({
            type: 'team_welcome',
            businessId: invite.businessId,
            toEmail: invite.email,
            recipientName: name.trim(),
            role: invite.role,
            inviterName: invite.invitedBy,
          }).catch((welcomeError) => {
            console.warn('Team welcome email failed (non-fatal):', welcomeError);
          });
          return { success: true };
        } catch (error) {
          set({ isAuthLoading: false });
          console.error('Invite signup failed:', error);
          return { success: false, error: getAuthErrorMessage(error, 'Failed to create account.') };
        }
      },

      setUserPassword: (_email?: string, _password?: string) => {
        // Password changes are handled through Supabase Auth.
      },
    }),
    {
      name: "fyll-auth-storage",
      storage: createJSONStorage(() => storage),
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<AuthStore> & {
          currentUser?: AuthUser | null;
          isOfflineMode?: boolean;
        };

        if (state.isOfflineMode || state.currentUser?.isOffline) {
          return {
            ...state,
            isAuthenticated: false,
            isOfflineMode: false,
            currentUser: null,
            businessId: null,
            teamMembers: [],
            pendingInvites: [],
          };
        }

        return {
          ...state,
          isOfflineMode: false,
        };
      },
    }
  )
);

export default useAuthStore;
