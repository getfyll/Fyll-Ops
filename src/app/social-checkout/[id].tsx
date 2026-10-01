import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, ActivityIndicator, Platform, Alert, TextInput, Linking, type PressableStateCallbackType } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, FileText, Landmark, Link2, Mail, MapPin, MessageCircle, MoreHorizontal, Package, Pencil, Phone, Power, Save, Trash2, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import useAuthStore from '@/lib/state/auth-store';
import { queueSocialCheckoutEmail } from '@/lib/supabase/social-checkout-emails';
import useFyllStore, {
  formatCurrency,
  getSocialCheckoutEffectiveStatus,
  SOCIAL_CHECKOUT_EXPIRY_MS,
  type BankAccount,
  type Order,
  type SocialCheckoutDraft,
} from '@/lib/state/fyll-store';
import { supabaseData } from '@/lib/supabase/data';
import { supabaseSettings } from '@/lib/supabase/settings';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { formatDeliveryLocation } from '@/lib/format-address';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { buildSocialCheckoutUrl } from '@/lib/tracking-url';
import { PaymentDetailSkeleton } from '@/components/SkeletonLoader';
import { SearchClearButton } from '@/components/SearchClearButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, InitialsAvatar, MoneyText, SectionLabel, isHovered, usePaymentsPalette, type StatusTone, useMobileFont } from '@/components/payments/payments-ui';

// Payment link detail: amount + status up top, then what to do next (review
// the receipt, create or link the order), the bill, the link/message to send,
// and the activity trail. Ops stays black/white; lime marks the next action.
//
// Since a draft's billNote is just pasted free text (no structured items —
// see social-checkout/new.tsx), the bill shows that note until an order with
// real line items is linked.

const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : undefined;
const STATUS_LABEL: Record<SocialCheckoutDraft['status'], string> = {
  awaiting_payment: 'Awaiting payment',
  payment_submitted: 'Needs review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const STATUS_TONE: Record<SocialCheckoutDraft['status'], StatusTone> = {
  awaiting_payment: 'awaiting',
  payment_submitted: 'review',
  verified: 'verified',
  rejected: 'rejected',
  cancelled: 'closed',
  expired: 'closed',
};

function confirmDestructiveAction(title: string, message: string, actionLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: onConfirm },
    ]
  );
}

// "Today, 16:25" / "Yesterday, 09:10" / "29 Sept, 16:25" (year added when not this year).
function formatShortTimestamp(iso?: string) {
  if (!iso) return 'Date unavailable';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  const now = new Date();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString('en-GB', date.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day}, ${time}`;
}

export default function SocialCheckoutDetailScreen() {
  const fs = useMobileFont();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { businessName, businessSlug } = useBusinessSettings();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);

  const [draft, setDraft] = useState<SocialCheckoutDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProofLightbox, setShowProofLightbox] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editBillNote, setEditBillNote] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('');
  const [editDeliveryState, setEditDeliveryState] = useState('');
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [refCopied, setRefCopied] = useState<boolean>(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [showMoreActions, setShowMoreActions] = useState<boolean>(false);

  useEffect(() => {
    if (!businessId || !id) return;
    supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId).then((rows) => {
      const found = rows.find((row) => row.id === id)?.data ?? null;
      setDraft(found);
      setIsLoading(false);
    });
  }, [businessId, id]);

  useEffect(() => {
    if (!businessId) return;
    supabaseSettings.fetchSettings<BankAccount>('payment_accounts', businessId).then((rows) => {
      setAccounts(rows.map((row) => row.data));
    });
  }, [businessId]);

  const publicLink = useMemo(() => {
    if (!draft || Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return buildSocialCheckoutUrl({ origin: window.location.origin, businessName, businessSlug, code: draft.id });
  }, [businessName, businessSlug, draft]);

  const resetEditForm = (source: SocialCheckoutDraft) => {
    const matchedAccount = accounts.find((account) =>
      account.bankName === source.bankAccount.bankName
      && account.accountName === source.bankAccount.accountName
      && account.accountNumber === source.bankAccount.accountNumber
    );
    setEditBillNote(source.billNote ?? '');
    setEditAmount(String(source.amount || ''));
    setEditCustomerName(source.customerName ?? '');
    setEditCustomerPhone(source.customerPhone ?? '');
    setEditCustomerEmail(source.customerEmail ?? '');
    setEditDeliveryAddress(source.deliveryAddress ?? '');
    setEditDeliveryState(source.deliveryState ?? '');
    setEditAccountId(matchedAccount?.id ?? null);
  };

  const handleStartEdit = () => {
    if (!draft) return;
    resetEditForm(draft);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (draft) resetEditForm(draft);
    setIsEditing(false);
  };

  const handleCopyPublicLink = async () => {
    if (!publicLink) return;
    await Clipboard.setStringAsync(publicLink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const buildCustomerPaymentMessage = () => {
    if (!draft) return '';
    const checkoutLink = publicLink || `https://fyll.app/checkout?code=${draft.id}`;
    const bill = draft.billNote?.trim() || 'No bill details provided.';

    return [
      'Kindly make payment using the below information.',
      '',
      'Bill',
      bill,
      '',
      `Amount: ${formatCurrency(draft.amount)}`,
      '',
      'Bank Transfer Link',
      checkoutLink,
      '',
      'Your payment link expires in 24 hours.',
    ].join('\n');
  };

  const handleCopyCustomerMessage = async () => {
    const message = buildCustomerPaymentMessage();
    if (!message) return;
    await Clipboard.setStringAsync(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 1800);
  };

  const handleCreateOrderFromPayment = () => {
    if (!draft) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const paymentReference = `SC-${draft.id}`;
    const params = new URLSearchParams();

    Object.entries({
      customerName: draft.customerName ?? '',
      customerPhone: draft.customerPhone ?? '',
      customerEmail: draft.customerEmail ?? '',
      deliveryAddress: draft.deliveryAddress ?? '',
      deliveryState: draft.deliveryState ?? '',
      socialCheckoutReference: paymentReference,
      socialCheckoutBill: draft.billNote?.trim() || 'No bill note provided.',
      socialCheckoutAmount: String(draft.amount),
      source: 'Social Checkout',
      paymentMethod: 'Bank Transfer',
    }).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value);
    });

    router.push(`/new-order?${params.toString()}` as never);
  };

  const handleLinkExistingOrder = async (order: Order) => {
    if (!draft || !businessId) return;
    const updatedAt = new Date().toISOString();
    const updatedDraft: SocialCheckoutDraft = {
      ...draft,
      convertedOrderId: order.id,
      updatedAt,
    };

    await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
    await refreshPaymentQueries();
    setDraft(updatedDraft);
    setShowLinkOrderModal(false);
    setOrderSearchQuery('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleUnlinkOrder = () => {
    if (!draft?.convertedOrderId || !businessId) return;
    const unlink = async () => {
      const updatedDraft: SocialCheckoutDraft = {
        ...draft,
        convertedOrderId: undefined,
        updatedAt: new Date().toISOString(),
      };
      await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
      await refreshPaymentQueries();
      setDraft(updatedDraft);
      queueSocialCheckoutEmail({
        type: 'payment_rejected',
        businessId,
        checkoutCode: draft.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const message = 'This payment link will no longer be attached to the converted order. You can link it to another order afterwards.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) void unlink();
      return;
    }
    Alert.alert('Unlink order?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => { void unlink(); } },
    ]);
  };

  const handleApprovePayment = async () => {
    if (!draft || !businessId || isApproving) return;
    setIsApproving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const approvedAt = new Date().toISOString();
    const updatedDraft: SocialCheckoutDraft = {
      ...draft,
      status: 'verified',
      reviewedBy: currentUser?.name,
      reviewedAt: approvedAt,
      activityLog: [
        ...(draft.activityLog ?? []),
        {
          id: `social-payment-approved-${approvedAt}`,
          action: 'Approved social checkout payment proof',
          actor: currentUser?.name ?? 'Staff',
          createdAt: approvedAt,
        },
      ],
      updatedAt: approvedAt,
    };

    try {
      await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
      await refreshPaymentQueries();
      setDraft(updatedDraft);
      queueSocialCheckoutEmail({
        type: 'payment_confirmed',
        businessId,
        checkoutCode: draft.id,
      });
    } finally {
      setIsApproving(false);
    }
  };

  const performRejectPayment = async () => {
    if (!draft || !businessId || isRejecting) return;
    setIsRejecting(true);
    const rejectedAt = new Date().toISOString();
    const updatedDraft: SocialCheckoutDraft = {
      ...draft,
      status: 'rejected',
      reviewedBy: currentUser?.name,
      reviewedAt: rejectedAt,
      activityLog: [
        ...(draft.activityLog ?? []),
        {
          id: `social-payment-rejected-${rejectedAt}`,
          action: 'Rejected social checkout payment proof',
          actor: currentUser?.name ?? 'Staff',
          createdAt: rejectedAt,
        },
      ],
      updatedAt: rejectedAt,
    };

    try {
      await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
      await refreshPaymentQueries();
      setDraft(updatedDraft);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not reject payment', 'Please check your connection and try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleRejectPayment = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Reject payment proof?\n\nThis marks the social checkout payment proof as rejected in Fyll.')) {
        void performRejectPayment();
      }
      return;
    }

    Alert.alert(
      'Reject payment proof?',
      'This marks the social checkout payment proof as rejected in Fyll.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => { void performRejectPayment(); } },
      ]
    );
  };

  const refreshPaymentQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['social-checkouts', businessId] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-social-checkouts', businessId] }),
    ]);
  };

  const handleSaveEdit = async () => {
    if (!draft || !businessId || isSavingEdit) return;
    const parsedAmount = parseFloat(editAmount.replace(/,/g, '')) || 0;
    if (parsedAmount <= 0) {
      Alert.alert('Amount required', 'Enter a valid payment amount before saving.');
      return;
    }

    const selectedAccount = accounts.find((account) => account.id === editAccountId);
    const nowMs = Date.now();
    const effectiveStatus = getSocialCheckoutEffectiveStatus(draft);
    const updatedAt = new Date(nowMs).toISOString();
    const updatedDraft: SocialCheckoutDraft = {
      ...draft,
      status: effectiveStatus === 'expired' ? 'awaiting_payment' : draft.status,
      billNote: editBillNote.trim(),
      amount: parsedAmount,
      bankAccount: selectedAccount ? {
        bankName: selectedAccount.bankName,
        accountName: selectedAccount.accountName,
        accountNumber: selectedAccount.accountNumber,
      } : draft.bankAccount,
      customerName: editCustomerName.trim() || undefined,
      customerPhone: editCustomerPhone.trim() || undefined,
      customerEmail: editCustomerEmail.trim() || undefined,
      deliveryAddress: editDeliveryAddress.trim() || undefined,
      deliveryState: editDeliveryState.trim() || undefined,
      expiresAt: effectiveStatus === 'expired' ? new Date(nowMs + SOCIAL_CHECKOUT_EXPIRY_MS).toISOString() : draft.expiresAt,
      activityLog: [
        ...(draft.activityLog ?? []),
        {
          id: `social-payment-edit-${updatedAt}`,
          action: `Updated payment amount from ${formatCurrency(draft.amount)} to ${formatCurrency(parsedAmount)}`,
          actor: currentUser?.name ?? 'Staff',
          createdAt: updatedAt,
        },
      ],
      updatedAt,
    };

    setIsSavingEdit(true);
    try {
      await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
      await refreshPaymentQueries();
      setDraft(updatedDraft);
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not save changes', 'Please check your connection and try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const performDeactivateLink = async () => {
    if (!isAdmin) {
      Alert.alert('Admin access required', 'Only admins can deactivate payment links.');
      return;
    }
    if (!draft || !businessId || isDeactivating) return;
    setIsDeactivating(true);
    const now = new Date().toISOString();
    const updatedDraft: SocialCheckoutDraft = {
      ...draft,
      status: 'cancelled',
      reviewedBy: currentUser?.name,
      reviewedAt: draft.reviewedAt ?? now,
      updatedAt: now,
    };

    try {
      await supabaseData.upsertCollection('social_checkouts', businessId, [updatedDraft]);
      await refreshPaymentQueries();
      setDraft(updatedDraft);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not deactivate link', 'Please check your connection and try again.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleDeactivateLink = () => {
    if (!isAdmin) {
      Alert.alert('Admin access required', 'Only admins can deactivate payment links.');
      return;
    }
    if (!draft) return;
    confirmDestructiveAction(
      'Deactivate payment link?',
      'The customer will no longer be able to submit payment with this link.',
      'Deactivate',
      () => { void performDeactivateLink(); }
    );
  };

  const performDeleteLink = async () => {
    if (!isAdmin) {
      Alert.alert('Admin access required', 'Only admins can delete payment links.');
      return;
    }
    if (!draft || !businessId || isDeleting) return;
    setIsDeleting(true);
    try {
      await supabaseData.deleteByIds('social_checkouts', businessId, [draft.id]);
      await refreshPaymentQueries();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/payments' as never);
    } catch {
      Alert.alert('Could not delete link', 'Please check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteLink = () => {
    if (!isAdmin) {
      Alert.alert('Admin access required', 'Only admins can delete payment links.');
      return;
    }
    if (!draft) return;
    confirmDestructiveAction(
      'Delete payment link?',
      'This permanently removes the payment link from your payment list. Use this for test links only.',
      'Delete',
      () => { void performDeleteLink(); }
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}>
        {isDesktop ? <DesktopSidebar /> : null}
        <SafeAreaView className="flex-1" edges={['top']}>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: isDesktop ? 28 : 20, paddingTop: isDesktop ? 32 : 20, paddingBottom: 40, maxWidth: isDesktop ? 1456 : undefined, width: isDesktop ? '100%' : undefined }}
            showsVerticalScrollIndicator={false}
          >
            <PaymentDetailSkeleton isDesktop={isDesktop} />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: palette.page }} edges={['top']}>
        <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '600' }}>Payment link not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 14, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Back to payments</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const effectiveStatus = getSocialCheckoutEffectiveStatus(draft);
  const tone = STATUS_TONE[effectiveStatus];
  const toneStyle = palette.tones[tone];
  const linkedOrder = draft.convertedOrderId ? orders.find((order) => order.id === draft.convertedOrderId) : undefined;
  const linkedOrderNumber = linkedOrder?.orderNumber ?? (draft.convertedOrderId ? 'Linked order' : undefined);
  const deliveryLocationText = formatDeliveryLocation(draft.deliveryAddress, draft.deliveryState);
  const linkedOrderItems = linkedOrder?.items ?? [];
  const canDeactivateLink = isAdmin && (draft.status === 'awaiting_payment' || draft.status === 'payment_submitted');
  const canEditLink = isAdmin && effectiveStatus !== 'expired' && draft.status !== 'cancelled' && draft.status !== 'rejected';
  const isInactive = effectiveStatus === 'cancelled' || effectiveStatus === 'expired' || effectiveStatus === 'rejected';
  const displayLink = publicLink || `fyll.app/checkout?code=${draft.id}`;
  const customerMessage = buildCustomerPaymentMessage();
  const activityEntries = [
    {
      id: `created-${draft.id}`,
      action: 'Payment link created',
      actor: draft.createdBy || 'Staff',
      createdAt: draft.createdAt,
    },
    ...(draft.submittedAt ? [{
      id: `submitted-${draft.id}`,
      action: 'Customer paid by transfer and uploaded a receipt',
      actor: draft.customerName || 'Customer',
      createdAt: draft.submittedAt,
    }] : []),
    ...(draft.reviewedAt ? [{
      id: `reviewed-${draft.id}`,
      action: `Payment ${draft.status === 'verified' ? 'verified' : draft.status === 'rejected' ? 'rejected' : draft.status === 'cancelled' ? 'link deactivated' : 'reviewed'}`,
      actor: draft.reviewedBy || 'Staff',
      createdAt: draft.reviewedAt,
    }] : []),
    // Approve/reject also write a log entry; the reviewedAt summary above covers them.
    ...(draft.activityLog ?? []).filter((entry) => !/^(Approved|Rejected) social checkout payment proof$/.test(entry.action)),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const orderSearch = orderSearchQuery.trim().toLowerCase();
  const candidateOrders = orders
    .filter((order) => {
      if (draft.convertedOrderId && order.id === draft.convertedOrderId) return false;
      if (!orderSearch) return true;
      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        order.websiteOrderReference,
        String(order.totalAmount ?? ''),
      ].some((value) => String(value ?? '').toLowerCase().includes(orderSearch));
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);
  const getOrderItemLabel = (item: Order['items'][number]) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues).join(' / ') : '';
    return {
      title: product?.name ?? 'Order item',
      subtitle: variantName,
    };
  };
  const openLinkedOrder = () => {
    if (!draft.convertedOrderId) return;
    router.push((Platform.OS === 'web' && isDesktop ? `/orders/${draft.convertedOrderId}` : `/order/${draft.convertedOrderId}`) as never);
  };
  const openLinkOrderPicker = () => {
    setOrderSearchQuery('');
    setShowLinkOrderModal(true);
  };

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
  const inputStyle = [{
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.inputBg,
    color: palette.text,
    fontSize: fs(15),
  }, noWebOutline];

  const StatusIcon = tone === 'verified' ? Check : tone === 'review' ? AlertTriangle : tone === 'rejected' ? X : tone === 'awaiting' ? Clock : Power;

  const heroSection = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <MoneyText style={{ color: palette.text, fontSize: 34, lineHeight: 40, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(draft.amount)}
      </MoneyText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: toneStyle.bg }}>
          <StatusIcon size={12} color={toneStyle.ink} strokeWidth={2.8} />
          <Text style={{ color: toneStyle.ink, fontSize: fs(12.5), fontWeight: '600' }}>{STATUS_LABEL[effectiveStatus]}</Text>
        </View>
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.softFill }}>
          <Link2 size={12} color={palette.textSoft} strokeWidth={2.2} />
          <Text style={{ color: palette.textSoft, fontSize: fs(12.5), fontWeight: '600' }}>Payment link</Text>
        </View>
        <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>{formatShortTimestamp(draft.createdAt)}</Text>
      </View>
    </View>
  );

  const reviewSection = draft.status === 'payment_submitted' ? (
    <View style={{ ...cardStyle, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={17} color={palette.text} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>Receipt uploaded · needs review</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>Check the transfer landed, then approve or reject.</Text>
        </View>
      </View>
      {draft.proofImageUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View payment receipt"
          onPress={() => setShowProofLightbox(true)}
          style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline, opacity: state.pressed ? 0.8 : 1 })}
        >
          <Image source={{ uri: draft.proofImageUrl }} style={{ width: 56, height: 56, borderRadius: 10 }} resizeMode="cover" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Payment receipt</Text>
            <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>Tap to view full size</Text>
          </View>
          <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={handleApprovePayment}
          disabled={isApproving || isRejecting}
          style={(state) => ({ ...limeButton(state), flex: 1.3 })}
        >
          {isApproving ? <ActivityIndicator color={FYLL_LIME_INK} size="small" /> : <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />}
          <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>Approve</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={handleRejectPayment}
          disabled={isRejecting || isApproving}
          style={(state) => ({ ...outlineButton(state, 46), flex: 1, borderColor: palette.dangerBorder })}
        >
          {isRejecting ? <ActivityIndicator color={palette.danger} size="small" /> : <X size={15} color={palette.danger} strokeWidth={2.4} />}
          <Text style={{ color: palette.danger, fontSize: fs(14.5), fontWeight: '600' }}>Reject</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const orderSection = linkedOrderNumber ? (
    <View style={{ ...cardStyle, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open order ${linkedOrderNumber}`}
        onPress={openLinkedOrder}
        style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.inverseBg, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={17} color={palette.inverseText} strokeWidth={2.8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>Order {linkedOrderNumber} linked</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>Fulfil this order — don't create another one.</Text>
        </View>
        <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: palette.hairline }}>
        <Pressable onPress={handleCreateOrderFromPayment} style={(state) => ({ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
          <Text style={{ color: palette.textSoft, fontSize: fs(13.5), fontWeight: '600' }}>New order</Text>
        </Pressable>
        <View style={{ width: 1, backgroundColor: palette.hairline }} />
        <Pressable onPress={openLinkOrderPicker} style={(state) => ({ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
          <Text style={{ color: palette.textSoft, fontSize: fs(13.5), fontWeight: '600' }}>Replace order</Text>
        </Pressable>
        <View style={{ width: 1, backgroundColor: palette.hairline }} />
        <Pressable onPress={handleUnlinkOrder} style={(state) => ({ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
          <Text style={{ color: palette.textSoft, fontSize: fs(13.5), fontWeight: '600' }}>Unlink</Text>
        </Pressable>
      </View>
    </View>
  ) : isInactive ? (
    <View style={{ ...cardStyle, borderColor: palette.dangerBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
        <X size={17} color={palette.danger} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>{effectiveStatus === 'rejected' ? 'Payment rejected' : 'Payment link inactive'}</Text>
        <Text style={{ color: palette.muted, fontSize: fs(13) }}>
          {effectiveStatus === 'rejected'
            ? 'Order creation is locked because the receipt was rejected.'
            : 'This link can no longer accept payments.'}
        </Text>
      </View>
    </View>
  ) : (
    <View style={{ ...cardStyle, borderColor: draft.status === 'verified' ? palette.warnBorder : palette.border, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: draft.status === 'verified' ? palette.warnBg : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
          <Package size={17} color={draft.status === 'verified' ? palette.warn : palette.muted} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>No order linked yet</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>
            {draft.status === 'verified'
              ? 'Paid and verified. Create the order to start fulfilment.'
              : draft.status === 'payment_submitted'
                ? 'Approve the payment first, then create or link its order.'
                : 'Waiting for the customer to pay. You can create or link the order once it is approved.'}
          </Text>
        </View>
      </View>
      {/* Orders are only created or linked once the payment is approved. */}
      {draft.status === 'verified' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={handleCreateOrderFromPayment} style={(state) => ({ ...limeButton(state), flex: 1.3 })}>
            <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>Create order</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={openLinkOrderPicker} style={(state) => ({ ...outlineButton(state, 46), flex: 1 })}>
            <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>Link existing</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const customerSection = (
    <View style={{ ...cardStyle, paddingHorizontal: 16, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <InitialsAvatar name={draft.customerName ?? ''} palette={palette} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.faint, fontSize: fs(12) }}>Customer</Text>
          <Text style={{ color: draft.customerName ? palette.text : palette.faint, fontSize: fs(15), fontWeight: '500' }} numberOfLines={1}>
            {draft.customerName || 'Not submitted yet'}
          </Text>
        </View>
        {draft.customerPhone ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Call ${draft.customerName || 'customer'}`}
            onPress={() => { void Linking.openURL(`tel:${draft.customerPhone}`); }}
            hitSlop={8}
          >
            <Text style={{ color: palette.limeOnSurface, fontSize: fs(13.5), fontWeight: '600' }}>Call</Text>
          </Pressable>
        ) : null}
      </View>
      {[
        draft.customerPhone ? { key: 'phone', icon: Phone, value: draft.customerPhone } : null,
        draft.customerEmail ? { key: 'email', icon: Mail, value: draft.customerEmail } : null,
        deliveryLocationText ? { key: 'address', icon: MapPin, value: deliveryLocationText } : null,
      ].filter((row): row is { key: string; icon: typeof Phone; value: string } => Boolean(row)).map((row) => {
        const Icon = row.icon;
        return (
          <View key={row.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <Icon size={15} color={palette.faint} strokeWidth={2} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, color: palette.textSoft, fontSize: fs(14), lineHeight: 20 }} selectable>{row.value}</Text>
          </View>
        );
      })}
    </View>
  );

  const billSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
      <SectionLabel palette={palette}>Bill</SectionLabel>
      {linkedOrderItems.length > 0 ? (
        <>
          {linkedOrderItems.map((item, index) => {
            const labels = getOrderItemLabel(item);
            return (
              <View key={`${item.productId}-${item.variantId}-${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: fs(15) }}>{item.quantity > 1 ? `${item.quantity}× ` : ''}{labels.title}</Text>
                  {labels.subtitle ? <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>{labels.subtitle}</Text> : null}
                </View>
                <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
              </View>
            );
          })}
          {linkedOrder?.deliveryFee ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: palette.muted, fontSize: fs(15) }}>Delivery</Text>
              <Text style={{ color: palette.muted, fontSize: fs(15), fontVariant: ['tabular-nums'] }}>{formatCurrency(linkedOrder.deliveryFee)}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={{ color: draft.billNote?.trim() ? palette.text : palette.faint, fontSize: fs(15), lineHeight: 22 }} selectable>
          {draft.billNote?.trim() || 'No bill details added.'}
        </Text>
      )}
      <View style={{ height: 1, backgroundColor: palette.hairline }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '600' }}>Total</Text>
        <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(draft.amount)}</Text>
      </View>
    </View>
  );

  const linkSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
      <SectionLabel palette={palette}>Payment link</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 12, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
        <Text style={{ flex: 1, color: palette.textSoft, fontSize: fs(13.5) }} numberOfLines={1} selectable>{displayLink.replace(/^https?:\/\//, '')}</Text>
        {publicLink ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy link"
            onPress={handleCopyPublicLink}
            style={(state) => ({
              height: 32,
              paddingHorizontal: 10,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.14)' : '#E8E8E8') : palette.softFill,
            })}
          >
            {linkCopied ? <Check size={13} color={palette.text} strokeWidth={2.6} /> : <Copy size={13} color={palette.text} strokeWidth={2.2} />}
            <Text style={{ color: palette.text, fontSize: fs(12.5), fontWeight: '600' }}>{linkCopied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={handleCopyCustomerMessage} style={(state) => ({ ...outlineButton(state), flex: 1 })}>
          {messageCopied ? <Check size={15} color={palette.text} strokeWidth={2.6} /> : <MessageCircle size={15} color={palette.text} strokeWidth={2} />}
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{messageCopied ? 'Message copied' : 'Copy message'}</Text>
        </Pressable>
        {canEditLink ? (
          <Pressable
            accessibilityRole="button"
            onPress={isEditing ? handleCancelEdit : handleStartEdit}
            style={(state) => ({ ...outlineButton(state), flex: 1 })}
          >
            {isEditing ? <X size={15} color={palette.text} strokeWidth={2.2} /> : <Pencil size={15} color={palette.text} strokeWidth={2} />}
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{isEditing ? 'Cancel edit' : 'Edit link'}</Text>
          </Pressable>
        ) : null}
      </View>
      {canEditLink ? <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>Edits update the bill without changing the customer's link.</Text> : null}
    </View>
  );

  const editSection = isEditing ? (
    <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
      <SectionLabel palette={palette}>Edit payment link</SectionLabel>
      <View style={{ gap: 6 }}>
        <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Bill</Text>
        <TextInput
          placeholder="What the customer is paying for"
          placeholderTextColor={palette.faint}
          value={editBillNote}
          onChangeText={setEditBillNote}
          multiline
          textAlignVertical="top"
          style={[...inputStyle, { minHeight: 104, lineHeight: 21 }]}
          selectionColor={palette.text}
        />
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Total amount</Text>
          <TextInput placeholder="0" placeholderTextColor={palette.faint} value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" style={[...inputStyle, { fontWeight: '600' }]} selectionColor={palette.text} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Customer name</Text>
          <TextInput placeholder="Customer name" placeholderTextColor={palette.faint} value={editCustomerName} onChangeText={setEditCustomerName} style={inputStyle} selectionColor={palette.text} />
        </View>
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Phone</Text>
          <TextInput placeholder="Phone" placeholderTextColor={palette.faint} value={editCustomerPhone} onChangeText={setEditCustomerPhone} keyboardType="phone-pad" style={inputStyle} selectionColor={palette.text} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Email</Text>
          <TextInput placeholder="Email" placeholderTextColor={palette.faint} value={editCustomerEmail} onChangeText={setEditCustomerEmail} keyboardType="email-address" autoCapitalize="none" style={inputStyle} selectionColor={palette.text} />
        </View>
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1.4, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Delivery address</Text>
          <TextInput placeholder="Delivery address" placeholderTextColor={palette.faint} value={editDeliveryAddress} onChangeText={setEditDeliveryAddress} multiline textAlignVertical="top" style={[...inputStyle, { minHeight: 72, lineHeight: 21 }]} selectionColor={palette.text} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Delivery state</Text>
          <TextInput placeholder="State" placeholderTextColor={palette.faint} value={editDeliveryState} onChangeText={setEditDeliveryState} style={inputStyle} selectionColor={palette.text} />
        </View>
      </View>
      {accounts.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.muted, fontSize: fs(12.5) }}>Bank account shown to customer</Text>
          {accounts.map((account) => {
            const isSelected = editAccountId === account.id;
            return (
              <Pressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setEditAccountId(account.id)}
                style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: isSelected ? palette.inverseBg : palette.outline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isSelected ? palette.inverseBg : palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.inverseBg }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{account.bankName}</Text>
                  <Text style={{ color: palette.muted, fontSize: fs(13), marginTop: 2 }}>{account.accountName} · {account.accountNumber}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Pressable onPress={handleCancelEdit} disabled={isSavingEdit} style={(state) => ({ ...outlineButton(state), flex: 1 })}>
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSaveEdit}
          disabled={isSavingEdit}
          style={(state) => ({ height: 44, flex: 1.3, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.inverseBg, opacity: state.pressed || isSavingEdit ? 0.8 : 1 })}
        >
          {isSavingEdit ? <ActivityIndicator color={palette.inverseText} size="small" /> : <Save size={15} color={palette.inverseText} strokeWidth={2.2} />}
          <Text style={{ color: palette.inverseText, fontSize: fs(14), fontWeight: '600' }}>Save changes</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const messageSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
      <SectionLabel palette={palette}>Message preview</SectionLabel>
      <Text style={{ color: palette.textSoft, fontSize: fs(14), lineHeight: 21.5 }} selectable>{customerMessage}</Text>
    </View>
  );

  const proofSection = draft.proofImageUrl && draft.status !== 'payment_submitted' ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View payment receipt"
      onPress={() => setShowProofLightbox(true)}
      style={(state) => ({ ...cardStyle, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: isHovered(state) ? palette.cardHover : palette.card })}
    >
      <Image source={{ uri: draft.proofImageUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>Payment receipt</Text>
        <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>
          {draft.submittedAt ? `Uploaded ${formatShortTimestamp(draft.submittedAt)}` : 'Tap to view full size'}
        </Text>
      </View>
      <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
    </Pressable>
  ) : null;

  const bankSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Landmark size={14} color={palette.faint} strokeWidth={2} />
        <SectionLabel palette={palette}>Paid into</SectionLabel>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }} numberOfLines={1}>{draft.bankAccount.bankName}</Text>
        <Text style={{ color: palette.muted, fontSize: fs(13.5) }} numberOfLines={1} selectable>{draft.bankAccount.accountName} · {draft.bankAccount.accountNumber}</Text>
      </View>
    </View>
  );

  const activitySection = (
    <View style={{ ...cardStyle, padding: 16 }}>
      <View style={{ paddingBottom: 12 }}>
        <SectionLabel palette={palette}>Activity</SectionLabel>
      </View>
      {activityEntries.map((entry, index) => {
        const isLatest = index === activityEntries.length - 1;
        return (
          <View key={entry.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 12, alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 5, backgroundColor: isLatest ? palette.text : palette.isDark ? '#5D5E56' : '#CFCFCF' }} />
              {!isLatest ? <View style={{ width: 1.5, flex: 1, marginVertical: 4, backgroundColor: palette.hairline }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: isLatest ? 0 : 14 }}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '500' }}>{entry.action}</Text>
              <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>{entry.actor} · {formatShortTimestamp(entry.createdAt)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const moreActions = [
    publicLink ? { key: 'copy-link', label: 'Copy link', icon: Copy, onPress: () => { void handleCopyPublicLink(); } } : null,
    { key: 'copy-message', label: 'Copy message', icon: MessageCircle, onPress: () => { void handleCopyCustomerMessage(); } },
    canEditLink && !isEditing ? { key: 'edit', label: 'Edit link', icon: Pencil, onPress: handleStartEdit } : null,
    draft.convertedOrderId ? { key: 'open-order', label: 'Open linked order', icon: ExternalLink, onPress: openLinkedOrder } : null,
    canDeactivateLink ? { key: 'deactivate', label: 'Deactivate link', icon: Power, onPress: handleDeactivateLink, tone: 'warn' as const } : null,
    isAdmin ? { key: 'delete', label: 'Delete link', icon: Trash2, onPress: handleDeleteLink, tone: 'danger' as const } : null,
  ].filter((action): action is { key: string; label: string; icon: typeof Copy; onPress: () => void; tone?: 'warn' | 'danger' } => Boolean(action));

  const contentGap = 14;

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: isDesktop ? 20 : 8, paddingTop: isDesktop ? 18 : 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to payments"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/payments' as never))}
            style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <ChevronLeft size={21} color={palette.text} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>Payment</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Copy payment reference" onPress={() => { void Clipboard.setStringAsync(`SC-${draft.id}`); setRefCopied(true); setTimeout(() => setRefCopied(false), 1600); }} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', opacity: state.pressed ? 0.6 : 1 })}>
              <Text style={{ color: palette.faint, fontSize: 16, letterSpacing: 0.3, flexShrink: 1 }} numberOfLines={1}>SC-{draft.id}</Text>
              {refCopied ? <Check size={14} color={palette.text} strokeWidth={2.6} /> : <Copy size={14} color={palette.faint} strokeWidth={2.2} />}
            </Pressable>
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
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 28 : 20,
            paddingTop: isDesktop ? 26 : 22,
            paddingBottom: 40,
            maxWidth: isDesktop ? 1456 : undefined,
            width: isDesktop ? '100%' : undefined,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
              <View style={{ flex: 1.45, minWidth: 0, gap: contentGap }}>
                {heroSection}
                {reviewSection}
                {orderSection}
                {billSection}
                {linkSection}
                {editSection}
                {messageSection}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: contentGap, paddingTop: 4 }}>
                {customerSection}
                {proofSection}
                {bankSection}
                {activitySection}
              </View>
            </View>
          ) : (
            <View style={{ gap: contentGap }}>
              {heroSection}
              {reviewSection}
              {orderSection}
              {customerSection}
              {proofSection}
              {billSection}
              {linkSection}
              {editSection}
              {messageSection}
              {bankSection}
              {activitySection}
            </View>
          )}
        </ScrollView>

        <Modal visible={showMoreActions} transparent animationType="fade" onRequestClose={() => setShowMoreActions(false)}>
          <Pressable onPress={() => setShowMoreActions(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center' }}>
            <Pressable
              onPress={(event) => event.stopPropagation?.()}
              style={{ width: isDesktop ? 380 : '100%', backgroundColor: palette.card, borderRadius: 24, borderBottomLeftRadius: isDesktop ? 24 : 0, borderBottomRightRadius: isDesktop ? 24 : 0, borderWidth: 1, borderColor: palette.border, paddingTop: 10, paddingHorizontal: 12, paddingBottom: isDesktop ? 12 : Math.max(insets.bottom, 12) + 8 }}
            >
              {!isDesktop ? <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.outline, marginBottom: 10 }} /> : null}
              {moreActions.map((action) => {
                const Icon = action.icon;
                const color = action.tone === 'danger' ? palette.danger : action.tone === 'warn' ? palette.warn : palette.text;
                return (
                  <Pressable
                    key={action.key}
                    onPress={() => {
                      setShowMoreActions(false);
                      action.onPress();
                    }}
                    style={(state) => ({ height: 52, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
                  >
                    <Icon size={18} color={action.tone ? color : palette.muted} strokeWidth={2.1} />
                    <Text style={{ color, fontSize: fs(15), fontWeight: '500' }}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showLinkOrderModal} animationType="fade" transparent onRequestClose={() => setShowLinkOrderModal(false)}>
          <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <View
              style={{
                backgroundColor: palette.card,
                borderRadius: 24,
                borderBottomLeftRadius: isDesktop ? 24 : 0,
                borderBottomRightRadius: isDesktop ? 24 : 0,
                borderWidth: 1,
                borderColor: palette.border,
                padding: 18,
                paddingBottom: isDesktop ? 18 : Math.max(insets.bottom, 12) + 8,
                maxHeight: isDesktop ? 680 : '82%',
                width: isDesktop ? 560 : '100%',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>{linkedOrder ? 'Replace linked order' : 'Link existing order'}</Text>
                  <Text style={{ color: palette.muted, fontSize: fs(13.5), marginTop: 3 }}>Choose the order that should receive this payment.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setShowLinkOrderModal(false)}
                  style={(state) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.outline : palette.softFill })}
                >
                  <X size={18} color={palette.text} strokeWidth={2.2} />
                </Pressable>
              </View>
              <View style={{ height: 46, borderRadius: 999, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, marginBottom: 12, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.outline }}>
                <TextInput
                  value={orderSearchQuery}
                  onChangeText={setOrderSearchQuery}
                  placeholder="Search order, customer, phone"
                  placeholderTextColor={palette.faint}
                  style={[{ flex: 1, color: palette.text, fontSize: fs(14) }, noWebOutline]}
                  selectionColor={palette.text}
                />
                <SearchClearButton visible={Boolean(orderSearchQuery.trim())} onPress={() => setOrderSearchQuery('')} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {candidateOrders.length > 0 ? (
                  candidateOrders.map((order, index) => {
                    const sameCustomer = Boolean(draft.customerName && order.customerName.trim().toLowerCase() === draft.customerName.trim().toLowerCase());
                    return (
                      <Pressable
                        key={order.id}
                        onPress={() => { void handleLinkExistingOrder(order); }}
                        style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
                      >
                        <InitialsAvatar name={order.customerName || ''} palette={palette} size={34} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }} numberOfLines={1}>{order.orderNumber}</Text>
                            {sameCustomer ? (
                              <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.tones.verified.bg }}>
                                <Text style={{ color: palette.tones.verified.ink, fontSize: fs(11), fontWeight: '600' }}>Same customer</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ color: palette.muted, fontSize: fs(13), marginTop: 2 }} numberOfLines={1}>
                            {order.customerName || 'No customer'} · {formatShortTimestamp(order.createdAt)} · {order.status}
                          </Text>
                        </View>
                        <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(order.totalAmount)}</Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                    <FileText size={22} color={palette.faint} strokeWidth={1.8} />
                    <Text style={{ color: palette.muted, fontSize: fs(14), marginTop: 8, textAlign: 'center' }}>No matching orders found.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showProofLightbox} animationType="fade" transparent onRequestClose={() => setShowProofLightbox(false)}>
          <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.86)' }} onPress={() => setShowProofLightbox(false)}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 860 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ color: '#FFFFFF', fontSize: fs(14), fontWeight: '600' }}>Payment receipt</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowProofLightbox(false)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}>
                  <X size={18} color="#FFFFFF" strokeWidth={2} />
                </Pressable>
              </View>
              {draft.proofImageUrl ? (
                <Image source={{ uri: draft.proofImageUrl }} style={{ width: '100%', height: isDesktop ? 620 : 460, borderRadius: 18 }} resizeMode="contain" />
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
