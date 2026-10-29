import { formatCurrency } from '@/lib/state/fyll-store';
import { getPaymentLinkOrigin, slugifyBusinessName } from '@/lib/tracking-url';
import type { StatusTone } from '@/components/payments/payments-ui';

// A quote is a priced offer sent to a customer for approval before any order exists. It lives in
// the staff-only `quotes` table (supabase/migrations/20261012120000_quotes.sql); the customer
// only ever sees it through the public RPCs behind /q/[code].

export type QuoteStatus =
  | 'sent'
  | 'changes_requested'
  | 'accepted'
  | 'proof_submitted'
  | 'proof_rejected'
  | 'order_created'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  // What it costs the business. Staff only: the public RPC never returns it.
  unitCost: number;
  // Set for items picked from inventory; custom items have neither.
  productId?: string;
  variantId?: string;
  custom: boolean;
}

export interface QuoteActivity {
  id: string;
  text: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  at: string;
}

export interface Quote {
  id: string; // == the shareable link code
  businessId: string;
  quoteNumber: string; // QT-1024
  status: QuoteStatus;

  customerName: string;
  customerPhone: string;
  customerEmail?: string;

  items: QuoteItem[];
  total: number;
  depositPercent: number;
  depositAmount: number;
  balance: number;
  validUntil: string; // ISO
  readyIn?: string;
  note?: string;
  bankAccount: { bankName: string; accountName: string; accountNumber: string };

  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;

  viewCount?: number;
  lastViewedAt?: string;
  acceptedAt?: string;
  changesRequest?: { message: string; topics: string[]; at: string };
  declineReason?: string;
  proofImageUrl?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  convertedOrderId?: string;
  convertedOrderNumber?: string;
  activity?: QuoteActivity[];
}

export const QUOTE_DEPOSIT_OPTIONS = [30, 40, 50, 100] as const;
export const DEFAULT_QUOTE_VALID_DAYS = 14;

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  sent: 'Quote sent',
  changes_requested: 'Changes asked',
  accepted: 'Awaiting deposit',
  proof_submitted: 'Needs review',
  proof_rejected: 'Proof rejected',
  order_created: 'Order created',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

// 'neutral' is a quote that is just waiting; everything else reuses the payments tones.
export const QUOTE_STATUS_TONE: Record<QuoteStatus, StatusTone | 'neutral'> = {
  sent: 'neutral',
  changes_requested: 'awaiting',
  accepted: 'awaiting',
  proof_submitted: 'review',
  proof_rejected: 'rejected',
  order_created: 'verified',
  declined: 'rejected',
  expired: 'closed',
  cancelled: 'closed',
};

export const getQuoteEffectiveStatus = (quote: Pick<Quote, 'status' | 'validUntil'>): QuoteStatus => {
  if ((quote.status === 'sent' || quote.status === 'changes_requested') && quote.validUntil) {
    const until = new Date(quote.validUntil).getTime();
    if (Number.isFinite(until) && until < Date.now()) return 'expired';
  }
  return quote.status;
};

// A quote that still needs the business to do something (or is waiting on the customer).
export const isQuoteOpen = (status: QuoteStatus) => (
  status === 'sent' || status === 'changes_requested' || status === 'accepted' || status === 'proof_submitted' || status === 'proof_rejected'
);

export const computeQuoteTotals = (items: Pick<QuoteItem, 'quantity' | 'unitPrice' | 'unitCost'>[], depositPercent: number) => {
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cost = items.reduce((sum, item) => sum + (item.unitCost || 0) * item.quantity, 0);
  const depositAmount = Math.round(total * depositPercent / 100);
  return {
    total,
    cost,
    margin: total - cost,
    marginPercent: total > 0 ? Math.round(((total - cost) / total) * 100) : 0,
    depositAmount,
    balance: total - depositAmount,
  };
};

export const nextQuoteNumber = (quotes: Pick<Quote, 'quoteNumber'>[]) => {
  const highest = quotes.reduce((max, quote) => {
    const value = Number(/(\d+)$/.exec(quote.quoteNumber ?? '')?.[1]);
    return Number.isFinite(value) && value > max ? value : max;
  }, 1000);
  return `QT-${highest + 1}`;
};

type QuoteBusiness = { businessName?: string | null; businessSlug?: string | null };

// payment.fyll.app/<business>/quote/<code>, alongside the business's payment links.
export const buildQuotePath = (code: string, business?: QuoteBusiness) => {
  const slug = slugifyBusinessName(business?.businessSlug || business?.businessName || '');
  const encoded = encodeURIComponent(code.trim().toUpperCase());
  return slug ? `/${slug}/quote/${encoded}` : `/q/${encoded}`;
};

export const buildQuoteUrl = (code: string, business?: QuoteBusiness) => `${getPaymentLinkOrigin()}${buildQuotePath(code, business)}`;

export const quoteLinkLabel = (code: string, business?: QuoteBusiness) => buildQuoteUrl(code, business).replace(/^https?:\/\//, '');

// Nigerian numbers are usually typed as 0803 555 0142; WhatsApp wants 234803...
export const toWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
};

export const buildWhatsAppUrl = (phone: string, text: string) => {
  const number = toWhatsAppNumber(phone);
  const query = `text=${encodeURIComponent(text)}`;
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`;
};

export const buildQuoteMessage = (quote: Pick<Quote, 'id' | 'customerName' | 'total'>, businessName: string, businessSlug?: string | null) => {
  const first = quote.customerName.trim().split(/\s+/)[0] || 'there';
  return `Hi ${first}, here's your quote from ${businessName}: ${formatCurrency(quote.total)}. Review it, accept or ask for changes: ${buildQuoteUrl(quote.id, { businessName, businessSlug })}`;
};

export const buildQuoteReminder = (quote: Pick<Quote, 'id' | 'customerName' | 'total'>, businessName: string, businessSlug?: string | null) => {
  const first = quote.customerName.trim().split(/\s+/)[0] || 'there';
  return `Hi ${first}, a quick reminder about your ${businessName} quote of ${formatCurrency(quote.total)}. You can accept it here: ${buildQuoteUrl(quote.id, { businessName, businessSlug })}`;
};

export const newQuoteActivity = (text: string, tone: QuoteActivity['tone'] = 'neutral'): QuoteActivity => ({
  id: Math.random().toString(36).slice(2, 12),
  text,
  tone,
  at: new Date().toISOString(),
});

export const formatQuoteDate = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatQuoteTime = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};
