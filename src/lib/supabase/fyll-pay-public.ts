// Public Fyll Pay QR RPCs (see supabase/migrations/20261124150000_fyll_pay_qr.sql).
// The page at payment.fyll.app/<business>/pay is unauthenticated; both functions are
// SECURITY DEFINER and only ever expose the account the business marked for Fyll Pay.
import { supabase } from '../supabase';
import { resolveBusinessAssetUrl } from '@/lib/storage-attachments';
import type { BankAccountSnapshot } from '@/lib/state/fyll-store';
import { normalizeCountry, normalizeCurrency, type CurrencyCode } from '@/lib/locale';

export interface FyllPayPublicInfo {
  businessName: string;
  businessLogo: string | null;
  country: string;
  currency: CurrencyCode;
  enabled: boolean;
  bankAccount: BankAccountSnapshot | null;
}

export const getFyllPayPublic = async (businessSlug: string): Promise<FyllPayPublicInfo | null> => {
  const { data, error } = await supabase.rpc('get_fyll_pay_public', { business_slug_input: businessSlug.trim() });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const next = data as Record<string, unknown>;
  const bank = next.bankAccount && typeof next.bankAccount === 'object' ? (next.bankAccount as BankAccountSnapshot) : null;
  return {
    businessName: typeof next.businessName === 'string' && next.businessName.trim() ? next.businessName.trim() : 'Fyll',
    businessLogo: resolveBusinessAssetUrl(typeof next.businessLogo === 'string' && next.businessLogo.trim() ? next.businessLogo.trim() : null),
    country: normalizeCountry(next.country),
    currency: normalizeCurrency(next.currency),
    enabled: next.enabled === true && !!bank,
    bankAccount: bank,
  };
};

export type FyllPaySubmitError =
  | 'business_not_found' | 'not_enabled' | 'invalid_code' | 'invalid_amount' | 'invalid_name'
  | 'invalid_phone' | 'invalid_email' | 'invalid_receipt' | 'duplicate' | 'rate_limited';

export const submitFyllPayPayment = async (input: {
  businessSlug: string;
  code: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  proofImageUrl: string;
}) => {
  const { data, error } = await supabase.rpc('submit_fyll_pay_payment', {
    business_slug_input: input.businessSlug.trim(),
    code_input: input.code,
    amount_input: input.amount,
    customer_name_input: input.customerName,
    customer_phone_input: input.customerPhone,
    customer_email_input: input.customerEmail,
    proof_image_url_input: input.proofImageUrl,
  });
  if (error) throw error;
  return data as { ok: boolean; code?: string; error?: FyllPaySubmitError };
};

// On payment.fyll.app the page lives at the bare business address (payment.fyll.app/minteyewear).
// Other hosts (local dev, previews) use /<business>/pay, because /<business> there is order tracking.
export const buildFyllPayPath = (businessSlug: string, fixedAmount?: number | null, { onPaymentHost = true }: { onPaymentHost?: boolean } = {}) => {
  const slug = businessSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const base = onPaymentHost ? `/${slug}` : `/${slug}/pay`;
  return fixedAmount && fixedAmount > 0 ? `${base}?amount=${Math.round(fixedAmount * 100) / 100}` : base;
};
