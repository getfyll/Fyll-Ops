import { formatPersonName } from '@/lib/display-format';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, RefreshControl, ActivityIndicator, Alert, Modal, useWindowDimensions, type PressableStateCallbackType } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Wallet, Link2, Link2Off, Landmark, Store, Check, Trash2, Pencil, AlertTriangle, ChevronRight, FileText, X, MoreVertical } from 'lucide-react-native';
import { PaymentsCreateMenu } from '@/components/quotes/PaymentsCreateMenu';
import { useQuotes } from '@/lib/quotes-api';
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, getQuoteEffectiveStatus, type QuoteStatus } from '@/lib/quotes';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { supabaseData } from '@/lib/supabase/data';
import { notifyFyllCheckoutPaymentConfirmed, showFyllCheckoutSyncFailedNotice } from '@/lib/fyll-checkout-confirmation';
import useFyllStore, { formatCurrency, generateOrderNumber, getSocialCheckoutEffectiveStatus, type Order, type OrderActivityEntry, type SocialCheckoutStatus } from '@/lib/state/fyll-store';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, InitialsAvatar, MoneyText, StatusDot, isHovered, isUnsuccessfulTone, usePaymentsPalette, type PaymentsPalette, type StatusTone, useMobileFont } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, usePageHeadingStyle } from '@/lib/page-heading';
import { PaymentListSkeleton } from '@/components/SkeletonLoader';
import * as Haptics from 'expo-haptics';
import { SearchClearButton } from '@/components/SearchClearButton';
import { EmptyState } from '@/components/EmptyState';
import { fetchSocialCheckoutDrafts, getSocialCheckoutQueryKey } from '@/lib/social-checkout-query';
import { syncFyllOrderStatusToWooCommerce } from '@/lib/woocommerce';

// Payments list: summary, an attention nudge, then payments grouped by day
// (table on desktop). Ops stays black/white; Fyll lime only marks actions.


const STATUS_LABEL: Record<SocialCheckoutStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  payment_submitted: 'Needs review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const normalizeStatusName = (value?: string | null) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);

const getVerifiedOrderStatus = (statuses: { name: string; trackingStage?: string }[]) => (
  statuses.find((status) => normalizeStatusName(status.name) === 'processing')?.name?.trim()
  || statuses.find((status) => status.trackingStage === 'processing')?.name?.trim()
  || 'Processing'
);

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

type PaymentSource = 'social_checkout' | 'storefront' | 'fyll_checkout' | 'quote';
type PaymentFilter = null | 'quotes' | 'awaiting' | 'needs_review' | 'confirmed' | 'expired';
type PaymentPeriod = 'all' | 'week' | 'month' | 'year';

type PaymentRecord = {
  id: string;
  source: PaymentSource;
  reference: string;
  orderNumber?: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  // What counts towards the money summary when it differs from the shown amount (quotes: the deposit).
  moneyAmount?: number;
  amountCaption?: string;
  statusLabel: string;
  tone: StatusTone;
  statusGroup: Exclude<PaymentFilter, null | 'quotes'>;
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
  // Pending payment links only: stops the link from taking payments without deleting the record.
  deactivateAction?: {
    onDeactivate: () => void;
  };
  // Pending payment links: the customer paid but never uploaded a receipt.
  markReceivedAction?: {
    onMarkReceived: () => void;
  };
};

type MenuAnchor = { x: number; y: number; width: number; height: number };

const SOCIAL_STATUS_TONE: Record<SocialCheckoutStatus, StatusTone> = {
  awaiting_payment: 'awaiting',
  payment_submitted: 'review',
  verified: 'verified',
  rejected: 'rejected',
  cancelled: 'closed',
  expired: 'closed',
};

const QUOTE_STATUS_GROUP: Record<QuoteStatus, Exclude<PaymentFilter, null | 'quotes'>> = {
  sent: 'awaiting',
  changes_requested: 'awaiting',
  accepted: 'awaiting',
  proof_submitted: 'needs_review',
  proof_rejected: 'awaiting',
  order_created: 'confirmed',
  declined: 'expired',
  expired: 'expired',
  cancelled: 'expired',
};

const STOREFRONT_STATUS_TONE: Record<StorefrontPaymentStatus, StatusTone> = {
  pending: 'awaiting',
  proof_submitted: 'review',
  confirmed: 'verified',
  verified: 'verified',
  rejected: 'rejected',
  failed: 'rejected',
  refunded: 'closed',
};

function SourceIcon({ source, color, size = 12 }: { source: PaymentSource; color: string; size?: number }) {
  const Icon = source === 'social_checkout' ? Link2 : source === 'quote' ? FileText : Store;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

const SOURCE_LABEL: Record<PaymentSource, string> = {
  social_checkout: 'Payment link',
  quote: 'Quote',
  storefront: 'Storefront',
  fyll_checkout: 'Fyll Checkout',
};

function ConfirmPill({ action, compact = false }: { action: NonNullable<PaymentRecord['confirmAction']>; compact?: boolean }) {
  const fs = useMobileFont();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Confirm payment"
      onPress={(event) => {
        event.stopPropagation?.();
        action.onConfirm();
      }}
      disabled={action.isConfirming}
      style={(state) => ({
        height: compact ? 28 : 30,
        paddingHorizontal: 12,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
        opacity: state.pressed ? 0.8 : 1,
      })}
    >
      {action.isConfirming ? (
        <ActivityIndicator size="small" color={FYLL_LIME_INK} />
      ) : (
        <>
          <Check size={13} color={FYLL_LIME_INK} strokeWidth={2.6} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: fs(12.5), fontWeight: '600' }}>Confirm</Text>
        </>
      )}
    </Pressable>
  );
}

function PaymentListRow({
  record,
  palette,
  isFirst,
  onOpenActions,
}: {
  record: PaymentRecord;
  palette: PaymentsPalette;
  isFirst: boolean;
  onOpenActions: (record: PaymentRecord, anchor?: MenuAnchor) => void;
}) {
  const fs = useMobileFont();
  const unsuccessful = isUnsuccessfulTone(record.tone);
  const hasMoreActions = Boolean(record.editAction || record.deleteAction || record.confirmAction || record.deactivateAction || record.markReceivedAction);
  const kebabRef = React.useRef<View>(null);
  const openFromKebab = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!kebabRef.current) { onOpenActions(record); return; }
    kebabRef.current.measureInWindow((x, y, width, height) => onOpenActions(record, { x, y, width, height }));
  };
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        record.onPress();
      }}
      onLongPress={hasMoreActions ? () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        openFromKebab();
      } : undefined}
      delayLongPress={350}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: palette.hairline,
        opacity: state.pressed ? 0.7 : 1,
      })}
    >
      <InitialsAvatar name={record.customerName} palette={palette} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, color: palette.text, fontSize: fs(15), fontWeight: '500' }} numberOfLines={1}>
            {record.customerName && record.customerName !== '—' ? formatPersonName(record.customerName) : 'Awaiting customer'}
          </Text>
          <Text
            style={{
              color: unsuccessful ? palette.faint : palette.text,
              fontSize: fs(15),
              fontWeight: '600',
              textDecorationLine: unsuccessful ? 'line-through' : 'none',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatCurrency(record.amount)}
          </Text>
          {hasMoreActions ? (
            <Pressable
              ref={kebabRef}
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${record.reference}`}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation?.();
                openFromKebab();
              }}
              style={{ width: 24, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: -6 }}
            >
              <MoreVertical size={17} color={palette.faint} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SourceIcon source={record.source} color={palette.faint} />
            <Text style={{ flex: 1, color: palette.faint, fontSize: fs(12.5) }} numberOfLines={1}>
              {record.reference} · {record.orderNumber ?? 'No order yet'}
            </Text>
          </View>
          <StatusDot tone={record.tone} label={record.statusLabel} palette={palette} />
        </View>
        {record.amountCaption || record.confirmAction ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={{ color: palette.faint, fontSize: fs(12) }} numberOfLines={1}>{record.amountCaption ?? 'Receipt uploaded'}</Text>
            {record.confirmAction ? <ConfirmPill action={record.confirmAction} compact /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const DESKTOP_COLUMNS = {
  customer: { flex: 1.5, minWidth: 200 },
  reference: { flex: 1.15, minWidth: 140 },
  order: { flex: 0.9, minWidth: 104 },
  amount: { flex: 0.9, minWidth: 110 },
  source: { flex: 1, minWidth: 128 },
  status: { flex: 1, minWidth: 128 },
  date: { flex: 0.8, minWidth: 96 },
  actions: { flex: 0.9, minWidth: 120 },
} as const;

function PaymentTableRow({ record, palette, isLast, onOpenActions }: { record: PaymentRecord; palette: PaymentsPalette; isLast: boolean; onOpenActions: (record: PaymentRecord, anchor?: MenuAnchor) => void }) {
  const fs = useMobileFont();
  const unsuccessful = isUnsuccessfulTone(record.tone);
  const hasMoreActions = Boolean(record.editAction || record.deleteAction || record.deactivateAction || record.markReceivedAction);
  const kebabRef = React.useRef<View>(null);
  const openMenu = () => {
    if (!kebabRef.current) { onOpenActions(record); return; }
    kebabRef.current.measureInWindow((x, y, width, height) => onOpenActions(record, { x, y, width, height }));
  };
  return (
    <Pressable
      onPress={record.onPress}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 60,
        paddingHorizontal: 20,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: palette.hairline,
        backgroundColor: isHovered(state) ? palette.cardHover : 'transparent',
      })}
    >
      <View style={{ ...DESKTOP_COLUMNS.customer, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10 }}>
        <InitialsAvatar name={record.customerName} palette={palette} size={32} />
        <Text style={{ flex: 1, color: palette.text, fontSize: fs(14), fontWeight: '500' }} numberOfLines={1}>
          {record.customerName && record.customerName !== '—' ? formatPersonName(record.customerName) : 'Awaiting customer'}
        </Text>
      </View>
      <Text style={{ ...DESKTOP_COLUMNS.reference, color: palette.textSoft, fontSize: fs(13.5), paddingRight: 10 }} numberOfLines={1}>{record.reference}</Text>
      <Text style={{ ...DESKTOP_COLUMNS.order, color: record.orderNumber ? palette.textSoft : palette.faint, fontSize: fs(13.5), paddingRight: 10 }} numberOfLines={1}>
        {record.orderNumber ?? 'No order yet'}
      </Text>
      <View style={{ ...DESKTOP_COLUMNS.amount, paddingRight: 10 }}>
        <Text style={{ color: unsuccessful ? palette.faint : palette.text, fontSize: fs(14), fontWeight: '600', textDecorationLine: unsuccessful ? 'line-through' : 'none', fontVariant: ['tabular-nums'] }}>
          {formatCurrency(record.amount)}
        </Text>
        {record.amountCaption ? <Text style={{ color: palette.faint, fontSize: fs(11), marginTop: 2 }} numberOfLines={1}>{record.amountCaption}</Text> : null}
      </View>
      <View style={{ ...DESKTOP_COLUMNS.source, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10 }}>
        <SourceIcon source={record.source} color={palette.faint} size={13} />
        <Text style={{ color: palette.muted, fontSize: fs(13) }} numberOfLines={1}>{SOURCE_LABEL[record.source]}</Text>
      </View>
      <View style={{ ...DESKTOP_COLUMNS.status, paddingRight: 10 }}>
        <StatusDot tone={record.tone} label={record.statusLabel} palette={palette} />
      </View>
      <Text style={{ ...DESKTOP_COLUMNS.date, color: palette.faint, fontSize: fs(13), paddingRight: 10 }} numberOfLines={1}>{record.createdLabel}</Text>
      <View style={{ ...DESKTOP_COLUMNS.actions, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        {record.confirmAction ? <ConfirmPill action={record.confirmAction} compact /> : null}
        {hasMoreActions ? (
          <Pressable
            ref={kebabRef}
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${record.reference}`}
            onPress={(event) => {
              event.stopPropagation?.();
              openMenu();
            }}
            style={(state) => ({
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent',
            })}
          >
            {record.deleteAction?.isDeleting ? (
              <ActivityIndicator size="small" color={palette.danger} />
            ) : (
              <MoreVertical size={16} color={palette.faint} strokeWidth={2.2} />
            )}
          </Pressable>
        ) : null}
        {!record.confirmAction && !hasMoreActions ? <Text style={{ color: palette.faint, fontSize: fs(13) }}>—</Text> : null}
      </View>
    </Pressable>
  );
}

const MENU_WIDTH = 230;
const MENU_HEIGHT_ESTIMATE = 230;

function PaymentActionSheet({ record, anchor, palette, onClose }: { record: PaymentRecord | null; anchor: MenuAnchor | null; palette: PaymentsPalette; onClose: () => void }) {
  const fs = useMobileFont();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  if (!record) return null;
  const run = (action?: () => void) => {
    onClose();
    action?.();
  };
  const optionStyle = (state: PressableStateCallbackType) => ({
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: state.pressed || isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.06)' : '#F4F4F4') : 'transparent',
  });
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }}>
        <Pressable
          onPress={(event) => event.stopPropagation?.()}
          style={{
            position: 'absolute',
            width: MENU_WIDTH,
            left: Math.max(12, Math.min(windowWidth - MENU_WIDTH - 12, (anchor ? anchor.x + anchor.width : windowWidth - 12) - MENU_WIDTH)),
            // Drops just under the kebab; flips above it when there is no room below.
            ...(anchor && anchor.y + anchor.height + 8 + MENU_HEIGHT_ESTIMATE > windowHeight - insets.bottom
              ? { bottom: Math.max(insets.bottom, windowHeight - anchor.y + 4) }
              : { top: anchor ? anchor.y + anchor.height + 4 : insets.top + 80 }),
            backgroundColor: palette.card,
            borderRadius: 16,
            padding: 6,
            borderWidth: 1,
            borderColor: palette.border,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 }}>
            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
              {record.customerName && record.customerName !== '—' ? formatPersonName(record.customerName) : 'Awaiting customer'} · {formatCurrency(record.amount)}
            </Text>
            <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>{record.reference}</Text>
          </View>
          {record.confirmAction ? (
            <Pressable onPress={() => run(record.confirmAction?.onConfirm)} style={optionStyle}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={12} color={FYLL_LIME_INK} strokeWidth={2.6} />
              </View>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Confirm payment</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => run(record.onPress)} style={optionStyle}>
            <ChevronRight size={12} color={palette.muted} strokeWidth={2} style={{ marginHorizontal: 4 }} />
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }}>Open payment</Text>
          </Pressable>
          {record.editAction ? (
            <Pressable onPress={() => run(record.editAction?.onEdit)} style={optionStyle}>
              <Pencil size={12} color={palette.muted} strokeWidth={2.2} style={{ marginHorizontal: 4 }} />
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }}>Edit</Text>
            </Pressable>
          ) : null}
          {record.markReceivedAction ? (
            <Pressable onPress={() => run(record.markReceivedAction?.onMarkReceived)} style={optionStyle}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={12} color={FYLL_LIME_INK} strokeWidth={2.6} />
              </View>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Mark as received</Text>
            </Pressable>
          ) : null}
          {record.deactivateAction ? (
            <Pressable onPress={() => run(record.deactivateAction?.onDeactivate)} style={optionStyle}>
              <Link2Off size={12} color={palette.warn} strokeWidth={2.2} style={{ marginHorizontal: 4 }} />
              <Text style={{ color: palette.warn, fontSize: 12, fontWeight: '500' }}>Deactivate link</Text>
            </Pressable>
          ) : null}
          {record.deleteAction ? (
            <Pressable onPress={() => run(record.deleteAction?.onDelete)} style={optionStyle}>
              <Trash2 size={12} color={palette.danger} strokeWidth={2.2} style={{ marginHorizontal: 4 }} />
              <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '500' }}>Delete</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDayHeading(iso: string) {
  const created = new Date(iso);
  if (!Number.isFinite(created.getTime())) return 'Earlier';
  const today = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(today) - startOfDay(created)) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return created.toLocaleDateString('en-GB', created.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
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
  const fs = useMobileFont();
  const router = useRouter();
  const { seedFyllCheckout } = useLocalSearchParams<{ seedFyllCheckout?: string | string[] }>();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const pageHeadingStyle = usePageHeadingStyle(isMobile);
  const palette = usePaymentsPalette();
  // Table header colour is shared with the Orders / Cases / Partners tables.
  const tableHeaderColor = useThemeColors().text.muted;
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? 'Staff');
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const cachedOrders = useFyllStore((s) => s.orders);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentFilter>(null);
  const [paymentPeriod, setPaymentPeriod] = useState<PaymentPeriod>('all');
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [actionRecord, setActionRecord] = useState<PaymentRecord | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MenuAnchor | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState<boolean>(false);
  const quotesQuery = useQuotes();
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
    queryKey: getSocialCheckoutQueryKey(businessId),
    queryFn: () => fetchSocialCheckoutDrafts(businessId!),
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
    initialData: cachedOrders.length > 0 ? cachedOrders : undefined,
    initialDataUpdatedAt: 0,
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
      const linkedOrder = (ordersQuery.data ?? []).find((order) => (
        order.id === payment.linkedOrderId
        || order.id === payment.sourceOrderId
        || order.orderNumber === payment.linkedOrderNumber
        || order.websiteOrderReference === payment.sourceOrderId
        || order.fyllCheckout?.reference === payment.sourceOrderId
      ));
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
          showFyllCheckoutSyncFailedNotice(payment.sourceOrderId, error);
        }
      }

      // A Fyll Checkout payment can still belong to a storefront order that was
      // mirrored into WooCommerce. Confirm the checkout and advance that Woo
      // order as two independent steps instead of treating them as exclusive.
      if (linkedOrder?.websiteOrderReference) {
        try {
          await syncFyllOrderStatusToWooCommerce({
            businessId: businessId!,
            orderId: linkedOrder.id,
            status: nextStatus,
          });
        } catch (error) {
          console.warn('WooCommerce status sync failed after storefront payment approval:', error);
          showFyllCheckoutSyncFailedNotice(payment.sourceOrderId, error);
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

  const deactivateLinkMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const draft = (draftsQuery.data ?? []).find((item) => item.id === draftId);
      if (!draft || !businessId) throw new Error('Payment link not found');
      const now = new Date().toISOString();
      await supabaseData.upsertCollection('social_checkouts', businessId, [{
        ...draft,
        status: 'cancelled',
        reviewedBy: currentUserName,
        reviewedAt: draft.reviewedAt ?? now,
        updatedAt: now,
      }]);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['social-checkouts', businessId] });
    },
    onError: () => Alert.alert('Could not deactivate link', 'Please check your connection and try again.'),
  });

  const markReceivedMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const draft = (draftsQuery.data ?? []).find((item) => item.id === draftId);
      if (!draft || !businessId) throw new Error('Payment link not found');
      const now = new Date().toISOString();
      await supabaseData.upsertCollection('social_checkouts', businessId, [{
        ...draft,
        status: 'verified',
        manuallyConfirmed: true,
        reviewedBy: currentUserName,
        reviewedAt: now,
        activityLog: [
          ...(draft.activityLog ?? []),
          { id: `social-payment-manual-${now}`, action: 'Marked as received manually (no receipt submitted)', actor: currentUserName, createdAt: now },
        ],
        updatedAt: now,
      }]);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['social-checkouts', businessId] });
    },
    onError: () => Alert.alert('Could not confirm payment', 'Please check your connection and try again.'),
  });

  const handleMarkReceived = (draftId: string, reference: string) => {
    if (markReceivedMutation.isPending) return;
    const run = () => markReceivedMutation.mutate(draftId);
    const message = `Only do this once you have seen the money in your account. ${reference} will show as Verified.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`Mark ${reference} as received? ${message}`)) run();
      return;
    }
    Alert.alert('Mark payment as received?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark as received', onPress: run },
    ]);
  };

  const handleDeactivateLink = (draftId: string, reference: string) => {
    if (deactivateLinkMutation.isPending) return;
    const run = () => deactivateLinkMutation.mutate(draftId);
    if (Platform.OS === 'web') {
      if (window.confirm(`Deactivate ${reference}? The customer will no longer be able to pay with this link.`)) run();
      return;
    }
    Alert.alert('Deactivate payment link?', `${reference} will stop accepting payments. The record stays in your list as Cancelled.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: run },
    ]);
  };

  const drafts = draftsQuery.data ?? [];
  const storefrontPayments = sharedPaymentsQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const periodQuotes = useMemo(() => (
    quotes.filter((quote) => isPaymentInPeriod(quote.createdAt, paymentPeriod))
  ), [quotes, paymentPeriod]);
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
      all: periodDrafts.length + periodStorefrontPayments.length + periodQuotes.length,
      quotes: periodQuotes.length,
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
    periodQuotes.forEach((quote) => {
      const group = QUOTE_STATUS_GROUP[getQuoteEffectiveStatus(quote)];
      result[group] += 1;
    });
    return result;
  }, [periodDrafts, periodQuotes, periodStorefrontPayments]);

  const paymentRecordsInPeriod = useMemo<PaymentRecord[]>(() => {
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
        tone: SOCIAL_STATUS_TONE[effectiveStatus],
        statusGroup,
        createdAt: draft.createdAt,
        createdLabel: formatCreatedDate(draft.createdAt),
        onPress: () => router.push(`/social-checkout/${draft.id}` as never),
        editAction: currentUserRole === 'admin' && effectiveStatus !== 'expired' && effectiveStatus !== 'rejected' && effectiveStatus !== 'cancelled'
          ? { onEdit: () => router.push(`/social-checkout/${draft.id}` as never) }
          : undefined,
        markReceivedAction: effectiveStatus === 'awaiting_payment'
          ? { onMarkReceived: () => handleMarkReceived(draft.id, `SC-${draft.id}`) }
          : undefined,
        deactivateAction: effectiveStatus === 'awaiting_payment'
          ? { onDeactivate: () => handleDeactivateLink(draft.id, `SC-${draft.id}`) }
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
        tone: STOREFRONT_STATUS_TONE[paymentStatus],
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

    const quoteRecords = periodQuotes.map((quote): PaymentRecord => {
      const quoteStatus = getQuoteEffectiveStatus(quote);
      const group = QUOTE_STATUS_GROUP[quoteStatus];
      const quoteTone = QUOTE_STATUS_TONE[quoteStatus];
      return {
        id: `quote-${quote.id}`,
        source: 'quote',
        reference: quote.quoteNumber,
        orderNumber: quote.convertedOrderNumber,
        customerName: quote.customerName || '—',
        customerPhone: quote.customerPhone,
        amount: quote.total,
        moneyAmount: group === 'expired' ? 0 : quote.depositAmount,
        amountCaption: quoteStatus === 'order_created' || group === 'expired'
          ? undefined
          : `${quote.depositPercent >= 100 ? 'Pay in full' : `Deposit ${formatCurrency(quote.depositAmount)}`}`,
        statusLabel: QUOTE_STATUS_LABEL[quoteStatus],
        tone: quoteTone === 'neutral' ? 'awaiting' : quoteTone,
        statusGroup: group,
        createdAt: quote.createdAt,
        createdLabel: formatCreatedDate(quote.createdAt),
        onPress: () => router.push(`/quote/${quote.id}` as never),
        editAction: ['sent', 'changes_requested', 'declined', 'expired'].includes(quoteStatus)
          ? { onEdit: () => router.push(`/quote/new?id=${quote.id}` as never) }
          : undefined,
      };
    });

    return [...socialRecords, ...storefrontRecords, ...quoteRecords]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [confirmStorefrontPaymentMutation, currentUserRole, deletePaymentRecordMutation, orderLookup, periodDrafts, periodQuotes, periodStorefrontPayments, router]);

  const paymentRecords = useMemo<PaymentRecord[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return paymentRecordsInPeriod
      .filter((record) => !statusFilter || (statusFilter === 'quotes' ? record.source === 'quote' : record.statusGroup === statusFilter))
      .filter((record) => {
        if (!query) return true;
        return (
          record.reference.toLowerCase().includes(query)
          || (record.orderNumber ?? '').toLowerCase().includes(query)
          || (record.source === 'storefront' && record.id.toLowerCase().includes(query))
          || record.customerName.toLowerCase().includes(query)
          || (record.customerPhone ?? '').includes(query)
        );
      });
  }, [paymentRecordsInPeriod, searchQuery, statusFilter]);

  const handleNewLink = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/social-checkout/new' as never);
  };

  const filterChips: { key: PaymentFilter; label: string; count: number }[] = [
    { key: null, label: 'All', count: counts.all },
    { key: 'quotes', label: 'Quotes', count: counts.quotes ?? 0 },
    { key: 'awaiting', label: 'Awaiting payment', count: counts.awaiting ?? 0 },
    { key: 'needs_review', label: 'Needs review', count: counts.needs_review ?? 0 },
    { key: 'confirmed', label: 'Verified', count: counts.confirmed ?? 0 },
    { key: 'expired', label: 'Rejected & expired', count: counts.expired ?? 0 },
  ];
  const onSelectChip = (key: PaymentFilter) => {
    Haptics.selectionAsync();
    setStatusFilter(key);
  };
  const contentMaxWidth = isWebDesktop ? 1456 : isDesktop ? 980 : undefined;
  const contentPaddingBottom = (isDesktop ? 32 : 24) + tabBarHeight;
  const isInitialPaymentsLoading = (draftsQuery.isPending || ordersQuery.isPending || sharedPaymentsQuery.isPending)
    && drafts.length === 0
    && storefrontPayments.length === 0;

  const unpaidRecords = paymentRecordsInPeriod.filter((record) => record.statusGroup === 'awaiting' && record.source !== 'quote');
  const reviewRecords = paymentRecordsInPeriod.filter((record) => record.statusGroup === 'needs_review');
  const sumAmounts = (records: PaymentRecord[]) => records.reduce((sum, record) => sum + (record.moneyAmount ?? record.amount), 0);
  const verifiedAmount = sumAmounts(paymentRecordsInPeriod.filter((record) => record.statusGroup === 'confirmed'));
  const reviewAmount = sumAmounts(reviewRecords);
  const unpaidAmount = sumAmounts(unpaidRecords);
  const attention = reviewRecords.length > 0
    ? {
      filter: 'needs_review' as const,
      title: `${reviewRecords.length} ${reviewRecords.length === 1 ? 'payment needs' : 'payments need'} review`,
      caption: `${formatCurrency(reviewAmount)} · check the receipt and confirm`,
    }
    : unpaidRecords.length > 0
      ? {
        filter: 'awaiting' as const,
        title: `${unpaidRecords.length} ${unpaidRecords.length === 1 ? 'link' : 'links'} still unpaid`,
        caption: `${formatCurrency(unpaidAmount)} · send the customer a reminder`,
      }
      : null;

  const dayGroups = paymentRecords.reduce<{ day: string; rows: PaymentRecord[] }[]>((groups, record) => {
    const day = formatDayHeading(record.createdAt);
    const existing = groups.find((group) => group.day === day);
    if (existing) existing.rows.push(record);
    else groups.push({ day, rows: [record] });
    return groups;
  }, []);

  const periodOptions: { key: PaymentPeriod; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];
  // Matches the payment detail page so both screens line up on desktop.
  const horizontalPadding = isMobile ? 16 : isDesktop ? 28 : 20;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.page }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          style={{
            paddingHorizontal: horizontalPadding,
            paddingTop: isWebDesktop ? 28 : 14,
            paddingBottom: 14,
            maxWidth: contentMaxWidth,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : isDesktop ? 'center' : undefined,
            minHeight: isWebDesktop ? DESKTOP_PAGE_HEADER_MIN_HEIGHT : undefined,
            flexDirection: 'row',
            alignItems: isMobile ? 'center' : 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, ...pageHeadingStyle }} numberOfLines={1}>Payments</Text>
            {!isMobile ? (
              <Text style={{ color: palette.muted, fontSize: fs(14), lineHeight: 20, marginTop: 4 }}>
                Storefront payments and payment links in one view.
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isDesktop && currentUserRole === 'admin' ? (
              <Pressable
                onPress={() => router.push('/payment-accounts' as never)}
                style={(state) => ({
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: isHovered(state) ? palette.cardHover : palette.card,
                })}
              >
                <Landmark size={16} color={palette.text} strokeWidth={2} />
                <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '500' }}>Bank accounts</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create"
              accessibilityState={{ expanded: createMenuOpen }}
              onPress={() => setCreateMenuOpen((open) => !open)}
              style={(state) => ({
                height: 40,
                paddingHorizontal: 16,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
                opacity: state.pressed ? 0.85 : 1,
              })}
            >
              <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
              <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14), fontWeight: '600' }}>{isMobile ? 'New' : 'New payment'}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: palette.page }}
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            maxWidth: contentMaxWidth,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : isDesktop ? 'center' : undefined,
            paddingBottom: contentPaddingBottom,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={draftsQuery.isRefetching || ordersQuery.isRefetching || sharedPaymentsQuery.isRefetching}
              onRefresh={() => {
                draftsQuery.refetch();
                ordersQuery.refetch();
                sharedPaymentsQuery.refetch();
              }}
              tintColor={palette.faint}
            />
          }
        >
          {isInitialPaymentsLoading ? (
            <PaymentListSkeleton isDesktop={isDesktop} />
          ) : (
            <View style={{ gap: 14, flexGrow: paymentRecords.length === 0 ? 1 : undefined }}>
              <View
                accessibilityRole="tablist"
                style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border, maxWidth: isDesktop ? 360 : undefined }}
              >
                {periodOptions.map((option) => {
                  const selected = paymentPeriod === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPaymentPeriod(option.key);
                      }}
                      style={(state) => ({
                        flex: 1,
                        height: 34,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? FYLL_LIME : isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent',
                      })}
                    >
                      <Text style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: isMobile ? 12 : 14, fontWeight: '600' }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View
                accessibilityLabel="Summary"
                style={{
                  borderRadius: 20,
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingVertical: isDesktop ? 20 : 18,
                  paddingHorizontal: isDesktop ? 22 : 18,
                  flexDirection: isDesktop ? 'row' : 'column',
                  alignItems: isDesktop ? 'center' : 'stretch',
                  gap: isDesktop ? 0 : 14,
                }}
              >
                <View style={{ flex: isDesktop ? 1.6 : undefined, gap: 4, paddingRight: isDesktop ? 24 : 0 }}>
                  <Text style={{ color: palette.muted, fontSize: fs(12), fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Verified</Text>
                  <MoneyText style={{ color: palette.text, fontSize: 34, lineHeight: 40, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrency(verifiedAmount)}
                  </MoneyText>
                  <Text style={{ color: palette.faint, fontSize: fs(13) }}>Storefront orders and payment links</Text>
                </View>
                {!isDesktop ? <View style={{ height: 1, backgroundColor: palette.hairline }} /> : null}
                <View style={{ flex: isDesktop ? 2.4 : undefined, flexDirection: 'row', gap: isDesktop ? 0 : 12 }}>
                  {[
                    { key: 'review', label: 'Needs review', value: formatCurrency(reviewAmount), dot: palette.tones.review.dot, filter: 'needs_review' as const },
                    { key: 'unpaid', label: 'Unpaid', value: formatCurrency(unpaidAmount), dot: palette.tones.awaiting.dot, filter: 'awaiting' as const },
                    ...(isDesktop ? [{ key: 'records', label: 'Records', value: String(counts.all), dot: undefined, filter: null }] : []),
                  ].map((metric) => (
                    <Pressable
                      key={metric.key}
                      accessibilityRole="button"
                      accessibilityHint={metric.filter ? 'Shows only these payments' : 'Shows all payments'}
                      onPress={() => onSelectChip(metric.filter)}
                      style={(state) => ({
                        flex: 1,
                        gap: 3,
                        paddingVertical: isDesktop ? 6 : 0,
                        paddingLeft: isDesktop ? 22 : 0,
                        borderLeftWidth: isDesktop ? 1 : 0,
                        borderLeftColor: palette.hairline,
                        opacity: state.pressed ? 0.7 : isHovered(state) ? 0.85 : 1,
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {metric.dot ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: metric.dot }} /> : null}
                        <Text style={{ color: palette.muted, fontSize: fs(12) }}>{metric.label}</Text>
                      </View>
                      <Text style={{ color: palette.text, fontSize: isDesktop ? 22 : 18, fontWeight: '600', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{metric.value}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {attention ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Shows only these payments"
                  onPress={() => onSelectChip(attention.filter)}
                  style={(state) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    backgroundColor: isHovered(state) ? (palette.isDark ? 'rgba(213,224,87,0.15)' : 'rgba(213,224,87,0.24)') : palette.nudgeBg,
                    borderWidth: 1,
                    borderColor: palette.nudgeBorder,
                    opacity: state.pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1, gap: 1, flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : undefined, columnGap: 10 }}>
                    <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{attention.title}</Text>
                    <Text style={{ color: palette.nudgeSub, fontSize: fs(12.5), flexShrink: 1 }} numberOfLines={1}>{attention.caption}</Text>
                  </View>
                  {isDesktop ? <Text style={{ color: palette.isDark ? FYLL_LIME : '#5B6A0E', fontSize: fs(13), fontWeight: '600' }}>View</Text> : null}
                  <ChevronRight size={16} color={palette.isDark ? FYLL_LIME : '#5B6A0E'} strokeWidth={2.2} />
                </Pressable>
              ) : null}

              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : undefined, gap: isDesktop ? 12 : 14 }}>
                <View
                  style={{
                    height: 48,
                    width: isDesktop ? 340 : '100%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: 18,
                    paddingRight: 10,
                    borderRadius: 999,
                    backgroundColor: palette.inputBg,
                    borderWidth: 1,
                    borderColor: searchFocused ? (palette.isDark ? 'rgba(213,224,87,0.6)' : '#111111') : palette.border,
                  }}
                >
                  <Search size={18} color={palette.faint} strokeWidth={2} />
                  <TextInput
                    accessibilityLabel="Search payments"
                    placeholder="Search payments, orders, customers"
                    placeholderTextColor={palette.faint}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    style={[{ flex: 1, height: 46, marginLeft: 10, paddingVertical: 0, color: palette.text, fontSize: fs(15) }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                    selectionColor={palette.text}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, flexShrink: 1, marginRight: isMobile ? -horizontalPadding : 0 }}
                  contentContainerStyle={{ gap: 8, paddingRight: isMobile ? horizontalPadding : 4 }}
                >
                  {filterChips.map((chip) => {
                    const isActive = statusFilter === chip.key;
                    return (
                      <Pressable
                        key={chip.label}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        onPress={() => onSelectChip(chip.key)}
                        style={(state) => ({
                          height: 36,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          borderWidth: 1,
                          borderColor: isActive ? FYLL_LIME : palette.isDark ? 'rgba(255,255,255,0.12)' : '#E2E2E2',
                          backgroundColor: isActive ? FYLL_LIME : isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.05)' : '#F6F6F6') : 'transparent',
                        })}
                      >
                        <Text style={{ color: isActive ? FYLL_LIME_INK : palette.textSoft, fontSize: 12, fontWeight: '600' }}>{chip.label}</Text>
                        {chip.count > 0 ? (
                          <Text style={{ color: isActive ? FYLL_LIME_INK : palette.textSoft, opacity: 0.55, fontSize: 12, fontWeight: '600' }}>{chip.count}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {paymentRecords.length === 0 ? (
                // Same empty state as Orders: first-run copy, a way out of a filter, centred in the space left.
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: isMobile ? 36 : 56 }}>
                  <EmptyState
                    icon={Wallet}
                    title={searchQuery.trim() || statusFilter ? 'No matching payments' : 'Your first payment starts here'}
                    description={searchQuery.trim() || statusFilter
                      ? 'Try clearing your search and filters to see every payment again.'
                      : 'Payments from your storefront orders and the payment links you send will show up here.'}
                    actionLabel={searchQuery.trim() || statusFilter ? 'Clear filters' : 'Create payment link'}
                    actionIcon={searchQuery.trim() || statusFilter ? X : Plus}
                    onAction={searchQuery.trim() || statusFilter
                      ? () => { setSearchQuery(''); setStatusFilter(null); }
                      : handleNewLink}
                  />
                </View>
              ) : isDesktop ? (
                <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                    {([
                      ['customer', 'Customer'],
                      ['reference', 'Reference'],
                      ['order', 'Order'],
                      ['amount', 'Amount'],
                      ['source', 'Source'],
                      ['status', 'Status'],
                      ['date', 'Date'],
                      ['actions', ''],
                    ] as const).map(([key, label]) => (
                      <Text
                        key={key}
                        style={{ ...DESKTOP_COLUMNS[key], color: tableHeaderColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingRight: 10, textAlign: key === 'actions' ? 'right' : 'left' }}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                  {dayGroups.map((group, groupIndex) => (
                    <React.Fragment key={group.day}>
                      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, backgroundColor: palette.isDark ? '#101010' : '#F7F7F7', borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                        <Text style={{ color: palette.textSoft, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{group.day}</Text>
                      </View>
                      {group.rows.map((record, rowIndex) => (
                        <PaymentTableRow
                          key={record.id}
                          record={record}
                          palette={palette}
                          isLast={groupIndex === dayGroups.length - 1 && rowIndex === group.rows.length - 1}
                          onOpenActions={(record, anchor) => { setActionAnchor(anchor ?? null); setActionRecord(record); }}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </View>
              ) : (
                <View style={{ gap: 18, marginTop: 4 }}>
                  {dayGroups.map((group) => (
                    <View key={group.day} style={{ gap: 8 }}>
                      <Text style={{ paddingHorizontal: 4, color: palette.faint, fontSize: fs(12), fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{group.day}</Text>
                      <View style={{ borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14 }}>
                        {group.rows.map((record, index) => (
                          <PaymentListRow key={record.id} record={record} palette={palette} isFirst={index === 0} onOpenActions={(record, anchor) => { setActionAnchor(anchor ?? null); setActionRecord(record); }} />
                        ))}
                      </View>
                    </View>
                  ))}
                  {paymentRecords.some((record) => record.editAction || record.deleteAction) ? (
                    <Text style={{ color: palette.faint, fontSize: fs(12), textAlign: 'center', marginTop: 2 }}>Tap ⋮ on a payment for more actions</Text>
                  ) : null}
                </View>
              )}
            </View>
          )}
        </ScrollView>
        {isMobile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create"
            accessibilityState={{ expanded: createMenuOpen }}
            onPress={() => setCreateMenuOpen((open) => !open)}
            style={(state) => [
              {
                position: 'absolute',
                zIndex: 70,
                right: 20,
                bottom: Math.max(96, tabBarHeight - 48),
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                transform: [{ scale: state.pressed ? 0.94 : 1 }],
              },
              Platform.OS === 'web'
                ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
                : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
            ]}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} style={{ transform: [{ rotate: createMenuOpen ? '45deg' : '0deg' }] }} />
          </Pressable>
        ) : null}
        <PaymentsCreateMenu
          open={createMenuOpen}
          onClose={() => setCreateMenuOpen(false)}
          onNewQuote={() => router.push('/quote/new' as never)}
          onNewBill={handleNewLink}
          placement={isMobile
            ? { right: 20, bottom: Math.max(96, tabBarHeight - 48) + 68 }
            : { right: horizontalPadding, top: isWebDesktop ? 76 : 64 }}
        />
        <PaymentActionSheet record={actionRecord} anchor={actionAnchor} palette={palette} onClose={() => setActionRecord(null)} />
      </SafeAreaView>
    </View>
  );
}
