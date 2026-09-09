// Public Social Checkout RPCs — mirrors public-tracking.ts's shape exactly.
// Both RPCs are SECURITY DEFINER functions granted to anon (see
// supabase/social_checkout_public_rpcs.sql); the underlying social_checkouts
// table itself has no anon grants at all.
import { supabase } from '../supabase';
import { resolveBusinessAssetUrl } from '@/lib/storage-attachments';

export interface PublicSocialCheckoutDraft {
  businessId: string;
  businessName: string;
  businessLogo: string | null;
  status: 'awaiting_payment' | 'payment_submitted' | 'verified' | 'rejected' | 'cancelled' | 'expired';
  amount: number;
  billNote: string;
  bankAccount: { bankName: string; accountName: string; accountNumber: string };
  expiresAt: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryState?: string;
}

const normalizeDraftPayload = (value: unknown): PublicSocialCheckoutDraft | null => {
  if (!value || typeof value !== 'object') return null;
  const next = value as Record<string, unknown>;
  const businessId = typeof next.businessId === 'string' ? next.businessId : '';
  const status = typeof next.status === 'string' ? next.status : '';
  if (!businessId || !status) return null;

  return {
    businessId,
    businessName: typeof next.businessName === 'string' && next.businessName.trim() ? next.businessName.trim() : 'Fyll',
    businessLogo: resolveBusinessAssetUrl(typeof next.businessLogo === 'string' && next.businessLogo.trim() ? next.businessLogo.trim() : null),
    status: status as PublicSocialCheckoutDraft['status'],
    amount: Number(next.amount) || 0,
    billNote: typeof next.billNote === 'string' ? next.billNote : '',
    bankAccount: (next.bankAccount && typeof next.bankAccount === 'object'
      ? next.bankAccount
      : { bankName: '', accountName: '', accountNumber: '' }) as PublicSocialCheckoutDraft['bankAccount'],
    expiresAt: typeof next.expiresAt === 'string' ? next.expiresAt : '',
    customerName: typeof next.customerName === 'string' ? next.customerName : '',
    customerPhone: typeof next.customerPhone === 'string' ? next.customerPhone : '',
    customerEmail: typeof next.customerEmail === 'string' ? next.customerEmail : '',
    deliveryAddress: typeof next.deliveryAddress === 'string' ? next.deliveryAddress : '',
    deliveryState: typeof next.deliveryState === 'string' ? next.deliveryState : '',
  };
};

export const getSocialCheckoutPublic = async (code: string) => {
  const { data, error } = await supabase.rpc('get_social_checkout_public', { code_input: code.trim().toUpperCase() });
  if (error) throw error;
  return normalizeDraftPayload(data);
};

export const submitSocialCheckoutPayment = async ({
  code,
  customerName,
  customerPhone,
  customerEmail,
  deliveryAddress,
  deliveryState,
  proofImageUrl,
}: {
  code: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryState: string;
  proofImageUrl: string;
}) => {
  const { data, error } = await supabase.rpc('submit_social_checkout_payment', {
    code_input: code.trim().toUpperCase(),
    customer_name_input: customerName,
    customer_phone_input: customerPhone,
    customer_email_input: customerEmail,
    delivery_address_input: deliveryAddress,
    delivery_state_input: deliveryState,
    proof_image_url_input: proofImageUrl,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
};
