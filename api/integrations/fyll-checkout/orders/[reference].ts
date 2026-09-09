import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTEGRATION_SECRET = process.env.FYLL_CHECKOUT_INTEGRATION_SECRET ?? process.env.SERVER_SECRET;

type ProofAttachment = {
  url?: string;
  uri?: string;
  publicUrl?: string;
  public_url?: string;
};

type ProofCarrier = {
  paymentProofUrl?: string;
  proofUrl?: string;
  proof_url?: string;
  payment_proof_url?: string;
  receiptUrl?: string;
  receipt_url?: string;
  receipt?: ProofAttachment;
  proof?: ProofAttachment;
};

type StatusPatchPayload = ProofCarrier & {
  businessId?: string;
  merchantId?: string;
  storeUrl?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paidAt?: string;
  bankTransfer?: ProofCarrier;
  fyllCheckout?: ProofCarrier;
};

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const firstText = (...values: unknown[]) => values.map(normalizeText).find(Boolean) || '';

const recordValue = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const proofAliases = (proofUrl: string) => (proofUrl ? {
  paymentProofUrl: proofUrl,
  proofUrl,
  receiptUrl: proofUrl,
} : {});

const getPaymentProofUrl = (payload: StatusPatchPayload, existingPayment: Record<string, unknown>, existingOrder: Record<string, unknown>) => firstText(
  payload.paymentProofUrl,
  payload.proofUrl,
  payload.proof_url,
  payload.payment_proof_url,
  payload.receiptUrl,
  payload.receipt_url,
  payload.receipt?.url,
  payload.receipt?.uri,
  payload.receipt?.publicUrl,
  payload.receipt?.public_url,
  payload.proof?.url,
  payload.proof?.uri,
  payload.proof?.publicUrl,
  payload.proof?.public_url,
  payload.bankTransfer?.paymentProofUrl,
  payload.bankTransfer?.proofUrl,
  payload.bankTransfer?.proof_url,
  payload.bankTransfer?.payment_proof_url,
  payload.bankTransfer?.receiptUrl,
  payload.bankTransfer?.receipt_url,
  payload.bankTransfer?.receipt?.url,
  payload.bankTransfer?.receipt?.uri,
  payload.bankTransfer?.receipt?.publicUrl,
  payload.bankTransfer?.receipt?.public_url,
  payload.bankTransfer?.proof?.url,
  payload.bankTransfer?.proof?.uri,
  payload.bankTransfer?.proof?.publicUrl,
  payload.bankTransfer?.proof?.public_url,
  payload.fyllCheckout?.paymentProofUrl,
  payload.fyllCheckout?.proofUrl,
  payload.fyllCheckout?.proof_url,
  payload.fyllCheckout?.payment_proof_url,
  payload.fyllCheckout?.receiptUrl,
  payload.fyllCheckout?.receipt_url,
  payload.fyllCheckout?.receipt?.url,
  payload.fyllCheckout?.receipt?.uri,
  payload.fyllCheckout?.receipt?.publicUrl,
  payload.fyllCheckout?.receipt?.public_url,
  payload.fyllCheckout?.proof?.url,
  payload.fyllCheckout?.proof?.uri,
  payload.fyllCheckout?.proof?.publicUrl,
  payload.fyllCheckout?.proof?.public_url,
  existingPayment.paymentProofUrl,
  existingPayment.proofUrl,
  existingPayment.receiptUrl,
  recordValue(existingPayment.bankTransfer).paymentProofUrl,
  recordValue(existingPayment.bankTransfer).proofUrl,
  recordValue(existingPayment.bankTransfer).receiptUrl,
  recordValue(existingPayment.fyllCheckout).paymentProofUrl,
  recordValue(existingPayment.fyllCheckout).proofUrl,
  recordValue(existingPayment.fyllCheckout).receiptUrl,
  existingOrder.paymentProofUrl,
  existingOrder.proofUrl,
  existingOrder.receiptUrl,
  recordValue(existingOrder.bankTransfer).paymentProofUrl,
  recordValue(existingOrder.bankTransfer).proofUrl,
  recordValue(existingOrder.bankTransfer).receiptUrl,
  recordValue(existingOrder.fyllCheckout).paymentProofUrl,
  recordValue(existingOrder.fyllCheckout).proofUrl,
  recordValue(existingOrder.fyllCheckout).receiptUrl,
);

const normalizeStatus = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);

const isPaidStatus = (status: string) => ['paid', 'card paid', 'confirmed', 'payment confirmed'].includes(normalizeStatus(status));
const isAmountMismatchStatus = (status: string) => [
  'partial',
  'partially paid',
  'partial payment',
  'underpaid',
  'amount mismatch',
  'payment mismatch',
].includes(normalizeStatus(status));
const isManualVerificationStatus = (status: string) => [
  'pending manual verification',
  'proof uploaded',
  'awaiting verification',
  'payment pending verification',
  'pending verification',
  'requires verification',
  'manual verification',
].includes(normalizeStatus(status));

const isAuthorized = (req: VercelRequest) => {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return Boolean(INTEGRATION_SECRET && value === `Bearer ${INTEGRATION_SECRET}`);
};

const toPaymentStatus = (status: string) => {
  const normalized = normalizeStatus(status);
  if (isPaidStatus(status)) return 'confirmed';
  if (isManualVerificationStatus(status) || isAmountMismatchStatus(status)) return 'proof_submitted';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'refunded') return 'refunded';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'rejected';
  return 'pending';
};

const normalizePaymentMethod = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transfer' || normalized === 'bank-transfer' || normalized === 'bank transfer' || normalized === 'bacs') return 'bank_transfer';
  if (normalized === 'card' || normalized === 'paystack_card' || normalized === 'paystack' || normalized === 'paystack card') return 'card';
  return normalized;
};

const isInstantCardMethod = (value: string) => normalizePaymentMethod(value) === 'card';

const toOrderStatusForMethod = (status: string, paymentMethod = '') => {
  const normalized = normalizeStatus(status);
  if (isPaidStatus(status)) return isInstantCardMethod(paymentMethod) ? 'Processing' : 'Payment confirmed';
  if (isManualVerificationStatus(status) || isAmountMismatchStatus(status)) return 'Payment approval';
  if (normalized === 'failed') return 'Payment failed';
  return 'Payment approval';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase service configuration missing' });
  }

  const reference = normalizeText(req.query.reference);
  const payload = (req.body ?? {}) as StatusPatchPayload;
  const businessId = normalizeText(payload.businessId);
  if (!reference || !businessId) {
    return res.status(400).json({ error: 'businessId and reference are required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const paymentId = `fyll_checkout_${reference}`;
  const [{ data: orderRow, error: orderFetchError }, { data: paymentRow, error: paymentFetchError }] = await Promise.all([
    supabase.from('orders').select('id, data').eq('id', reference).eq('business_id', businessId).maybeSingle(),
    supabase.from('payments').select('id, data').eq('id', paymentId).eq('business_id', businessId).maybeSingle(),
  ]);

  if (orderFetchError || paymentFetchError) {
    return res.status(500).json({
      error: 'Failed to load Fyll Checkout order',
      details: orderFetchError?.message ?? paymentFetchError?.message,
    });
  }

  if (!orderRow || !paymentRow) {
    return res.status(404).json({
      error: 'Fyll Checkout order was not found. Send a valid create/upsert payment event before patching status.',
    });
  }

  const now = new Date().toISOString();
  const status = normalizeText(payload.paymentStatus) || normalizeText(payload.status);
  const paymentMethod = normalizePaymentMethod(normalizeText(payload.paymentMethod));
  const orderData = (orderRow?.data && typeof orderRow.data === 'object' && !Array.isArray(orderRow.data))
    ? orderRow.data as Record<string, unknown>
    : {};
  const paymentData = (paymentRow?.data && typeof paymentRow.data === 'object' && !Array.isArray(paymentRow.data))
    ? paymentRow.data as Record<string, unknown>
    : {};

  const proofUrl = getPaymentProofUrl(payload, paymentData, orderData);
  const nextPaymentData = {
    ...paymentData,
    id: paymentId,
    businessId,
    source: 'fyll_checkout',
    sourceOrderId: reference,
    status: status ? toPaymentStatus(status) : paymentData.status,
    paymentMethod: paymentMethod || paymentData.paymentMethod,
    ...proofAliases(proofUrl),
    paidAt: normalizeText(payload.paidAt) || paymentData.paidAt,
    merchantId: normalizeText(payload.merchantId) || paymentData.merchantId,
    storeUrl: normalizeText(payload.storeUrl) || paymentData.storeUrl,
    bankTransfer: {
      ...recordValue(paymentData.bankTransfer),
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    },
    bankAccount: {
      ...recordValue(paymentData.bankAccount),
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    },
    fyllCheckout: {
      ...recordValue(paymentData.fyllCheckout),
      ...recordValue(payload.fyllCheckout),
      reference,
      sourceOrderId: reference,
      ...proofAliases(proofUrl),
      paidAt: normalizeText(payload.paidAt) || undefined,
    },
    updatedAt: now,
  };
  const nextOrderData = {
    ...orderData,
    id: reference,
    status: status ? toOrderStatusForMethod(status, paymentMethod || String(orderData.paymentMethod ?? '')) : orderData.status,
    orderStatus: status ? toOrderStatusForMethod(status, paymentMethod || String(orderData.paymentMethod ?? '')) : orderData.orderStatus,
    paymentMethod: paymentMethod || orderData.paymentMethod,
    ...proofAliases(proofUrl),
    updatedAt: now,
    bankTransfer: {
      ...recordValue(orderData.bankTransfer),
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    },
    fyllCheckout: {
      ...recordValue(orderData.fyllCheckout),
      ...recordValue(payload.fyllCheckout),
      reference,
      ...proofAliases(proofUrl),
      paidAt: normalizeText(payload.paidAt) || undefined,
    },
  };

  const [{ error: orderUpdateError }, { error: paymentUpdateError }] = await Promise.all([
    supabase
      .from('orders')
      .upsert({ id: reference, business_id: businessId, data: nextOrderData, updated_at: now }, { onConflict: 'id,business_id' }),
    supabase
      .from('payments')
      .upsert({ id: paymentId, business_id: businessId, data: nextPaymentData, updated_at: now }, { onConflict: 'id,business_id' }),
  ]);

  if (orderUpdateError || paymentUpdateError) {
    return res.status(500).json({
      error: 'Failed to update Fyll Checkout order',
      details: orderUpdateError?.message ?? paymentUpdateError?.message,
    });
  }

  return res.status(200).json({
    success: true,
    businessId,
    reference,
    orderId: reference,
    paymentId,
  });
}
