import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, ActivityIndicator, Platform, Alert, TextInput, Linking, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Copy, CreditCard, ExternalLink, FileText, Landmark, Mail, MapPin, MoreHorizontal, Package, Pencil, Phone, Save, User, X } from 'lucide-react-native';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { formatDeliveryLocation, normalizeDeliveryStateValue } from '@/lib/format-address';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, generateOrderNumber, type BankAccount, type Order, type OrderActivityEntry, type OrderItem, type Product } from '@/lib/state/fyll-store';
import { supabaseData } from '@/lib/supabase/data';
import { notifyFyllCheckoutPaymentConfirmed, showFyllCheckoutSyncFailedNotice } from '@/lib/fyll-checkout-confirmation';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';
import { PaymentDetailSkeleton } from '@/components/SkeletonLoader';
import { SearchClearButton } from '@/components/SearchClearButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, InitialsAvatar, MoneyText, SectionLabel, isHovered, usePaymentsPalette, type StatusTone } from '@/components/payments/payments-ui';

const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

type SharedPaymentStatus = 'pending' | 'proof_submitted' | 'confirmed' | 'verified' | 'rejected' | 'failed' | 'refunded';
type StorefrontPaymentStatus = 'pending' | 'proof_submitted' | 'confirmed' | 'verified' | 'rejected' | 'failed' | 'refunded';

type SharedPaymentRecord = {
  id: string;
  businessId: string;
  source: 'storefront' | string;
  sourceOrderId: string;
  websiteOrderReference?: string;
  wooCommerceOrderId?: string | number;
  linkedOrderId?: string | null;
  linkedOrderNumber?: string | null;
  linkedOrderLinkedAt?: string | null;
  unlinkedOrderId?: string | null;
  unlinkedOrderAt?: string | null;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  delivery_address?: string;
  shippingAddress?: string;
  shipping_address?: string;
  address?: string;
  deliveryState?: string;
  delivery_state?: string;
  shippingState?: string;
  shipping_state?: string;
  state?: string;
  customer?: {
    address?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
  };
  shipping?: {
    address?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
  };
  amount: number;
  amountPaid?: number;
  expectedAmount?: number;
  orderTotal?: number;
  balanceDue?: number;
  deliveryFee?: number;
  delivery_fee?: number;
  deliveryAmount?: number;
  delivery_amount?: number;
  shippingFee?: number;
  shipping_fee?: number;
  shippingCost?: number;
  shipping_cost?: number;
  shippingAmount?: number;
  shipping_amount?: number;
  shippingTotal?: number;
  shipping_total?: number;
  shippingLines?: Array<{ amount?: number; total?: number; price?: number; name?: string; title?: string }>;
  shipping_lines?: Array<{ amount?: number; total?: number; price?: number; name?: string; title?: string }>;
  currency: 'NGN' | string;
  paymentMethod: 'bank_transfer' | 'card' | 'payment_link' | string;
  status: SharedPaymentStatus | string;
  paymentProofUrl?: string;
  proofUrl?: string;
  proof_url?: string;
  payment_proof_url?: string;
  receiptUrl?: string;
  receipt_url?: string;
  receipt?: {
    url?: string;
    uri?: string;
    publicUrl?: string;
    public_url?: string;
  };
  proof?: {
    url?: string;
    uri?: string;
    publicUrl?: string;
    public_url?: string;
  };
  paymentLinkUrl?: string;
  fyllCheckout?: {
    reference?: string;
    paymentProofUrl?: string;
    proofUrl?: string;
    proof_url?: string;
    payment_proof_url?: string;
    receiptUrl?: string;
    receipt_url?: string;
    receipt?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
    proof?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
    orderId?: string | number;
    orderNumber?: string | number;
    websiteOrderReference?: string | number;
    wooCommerceOrderId?: string | number;
    woocommerceOrderId?: string | number;
    woocommerce_order_id?: string | number;
    wooOrderId?: string | number;
  };
  activityLog?: Array<{
    id: string;
    action: string;
    actor: string;
    createdAt: string;
  }>;
  items?: Array<{
    name?: string;
    productName?: string;
    product_name?: string;
    itemName?: string;
    item_name?: string;
    title?: string;
    variantName?: string;
    variant_name?: string;
    image?: string;
    imageUrl?: string;
    image_url?: string;
    thumbnail?: string;
    thumbnailUrl?: string;
    thumbnail_url?: string;
    sku?: string;
    fyllProductId?: string;
    fyll_product_id?: string;
    fyllVariantId?: string;
    fyll_variant_id?: string;
    wooCommerceProductId?: string | number;
    wooCommerceVariationId?: string | number;
    woo_product_id?: string | number;
    woo_variation_id?: string | number;
    wooProductId?: string | number;
    wooVariationId?: string | number;
    productId?: string | number;
    product_id?: string | number;
    variationId?: string | number;
    variation_id?: string | number;
    variantId?: string | number;
    variant_id?: string | number;
    websiteProductId?: string | number;
    website_product_id?: string | number;
    websiteVariantId?: string | number;
    website_variant_id?: string | number;
    externalProductId?: string | number;
    external_product_id?: string | number;
    externalVariantId?: string | number;
    external_variant_id?: string | number;
    sourceProductId?: string | number;
    sourceVariantId?: string | number;
    source_product_id?: string | number;
    source_variant_id?: string | number;
    quantity?: number;
    qty?: number;
    unitPrice?: number;
    unit_price?: number;
    price?: number;
    lineTotal?: number;
    line_total?: number;
    total?: number;
    type?: string;
    itemType?: string;
    item_type?: string;
    category?: string;
    product?: {
      name?: string;
      image?: string;
      imageUrl?: string;
    };
  }>;
  bankAccountId?: string;
  bankAccount?: {
    id?: string;
    bank?: string;
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
  };
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
};

const normalizeStatusName = (value?: string | null) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);

const getVerifiedOrderStatus = (statuses: Array<{ name: string }>) => (
  statuses.find((status) => normalizeStatusName(status.name) === 'verified')?.name?.trim()
  || 'Verified'
);

const isSharedIntegrationPayment = (payment: SharedPaymentRecord) => (
  ['storefront', 'fyll_checkout'].includes(payment.source.trim().toLowerCase())
);

const resolvePaymentWooOrderReference = (payment: SharedPaymentRecord) => {
  const candidates = [
    payment.wooCommerceOrderId,
    payment.websiteOrderReference,
    payment.fyllCheckout?.wooCommerceOrderId,
    payment.fyllCheckout?.woocommerceOrderId,
    payment.fyllCheckout?.woocommerce_order_id,
    payment.fyllCheckout?.wooOrderId,
    payment.fyllCheckout?.websiteOrderReference,
    payment.fyllCheckout?.orderId,
    payment.fyllCheckout?.orderNumber,
  ];
  const sourceReference = payment.sourceOrderId.trim().toLowerCase();

  for (const value of candidates) {
    const candidate = String(value ?? '').trim();
    if (candidate && candidate.toLowerCase() !== sourceReference) return candidate;
  }
  return undefined;
};

type PaymentDetailData = {
  payment: SharedPaymentRecord;
  linkedOrder: Order | null;
  bankAccounts: BankAccount[];
  orders: Order[];
};

const findLinkedPaymentOrder = (payment: SharedPaymentRecord, orders: Order[]) => {
  const explicitLinkedOrderId = payment.linkedOrderId?.trim();
  if (explicitLinkedOrderId) {
    return orders.find((order) => order.id === explicitLinkedOrderId) ?? null;
  }

  const unlinkedOrderId = payment.unlinkedOrderId?.trim();
  return orders.find((order) => {
    if (unlinkedOrderId && order.id === unlinkedOrderId) return false;
    const record = order as Order & { websiteOrderReference?: string; fyllCheckout?: { reference?: string } };
    return order.id === payment.sourceOrderId
      || order.orderNumber === payment.sourceOrderId
      || record.websiteOrderReference === payment.sourceOrderId
      || record.fyllCheckout?.reference === payment.sourceOrderId;
  }) ?? null;
};

const buildPaymentDetailData = (
  paymentId: string | undefined,
  payments: SharedPaymentRecord[],
  orders: Order[],
  bankAccounts: BankAccount[]
): PaymentDetailData | undefined => {
  const payment = payments.find((candidate) => candidate.id === paymentId);
  if (!payment) return undefined;

  return {
    payment,
    linkedOrder: findLinkedPaymentOrder(payment, orders),
    bankAccounts,
    orders,
  };
};

const getStorefrontPaymentStatus = (payment: SharedPaymentRecord): StorefrontPaymentStatus => {
  const status = payment.status.trim().toLowerCase();
  if (status === 'proof_submitted' || status === 'submitted') return 'proof_submitted';
  if (status === 'verified') return 'verified';
  if (status === 'confirmed') return 'confirmed';
  if (status === 'rejected') return 'rejected';
  if (status === 'failed') return 'failed';
  if (status === 'refunded') return 'refunded';
  return 'pending';
};

const STATUS_LABEL: Record<StorefrontPaymentStatus, string> = {
  pending: 'Pending',
  proof_submitted: 'Needs review',
  confirmed: 'Verified',
  verified: 'Verified',
  rejected: 'Rejected',
  failed: 'Failed',
  refunded: 'Refunded',
};

function formatCreatedLabel(iso?: string) {
  if (!iso) return 'Created date unavailable';
  const created = new Date(iso);
  const createdDate = created.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `Created ${createdDate}, ${time}`;
}

function formatActivityTimestamp(iso?: string) {
  if (!iso) return 'Date unavailable';
  const created = new Date(iso);
  return `${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

function formatPaymentMethod(value?: string) {
  const method = String(value ?? '').trim();
  if (!method) return 'Payment';
  const normalized = method.toLowerCase().replace(/[_\s]+/g, '-');
  if (['card', 'paystack', 'paystack-card'].includes(normalized)) return 'Card / Paystack';
  if (['bank-transfer', 'transfer', 'bacs'].includes(normalized)) return 'Bank transfer';
  return method
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const normalizePaymentMethod = (value?: string | null) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
);

const isManualBankTransferMethod = (value?: string | null) => {
  const method = normalizePaymentMethod(value);
  return ['bank-transfer', 'transfer', 'bacs'].includes(method);
};

const isInstantCardMethod = (value?: string | null) => {
  const method = normalizePaymentMethod(value);
  return ['card', 'paystack', 'paystack-card'].includes(method);
};

type PaymentProofSource = {
  paymentProofUrl?: string;
  proofUrl?: string;
  proof_url?: string;
  payment_proof_url?: string;
  receiptUrl?: string;
  receipt_url?: string;
  receipt?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
  proof?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
  bankTransfer?: {
    paymentProofUrl?: string;
    proofUrl?: string;
    proof_url?: string;
    payment_proof_url?: string;
    receiptUrl?: string;
    receipt_url?: string;
    receipt?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
    proof?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
  };
  fyllCheckout?: {
    paymentProofUrl?: string;
    proofUrl?: string;
    proof_url?: string;
    payment_proof_url?: string;
    receiptUrl?: string;
    receipt_url?: string;
    receipt?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
    proof?: { url?: string; uri?: string; publicUrl?: string; public_url?: string };
  };
};

const getPaymentProofUrl = (source?: PaymentProofSource | null) => (
  source?.paymentProofUrl?.trim()
  || source?.proofUrl?.trim()
  || source?.proof_url?.trim()
  || source?.payment_proof_url?.trim()
  || source?.receiptUrl?.trim()
  || source?.receipt_url?.trim()
  || source?.receipt?.url?.trim()
  || source?.receipt?.uri?.trim()
  || source?.receipt?.publicUrl?.trim()
  || source?.receipt?.public_url?.trim()
  || source?.proof?.url?.trim()
  || source?.proof?.uri?.trim()
  || source?.proof?.publicUrl?.trim()
  || source?.proof?.public_url?.trim()
  || source?.bankTransfer?.paymentProofUrl?.trim()
  || source?.bankTransfer?.proofUrl?.trim()
  || source?.bankTransfer?.proof_url?.trim()
  || source?.bankTransfer?.payment_proof_url?.trim()
  || source?.bankTransfer?.receiptUrl?.trim()
  || source?.bankTransfer?.receipt_url?.trim()
  || source?.bankTransfer?.receipt?.url?.trim()
  || source?.bankTransfer?.receipt?.uri?.trim()
  || source?.bankTransfer?.receipt?.publicUrl?.trim()
  || source?.bankTransfer?.receipt?.public_url?.trim()
  || source?.bankTransfer?.proof?.url?.trim()
  || source?.bankTransfer?.proof?.uri?.trim()
  || source?.bankTransfer?.proof?.publicUrl?.trim()
  || source?.bankTransfer?.proof?.public_url?.trim()
  || source?.fyllCheckout?.paymentProofUrl?.trim()
  || source?.fyllCheckout?.proofUrl?.trim()
  || source?.fyllCheckout?.proof_url?.trim()
  || source?.fyllCheckout?.payment_proof_url?.trim()
  || source?.fyllCheckout?.receiptUrl?.trim()
  || source?.fyllCheckout?.receipt_url?.trim()
  || source?.fyllCheckout?.receipt?.url?.trim()
  || source?.fyllCheckout?.receipt?.uri?.trim()
  || source?.fyllCheckout?.receipt?.publicUrl?.trim()
  || source?.fyllCheckout?.receipt?.public_url?.trim()
  || source?.fyllCheckout?.proof?.url?.trim()
  || source?.fyllCheckout?.proof?.uri?.trim()
  || source?.fyllCheckout?.proof?.publicUrl?.trim()
  || source?.fyllCheckout?.proof?.public_url?.trim()
  || ''
);

type DisplayItem = {
  id: string;
  quantity: number;
  title: string;
  imageUrl?: string;
  total: number;
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getPaymentItemTitle = (item: NonNullable<SharedPaymentRecord['items']>[number], index: number) => (
  item.productName?.trim()
  || item.product_name?.trim()
  || item.name?.trim()
  || item.itemName?.trim()
  || item.item_name?.trim()
  || item.title?.trim()
  || item.product?.name?.trim()
  || `Order item ${index + 1}`
);

const getPaymentItemImage = (item: NonNullable<SharedPaymentRecord['items']>[number]) => (
  item.imageUrl?.trim()
  || item.image_url?.trim()
  || item.thumbnailUrl?.trim()
  || item.thumbnail_url?.trim()
  || item.thumbnail?.trim()
  || item.image?.trim()
  || item.product?.imageUrl?.trim()
  || item.product?.image?.trim()
  || ''
);

const combineProductVariantName = (productName: string, variantName?: string) => {
  const title = productName.trim();
  const variant = variantName?.trim() ?? '';
  if (!variant) return title;
  const normalizedTitle = normalizeProductNameValue(title);
  const normalizedVariant = normalizeProductNameValue(variant);
  if (normalizedTitle === normalizedVariant || normalizedTitle.endsWith(` ${normalizedVariant}`)) return title;
  return `${title} ${variant}`;
};

const getPaymentItemAmount = (item: NonNullable<SharedPaymentRecord['items']>[number]) => {
  const quantity = Math.max(1, Math.floor(normalizeNumber(item.quantity ?? item.qty) || 1));
  const unitPrice = normalizeNumber(item.unitPrice ?? item.unit_price ?? item.price);
  const explicitTotal = normalizeNumber(item.lineTotal ?? item.line_total ?? item.total);
  return explicitTotal > 0 ? explicitTotal : unitPrice * quantity;
};

const isPaymentDeliveryLineItem = (item: NonNullable<SharedPaymentRecord['items']>[number], index: number) => {
  const typeText = [
    item.type,
    item.itemType,
    item.item_type,
    item.category,
    item.sku,
    getPaymentItemTitle(item, index),
  ].join(' ').toLowerCase();

  return /\b(delivery|shipping|ship|logistics|dispatch|courier)\b/.test(typeText);
};

const sumShippingLines = (lines?: SharedPaymentRecord['shippingLines'] | SharedPaymentRecord['shipping_lines']) => (
  (lines ?? []).reduce((sum, line) => sum + normalizeNumber(line.amount ?? line.total ?? line.price), 0)
);

const resolvePaymentDeliveryFee = (payment: SharedPaymentRecord) => {
  const directFee = normalizeNumber(
    payment.deliveryFee
    ?? payment.delivery_fee
    ?? payment.deliveryAmount
    ?? payment.delivery_amount
    ?? payment.shippingFee
    ?? payment.shipping_fee
    ?? payment.shippingCost
    ?? payment.shipping_cost
    ?? payment.shippingAmount
    ?? payment.shipping_amount
    ?? payment.shippingTotal
    ?? payment.shipping_total
  );
  if (directFee > 0) return directFee;

  const shippingLineFee = sumShippingLines(payment.shippingLines) || sumShippingLines(payment.shipping_lines);
  if (shippingLineFee > 0) return shippingLineFee;

  return (payment.items ?? []).reduce((sum, item, index) => (
    isPaymentDeliveryLineItem(item, index) ? sum + getPaymentItemAmount(item) : sum
  ), 0);
};

const getPaymentItemVariantName = (item: NonNullable<SharedPaymentRecord['items']>[number]) => (
  item.variantName?.trim()
  || item.variant_name?.trim()
  || ''
);

const normalizeProductLookupValue = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^woo[\s#:-]*/i, '')
    .replace(/^product[\s#:-]*/i, '')
    .replace(/^variation[\s#:-]*/i, '')
    .replace(/[^a-z0-9]+/g, '')
);

const normalizeProductNameValue = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getVariantDisplayName = (variant: Product['variants'][number]) => (
  Object.values(variant.variableValues ?? {}).join(' ').trim()
);

const getProductWooKeys = (product: Product) => [
  product.id,
  product.wooCommerceProductId,
  product.sourceProductId,
  product.websiteProductId,
  product.id.replace(/^woo-product-/i, ''),
].map(normalizeProductLookupValue).filter(Boolean);

const getVariantWooKeys = (variant: Product['variants'][number]) => [
  variant.id,
  variant.wooCommerceVariationId,
  variant.sourceVariantId,
  variant.wooCommerceProductId,
  variant.sourceProductId,
  variant.id.replace(/^woo-variant-/i, ''),
  variant.id.replace(/^woo-product-/i, '').replace(/default$/i, ''),
].map(normalizeProductLookupValue).filter(Boolean);

const getProductSortRank = (product: Product) => {
  const isWooImported = product.id.toLowerCase().startsWith('woo-product-')
    || product.createdBy === 'WooCommerce Sync'
    || product.categories?.some((category) => category.toLowerCase() === 'woocommerce');
  const hasWooLink = Boolean(product.wooCommerceProductId || product.sourceProductId || product.websiteProductId);

  if (hasWooLink && !isWooImported) return 0;
  if (isWooImported) return 1;
  return 2;
};

const buildPlaceholderPaymentItem = ({
  payment,
  item,
  index,
  quantity,
  unitPrice,
  explicitTotal,
  sourceLabel,
}: {
  payment: SharedPaymentRecord;
  item: NonNullable<SharedPaymentRecord['items']>[number];
  index: number;
  quantity: number;
  unitPrice: number;
  explicitTotal: number;
  sourceLabel: string;
}): OrderItem & { productName: string; variantName: string } => ({
  productId: `fyll-checkout-item-${payment.sourceOrderId}-${index + 1}`,
  variantId: `fyll-checkout-item-${payment.sourceOrderId}-${index + 1}`,
  quantity,
  unitPrice: unitPrice || (explicitTotal > 0 ? explicitTotal / quantity : 0),
  productName: getPaymentItemTitle(item, index),
  variantName: getPaymentItemVariantName(item) || sourceLabel,
});

const resolvePaymentItemToInventory = ({
  item,
  index,
  payment,
  products,
  sourceLabel,
}: {
  item: NonNullable<SharedPaymentRecord['items']>[number];
  index: number;
  payment: SharedPaymentRecord;
  products: Product[];
  sourceLabel: string;
}): OrderItem & { productName?: string; variantName?: string } => {
  const quantity = Math.max(1, Math.floor(normalizeNumber(item.quantity ?? item.qty) || 1));
  const unitPrice = normalizeNumber(item.unitPrice ?? item.unit_price ?? item.price);
  const explicitTotal = normalizeNumber(item.lineTotal ?? item.line_total ?? item.total);
  const resolvedUnitPrice = unitPrice || (explicitTotal > 0 ? explicitTotal / quantity : 0);
  const itemSku = normalizeProductLookupValue(item.sku);
  const itemTitle = getPaymentItemTitle(item, index);
  const itemVariantName = getPaymentItemVariantName(item);
  const itemNameKey = normalizeProductNameValue(itemTitle);
  const itemVariantKey = normalizeProductNameValue(itemVariantName);
  const preferredProducts = [...products].sort((a, b) => {
    const rankDifference = getProductSortRank(a) - getProductSortRank(b);
    if (rankDifference !== 0) return rankDifference;
    return a.name.localeCompare(b.name);
  });

  const explicitProductId = item.fyllProductId?.trim() || item.fyll_product_id?.trim() || '';
  const explicitVariantId = item.fyllVariantId?.trim() || item.fyll_variant_id?.trim() || '';
  if (explicitProductId && explicitVariantId) {
    const explicitProduct = products.find((product) => product.id === explicitProductId);
    const explicitVariant = explicitProduct?.variants.find((variant) => variant.id === explicitVariantId);
    if (explicitProduct && explicitVariant) {
      return { productId: explicitProduct.id, variantId: explicitVariant.id, quantity, unitPrice: resolvedUnitPrice || explicitVariant.sellingPrice };
    }
  }

  if (itemSku) {
    for (const product of preferredProducts) {
      const variant = product.variants.find((candidate) => normalizeProductLookupValue(candidate.sku) === itemSku);
      if (variant) {
        return { productId: product.id, variantId: variant.id, quantity, unitPrice: resolvedUnitPrice || variant.sellingPrice };
      }
    }
  }

  const wooProductCandidates = [
    item.wooCommerceProductId,
    item.woo_product_id,
    item.wooProductId,
    item.productId,
    item.product_id,
    item.websiteProductId,
    item.website_product_id,
    item.externalProductId,
    item.external_product_id,
    item.sourceProductId,
    item.source_product_id,
  ].map(normalizeProductLookupValue).filter(Boolean);
  const wooVariantCandidates = [
    item.wooCommerceVariationId,
    item.woo_variation_id,
    item.wooVariationId,
    item.variationId,
    item.variation_id,
    item.variantId,
    item.variant_id,
    item.websiteVariantId,
    item.website_variant_id,
    item.externalVariantId,
    item.external_variant_id,
    item.sourceVariantId,
    item.source_variant_id,
  ].map(normalizeProductLookupValue).filter(Boolean);

  if (wooProductCandidates.length > 0 || wooVariantCandidates.length > 0) {
    for (const product of preferredProducts) {
      const productKeys = getProductWooKeys(product);
      const productMatches = wooProductCandidates.length === 0 || wooProductCandidates.some((candidate) => productKeys.includes(candidate));
      if (!productMatches) continue;

      const productNameKey = normalizeProductNameValue(product.name);
      const inferredVariantKey = itemNameKey.startsWith(`${productNameKey} `)
        ? itemNameKey.slice(productNameKey.length).trim()
        : '';
      const requestedVariantKey = itemVariantKey || inferredVariantKey;
      const variant = product.variants.find((candidate) => {
        const variantKeys = getVariantWooKeys(candidate);
        return wooVariantCandidates.length > 0 && wooVariantCandidates.some((value) => variantKeys.includes(value));
      }) ?? product.variants.find((candidate) => {
        if (!requestedVariantKey) return false;
        const variantNameKey = normalizeProductNameValue(getVariantDisplayName(candidate));
        return variantNameKey === requestedVariantKey
          || variantNameKey.includes(requestedVariantKey)
          || requestedVariantKey.includes(variantNameKey);
      }) ?? (product.variants.length === 1 ? product.variants[0] : undefined);

      if (variant) {
        return { productId: product.id, variantId: variant.id, quantity, unitPrice: resolvedUnitPrice || variant.sellingPrice };
      }
    }
  }

  if (itemNameKey) {
    for (const product of preferredProducts) {
      const productNameKey = normalizeProductNameValue(product.name);
      const productMatches = productNameKey === itemNameKey
        || itemNameKey.startsWith(`${productNameKey} `)
        || productNameKey.includes(itemNameKey);
      if (!productMatches) continue;

      const inferredVariantKey = itemNameKey.startsWith(`${productNameKey} `)
        ? itemNameKey.slice(productNameKey.length).trim()
        : '';
      const requestedVariantKey = itemVariantKey || inferredVariantKey;
      const variant = product.variants.find((candidate) => {
        const variantNameKey = normalizeProductNameValue(getVariantDisplayName(candidate));
        return requestedVariantKey
          ? variantNameKey === requestedVariantKey
            || variantNameKey.includes(requestedVariantKey)
            || requestedVariantKey.includes(variantNameKey)
          : false;
      }) ?? (product.variants.length === 1 ? product.variants[0] : undefined);

      if (variant) {
        return { productId: product.id, variantId: variant.id, quantity, unitPrice: resolvedUnitPrice || variant.sellingPrice };
      }
    }
  }

  return buildPlaceholderPaymentItem({
    payment,
    item,
    index,
    quantity,
    unitPrice,
    explicitTotal,
    sourceLabel,
  });
};

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  value?: string | number | null;
}) {
  const colors = useThemeColors();
  const displayValue = typeof value === 'number' ? String(value) : value?.trim();
  return (
    <View className="flex-row items-start mb-2.5">
      <Icon size={14} color={colors.text.muted} strokeWidth={2} />
      <View className="ml-2.5 flex-1">
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium mb-0.5">
          {label}
        </Text>
        <Text style={{ color: colors.text.primary, fontWeight: '400' }} className="text-sm" numberOfLines={2}>
          {displayValue || 'Not provided'}
        </Text>
      </View>
    </View>
  );
}

function DetailCard({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  return (
    <View
      className={className}
      style={[
        {
          borderRadius: 18,
          padding: 16,
          backgroundColor: colors.bg.card,
          borderWidth: 1,
          borderColor: isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function StatusPill({ status, compact = false }: { status: StorefrontPaymentStatus; compact?: boolean }) {
  const palette = usePaymentsPalette();
  const tone: StatusTone = status === 'verified' || status === 'confirmed'
    ? 'verified'
    : status === 'proof_submitted'
      ? 'review'
      : status === 'pending'
        ? 'awaiting'
        : status === 'rejected'
          ? 'rejected'
          : 'closed';
  const toneStyle = palette.tones[tone];
  return (
    <View className="rounded-full flex-row items-center" style={{ backgroundColor: toneStyle.bg, paddingHorizontal: compact ? 9 : 11, paddingVertical: compact ? 5 : 6, gap: 5 }}>
      {status === 'proof_submitted' ? (
        <AlertTriangle size={compact ? 10 : 12} color={toneStyle.ink} strokeWidth={2.4} />
      ) : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneStyle.dot }} />}
      <Text style={{ color: toneStyle.ink, fontSize: compact ? 11.5 : 12.5, fontWeight: '600' }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function SourcePill({ source, compact = false }: { source?: string; compact?: boolean }) {
  const palette = usePaymentsPalette();
  const label = SourcePillLabel(source);

  return (
    <View className="rounded-full" style={{ backgroundColor: palette.softFill, paddingHorizontal: compact ? 9 : 11, paddingVertical: compact ? 5 : 6 }}>
      <Text style={{ color: palette.textSoft, fontSize: compact ? 11.5 : 12.5, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function SourcePillLabel(source?: string) {
  const normalized = source?.trim().toLowerCase();
  if (normalized === 'fyll_checkout') return 'Fyll Checkout';
  if (normalized === 'storefront') return 'Storefront';
  return source || 'Payment';
}

const formatStorefrontPaymentReference = (payment: SharedPaymentRecord | null, linkedOrderNumber?: string | null) => {
  if (!payment) return 'Payment';
  const source = payment.source.trim().toLowerCase();
  if (source === 'fyll_checkout') return payment.sourceOrderId;

  const orderSuffix = linkedOrderNumber?.trim().replace(/^ORD[-_]?/i, '');
  if (orderSuffix) return `SF-${orderSuffix}`;

  const rawReference = payment.sourceOrderId?.trim() || payment.id?.trim();
  if (!rawReference) return 'SF-PAYMENT';
  if (/^ORD[-_]?/i.test(rawReference)) return `SF-${rawReference.replace(/^ORD[-_]?/i, '')}`;
  if (/^SF[-_]?/i.test(rawReference)) return rawReference.toUpperCase();
  return `SF-${rawReference.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
};

const toPaymentText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const joinPaymentAddressParts = (...values: unknown[]) => (
  values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(', ')
);

const findStateInAddress = (value: string) => {
  const normalizedState = normalizeDeliveryStateValue(value);
  return normalizedState !== value.trim() ? normalizedState : '';
};

const looksLikeFullAddress = (value: string) => (
  value.includes(',') || /\d/.test(value) || value.trim().split(/\s+/).length > 3
);

const normalizePaymentState = (value: string) => {
  return normalizeDeliveryStateValue(value);
};

const resolvePaymentDeliveryDetails = (payment: SharedPaymentRecord) => {
  const nestedCustomerAddress = joinPaymentAddressParts(
    payment.customer?.address,
    payment.customer?.address1,
    payment.customer?.address2,
    payment.customer?.city
  );
  const nestedShippingAddress = joinPaymentAddressParts(
    payment.shipping?.address,
    payment.shipping?.address1,
    payment.shipping?.address2,
    payment.shipping?.city
  );

  let deliveryAddress = toPaymentText(
    payment.deliveryAddress,
    payment.delivery_address,
    payment.shippingAddress,
    payment.shipping_address,
    payment.address,
    nestedShippingAddress,
    nestedCustomerAddress
  );
  let deliveryState = toPaymentText(
    payment.deliveryState,
    payment.delivery_state,
    payment.shippingState,
    payment.shipping_state,
    payment.state,
    payment.shipping?.state,
    payment.customer?.state
  );

  if (deliveryState) {
    const normalizedState = normalizePaymentState(deliveryState);
    if (normalizedState !== deliveryState || looksLikeFullAddress(deliveryState)) {
      deliveryState = normalizedState;
    }
  }

  if (!deliveryState && deliveryAddress) {
    deliveryState = findStateInAddress(deliveryAddress);
  }

  return { deliveryAddress, deliveryState };
};

export default function StorefrontPaymentDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const paymentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const workflowButtonBg = palette.card;
  const workflowButtonBorder = palette.outline;
  const primaryButtonBg = FYLL_LIME;
  const primaryButtonText = FYLL_LIME_INK;
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? 'Staff');
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const products = useFyllStore((s) => s.products);
  const cachedOrders = useFyllStore((s) => s.orders);
  const [showProofLightbox, setShowProofLightbox] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editAmount, setEditAmount] = useState('');

  const detailQuery = useQuery({
    queryKey: ['storefront-payment-detail', businessId, paymentId],
    queryFn: async () => {
      const [paymentRows, orderRows, accountRows] = await Promise.all([
        supabaseData.fetchCollection<SharedPaymentRecord>('payments', businessId!),
        supabaseData.fetchCollection<Order>('orders', businessId!),
        supabaseData.fetchCollection<BankAccount>('payment_accounts', businessId!),
      ]);
      const payments = paymentRows.map((row) => row.data).filter(isSharedIntegrationPayment);
      const orders = orderRows.map((row) => row.data);
      const bankAccounts = accountRows.map((row) => row.data);
      queryClient.setQueryData(['shared-payments', businessId], payments);
      queryClient.setQueryData(['orders-for-payments', businessId], orders);
      queryClient.setQueryData(['payment-bank-accounts', businessId], bankAccounts);
      return buildPaymentDetailData(paymentId, payments, orders, bankAccounts) ?? null;
    },
    enabled: Boolean(businessId && paymentId),
    initialData: () => {
      if (!businessId || !paymentId) return undefined;
      const payments = queryClient.getQueryData<SharedPaymentRecord[]>(['shared-payments', businessId]) ?? [];
      const orders = queryClient.getQueryData<Order[]>(['orders-for-payments', businessId]) ?? cachedOrders;
      const bankAccounts = queryClient.getQueryData<BankAccount[]>(['payment-bank-accounts', businessId]) ?? [];
      return buildPaymentDetailData(paymentId, payments, orders, bankAccounts);
    },
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const payment = detailQuery.data?.payment ?? null;
  const linkedOrder = detailQuery.data?.linkedOrder ?? null;
  const availableOrders = detailQuery.data?.orders ?? [];
  const paymentStatus = payment ? getStorefrontPaymentStatus(payment) : 'pending';
  const isVerified = paymentStatus === 'verified' || paymentStatus === 'confirmed';
  const orderReference = linkedOrder?.orderNumber ?? payment?.sourceOrderId ?? paymentId ?? 'Payment';
  const paymentReference = formatStorefrontPaymentReference(payment, linkedOrder?.orderNumber ?? payment?.linkedOrderNumber);
  const proofUrl = getPaymentProofUrl(payment) || getPaymentProofUrl(linkedOrder as PaymentProofSource | null);
  const isBankTransferPayment = isManualBankTransferMethod(payment?.paymentMethod);
  const isCardPayment = isInstantCardMethod(payment?.paymentMethod);
  const isFyllCheckoutPayment = payment?.source?.trim().toLowerCase() === 'fyll_checkout';
  const expectedAmount = normalizeNumber(payment?.expectedAmount ?? payment?.orderTotal);
  const balanceDue = normalizeNumber(payment?.balanceDue ?? (expectedAmount > 0 && payment ? expectedAmount - payment.amount : 0));
  const hasPaymentBalance = Boolean(payment && expectedAmount > payment.amount && balanceDue > 0);
  const canVerify = Boolean(
    payment
    && !isVerified
    && paymentStatus !== 'rejected'
    && paymentStatus !== 'failed'
    && paymentStatus !== 'refunded'
    && (
      (isBankTransferPayment && (proofUrl || isFyllCheckoutPayment))
      || isCardPayment
    )
  );
  const canReject = Boolean(
    payment
    && !isVerified
    && paymentStatus !== 'rejected'
    && paymentStatus !== 'failed'
    && paymentStatus !== 'refunded'
    && (
      paymentStatus === 'proof_submitted'
      || Boolean(proofUrl)
      || (isBankTransferPayment && isFyllCheckoutPayment)
    )
  );
  const deliveryLocationText = formatDeliveryLocation(linkedOrder?.deliveryAddress, linkedOrder?.deliveryState);
  const fallbackBankAccountId = payment?.bankAccountId ?? '';
  const canEditPaymentAmount = Boolean(isAdmin && payment);
  const activityEntries = useMemo(() => {
    if (!payment) return [];
    const entries = [
      {
        id: `created-${payment.id}`,
        action: `Payment received from ${SourcePillLabel(payment.source)}`,
        actor: SourcePillLabel(payment.source),
        createdAt: payment.createdAt,
      },
      ...(payment.activityLog ?? []),
    ];
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [payment]);

  useEffect(() => {
    if (!payment || isEditingAmount) return;
    setEditAmount(String(payment.amount || ''));
  }, [isEditingAmount, payment]);
  const fallbackSettingsAccount = useMemo(() => {
    const accounts = detailQuery.data?.bankAccounts ?? [];
    return accounts.find((account) => account.id === fallbackBankAccountId)
      ?? accounts.find((account) => account.isDefault)
      ?? accounts[0]
      ?? null;
  }, [detailQuery.data?.bankAccounts, fallbackBankAccountId]);
  const rawBankAccount = payment?.bankAccount ?? null;
  const hasBankAccountSnapshot = Boolean(
    rawBankAccount?.bankName
    || rawBankAccount?.bank
    || rawBankAccount?.accountName
    || rawBankAccount?.accountNumber
  );
  const bankAccount = hasBankAccountSnapshot
    ? rawBankAccount
    : fallbackSettingsAccount
      ? {
        id: fallbackSettingsAccount.id,
        bankName: fallbackSettingsAccount.bankName,
        accountName: fallbackSettingsAccount.accountName,
        accountNumber: fallbackSettingsAccount.accountNumber,
      }
      : null;
  const hasPaymentDestination = isBankTransferPayment && Boolean(
    bankAccount?.bankName
    || bankAccount?.bank
    || bankAccount?.accountName
    || bankAccount?.accountNumber
  );
  const sectionGap = isDesktop ? 24 : 16;
  const isExplicitlyUnlinked = Boolean(payment?.unlinkedOrderId && !payment?.linkedOrderId);
  const candidateOrders = useMemo(() => {
    const query = orderSearchQuery.trim().toLowerCase();
    const rows = availableOrders.filter((order) => {
      if (linkedOrder?.id && order.id === linkedOrder.id) return false;
      if (!query) return true;
      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        order.websiteOrderReference,
        String(order.totalAmount ?? ''),
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);
  }, [availableOrders, linkedOrder?.id, orderSearchQuery]);

  const buildOrderFromPayment = (targetPayment: SharedPaymentRecord, status: string, timestamp: string): Order => {
    const sourceItems = targetPayment.items ?? [];
    const productSourceItems = sourceItems.filter((item, index) => !isPaymentDeliveryLineItem(item, index));
    const targetExpectedAmount = normalizeNumber(targetPayment.expectedAmount ?? targetPayment.orderTotal);
    const targetOrderTotal = targetExpectedAmount > 0 ? targetExpectedAmount : targetPayment.amount;
    const deliveryFee = Math.min(resolvePaymentDeliveryFee(targetPayment), targetOrderTotal);
    const itemSubtotal = productSourceItems.reduce((sum, item) => sum + getPaymentItemAmount(item), 0);
    const subtotal = itemSubtotal > 0 ? itemSubtotal : Math.max(0, targetOrderTotal - deliveryFee);
    const orderNumber = generateOrderNumber();
    const sourceLabel = SourcePillLabel(targetPayment.source);
    const { deliveryAddress, deliveryState } = resolvePaymentDeliveryDetails(targetPayment);
    const items = productSourceItems.length > 0
      ? productSourceItems.map((item, index) => resolvePaymentItemToInventory({
        item,
        index,
        payment: targetPayment,
        products,
        sourceLabel,
      }))
      : [{
        productId: `fyll-checkout-item-${targetPayment.sourceOrderId}-1`,
        variantId: `fyll-checkout-item-${targetPayment.sourceOrderId}-1`,
        quantity: 1,
        unitPrice: subtotal || targetPayment.amount,
        productName: `${sourceLabel} order`,
        variantName: formatPaymentMethod(targetPayment.paymentMethod),
      }];

    return {
      id: Math.random().toString(36).substring(2, 15),
      orderNumber,
      websiteOrderReference: resolvePaymentWooOrderReference(targetPayment),
      customerName: targetPayment.customerName || 'Fyll Checkout customer',
      customerEmail: targetPayment.customerEmail ?? '',
      customerPhone: targetPayment.customerPhone ?? '',
      deliveryState,
      deliveryAddress,
      items,
      services: [],
      additionalCharges: 0,
      additionalChargesNote: '',
      deliveryFee,
      paymentMethod: targetPayment.paymentMethod,
      status,
      orderStatus: status,
      source: sourceLabel,
      subtotal,
      totalAmount: targetOrderTotal,
      orderDate: targetPayment.createdAt,
      createdAt: targetPayment.createdAt,
      updatedAt: timestamp,
      updatedBy: currentUserName,
      activityLog: [{
        staffName: currentUserName,
        action: `Created linked order from ${sourceLabel} payment ${targetPayment.sourceOrderId}`,
        date: timestamp,
      }],
      fyllCheckout: {
        reference: targetPayment.sourceOrderId,
        amountPaid: targetPayment.amount,
        expectedAmount: targetOrderTotal,
        balanceDue: Math.max(0, targetOrderTotal - targetPayment.amount),
      },
    } as Order;
  };

  const getOrderItemLabel = (item: Order['items'][number]) => {
    const enrichedItem = item as Order['items'][number] & {
      productName?: string;
      name?: string;
      title?: string;
      variantName?: string;
    };
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues).join(' / ') : '';
    const title = product?.name ?? enrichedItem.productName ?? enrichedItem.name ?? enrichedItem.title ?? 'Order item';
    return {
      title: combineProductVariantName(title, variantName || enrichedItem.variantName),
      imageUrl: variant?.imageUrl?.trim() || product?.imageUrl?.trim() || '',
    };
  };

  const displayItems = useMemo<DisplayItem[]>(() => {
    const paymentItems = (payment?.items ?? []).filter((item, index) => !isPaymentDeliveryLineItem(item, index));
    if (payment && paymentItems.length > 0) {
      return paymentItems.map((item, index) => {
        const resolvedItem = resolvePaymentItemToInventory({
          item,
          index,
          payment,
          products,
          sourceLabel: SourcePillLabel(payment.source),
        });
        const labels = getOrderItemLabel(resolvedItem);
        const explicitTotal = normalizeNumber(item.lineTotal ?? item.line_total ?? item.total);
        return {
          id: `payment-item-${index}`,
          quantity: resolvedItem.quantity,
          title: labels.title,
          imageUrl: labels.imageUrl || getPaymentItemImage(item),
          total: explicitTotal > 0 ? explicitTotal : resolvedItem.unitPrice * resolvedItem.quantity,
        };
      });
    }

    return (linkedOrder?.items ?? []).map((item, index) => {
      const labels = getOrderItemLabel(item);
      return {
        id: `${item.productId}-${item.variantId}-${index}`,
        quantity: item.quantity,
        title: labels.title,
        imageUrl: labels.imageUrl,
        total: item.unitPrice * item.quantity,
      };
    });
  }, [linkedOrder?.items, payment?.items, products]);

  const billDeliveryFee = payment
    ? resolvePaymentDeliveryFee(payment) || normalizeNumber(linkedOrder?.deliveryFee)
    : normalizeNumber(linkedOrder?.deliveryFee);
  const billTotal = payment
    ? normalizeNumber(payment.expectedAmount ?? payment.orderTotal) || payment.amount
    : normalizeNumber(linkedOrder?.totalAmount);

  const paymentSummary = useMemo(() => {
    if (!payment) return '';
    return [
      `Payment: ${paymentReference}`,
      `Amount: ${formatCurrency(payment.amount)}`,
      `Status: ${STATUS_LABEL[paymentStatus]}`,
      `Method: ${formatPaymentMethod(payment.paymentMethod)}`,
      `Customer: ${payment.customerName || linkedOrder?.customerName || 'Not provided'}`,
      `Phone: ${payment.customerPhone || linkedOrder?.customerPhone || 'Not provided'}`,
      `Email: ${payment.customerEmail || linkedOrder?.customerEmail || 'Not provided'}`,
      `Linked order: ${linkedOrder?.orderNumber ?? payment.sourceOrderId}`,
    ].join('\n');
  }, [linkedOrder, payment, paymentReference, paymentStatus]);

  const renderActivityCard = (extraStyle?: StyleProp<ViewStyle>) => (
    <DetailCard style={extraStyle}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: isDesktop ? 12 : 8 }}>
        <SectionLabel palette={palette}>Payment activity</SectionLabel>
        <Text style={{ color: colors.text.muted }} className="text-xs">{activityEntries.length}</Text>
      </View>
      {activityEntries.map((entry, index) => (
        <View
          key={entry.id}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingTop: index === 0 ? (isDesktop ? 6 : 8) : (isDesktop ? 8 : 10),
            paddingBottom: isDesktop ? 8 : 10,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: separatorColor,
          }}
        >
          <User size={14} color={colors.text.muted} strokeWidth={2} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, marginLeft: isDesktop ? 8 : 10 }}>
            <Text style={{ color: colors.text.primary, lineHeight: 16 }} className="text-xs font-semibold">{entry.actor}</Text>
            <Text style={{ color: colors.text.muted, lineHeight: 16 }} className="text-xs">{entry.action}</Text>
            <Text style={{ color: colors.text.tertiary, lineHeight: 16 }} className="text-xs mt-0.5">{formatActivityTimestamp(entry.createdAt)}</Text>
          </View>
        </View>
      ))}
    </DetailCard>
  );

  const renderPaymentSummaryCard = () => (
    <DetailCard>
      <View style={{ gap: 12 }}>
        <View>
          <SectionLabel palette={palette}>Payment summary</SectionLabel>
          <Text style={{ color: colors.text.muted }} className="text-sm">Copy the payment details for support or reconciliation.</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={handleCopySummary}
            className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
            style={{ borderWidth: 1, borderColor: separatorColor, height: 44, gap: 8 }}
          >
            <Copy size={15} color={colors.text.primary} strokeWidth={2.3} />
            <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
              {summaryCopied ? 'Copied' : 'Copy summary'}
            </Text>
          </Pressable>
          {linkedOrder ? (
            <Pressable
              onPress={handleViewLinkedOrder}
              className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
              style={{ backgroundColor: primaryButtonBg, height: 44, gap: 8 }}
            >
              <ExternalLink size={15} color={primaryButtonText} strokeWidth={2.3} />
              <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">View linked order</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </DetailCard>
  );

  const updatePaymentAmountMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !businessId) return null;
      const parsedAmount = parseFloat(editAmount.replace(/,/g, '')) || 0;
      if (parsedAmount < 0) {
        throw new Error('invalid_amount');
      }
      const timestamp = new Date().toISOString();
      const previousAmount = payment.amount;
      const expected = normalizeNumber(payment.expectedAmount ?? payment.orderTotal);
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        amount: parsedAmount,
        amountPaid: parsedAmount,
        balanceDue: expected > 0 ? Math.max(0, expected - parsedAmount) : payment.balanceDue,
        updatedAt: timestamp,
        activityLog: [
          ...(payment.activityLog ?? []),
          {
            id: `payment-amount-${timestamp}`,
            action: `Updated amount from ${formatCurrency(previousAmount)} to ${formatCurrency(parsedAmount)}`,
            actor: currentUserName,
            createdAt: timestamp,
          },
        ],
      };
      await supabaseData.upsertCollection('payments', businessId, [updatedPayment]);
      return updatedPayment;
    },
    onSuccess: () => {
      setIsEditingAmount(false);
      queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] });
      queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Could not update amount', 'Enter a valid amount and try again.');
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !businessId) return null;
      const nextStatus = getVerifiedOrderStatus(orderStatuses);
      const timestamp = new Date().toISOString();
      let updatedPayment: SharedPaymentRecord = {
        ...payment,
        status: 'verified',
        updatedAt: timestamp,
        activityLog: [
          ...(payment.activityLog ?? []),
          {
            id: `payment-approved-${timestamp}`,
            action: 'Approved storefront payment',
            actor: currentUserName,
            createdAt: timestamp,
          },
        ],
      };
      const syncTasks: Promise<unknown>[] = [
        supabaseData.upsertCollection('payments', businessId, [updatedPayment]),
      ];

      if (linkedOrder) {
        const activityEntry: OrderActivityEntry = {
          staffName: currentUserName,
          action: `Verified storefront payment — status set to ${nextStatus}`,
          date: timestamp,
        };
        const updatedOrder: Order = {
          ...linkedOrder,
          status: nextStatus,
          updatedAt: timestamp,
          updatedBy: currentUserName,
          activityLog: [...(linkedOrder.activityLog ?? []), activityEntry],
        };
        syncTasks.push(supabaseData.upsertCollection('orders', businessId, [updatedOrder]));
      } else if (payment.sourceOrderId) {
        const order = buildOrderFromPayment(payment, nextStatus, timestamp);
        updatedPayment = {
          ...updatedPayment,
          linkedOrderId: order.id,
          linkedOrderNumber: order.orderNumber,
          linkedOrderLinkedAt: timestamp,
        };
        syncTasks[0] = supabaseData.upsertCollection('payments', businessId, [updatedPayment]);
        syncTasks.push(supabaseData.upsertCollection('orders', businessId, [order]));
      }

      await Promise.all(syncTasks);
      if (payment.source.trim().toLowerCase() === 'fyll_checkout') {
        try {
          await notifyFyllCheckoutPaymentConfirmed({
            reference: payment.sourceOrderId,
            businessId,
          });
        } catch (error) {
          console.warn('Fyll Checkout confirmation callback failed after local approval:', error);
          showFyllCheckoutSyncFailedNotice(payment.sourceOrderId, error);
        }
      }
      return updatedPayment;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] }),
        queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
      ]);
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !businessId) return null;
      const timestamp = new Date().toISOString();
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        status: 'rejected',
        updatedAt: timestamp,
        activityLog: [
          ...(payment.activityLog ?? []),
          {
            id: `payment-rejected-${timestamp}`,
            action: 'Rejected storefront payment proof',
            actor: currentUserName,
            createdAt: timestamp,
          },
        ],
      };
      const syncTasks: Promise<unknown>[] = [
        supabaseData.upsertCollection('payments', businessId, [updatedPayment]),
      ];

      if (linkedOrder) {
        const activityEntry: OrderActivityEntry = {
          staffName: currentUserName,
          action: `Rejected storefront payment proof for ${paymentReference}`,
          date: timestamp,
        };
        syncTasks.push(supabaseData.upsertCollection('orders', businessId, [{
          ...linkedOrder,
          updatedAt: timestamp,
          updatedBy: currentUserName,
          activityLog: [...(linkedOrder.activityLog ?? []), activityEntry],
        }]));
      }

      await Promise.all(syncTasks);
      return updatedPayment;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] }),
        queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
      ]);
    },
  });

  const createLinkedOrderMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !businessId) return null;
      const timestamp = new Date().toISOString();
      const nextStatus = isVerified ? getVerifiedOrderStatus(orderStatuses) : 'Pending payment';
      const order = buildOrderFromPayment(payment, nextStatus, timestamp);
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        linkedOrderId: order.id,
        linkedOrderNumber: order.orderNumber,
        linkedOrderLinkedAt: timestamp,
        unlinkedOrderId: null,
        unlinkedOrderAt: null,
        updatedAt: timestamp,
      };
      await Promise.all([
        supabaseData.upsertCollection('orders', businessId, [order]),
        supabaseData.upsertCollection('payments', businessId, [updatedPayment]),
      ]);
      return order;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
      ]);
    },
  });

  const linkExistingOrderMutation = useMutation({
    mutationFn: async (order: Order) => {
      if (!payment || !businessId) return null;
      const timestamp = new Date().toISOString();
      const activityEntry: OrderActivityEntry = {
        staffName: currentUserName,
        action: `Linked payment ${payment.sourceOrderId} to this order`,
        date: timestamp,
      };
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        linkedOrderId: order.id,
        linkedOrderNumber: order.orderNumber,
        linkedOrderLinkedAt: timestamp,
        unlinkedOrderId: null,
        unlinkedOrderAt: null,
        updatedAt: timestamp,
      };
      const updatedOrder: Order = {
        ...order,
        updatedAt: timestamp,
        updatedBy: currentUserName,
        activityLog: [...(order.activityLog ?? []), activityEntry],
      };

      await Promise.all([
        supabaseData.upsertCollection('payments', businessId, [updatedPayment]),
        supabaseData.upsertCollection('orders', businessId, [updatedOrder]),
      ]);
      return updatedPayment;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLinkOrderModal(false);
      setOrderSearchQuery('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] }),
        queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
      ]);
    },
  });

  const unlinkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!payment || !linkedOrder || !businessId) return null;
      const timestamp = new Date().toISOString();
      const activityEntry: OrderActivityEntry = {
        staffName: currentUserName,
        action: `Unlinked payment ${payment.sourceOrderId} from this order`,
        date: timestamp,
      };
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        linkedOrderId: null,
        linkedOrderNumber: null,
        linkedOrderLinkedAt: null,
        unlinkedOrderId: linkedOrder.id,
        unlinkedOrderAt: timestamp,
        updatedAt: timestamp,
      };
      const updatedOrder: Order = {
        ...linkedOrder,
        updatedAt: timestamp,
        updatedBy: currentUserName,
        activityLog: [...(linkedOrder.activityLog ?? []), activityEntry],
      };

      await Promise.all([
        supabaseData.upsertCollection('payments', businessId, [updatedPayment]),
        supabaseData.upsertCollection('orders', businessId, [updatedOrder]),
      ]);
      return updatedPayment;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storefront-payment-detail', businessId, paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] }),
        queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
      ]);
    },
  });

  const handleCopySummary = async () => {
    if (!paymentSummary) return;
    await Clipboard.setStringAsync(paymentSummary);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSummaryCopied(true);
    setTimeout(() => setSummaryCopied(false), 1800);
  };

  const handleViewLinkedOrder = () => {
    if (!linkedOrder?.id) return;
    router.push((Platform.OS === 'web' && isDesktop ? `/orders/${linkedOrder.id}` : `/order/${linkedOrder.id}`) as never);
  };

  const handleCreateLinkedOrder = () => {
    if (!payment || createLinkedOrderMutation.isPending) return;
    createLinkedOrderMutation.mutate();
  };

  const handleOpenLinkOrder = () => {
    setOrderSearchQuery('');
    setShowLinkOrderModal(true);
  };

  const handleUnlinkOrder = () => {
    if (!linkedOrder || unlinkOrderMutation.isPending) return;
    const unlink = () => unlinkOrderMutation.mutate();
    const message = `This payment will become unlinked from ${linkedOrder.orderNumber}. You can link it to the correct manual order afterwards.`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) unlink();
      return;
    }

    Alert.alert('Unlink order?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: unlink },
    ]);
  };

  const unifiedDetail = payment ? (() => {
    const tone: StatusTone = paymentStatus === 'verified' || paymentStatus === 'confirmed'
      ? 'verified'
      : paymentStatus === 'proof_submitted'
        ? 'review'
        : paymentStatus === 'pending'
          ? 'awaiting'
          : paymentStatus === 'rejected'
            ? 'rejected'
            : 'closed';
    const toneStyle = palette.tones[tone];
    const StatusIcon = tone === 'verified' ? Check : tone === 'review' ? AlertTriangle : tone === 'rejected' ? X : tone === 'awaiting' ? Clock : X;
    const cardStyle = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
    const outlineButton = (state: PressableStateCallbackType, height = 44) => ({
      height,
      borderRadius: 999,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.3)' : '#BDBDBD') : palette.outline,
      backgroundColor: state.pressed ? palette.softFill : isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.04)' : '#FAFAFA') : 'transparent',
    });
    const limeButton = (state: PressableStateCallbackType, height = 46) => ({
      height,
      borderRadius: 999,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
      paddingHorizontal: 16,
      backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
      opacity: state.pressed ? 0.85 : 1,
    });
    const customerName = payment.customerName || linkedOrder?.customerName || '';
    const customerPhone = payment.customerPhone || linkedOrder?.customerPhone || '';
    const customerEmail = payment.customerEmail || linkedOrder?.customerEmail || '';
    const isInactive = paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'refunded';

    const heroSection = (
      <View style={{ gap: 10, paddingBottom: 6 }}>
        <MoneyText style={{ color: palette.text, fontSize: 42, lineHeight: 48, letterSpacing: -1.4 }} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(payment.amount)}
        </MoneyText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: toneStyle.bg }}>
            <StatusIcon size={12} color={toneStyle.ink} strokeWidth={2.8} />
            <Text style={{ color: toneStyle.ink, fontSize: 12.5, fontWeight: '600' }}>{STATUS_LABEL[paymentStatus]}</Text>
          </View>
          <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.softFill }}>
            <CreditCard size={12} color={palette.textSoft} strokeWidth={2.2} />
            <Text style={{ color: palette.textSoft, fontSize: 12.5, fontWeight: '600' }}>{SourcePillLabel(payment.source)}</Text>
          </View>
          <Text style={{ color: palette.faint, fontSize: 12.5 }}>{formatActivityTimestamp(payment.createdAt)}</Text>
        </View>
      </View>
    );

    const reviewSection = canVerify || canReject ? (
      <View style={{ ...cardStyle, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={17} color={palette.text} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>Receipt uploaded · needs review</Text>
            <Text style={{ color: palette.muted, fontSize: 13 }}>Check the transfer landed, then approve or reject.</Text>
          </View>
        </View>
        {proofUrl ? (
          <Pressable onPress={() => setShowProofLightbox(true)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline, opacity: state.pressed ? 0.8 : 1 })}>
            <Image source={{ uri: proofUrl }} style={{ width: 56, height: 56, borderRadius: 10 }} resizeMode="cover" />
            <View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Payment receipt</Text><Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 2 }}>Tap to view full size</Text></View>
            <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canVerify ? (
            <Pressable onPress={() => verifyPaymentMutation.mutate()} disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending} style={(state) => ({ ...limeButton(state), flex: 1.3 })}>
              {verifyPaymentMutation.isPending ? <ActivityIndicator color={FYLL_LIME_INK} size="small" /> : <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />}
              <Text style={{ color: FYLL_LIME_INK, fontSize: 14.5, fontWeight: '600' }}>{isCardPayment ? 'Mark card paid' : 'Approve'}</Text>
            </Pressable>
          ) : null}
          {canReject ? (
            <Pressable onPress={() => {
              const reject = () => rejectPaymentMutation.mutate();
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                if (window.confirm('Reject payment proof?\n\nThis marks the payment proof as rejected in Fyll.')) reject();
              } else {
                Alert.alert('Reject payment proof?', 'This marks the payment proof as rejected in Fyll.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: reject }]);
              }
            }} disabled={rejectPaymentMutation.isPending || verifyPaymentMutation.isPending} style={(state) => ({ ...outlineButton(state, 46), flex: 1, borderColor: palette.dangerBorder })}>
              {rejectPaymentMutation.isPending ? <ActivityIndicator color={palette.danger} size="small" /> : <X size={15} color={palette.danger} strokeWidth={2.4} />}
              <Text style={{ color: palette.danger, fontSize: 14.5, fontWeight: '600' }}>Reject</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    ) : null;

    const orderSection = linkedOrder ? (
      <View style={{ ...cardStyle, overflow: 'hidden' }}>
        <Pressable onPress={handleViewLinkedOrder} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.inverseBg, alignItems: 'center', justifyContent: 'center' }}><Check size={17} color={palette.inverseText} strokeWidth={2.8} /></View>
          <View style={{ flex: 1, gap: 2 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>Order {linkedOrder.orderNumber} linked</Text><Text style={{ color: palette.muted, fontSize: 13 }}>Fulfil this order — don&apos;t create another one.</Text></View>
          <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Pressable onPress={handleOpenLinkOrder} style={(state) => ({ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}><Text style={{ color: palette.textSoft, fontSize: 13.5, fontWeight: '600' }}>Replace order</Text></Pressable>
          <View style={{ width: 1, backgroundColor: palette.hairline }} />
          <Pressable onPress={handleUnlinkOrder} style={(state) => ({ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}><Text style={{ color: palette.textSoft, fontSize: 13.5, fontWeight: '600' }}>Unlink</Text></Pressable>
        </View>
      </View>
    ) : isInactive ? (
      <View style={{ ...cardStyle, borderColor: palette.dangerBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.dangerBg, alignItems: 'center', justifyContent: 'center' }}><X size={17} color={palette.danger} strokeWidth={2.4} /></View>
        <View style={{ flex: 1, gap: 2 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>Payment {paymentStatus === 'rejected' ? 'rejected' : 'inactive'}</Text><Text style={{ color: palette.muted, fontSize: 13 }}>Order creation is unavailable for this payment.</Text></View>
      </View>
    ) : (
      <View style={{ ...cardStyle, borderColor: isVerified ? palette.warnBorder : palette.border, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isVerified ? palette.warnBg : palette.softFill, alignItems: 'center', justifyContent: 'center' }}><Package size={17} color={isVerified ? palette.warn : palette.muted} strokeWidth={2.2} /></View>
          <View style={{ flex: 1, gap: 2 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>No order linked yet</Text><Text style={{ color: palette.muted, fontSize: 13 }}>{isVerified ? 'Paid and verified. Create the order to start fulfilment.' : 'Link an existing order, or create one from this payment.'}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isVerified ? <Pressable onPress={handleCreateLinkedOrder} style={(state) => ({ ...limeButton(state), flex: 1.3 })}><Text style={{ color: FYLL_LIME_INK, fontSize: 14.5, fontWeight: '600' }}>Create order</Text></Pressable> : null}
          <Pressable onPress={handleOpenLinkOrder} style={(state) => ({ ...outlineButton(state, 46), flex: 1 })}><Text style={{ color: palette.text, fontSize: 14.5, fontWeight: '600' }}>Link existing</Text></Pressable>
        </View>
      </View>
    );

    const customerSection = (
      <View style={{ ...cardStyle, paddingHorizontal: 16, paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <InitialsAvatar name={customerName} palette={palette} />
          <View style={{ flex: 1, gap: 2 }}><Text style={{ color: palette.faint, fontSize: 12 }}>Customer</Text><Text style={{ color: customerName ? palette.text : palette.faint, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{customerName || 'Not provided'}</Text></View>
          {customerPhone ? <Pressable onPress={() => { void Linking.openURL(`tel:${customerPhone}`); }} hitSlop={8}><Text style={{ color: palette.limeOnSurface, fontSize: 13.5, fontWeight: '600' }}>Call</Text></Pressable> : null}
        </View>
        {[
          customerPhone ? { key: 'phone', icon: Phone, value: customerPhone } : null,
          customerEmail ? { key: 'email', icon: Mail, value: customerEmail } : null,
          deliveryLocationText ? { key: 'address', icon: MapPin, value: deliveryLocationText } : null,
        ].filter((row): row is { key: string; icon: typeof Phone; value: string } => Boolean(row)).map((row) => {
          const Icon = row.icon;
          return <View key={row.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}><Icon size={15} color={palette.faint} strokeWidth={2} style={{ marginTop: 2 }} /><Text style={{ flex: 1, color: palette.textSoft, fontSize: 14, lineHeight: 20 }} selectable>{row.value}</Text></View>;
        })}
      </View>
    );

    const billSection = (
      <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
        <SectionLabel palette={palette}>Bill</SectionLabel>
        {displayItems.length > 0 ? displayItems.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <Package size={18} color={palette.faint} strokeWidth={1.7} />}
            </View>
            <View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 15 }}>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.title}</Text></View>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(item.total)}</Text>
          </View>
        )) : <Text style={{ color: palette.faint, fontSize: 15, lineHeight: 22 }}>No item details added.</Text>}
        {billDeliveryFee > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: palette.textSoft, fontSize: 15 }}>Delivery</Text>
            <Text style={{ color: palette.textSoft, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{formatCurrency(billDeliveryFee)}</Text>
          </View>
        ) : null}
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>Total</Text><Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(billTotal)}</Text></View>
      </View>
    );

    const referenceSection = (
      <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
        <SectionLabel palette={palette}>{payment.paymentLinkUrl ? 'Payment link' : 'Payment reference'}</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 12, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
          <Text style={{ flex: 1, color: palette.textSoft, fontSize: 13.5 }} numberOfLines={1} selectable>{payment.paymentLinkUrl?.replace(/^https?:\/\//, '') || paymentReference}</Text>
          <Pressable onPress={() => { void Clipboard.setStringAsync(payment.paymentLinkUrl || paymentReference); setSummaryCopied(true); setTimeout(() => setSummaryCopied(false), 1800); }} style={(state) => ({ height: 32, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isHovered(state) ? palette.cardHover : palette.softFill })}>{summaryCopied ? <Check size={13} color={palette.text} strokeWidth={2.6} /> : <Copy size={13} color={palette.text} strokeWidth={2.2} />}<Text style={{ color: palette.text, fontSize: 12.5, fontWeight: '600' }}>{summaryCopied ? 'Copied' : 'Copy'}</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={handleCopySummary} style={(state) => ({ ...outlineButton(state), flex: 1 })}><Copy size={15} color={palette.text} strokeWidth={2} /><Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Copy summary</Text></Pressable>
          {canEditPaymentAmount ? <Pressable onPress={() => { setEditAmount(String(payment.amount || '')); setIsEditingAmount((current) => !current); }} style={(state) => ({ ...outlineButton(state), flex: 1 })}>{isEditingAmount ? <X size={15} color={palette.text} strokeWidth={2.2} /> : <Pencil size={15} color={palette.text} strokeWidth={2} />}<Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{isEditingAmount ? 'Cancel edit' : 'Edit payment'}</Text></Pressable> : null}
        </View>
        <Text style={{ color: palette.faint, fontSize: 12.5 }}>Use this reference for support and reconciliation.</Text>
      </View>
    );

    const messageSection = (
      <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
        <SectionLabel palette={palette}>Message preview</SectionLabel>
        <Text style={{ color: palette.textSoft, fontSize: 14, lineHeight: 21.5 }} selectable>{paymentSummary}</Text>
      </View>
    );

    const editSection = isEditingAmount ? (
      <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
        <SectionLabel palette={palette}>Edit payment amount</SectionLabel>
        <TextInput value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.faint} style={[{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, color: palette.text, fontSize: 18, fontWeight: '600' }, noWebOutline]} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => setIsEditingAmount(false)} style={(state) => ({ ...outlineButton(state), flex: 1 })}><Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text></Pressable><Pressable onPress={() => updatePaymentAmountMutation.mutate()} style={(state) => ({ ...limeButton(state, 44), flex: 1.3 })}>{updatePaymentAmountMutation.isPending ? <ActivityIndicator color={FYLL_LIME_INK} size="small" /> : <Save size={15} color={FYLL_LIME_INK} strokeWidth={2.2} />}<Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Save changes</Text></Pressable></View>
      </View>
    ) : null;

    const proofSection = proofUrl && !(canVerify || canReject) ? (
      <Pressable onPress={() => setShowProofLightbox(true)} style={(state) => ({ ...cardStyle, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: isHovered(state) ? palette.cardHover : palette.card })}>
        <Image source={{ uri: proofUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
        <View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 14.5, fontWeight: '600' }}>Payment receipt</Text><Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 2 }}>Tap to view full size</Text></View>
        <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
      </Pressable>
    ) : null;

    const bankSection = (
      <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Landmark size={14} color={palette.faint} strokeWidth={2} /><SectionLabel palette={palette}>Paid into</SectionLabel></View>
        {isCardPayment ? <View style={{ gap: 2 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>Card / Paystack</Text><Text style={{ color: palette.muted, fontSize: 13.5 }}>Online card payment</Text></View> : bankAccount ? <View style={{ gap: 2 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>{bankAccount.bankName || bankAccount.bank || 'Bank transfer'}</Text><Text style={{ color: palette.muted, fontSize: 13.5 }} selectable>{[bankAccount.accountName, bankAccount.accountNumber].filter(Boolean).join(' · ')}</Text></View> : <Text style={{ color: palette.muted, fontSize: 13.5 }}>Payment destination not recorded.</Text>}
      </View>
    );

    const activitySection = (
      <View style={{ ...cardStyle, padding: 16 }}>
        <View style={{ paddingBottom: 12 }}><SectionLabel palette={palette}>Activity</SectionLabel></View>
        {activityEntries.map((entry, index) => {
          const isLatest = index === activityEntries.length - 1;
          return <View key={entry.id} style={{ flexDirection: 'row', gap: 12 }}><View style={{ width: 12, alignItems: 'center' }}><View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 5, backgroundColor: isLatest ? palette.text : palette.isDark ? '#5D5E56' : '#CFCFCF' }} />{!isLatest ? <View style={{ width: 1.5, flex: 1, marginVertical: 4, backgroundColor: palette.hairline }} /> : null}</View><View style={{ flex: 1, gap: 2, paddingBottom: isLatest ? 0 : 14 }}><Text style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>{entry.action}</Text><Text style={{ color: palette.faint, fontSize: 12.5 }}>{entry.actor} · {formatActivityTimestamp(entry.createdAt)}</Text></View></View>;
        })}
      </View>
    );

    return { heroSection, reviewSection, orderSection, customerSection, billSection, referenceSection, editSection, messageSection, proofSection, bankSection, activitySection };
  })() : null;

  const moreActions = payment ? [
    canEditPaymentAmount && !isEditingAmount ? { key: 'edit', label: 'Edit amount', icon: Pencil, onPress: () => { setEditAmount(String(payment.amount || '')); setIsEditingAmount(true); } } : null,
    { key: 'copy', label: 'Copy summary', icon: Copy, onPress: () => { void handleCopySummary(); } },
    linkedOrder ? { key: 'order', label: 'Open linked order', icon: ExternalLink, onPress: handleViewLinkedOrder } : null,
  ].filter((action): action is { key: string; label: string; icon: typeof Copy; onPress: () => void } => Boolean(action)) : [];

  const contentGap = 14;

  if (payment && unifiedDetail) {
    const unifiedContent = (
      <SafeAreaView className="flex-1" style={{ backgroundColor: palette.page }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: isDesktop ? 20 : 8, paddingTop: isDesktop ? 18 : 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to payments"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/payments' as never))}
            style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <ChevronLeft size={21} color={palette.text} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>Payment</Text>
            <Text style={{ color: palette.faint, fontSize: 12.5, letterSpacing: 0.3 }} numberOfLines={1} selectable>{paymentReference}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            onPress={() => setShowMoreActions(true)}
            style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <MoreHorizontal size={21} color={palette.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: isDesktop ? 28 : 20, paddingTop: isDesktop ? 26 : 22, paddingBottom: 40, maxWidth: isDesktop ? 1456 : undefined, width: isDesktop ? '100%' : undefined }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
              <View style={{ flex: 1.45, minWidth: 0, gap: contentGap }}>
                {unifiedDetail.heroSection}
                {unifiedDetail.reviewSection}
                {unifiedDetail.orderSection}
                {unifiedDetail.billSection}
                {unifiedDetail.referenceSection}
                {unifiedDetail.editSection}
                {unifiedDetail.messageSection}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: contentGap, paddingTop: 4 }}>
                {unifiedDetail.customerSection}
                {unifiedDetail.proofSection}
                {unifiedDetail.bankSection}
                {unifiedDetail.activitySection}
              </View>
            </View>
          ) : (
            <View style={{ gap: contentGap }}>
              {unifiedDetail.heroSection}
              {unifiedDetail.reviewSection}
              {unifiedDetail.orderSection}
              {unifiedDetail.customerSection}
              {unifiedDetail.proofSection}
              {unifiedDetail.billSection}
              {unifiedDetail.referenceSection}
              {unifiedDetail.editSection}
              {unifiedDetail.messageSection}
              {unifiedDetail.bankSection}
              {unifiedDetail.activitySection}
            </View>
          )}
        </ScrollView>

        <Modal visible={showMoreActions} transparent animationType="fade" onRequestClose={() => setShowMoreActions(false)}>
          <Pressable onPress={() => setShowMoreActions(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center' }}>
            <Pressable onPress={(event) => event.stopPropagation?.()} style={{ width: isDesktop ? 380 : '100%', backgroundColor: palette.card, borderRadius: 24, borderBottomLeftRadius: isDesktop ? 24 : 0, borderBottomRightRadius: isDesktop ? 24 : 0, borderWidth: 1, borderColor: palette.border, paddingTop: 10, paddingHorizontal: 12, paddingBottom: isDesktop ? 12 : Math.max(insets.bottom, 12) + 8 }}>
              {!isDesktop ? <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.outline, marginBottom: 10 }} /> : null}
              {moreActions.map((action) => {
                const Icon = action.icon;
                return <Pressable key={action.key} onPress={() => { setShowMoreActions(false); action.onPress(); }} style={(state) => ({ height: 52, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}><Icon size={18} color={palette.muted} strokeWidth={2.1} /><Text style={{ color: palette.text, fontSize: 15, fontWeight: '500' }}>{action.label}</Text></Pressable>;
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showLinkOrderModal} transparent animationType="fade" onRequestClose={() => setShowLinkOrderModal(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <View style={{ width: isDesktop ? 560 : '100%', maxHeight: isDesktop ? 680 : '82%', alignSelf: 'center', backgroundColor: palette.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: isDesktop ? 24 : 0, borderBottomRightRadius: isDesktop ? 24 : 0, borderWidth: 1, borderColor: palette.border, padding: 20, paddingBottom: isDesktop ? 20 : Math.max(insets.bottom, 12) + 12 }}>
              {!isDesktop ? <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.outline, marginBottom: 14 }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}><View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>{linkedOrder ? 'Replace linked order' : 'Link existing order'}</Text><Text style={{ color: palette.muted, fontSize: 13, marginTop: 3 }}>Choose the order that should receive this payment.</Text></View><Pressable onPress={() => setShowLinkOrderModal(false)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={palette.text} strokeWidth={2.2} /></Pressable></View>
              <View style={{ height: 46, borderRadius: 23, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.outline, justifyContent: 'center', paddingHorizontal: 16, marginBottom: 14 }}><TextInput value={orderSearchQuery} onChangeText={setOrderSearchQuery} placeholder="Search order, customer, phone" placeholderTextColor={palette.faint} style={[{ color: palette.text, fontSize: 14 }, noWebOutline]} /><SearchClearButton visible={Boolean(orderSearchQuery.trim())} onPress={() => setOrderSearchQuery('')} /></View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {candidateOrders.map((order) => <Pressable key={order.id} onPress={() => linkExistingOrderMutation.mutate(order)} style={(state) => ({ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: state.pressed || isHovered(state) ? palette.cardHover : palette.card, marginBottom: 8 })}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{order.orderNumber}</Text><Text style={{ color: palette.muted, fontSize: 13, marginTop: 2 }}>{order.customerName || 'No customer'}</Text></View><Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{formatCurrency(order.totalAmount)}</Text></View></Pressable>)}
                {candidateOrders.length === 0 ? <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center', paddingVertical: 28 }}>No matching orders found.</Text> : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showProofLightbox} transparent animationType="fade" onRequestClose={() => setShowProofLightbox(false)}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.82)', padding: 24 }}><Pressable onPress={() => setShowProofLightbox(false)} style={{ position: 'absolute', top: 24, right: 24, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}><X size={18} color="#FFFFFF" strokeWidth={2.2} /></Pressable>{proofUrl ? <Image source={{ uri: proofUrl }} style={{ width: '100%', height: isDesktop ? 620 : 460, borderRadius: 18 }} resizeMode="contain" /> : null}</View>
        </Modal>
      </SafeAreaView>
    );

    if (Platform.OS === 'web' && isDesktop) {
      return <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}><DesktopSidebar /><View className="flex-1">{unifiedContent}</View></View>;
    }
    return unifiedContent;
  }

  const content = (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }} edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: isDesktop ? 28 : 20,
          paddingTop: isDesktop ? 32 : 20,
          paddingBottom: 40,
          maxWidth: isDesktop ? 1456 : undefined,
          width: isDesktop ? '100%' : undefined,
          alignSelf: isDesktop ? 'flex-start' : undefined,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-2.5 mb-5">
          <Pressable onPress={() => router.dismissTo('/(tabs)/payments' as never)} className="w-11 h-11 rounded-full items-center justify-center active:opacity-60" style={[{ backgroundColor: palette.softFill }, noWebOutline]}>
            <ArrowLeft size={19} color={palette.text} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>Payment</Text>
            <Text style={{ color: palette.faint, fontSize: 12.5, letterSpacing: 0.3 }} numberOfLines={1} selectable>{paymentReference}</Text>
          </View>
          {linkedOrder ? (
            <Pressable
              onPress={handleViewLinkedOrder}
              className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
              style={{ borderWidth: 1, borderColor: palette.outline, height: 44, gap: 8, paddingHorizontal: isDesktop ? 20 : 14 }}
            >
              <ExternalLink size={isDesktop ? 15 : 14} color={colors.text.primary} strokeWidth={2.2} />
              <Text style={{ color: colors.text.primary }} className={isDesktop ? 'font-medium text-sm' : 'font-semibold text-xs'}>Linked order</Text>
            </Pressable>
          ) : null}
        </View>
        {payment ? (
          <View style={{ gap: 10, paddingBottom: 6, marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MoneyText style={{ flex: 1, color: palette.text, fontSize: 42, lineHeight: 48, letterSpacing: -1.4 }} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(payment.amount)}
              </MoneyText>
              {canEditPaymentAmount && !isEditingAmount ? (
                <Pressable
                  onPress={() => {
                    setEditAmount(String(payment.amount || ''));
                    setIsEditingAmount(true);
                  }}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}
                  accessibilityLabel="Edit payment amount"
                >
                  <Pencil size={16} color={palette.text} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
              <StatusPill status={paymentStatus} compact />
              <SourcePill source={payment.source} compact />
              <Text style={{ color: palette.faint, fontSize: 12.5 }}>{formatCreatedLabel(payment.createdAt)}</Text>
            </View>
          </View>
        ) : null}
        {detailQuery.isPending && !detailQuery.data ? (
          <PaymentDetailSkeleton isDesktop={isDesktop} />
        ) : !payment ? (
          <DetailCard>
            <Text style={{ color: colors.text.primary }} className="text-xl font-semibold mb-2">Payment not found</Text>
            <Text style={{ color: colors.text.secondary }} className="text-base">This storefront payment could not be found for this business.</Text>
          </DetailCard>
        ) : (
          <>
            {isDesktop ? (
              <DetailCard
                style={{
                  marginBottom: sectionGap,
                  backgroundColor: palette.card,
                  borderColor: linkedOrder ? palette.nudgeBorder : palette.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px] mb-1">Order workflow</Text>
                    <Text style={{ color: colors.text.muted }} className="text-sm">
                      {linkedOrder
                        ? `Linked to ${linkedOrder.orderNumber}. Staff should fulfill this order instead of creating another one.`
                        : isExplicitlyUnlinked
                          ? 'This payment is unlinked. Link it to the manual order staff created, or create a new order from this payment.'
                          : 'No order is linked yet. Link an existing manual order, or create the order from this payment.'}
                    </Text>
                    {linkedOrder && !payment.linkedOrderId ? (
                        <View className="rounded-full px-3 py-1.5 self-start mt-3" style={{ backgroundColor: palette.warnBg }}>
                          <Text style={{ color: palette.warn }} className="text-xs font-semibold">Payment-created draft</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={handleOpenLinkOrder}
                      disabled={linkExistingOrderMutation.isPending}
                      className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
                      style={{ backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, height: 44, gap: 8, opacity: linkExistingOrderMutation.isPending ? 0.6 : 1 }}
                    >
                      <FileText size={15} color={colors.text.primary} strokeWidth={2.2} />
                      <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
                        {linkedOrder ? 'Replace order' : 'Link existing order'}
                      </Text>
                    </Pressable>
                    {linkedOrder ? (
                      <Pressable
                        onPress={handleUnlinkOrder}
                        disabled={unlinkOrderMutation.isPending}
                        className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
                        style={{ backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, height: 44, gap: 8, opacity: unlinkOrderMutation.isPending ? 0.6 : 1 }}
                      >
                        {unlinkOrderMutation.isPending ? (
                          <ActivityIndicator color={colors.text.primary} size="small" />
                        ) : (
                          <X size={15} color={colors.text.primary} strokeWidth={2.2} />
                        )}
                        <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Unlink</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={handleCreateLinkedOrder}
                        disabled={createLinkedOrderMutation.isPending}
                        className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
                        style={{ backgroundColor: primaryButtonBg, height: 44, gap: 8, opacity: createLinkedOrderMutation.isPending ? 0.65 : 1 }}
                      >
                        {createLinkedOrderMutation.isPending ? (
                          <ActivityIndicator color={primaryButtonText} size="small" />
                        ) : (
                          <Check size={15} color={primaryButtonText} strokeWidth={2.3} />
                        )}
                        <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Create order</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </DetailCard>
            ) : (
              <View
                className="rounded-2xl px-3.5 py-3"
                style={{
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: linkedOrder ? palette.nudgeBorder : palette.border,
                  marginBottom: sectionGap,
                }}
              >
                <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                  <View className="flex-1">
                    <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                      <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: linkedOrder ? palette.tones.verified.bg : palette.tones.awaiting.bg }}>
                        <Text style={{ color: linkedOrder ? palette.tones.verified.ink : palette.tones.awaiting.ink }} className="text-[11px] font-semibold">
                          {linkedOrder ? 'Linked' : 'Unlinked'}
                        </Text>
                      </View>
                      {linkedOrder && !payment.linkedOrderId ? (
                        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: palette.warnBg }}>
                          <Text style={{ color: palette.warn }} className="text-[11px] font-semibold">Draft</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-2" numberOfLines={1}>
                      {linkedOrder ? `Linked to ${linkedOrder.orderNumber}` : 'No order linked'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleOpenLinkOrder}
                    disabled={linkExistingOrderMutation.isPending}
                    className="rounded-full flex-row items-center justify-center active:opacity-80 px-3.5"
                    style={{ height: 34, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, gap: 5, opacity: linkExistingOrderMutation.isPending ? 0.6 : 1 }}
                  >
                    <FileText size={13} color={colors.text.primary} strokeWidth={2.2} />
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-xs">
                      {linkedOrder ? 'Replace' : 'Link order'}
                    </Text>
                  </Pressable>
                </View>
                {linkedOrder ? (
                  <Pressable
                    onPress={handleUnlinkOrder}
                    disabled={unlinkOrderMutation.isPending}
                    className="self-start rounded-full flex-row items-center justify-center active:opacity-80 px-3 mt-2"
                    style={{ height: 30, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, gap: 5, opacity: unlinkOrderMutation.isPending ? 0.6 : 1 }}
                  >
                    {unlinkOrderMutation.isPending ? (
                      <ActivityIndicator color={colors.text.primary} size="small" />
                    ) : (
                      <X size={12} color={colors.text.primary} strokeWidth={2.2} />
                    )}
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-xs">Unlink</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleCreateLinkedOrder}
                    disabled={createLinkedOrderMutation.isPending}
                    className="self-start rounded-full flex-row items-center justify-center active:opacity-80 px-3 mt-2"
                    style={{ height: 30, backgroundColor: primaryButtonBg, gap: 5, opacity: createLinkedOrderMutation.isPending ? 0.65 : 1 }}
                  >
                    {createLinkedOrderMutation.isPending ? (
                      <ActivityIndicator color={primaryButtonText} size="small" />
                    ) : (
                      <Check size={12} color={primaryButtonText} strokeWidth={2.3} />
                    )}
                    <Text style={{ color: primaryButtonText }} className="font-semibold text-xs">Create order</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: sectionGap, alignItems: 'stretch', marginBottom: sectionGap }}>
              <DetailCard className={isDesktop ? 'flex-1' : ''} style={isDesktop ? { minHeight: 286 } : undefined}>
                <View className="flex-row items-start justify-between mb-4">
                  <SectionLabel palette={palette}>Payment</SectionLabel>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium">
                    {formatPaymentMethod(payment.paymentMethod)}
                  </Text>
                </View>
                {isEditingAmount ? (
                  <View style={{ marginBottom: 16, gap: 10 }}>
                    <View className="rounded-full px-4" style={{ height: 48, justifyContent: 'center', backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor }}>
                      <TextInput
                        value={editAmount}
                        onChangeText={setEditAmount}
                        placeholder="Amount"
                        placeholderTextColor={colors.input.placeholder}
                        keyboardType="decimal-pad"
                        style={[{ color: colors.input.text, fontSize: 20, fontWeight: '700' }, noWebOutline]}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          setEditAmount(String(payment.amount || ''));
                          setIsEditingAmount(false);
                        }}
                        disabled={updatePaymentAmountMutation.isPending}
                        className="rounded-full items-center justify-center px-4"
                        style={{ height: 34, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder }}
                      >
                        <Text style={{ color: colors.text.primary }} className="font-semibold text-xs">Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updatePaymentAmountMutation.mutate()}
                        disabled={updatePaymentAmountMutation.isPending}
                        className="rounded-full flex-row items-center justify-center px-4"
                        style={{ height: 34, backgroundColor: primaryButtonBg, gap: 6, opacity: updatePaymentAmountMutation.isPending ? 0.65 : 1 }}
                      >
                        {updatePaymentAmountMutation.isPending ? (
                          <ActivityIndicator color={primaryButtonText} size="small" />
                        ) : (
                          <Save size={13} color={primaryButtonText} strokeWidth={2.4} />
                        )}
                        <Text style={{ color: primaryButtonText }} className="font-semibold text-xs">Save amount</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {hasPaymentBalance ? (
                  <View className="rounded-2xl px-3 py-2 mb-4" style={{ backgroundColor: palette.warnBg }}>
                    <Text style={{ color: palette.warn }} className="text-xs font-semibold">
                      Paid {formatCurrency(payment.amount)} of {formatCurrency(expectedAmount)} · Balance {formatCurrency(balanceDue)}
                    </Text>
                  </View>
                ) : null}
                <InfoLine icon={CreditCard} label="Reference" value={paymentReference} />
                <InfoLine icon={FileText} label="Order" value={linkedOrder?.orderNumber ?? 'Not linked yet'} />
                <InfoLine icon={User} label="Customer" value={payment.customerName || linkedOrder?.customerName} />
                {canVerify || canReject ? (
                  <View className="mt-4" style={{ gap: 8 }}>
                    <Text style={{ color: colors.text.muted }} className="text-[11px] font-semibold uppercase tracking-wider">
                      Review payment proof
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}>
                    {canReject ? (
                      <Pressable
                        onPress={() => {
                          Alert.alert(
                            'Reject payment proof?',
                            'This marks the storefront payment as rejected in Fyll.app.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Reject', style: 'destructive', onPress: () => rejectPaymentMutation.mutate() },
                            ]
                          );
                        }}
                        disabled={rejectPaymentMutation.isPending || verifyPaymentMutation.isPending}
                        className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
                        style={{
                          flexBasis: isDesktop ? undefined : '50%',
                          flexGrow: isDesktop ? 0 : 1,
                          backgroundColor: palette.dangerBg,
                          borderWidth: 1,
                          borderColor: palette.dangerBorder,
                          height: 46,
                          gap: 8,
                          opacity: rejectPaymentMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        {rejectPaymentMutation.isPending ? (
                          <ActivityIndicator color={palette.danger} size="small" />
                        ) : (
                          <X size={15} color={palette.danger} strokeWidth={2.5} />
                        )}
                        <Text style={{ color: palette.danger }} className="font-semibold text-sm">Reject</Text>
                      </Pressable>
                    ) : null}
                    {canVerify ? (
                      <Pressable
                        onPress={() => verifyPaymentMutation.mutate()}
                        disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                        className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
                        style={{
                          flexBasis: isDesktop ? undefined : '50%',
                          flexGrow: isDesktop ? 0 : 1,
                          backgroundColor: FYLL_LIME,
                          height: 46,
                          gap: 8,
                          opacity: verifyPaymentMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        {verifyPaymentMutation.isPending ? (
                          <ActivityIndicator color={FYLL_LIME_INK} size="small" />
                        ) : (
                          <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.5} />
                        )}
                        <Text style={{ color: FYLL_LIME_INK }} className="font-semibold text-sm">
                          {isCardPayment ? 'Mark card paid' : 'Approve'}
                        </Text>
                      </Pressable>
                    ) : null}
                    </View>
                  </View>
                ) : isVerified ? (
                  <View className="rounded-full flex-row items-center justify-center mt-3 px-5 self-start" style={{ backgroundColor: palette.tones.verified.bg, height: 42, gap: 8 }}>
                    <Check size={16} color={palette.tones.verified.ink} strokeWidth={2.5} />
                    <Text style={{ color: palette.tones.verified.ink }} className="font-semibold text-sm">Payment confirmed</Text>
                  </View>
                ) : paymentStatus === 'rejected' ? (
                  <View className="rounded-full flex-row items-center justify-center mt-3 px-4 self-start" style={{ backgroundColor: palette.tones.rejected.bg, height: 34, gap: 6 }}>
                    <X size={13} color={palette.tones.rejected.ink} strokeWidth={2.5} />
                    <Text style={{ color: palette.tones.rejected.ink }} className="font-semibold text-xs">Payment rejected</Text>
                  </View>
                ) : null}
              </DetailCard>

              <View style={{ width: isDesktop ? 420 : '100%', alignSelf: 'stretch' }}>
                <DetailCard style={{ flex: 1, backgroundColor: palette.card }}>
                  <View className="flex-row items-start justify-between mb-4">
                    <SectionLabel palette={palette}>Payment proof</SectionLabel>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium">
                      {proofUrl ? 'Submitted' : 'Not submitted'}
                    </Text>
                  </View>
                  {proofUrl ? (
                    <Pressable
                      onPress={() => setShowProofLightbox(true)}
                      className="flex-row items-center rounded-2xl p-3 active:opacity-75"
                      style={{ backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}
                    >
                      <Image source={{ uri: proofUrl }} style={{ width: 76, height: 76, borderRadius: 12, marginRight: 12, backgroundColor: colors.bg.secondary }} resizeMode="cover" />
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Payment proof</Text>
                        <Text style={{ color: colors.text.muted }} className="text-sm mt-1">Tap to view full image</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <Text style={{ color: colors.text.muted }} className="text-sm">No payment proof submitted yet.</Text>
                  )}
                </DetailCard>
              </View>
            </View>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: sectionGap, alignItems: 'stretch', marginBottom: sectionGap }}>
              <View style={{ flex: 1, minWidth: 0, width: isDesktop ? undefined : '100%' }}>
                <DetailCard>
                  <View style={{ marginBottom: 12 }}><SectionLabel palette={palette}>Customer</SectionLabel></View>
                  <InfoLine icon={User} label="Name" value={payment.customerName || linkedOrder?.customerName} />
                  <InfoLine icon={Phone} label="Phone" value={payment.customerPhone || linkedOrder?.customerPhone} />
                  <InfoLine icon={Mail} label="Email" value={payment.customerEmail || linkedOrder?.customerEmail} />
                  <InfoLine icon={MapPin} label="Address" value={deliveryLocationText || linkedOrder?.deliveryAddress} />
                </DetailCard>
                {isDesktop ? renderActivityCard({ marginTop: sectionGap }) : null}
              </View>

              <View style={{ width: isDesktop ? 420 : '100%', alignSelf: 'stretch', gap: sectionGap }}>
                <DetailCard>
                  <View style={{ marginBottom: 12 }}><SectionLabel palette={palette}>Payment destination</SectionLabel></View>
                  {isCardPayment ? (
                    <InfoLine icon={CreditCard} label="Channel" value="Card / Paystack" />
                  ) : hasPaymentDestination && bankAccount ? (
                    <>
                      <InfoLine icon={Landmark} label="Bank" value={bankAccount.bankName || bankAccount.bank} />
                      <InfoLine icon={User} label="Account name" value={bankAccount.accountName} />
                      <InfoLine icon={CreditCard} label="Account number" value={bankAccount.accountNumber} />
                    </>
                  ) : isBankTransferPayment && fallbackBankAccountId ? (
                    <InfoLine icon={Landmark} label="Bank account ID" value={fallbackBankAccountId} />
                  ) : (
                    <Text style={{ color: colors.text.muted }} className="text-sm">No payment destination was linked to this payment.</Text>
                  )}
                </DetailCard>
                <DetailCard style={{ flex: 1, minHeight: 132 }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <SectionLabel palette={palette}>Order items</SectionLabel>
                    <Text style={{ color: colors.text.muted }} className="text-sm">{displayItems.length}</Text>
                  </View>
                  {displayItems.length > 0 ? (
                    displayItems.map((item, index) => (
                      <View
                        key={item.id}
                        className="flex-row items-center justify-between py-3"
                        style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: separatorColor }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline, marginRight: 10 }}>
                          {item.imageUrl ? <Image source={{ uri: item.imageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <Package size={17} color={palette.faint} strokeWidth={1.7} />}
                        </View>
                        <View className="flex-1 mr-3">
                          <Text style={{ color: colors.text.primary, fontWeight: '400' }} className="text-sm" numberOfLines={1}>
                            {item.quantity}x {item.title}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text.primary, fontWeight: '400' }} className="text-sm">
                          {formatCurrency(item.total)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View className="flex-1 items-center justify-center py-4">
                      <Package size={20} color={colors.text.muted} strokeWidth={1.8} />
                      <Text style={{ color: colors.text.muted }} className="text-sm mt-2 text-center">No order items found.</Text>
                    </View>
                  )}
                </DetailCard>
                {isDesktop ? renderPaymentSummaryCard() : null}
              </View>
            </View>

            {!isDesktop ? renderPaymentSummaryCard() : null}
            {!isDesktop ? renderActivityCard({ marginTop: sectionGap }) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={showLinkOrderModal} transparent animationType="fade" onRequestClose={() => setShowLinkOrderModal(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.42)' }}>
          <View
            className="rounded-t-[28px] p-5"
            style={{
              backgroundColor: colors.bg.primary,
              borderTopWidth: 1,
              borderColor: separatorColor,
              maxHeight: isDesktop ? 680 : '82%',
              width: isDesktop ? 560 : '100%',
              alignSelf: 'center',
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">
                  {linkedOrder ? 'Replace linked order' : 'Link existing order'}
                </Text>
                <Text style={{ color: colors.text.muted }} className="text-sm mt-1">
                  Choose the manual order that should receive this payment.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowLinkOrderModal(false)}
                className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.primary} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View
              className="rounded-full px-4 mb-4"
              style={{ height: 46, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, justifyContent: 'center' }}
            >
              <TextInput
                value={orderSearchQuery}
                onChangeText={setOrderSearchQuery}
                placeholder="Search order, customer, phone"
                placeholderTextColor={colors.input.placeholder}
                style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                selectionColor={colors.text.primary}
              />
              <SearchClearButton visible={Boolean(orderSearchQuery.trim())} onPress={() => setOrderSearchQuery('')} />
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: isDesktop ? 12 : tabBarHeight + 32 }}
            >
              {candidateOrders.length > 0 ? (
                candidateOrders.map((order) => {
                  const sameCustomer = Boolean(payment?.customerName && order.customerName.trim().toLowerCase() === payment.customerName.trim().toLowerCase());
                  return (
                    <Pressable
                      key={order.id}
                      onPress={() => linkExistingOrderMutation.mutate(order)}
                      disabled={linkExistingOrderMutation.isPending}
                      className="rounded-2xl p-4 mb-2.5 active:opacity-75"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, opacity: linkExistingOrderMutation.isPending ? 0.6 : 1 }}
                    >
                      <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                        <View className="flex-1">
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>{order.orderNumber}</Text>
                          <Text style={{ color: colors.text.secondary }} className="text-sm mt-1" numberOfLines={1}>{order.customerName || 'No customer'}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1" numberOfLines={1}>
                            {formatCreatedLabel(order.createdAt)} · {order.status}
                          </Text>
                          {sameCustomer ? (
                            <View className="rounded-full px-2.5 py-1 self-start mt-2" style={{ backgroundColor: 'rgba(5, 150, 105, 0.12)' }}>
                              <Text style={{ color: '#059669' }} className="text-[11px] font-semibold">Customer match</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{formatCurrency(order.totalAmount)}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">{order.source || 'Order'}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View className="items-center justify-center py-10">
                  <FileText size={22} color={colors.text.muted} strokeWidth={1.8} />
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-2 text-center">No matching orders found.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showProofLightbox} transparent animationType="fade" onRequestClose={() => setShowProofLightbox(false)}>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.82)', padding: 24 }}>
          <Pressable
            onPress={() => setShowProofLightbox(false)}
            className="absolute rounded-full items-center justify-center active:opacity-70"
            style={{ top: 24, right: 24, width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.14)', zIndex: 2 }}
          >
            <X size={18} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
          {proofUrl ? (
            <Image source={{ uri: proofUrl }} style={{ width: '100%', height: isDesktop ? 620 : 460, borderRadius: 18 }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );

  if (Platform.OS === 'web' && isDesktop) {
    return (
      <View className="flex-1 flex-row" style={{ backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View className="flex-1">{content}</View>
      </View>
    );
  }

  return content;
}
