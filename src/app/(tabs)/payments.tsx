import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Wallet, Link2, Landmark, Store, Check, Trash2, MoreVertical, Pencil, AlertTriangle } from 'lucide-react-native';
import useAuthStore from '@/lib/state/auth-store';
import { supabaseData } from '@/lib/supabase/data';
import { notifyFyllCheckoutPaymentConfirmed } from '@/lib/fyll-checkout-confirmation';
import useFyllStore, { formatCurrency, generateOrderNumber, getSocialCheckoutEffectiveStatus, type Order, type OrderActivityEntry, type SocialCheckoutDraft, type SocialCheckoutStatus } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { PaymentListSkeleton } from '@/components/SkeletonLoader';
import * as Haptics from 'expo-haptics';

// Styled to match the reference dashboard (clean table on desktop, minimal
// pill chips, text+dot status instead of filled badges) rather than this
// app's usual icon-box card list.

const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';

const STATUS_LABEL: Record<SocialCheckoutStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  payment_submitted: 'Needs review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const STATUS_COLOR: Record<SocialCheckoutStatus, string> = {
  awaiting_payment: '#D97706',
  payment_submitted: '#D97706',
  verified: '#059669',
  rejected: '#DC2626',
  cancelled: '#DC2626',
  expired: '#DC2626',
};

const STATUS_BG: Record<SocialCheckoutStatus, string> = {
  awaiting_payment: 'rgba(217, 119, 6, 0.15)',
  payment_submitted: 'rgba(217, 119, 6, 0.15)',
  verified: 'rgba(5, 150, 105, 0.15)',
  rejected: 'rgba(220, 38, 38, 0.15)',
  cancelled: 'rgba(220, 38, 38, 0.15)',
  expired: 'rgba(220, 38, 38, 0.15)',
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

function StatusTag({ status }: { status: SocialCheckoutStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <View
      className="rounded-full"
      style={{
        backgroundColor: STATUS_BG[status],
        borderWidth: 0,
        borderColor: STATUS_BG[status],
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

type SharedPaymentStatus = 'pending' | 'proof_submitted' | 'confirmed' | 'verified' | 'rejected' | 'failed' | 'refunded';
type StorefrontPaymentStatus = 'pending' | 'proof_submitted' | 'confirmed' | 'verified' | 'rejected' | 'failed' | 'refunded';
type SharedPaymentRecord = {
  id: string;
  businessId: string;
  source: 'storefront' | string;
  sourceOrderId: string;
  linkedOrderId?: string | null;
  linkedOrderNumber?: string | null;
  unlinkedOrderId?: string | null;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  amount: number;
  amountPaid?: number;
  expectedAmount?: number;
  orderTotal?: number;
  balanceDue?: number;
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
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
};

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

const canManuallyConfirmPayment = (payment: SharedPaymentRecord, linkedOrder?: Order) => {
  const status = getStorefrontPaymentStatus(payment);
  return isManualBankTransferMethod(payment.paymentMethod)
    && status === 'proof_submitted'
    && Boolean(getPaymentProofUrl(payment) || getPaymentProofUrl(linkedOrder as PaymentProofSource | undefined));
};

const isFyllCheckoutPayment = (payment: SharedPaymentRecord) => (
  payment.source.trim().toLowerCase() === 'fyll_checkout'
);

const isFyllCheckoutOrder = (order: Order, fyllCheckoutReferences: Set<string>) => {
  const record = order as Order & {
    source?: string;
    fyllCheckout?: { reference?: string };
  };
  const source = record.source?.trim().toLowerCase();
  return source === 'fyll checkout'
    || source === 'fyll_checkout'
    || Boolean(record.fyllCheckout?.reference && fyllCheckoutReferences.has(record.fyllCheckout.reference));
};

const formatStorefrontPaymentReference = (payment: SharedPaymentRecord, linkedOrderNumber?: string) => {
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

const STOREFRONT_STATUS_LABEL: Record<StorefrontPaymentStatus, string> = {
  pending: 'Pending',
  proof_submitted: 'Needs review',
  confirmed: 'Verified',
  verified: 'Verified',
  rejected: 'Rejected',
  failed: 'Failed',
  refunded: 'Refunded',
};

const STOREFRONT_STATUS_COLOR: Record<StorefrontPaymentStatus, string> = {
  pending: '#D97706',
  proof_submitted: '#D97706',
  confirmed: '#059669',
  verified: '#059669',
  rejected: '#DC2626',
  failed: '#DC2626',
  refunded: '#DC2626',
};

const STOREFRONT_STATUS_BG: Record<StorefrontPaymentStatus, string> = {
  pending: 'rgba(217, 119, 6, 0.15)',
  proof_submitted: 'rgba(217, 119, 6, 0.15)',
  confirmed: 'rgba(5, 150, 105, 0.15)',
  verified: 'rgba(5, 150, 105, 0.15)',
  rejected: 'rgba(220, 38, 38, 0.15)',
  failed: 'rgba(220, 38, 38, 0.15)',
  refunded: 'rgba(220, 38, 38, 0.15)',
};

function ChannelBadge({ label }: { label: string }) {
  return (
    <View
      className="rounded-full flex-row items-center"
      style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)', paddingHorizontal: 8, paddingVertical: 2, gap: 4, alignSelf: 'flex-start' }}
    >
      <Store size={10} color="#7C3AED" strokeWidth={2.5} />
      <Text style={{ color: '#7C3AED', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

type PaymentSource = 'social_checkout' | 'storefront' | 'fyll_checkout';
type PaymentFilter = null | 'awaiting' | 'needs_review' | 'confirmed' | 'expired';
type PaymentPeriod = 'all' | 'week' | 'month' | 'year';

function SourceBadge({ source }: { source: PaymentSource }) {
  const isStorefront = source === 'storefront';
  const isFyllCheckout = source === 'fyll_checkout';
  const Icon = isStorefront || isFyllCheckout ? Store : Link2;
  const label = isFyllCheckout ? 'Fyll Checkout' : isStorefront ? 'Storefront' : 'Social Checkout';
  const color = isFyllCheckout ? '#84CC16' : isStorefront ? '#7C3AED' : '#2563EB';
  const backgroundColor = isFyllCheckout ? 'rgba(132, 204, 22, 0.16)' : isStorefront ? 'rgba(124, 58, 237, 0.12)' : 'rgba(37, 99, 235, 0.12)';

  return (
    <View
      className="rounded-full flex-row items-center"
      style={{ backgroundColor, paddingHorizontal: 8, paddingVertical: 2, gap: 4, alignSelf: 'flex-start' }}
    >
      <Icon size={10} color={color} strokeWidth={2.5} />
      <Text style={{ color, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

type PaymentRecord = {
  id: string;
  source: PaymentSource;
  reference: string;
  orderNumber?: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  amountCaption?: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  statusGroup: Exclude<PaymentFilter, null>;
  createdAt: string;
  createdLabel: string;
  onPress: () => void;
  confirmAction?: {
    onConfirm: () => void;
    isConfirming: boolean;
  };
  editAction?: {
    onEdit: () => void;
  };
  deleteAction?: {
    onDelete: () => void;
    isDeleting: boolean;
  };
};

function PaymentRecordRow({
  record,
  isDesktop,
  separatorColor,
}: {
  record: PaymentRecord;
  isDesktop: boolean;
  separatorColor: string;
}) {
  const colors = useThemeColors();
  const [showMobileActions, setShowMobileActions] = useState(false);
  const hasMobileActions = Boolean(record.confirmAction || record.editAction || record.deleteAction);

  const ConfirmButton = record.confirmAction ? (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        record.confirmAction?.onConfirm();
      }}
      disabled={record.confirmAction.isConfirming}
      className="rounded-full items-center justify-center flex-row active:opacity-70"
      style={{ height: 28, paddingHorizontal: 10, backgroundColor: '#059669', gap: 4 }}
    >
      {record.confirmAction.isConfirming ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <>
          <Check size={12} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>Confirm</Text>
        </>
      )}
    </Pressable>
  ) : null;

  const DeleteButton = record.deleteAction ? (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        record.deleteAction?.onDelete();
      }}
      disabled={record.deleteAction.isDeleting}
      className="rounded-full items-center justify-center active:opacity-70"
      style={{
        width: 28,
        height: 28,
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        opacity: record.deleteAction.isDeleting ? 0.6 : 1,
      }}
    >
      {record.deleteAction.isDeleting ? (
        <ActivityIndicator size="small" color="#DC2626" />
      ) : (
        <Trash2 size={13} color="#DC2626" strokeWidth={2.2} />
      )}
    </Pressable>
  ) : null;

  if (isDesktop) {
    return (
      <Pressable
        onPress={record.onPress}
        className="flex-row items-center px-5 active:opacity-60"
        style={{ height: 56, borderBottomWidth: 1, borderBottomColor: separatorColor }}
      >
        <View style={{ flex: 1.25, minWidth: 145, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>{record.reference}</Text>
        </View>
        <View style={{ flex: 0.95, minWidth: 100, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>
            {record.orderNumber ?? '—'}
          </Text>
        </View>
        <View style={{ flex: 1.45, minWidth: 180, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>{record.customerName || '—'}</Text>
        </View>
        <View style={{ flex: 0.9, minWidth: 105, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{formatCurrency(record.amount)}</Text>
          {record.amountCaption ? (
            <Text style={{ color: colors.text.muted }} className="text-[10px] mt-0.5" numberOfLines={1}>{record.amountCaption}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1.05, minWidth: 130, paddingRight: 10 }}>
          <SourceBadge source={record.source} />
        </View>
        <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}>
          <View
            className="rounded-full flex-row items-center"
            style={{ backgroundColor: record.statusBg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, gap: 4 }}
          >
            {record.statusLabel === 'Needs review' ? (
              <AlertTriangle size={10} color={record.statusColor} strokeWidth={2.4} />
            ) : null}
            <Text style={{ color: record.statusColor, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
              {record.statusLabel}
            </Text>
          </View>
        </View>
        <View style={{ flex: 0.85, minWidth: 96, paddingRight: 10 }}>
          <Text style={{ color: colors.text.muted }} className="text-sm" numberOfLines={1}>{record.createdLabel}</Text>
        </View>
        <View style={{ flex: 0.95, minWidth: 132, alignItems: 'flex-end' }}>
          <View className="flex-row items-center justify-end" style={{ gap: 8 }}>
            {ConfirmButton}
            {DeleteButton}
            {!ConfirmButton && !DeleteButton ? <Text style={{ color: colors.text.muted }} className="text-sm">—</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        record.onPress();
      }}
      className="mb-2.5 active:opacity-70"
    >
      <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                {record.reference}
              </Text>
              <SourceBadge source={record.source} />
            </View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
              {record.customerName || 'No customer'}
            </Text>
            {record.orderNumber ? (
              <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                Order {record.orderNumber}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base">{formatCurrency(record.amount)}</Text>
            {record.amountCaption ? (
              <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{record.amountCaption}</Text>
            ) : null}
            <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{record.createdLabel}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <View
            className="rounded-full flex-row items-center"
            style={{ backgroundColor: record.statusBg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, gap: 4 }}
          >
            {record.statusLabel === 'Needs review' ? (
              <AlertTriangle size={10} color={record.statusColor} strokeWidth={2.4} />
            ) : null}
            <Text style={{ color: record.statusColor, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
              {record.statusLabel}
            </Text>
          </View>
          {hasMobileActions ? (
            <View style={{ position: 'relative' }}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  setShowMobileActions((value) => !value);
                }}
                className="rounded-full items-center justify-center active:opacity-70"
                style={{ width: 32, height: 32, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: separatorColor }}
              >
                <MoreVertical size={16} color={colors.text.primary} strokeWidth={2.3} />
              </Pressable>
              {showMobileActions ? (
                <View
                  className="rounded-2xl p-2"
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 38,
                    width: 152,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: separatorColor,
                    shadowColor: '#000000',
                    shadowOpacity: 0.16,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 8,
                    zIndex: 20,
                  }}
                >
                  {record.confirmAction ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setShowMobileActions(false);
                        record.confirmAction?.onConfirm();
                      }}
                      disabled={record.confirmAction.isConfirming}
                      className="rounded-xl flex-row items-center px-3"
                      style={{ height: 40, gap: 8, opacity: record.confirmAction.isConfirming ? 0.6 : 1 }}
                    >
                      <Check size={15} color="#059669" strokeWidth={2.4} />
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Confirm</Text>
                    </Pressable>
                  ) : null}
                  {record.editAction ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setShowMobileActions(false);
                        record.editAction?.onEdit();
                      }}
                      className="rounded-xl flex-row items-center px-3"
                      style={{ height: 40, gap: 8 }}
                    >
                      <Pencil size={15} color={colors.text.primary} strokeWidth={2.4} />
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Edit</Text>
                    </Pressable>
                  ) : null}
                  {record.deleteAction ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setShowMobileActions(false);
                        record.deleteAction?.onDelete();
                      }}
                      disabled={record.deleteAction.isDeleting}
                      className="rounded-xl flex-row items-center px-3"
                      style={{ height: 40, gap: 8, opacity: record.deleteAction.isDeleting ? 0.6 : 1 }}
                    >
                      {record.deleteAction.isDeleting ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <Trash2 size={15} color="#DC2626" strokeWidth={2.4} />
                      )}
                      <Text style={{ color: '#DC2626' }} className="text-sm font-semibold">Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function PaymentStatCard({
  label,
  value,
  caption,
  separatorColor,
  isMobile = false,
}: {
  label: string;
  value: string;
  caption: string;
  separatorColor: string;
  isMobile?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View
      className="rounded-[24px]"
      style={{
        flex: 1,
        minHeight: isMobile ? 104 : 138,
        paddingHorizontal: isMobile ? 14 : 18,
        paddingVertical: isMobile ? 12 : 18,
        backgroundColor: colors.bg.card,
        borderWidth: 1,
        borderColor: separatorColor,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </Text>
      <Text style={{ color: colors.text.primary, fontSize: isMobile ? 20 : 26, fontWeight: '700', marginTop: 8 }}>
        {value}
      </Text>
      <Text style={{ color: colors.text.muted, fontSize: isMobile ? 10 : 12, fontWeight: '400', lineHeight: isMobile ? 14 : 18, marginTop: 6 }}>
        {caption}
      </Text>
    </View>
  );
}

function DraftRow({
  draft,
  isDesktop,
  orderNumber,
  separatorColor,
  onPress,
}: {
  draft: SocialCheckoutDraft;
  isDesktop: boolean;
  orderNumber?: string;
  separatorColor: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const effectiveStatus = getSocialCheckoutEffectiveStatus(draft);
  const reference = `SC-${draft.id}`;
  const createdLabel = formatCreatedDate(draft.createdAt);

  if (isDesktop) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center px-5 active:opacity-60"
        style={{ height: 56, borderBottomWidth: 1, borderBottomColor: separatorColor }}
      >
        <View className="flex-row items-center" style={{ flex: 1.35, minWidth: 150, paddingRight: 10 }}>
          <Link2 size={13} color={colors.text.muted} strokeWidth={2} />
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm ml-1.5" numberOfLines={1}>{reference}</Text>
        </View>
        <View style={{ flex: 1.05, minWidth: 110, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm ml-1.5" numberOfLines={1}>
            {orderNumber ?? '—'}
          </Text>
        </View>
        <View style={{ flex: 1.65, minWidth: 220, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>{draft.customerName || '—'}</Text>
        </View>
        <View style={{ flex: 0.95, minWidth: 110, paddingRight: 10 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{formatCurrency(draft.amount)}</Text>
        </View>
        <View style={{ flex: 1.2, minWidth: 160, paddingRight: 10 }}>
          <StatusTag status={effectiveStatus} />
        </View>
        <View style={{ flex: 0.8, minWidth: 92, alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text.muted }} className="text-sm">{createdLabel}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mb-2.5 active:opacity-70"
    >
      <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                {reference}
              </Text>
              <StatusTag status={effectiveStatus} />
            </View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
              {draft.customerName || 'No customer yet'}
            </Text>
            {orderNumber ? (
              <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                Order {orderNumber}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base">{formatCurrency(draft.amount)}</Text>
            <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
              {createdLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function formatCreatedDate(iso: string) {
  const created = new Date(iso);
  const today = new Date();
  const isToday =
    created.getFullYear() === today.getFullYear()
    && created.getMonth() === today.getMonth()
    && created.getDate() === today.getDate();

  if (isToday) return 'Today';
  return created.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const getPaymentPeriodRange = (period: Exclude<PaymentPeriod, 'all'>) => {
  const now = new Date();
  const start = new Date(now);
  if (period === 'week') {
    const day = now.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start.setDate(now.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  const end = new Date(start);
  if (period === 'week') end.setDate(start.getDate() + 7);
  if (period === 'month') end.setMonth(start.getMonth() + 1);
  if (period === 'year') end.setFullYear(start.getFullYear() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
};

const isPaymentInPeriod = (iso: string, period: PaymentPeriod) => {
  if (period === 'all') return true;
  const paymentDate = new Date(iso).getTime();
  const { startMs, endMs } = getPaymentPeriodRange(period);
  return Number.isFinite(paymentDate) && paymentDate >= startMs && paymentDate < endMs;
};

export default function PaymentsScreen() {
  const router = useRouter();
  const { seedFyllCheckout } = useLocalSearchParams<{ seedFyllCheckout?: string | string[] }>();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const primaryButtonBg = isDark ? '#FFFFFF' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? 'Staff');
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentFilter>(null);
  const [paymentPeriod, setPaymentPeriod] = useState<PaymentPeriod>('all');
  const [hasSeededFyllCheckoutDemo, setHasSeededFyllCheckoutDemo] = useState(false);

  useEffect(() => {
    const shouldSeed = Array.isArray(seedFyllCheckout) ? seedFyllCheckout[0] === '1' : seedFyllCheckout === '1';
    if (!shouldSeed || !businessId || hasSeededFyllCheckoutDemo) return;

    const seedDemoPayment = async () => {
      const now = new Date().toISOString();
      const reference = `FYL-DEMO-${Date.now().toString().slice(-6)}`;
      const orderId = Math.random().toString(36).substring(2, 15);
      const orderNumber = generateOrderNumber();
      const proofUrl = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80';
      const payment = {
        id: `fyll_checkout_${reference}`,
        businessId,
        source: 'fyll_checkout',
        sourceOrderId: reference,
        linkedOrderId: orderId,
        linkedOrderNumber: orderNumber,
        customerName: 'Ada Example',
        customerEmail: 'ada@example.com',
        customerPhone: '08012345678',
        amount: 44100,
        currency: 'NGN',
        paymentMethod: 'bank_transfer',
        status: 'proof_submitted',
        paymentProofUrl: proofUrl,
        checkoutUrl: `https://checkout.fyll.store/?ref=${reference}`,
        idempotencyKey: `fyll_checkout:${reference}`,
        merchantId: 'MER-EC8AD9A5',
        storeUrl: 'https://minteyewear.co',
        bankAccount: {
          bank: 'GTBank',
          accountName: 'Mint Eyewear',
          accountNumber: '0123456789',
        },
        createdAt: now,
        updatedAt: now,
      };
      const order = {
        id: orderId,
        orderNumber,
        websiteOrderReference: reference,
        customerName: 'Ada Example',
        customerEmail: 'ada@example.com',
        customerPhone: '08012345678',
        deliveryState: 'Lagos Mainland',
        deliveryAddress: '12 Admiralty Way, Lekki, Lagos',
        items: [{
          productId: 'fyll-checkout-demo-item',
          variantId: 'fyll-checkout-demo-item',
          quantity: 1,
          unitPrice: 39100,
        }],
        services: [],
        additionalCharges: 0,
        additionalChargesNote: '',
        deliveryFee: 5000,
        paymentMethod: 'bank_transfer',
        status: 'Pending payment',
        orderStatus: 'Pending payment',
        source: 'Fyll Checkout',
        subtotal: 39100,
        totalAmount: 44100,
        orderDate: now,
        createdAt: now,
        updatedAt: now,
        activityLog: [{
          staffName: 'Fyll Checkout',
          action: `Synced demo checkout ${reference} with status pending_manual_verification`,
          date: now,
        }],
        fyllCheckout: {
          merchantId: 'MER-EC8AD9A5',
          storeUrl: 'https://minteyewear.co',
          reference,
          checkoutUrl: `https://checkout.fyll.store/?ref=${reference}`,
          proofUrl,
        },
      };

      try {
        setHasSeededFyllCheckoutDemo(true);
        await Promise.all([
          supabaseData.upsertCollection('orders', businessId, [order]),
          supabaseData.upsertCollection('payments', businessId, [payment]),
        ]);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] }),
          queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] }),
        ]);
        router.replace('/(tabs)/payments' as never);
      } catch (error) {
        console.error('Failed to seed Fyll Checkout demo payment:', error);
        setHasSeededFyllCheckoutDemo(false);
      }
    };

    void seedDemoPayment();
  }, [businessId, hasSeededFyllCheckoutDemo, queryClient, router, seedFyllCheckout]);

  const draftsQuery = useQuery({
    queryKey: ['social-checkouts', businessId],
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId!);
      const drafts = rows.map((row) => row.data);
      const expiredDrafts = drafts
        .filter((draft) => draft.status === 'awaiting_payment' && getSocialCheckoutEffectiveStatus(draft) === 'expired')
        .map((draft) => ({ ...draft, status: 'expired' as SocialCheckoutStatus, updatedAt: new Date().toISOString() }));

      if (expiredDrafts.length > 0) {
        await supabaseData.upsertCollection('social_checkouts', businessId!, expiredDrafts);
      }

      return drafts.map((draft) => {
        const expired = expiredDrafts.find((candidate) => candidate.id === draft.id);
        return expired ?? draft;
      });
    },
    enabled: Boolean(businessId),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  const ordersQuery = useQuery({
    queryKey: ['orders-for-payments', businessId],
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<Order>('orders', businessId!);
      return rows.map((row) => row.data);
    },
    enabled: Boolean(businessId),
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  const sharedPaymentsQuery = useQuery({
    queryKey: ['shared-payments', businessId],
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<SharedPaymentRecord>('payments', businessId!);
      return rows.map((row) => row.data).filter(isSharedIntegrationPayment);
    },
    enabled: Boolean(businessId),
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  const confirmStorefrontPaymentMutation = useMutation({
    mutationFn: async (payment: SharedPaymentRecord) => {
      const nextStatus = getVerifiedOrderStatus(orderStatuses);
      const timestamp = new Date().toISOString();
      const updatedPayment: SharedPaymentRecord = {
        ...payment,
        status: 'verified',
        updatedAt: timestamp,
      };
      const linkedOrder = (ordersQuery.data ?? []).find((order) => order.id === payment.sourceOrderId);
      const syncTasks: Promise<unknown>[] = [
        supabaseData.upsertCollection('payments', businessId!, [updatedPayment]),
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
        syncTasks.push(supabaseData.upsertCollection('orders', businessId!, [updatedOrder]));
      }

      await Promise.all(syncTasks);
      if (payment.source.trim().toLowerCase() === 'fyll_checkout') {
        try {
          await notifyFyllCheckoutPaymentConfirmed({
            reference: payment.sourceOrderId,
            businessId: businessId!,
          });
        } catch (error) {
          console.warn('Fyll Checkout confirmation callback failed after local approval:', error);
        }
      }
      return updatedPayment;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] });
    },
  });

  const deletePaymentRecordMutation = useMutation({
    mutationFn: async (target: { kind: PaymentSource; id: string; sourceOrderId?: string }) => {
      if (target.kind === 'social_checkout') {
        await supabaseData.deleteByIds('social_checkouts', businessId!, [target.id]);
        return;
      }

      const tasks: Promise<unknown>[] = [
        supabaseData.deleteByIds('payments', businessId!, [target.id]),
      ];

      if (target.kind === 'fyll_checkout' && target.sourceOrderId) {
        const references = new Set([target.sourceOrderId]);
        const orderIds = (ordersQuery.data ?? [])
          .filter((order) => references.has(order.id) || references.has(order.orderNumber) || isFyllCheckoutOrder(order, references))
          .map((order) => order.id);
        tasks.push(supabaseData.deleteByIds('orders', businessId!, orderIds));
      }

      await Promise.all(tasks);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['social-checkouts', businessId] });
      queryClient.invalidateQueries({ queryKey: ['shared-payments', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orders-for-payments', businessId] });
    },
  });

  const handleDeletePaymentRecord = (target: { kind: PaymentSource; id: string; reference: string; sourceOrderId?: string }) => {
    if (deletePaymentRecordMutation.isPending) return;
    const deleteRecord = () => deletePaymentRecordMutation.mutate(target);
    const label = target.kind === 'fyll_checkout'
      ? 'This will also remove the synced Fyll Checkout order for this reference.'
      : 'This removes it from the payments list.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Delete payment ${target.reference}? ${label} This cannot be undone.`);
      if (confirmed) deleteRecord();
      return;
    }

    Alert.alert(
      'Delete payment?',
      `Delete ${target.reference}? ${label} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteRecord },
      ]
    );
  };

  const drafts = draftsQuery.data ?? [];
  const storefrontPayments = sharedPaymentsQuery.data ?? [];
  const periodDrafts = useMemo(() => (
    drafts.filter((draft) => isPaymentInPeriod(draft.createdAt, paymentPeriod))
  ), [drafts, paymentPeriod]);
  const periodStorefrontPayments = useMemo(() => (
    storefrontPayments.filter((payment) => isPaymentInPeriod(payment.createdAt, paymentPeriod))
  ), [paymentPeriod, storefrontPayments]);
  const orderLookup = useMemo(() => {
    const byId = new Map<string, Order>();
    const numberById = new Map<string, string>();
    const byPaymentReference = new Map<string, Order>();
    (ordersQuery.data ?? []).forEach((order) => {
      byId.set(order.id, order);
      numberById.set(order.id, order.orderNumber);
      const record = order as Order & { websiteOrderReference?: string; fyllCheckout?: { reference?: string } };
      [
        order.id,
        order.orderNumber,
        record.websiteOrderReference,
        record.fyllCheckout?.reference,
      ].forEach((reference) => {
        const trimmed = reference?.trim();
        if (trimmed && !byPaymentReference.has(trimmed)) byPaymentReference.set(trimmed, order);
      });
    });
    return { byId, numberById, byPaymentReference };
  }, [ordersQuery.data]);

  const counts = useMemo(() => {
    const result: Record<Exclude<PaymentFilter, null> | 'all', number> = {
      all: periodDrafts.length + periodStorefrontPayments.length,
      awaiting: 0,
      needs_review: 0,
      confirmed: 0,
      expired: 0,
    };

    periodDrafts.forEach((draft) => {
      const status = getSocialCheckoutEffectiveStatus(draft);
      if (status === 'awaiting_payment') result.awaiting += 1;
      if (status === 'payment_submitted') result.needs_review += 1;
      if (status === 'verified') result.confirmed += 1;
      if (status === 'expired' || status === 'rejected' || status === 'cancelled') result.expired += 1;
    });
    periodStorefrontPayments.forEach((payment) => {
      const status = getStorefrontPaymentStatus(payment);
      if (status === 'pending') result.awaiting += 1;
      if (status === 'proof_submitted') result.needs_review += 1;
      if (status === 'confirmed' || status === 'verified') result.confirmed += 1;
      if (status === 'rejected' || status === 'failed' || status === 'refunded') result.expired += 1;
    });
    return result;
  }, [periodDrafts, periodStorefrontPayments]);

  const paymentRecords = useMemo<PaymentRecord[]>(() => {
    const socialRecords = periodDrafts.map((draft): PaymentRecord => {
      const effectiveStatus = getSocialCheckoutEffectiveStatus(draft);
      const statusGroup: PaymentRecord['statusGroup'] = effectiveStatus === 'payment_submitted'
        ? 'needs_review'
        : effectiveStatus === 'verified'
          ? 'confirmed'
          : effectiveStatus === 'expired' || effectiveStatus === 'rejected' || effectiveStatus === 'cancelled'
            ? 'expired'
            : 'awaiting';

      return {
        id: `social-${draft.id}`,
        source: 'social_checkout',
        reference: `SC-${draft.id}`,
        orderNumber: draft.convertedOrderId ? orderLookup.numberById.get(draft.convertedOrderId) : undefined,
        customerName: draft.customerName || '—',
        customerPhone: draft.customerPhone,
        amount: draft.amount,
        statusLabel: STATUS_LABEL[effectiveStatus],
        statusColor: STATUS_COLOR[effectiveStatus],
        statusBg: STATUS_BG[effectiveStatus],
        statusGroup,
        createdAt: draft.createdAt,
        createdLabel: formatCreatedDate(draft.createdAt),
        onPress: () => router.push(`/social-checkout/${draft.id}` as never),
        editAction: currentUserRole === 'admin' && effectiveStatus !== 'expired' && effectiveStatus !== 'rejected' && effectiveStatus !== 'cancelled'
          ? { onEdit: () => router.push(`/social-checkout/${draft.id}` as never) }
          : undefined,
        deleteAction: currentUserRole === 'admin'
          ? {
            onDelete: () => handleDeletePaymentRecord({
              kind: 'social_checkout',
              id: draft.id,
              reference: `SC-${draft.id}`,
            }),
            isDeleting: deletePaymentRecordMutation.isPending
              && deletePaymentRecordMutation.variables?.kind === 'social_checkout'
              && deletePaymentRecordMutation.variables?.id === draft.id,
          }
          : undefined,
      };
    });

    const storefrontRecords = periodStorefrontPayments.map((payment): PaymentRecord => {
      const paymentStatus = getStorefrontPaymentStatus(payment);
      const statusGroup: PaymentRecord['statusGroup'] = paymentStatus === 'confirmed' || paymentStatus === 'verified'
        ? 'confirmed'
        : paymentStatus === 'proof_submitted'
          ? 'needs_review'
          : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'refunded'
            ? 'expired'
            : 'awaiting';
      const explicitLinkedOrder = payment.linkedOrderId?.trim()
        ? orderLookup.byId.get(payment.linkedOrderId.trim())
        : undefined;
      const fallbackLinkedOrder = payment.unlinkedOrderId?.trim()
        ? undefined
        : orderLookup.byPaymentReference.get(payment.sourceOrderId);
      const linkedOrderNumber = payment.linkedOrderNumber?.trim()
        || explicitLinkedOrder?.orderNumber
        || fallbackLinkedOrder?.orderNumber;
      const displayReference = formatStorefrontPaymentReference(payment, linkedOrderNumber);
      const expectedAmount = Number(payment.expectedAmount ?? payment.orderTotal ?? 0);
      const balanceDue = Number(payment.balanceDue ?? (expectedAmount > 0 ? Math.max(0, expectedAmount - payment.amount) : 0));
      const amountCaption = expectedAmount > payment.amount && balanceDue > 0
        ? `Balance ${formatCurrency(balanceDue)}`
        : undefined;

      return {
        id: `storefront-${payment.id}`,
        source: payment.source.trim().toLowerCase() === 'fyll_checkout' ? 'fyll_checkout' : 'storefront',
        reference: displayReference,
        orderNumber: linkedOrderNumber,
        customerName: payment.customerName || '—',
        customerPhone: payment.customerPhone,
        amount: payment.amount,
        amountCaption,
        statusLabel: STOREFRONT_STATUS_LABEL[paymentStatus],
        statusColor: STOREFRONT_STATUS_COLOR[paymentStatus],
        statusBg: STOREFRONT_STATUS_BG[paymentStatus],
        statusGroup,
        createdAt: payment.createdAt,
        createdLabel: formatCreatedDate(payment.createdAt),
        onPress: () => router.push(`/storefront-payment/${payment.id}` as never),
        editAction: currentUserRole === 'admin'
          ? { onEdit: () => router.push(`/storefront-payment/${payment.id}` as never) }
          : undefined,
        confirmAction: canManuallyConfirmPayment(payment, explicitLinkedOrder ?? fallbackLinkedOrder)
          ? {
            onConfirm: () => confirmStorefrontPaymentMutation.mutate(payment),
            isConfirming: confirmStorefrontPaymentMutation.isPending && confirmStorefrontPaymentMutation.variables?.id === payment.id,
          }
          : undefined,
        deleteAction: currentUserRole === 'admin'
          ? {
            onDelete: () => handleDeletePaymentRecord({
              kind: payment.source.trim().toLowerCase() === 'fyll_checkout' ? 'fyll_checkout' : 'storefront',
              id: payment.id,
              reference: displayReference,
              sourceOrderId: payment.sourceOrderId,
            }),
            isDeleting: deletePaymentRecordMutation.isPending
              && deletePaymentRecordMutation.variables?.id === payment.id,
          }
          : undefined,
      };
    });

    const query = searchQuery.trim().toLowerCase();
    return [...socialRecords, ...storefrontRecords]
      .filter((record) => !statusFilter || record.statusGroup === statusFilter)
      .filter((record) => {
        if (!query) return true;
        return (
          record.reference.toLowerCase().includes(query)
          || (record.orderNumber ?? '').toLowerCase().includes(query)
          || (record.source === 'storefront' && record.id.toLowerCase().includes(query))
          || record.customerName.toLowerCase().includes(query)
          || (record.customerPhone ?? '').includes(query)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [confirmStorefrontPaymentMutation, currentUserRole, deletePaymentRecordMutation, orderLookup, periodDrafts, periodStorefrontPayments, router, searchQuery, statusFilter]);

  const handleNewLink = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/social-checkout/new' as never);
  };

  const filterChips: { key: PaymentFilter; label: string; count: number }[] = [
    { key: null, label: 'All', count: counts.all },
    { key: 'awaiting', label: 'Awaiting payment', count: counts.awaiting ?? 0 },
    { key: 'needs_review', label: 'Needs review', count: counts.needs_review ?? 0 },
    { key: 'confirmed', label: 'Verified', count: counts.confirmed ?? 0 },
    { key: 'expired', label: 'Expired', count: counts.expired ?? 0 },
  ];
  const onSelectChip = (key: PaymentFilter) => {
    Haptics.selectionAsync();
    setStatusFilter(key);
  };
  const contentMaxWidth = isWebDesktop ? 1400 : isDesktop ? 980 : undefined;
  const contentPaddingBottom = (isDesktop ? 32 : 24) + tabBarHeight;
  const mobileSectionGap = 12;
  const confirmedPeriodAmount = periodDrafts
    .filter((draft) => getSocialCheckoutEffectiveStatus(draft) === 'verified')
    .reduce((sum, draft) => sum + draft.amount, 0);
  const awaitingConfirmationAmount = periodDrafts
    .filter((draft) => getSocialCheckoutEffectiveStatus(draft) === 'payment_submitted')
    .reduce((sum, draft) => sum + draft.amount, 0);
  const storefrontConfirmedPeriodAmount = periodStorefrontPayments
    .filter((payment) => {
      const status = getStorefrontPaymentStatus(payment);
      return status === 'confirmed' || status === 'verified';
    })
    .reduce((sum, payment) => sum + payment.amount, 0);
  const storefrontAwaitingConfirmationAmount = periodStorefrontPayments
    .filter((payment) => {
      const status = getStorefrontPaymentStatus(payment);
      return status === 'pending' || status === 'proof_submitted';
    })
    .reduce((sum, payment) => sum + payment.amount, 0);
  const combinedConfirmedPeriodAmount = confirmedPeriodAmount + storefrontConfirmedPeriodAmount;
  const combinedAwaitingAmount = awaitingConfirmationAmount + storefrontAwaitingConfirmationAmount;
  const isInitialPaymentsLoading = (draftsQuery.isPending || ordersQuery.isPending || sharedPaymentsQuery.isPending)
    && drafts.length === 0
    && storefrontPayments.length === 0;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          style={{
            paddingHorizontal: isMobile ? 16 : 20,
            paddingTop: isWebDesktop ? 28 : 20,
            paddingBottom: isMobile ? mobileSectionGap : isWebDesktop ? 16 : 12,
            maxWidth: contentMaxWidth,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : isDesktop ? 'center' : undefined,
            minHeight: isWebDesktop ? DESKTOP_PAGE_HEADER_MIN_HEIGHT : undefined,
          }}
        >
          <View
            className="flex-row justify-between"
            style={{
              alignItems: isMobile ? 'center' : 'flex-start',
              gap: isMobile ? 8 : 16,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: isMobile ? 2 : 0 }}>
              <Text style={{ color: colors.text.primary, ...pageHeadingStyle }} numberOfLines={1}>Payments</Text>
              {!isMobile ? (
                <Text style={{ color: colors.text.tertiary, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                  Storefront payments and social checkout links in one view.
                </Text>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              {isDesktop && currentUserRole === 'admin' ? (
                <Pressable
                  onPress={() => router.push('/payment-accounts' as never)}
                  className="rounded-full items-center justify-center flex-row gap-1.5 active:opacity-70 px-4"
                  style={{ height: 44, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}
                >
                  <Landmark size={18} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Bank Accounts</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleNewLink}
                className="rounded-full active:opacity-80 flex-row items-center"
                style={{
                  height: isMobile ? 40 : 44,
                  paddingHorizontal: isMobile ? 12 : 16,
                  gap: isMobile ? 5 : 6,
                  backgroundColor: primaryButtonBg,
                }}
              >
                <Plus size={isMobile ? 17 : 18} color={primaryButtonText} strokeWidth={2.5} />
                <Text style={{ color: primaryButtonText, fontSize: isMobile ? 13 : 14 }} className="font-semibold">New Payment</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: separatorColor, opacity: 0.7 }} />

        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg.primary }}
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 0 : 16,
            maxWidth: contentMaxWidth,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : isDesktop ? 'center' : undefined,
            paddingBottom: contentPaddingBottom,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={draftsQuery.isRefetching || ordersQuery.isRefetching}
              onRefresh={() => {
                draftsQuery.refetch();
                ordersQuery.refetch();
              }}
              tintColor={colors.text.tertiary}
            />
          }
        >
          {isInitialPaymentsLoading ? (
            <PaymentListSkeleton isDesktop={isDesktop} />
          ) : (
            <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: isDesktop ? 20 : 0, marginTop: isMobile ? mobileSectionGap : 20, marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {[
              { key: 'all' as const, label: 'All time' },
              { key: 'week' as const, label: 'This week' },
              { key: 'month' as const, label: 'This month' },
              { key: 'year' as const, label: 'This year' },
            ].map((period) => {
              const selected = paymentPeriod === period.key;
              return (
                <Pressable
                  key={period.key}
                  onPress={() => setPaymentPeriod(period.key)}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{
                    height: isMobile ? 40 : 44,
                    paddingHorizontal: isMobile ? 12 : 16,
                    backgroundColor: selected ? primaryButtonBg : colors.bg.card,
                    borderWidth: selected ? 0 : 1,
                    borderColor: separatorColor,
                  }}
                >
                  <Text style={{ color: selected ? primaryButtonText : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{period.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {counts.all > 0 ? (
            <View
              className="mx-5"
              style={{
                flexDirection: 'row',
                flexWrap: isDesktop ? 'nowrap' : 'wrap',
                marginHorizontal: isDesktop ? 20 : -5,
                marginTop: 0,
                marginBottom: isMobile ? 0 : 20,
                gap: isDesktop ? 16 : 0,
              }}
            >
              {[
                { label: 'Verified', value: formatCurrency(combinedConfirmedPeriodAmount), caption: 'Storefront orders and payment links' },
                { label: 'Pending', value: formatCurrency(combinedAwaitingAmount), caption: 'Payments awaiting confirmation or review' },
                { label: 'Total records', value: String(counts.all), caption: 'Across all payment sources' },
              ].map((item, index) => (
                <View
                  key={item.label}
                  style={{
                    width: isDesktop ? undefined : index === 2 ? '100%' : '50%',
                    flex: isDesktop ? 1 : undefined,
                    paddingHorizontal: isDesktop ? 0 : 5,
                    marginBottom: isDesktop ? 0 : mobileSectionGap,
                  }}
                >
                  <PaymentStatCard label={item.label} value={item.value} caption={item.caption} separatorColor={separatorColor} isMobile={!isDesktop} />
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ marginHorizontal: isDesktop ? 20 : 0, marginBottom: isMobile ? mobileSectionGap : 16 }}>
            <View
              className={isMobile ? undefined : 'flex-row items-center'}
              style={isMobile ? undefined : { gap: 10 }}
            >
              <View
                className="rounded-full"
                style={{
                  height: 44,
                  minHeight: 44,
                  width: isDesktop ? 320 : '100%',
                  flex: isDesktop ? undefined : 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: separatorColor,
                  marginBottom: isMobile ? 12 : 0,
                }}
              >
                <Search size={17} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  placeholder="Search payments, orders, customers"
                  placeholderTextColor={colors.input.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, height: 44, marginLeft: 8, paddingVertical: 0, color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {filterChips.map((chip) => {
                  const isActive = statusFilter === chip.key;
                  return (
                    <Pressable
                      key={chip.label}
                      onPress={() => onSelectChip(chip.key)}
                      className="flex-row items-center rounded-full active:opacity-80"
                      style={{
                        height: isMobile ? 40 : 44,
                        paddingHorizontal: isMobile ? 12 : 16,
                        backgroundColor: isActive ? primaryButtonBg : colors.bg.card,
                        borderWidth: isActive ? 0 : 1,
                        borderColor: separatorColor,
                      }}
                    >
                      <Text style={{ color: isActive ? primaryButtonText : colors.text.primary }} className="text-sm font-semibold">
                        {chip.label}
                      </Text>
                      {chip.count > 0 ? (
                        <Text style={{ color: isActive ? (isDark ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.7)') : colors.text.muted }} className="text-sm font-semibold ml-1.5">
                          {chip.count}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {paymentRecords.length === 0 ? (
            <View className="items-center justify-center py-20 px-5">
              <View className="w-16 h-16 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
                <Wallet size={30} color={colors.text.muted} strokeWidth={1.5} />
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No payments found</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm mb-4 text-center px-8">
                Storefront orders and social checkout payment links will show up here.
              </Text>
              <Pressable
                onPress={handleNewLink}
                className="rounded-full active:opacity-80 px-4"
                style={{ height: 44, backgroundColor: primaryButtonBg, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}
              >
                <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Create Payment Link</Text>
              </Pressable>
            </View>
          ) : isDesktop ? (
            <View className="mx-5 rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card }}>
              <View className="flex-row items-center px-5" style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                <Text style={{ color: colors.text.muted, flex: 1.25, minWidth: 145, paddingRight: 10 }} className="text-xs font-semibold">REFERENCE</Text>
                <Text style={{ color: colors.text.muted, flex: 0.95, minWidth: 100, paddingRight: 10 }} className="text-xs font-semibold">ORDER</Text>
                <Text style={{ color: colors.text.muted, flex: 1.45, minWidth: 180, paddingRight: 10 }} className="text-xs font-semibold">CUSTOMER</Text>
                <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 105, paddingRight: 10 }} className="text-xs font-semibold">AMOUNT</Text>
                <Text style={{ color: colors.text.muted, flex: 1.05, minWidth: 130, paddingRight: 10 }} className="text-xs font-semibold">SOURCE</Text>
                <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10 }} className="text-xs font-semibold">STATUS</Text>
                <Text style={{ color: colors.text.muted, flex: 0.85, minWidth: 96, paddingRight: 10 }} className="text-xs font-semibold">DATE</Text>
                <Text style={{ color: colors.text.muted, flex: 0.95, minWidth: 132, textAlign: 'right' }} className="text-xs font-semibold">ACTION</Text>
              </View>
              {paymentRecords.map((record) => (
                <PaymentRecordRow
                  key={record.id}
                  record={record}
                  isDesktop
                  separatorColor={separatorColor}
                />
              ))}
            </View>
          ) : (
            <>
              {paymentRecords.map((record) => (
                <PaymentRecordRow
                  key={record.id}
                  record={record}
                  isDesktop={false}
                  separatorColor={separatorColor}
                />
              ))}
              <View className="h-8" />
            </>
          )}
            </>
          )}
        </ScrollView>
        {!isDesktop ? (
          <Pressable
            onPress={handleNewLink}
            className="absolute rounded-full items-center justify-center active:opacity-80"
            style={{
              right: 20,
              bottom: Math.max(96, tabBarHeight - 48),
              width: 56,
              height: 56,
              backgroundColor: primaryButtonBg,
              shadowColor: '#000000',
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Plus size={24} color={primaryButtonText} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
