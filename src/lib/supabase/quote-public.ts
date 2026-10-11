// Public quote RPCs for the customer's /q/[code] page. All three are SECURITY DEFINER functions
// granted to anon (see supabase/migrations/20261012120000_quotes.sql); the quotes table itself
// has no anon access, and these never return costs.
import { supabase } from '../supabase';
import { resolveBusinessAssetUrl } from '@/lib/storage-attachments';
import type { QuoteStatus } from '@/lib/quotes';

export interface PublicQuote {
  businessName: string;
  businessLogo: string | null;
  businessPhone: string;
  quoteNumber: string;
  status: QuoteStatus;
  customerName: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
  depositPercent: number;
  depositAmount: number;
  balance: number;
  validUntil: string;
  readyIn: string;
  note: string;
  bankAccount: { bankName: string; accountName: string; accountNumber: string } | null;
  proofRejected: boolean;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const normalizeQuote = (value: unknown): PublicQuote | null => {
  if (!value || typeof value !== 'object') return null;
  const next = value as Record<string, unknown>;
  const status = text(next.status);
  if (!status) return null;
  const bank = next.bankAccount && typeof next.bankAccount === 'object'
    ? (next.bankAccount as Record<string, unknown>)
    : null;
  return {
    businessName: text(next.businessName).trim() || 'Fyll',
    businessLogo: resolveBusinessAssetUrl(text(next.businessLogo).trim() || null),
    businessPhone: text(next.businessPhone),
    quoteNumber: text(next.quoteNumber),
    status: status as QuoteStatus,
    customerName: text(next.customerName),
    items: Array.isArray(next.items)
      ? next.items.map((item) => {
        const row = item as Record<string, unknown>;
        return { name: text(row.name), quantity: Number(row.quantity) || 1, unitPrice: Number(row.unitPrice) || 0 };
      })
      : [],
    total: Number(next.total) || 0,
    depositPercent: Number(next.depositPercent) || 0,
    depositAmount: Number(next.depositAmount) || 0,
    balance: Number(next.balance) || 0,
    validUntil: text(next.validUntil),
    readyIn: text(next.readyIn),
    note: text(next.note),
    bankAccount: bank
      ? { bankName: text(bank.bankName), accountName: text(bank.accountName), accountNumber: text(bank.accountNumber) }
      : null,
    proofRejected: next.proofRejected === true,
  };
};

export const getQuotePublic = async (code: string) => {
  const { data, error } = await supabase.rpc('get_quote_public', { code_input: code.trim().toUpperCase() });
  if (error) throw error;
  return normalizeQuote(data);
};

export type QuoteResponseAction = 'accept' | 'decline' | 'request_changes' | 'reopen';

export const respondToQuote = async ({
  code,
  action,
  message,
  topics,
  reason,
}: {
  code: string;
  action: QuoteResponseAction;
  message?: string;
  topics?: string[];
  reason?: string;
}) => {
  const { data, error } = await supabase.rpc('respond_quote_public', {
    code_input: code.trim().toUpperCase(),
    action_input: action,
    message_input: message ?? null,
    topics_input: topics ?? null,
    reason_input: reason ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string; status?: QuoteStatus };
};

export const submitQuoteProof = async ({ code, proofImageUrl }: { code: string; proofImageUrl: string }) => {
  const { data, error } = await supabase.rpc('submit_quote_proof', {
    code_input: code.trim().toUpperCase(),
    proof_url_input: proofImageUrl,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
};
