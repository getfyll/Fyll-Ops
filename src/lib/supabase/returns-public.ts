import { supabase } from '../supabase';
import type { ReturnReason, ReturnResolution } from '@/lib/state/fyll-store';
import { queueReturnEmail } from '@/lib/supabase/return-emails';

// returns.fyll.app: a customer starts a return without logging in.
// See supabase/migrations/20261126100000_public_returns.sql.

export type PublicReturnError =
  | 'not_found'
  | 'no_items'
  | 'photo_required'
  | 'missing_reason'
  | 'invalid_reason'
  | 'invalid_resolution'
  | 'rate_limited'
  | 'unknown';

export type PublicReturnResult =
  | { ok: true; ref: string; returnId: string; businessId: string }
  | { ok: false; error: PublicReturnError };

export const submitPublicReturn = async (input: {
  trackingCode: string;
  email: string;
  businessSlug?: string | null;
  itemIndexes: number[];
  reason: ReturnReason;
  otherReason: string;
  resolution: ReturnResolution;
  message: string;
  proofUrls: string[];
}): Promise<PublicReturnResult> => {
  const { data, error } = await supabase.rpc('submit_public_return', {
    tracking_code_input: input.trackingCode.trim(),
    email_input: input.email.trim().toLowerCase(),
    business_slug_input: input.businessSlug?.trim() || null,
    item_indexes: input.itemIndexes,
    reason_input: input.reason,
    other_reason_input: input.otherReason.trim(),
    resolution_input: input.resolution,
    message_input: input.message.trim(),
    proof_urls: input.proofUrls,
  });
  if (error) throw error;

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === true && typeof result.ref === 'string' && typeof result.returnId === 'string') {
    const businessId = typeof result.businessId === 'string' ? result.businessId : '';
    // "We got your return" email to the customer. The email function only ever sends it once per return.
    if (businessId && result.duplicate !== true) queueReturnEmail({ type: 'return_received', businessId, returnId: result.returnId });
    return { ok: true, ref: result.ref, returnId: result.returnId, businessId };
  }
  const known: PublicReturnError[] = ['not_found', 'no_items', 'photo_required', 'missing_reason', 'invalid_reason', 'invalid_resolution', 'rate_limited'];
  const code = typeof result.error === 'string' && (known as string[]).includes(result.error) ? (result.error as PublicReturnError) : 'unknown';
  return { ok: false, error: code };
};
