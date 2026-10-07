import { supabase } from '@/lib/supabase';

// Client side of primary Fyll accounts (see supabase/primary_accounts.sql and
// supabase/functions/primary-account). A primary account is the owner's own
// sign-in (e.g. their Gmail) that is linked to one or more businesses; work
// logins keep working exactly as before.

export type PrimaryLinkStatus = 'pending' | 'active';

export interface BusinessPrimaryLink {
  primaryEmail: string;
  status: PrimaryLinkStatus;
}

export interface MyBusiness {
  businessId: string;
  name: string;
  role: string;
  isActive: boolean;
}

export class PrimaryAccountError extends Error {
  code: string;
  constructor(message: string, code = 'error') {
    super(message);
    this.code = code;
  }
}

type FunctionResult = { status?: PrimaryLinkStatus; email?: string; emailSent?: boolean; businessId?: string };

const callPrimaryAccountFunction = async (body: Record<string, unknown>): Promise<FunctionResult> => {
  const { data, error } = await supabase.functions.invoke('primary-account', { body });
  if (error) {
    // supabase-js hides the JSON body of a non-2xx response inside error.context.
    let message = 'Could not reach Fyll. Check your connection and try again.';
    let code = 'error';
    try {
      const response = (error as { context?: Response }).context;
      if (response && typeof response.json === 'function') {
        const payload = await response.json() as { error?: string; code?: string };
        if (payload?.error) message = payload.error;
        if (payload?.code) code = payload.code;
      }
    } catch {
      // keep the generic message
    }
    throw new PrimaryAccountError(message, code);
  }
  return (data ?? {}) as FunctionResult;
};

// A business admin adds the owner's primary email to this business.
export const linkPrimaryEmail = (input: { email: string; password: string; name?: string }) => (
  callPrimaryAccountFunction({ action: 'link', ...input })
);

// A business admin makes the email they are signed in with their primary email. No code is
// needed: signing in with it already proves they own it.
export const makeLoginEmailPrimary = () => callPrimaryAccountFunction({ action: 'promote' });

// Confirms the primary email with the 6-digit code that was emailed to it.
export const verifyPrimaryEmail = (code: string) => callPrimaryAccountFunction({ action: 'verify', code });

// Emails a fresh code for the primary email that is still waiting to be confirmed.
export const resendPrimaryVerification = () => callPrimaryAccountFunction({ action: 'resend' });

// A signed-in primary account claims another business with that business's admin login.
export const claimBusiness = (input: { workEmail: string; workPassword: string }) => (
  callPrimaryAccountFunction({ action: 'claim', ...input })
);

export const fetchBusinessPrimaryLink = async (businessId: string): Promise<BusinessPrimaryLink | null> => {
  const { data, error } = await supabase.rpc('get_business_primary_link', { target_business_id: businessId });
  if (error) {
    console.warn('Could not load the primary email link:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.primary_email) return null;
  return { primaryEmail: String(row.primary_email), status: row.status === 'active' ? 'active' : 'pending' };
};

export const fetchIsPrimaryAccount = async (): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_primary_account');
  if (error) return false;
  return data === true;
};

export const fetchMyBusinesses = async (): Promise<MyBusiness[]> => {
  const { data, error } = await supabase.rpc('get_my_businesses');
  if (error || !Array.isArray(data)) return [];
  return data.map((row: { business_id: string; name: string; role: string; is_active: boolean }) => ({
    businessId: String(row.business_id),
    name: String(row.name),
    role: String(row.role),
    isActive: Boolean(row.is_active),
  }));
};

export const setActiveBusiness = async (businessId: string) => {
  const { error } = await supabase.rpc('set_active_business', { target_business_id: businessId });
  if (error) throw new PrimaryAccountError(error.message || 'Could not switch business.');
};

// Turns pending links into real memberships once the primary email is verified.
// Harmless for everyone else: it returns 0.
export const activatePrimaryLinks = async () => {
  const { error } = await supabase.rpc('activate_primary_links');
  if (error) console.warn('Could not activate primary links:', error.message);
};
