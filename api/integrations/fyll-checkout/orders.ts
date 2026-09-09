import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTEGRATION_SECRET = process.env.FYLL_CHECKOUT_INTEGRATION_SECRET ?? process.env.SERVER_SECRET;

type CheckoutItem = {
  name?: string;
  productName?: string;
  product_name?: string;
  itemName?: string;
  item_name?: string;
  title?: string;
  product?: {
    name?: string;
  };
  quantity?: number;
  qty?: number;
  unitPrice?: number;
  unit_price?: number;
  price?: number;
  lineTotal?: number;
  line_total?: number;
  total?: number;
};

type CatalogProductRow = {
  id: string;
  data: {
    name?: string;
    variants?: { id?: string }[];
  } | null;
};

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

type CheckoutPayload = ProofCarrier & {
  businessId?: string;
  merchantId?: string;
  storeUrl?: string;
  source?: string;
  reference?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  amount?: number;
  amountPaid?: number;
  paidAmount?: number;
  expectedAmount?: number;
  amountDue?: number;
  orderTotal?: number;
  totalAmount?: number;
  total?: number;
  currency?: string;
  items?: CheckoutItem[];
  shipping?: {
    name?: string;
    price?: number;
    address?: string;
  };
  bankTransfer?: ProofCarrier & {
    bank?: string;
    accountName?: string;
    accountNumber?: string;
  };
  fyllCheckout?: ProofCarrier;
  checkoutUrl?: string;
  createdAt?: string;
};

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const firstText = (...values: unknown[]) => values.map(normalizeText).find(Boolean) || '';

const getPaymentProofUrl = (payload: CheckoutPayload) => firstText(
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
);

const recordValue = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const proofAliases = (proofUrl: string) => (proofUrl ? {
  paymentProofUrl: proofUrl,
  proofUrl,
  receiptUrl: proofUrl,
} : {});

const normalizeStoreUrl = (value: unknown) => normalizeText(value).toLowerCase().replace(/\/+$/, '');

// Mirrors normalizeProductNameValue in src/app/storefront-payment/[id].tsx so a
// checkout item's free-text name matches the same way a manually-converted
// Fyll Checkout payment would.
const normalizeProductNameValue = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

// Fyll Checkout sends only a free-text item name, no SKU or catalog id — this
// is a best-effort name match against the business's real catalog so the
// order references a real public.products row instead of always minting a
// synthetic `fyll-checkout-item-...` id (which then shows as "Product no
// longer available" in reviews, order history, etc). Falls back to no match
// (caller keeps the synthetic id) for genuinely catalog-less lines.
const matchCheckoutItemToCatalogProduct = (itemName: string, products: CatalogProductRow[]) => {
  const itemNameKey = normalizeProductNameValue(itemName);
  if (!itemNameKey) return null;

  for (const product of products) {
    const productNameKey = normalizeProductNameValue(product.data?.name);
    if (!productNameKey) continue;
    const isMatch = productNameKey === itemNameKey
      || itemNameKey.startsWith(`${productNameKey} `)
      || productNameKey.includes(itemNameKey);
    if (!isMatch) continue;

    const variantId = product.data?.variants?.[0]?.id;
    if (!variantId) continue;

    return { productId: product.id, variantId };
  }
  return null;
};

const normalizeAmount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getCheckoutItemName = (item: CheckoutItem, index: number) => (
  normalizeText(item.productName)
  || normalizeText(item.product_name)
  || normalizeText(item.name)
  || normalizeText(item.itemName)
  || normalizeText(item.item_name)
  || normalizeText(item.title)
  || normalizeText(item.product?.name)
  || `Checkout item ${index + 1}`
);

const getCheckoutItemQuantity = (item: CheckoutItem) => (
  Math.max(1, Math.floor(normalizeAmount(item.quantity ?? item.qty) || 1))
);

const getCheckoutItemUnitPrice = (item: CheckoutItem) => (
  normalizeAmount(item.unitPrice ?? item.unit_price ?? item.price)
);

const getCheckoutItemLineTotal = (item: CheckoutItem) => {
  const explicitTotal = normalizeAmount(item.lineTotal ?? item.line_total ?? item.total);
  if (explicitTotal > 0) return explicitTotal;
  return getCheckoutItemUnitPrice(item) * getCheckoutItemQuantity(item);
};

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

const isManualBankTransferMethod = (value: string) => normalizePaymentMethod(value) === 'bank_transfer';
const isInstantCardMethod = (value: string) => normalizePaymentMethod(value) === 'card';

const toOrderStatus = (status: string, paymentMethod = '') => {
  const normalized = normalizeStatus(status);
  if (isPaidStatus(status)) return isInstantCardMethod(paymentMethod) ? 'Processing' : 'Payment confirmed';
  if (isManualVerificationStatus(status) || isAmountMismatchStatus(status)) return 'Payment approval';
  if (normalized === 'failed') return 'Payment failed';
  return 'Payment approval';
};

const isActionableCheckoutStatus = (status: string) => {
  const normalized = normalizeStatus(status);
  return isPaidStatus(status)
    || isManualVerificationStatus(status)
    || isAmountMismatchStatus(status)
    || ['failed', 'refunded', 'cancelled', 'canceled'].includes(normalized);
};

const validateCheckoutPayload = (payload: CheckoutPayload) => {
  const status = normalizeText(payload.paymentStatus) || normalizeText(payload.status);
  const paymentMethod = normalizePaymentMethod(normalizeText(payload.paymentMethod));
  const amountPaid = normalizeAmount(payload.amountPaid ?? payload.paidAmount ?? payload.amount);
  const customerName = normalizeText(payload.customer?.name);
  const customerEmail = normalizeText(payload.customer?.email);
  const items = payload.items ?? [];

  if (!isActionableCheckoutStatus(status)) {
    return 'Ignored non-payment checkout event. Send only paid, partial/underpaid, awaiting_verification/proof_uploaded, failed, refunded, or cancelled events.';
  }
  if (amountPaid <= 0) {
    return 'amount/amountPaid must be greater than 0 for Fyll Checkout payment sync.';
  }
  if (!customerName && !customerEmail) {
    return 'customer.name or customer.email is required for Fyll Checkout payment sync.';
  }
  if (!Array.isArray(items) || items.length === 0) {
    return 'items are required for Fyll Checkout payment sync.';
  }
  if (!paymentMethod) {
    return 'paymentMethod is required for Fyll Checkout payment sync.';
  }
  return '';
};

const buildRows = (payload: CheckoutPayload, catalogProducts: CatalogProductRow[]) => {
  const now = new Date().toISOString();
  const businessId = normalizeText(payload.businessId);
  const reference = normalizeText(payload.reference);
  const merchantId = normalizeText(payload.merchantId);
  const storeUrl = normalizeStoreUrl(payload.storeUrl);
  const createdAt = normalizeText(payload.createdAt) || now;
  const status = normalizeText(payload.paymentStatus) || normalizeText(payload.status) || 'pending';
  const paymentMethod = normalizePaymentMethod(normalizeText(payload.paymentMethod));
  const amountPaid = normalizeAmount(payload.amountPaid ?? payload.paidAmount ?? payload.amount);
  const shippingPrice = normalizeAmount(payload.shipping?.price);
  const sourceOrderId = reference;
  const paymentId = `fyll_checkout_${reference}`;
  const customerName = normalizeText(payload.customer?.name) || 'Fyll Checkout customer';
  const proofUrl = getPaymentProofUrl(payload);

  const checkoutItems = (payload.items ?? []).map((item, index) => {
    const quantity = getCheckoutItemQuantity(item);
    const unitPrice = getCheckoutItemUnitPrice(item);
    const lineTotal = getCheckoutItemLineTotal(item);
    const productName = getCheckoutItemName(item, index);
    return {
      name: productName,
      productName,
      quantity,
      unitPrice,
      lineTotal,
    };
  });
  const itemsSubtotal = checkoutItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const explicitExpectedTotal = normalizeAmount(
    payload.expectedAmount
      ?? payload.amountDue
      ?? payload.orderTotal
      ?? payload.totalAmount
      ?? payload.total
  );
  const expectedAmount = explicitExpectedTotal > 0
    ? explicitExpectedTotal
    : itemsSubtotal > 0
      ? itemsSubtotal + shippingPrice
      : amountPaid;
  const subtotal = itemsSubtotal > 0 ? itemsSubtotal : Math.max(0, expectedAmount - shippingPrice);
  const balanceDue = Math.max(0, expectedAmount - amountPaid);

  const orderItems = checkoutItems.map((item, index) => {
    const fallbackId = `fyll-checkout-item-${reference}-${index + 1}`;
    const matched = matchCheckoutItemToCatalogProduct(item.productName, catalogProducts);
    return {
      productId: matched?.productId ?? fallbackId,
      variantId: matched?.variantId ?? fallbackId,
      quantity: item.quantity,
      unitPrice: item.unitPrice || item.lineTotal,
      productName: item.productName,
      variantName: 'Fyll Checkout',
    };
  });

  const order = {
    id: sourceOrderId,
    orderNumber: reference,
    websiteOrderReference: reference,
    customerName,
    customerEmail: normalizeText(payload.customer?.email),
    customerPhone: normalizeText(payload.customer?.phone),
    deliveryState: normalizeText(payload.shipping?.name),
    deliveryAddress: normalizeText(payload.shipping?.address),
    items: orderItems,
    services: [],
    additionalCharges: 0,
    additionalChargesNote: '',
    deliveryFee: shippingPrice,
    paymentMethod,
    status: toOrderStatus(status, paymentMethod),
    orderStatus: toOrderStatus(status, paymentMethod),
    source: 'Fyll Checkout',
    subtotal,
    totalAmount: expectedAmount,
    orderDate: createdAt,
    createdAt,
    updatedAt: now,
    activityLog: [{
      staffName: 'Fyll Checkout',
      action: `Synced checkout ${reference} with status ${status}`,
      date: now,
    }],
    ...proofAliases(proofUrl),
    fyllCheckout: {
      ...recordValue(payload.fyllCheckout),
      merchantId,
      storeUrl,
      reference,
      checkoutUrl: normalizeText(payload.checkoutUrl),
      ...proofAliases(proofUrl),
      amountPaid,
      expectedAmount,
      balanceDue,
      paymentStatus: status,
    },
    bankTransfer: {
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    },
  };

  const payment = {
    id: paymentId,
    businessId,
    source: 'fyll_checkout',
    sourceOrderId,
    customerName,
    customerEmail: normalizeText(payload.customer?.email),
    customerPhone: normalizeText(payload.customer?.phone),
    amount: amountPaid,
    amountPaid,
    expectedAmount,
    orderTotal: expectedAmount,
    balanceDue,
    currency: normalizeText(payload.currency) || 'NGN',
    paymentMethod,
    status: toPaymentStatus(status),
    ...proofAliases(proofUrl),
    checkoutUrl: normalizeText(payload.checkoutUrl),
    idempotencyKey: `fyll_checkout:${reference}`,
    merchantId,
    storeUrl,
    items: checkoutItems,
    bankTransfer: {
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    },
    bankAccount: payload.bankTransfer ? {
      ...recordValue(payload.bankTransfer),
      ...proofAliases(proofUrl),
    } : null,
    fyllCheckout: {
      ...recordValue(payload.fyllCheckout),
      reference,
      sourceOrderId,
      checkoutUrl: normalizeText(payload.checkoutUrl),
      ...proofAliases(proofUrl),
    },
    createdAt,
    updatedAt: now,
  };

  return { businessId, reference, order, payment };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase service configuration missing' });
  }

  const payload = (req.body ?? {}) as CheckoutPayload;
  const validationError = validateCheckoutPayload(payload);
  if (validationError) {
    return res.status(422).json({ error: validationError });
  }
  const businessId = normalizeText(payload.businessId);
  const reference = normalizeText(payload.reference);
  if (!businessId || !reference) {
    return res.status(400).json({ error: 'businessId and reference are required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: catalogProducts } = await supabase
    .from('products')
    .select('id, data')
    .eq('business_id', businessId);

  const { order, payment } = buildRows(payload, (catalogProducts ?? []) as CatalogProductRow[]);

  const timestamp = new Date().toISOString();
  const [{ error: orderError }, { error: paymentError }] = await Promise.all([
    supabase
      .from('orders')
      .upsert({ id: order.id, business_id: businessId, data: order, updated_at: timestamp }, { onConflict: 'id,business_id' }),
    supabase
      .from('payments')
      .upsert({ id: payment.id, business_id: businessId, data: payment, updated_at: timestamp }, { onConflict: 'id,business_id' }),
  ]);

  if (orderError || paymentError) {
    return res.status(500).json({
      error: 'Failed to upsert Fyll Checkout order',
      details: orderError?.message ?? paymentError?.message,
    });
  }

  return res.status(200).json({
    success: true,
    businessId,
    reference,
    orderId: order.id,
    paymentId: payment.id,
  });
}
