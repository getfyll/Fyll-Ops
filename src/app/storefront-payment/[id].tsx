import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, ActivityIndicator, Platform, Alert, TextInput, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, ArrowLeft, Check, Copy, CreditCard, ExternalLink, FileText, Landmark, Mail, MapPin, Package, Pencil, Phone, Save, User, X } from 'lucide-react-native';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { formatDeliveryLocation, normalizeDeliveryStateValue } from '@/lib/format-address';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, generateOrderNumber, type BankAccount, type Order, type OrderActivityEntry, type OrderItem, type Product } from '@/lib/state/fyll-store';
import { supabaseData } from '@/lib/supabase/data';
import { notifyFyllCheckoutPaymentConfirmed } from '@/lib/fyll-checkout-confirmation';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';
import { PaymentDetailSkeleton } from '@/components/SkeletonLoader';
import { SearchClearButton } from '@/components/SearchClearButton';

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

const STATUS_COLOR: Record<StorefrontPaymentStatus, string> = {
  pending: '#D97706',
  proof_submitted: '#D97706',
  confirmed: '#059669',
  verified: '#059669',
  rejected: '#DC2626',
  failed: '#DC2626',
  refunded: '#DC2626',
};

const STATUS_BG: Record<StorefrontPaymentStatus, string> = {
  pending: 'rgba(217, 119, 6, 0.12)',
  proof_submitted: 'rgba(217, 119, 6, 0.12)',
  confirmed: 'rgba(5, 150, 105, 0.12)',
  verified: 'rgba(5, 150, 105, 0.12)',
  rejected: 'rgba(220, 38, 38, 0.12)',
  failed: 'rgba(220, 38, 38, 0.12)',
  refunded: 'rgba(220, 38, 38, 0.12)',
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
  subtitle?: string;
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

      const variant = product.variants.find((candidate) => {
        const variantKeys = getVariantWooKeys(candidate);
        return wooVariantCandidates.length === 0 || wooVariantCandidates.some((value) => variantKeys.includes(value));
      }) ?? product.variants[0];

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

      const variant = product.variants.find((candidate) => {
        const variantNameKey = normalizeProductNameValue(getVariantDisplayName(candidate));
        return itemVariantKey
          ? variantNameKey === itemVariantKey || variantNameKey.includes(itemVariantKey)
          : true;
      }) ?? product.variants[0];

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
      className={`rounded-2xl p-5 ${className}`}
      style={[
        {
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
  return (
    <View className="rounded-full flex-row items-center" style={{ backgroundColor: STATUS_BG[status], borderWidth: 1, borderColor: STATUS_BG[status], paddingHorizontal: compact ? 8 : 16, paddingVertical: compact ? 4 : 8, gap: 5 }}>
      {status === 'proof_submitted' ? (
        <AlertTriangle size={compact ? 10 : 12} color={STATUS_COLOR[status]} strokeWidth={2.4} />
      ) : null}
      <Text style={{ color: STATUS_COLOR[status], fontSize: compact ? 10 : 12, fontWeight: '600' }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function SourcePill({ source, compact = false }: { source?: string; compact?: boolean }) {
  const normalized = source?.trim().toLowerCase();
  const isFyllCheckout = normalized === 'fyll_checkout';
  const label = SourcePillLabel(source);
  const color = isFyllCheckout ? '#475569' : '#7C3AED';
  const backgroundColor = isFyllCheckout ? 'rgba(71, 85, 105, 0.14)' : 'rgba(124, 58, 237, 0.12)';

  return (
    <View className="rounded-full" style={{ backgroundColor, paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 4 : 8 }}>
      <Text style={{ color, fontSize: compact ? 10 : 12, fontWeight: '600' }}>{label}</Text>
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
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const workflowButtonBg = isDark ? colors.bg.card : '#FFFFFF';
  const workflowButtonBorder = isDark ? '#404040' : 'rgba(17, 24, 39, 0.12)';
  const primaryButtonBg = isDark ? '#FFFFFF' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? 'Staff');
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const products = useFyllStore((s) => s.products);
  const [showProofLightbox, setShowProofLightbox] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [summaryCopied, setSummaryCopied] = useState(false);
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
      const payment = payments.find((candidate) => candidate.id === paymentId) ?? null;
      const linkedOrder = payment ? (() => {
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
      })() : null;
      return { payment, linkedOrder, bankAccounts, orders };
    },
    enabled: Boolean(businessId && paymentId),
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
      websiteOrderReference: targetPayment.sourceOrderId,
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
    return {
      title: product?.name ?? enrichedItem.productName ?? enrichedItem.name ?? enrichedItem.title ?? 'Order item',
      subtitle: variantName || enrichedItem.variantName,
    };
  };

  const displayItems = useMemo<DisplayItem[]>(() => {
    const paymentItems = payment?.items ?? [];
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
          subtitle: labels.subtitle,
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
        subtitle: labels.subtitle,
        total: item.unitPrice * item.quantity,
      };
    });
  }, [linkedOrder?.items, payment?.items, products]);

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
        <Text style={{ color: colors.text.tertiary, lineHeight: 14 }} className="font-semibold text-[11px] uppercase tracking-wider">Payment activity</Text>
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
          <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px] mb-1">Payment summary</Text>
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

  const content = (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }} edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: isDesktop ? 28 : 20,
          paddingTop: isDesktop ? 32 : 20,
          paddingBottom: isDesktop ? 40 : tabBarHeight + 120,
          maxWidth: isDesktop ? 1456 : undefined,
          width: isDesktop ? '100%' : undefined,
          alignSelf: isDesktop ? 'flex-start' : undefined,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-2.5 mb-1.5">
          <Pressable onPress={() => router.push('/(tabs)/payments' as never)} className="w-8 h-8 items-center justify-center active:opacity-60" style={noWebOutline}>
            <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={1}>
            {paymentReference}
          </Text>
          {linkedOrder ? (
            <Pressable
              onPress={handleViewLinkedOrder}
              className="rounded-full flex-row items-center justify-center active:opacity-80 px-5"
              style={{ borderWidth: 1, borderColor: separatorColor, height: isDesktop ? 44 : 36, gap: 8, paddingHorizontal: isDesktop ? 20 : 12 }}
            >
              <ExternalLink size={isDesktop ? 15 : 14} color={colors.text.primary} strokeWidth={2.2} />
              <Text style={{ color: colors.text.primary }} className={isDesktop ? 'font-medium text-sm' : 'font-semibold text-xs'}>Linked order</Text>
            </Pressable>
          ) : null}
        </View>
        {!isDesktop ? (
          <View style={{ height: 1, backgroundColor: separatorColor, opacity: 0.7, marginTop: 10, marginBottom: 14, marginHorizontal: -20 }} />
        ) : null}
        <Text style={{ color: colors.text.muted }} className={payment && !isDesktop ? 'text-sm mb-3' : 'text-sm mb-6'}>{formatCreatedLabel(payment?.createdAt)}</Text>
        {payment ? (
          <View className="flex-row items-center flex-wrap mb-5" style={{ gap: 8 }}>
            <StatusPill status={paymentStatus} compact={!isDesktop} />
            <SourcePill source={payment.source} compact={!isDesktop} />
          </View>
        ) : null}
        {detailQuery.isLoading ? (
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
                  backgroundColor: linkedOrder ? 'rgba(5, 150, 105, 0.07)' : 'rgba(37, 99, 235, 0.06)',
                  borderColor: linkedOrder ? 'rgba(5, 150, 105, 0.18)' : 'rgba(37, 99, 235, 0.16)',
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
                      <View className="rounded-full px-3 py-1.5 self-start mt-3" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)' }}>
                        <Text style={{ color: '#B45309' }} className="text-xs font-semibold">Payment-created draft</Text>
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
                  backgroundColor: linkedOrder ? 'rgba(5, 150, 105, 0.07)' : 'rgba(37, 99, 235, 0.06)',
                  borderWidth: 1,
                  borderColor: linkedOrder ? 'rgba(5, 150, 105, 0.18)' : 'rgba(37, 99, 235, 0.16)',
                  marginBottom: sectionGap,
                }}
              >
                <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                  <View className="flex-1">
                    <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                      <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: linkedOrder ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)' }}>
                        <Text style={{ color: linkedOrder ? '#059669' : '#DC2626' }} className="text-[11px] font-semibold">
                          {linkedOrder ? 'Linked' : 'Unlinked'}
                        </Text>
                      </View>
                      {linkedOrder && !payment.linkedOrderId ? (
                        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)' }}>
                          <Text style={{ color: '#B45309' }} className="text-[11px] font-semibold">Draft</Text>
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
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px]">Payment</Text>
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
                ) : (
                  <View className="flex-row items-center mb-5" style={{ gap: 10 }}>
                    <Text style={{ color: colors.text.primary }} className="text-2xl font-semibold">{formatCurrency(payment.amount)}</Text>
                    {canEditPaymentAmount ? (
                      <Pressable
                        onPress={() => {
                          setEditAmount(String(payment.amount || ''));
                          setIsEditingAmount(true);
                        }}
                        className="rounded-full items-center justify-center"
                        style={{ width: 34, height: 34, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder }}
                        accessibilityLabel="Edit payment amount"
                      >
                        <Pencil size={15} color={colors.text.primary} strokeWidth={2.2} />
                      </Pressable>
                    ) : null}
                  </View>
                )}
                {hasPaymentBalance ? (
                  <View className="rounded-2xl px-3 py-2 mb-4" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)' }}>
                    <Text style={{ color: '#B45309' }} className="text-xs font-semibold">
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
                          backgroundColor: 'rgba(220, 38, 38, 0.1)',
                          borderWidth: 1,
                          borderColor: 'rgba(220, 38, 38, 0.28)',
                          height: 46,
                          gap: 8,
                          opacity: rejectPaymentMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        {rejectPaymentMutation.isPending ? (
                          <ActivityIndicator color="#DC2626" size="small" />
                        ) : (
                          <X size={15} color="#DC2626" strokeWidth={2.5} />
                        )}
                        <Text style={{ color: '#DC2626' }} className="font-semibold text-sm">Reject</Text>
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
                          backgroundColor: '#059669',
                          height: 46,
                          gap: 8,
                          opacity: verifyPaymentMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        {verifyPaymentMutation.isPending ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                        )}
                        <Text style={{ color: '#FFFFFF' }} className="font-semibold text-sm">
                          {isCardPayment ? 'Mark card paid' : 'Approve'}
                        </Text>
                      </Pressable>
                    ) : null}
                    </View>
                  </View>
                ) : isVerified ? (
                  <View className="rounded-full flex-row items-center justify-center mt-3 px-5 self-start" style={{ backgroundColor: STATUS_BG.verified, height: 42, gap: 8 }}>
                    <Check size={16} color={STATUS_COLOR.verified} strokeWidth={2.5} />
                    <Text style={{ color: STATUS_COLOR.verified }} className="font-semibold text-sm">Payment confirmed</Text>
                  </View>
                ) : paymentStatus === 'rejected' ? (
                  <View className="rounded-full flex-row items-center justify-center mt-3 px-4 self-start" style={{ backgroundColor: STATUS_BG.rejected, height: 34, gap: 6 }}>
                    <X size={13} color={STATUS_COLOR.rejected} strokeWidth={2.5} />
                    <Text style={{ color: STATUS_COLOR.rejected }} className="font-semibold text-xs">Payment rejected</Text>
                  </View>
                ) : null}
              </DetailCard>

              <View style={{ width: isDesktop ? 420 : '100%', alignSelf: 'stretch' }}>
                <DetailCard style={{ flex: 1, backgroundColor: isDark ? '#171717' : '#F7F7F7' }}>
                  <View className="flex-row items-start justify-between mb-4">
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px]">Payment proof</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium">
                      {proofUrl ? 'Submitted' : 'Not submitted'}
                    </Text>
                  </View>
                  {proofUrl ? (
                    <Pressable
                      onPress={() => setShowProofLightbox(true)}
                      className="flex-row items-center rounded-2xl p-3 active:opacity-75"
                      style={{ backgroundColor: colors.bg.secondary }}
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
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px] mb-3">Customer</Text>
                  <InfoLine icon={User} label="Name" value={payment.customerName || linkedOrder?.customerName} />
                  <InfoLine icon={Phone} label="Phone" value={payment.customerPhone || linkedOrder?.customerPhone} />
                  <InfoLine icon={Mail} label="Email" value={payment.customerEmail || linkedOrder?.customerEmail} />
                  <InfoLine icon={MapPin} label="Address" value={deliveryLocationText || linkedOrder?.deliveryAddress} />
                </DetailCard>
                {isDesktop ? renderActivityCard({ marginTop: sectionGap }) : null}
              </View>

              <View style={{ width: isDesktop ? 420 : '100%', alignSelf: 'stretch', gap: sectionGap }}>
                <DetailCard>
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px] mb-3">Payment destination</Text>
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
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px]">Order items</Text>
                    <Text style={{ color: colors.text.muted }} className="text-sm">{displayItems.length}</Text>
                  </View>
                  {displayItems.length > 0 ? (
                    displayItems.map((item, index) => (
                      <View
                        key={item.id}
                        className="flex-row items-center justify-between py-3"
                        style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: separatorColor }}
                      >
                        <View className="flex-1 mr-3">
                          <Text style={{ color: colors.text.primary, fontWeight: '400' }} className="text-sm" numberOfLines={1}>
                            {item.quantity}x {item.title}
                          </Text>
                          {item.subtitle ? (
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>{item.subtitle}</Text>
                          ) : null}
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
            {!isDesktop ? renderActivityCard({ marginTop: sectionGap, marginBottom: tabBarHeight + 80 }) : null}
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
