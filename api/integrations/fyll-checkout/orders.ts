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
    image?: string;
    imageUrl?: string;
  };
  image?: string;
  imageUrl?: string;
  image_url?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  sku?: string;
  variantName?: string;
  variant_name?: string;
  productId?: string | number;
  product_id?: string | number;
  variationId?: string | number;
  variation_id?: string | number;
  variantId?: string | number;
  variant_id?: string | number;
  wooCommerceProductId?: string | number;
  wooCommerceVariationId?: string | number;
  woo_product_id?: string | number;
  woo_variation_id?: string | number;
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
    wooCommerceProductId?: string;
    sourceProductId?: string;
    websiteProductId?: string;
    variants?: {
      id?: string;
      sku?: string;
      variableValues?: Record<string, string>;
      wooCommerceProductId?: string;
      wooCommerceVariationId?: string;
      sourceProductId?: string;
      sourceVariantId?: string;
    }[];
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
  orderId?: string | number;
  orderNumber?: string | number;
  websiteOrderReference?: string | number;
  wooCommerceOrderId?: string | number;
  woocommerceOrderId?: string | number;
  woocommerce_order_id?: string | number;
  wooOrderId?: string | number;
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
  fyllCheckout?: ProofCarrier & {
    orderId?: string | number;
    orderNumber?: string | number;
    websiteOrderReference?: string | number;
    wooCommerceOrderId?: string | number;
    woocommerceOrderId?: string | number;
    woocommerce_order_id?: string | number;
    wooOrderId?: string | number;
  };
  checkoutUrl?: string;
  createdAt?: string;
};

const normalizeText = (value: unknown) => (
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
);

const firstText = (...values: unknown[]) => values.map(normalizeText).find(Boolean) || '';

export const getWooOrderReference = (payload: CheckoutPayload, checkoutReference: string) => {
  const candidate = firstText(
    payload.wooCommerceOrderId,
    payload.woocommerceOrderId,
    payload.woocommerce_order_id,
    payload.wooOrderId,
    payload.websiteOrderReference,
    payload.orderId,
    payload.fyllCheckout?.wooCommerceOrderId,
    payload.fyllCheckout?.woocommerceOrderId,
    payload.fyllCheckout?.woocommerce_order_id,
    payload.fyllCheckout?.wooOrderId,
    payload.fyllCheckout?.websiteOrderReference,
    payload.fyllCheckout?.orderId,
    payload.orderNumber,
    payload.fyllCheckout?.orderNumber,
  );

  if (!candidate || candidate.toLowerCase() === checkoutReference.toLowerCase()) return '';
  return candidate;
};

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

const normalizeLookupValue = (value: unknown) => (
  normalizeText(value)
    .toLowerCase()
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^woo[\s#:-]*/i, '')
    .replace(/^product[\s#:-]*/i, '')
    .replace(/^variation[\s#:-]*/i, '')
    .replace(/[^a-z0-9]+/g, '')
);

const getCheckoutItemVariantName = (item: CheckoutItem) => (
  normalizeText(item.variantName) || normalizeText(item.variant_name)
);

const getCheckoutProductKeys = (item: CheckoutItem) => [
  item.wooCommerceProductId,
  item.woo_product_id,
  item.productId,
  item.product_id,
].map(normalizeLookupValue).filter(Boolean);

const getCheckoutVariantKeys = (item: CheckoutItem) => [
  item.wooCommerceVariationId,
  item.woo_variation_id,
  item.variationId,
  item.variation_id,
  item.variantId,
  item.variant_id,
].map(normalizeLookupValue).filter(Boolean);

const getCatalogProductKeys = (product: CatalogProductRow) => [
  product.id,
  product.data?.wooCommerceProductId,
  product.data?.sourceProductId,
  product.data?.websiteProductId,
  product.id.replace(/^woo-product-/i, ''),
].map(normalizeLookupValue).filter(Boolean);

const getCatalogVariantKeys = (variant: NonNullable<NonNullable<CatalogProductRow['data']>['variants']>[number]) => [
  variant.id,
  variant.wooCommerceVariationId,
  variant.sourceVariantId,
  variant.wooCommerceProductId,
  variant.sourceProductId,
  variant.id?.replace(/^woo-variant-/i, ''),
].map(normalizeLookupValue).filter(Boolean);

const getCatalogVariantName = (variant: NonNullable<NonNullable<CatalogProductRow['data']>['variants']>[number]) => (
  Object.values(variant.variableValues ?? {}).join(' ').trim()
);

// Prefer stable SKU/Woo ids. When an older checkout only supplies a combined
// name such as "Turkey Silver", infer "Silver" from the catalog product name.
// Never silently select the first colour when a multi-variant product is
// ambiguous.
const matchCheckoutItemToCatalogProduct = (item: CheckoutItem, itemName: string, products: CatalogProductRow[]) => {
  const itemNameKey = normalizeProductNameValue(itemName);
  if (!itemNameKey) return null;

  const itemSku = normalizeLookupValue(item.sku);
  const productKeys = getCheckoutProductKeys(item);
  const variantKeys = getCheckoutVariantKeys(item);

  if (itemSku) {
    for (const product of products) {
      const variant = product.data?.variants?.find((candidate) => normalizeLookupValue(candidate.sku) === itemSku);
      if (variant?.id) return { productId: product.id, variantId: variant.id, variantName: getCatalogVariantName(variant) };
    }
  }

  for (const product of products) {
    const productNameKey = normalizeProductNameValue(product.data?.name);
    if (!productNameKey) continue;
    const productIdMatches = productKeys.length > 0
      && productKeys.some((key) => getCatalogProductKeys(product).includes(key));
    const nameMatches = productNameKey === itemNameKey
      || itemNameKey.startsWith(`${productNameKey} `)
      || productNameKey.includes(itemNameKey);
    if (!productIdMatches && !nameMatches) continue;

    const variants = product.data?.variants ?? [];
    const explicitVariantName = normalizeProductNameValue(getCheckoutItemVariantName(item));
    const inferredVariantName = itemNameKey.startsWith(`${productNameKey} `)
      ? itemNameKey.slice(productNameKey.length).trim()
      : '';
    const requestedVariantName = explicitVariantName || inferredVariantName;

    const variant = variants.find((candidate) => (
      variantKeys.length > 0
      && variantKeys.some((key) => getCatalogVariantKeys(candidate).includes(key))
    )) ?? variants.find((candidate) => {
      if (!requestedVariantName) return false;
      const candidateName = normalizeProductNameValue(getCatalogVariantName(candidate));
      return candidateName === requestedVariantName
        || candidateName.includes(requestedVariantName)
        || requestedVariantName.includes(candidateName);
    }) ?? (variants.length === 1 ? variants[0] : undefined);

    if (!variant?.id) continue;

    return { productId: product.id, variantId: variant.id, variantName: getCatalogVariantName(variant) };
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

// Statuses Fyll Checkout itself sets while an order is still being paid for.
// Once staff move an order past these, checkout syncs must not overwrite it.
const CHECKOUT_MANAGED_STATUSES = new Set(['', 'pending payment', 'payment approval', 'payment confirmed', 'payment failed']);

type StoredOrder = Record<string, unknown> & { status?: unknown; orderStatus?: unknown; activityLog?: unknown };

// Repeat syncs (proof uploaded, payment confirmed…) used to replace the whole
// Ops order, wiping staff status changes, item edits and activity history.
// Merge instead: checkout owns payment/reference fields; Ops owns the rest.
const mergeCheckoutOrderIntoExisting = (existing: StoredOrder, incoming: StoredOrder): StoredOrder => {
  const existingStatus = normalizeText(existing.status);
  const checkoutStillOwnsStatus = CHECKOUT_MANAGED_STATUSES.has(existingStatus.toLowerCase());
  const existingLog = Array.isArray(existing.activityLog) ? existing.activityLog : [];
  const incomingLog = Array.isArray(incoming.activityLog) ? incoming.activityLog : [];
  const keepText = (key: string) => normalizeText(existing[key]) || incoming[key];

  return {
    ...incoming,
    ...existing,
    // Payment, proof and reference data always comes from checkout.
    websiteOrderReference: normalizeText(incoming.websiteOrderReference) || existing.websiteOrderReference,
    paymentMethod: incoming.paymentMethod ?? existing.paymentMethod,
    fyllCheckout: { ...recordValue(existing.fyllCheckout), ...recordValue(incoming.fyllCheckout) },
    bankTransfer: { ...recordValue(existing.bankTransfer), ...recordValue(incoming.bankTransfer) },
    ...proofAliases(normalizeText(incoming.paymentProofUrl) || normalizeText(existing.paymentProofUrl)),
    // Status only moves while the order is still in a payment stage.
    status: checkoutStillOwnsStatus ? incoming.status : existing.status,
    orderStatus: checkoutStillOwnsStatus ? incoming.orderStatus : (existing.orderStatus ?? existing.status),
    // Staff edits to customer details are kept; blanks are filled from checkout.
    customerName: keepText('customerName'),
    customerEmail: keepText('customerEmail'),
    customerPhone: keepText('customerPhone'),
    deliveryAddress: keepText('deliveryAddress'),
    deliveryState: keepText('deliveryState'),
    activityLog: [...existingLog, ...incomingLog],
    updatedAt: incoming.updatedAt ?? existing.updatedAt,
  };
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

export const buildRows = (payload: CheckoutPayload, catalogProducts: CatalogProductRow[]) => {
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
  const wooOrderReference = getWooOrderReference(payload, reference);
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
      variantName: getCheckoutItemVariantName(item),
      sku: normalizeText(item.sku),
      imageUrl: firstText(
        item.imageUrl,
        item.image_url,
        item.thumbnailUrl,
        item.thumbnail_url,
        item.thumbnail,
        item.image,
        item.product?.imageUrl,
        item.product?.image,
      ),
      productId: firstText(item.productId, item.product_id),
      variationId: firstText(item.variationId, item.variation_id, item.variantId, item.variant_id),
      wooCommerceProductId: firstText(item.wooCommerceProductId, item.woo_product_id),
      wooCommerceVariationId: firstText(item.wooCommerceVariationId, item.woo_variation_id),
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
    const sourceItem = payload.items?.[index] ?? item;
    const matched = matchCheckoutItemToCatalogProduct(sourceItem, item.productName, catalogProducts);
    return {
      productId: matched?.productId ?? fallbackId,
      variantId: matched?.variantId ?? fallbackId,
      quantity: item.quantity,
      unitPrice: item.unitPrice || item.lineTotal,
      productName: item.productName,
      variantName: matched?.variantName || item.variantName || 'Fyll Checkout',
    };
  });

  const order = {
    id: sourceOrderId,
    orderNumber: reference,
    websiteOrderReference: wooOrderReference || undefined,
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
    websiteOrderReference: wooOrderReference || undefined,
    wooCommerceOrderId: wooOrderReference || undefined,
    customerName,
    customerEmail: normalizeText(payload.customer?.email),
    customerPhone: normalizeText(payload.customer?.phone),
    amount: amountPaid,
    amountPaid,
    expectedAmount,
    orderTotal: expectedAmount,
    balanceDue,
    deliveryFee: shippingPrice,
    deliveryAmount: shippingPrice,
    shippingFee: shippingPrice,
    shippingAmount: shippingPrice,
    shipping: payload.shipping ? { ...payload.shipping } : undefined,
    shippingLines: shippingPrice > 0 ? [{
      name: normalizeText(payload.shipping?.name) || 'Delivery',
      amount: shippingPrice,
      total: shippingPrice,
      price: shippingPrice,
    }] : [],
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

  const { order: incomingOrder, payment } = buildRows(payload, (catalogProducts ?? []) as CatalogProductRow[]);
  const { data: existingOrderRow } = await supabase
    .from('orders')
    .select('data')
    .eq('id', incomingOrder.id)
    .eq('business_id', businessId)
    .maybeSingle();
  const existingOrderData = existingOrderRow?.data && typeof existingOrderRow.data === 'object'
    ? existingOrderRow.data as StoredOrder
    : null;
  const order = existingOrderData
    ? { ...mergeCheckoutOrderIntoExisting(existingOrderData, incomingOrder as unknown as StoredOrder), id: incomingOrder.id }
    : incomingOrder;

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
