import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { AuthUser, TeamRole } from '@/lib/state/auth-store';
import { areBusinessIdsEquivalent } from '@/lib/business-id';

export interface VerifiedBusinessLogin {
  session: Session;
  user: AuthUser;
  businessName: string;
}

async function buildVerifiedBusinessLogin(
  client: SupabaseClient,
  session: Session,
  expectedBusinessId?: string,
  fallbackEmail?: string,
): Promise<VerifiedBusinessLogin> {
  const authUser = session.user;
  if (!authUser?.id) throw new Error('Could not verify this saved session. Please sign in again.');
  const [profileResult, membershipResult] = await Promise.all([
    client.from('profiles').select('id, email, name, role, business_id').eq('id', authUser.id).maybeSingle(),
    client.from('team_members').select('name, role, business_id').eq('user_id', authUser.id).maybeSingle(),
  ]);
  if (profileResult.error || membershipResult.error) throw new Error('Unable to verify business access. Please try again.');
  const profile = profileResult.data;
  const member = membershipResult.data;
  if (profile?.business_id && member?.business_id && !areBusinessIdsEquivalent(profile.business_id, member.business_id)) {
    throw new Error('This account has conflicting business memberships. Please contact support.');
  }
  const businessId: string | undefined = profile?.business_id ?? member?.business_id;
  if (!businessId) throw new Error('This account does not have an existing business. Complete its normal setup first.');
  if (expectedBusinessId && !areBusinessIdsEquivalent(expectedBusinessId, businessId)) {
    throw new Error('This login belongs to a different business. Use Add existing business to add it.');
  }
  const { data: business, error: businessError } = await client.from('businesses')
    .select('id, name').eq('id', businessId).maybeSingle();
  if (businessError || !business?.id || !business.name?.trim()) {
    throw new Error('An existing, named business is required. Complete its normal setup first.');
  }
  const role = member?.role ?? profile?.role;
  if (!['admin', 'manager', 'staff'].includes(role)) throw new Error('Your business role could not be verified.');
  return {
    session,
    businessName: business.name,
    user: {
      id: authUser.id, email: authUser.email ?? profile?.email ?? fallbackEmail ?? '',
      name: member?.name ?? profile?.name ?? authUser.email ?? '',
      role: role as TeamRole, businessId: business.id,
    },
  };
}

export async function verifyBusinessLogin(
  client: SupabaseClient,
  email: string,
  password: string,
  expectedBusinessId?: string,
): Promise<VerifiedBusinessLogin> {
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session || !data.user) throw new Error('Could not sign in. Check your email and password.');
  return buildVerifiedBusinessLogin(client, data.session, expectedBusinessId, email.trim().toLowerCase());
}

export async function verifySavedBusinessSession(
  client: SupabaseClient,
  session: Session,
  expectedBusinessId: string,
): Promise<VerifiedBusinessLogin> {
  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    console.warn('Saved business session rejected by Supabase:', error?.message ?? 'no session returned', error?.status ?? '');
    throw new Error('Your saved sign-in expired. Please sign in again.');
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    console.warn('Saved business session getUser() failed:', userError?.message ?? 'no user returned', userError?.status ?? '');
    throw new Error('Your saved sign-in expired. Please sign in again.');
  }
  return buildVerifiedBusinessLogin(client, { ...data.session, user: userData.user }, expectedBusinessId, session.user?.email);
}
