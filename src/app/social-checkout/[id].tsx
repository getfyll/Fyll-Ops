import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, ActivityIndicator, Platform, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Check, X, Phone, Mail, MapPin, User, Landmark, Copy, Power, Trash2, Pencil, Save, FileText, ExternalLink } from 'lucide-react-native';
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
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { formatDeliveryLocation } from '@/lib/format-address';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { buildSocialCheckoutUrl } from '@/lib/tracking-url';
import { PaymentDetailSkeleton } from '@/components/SkeletonLoader';

// Styled to match the reference dashboard: two-column summary cards, plain
// icon+text customer rows instead of boxed sections, outlined pill actions.
//
// Since a draft's billNote is just pasted free text (no structured items —
// see social-checkout/new.tsx), staff builds the real order line items from
// scratch here by reading the note and adding real products one at a time,
// rather than "attaching" to pre-declared slots.

const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;
const STATUS_LABEL: Record<SocialCheckoutDraft['status'], string> = {
  awaiting_payment: 'Awaiting payment',
  payment_submitted: 'Needs review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const STATUS_COLOR: Record<SocialCheckoutDraft['status'], string> = {
  awaiting_payment: '#D97706',
  payment_submitted: '#D97706',
  verified: '#059669',
  rejected: '#DC2626',
  cancelled: '#DC2626',
  expired: '#DC2626',
};

const STATUS_BG: Record<SocialCheckoutDraft['status'], string> = {
  awaiting_payment: 'rgba(217, 119, 6, 0.1)',
  payment_submitted: 'rgba(217, 119, 6, 0.1)',
  verified: 'rgba(5, 150, 105, 0.1)',
  rejected: 'rgba(220, 38, 38, 0.12)',
  cancelled: 'rgba(220, 38, 38, 0.1)',
  expired: 'rgba(220, 38, 38, 0.12)',
};

function SourcePill({ compact = false }: { compact?: boolean }) {
  return (
    <View className="rounded-full" style={{ backgroundColor: 'rgba(37, 99, 235, 0.12)', paddingHorizontal: compact ? 8 : 16, paddingVertical: compact ? 4 : 8 }}>
      <Text style={{ color: '#2563EB', fontSize: compact ? 10 : 12, fontWeight: '600' }}>Social Checkout</Text>
    </View>
  );
}

function InfoRow({ icon: Icon, children }: { icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center mb-2.5">
      <Icon size={14} color={colors.text.muted} strokeWidth={2} />
      <Text style={{ color: colors.text.secondary }} className="text-sm ml-2.5">{children}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <Text style={{ color: colors.text.primary }} className="font-semibold text-base mb-3">{children}</Text>
  );
}

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

function formatCreatedLabel(iso: string) {
  const created = new Date(iso);
  const today = new Date();
  const createdDate = created.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const isToday =
    created.getFullYear() === today.getFullYear()
    && created.getMonth() === today.getMonth()
    && created.getDate() === today.getDate();
  return isToday ? `Created Today, ${createdDate} ${time}` : `Created ${createdDate} ${time}`;
}

function formatActivityTimestamp(iso?: string) {
  if (!iso) return 'Date unavailable';
  const created = new Date(iso);
  return `${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

export default function SocialCheckoutDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const workflowButtonBg = isDark ? colors.bg.card : '#FFFFFF';
  const workflowButtonBorder = isDark ? '#404040' : 'rgba(17, 24, 39, 0.12)';
  const primaryButtonBg = isDark ? '#FFFFFF' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const { isDesktop } = useBreakpoint();
  const editFieldHeight = isDesktop ? 60 : 54;
  const editAddressFieldHeight = isDesktop ? 60 : 72;
  const editBillHeight = isDesktop ? 112 : 136;
  const editFieldRadius = isDesktop ? 18 : 16;
  const editAddressFieldRadius = 18;
  const editTextInputStyle = {
    color: colors.input.text,
    fontSize: isDesktop ? 14 : 16,
    lineHeight: isDesktop ? 20 : 23,
    height: editFieldHeight,
    paddingVertical: 0,
    textAlign: 'left' as const,
    alignSelf: 'stretch' as const,
  };
  const editFieldShellStyle = {
    flex: 1,
    backgroundColor: colors.input.bg,
    borderWidth: 1,
    borderColor: separatorColor,
    height: editFieldHeight,
    borderRadius: editFieldRadius,
    justifyContent: 'center' as const,
  };
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
  const [messageCopied, setMessageCopied] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLinkOrderModal, setShowLinkOrderModal] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

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
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        {isDesktop ? <DesktopSidebar /> : null}
        <SafeAreaView className={isDesktop ? 'flex-1 ml-[280px]' : 'flex-1'} edges={['top']}>
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
            <PaymentDetailSkeleton isDesktop={isDesktop} />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.bg.primary }} edges={['top']}>
        <Text style={{ color: colors.text.primary }} className="font-bold text-base">Checkout link not found</Text>
      </SafeAreaView>
    );
  }

  const effectiveStatus = getSocialCheckoutEffectiveStatus(draft);
  const statusColor = STATUS_COLOR[effectiveStatus];
  const statusBg = STATUS_BG[effectiveStatus];
  const createdLabel = formatCreatedLabel(draft.createdAt);
  const linkedOrder = draft.convertedOrderId ? orders.find((order) => order.id === draft.convertedOrderId) : undefined;
  const deliveryLocationText = formatDeliveryLocation(draft.deliveryAddress, draft.deliveryState);
  const linkedOrderItems = linkedOrder?.items ?? [];
  const sectionGap = isDesktop ? 24 : 16;
  const canDeactivateLink = isAdmin && (draft.status === 'awaiting_payment' || draft.status === 'payment_submitted');
  const canEditLink = isAdmin && effectiveStatus !== 'expired' && draft.status !== 'cancelled' && draft.status !== 'rejected';
  const activityEntries = [
    {
      id: `created-${draft.id}`,
      action: 'Social checkout payment link created',
      actor: draft.createdBy || 'Staff',
      createdAt: draft.createdAt,
    },
    ...(draft.submittedAt ? [{
      id: `submitted-${draft.id}`,
      action: 'Customer submitted payment proof',
      actor: draft.customerName || 'Customer',
      createdAt: draft.submittedAt,
    }] : []),
    ...(draft.reviewedAt ? [{
      id: `reviewed-${draft.id}`,
      action: `Payment ${draft.status === 'verified' ? 'verified' : draft.status === 'rejected' ? 'rejected' : 'reviewed'}`,
      actor: draft.reviewedBy || 'Staff',
      createdAt: draft.reviewedAt,
    }] : []),
    ...(draft.activityLog ?? []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const renderActivityCard = () => (
    <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
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
    </View>
  );
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

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: colors.bg.primary }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
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
          <View className="flex-row items-center gap-2.5 mb-1.5">
            <Pressable onPress={() => router.back()} className="w-8 h-8 items-center justify-center active:opacity-60">
              <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={1}>SC-{draft.id}</Text>
            {linkedOrder ? (
              <Pressable
                onPress={() => router.push((Platform.OS === 'web' && isDesktop ? `/orders/${linkedOrder.id}` : `/order/${linkedOrder.id}`) as never)}
                className="rounded-full flex-row items-center justify-center active:opacity-80"
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
          <Text style={{ color: colors.text.muted }} className={isDesktop ? 'text-sm mb-6' : 'text-sm mb-3'}>{createdLabel}</Text>
          <View className="flex-row items-center flex-wrap mb-5" style={{ gap: 8 }}>
            <View
              className="rounded-full flex-row items-center"
              style={{ backgroundColor: statusBg, borderWidth: 1, borderColor: statusBg, paddingHorizontal: isDesktop ? 16 : 8, paddingVertical: isDesktop ? 8 : 4, gap: 5 }}
            >
              {effectiveStatus === 'payment_submitted' ? (
                <AlertTriangle size={isDesktop ? 12 : 10} color={statusColor} strokeWidth={2.4} />
              ) : effectiveStatus === 'rejected' ? (
                <X size={isDesktop ? 12 : 10} color={statusColor} strokeWidth={2.4} />
              ) : null}
              <Text style={{ color: statusColor, fontSize: isDesktop ? 12 : 10, fontWeight: '600' }}>{STATUS_LABEL[effectiveStatus]}</Text>
            </View>
            <SourcePill compact={!isDesktop} />
          </View>

          {isDesktop ? (
            <View style={{ flexDirection: 'row', gap: sectionGap, alignItems: 'stretch', marginBottom: sectionGap }}>
              <View className="rounded-2xl p-5" style={{ flex: 1, minWidth: 0, minHeight: 162, justifyContent: 'space-between', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
                <SectionTitle>Amount</SectionTitle>
                <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">{formatCurrency(draft.amount)}</Text>
              </View>
              <View className="rounded-2xl p-5" style={{ flex: 1, minWidth: 0, minHeight: 162, justifyContent: 'space-between', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
                <SectionTitle>Public Link</SectionTitle>
                <Pressable onPress={handleCopyPublicLink} className="flex-row items-center justify-between rounded-[16px] px-3.5" style={{ height: 44, backgroundColor: colors.bg.secondary }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 14 }} className="flex-1 mr-2" numberOfLines={1}>{publicLink || `.../checkout?code=${draft.id}`}</Text>
                  {linkCopied ? <Check size={14} color="#059669" strokeWidth={2.5} /> : <Copy size={14} color={colors.text.tertiary} strokeWidth={2} />}
                </Pressable>
              </View>
              <View
                className="rounded-2xl p-5"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 162,
                  justifyContent: 'space-between',
                  backgroundColor: linkedOrder ? 'rgba(5, 150, 105, 0.07)' : 'rgba(37, 99, 235, 0.06)',
                  borderWidth: 1,
                  borderColor: linkedOrder ? 'rgba(5, 150, 105, 0.18)' : 'rgba(37, 99, 235, 0.16)',
                }}
              >
                <View>
                  <SectionTitle>Order workflow</SectionTitle>
                  <Text style={{ color: colors.text.muted, lineHeight: 20 }} className="text-sm">
                    {linkedOrder
                      ? `Linked to ${linkedOrder.orderNumber}. Staff should fulfill this order instead of creating another one.`
                      : draft.status === 'verified'
                        ? 'Payment is approved. Link the manual order staff created, or create the order from this payment.'
                        : 'Link this payment to a manual order if one already exists.'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <Pressable
                    onPress={() => {
                      setOrderSearchQuery('');
                      setShowLinkOrderModal(true);
                    }}
                    className="rounded-full items-center justify-center flex-row gap-2 px-4"
                    style={{ flex: 1, height: 44, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder }}
                  >
                    <FileText size={15} color={colors.text.primary} strokeWidth={2.3} />
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>
                      {linkedOrder ? 'Replace order' : 'Link order'}
                    </Text>
                  </Pressable>
                  {linkedOrder ? (
                    <Pressable
                      onPress={handleUnlinkOrder}
                      className="rounded-full items-center justify-center flex-row gap-2 px-4"
                      style={{ height: 44, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder }}
                    >
                      <X size={15} color={colors.text.primary} strokeWidth={2.3} />
                      <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Unlink</Text>
                    </Pressable>
                  ) : draft.status === 'verified' ? (
                    <Pressable
                      onPress={handleCreateOrderFromPayment}
                      className="rounded-full items-center justify-center flex-row gap-2 px-4"
                      style={{ height: 44, backgroundColor: primaryButtonBg }}
                    >
                      <Check size={15} color={primaryButtonText} strokeWidth={2.5} />
                      <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Create</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {isAdmin ? (
              <View className="rounded-2xl p-5" style={{ flex: 1, minWidth: 0, minHeight: 162, justifyContent: 'space-between', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
                <View>
                  <SectionTitle>Link Actions</SectionTitle>
                  <Text style={{ color: colors.text.muted, lineHeight: 20 }} className="text-sm">
                    Deactivate active links, or delete test payment links you no longer need.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  {canDeactivateLink ? (
                    <Pressable
                      onPress={handleDeactivateLink}
                      disabled={isDeactivating}
                      className="rounded-full items-center justify-center flex-row gap-2 px-4"
                      style={{ flex: 1, height: 44, backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.24)', opacity: isDeactivating ? 0.65 : 1 }}
                    >
                      {isDeactivating ? (
                        <ActivityIndicator color="#D97706" size="small" />
                      ) : (
                        <>
                          <Power size={15} color="#D97706" strokeWidth={2.4} />
                          <Text style={{ color: '#D97706' }} className="font-semibold text-sm" numberOfLines={1}>Deactivate</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={handleDeleteLink}
                    disabled={isDeleting}
                    className="rounded-full items-center justify-center flex-row gap-2 px-4"
                    style={{ flex: 1, height: 44, backgroundColor: 'rgba(220, 38, 38, 0.1)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.22)', opacity: isDeleting ? 0.65 : 1 }}
                  >
                    {isDeleting ? (
                      <ActivityIndicator color="#DC2626" size="small" />
                    ) : (
                      <>
                        <Trash2 size={15} color="#DC2626" strokeWidth={2.4} />
                        <Text style={{ color: '#DC2626' }} className="font-semibold text-sm" numberOfLines={1}>Delete</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
              ) : null}
            </View>
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
                  <View className="rounded-full px-2.5 py-1 self-start" style={{ backgroundColor: linkedOrder ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)' }}>
                    <Text style={{ color: linkedOrder ? '#059669' : '#DC2626' }} className="text-[11px] font-semibold">
                      {linkedOrder ? 'Linked' : 'Unlinked'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-2" numberOfLines={1}>
                    {linkedOrder ? `Linked to ${linkedOrder.orderNumber}` : 'No order linked'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setOrderSearchQuery('');
                    setShowLinkOrderModal(true);
                  }}
                  className="rounded-full items-center justify-center flex-row px-3.5"
                  style={{ height: 34, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, gap: 5 }}
                >
                  <FileText size={13} color={colors.text.primary} strokeWidth={2.3} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-xs">
                    {linkedOrder ? 'Replace' : 'Link order'}
                  </Text>
                </Pressable>
              </View>
              {linkedOrder ? (
                <Pressable
                  onPress={handleUnlinkOrder}
                  className="self-start rounded-full items-center justify-center flex-row px-3 mt-2"
                  style={{ height: 30, backgroundColor: workflowButtonBg, borderWidth: 1, borderColor: workflowButtonBorder, gap: 5 }}
                >
                  <X size={12} color={colors.text.primary} strokeWidth={2.3} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-xs">Unlink</Text>
                </Pressable>
              ) : draft.status === 'verified' ? (
                <Pressable
                  onPress={handleCreateOrderFromPayment}
                  className="self-start rounded-full items-center justify-center flex-row px-3 mt-2"
                  style={{ height: 30, backgroundColor: primaryButtonBg, gap: 5 }}
                >
                  <Check size={12} color={primaryButtonText} strokeWidth={2.5} />
                  <Text style={{ color: primaryButtonText }} className="font-semibold text-xs">Create order</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {!isDesktop ? (
          <View style={{ flexDirection: 'column', gap: sectionGap, alignItems: 'flex-start', marginBottom: sectionGap }}>
            <View className="rounded-2xl p-5" style={{ flex: 1, minWidth: 0, width: isDesktop ? undefined : '100%', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
              <SectionTitle>Public Link</SectionTitle>
              <Pressable onPress={handleCopyPublicLink} className="flex-row items-center justify-between rounded-full px-3.5" style={{ height: 40, backgroundColor: colors.bg.secondary }}>
                <Text style={{ color: colors.text.secondary, fontSize: 14 }} className="flex-1 mr-2" numberOfLines={1}>{publicLink || `.../checkout?code=${draft.id}`}</Text>
                {linkCopied ? <Check size={14} color="#059669" strokeWidth={2.5} /> : <Copy size={14} color={colors.text.tertiary} strokeWidth={2} />}
              </Pressable>
            </View>
            <View className="rounded-2xl p-5" style={{ width: isDesktop ? 420 : '100%', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
              <SectionTitle>Amount</SectionTitle>
              <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">{formatCurrency(draft.amount)}</Text>
            </View>
          </View>
          ) : null}

          {draft.status === 'payment_submitted' ? (
            <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 12 }}>
                <View className="flex-1 pr-4">
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base">Review Payment</Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-1">Approve the proof or reject it if the transfer details do not match.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}>
                  <Pressable
                    onPress={handleRejectPayment}
                    disabled={isRejecting || isApproving}
                    className="rounded-full items-center justify-center flex-row gap-2 px-5"
                    style={{
                      flexBasis: isDesktop ? undefined : '50%',
                      flexGrow: isDesktop ? 0 : 1,
                      height: 46,
                      backgroundColor: 'rgba(220, 38, 38, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(220, 38, 38, 0.28)',
                      opacity: isRejecting ? 0.65 : 1,
                    }}
                  >
                    {isRejecting ? (
                      <ActivityIndicator color="#DC2626" size="small" />
                    ) : (
                      <X size={15} color="#DC2626" strokeWidth={2.5} />
                    )}
                    <Text style={{ color: '#DC2626' }} className="font-semibold text-sm">Reject</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleApprovePayment}
                    disabled={isApproving || isRejecting}
                    className="rounded-full items-center justify-center flex-row gap-2 px-5"
                    style={{
                      flexBasis: isDesktop ? undefined : '50%',
                      flexGrow: isDesktop ? 0 : 1,
                      height: 46,
                      backgroundColor: '#059669',
                      opacity: isApproving ? 0.65 : 1,
                    }}
                  >
                    {isApproving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={{ color: '#FFFFFF' }} className="font-semibold text-sm">Approve</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {canEditLink ? (
            <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 12, marginBottom: isEditing ? 16 : 0 }}>
                <View className="flex-1">
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base">Edit Payment Link</Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-1">
                    Update the bill or payment details without changing the customer's link.
                  </Text>
                </View>
                {isEditing ? (
                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10 }}>
                    <Pressable
                      onPress={handleCancelEdit}
                      disabled={isSavingEdit}
                      className="rounded-full items-center justify-center px-5"
                      style={{ height: 44, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: separatorColor }}
                    >
                      <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveEdit}
                      disabled={isSavingEdit}
                      className="rounded-full items-center justify-center flex-row gap-2 px-5"
                      style={{ height: 44, backgroundColor: primaryButtonBg }}
                    >
                      {isSavingEdit ? (
                        <ActivityIndicator color={primaryButtonText} size="small" />
                      ) : (
                        <>
                          <Save size={15} color={primaryButtonText} strokeWidth={2.4} />
                          <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Save Changes</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleStartEdit}
                    className="rounded-full items-center justify-center flex-row gap-2 px-5"
                    style={{ height: 44, backgroundColor: primaryButtonBg }}
                  >
                    <Pencil size={15} color={primaryButtonText} strokeWidth={2.4} />
                    <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Edit Link</Text>
                  </Pressable>
                )}
              </View>

              {isEditing ? (
                <View style={{ gap: 14 }}>
                  <View
                    className="rounded-2xl px-4 py-3.5"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, minHeight: editBillHeight }}
                  >
                    <TextInput
                      placeholder="Order bill"
                      placeholderTextColor={colors.input.placeholder}
                      value={editBillNote}
                      onChangeText={setEditBillNote}
                      multiline
                      textAlignVertical="top"
                      style={[{ color: colors.input.text, fontSize: isDesktop ? 14 : 16, lineHeight: isDesktop ? 20 : 24, minHeight: editBillHeight - 28, paddingVertical: 0 }, noWebOutline]}
                      selectionColor={colors.text.primary}
                    />
                  </View>

                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                    <View
                      className="social-checkout-edit-field px-4"
                      style={editFieldShellStyle}
                    >
                      <TextInput
                        placeholder="Total amount"
                        placeholderTextColor={colors.input.placeholder}
                        value={editAmount}
                        onChangeText={setEditAmount}
                        keyboardType="decimal-pad"
                        style={[{ ...editTextInputStyle, fontWeight: '600' as const }, noWebOutline]}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <View
                      className="social-checkout-edit-field px-4"
                      style={editFieldShellStyle}
                    >
                      <TextInput
                        placeholder="Customer name"
                        placeholderTextColor={colors.input.placeholder}
                        value={editCustomerName}
                        onChangeText={setEditCustomerName}
                        style={[editTextInputStyle, noWebOutline]}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                    <View className="social-checkout-edit-field px-4" style={editFieldShellStyle}>
                      <TextInput placeholder="Phone" placeholderTextColor={colors.input.placeholder} value={editCustomerPhone} onChangeText={setEditCustomerPhone} keyboardType="phone-pad" style={[editTextInputStyle, noWebOutline]} selectionColor={colors.text.primary} />
                    </View>
                    <View className="social-checkout-edit-field px-4" style={editFieldShellStyle}>
                      <TextInput placeholder="Email" placeholderTextColor={colors.input.placeholder} value={editCustomerEmail} onChangeText={setEditCustomerEmail} keyboardType="email-address" autoCapitalize="none" style={[editTextInputStyle, noWebOutline]} selectionColor={colors.text.primary} />
                    </View>
                  </View>

                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                    <View className="social-checkout-edit-field social-checkout-edit-address-field px-4" style={{ ...editFieldShellStyle, height: editAddressFieldHeight, borderRadius: editAddressFieldRadius, justifyContent: isDesktop ? 'center' : 'flex-start', paddingTop: isDesktop ? 0 : 9, paddingBottom: isDesktop ? 0 : 9 }}>
                      <TextInput
                        placeholder="Delivery address"
                        placeholderTextColor={colors.input.placeholder}
                        value={editDeliveryAddress}
                        onChangeText={setEditDeliveryAddress}
                        multiline={!isDesktop}
                        textAlignVertical={isDesktop ? 'center' : 'top'}
                        style={[{ ...editTextInputStyle, height: isDesktop ? editFieldHeight : editAddressFieldHeight - 18 }, noWebOutline]}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <View className="social-checkout-edit-field px-4" style={editFieldShellStyle}>
                      <TextInput placeholder="Delivery state" placeholderTextColor={colors.input.placeholder} value={editDeliveryState} onChangeText={setEditDeliveryState} style={[editTextInputStyle, noWebOutline]} selectionColor={colors.text.primary} />
                    </View>
                  </View>

                  {accounts.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">Bank account shown to customer</Text>
                      {accounts.map((account) => {
                        const isSelected = editAccountId === account.id;
                        return (
                          <Pressable
                            key={account.id}
                            onPress={() => setEditAccountId(account.id)}
                            className="rounded-2xl p-4 active:opacity-80"
                            style={{ backgroundColor: isSelected ? colors.bg.secondary : 'transparent', borderWidth: 1, borderColor: isSelected ? colors.text.primary : separatorColor }}
                          >
                            <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{account.bankName}</Text>
                            <Text style={{ color: colors.text.secondary }} className="text-sm mt-1">{account.accountName}</Text>
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">{account.accountNumber}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-4">
                <Text style={{ color: colors.text.primary }} className="font-semibold text-base">Send To Customer</Text>
                <Text style={{ color: colors.text.muted }} className="text-sm mt-1">Copy the bill preview and payment link message.</Text>
              </View>
              <Pressable
                onPress={handleCopyCustomerMessage}
                className="rounded-full items-center justify-center flex-row gap-2 px-5"
                style={{ height: 44, backgroundColor: messageCopied ? '#059669' : primaryButtonBg }}
              >
                {messageCopied ? <Check size={15} color="#FFFFFF" strokeWidth={2.5} /> : <Copy size={15} color={primaryButtonText} strokeWidth={2.2} />}
                <Text style={{ color: messageCopied ? '#FFFFFF' : primaryButtonText }} className="font-semibold text-sm">
                  {messageCopied ? 'Copied' : 'Copy Message'}
                </Text>
              </Pressable>
            </View>
            <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.secondary }}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold mb-2">BILL PREVIEW</Text>
              <Text style={{ color: colors.text.primary }} className="text-sm leading-6">{draft.billNote?.trim() || 'No bill details provided.'}</Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-3">Amount: {formatCurrency(draft.amount)}</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm mt-3" numberOfLines={1}>Payment link: {publicLink || `.../checkout?code=${draft.id}`}</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm mt-2">Your payment link expires in 24 hours.</Text>
            </View>
          </View>

          {isAdmin && !isDesktop ? (
            <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 12 }}>
                <View className="flex-1">
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base">Link Actions</Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-1">
                    Deactivate active links, or delete test payment links you no longer need.
                  </Text>
                </View>
                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10 }}>
                  {canDeactivateLink ? (
                    <Pressable
                      onPress={handleDeactivateLink}
                      disabled={isDeactivating}
                      className="rounded-full items-center justify-center flex-row gap-2 px-5"
                      style={{ height: 44, backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.24)' }}
                    >
                      {isDeactivating ? (
                        <ActivityIndicator color="#D97706" size="small" />
                      ) : (
                        <>
                          <Power size={15} color="#D97706" strokeWidth={2.4} />
                          <Text style={{ color: '#D97706' }} className="font-semibold text-sm">Deactivate Link</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={handleDeleteLink}
                    disabled={isDeleting}
                    className="rounded-full items-center justify-center flex-row gap-2 px-5"
                    style={{ height: 44, backgroundColor: 'rgba(220, 38, 38, 0.1)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.22)' }}
                  >
                    {isDeleting ? (
                      <ActivityIndicator color="#DC2626" size="small" />
                    ) : (
                      <>
                        <Trash2 size={15} color="#DC2626" strokeWidth={2.4} />
                        <Text style={{ color: '#DC2626' }} className="font-semibold text-sm">Delete Link</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? sectionGap : 0, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, width: isDesktop ? undefined : '100%' }}>
              <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
                <View className="flex-row items-center mb-3">
                  <Landmark size={16} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Payment Destination</Text>
                </View>
                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                  {draft.bankAccount.bankName}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '400', marginTop: 5 }} numberOfLines={1}>
                  {draft.bankAccount.accountName}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '400', marginTop: 3 }} numberOfLines={1}>
                  {draft.bankAccount.accountNumber}
                </Text>
              </View>

              <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
                <Text style={{ color: colors.text.primary }} className="font-semibold text-base mb-3">Customer</Text>
                {draft.customerName ? <InfoRow icon={User}>{draft.customerName}</InfoRow> : null}
                {draft.customerPhone ? <InfoRow icon={Phone}>{draft.customerPhone}</InfoRow> : null}
                {draft.customerEmail ? <InfoRow icon={Mail}>{draft.customerEmail}</InfoRow> : null}
                {deliveryLocationText ? (
                  <InfoRow icon={MapPin}>{deliveryLocationText}</InfoRow>
                ) : null}
                {!draft.customerName && !draft.customerPhone ? (
                  <Text style={{ color: colors.text.muted }} className="text-sm">Not submitted yet.</Text>
                ) : null}
                {draft.submittedAt ? (
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-3">
                    Submitted {new Date(draft.submittedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>
                ) : null}
              </View>
              {isDesktop ? renderActivityCard() : null}
            </View>

            <View style={{ width: isDesktop ? 420 : '100%' }}>
              {draft.billNote?.trim() ? (
                <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
                  <SectionTitle>Order Bill</SectionTitle>
                  <Text style={{ color: colors.text.primary }} className="text-sm leading-6">{draft.billNote}</Text>
                </View>
              ) : null}

              <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
                <SectionTitle>Payment Proof</SectionTitle>
                {draft.proofImageUrl ? (
                  <Pressable
                    onPress={() => setShowProofLightbox(true)}
                    className="flex-row items-center rounded-2xl p-3 active:opacity-75"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Image source={{ uri: draft.proofImageUrl }} style={{ width: 76, height: 76, borderRadius: 12, marginRight: 12 }} resizeMode="cover" />
                    <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Payment Proof</Text>
                      <Text style={{ color: colors.text.muted }} className="text-sm mt-1">Tap to view full image</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Text style={{ color: colors.text.muted }} className="text-sm">No payment proof submitted yet.</Text>
                )}
              </View>

              {linkedOrder ? (
                <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, marginBottom: sectionGap }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-base">Order Items</Text>
                    <Text style={{ color: colors.text.muted }} className="text-sm">{linkedOrder.orderNumber}</Text>
                  </View>

                  {linkedOrderItems.length === 0 ? (
                    <Text style={{ color: colors.text.muted }} className="text-sm">No order items yet.</Text>
                  ) : (
                    linkedOrderItems.map((item, index) => {
                      const labels = getOrderItemLabel(item);
                      return (
                        <View
                          key={`${item.productId}-${item.variantId}-${index}`}
                          className="flex-row items-center justify-between py-3"
                          style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: separatorColor }}
                        >
                          <View className="flex-1 mr-3">
                            <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{item.quantity}x {labels.title}</Text>
                            {labels.subtitle ? <Text style={{ color: colors.text.tertiary }} className="text-sm mt-0.5">{labels.subtitle}</Text> : null}
                          </View>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</Text>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {draft.convertedOrderId ? (
                <Pressable
                  onPress={() => router.push((Platform.OS === 'web' && isDesktop ? `/orders/${draft.convertedOrderId}` : `/order/${draft.convertedOrderId}`) as never)}
                  className="rounded-full items-center justify-center flex-row"
                  style={{ height: 48, backgroundColor: primaryButtonBg }}
                >
                  <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">View Converted Order</Text>
                </Pressable>
              ) : draft.status === 'verified' ? null : draft.status === 'payment_submitted' ? (
                <View className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(37, 99, 235, 0.08)', borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.2)' }}>
                  <Text style={{ color: '#2563EB' }} className="text-sm font-semibold">Approve this payment first</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">Order creation will unlock after approval.</Text>
                </View>
              ) : draft.status === 'cancelled' || draft.status === 'expired' || draft.status === 'rejected' ? (
                <View className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.2)' }}>
                  <Text style={{ color: '#DC2626' }} className="text-sm font-semibold">
                    {draft.status === 'rejected' ? 'Payment rejected' : 'Payment link inactive'}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                    {draft.status === 'rejected'
                      ? 'Order creation is locked because this payment proof was rejected.'
                      : 'This link cannot accept new payment submissions.'}
                  </Text>
                </View>
              ) : (
                <View className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(217, 119, 6, 0.08)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.25)' }}>
                  <Text style={{ color: '#D97706' }} className="text-sm font-semibold">Still waiting on the customer</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">They haven't submitted payment yet — nothing to review.</Text>
                </View>
              )}
            </View>
          </View>
          {!isDesktop ? (
          <View style={{ marginTop: sectionGap }}>
            {renderActivityCard()}
          </View>
          ) : null}
        </ScrollView>

        <Modal visible={showLinkOrderModal} animationType="fade" transparent onRequestClose={() => setShowLinkOrderModal(false)}>
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
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {candidateOrders.length > 0 ? (
                  candidateOrders.map((order) => {
                    const sameCustomer = Boolean(draft.customerName && order.customerName.trim().toLowerCase() === draft.customerName.trim().toLowerCase());
                    return (
                      <Pressable
                        key={order.id}
                        onPress={() => { void handleLinkExistingOrder(order); }}
                        className="rounded-2xl p-4 mb-2.5 active:opacity-75"
                        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}
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

        <Modal visible={showProofLightbox} animationType="fade" transparent onRequestClose={() => setShowProofLightbox(false)}>
          <Pressable className="flex-1 items-center justify-center px-5" style={{ backgroundColor: 'rgba(0,0,0,0.82)' }} onPress={() => setShowProofLightbox(false)}>
            <Pressable onPress={(e) => e.stopPropagation()} className="w-full" style={{ maxWidth: 860 }}>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: '#FFFFFF' }} className="text-sm font-semibold">Payment Proof</Text>
                <Pressable onPress={() => setShowProofLightbox(false)} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}>
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
