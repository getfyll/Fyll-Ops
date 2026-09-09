import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Image, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Mail, MapPin, House, Calendar, Tag, Package, Trash2, Edit2, X, Check, Truck, CreditCard, ChevronDown, RefreshCcw, Camera, Plus, Minus, Search, Printer, User as UserIcon, Percent, ChevronLeft, ChevronRight, FileText, Save, MessageSquare, MoreVertical, Send, Copy, Share2, ExternalLink } from 'lucide-react-native';
import useFyllStore, { formatCurrency, NIGERIA_STATES, LogisticsInfo, Refund, OrderItem, PrescriptionInfo, Case, type Order, type PartnerJob, type RefundRequestStatus, type SocialCheckoutDraft } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/lib/image-compression';
import DateTimePicker from '@react-native-community/datetimepicker';
import { PrescriptionSection } from '@/components/PrescriptionSection';
import { Button } from '@/components/Button';
import { CaseForm } from '@/components/CaseForm';
import { collaborationData } from '@/lib/supabase/collaboration';
import { sendThreadNotification } from '@/hooks/useWebPushNotifications';
import { formatRefundRequestStatusLabel, inferRefundRequestType } from '@/lib/refund-requests';
import { type RefundRequestAttachmentDraft, uploadRefundRequestAttachments } from '@/lib/refund-request-attachments';
import { canCreateRefundRequestForRole } from '@/lib/finance-access';
import { uploadBusinessAttachment, openAttachmentPath } from '@/lib/storage-attachments';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { getOrderQcChecklist, isOrderQcChecklistComplete, sanitizeOrderQcRequirements } from '@/lib/order-qc';
import { sortOrderStatusesForFulfillment } from '@/lib/order-status';
import { OrderFulfillmentSection } from '@/components/OrderFulfillmentSection';
import { FulfillmentEditModal } from '@/components/FulfillmentEditModal';
import { PartnerJobFormModal, type PartnerJobFormPrefill } from '@/components/PartnerJobFormModal';
import { getTeamThreadChannelById, getTeamThreadDisplayNameFromEntityId, isTeamThreadEntityId } from '@/lib/team-threads';
import { supabaseData } from '@/lib/supabase/data';
import { formatAddressValue, normalizeDeliveryStateValue } from '@/lib/format-address';

const STAMP_DUTY_THRESHOLD = 10000;
const DESKTOP_HEADER_ACTION_MENU_WIDTH = 238;
const MOBILE_HEADER_ACTION_MENU_WIDTH = 214;

type ProductPickerSearchResult = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  stock: number;
  price: number;
};

type OrderRelatedPayment = {
  id: string;
  source?: string;
  sourceOrderId?: string;
  linkedOrderId?: string | null;
  linkedOrderNumber?: string | null;
  amount?: number;
  status?: string;
};

type PaymentCardLink = {
  id: string;
  reference: string;
  label: string;
  amount: number;
  status: string;
  route: string;
};

const normalizePickerIdentity = (value: string) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getProductPickerIdentity = (result: ProductPickerSearchResult) => (
  normalizePickerIdentity(`${result.productName} ${result.variantName}`)
);

const shouldPreferProductPickerResult = (next: ProductPickerSearchResult, current: ProductPickerSearchResult) => {
  if ((next.stock > 0) !== (current.stock > 0)) return next.stock > 0;
  if (Boolean(next.variantName?.trim()) !== Boolean(current.variantName?.trim())) return Boolean(next.variantName?.trim());
  if (next.stock !== current.stock) return next.stock > current.stock;
  return next.productName.length < current.productName.length;
};

const getTransferChargeBreakdown = ({
  baseAmount,
  applyCharges,
  tiers,
  vatRate,
  stampDutyAmount,
}: {
  baseAmount: number;
  applyCharges: boolean;
  tiers: { maxAmount: number | null; fixedFee: number }[];
  vatRate: number;
  stampDutyAmount: number;
}) => {
  if (!applyCharges || baseAmount <= 0) {
    return { fee: 0, vat: 0, stampDuty: 0 };
  }
  const matchedTier = tiers.find((tier) => tier.maxAmount === null || baseAmount <= tier.maxAmount) ?? null;
  const fee = matchedTier?.fixedFee ?? 0;
  const vat = fee * vatRate;
  const stampDuty = baseAmount >= STAMP_DUTY_THRESHOLD ? stampDutyAmount : 0;
  return { fee, vat, stampDuty };
};

const parseMoneyInput = (value: string): number => {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const formatMoneyDraftValue = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const fixed = value.toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d*[1-9])0$/, '$1');
};

const isDispatchStatus = (status?: string) => (status ?? '').toLowerCase().includes('dispatch');
const isDeliveryConfirmationStatus = (status?: string) => (status ?? '').trim().toLowerCase() === 'delivery confirmation';
const normalizeSystemOrderStatus = (value?: string | null) => (
  String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
);
const toSystemOrderStatusLabel = (value?: string | null) => {
  const normalized = normalizeSystemOrderStatus(value);
  if (!normalized) return 'Select status';
  return normalized.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};
const getSystemOrderStatusDisplay = (status?: string | null, fallbackColor = '#6B7280') => {
  const normalized = normalizeSystemOrderStatus(status);
  const map: Record<string, { label: string; color: string; bg: string }> = {
    'awaiting payment': { label: 'Awaiting Payment', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'payment approval': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    verified: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    paid: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    confirmed: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    'payment confirmed': { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    processing: { label: 'Processing', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    preparing: { label: 'Preparing', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    packed: { label: 'Packed', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
    dispatched: { label: 'Dispatched', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    dispatch: { label: 'Dispatch', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    shipped: { label: 'Shipped', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    delivered: { label: 'Delivered', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    completed: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    cancelled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    canceled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    failed: { label: 'Failed', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    refunded: { label: 'Refunded', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  };
  return map[normalized] ?? { label: toSystemOrderStatusLabel(status), color: fallbackColor, bg: `${fallbackColor}20` };
};
const isSocialCheckoutPaymentOrder = (order: Pick<Order, 'source' | 'websiteOrderReference'>) => (
  /^SC-/i.test(order.websiteOrderReference ?? '') || (order.source ?? '').toLowerCase().includes('social checkout')
);
const formatOrderSourcePart = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return /^fyll\s*storefront$/i.test(trimmed) || /^storefront$/i.test(trimmed)
    ? 'Storefront'
    : trimmed;
};
const getOrderSourceDisplay = (order: Pick<Order, 'orderClassification' | 'source'>) => {
  const parts = [
    formatOrderSourcePart(order.orderClassification ?? 'Sale'),
    formatOrderSourcePart(order.source),
  ].filter(Boolean);
  return parts.filter((part, index) => parts.indexOf(part) === index).join(' · ');
};

export default function OrderDetailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const insets = useSafeAreaInsets();
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const shouldReturnToFinanceRevenue = returnTarget === 'finance-revenue';
  const { isDesktop, width } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const isNarrowWeb = Platform.OS === 'web' && width < 1280;
  const webMaxWidth = 1456;
  const rightColumnWidth = isWebDesktop ? (isNarrowWeb ? Math.max(320, Math.round(width * 0.3)) : 420) : undefined;

  const orders = useFyllStore((s) => s.orders);
  const products = useFyllStore((s) => s.products);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const qcChecklistRequirements = useFyllStore((s) => s.qcChecklistRequirements);
  const logisticsCarriers = useFyllStore((s) => s.logisticsCarriers);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const saleSources = useFyllStore((s) => s.saleSources);
  const cases = useFyllStore((s) => s.cases);
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const refundRequests = useFyllStore((s) => s.refundRequests);
  const financeRules = useFyllStore((s) => s.financeRules);
  const addCase = useFyllStore((s) => s.addCase);
  const addRefundRequest = useFyllStore((s) => s.addRefundRequest);
  const updateOrder = useFyllStore((s) => s.updateOrder);
  const cancelOrder = useFyllStore((s) => s.cancelOrder);
  const deleteOrder = useFyllStore((s) => s.deleteOrder);
  const updateVariantStock = useFyllStore((s) => s.updateVariantStock);
  const currentUser = useAuthStore((s) => s.currentUser);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);

  const [draft, setDraft] = useState<Partial<Order>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setDraft({});
  }, [id]);

  const handleBack = () => {
    if (shouldReturnToFinanceRevenue) {
      router.replace('/finance?section=revenue' as any);
      return;
    }
    router.back();
  };

  const baseOrder = useMemo(() => orders.find((o) => o.id === id), [orders, id]);
  const order = useMemo((): Order | undefined => {
    if (!baseOrder) return undefined;
    return { ...baseOrder, ...draft } as Order;
  }, [baseOrder, draft]);
  const statusColor = useMemo(() => {
    const status = orderStatuses.find((s) => s.name === order?.status);
    return status?.color || '#6B7280';
  }, [orderStatuses, order?.status]);
  const activeStatus = draft.status ?? order?.status ?? '';
  const selectedOrderStatus = useMemo(() => {
    return orderStatuses.find((status) => status.name === activeStatus) ?? null;
  }, [activeStatus, orderStatuses]);
  const activeStatusDisplay = getSystemOrderStatusDisplay(activeStatus, selectedOrderStatus?.color ?? statusColor);
  const orderedOrderStatuses = useMemo(() => (
    sortOrderStatusesForFulfillment(orderStatuses)
  ), [orderStatuses]);
  const canSendDeliveryConfirmationEmail = Boolean(order?.customerEmail?.trim()) && !isOfflineMode;
  const showDeliveryConfirmationTrigger = isDeliveryConfirmationStatus(activeStatus);

  useEffect(() => {
    if (!showDeliveryConfirmationTrigger) {
      setSendDeliveryConfirmationEmail(false);
    }
  }, [showDeliveryConfirmationTrigger]);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [showQcModal, setShowQcModal] = useState(false);
  const [showQcDetails, setShowQcDetails] = useState(false);
  const [showHeaderActionMenu, setShowHeaderActionMenu] = useState(false);
  const [isSharingOrderToThread, setIsSharingOrderToThread] = useState(false);
  const [headerActionMenuAnchor, setHeaderActionMenuAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editState, setEditState] = useState('');
  const [editDeliveryFee, setEditDeliveryFee] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editWebsiteOrderRef, setEditWebsiteOrderRef] = useState('');
  const [editDiscountCode, setEditDiscountCode] = useState('');
  const [editDiscountAmount, setEditDiscountAmount] = useState('');
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Logistics edit state
  const [showLogisticsModal, setShowLogisticsModal] = useState(false);
  const [editCarrierId, setEditCarrierId] = useState('');
  const [editCarrierName, setEditCarrierName] = useState('');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editDatePickedUp, setEditDatePickedUp] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  // Refund modal state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showRefundRequestModal, setShowRefundRequestModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState(new Date());
  const [refundReason, setRefundReason] = useState('');
  const [refundProofUri, setRefundProofUri] = useState('');
  const [refundRequestAttachments, setRefundRequestAttachments] = useState<RefundRequestAttachmentDraft[]>([]);
  const [refundRequestUploadError, setRefundRequestUploadError] = useState('');
  const [showRefundDatePicker, setShowRefundDatePicker] = useState(false);
  const [applyRefundBankCharges, setApplyRefundBankCharges] = useState(true);
  const [refundBankChargeDraft, setRefundBankChargeDraft] = useState('0');
  const [refundStampDutyDraft, setRefundStampDutyDraft] = useState('0');
  const [refundBankChargeManuallyEdited, setRefundBankChargeManuallyEdited] = useState(false);
  const [refundStampDutyManuallyEdited, setRefundStampDutyManuallyEdited] = useState(false);
  const [qcUploadError, setQcUploadError] = useState('');
  const [qcUploading, setQcUploading] = useState(false);
  const [sendDeliveryConfirmationEmail, setSendDeliveryConfirmationEmail] = useState(false);

  // Cases
  const [showCaseForm, setShowCaseForm] = useState(false);
  const headerActionButtonRef = useRef<any>(null);

  // Partner jobs
  const [showSendToPartnerModal, setShowSendToPartnerModal] = useState(false);
  const [partnerJobPrefill, setPartnerJobPrefill] = useState<PartnerJobFormPrefill>({});

  const orderCases = useMemo(() => {
    return cases.filter((caseItem) => caseItem.orderId === order?.id);
  }, [cases, order?.id]);

  const orderPartnerJobs = useMemo(() => {
    return partnerJobs.filter((job) => job.orderId === order?.id);
  }, [partnerJobs, order?.id]);

  const latestRefundRequest = useMemo(() => {
    const matchingRequests = refundRequests
      .filter((request) => request.orderId === order?.id)
      .sort((left, right) => {
        const leftAt = new Date(left.updatedAt ?? left.createdAt).getTime();
        const rightAt = new Date(right.updatedAt ?? right.createdAt).getTime();
        return rightAt - leftAt;
      });
    return matchingRequests[0] ?? null;
  }, [order?.id, refundRequests]);

  const orderThreadQuery = useQuery({
    queryKey: ['collaboration-thread-existing', businessId, 'order', order?.id],
    enabled: Boolean(businessId) && Boolean(order?.id) && !isOfflineMode,
    queryFn: () => collaborationData.getThreadByEntity(businessId as string, 'order', order!.id),
  });

  const relatedPaymentQuery = useQuery({
    queryKey: ['order-related-payment', businessId, order?.id, order?.orderNumber, order?.websiteOrderReference],
    enabled: Boolean(businessId) && Boolean(order?.id) && !isOfflineMode,
    queryFn: async (): Promise<PaymentCardLink | null> => {
      if (!businessId || !order) return null;
      const [paymentRows, socialRows] = await Promise.all([
        supabaseData.fetchCollection<OrderRelatedPayment>('payments', businessId, { orderBy: 'updated_at', limit: 500 }),
        supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId, { orderBy: 'updated_at', limit: 500 }),
      ]);

      const orderKeys = [
        order.id,
        order.orderNumber,
        order.websiteOrderReference,
        order.fyllCheckout?.reference,
      ].map((value) => String(value ?? '').trim()).filter(Boolean);

      const matchedPayment = paymentRows
        .map((row) => row.data)
        .find((payment) => {
          const paymentKeys = [
            payment.linkedOrderId,
            payment.linkedOrderNumber,
            payment.sourceOrderId,
          ].map((value) => String(value ?? '').trim()).filter(Boolean);
          return paymentKeys.some((value) => orderKeys.includes(value));
        });

      if (matchedPayment) {
        return {
          id: matchedPayment.id,
          reference: matchedPayment.sourceOrderId?.trim() || matchedPayment.id,
          label: matchedPayment.source?.trim().toLowerCase() === 'fyll_checkout' ? 'Fyll Checkout payment' : 'Storefront payment',
          amount: Number(matchedPayment.amount ?? 0),
          status: matchedPayment.status ?? 'Payment',
          route: `/storefront-payment/${matchedPayment.id}`,
        };
      }

      const matchedSocialCheckout = socialRows
        .map((row) => row.data)
        .find((draft) => (
          draft.convertedOrderId === order.id
          || draft.id === order.websiteOrderReference
          || draft.id === order.fyllCheckout?.reference
        ));

      if (matchedSocialCheckout) {
        return {
          id: matchedSocialCheckout.id,
          reference: matchedSocialCheckout.id,
          label: 'Social Checkout payment',
          amount: Number(matchedSocialCheckout.amount ?? 0),
          status: matchedSocialCheckout.status,
          route: `/social-checkout/${matchedSocialCheckout.id}`,
        };
      }

      return null;
    },
  });

  // Product search results for editing - must be before early return
  const refund = order?.refund;
  const hasRefund = refund?.amount != null && refund.amount > 0;
  const isAdmin = currentUser?.role === 'admin';
  const canCreateRefundRequest = canCreateRefundRequestForRole(currentUser?.role ?? 'staff');
  const currentUserId = currentUser?.id ?? '';
  const currentUserName = currentUser?.name || currentUser?.email || 'Team Member';
  const refundBaseAmount = useMemo(() => {
    const parsed = Number.parseFloat(refundAmount);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [refundAmount]);
  const refundTransferBreakdown = useMemo(() => getTransferChargeBreakdown({
    baseAmount: refundBaseAmount,
    applyCharges: applyRefundBankCharges,
    tiers: financeRules.bankChargeTiers,
    vatRate: financeRules.vatRate,
    stampDutyAmount: financeRules.incomingStampDuty ?? 50,
  }), [applyRefundBankCharges, financeRules.bankChargeTiers, financeRules.incomingStampDuty, financeRules.vatRate, refundBaseAmount]);
  const computedRefundBankChargeAmount = refundTransferBreakdown.fee + refundTransferBreakdown.vat;
  const computedRefundStampDuty = refundTransferBreakdown.stampDuty;

  useEffect(() => {
    if (!refundBankChargeManuallyEdited) {
      setRefundBankChargeDraft(formatMoneyDraftValue(computedRefundBankChargeAmount));
    }
  }, [computedRefundBankChargeAmount, refundBankChargeManuallyEdited]);

  useEffect(() => {
    if (!refundStampDutyManuallyEdited) {
      setRefundStampDutyDraft(formatMoneyDraftValue(computedRefundStampDuty));
    }
  }, [computedRefundStampDuty, refundStampDutyManuallyEdited]);

  const refundBankChargeAmount = applyRefundBankCharges
    ? (refundBankChargeManuallyEdited ? parseMoneyInput(refundBankChargeDraft) : computedRefundBankChargeAmount)
    : 0;
  const refundStampDuty = applyRefundBankCharges
    ? (refundStampDutyManuallyEdited ? parseMoneyInput(refundStampDutyDraft) : computedRefundStampDuty)
    : 0;
  const qcPhotos = order?.qcPhotos ?? [];
  const qcVerified = order?.qcVerified ?? false;
  const qcRequirements = useMemo(
    () => sanitizeOrderQcRequirements(qcChecklistRequirements, false),
    [qcChecklistRequirements]
  );
  const qcChecklist = getOrderQcChecklist(order);
  const qcChecklistComplete = isOrderQcChecklistComplete(order, qcRequirements);
  const qcReady = qcVerified && qcPhotos.length > 0 && qcChecklistComplete;
  const refundTotalDebit = refundBaseAmount + refundBankChargeAmount + refundStampDuty;

  const productSearchResults = useMemo(() => {
    if (!productSearchQuery.trim()) return [];
    const query = productSearchQuery.toLowerCase();
    const resultsByIdentity = new Map<string, ProductPickerSearchResult>();
    products.forEach((product) => {
      if (product.isDiscontinued || product.isArchived || product.catalogSource === 'woocommerce-plugin') return;
      product.variants.forEach((variant) => {
        const variantName = Object.values(variant.variableValues).join(' ');
        const matchesProduct = product.name.toLowerCase().includes(query);
        const matchesVariant = variantName.toLowerCase().includes(query);
        if (matchesProduct || matchesVariant) {
          const result: ProductPickerSearchResult = {
            productId: product.id,
            productName: product.name,
            variantId: variant.id,
            variantName,
            stock: variant.stock,
            price: variant.sellingPrice,
          };
          const identity = getProductPickerIdentity(result);
          const existing = resultsByIdentity.get(identity);
          if (!existing || shouldPreferProductPickerResult(result, existing)) {
            resultsByIdentity.set(identity, result);
          }
        }
      });
    });
    return Array.from(resultsByIdentity.values());
  }, [productSearchQuery, products]);

  // Calculate edited order totals - must be before early return
  const editedSubtotal = useMemo(() => {
    return editItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [editItems]);

  const editedTotal = useMemo(() => {
    return editedSubtotal + (parseFloat(editDeliveryFee) || 0) - (parseFloat(editDiscountAmount) || 0);
  }, [editedSubtotal, editDeliveryFee, editDiscountAmount]);

  // Filter out generic "Updated order" entries when there's a more specific action at the same time
  const filteredActivityLog = useMemo(() => {
    const activityLog = order?.activityLog;
    if (!activityLog) return [];

    return activityLog
      .filter((entry, index, arr) => {
        // Keep all non-"Updated order" entries
        if (entry.action !== 'Updated order') return true;

        // For "Updated order" entries, check if there's a more specific entry at the same time
        const hasSpecificEntry = arr.some((other, otherIndex) =>
          otherIndex !== index &&
          other.staffName === entry.staffName &&
          Math.abs(new Date(other.date).getTime() - new Date(entry.date).getTime()) < 2000 &&
          other.action !== 'Updated order'
        );

        // Only keep "Updated order" if there's no more specific entry
        return !hasSpecificEntry;
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [order?.activityLog]);

  const headerActionMenuPosition = useMemo(() => {
    const menuWidth = isWebDesktop ? DESKTOP_HEADER_ACTION_MENU_WIDTH : MOBILE_HEADER_ACTION_MENU_WIDTH;
    if (isWebDesktop && headerActionMenuAnchor) {
      const desiredLeft = headerActionMenuAnchor.x + headerActionMenuAnchor.width - menuWidth;
      const boundedLeft = Math.min(
        Math.max(16, desiredLeft),
        Math.max(16, width - menuWidth - 16)
      );
      return {
        top: headerActionMenuAnchor.y + headerActionMenuAnchor.height + 10,
        left: boundedLeft,
        width: menuWidth,
      };
    }

    return {
      top: isWebDesktop ? Math.max(8, insets.top + 94) : Math.max(8, insets.top + 58),
      right: isWebDesktop ? 20 : 16,
      width: menuWidth,
    };
  }, [headerActionMenuAnchor, insets.top, isWebDesktop, width]);

  const headerActionMenuTextStyle = {
    fontSize: isWebDesktop ? 14 : 12,
    fontWeight: isWebDesktop ? '500' as const : '600' as const,
    marginLeft: 12,
  };

  if (!order) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.tertiary }} className="text-lg">Order not found</Text>
        <Pressable onPress={handleBack} className="mt-4 active:opacity-50">
          <Text style={{ color: colors.text.secondary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const orderDateSource = order.orderDate ?? order.createdAt;
  const orderDate = new Date(orderDateSource).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Status badge (handles refund states)
  const refundAmountValue = order.refund?.amount ?? 0;
  const isRefunded = order.status === 'Refunded' || refundAmountValue > 0;
  const isFullRefund = refundAmountValue > 0 && refundAmountValue >= order.totalAmount;
  const isPartialRefund = refundAmountValue > 0 && refundAmountValue < order.totalAmount;
  const isCancelled = order.status.toLowerCase().includes('cancel');

  let displayStatus = order.status;
  let badgeBgColor = `${statusColor}20`;
  let badgeTextColor = statusColor;

  if (isFullRefund) {
    displayStatus = 'Full Refund';
    badgeBgColor = 'rgba(239, 68, 68, 0.15)';
    badgeTextColor = '#EF4444';
  } else if (isPartialRefund) {
    displayStatus = 'Partial Refund';
    badgeBgColor = 'rgba(239, 68, 68, 0.15)';
    badgeTextColor = '#EF4444';
  } else if (isRefunded) {
    badgeBgColor = 'rgba(239, 68, 68, 0.15)';
    badgeTextColor = '#EF4444';
  } else if (isCancelled) {
    badgeBgColor = 'rgba(107, 114, 128, 0.15)';
    badgeTextColor = '#6B7280';
  }

  const relatedPayment = relatedPaymentQuery.data ?? null;
  const deliveryAddressText = formatAddressValue(order.deliveryAddress);
  const deliveryStateText = normalizeDeliveryStateValue(order.deliveryState, order.deliveryAddress);
  const hasOrderServices = Boolean(order.services?.length);
  const hasDeliveryFee = order.deliveryFee > 0;
  const hasDiscountAmount = Boolean(order.discountAmount && order.discountAmount > 0);
  const hasRefundAmount = Boolean(order.refund && order.refund.amount > 0);
  const shouldShowSubtotal = hasOrderServices || hasDeliveryFee || hasDiscountAmount || hasRefundAmount;

  const getItemDetails = (item: typeof order.items[0]) => {
    const product = products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues).join(' / ') : (item.variantName ?? '');
    const productName = product?.name || item.productName || '';
    const imageUrl = variant?.imageUrl?.trim() || product?.imageUrl?.trim() || '';
    return { productName, variantName, sku: variant?.sku || '', imageUrl, isLoading: !productName && products.length === 0 };
  };

  const mergeDraftUpdates = (updates: Partial<Order>) => {
    if (!baseOrder) return;
    setDraft((prev) => {
      const next: Partial<Order> = { ...prev };
      Object.entries(updates).forEach(([key, value]) => {
        const baseValue = (baseOrder as any)[key];
        const equal = value === baseValue || JSON.stringify(value) === JSON.stringify(baseValue);
        if (equal || typeof value === 'undefined') {
          delete (next as any)[key];
        } else {
          (next as any)[key] = value;
        }
      });
      return next;
    });
  };

  const hasPendingDeliveryConfirmationEmail = showDeliveryConfirmationTrigger && sendDeliveryConfirmationEmail && canSendDeliveryConfirmationEmail;
  const hasUnsavedChanges = Object.keys(draft).length > 0 || hasPendingDeliveryConfirmationEmail;

  const applyStockDeltaForItemsChange = async (previous: OrderItem[], next: OrderItem[]) => {
    const toMap = (items: OrderItem[]) => {
      const map = new Map<string, { productId: string; variantId: string; qty: number }>();
      items.forEach((item) => {
        const key = `${item.productId}:${item.variantId}`;
        const existing = map.get(key);
        const qty = (existing?.qty ?? 0) + item.quantity;
        map.set(key, { productId: item.productId, variantId: item.variantId, qty });
      });
      return map;
    };

    const prevMap = toMap(previous);
    const nextMap = toMap(next);
    const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);
    await Promise.all(Array.from(keys).map((key) => {
      const prevQty = prevMap.get(key)?.qty ?? 0;
      const nextQty = nextMap.get(key)?.qty ?? 0;
      const delta = prevQty - nextQty;
      if (delta === 0) return Promise.resolve();
      const info = prevMap.get(key) ?? nextMap.get(key);
      if (!info) return Promise.resolve();
      return updateVariantStock(info.productId, info.variantId, delta, businessId);
    }));
  };

  const handleSaveAll = async () => {
    if (!baseOrder) return;
    if (!hasUnsavedChanges) return;
    if (draft.status && isDispatchStatus(draft.status) && !qcReady) {
      showToast('error', 'Complete QC checklist, add proof, and verify before dispatching.');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const updatedBy = currentUser?.name || currentUser?.email || 'Staff';
    const updatedAt = new Date().toISOString();
    const updates: Partial<Order> = { ...draft };
    if (showDeliveryConfirmationTrigger && sendDeliveryConfirmationEmail && canSendDeliveryConfirmationEmail) {
      updates.deliveryConfirmationRequestedAt = updatedAt;
      updates.deliveryConfirmationStatus = 'requested';
      updates.deliveryConfirmationConfirmedAt = undefined;
      updates.deliveryConfirmationLastResponseAt = undefined;
    }

    if (updates.items) {
      await applyStockDeltaForItemsChange(baseOrder.items, updates.items);
    }

    try {
      await updateOrder(order.id, { ...updates, updatedBy, updatedAt }, businessId);
      setDraft({});
      setSendDeliveryConfirmationEmail(false);
      showToast('success', isOfflineMode ? 'Saved locally (offline).' : 'Order updated.');
    } catch (error) {
      console.warn('Order save failed:', error);
      showToast('error', 'Could not save. Please try again.');
    }
  };

  const handleSaveQcAndClose = async () => {
    if (hasUnsavedChanges) {
      await handleSaveAll();
    }
    setShowQcModal(false);
    if (qcReady) {
      setShowQcDetails(false);
    }
  };

  const handleSaveFulfillment = async (updates: Partial<Order>) => {
    if (!order) return;
    const nextDraft = { ...draft, ...updates };
    const nextStatus = nextDraft.status ?? order.status;
    if (isDispatchStatus(nextStatus) && !qcReady) {
      showToast('error', 'Complete QC checklist, add proof, and verify before dispatching.');
      return;
    }
    const updatedBy = currentUser?.name || currentUser?.email || 'Staff';
    const updatedAt = new Date().toISOString();
    try {
      await updateOrder(order.id, { ...nextDraft, updatedBy, updatedAt }, businessId);
      setDraft({});
      showToast('success', isOfflineMode ? 'Saved locally (offline).' : 'Fulfillment updated.');
    } catch (error) {
      console.warn('Fulfillment save failed:', error);
      showToast('error', 'Could not save fulfillment. Please try again.');
      throw error;
    }
  };

  const handleUpdateStatus = (newStatus: string) => {
    if (isDispatchStatus(newStatus) && !qcReady) {
      showToast('error', 'Complete QC checklist, add proof, and verify before dispatching.');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    mergeDraftUpdates({ status: newStatus });
    if (isDeliveryConfirmationStatus(newStatus) && !isDeliveryConfirmationStatus(baseOrder?.status) && Boolean(order.customerEmail?.trim()) && !isOfflineMode) {
      setSendDeliveryConfirmationEmail(true);
    }
    if (!isDeliveryConfirmationStatus(newStatus)) {
      setSendDeliveryConfirmationEmail(false);
    }
    setShowStatusModal(false);
  };

  const handleOpenEdit = () => {
    setShowHeaderActionMenu(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/order-edit/${order.id}${shouldReturnToFinanceRevenue ? '?returnTo=finance-revenue' : ''}` as any);
  };

  const handleOpenThread = async () => {
    setShowHeaderActionMenu(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (businessId && !isOfflineMode && !orderThreadQuery.data) {
        await collaborationData.getOrCreateThread(businessId, 'order', order.id);
      }
    } catch (error) {
      console.warn('Failed to initialize order thread:', error);
    } finally {
      router.push(`/threads?orderId=${order.id}`);
    }
  };

  const handleCopyThreadMessage = async () => {
    setShowHeaderActionMenu(false);
    try {
      await Clipboard.setStringAsync(buildOrderThreadMessage());
      showToast('success', 'Order message copied.');
    } catch (error) {
      console.warn('Copy order thread message failed:', error);
      showToast('error', 'Could not copy order message.');
    }
  };

  const handleShareOrderToGeneralThread = async () => {
    setShowHeaderActionMenu(false);
    if (!businessId || isOfflineMode) {
      showToast('error', 'Threads are unavailable while offline.');
      return;
    }

    const generalThread = getTeamThreadChannelById('hq-general');
    if (!generalThread) {
      showToast('error', 'General thread is not available.');
      return;
    }

    setIsSharingOrderToThread(true);
    try {
      const existingGeneralThread = await collaborationData.getThreadByEntity(businessId, 'case', generalThread.entityId);
      const fallbackTeamThreads = existingGeneralThread
        ? []
        : (await collaborationData.listThreadsByEntityType(businessId, 'case'))
          .filter((summary) => isTeamThreadEntityId(summary.thread.entity_id));
      const thread = existingGeneralThread ?? (fallbackTeamThreads.length === 1 ? fallbackTeamThreads[0].thread : null);
      if (!thread) {
        showToast('error', 'No existing general thread found. Use Copy Thread Message instead.');
        return;
      }
      await collaborationData.createComment({
        businessId,
        threadId: thread.id,
        body: buildOrderThreadMessage(),
      });

      const nowIso = new Date().toISOString();
      await updateOrder(order.id, {
        updatedAt: nowIso,
        updatedBy: currentUserName,
        activityLog: [
          ...(order.activityLog ?? []),
          {
            staffName: currentUserName,
            action: `Shared order to ${getTeamThreadDisplayNameFromEntityId(thread.entity_id)}`,
            date: nowIso,
          },
        ],
      }, businessId);

      showToast('success', `Order shared to ${getTeamThreadDisplayNameFromEntityId(thread.entity_id)}.`);
    } catch (error) {
      console.warn('Share order to thread failed:', error);
      showToast('error', 'Could not share to thread. Use Copy Thread Message instead.');
    } finally {
      setIsSharingOrderToThread(false);
    }
  };

  const handleOpenHeaderActionMenu = () => {
    const buttonNode = headerActionButtonRef.current;
    if (buttonNode?.measureInWindow) {
      buttonNode.measureInWindow((x: number, y: number, measuredWidth: number, measuredHeight: number) => {
        setHeaderActionMenuAnchor({ x, y, width: measuredWidth, height: measuredHeight });
        setShowHeaderActionMenu(true);
      });
      return;
    }
    setShowHeaderActionMenu(true);
  };

  const handleCreateCase = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCaseForm(true);
  };

  const handleSaveCase = async (caseData: Case) => {
    await addCase(caseData, businessId);
  };

  const handleSendToPartner = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!order) return;
    const firstItem = order.items?.[0];
    const itemDetails = firstItem ? getItemDetails(firstItem) : null;
    setPartnerJobPrefill({
      orderId: order.id,
      customerName: order.customerName || '',
      itemLabel: itemDetails?.productName || '',
      imageUri: itemDetails?.imageUrl || null,
    });
    setShowSendToPartnerModal(true);
  };

  const handlePartnerJobSaved = (job: PartnerJob) => {
    if (!order) return;
    const partner = partners.find((p) => p.id === job.partnerId);
    showToast('success', `Sent to ${partner?.name ?? 'partner'}`);
    updateOrder(order.id, {
      activityLog: [
        ...(order.activityLog ?? []),
        {
          staffName: currentUserName,
          action: `Sent to partner: ${partner?.name ?? 'partner'}`,
          date: new Date().toISOString(),
        },
      ],
    }, businessId);
  };

  const handleAddEditItem = (result: { productId: string; variantId: string; price: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existingIndex = editItems.findIndex(
      (item) => item.productId === result.productId && item.variantId === result.variantId
    );
    if (existingIndex >= 0) {
      const newItems = [...editItems];
      newItems[existingIndex].quantity += 1;
      setEditItems(newItems);
    } else {
      setEditItems([...editItems, {
        productId: result.productId,
        variantId: result.variantId,
        quantity: 1,
        unitPrice: result.price
      }]);
    }
    setProductSearchQuery('');
    setShowProductSearch(false);
  };

  const handleUpdateEditItemQty = (index: number, delta: number) => {
    const newItems = [...editItems];
    const newQty = newItems[index].quantity + delta;
    if (newQty <= 0) {
      newItems.splice(index, 1);
    } else {
      newItems[index].quantity = newQty;
    }
    setEditItems(newItems);
  };

  const handleRemoveEditItem = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const getEditItemDetails = (item: OrderItem) => {
    const product = products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues).join(' / ') : (item.variantName ?? '');
    const productName = product?.name || item.productName || '';
    return { productName: productName || 'Product unavailable', variantName };
  };

  const handleSaveEdit = () => {
    if (editItems.length === 0) {
      Alert.alert('No Products', 'Order must have at least one product.');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    mergeDraftUpdates({
      customerName: editName.trim(),
      customerPhone: editPhone.trim(),
      customerEmail: editEmail.trim(),
      deliveryAddress: editAddress.trim(),
      deliveryState: editState,
      deliveryFee: parseFloat(editDeliveryFee) || 0,
      discountCode: editDiscountCode.trim() || undefined,
      discountAmount: parseFloat(editDiscountAmount) || undefined,
      paymentMethod: editPaymentMethod,
      source: editSource,
      websiteOrderReference: editWebsiteOrderRef.trim() || undefined,
      items: editItems,
      subtotal: editedSubtotal,
      totalAmount: editedTotal,
    });
    setShowEditModal(false);
  };

  const handleOpenLogistics = () => {
    console.log('[Logistics] Opening logistics modal');
    console.log('[Logistics] Current logistics data:', order.logistics);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEditCarrierId(order.logistics?.carrierId || '');
    setEditCarrierName(order.logistics?.carrierName || '');
    setEditTrackingNumber(order.logistics?.trackingNumber || '');
    const existingDate = order.logistics?.datePickedUp ? new Date(order.logistics.datePickedUp) : null;
    console.log('[Logistics] Existing datePickedUp:', existingDate?.toISOString());
    setEditDatePickedUp(existingDate);
    setShowCarrierDropdown(false);
    setShowLogisticsModal(true);
  };

  const handleSaveLogistics = () => {
    console.log('[Logistics] Saving logistics...');
    console.log('[Logistics] Carrier:', editCarrierName);
    console.log('[Logistics] Tracking:', editTrackingNumber);
    console.log('[Logistics] Date Picked Up:', editDatePickedUp?.toISOString());

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const logistics: LogisticsInfo = {
      carrierId: editCarrierId,
      carrierName: editCarrierName,
      trackingNumber: editTrackingNumber.trim(),
      dispatchDate: order.logistics?.dispatchDate || new Date().toISOString(),
      datePickedUp: editDatePickedUp?.toISOString(),
    };
    console.log('[Logistics] Final logistics object:', logistics);
    mergeDraftUpdates({ logistics });
    console.log('[Logistics] Save complete');
    setShowLogisticsModal(false);
  };

  const handleSelectCarrier = (carrierId: string, carrierName: string) => {
    setEditCarrierId(carrierId);
    setEditCarrierName(carrierName);
    setShowCarrierDropdown(false);
  };

  const handleOpenRefund = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (order.refund) {
      setRefundAmount(String(order.refund.amount));
      setRefundDate(new Date(order.refund.date));
      setRefundReason(order.refund.reason);
      setRefundProofUri(order.refund.proofImageUri || '');
    } else {
      setRefundAmount(String(order.totalAmount));
      setRefundDate(new Date());
      setRefundReason('');
      setRefundProofUri('');
    }
    setShowRefundModal(true);
  };

  const handleOpenRefundRequest = () => {
    if (!canCreateRefundRequest) {
      showToast('error', 'Only managers and admins can create refund requests.');
      return;
    }
    const remainingRefundable = Math.max(0, order.totalAmount - (order.refund?.amount ?? 0));
    setRefundAmount(remainingRefundable > 0 ? String(remainingRefundable) : '');
    setRefundDate(new Date());
    setRefundReason('');
    setRefundRequestAttachments([]);
    setRefundRequestUploadError('');
    setApplyRefundBankCharges(true);
    setRefundBankChargeDraft('0');
    setRefundStampDutyDraft('0');
    setRefundBankChargeManuallyEdited(false);
    setRefundStampDutyManuallyEdited(false);
    setShowRefundRequestModal(true);
  };

  const handlePickRefundRequestAttachment = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });

      if (result.canceled || !result.assets.length) return;

      const nextAsset = result.assets[0];
      const attachment: RefundRequestAttachmentDraft = {
        id: Math.random().toString(36).slice(2, 15),
        fileName: nextAsset.fileName || `refund-screenshot-${refundRequestAttachments.length + 1}.jpg`,
        localUri: nextAsset.uri,
        mimeType: nextAsset.mimeType ?? null,
        fileSize: typeof nextAsset.fileSize === 'number' ? nextAsset.fileSize : null,
      };

      setRefundRequestAttachments((previous) => {
        const alreadyExists = previous.some((item) => item.localUri === attachment.localUri && item.fileName === attachment.fileName);
        return alreadyExists ? previous : [...previous, attachment];
      });
      setRefundRequestUploadError('');
    } catch (error) {
      console.warn('Refund request screenshot picker failed:', error);
      setRefundRequestUploadError('Could not select screenshot. Please try again.');
    }
  };

  const handlePickRefundProof = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const compressedUri = await compressImage(result.assets[0].uri);
      setRefundProofUri(compressedUri);
    }
  };

  const handleAddQcPhoto = async () => {
    if (!businessId) {
      showToast('error', 'Could not upload QC photos right now.');
      return;
    }
    if (qcPhotos.length >= 5) {
      showToast('error', 'Maximum of 5 QC photos per order.');
      return;
    }
    setQcUploadError('');
    setQcUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      const compressedUri = await compressImage(asset.uri, { maxDimension: 1400, quality: 0.65 });
      const upload = await uploadBusinessAttachment({
        businessId,
        folder: `orders/${order.id}/qc`,
        uri: compressedUri,
        fileName: asset.fileName || `qc-${qcPhotos.length + 1}.jpg`,
        mimeType: asset.mimeType ?? null,
        compressImages: false,
      });
      mergeDraftUpdates({ qcPhotos: [...qcPhotos, upload.storagePath] });
    } catch (error) {
      console.warn('QC photo upload failed:', error);
      setQcUploadError('Could not upload QC photo. Please try again.');
      showToast('error', 'Could not upload QC photo.');
    } finally {
      setQcUploading(false);
    }
  };

  const handleRemoveQcPhoto = (index: number) => {
    const nextPhotos = qcPhotos.filter((_, idx) => idx !== index);
    mergeDraftUpdates({
      qcPhotos: nextPhotos,
      ...(nextPhotos.length === 0 ? { qcVerified: false, qcVerifiedBy: undefined, qcVerifiedAt: undefined } : {}),
    });
  };

  const handleToggleQcChecklistItem = (key: string) => {
    const nextChecklist = qcChecklist.includes(key)
      ? qcChecklist.filter((item) => item !== key)
      : [...qcChecklist, key];
    const nextChecklistComplete = qcRequirements.every((item) => nextChecklist.includes(item.key));
    mergeDraftUpdates({
      qcChecklist: nextChecklist,
      ...(!nextChecklistComplete ? { qcVerified: false, qcVerifiedBy: undefined, qcVerifiedAt: undefined } : {}),
    });
  };

  const handleToggleQcVerified = (nextValue: boolean) => {
    if (nextValue && qcPhotos.length === 0) {
      showToast('error', 'Add QC proof photos before verifying.');
      return;
    }
    if (nextValue && !qcChecklistComplete) {
      showToast('error', 'Tick all QC requirements before verifying.');
      return;
    }
    mergeDraftUpdates({
      qcVerified: nextValue,
      qcVerifiedBy: nextValue ? (currentUser?.name || currentUser?.email || 'Staff') : undefined,
      qcVerifiedAt: nextValue ? new Date().toISOString() : undefined,
    });
  };

  const handleSaveRefund = async () => {
    if (!refundAmount || parseFloat(refundAmount) <= 0) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const refundAmount_ = parseFloat(refundAmount);
    const refund: Refund = {
      id: order.refund?.id || Math.random().toString(36).substring(2, 15),
      orderId: order.id,
      amount: refundAmount_,
      date: refundDate.toISOString(),
      reason: refundReason.trim(),
      proofImageUri: refundProofUri || undefined,
      createdAt: order.refund?.createdAt || new Date().toISOString(),
    };

    // Determine if it's a full or partial refund
    const isFullRefund = refundAmount_ >= order.totalAmount;
    const refundStatus = isFullRefund ? 'Refunded' : 'Partial Refund';

    // Create updates with refund and correct status
    const updates = { refund, status: refundStatus };

    // Update draft first
    mergeDraftUpdates(updates);

    // Then immediately save to persist the refund
    const updatedBy = currentUser?.name || currentUser?.email || 'Staff';
    const updatedAt = new Date().toISOString();

    try {
      await updateOrder(order.id, { ...updates, updatedBy, updatedAt }, businessId);
      setDraft({});
      showToast('success', 'Refund processed and saved.');
    } catch (error) {
      console.warn('Refund save failed:', error);
      showToast('error', 'Could not save refund. Please try again.');
    }

    setShowRefundModal(false);
  };

  const handleSubmitRefundRequest = async (mode: 'save' | 'submit' = 'submit') => {
    if (!canCreateRefundRequest) {
      showToast('error', 'Only managers and admins can create refund requests.');
      return;
    }
    if (!refundAmount || parseFloat(refundAmount) <= 0) return;
    const refundAmountValue = parseFloat(refundAmount);
    const remainingRefundable = Math.max(0, order.totalAmount - (order.refund?.amount ?? 0));
    if (refundAmountValue > remainingRefundable + 0.01) {
      showToast('error', `Refund exceeds remaining balance of ${formatCurrency(remainingRefundable)}.`);
      return;
    }

    const nowIso = new Date().toISOString();
    const nextStatus: RefundRequestStatus = mode === 'submit'
      ? (isAdmin ? 'approved' : 'submitted')
      : 'draft';
    let uploadedAttachments = undefined;
    if (refundRequestAttachments.length > 0) {
      if (!businessId) {
        showToast('error', 'Could not upload refund screenshots right now.');
        return;
      }
      try {
        uploadedAttachments = await uploadRefundRequestAttachments(businessId, refundRequestAttachments, 'order');
        setRefundRequestUploadError('');
      } catch (error) {
        console.warn('Refund request screenshot upload failed:', error);
        setRefundRequestUploadError('Could not upload screenshots. Please try again.');
        showToast('error', 'Could not upload refund screenshots.');
        return;
      }
    }
    try {
      await addRefundRequest({
        id: Math.random().toString(36).slice(2, 15),
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        amount: refundAmountValue,
        requestedDate: refundDate.toISOString(),
        reason: refundReason.trim(),
        attachments: uploadedAttachments && uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        status: nextStatus,
        refundType: inferRefundRequestType(order.totalAmount, (order.refund?.amount ?? 0) + refundAmountValue),
        source: 'order',
        submittedByUserId: currentUserId,
        submittedByName: currentUserName,
        submittedAt: nextStatus !== 'draft' ? nowIso : undefined,
        reviewedByUserId: nextStatus === 'approved' ? currentUserId : undefined,
        reviewedByName: nextStatus === 'approved' ? currentUserName : undefined,
        reviewedAt: nextStatus === 'approved' ? nowIso : undefined,
        applyBankCharges: applyRefundBankCharges,
        bankChargeAmount: refundBankChargeAmount,
        stampDutyAmount: refundStampDuty,
        totalDebitAmount: refundAmountValue + refundBankChargeAmount + refundStampDuty,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, businessId);
    } catch (error) {
      console.warn('Refund request submit failed:', error);
      showToast('error', 'Could not submit refund request. Check refund setup in Supabase.');
      return;
    }

    if (nextStatus === 'submitted' && businessId) {
      const adminRecipientIds = teamMembers
        .filter((member) => member.role === 'admin' && member.id !== currentUserId)
        .map((member) => member.id);
      if (adminRecipientIds.length > 0) {
        void sendThreadNotification({
          businessId,
          recipientUserIds: adminRecipientIds,
          senderUserId: currentUserId || null,
          authorName: currentUserName,
          body: `${currentUserName} submitted a refund request for ${order.orderNumber} (${formatCurrency(refundAmountValue)}).`,
          entityType: 'order',
          entityDisplayName: order.orderNumber,
          entityId: order.id,
        });
      }
    }

    setShowRefundRequestModal(false);
    showToast(
      'success',
      nextStatus === 'approved'
        ? 'Refund request approved.'
        : nextStatus === 'submitted'
          ? 'Refund request submitted.'
          : 'Refund request saved as draft.'
    );
  };

  const openCancelPrompt = () => {
    setShowHeaderActionMenu(false);
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    setShowCancelPrompt(true);
  };

  const confirmCancelOrder = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await cancelOrder(order.id, businessId, currentUserName);
    setShowCancelPrompt(false);
    handleBack();
  };

  const openDeletePrompt = () => {
    setShowHeaderActionMenu(false);
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    setShowDeletePrompt(true);
  };

  const confirmDeleteOrder = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const orderId = order.id;
    try {
      setShowDeletePrompt(false);
      handleBack();
      setTimeout(async () => {
        try {
          await deleteOrder(orderId, businessId);
        } catch (error) {
          console.warn('Order recycle bin move failed after navigation:', error);
        }
      }, 0);
    } catch (error) {
      console.warn('Order recycle bin move failed:', error);
      showToast('error', 'Could not move order to Recycle Bin.');
    }
  };

  const handlePrintLabel = () => {
    const carrierName = order.logistics?.carrierName?.trim();
    const carrierQuery = carrierName ? `&carrierName=${encodeURIComponent(carrierName)}` : '';
    router.push(`/order-label-preview?orderId=${order.id}${carrierQuery}`);
  };

  const handleUpdatePrescription = (prescription: PrescriptionInfo | undefined) => {
    mergeDraftUpdates({ prescription });
  };

  const formatDateDisplay = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatServiceFieldValue = (type: string | undefined, value: string | undefined) => {
    const safeValue = value?.toString().trim();
    if (!safeValue) return 'Not set';

    if (type === 'Price') {
      const parsed = Number.parseFloat(safeValue);
      return Number.isFinite(parsed) ? formatCurrency(parsed) : safeValue;
    }

    if (type === 'Date') {
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeValue);
      if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]) - 1;
        const day = Number(isoMatch[3]);
        return new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      const parsed = new Date(safeValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    if (type === 'Time') {
      const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(safeValue);
      if (timeMatch) {
        const date = new Date();
        date.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    }

    return safeValue;
  };

  const formatServiceVariableValue = (type: string | undefined, value: string | undefined) => {
    const safeValue = value?.toString().trim();
    if (!safeValue) return 'Not set';
    if (type === 'Toggle') {
      return safeValue === 'true' ? 'Yes' : 'No';
    }
    return safeValue;
  };

  const buildOrderThreadMessage = () => {
    const itemLines = order.items.length > 0
      ? order.items.flatMap((item) => {
        const { productName, variantName } = getItemDetails(item);
        const lineTotal = item.unitPrice * item.quantity;
        const nameParts = [productName, variantName ? `- ${variantName}` : ''].filter(Boolean);
        const lines = [
          `${nameParts.join(' ')} x${item.quantity} - ${formatCurrency(lineTotal)}`,
        ];
        const serviceVariables = item.serviceVariables ?? [];
        const serviceFields = item.serviceFields ?? [];
        const detailLines = [
          ...serviceVariables.map((variable) => `${variable.name}: ${formatServiceVariableValue(variable.type, variable.value)}`),
          ...serviceFields.map((field) => `${field.label}: ${formatServiceFieldValue(field.type, field.value)}`),
        ].filter((value) => value.trim().length > 0);
        if (detailLines.length > 0) {
          lines.push(`   Details: ${detailLines.join('; ')}`);
        }
        return lines;
      })
      : ['No order items added.'];

    const discountLabel = order.discountAmount && order.discountAmount > 0
      ? `${order.discountCode ? `${order.discountCode} - ` : ''}${formatCurrency(order.discountAmount)}`
      : 'None';
    const platform = getOrderSourceDisplay(order) || 'Not set';

    return [
      `Order date: ${orderDate}`,
      `ORDER: ${order.orderNumber}`,
      '',
      `Customer: ${order.customerName || 'No customer name'}`,
      `Address: ${formatAddressValue(order.deliveryAddress) || 'No address provided'}`,
      `Phone: ${order.customerPhone || 'No phone number'}`,
      `Email: ${order.customerEmail || 'No email address'}`,
      '',
      'Order items:',
      ...itemLines,
      '',
      `Customer note: ${order.customerNote?.trim() || 'None'}`,
      `Delivery: ${normalizeDeliveryStateValue(order.deliveryState, order.deliveryAddress) || 'No state provided'} - ${formatCurrency(order.deliveryFee || 0)}`,
      `Discount: ${discountLabel}`,
      `Total: ${formatCurrency(order.totalAmount)}`,
      `Platform: ${platform}`,
    ].join('\n');
  };

  const customerSection = (
    <View
      className={cn('mt-4 rounded-2xl px-4', !isWebDesktop && 'mx-5')}
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, paddingTop: 20, paddingBottom: 20 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Customer</Text>
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
            Order date
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', textAlign: 'right' }} numberOfLines={2}>
            {orderDate}
          </Text>
        </View>
      </View>

      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{order.customerName}</Text>

      {order.customerPhone && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
          className="flex-row items-center py-2 active:opacity-50"
        >
          <Phone size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, fontWeight: '500' }}>{order.customerPhone}</Text>
        </Pressable>
      )}

      {order.customerEmail && (
        <Pressable
          onPress={() => Linking.openURL(`mailto:${order.customerEmail}`)}
          className="flex-row items-center py-2 active:opacity-50"
        >
          <Mail size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, fontWeight: '500' }}>{order.customerEmail}</Text>
        </Pressable>
      )}

      {deliveryAddressText ? (
        <View className="flex-row items-start py-2">
          <House size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, flex: 1, fontWeight: '500' }}>
            {deliveryAddressText}
          </Text>
        </View>
      ) : null}

      {deliveryStateText ? (
        <View className="flex-row items-start py-2">
          <MapPin size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, flex: 1, fontWeight: '500' }}>
            State: {deliveryStateText}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const itemsSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' }}>Items</Text>

      {order.items.map((item, index) => {
        const { productName, variantName, sku, imageUrl, isLoading } = getItemDetails(item);
        const serviceVariables = (item.serviceVariables ?? []).filter((variable) => (variable.value ?? '').toString().trim().length > 0);
        const serviceFields = (item.serviceFields ?? []).filter((field) => (field.value ?? '').toString().trim().length > 0);
        const hasServiceDetails = serviceVariables.length > 0 || serviceFields.length > 0;
        return (
          <View
            key={`${item.productId}-${item.variantId}`}
            className="py-3"
          >
            <View className="flex-row items-center">
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-3 overflow-hidden"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <ResolvedAttachmentImage
                  imageUrl={imageUrl}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                  fallback={<Package size={24} color={colors.text.primary} strokeWidth={1.5} />}
                />
              </View>
              <View className="flex-1">
                {isLoading ? (
                  <>
                    <View style={{ width: '62%', height: 12, borderRadius: 999, backgroundColor: colors.bg.secondary, marginBottom: 8 }} />
                    <View style={{ width: '42%', height: 10, borderRadius: 999, backgroundColor: colors.bg.secondary }} />
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{productName || 'Product unavailable'}</Text>
                    {variantName ? <Text style={{ color: colors.text.muted }} className="text-xs">{variantName}</Text> : null}
                    {sku ? <Text style={{ color: colors.text.muted }} className="text-xs">SKU: {sku.toUpperCase()}</Text> : null}
                  </>
                )}
              </View>
              <View className="items-end">
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }}>
                  {formatCurrency(item.unitPrice * item.quantity)}
                </Text>
                <Text style={{ color: colors.text.muted }} className="text-xs">
                  {item.quantity} × {formatCurrency(item.unitPrice)}
                </Text>
              </View>
            </View>
            {hasServiceDetails && (
              <View
                style={{
                  marginTop: 10,
                  marginLeft: 60,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 }}>
                  Service Details
                </Text>
                {serviceVariables.map((variable) => (
                  <View key={`var-${item.productId}-${item.variantId}-${variable.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1 }}>{variable.name}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginLeft: 12 }}>
                      {formatServiceVariableValue(variable.type, variable.value)}
                    </Text>
                  </View>
                ))}
                {serviceFields.map((field) => (
                  <View key={`field-${item.productId}-${item.variantId}-${field.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1 }}>{field.label}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginLeft: 12 }}>
                      {formatServiceFieldValue(field.type, field.value)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {shouldShowSubtotal ? (
        <View className="flex-row items-center justify-between border-t mt-2 pt-3 pb-1" style={{ borderTopColor: colors.border.light }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>Subtotal</Text>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }}>{formatCurrency(order.subtotal)}</Text>
        </View>
      ) : null}

      {/* Services */}
      {hasOrderServices && (
        <View>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 2 }}>
            Add-ons
          </Text>
          {order.services.map((service) => (
            <View key={service.serviceId} className="flex-row items-center justify-between py-2">
              <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{service.name}</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }}>{formatCurrency(service.price)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Delivery Fee */}
      {hasDeliveryFee && (
        <View className="flex-row items-center justify-between py-2">
          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Delivery Fee</Text>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }}>{formatCurrency(order.deliveryFee)}</Text>
        </View>
      )}

      {/* Discount Row */}
      {hasDiscountAmount && (
        <View className="flex-row items-center justify-between py-2">
          <View className="flex-row items-center">
            <Percent size={14} color="#10B981" strokeWidth={2} />
          <Text style={{ color: '#10B981', fontSize: 12, marginLeft: 8, fontWeight: '500' }}>
            Discount{order.discountCode ? ` (${order.discountCode})` : ''}
          </Text>
        </View>
          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '400' }}>-{formatCurrency(order.discountAmount)}</Text>
        </View>
      )}

      {/* Refund Row - Display in Red if refund exists */}
      {hasRefundAmount && order.refund ? (
        <View className="flex-row items-center justify-between py-2">
          <View className="flex-row items-center">
            <RefreshCcw size={14} color="#EF4444" strokeWidth={2} />
            <Text style={{ color: '#EF4444', fontSize: 12, marginLeft: 8, fontWeight: '500' }}>Refund</Text>
          </View>
          <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '400' }}>-{formatCurrency(order.refund.amount)}</Text>
        </View>
      ) : null}

      <View className="border-t mt-2 pt-3 flex-row items-center justify-between" style={{ borderTopColor: colors.border.medium }}>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Total</Text>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
          {formatCurrency(order.refund && order.refund.amount > 0 ? order.totalAmount - order.refund.amount : order.totalAmount)}
        </Text>
      </View>
      {order.refund && order.refund.amount > 0 && (
        <Text style={{ color: colors.text.muted }} className="text-xs text-right mt-1">
          Original: {formatCurrency(order.totalAmount)}
        </Text>
      )}
    </View>
  );

  const wooCommerceSection = order.websiteOrderReference || (order.source ?? '').toLowerCase().includes('woocommerce') ? (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 18, textTransform: 'uppercase' }}>WooCommerce Link</Text>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}
          >
            <RefreshCcw size={15} color={colors.text.secondary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>
              Linked WooCommerce Order
            </Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              {order.websiteOrderReference || 'WooCommerce linked'}
            </Text>
            {!order.websiteOrderReference ? (
              <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                This older linked order does not have a saved WooCommerce order reference yet.
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border.light, paddingTop: 12 }}>
          {order.customerEmail ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Customer Email</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginLeft: 12, flexShrink: 1, textAlign: 'right' }}>
                {order.customerEmail}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Current Source</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', marginLeft: 12 }}>
              {formatOrderSourcePart(order.source) || 'Not set'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Linked Status</Text>
            <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '600', marginLeft: 12 }}>
              Connected
            </Text>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  const sourcePaymentSection = isSocialCheckoutPaymentOrder(order) ? (
    <View className={cn('mt-4 rounded-2xl p-5', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 20, textTransform: 'uppercase' }}>Payment</Text>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center">
          <Tag size={18} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 10, fontWeight: '500' }}>{order.orderClassification ?? 'Sale'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View className="flex-row items-center">
            <CreditCard size={18} color={colors.text.tertiary} strokeWidth={2} />
            <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 10, fontWeight: '500' }}>{order.paymentMethod || 'Bank Transfer'}</Text>
          </View>
          <View className="rounded-full px-5 py-2 mt-4" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)' }}>
            <Text style={{ color: '#047857', fontSize: 12, fontWeight: '700' }}>Confirmed</Text>
          </View>
        </View>
      </View>
      <View className="flex-row items-center rounded-[22px] px-5 py-4 mt-6" style={{ backgroundColor: colors.bg.secondary }}>
        <FileText size={28} color={colors.text.tertiary} strokeWidth={1.8} />
        <View className="ml-4 flex-1">
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
            transfer-receipt-{order.websiteOrderReference || order.orderNumber}.jpg
          </Text>
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>Payment link · confirmed</Text>
        </View>
      </View>
    </View>
  ) : (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Tag size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, fontWeight: '500' }}>
            {getOrderSourceDisplay(order)}
          </Text>
        </View>
        <View className="flex-row items-center">
          <CreditCard size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8, fontWeight: '500' }}>{order.paymentMethod || 'Not set'}</Text>
        </View>
      </View>
    </View>
  );

  const fulfillmentSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <OrderFulfillmentSection
        order={order}
        title="Fulfillment"
        onCopied={() => showToast('success', 'Tracking info copied.')}
        onEditFulfillment={() => setShowFulfillmentModal(true)}
      />
    </View>
  );

  const customerNoteSection = order.customerNote?.trim() ? (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' }}>Customer Note</Text>
      <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18, fontWeight: '500' }}>
          {order.customerNote.trim()}
        </Text>
      </View>
    </View>
  ) : null;

  const actionPillBaseStyle = {
    minHeight: 32,
    minWidth: 90,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const primaryActionPillStyle = {
    ...actionPillBaseStyle,
    backgroundColor: colors.text.primary,
  };

  const primaryActionTextStyle = {
    color: colors.bg.primary,
    fontSize: 12,
    fontWeight: '600' as const,
  };

  const secondaryActionPillStyle = {
    ...actionPillBaseStyle,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  };

  const secondaryActionTextStyle = {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600' as const,
  };

  const refundActionPillStyle = {
    minHeight: 32,
    minWidth: 90,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.light,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const refundActionTextStyle = {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600' as const,
  };

  const outlineActionPillStyle = {
    ...actionPillBaseStyle,
    borderWidth: 1,
    borderColor: colors.border.light,
  };

  const outlineActionTextStyle = {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600' as const,
  };

  const addActionPillStyle = {
    ...actionPillBaseStyle,
    borderWidth: 1,
    borderColor: colors.border.light,
  };

  const addActionTextStyle = {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600' as const,
  };

  const logisticsSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Logistics</Text>
        <Pressable
          onPress={handleOpenLogistics}
          className="active:opacity-70 flex-row items-center justify-center"
          style={order.logistics ? primaryActionPillStyle : addActionPillStyle}
        >
          {!order.logistics ? <Plus size={13} color={colors.text.secondary} strokeWidth={2.5} /> : null}
          <Text style={[order.logistics ? primaryActionTextStyle : addActionTextStyle, !order.logistics ? { marginLeft: 5 } : null]}>
            {order.logistics ? 'Edit' : 'Add'}
          </Text>
        </Pressable>
      </View>

      {order.logistics ? (
        <View>
          <View className="flex-row items-center py-2">
            <Truck size={16} color={colors.text.primary} strokeWidth={2} />
            <Text style={{ color: colors.text.primary, fontSize: 12, marginLeft: 8, fontWeight: '700' }}>{order.logistics.carrierName}</Text>
          </View>
          {(() => {
            const logisticsDate = order.logistics?.datePickedUp ?? order.logistics?.dispatchDate;
            if (!logisticsDate) return null;
            const logisticsLabel = order.logistics?.datePickedUp ? 'Picked up' : 'Dispatched';
            return (
              <View className="flex-row items-center py-2">
                <Calendar size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8 }}>
                  {logisticsLabel}: {formatDateDisplay(logisticsDate)}
                </Text>
              </View>
            );
          })()}
          {order.logistics.trackingNumber && (
            <View className="rounded-xl px-3 py-2 mt-2" style={{ backgroundColor: colors.bg.secondary }}>
              <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Tracking Number</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{order.logistics.trackingNumber}</Text>
            </View>
          )}
        </View>
      ) : (
        <View className="py-4 items-center">
          <Truck size={24} color={colors.text.muted} strokeWidth={1.5} />
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>No logistics info yet</Text>
        </View>
      )}
    </View>
  );

  const prescriptionSection = (
    <PrescriptionSection
      containerClassName={cn('mt-4', !isWebDesktop && 'mx-5')}
      prescription={order.prescription}
      onUpdate={handleUpdatePrescription}
      editable={true}
      staffName={currentUser?.name || currentUser?.email || 'Staff'}
    />
  );

  const refundSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Refund</Text>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {canCreateRefundRequest ? (
            <Pressable
              onPress={handleOpenRefundRequest}
              className="active:opacity-70 flex-row items-center justify-center"
              style={refundActionPillStyle}
            >
              <RefreshCcw size={13} color={colors.text.secondary} strokeWidth={2.5} />
              <Text style={[refundActionTextStyle, { marginLeft: 5 }]}>
                {latestRefundRequest ? 'Refund Request' : 'Request Refund'}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">
              Managers/Admins only
            </Text>
          )}
        </View>
      </View>

      {hasRefund && refund ? (
        <View>
          <View className="flex-row items-center justify-between py-2">
            <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Amount Refunded</Text>
            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>{formatCurrency(refund.amount)}</Text>
          </View>
          <View className="flex-row items-center py-2">
            <Calendar size={14} color={colors.text.tertiary} strokeWidth={2} />
            {refund.date && (
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 8 }}>
                {formatDateDisplay(refund.date)}
              </Text>
            )}
          </View>
          {refund.reason && (
            <View className="rounded-xl px-3 py-2 mt-2" style={{ backgroundColor: colors.bg.secondary }}>
              <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Reason</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12 }}>{refund.reason}</Text>
            </View>
          )}
        </View>
      ) : (
        <View className="py-4 items-center">
          <RefreshCcw size={24} color={colors.text.muted} strokeWidth={1.5} />
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>No refund processed</Text>
        </View>
      )}
      {latestRefundRequest && latestRefundRequest.status !== 'paid' ? (
        <View className="rounded-xl px-3 py-3 mt-3" style={{ backgroundColor: colors.bg.secondary }}>
          <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>Latest refund request</Text>
              <Text style={{ color: colors.text.secondary }} className="text-xs mt-1">
                {formatCurrency(latestRefundRequest.amount)} requested on {new Date(latestRefundRequest.requestedDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.bg.primary }}>
              <Text style={{ color: colors.text.primary, fontSize: 11, fontWeight: '700' }}>
                {formatRefundRequestStatusLabel(latestRefundRequest)}
              </Text>
            </View>
          </View>
          {latestRefundRequest.reason ? (
            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2" numberOfLines={3}>
              {latestRefundRequest.reason}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const qcCompletedLabel = qcReady ? 'QC completed' : qcVerified ? 'QC pending save' : 'Not started';
  const qcCompletedColor = qcReady ? '#059669' : qcVerified ? '#D97706' : colors.text.secondary;
  const qcCompletedBg = qcReady ? 'rgba(5,150,105,0.12)' : qcVerified ? 'rgba(217,119,6,0.12)' : colors.bg.secondary;
  const qcChecklistProgress = `${qcChecklist.length}/${qcRequirements.length || 0} checks`;

  const qcDetailContent = (
    <>
      <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 12 }}>
        Tick every check, upload proof, and confirm QC before dispatching.
      </Text>

      <View style={{ gap: 8 }}>
        {qcRequirements.length === 0 ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
            No quality control checks configured.
          </Text>
        ) : qcRequirements.map((item) => {
          const checked = qcChecklist.includes(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => handleToggleQcChecklistItem(item.key)}
              className="flex-row items-center"
              style={{ minHeight: 34, gap: 9 }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: checked ? '#10B981' : colors.border.light,
                  backgroundColor: checked ? '#10B981' : colors.bg.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {checked ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: checked ? '700' : '500' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row flex-wrap mt-3" style={{ gap: 10 }}>
        {qcPhotos.map((photo, index) => (
          <Pressable
            key={`${photo}-${index}`}
            onPress={() => {
              void openAttachmentPath(photo);
            }}
            className="active:opacity-80"
            style={{
              width: 78,
              height: 78,
              borderRadius: 12,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.secondary,
            }}
          >
            <ResolvedAttachmentImage imageUrl={photo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <Pressable
              onPress={() => handleRemoveQcPhoto(index)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              <X size={12} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </Pressable>
        ))}
        <Pressable
          onPress={handleAddQcPhoto}
          disabled={qcUploading}
          className="active:opacity-80"
          style={{
            width: 78,
            height: 78,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.secondary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: qcUploading ? 0.6 : 1,
          }}
        >
          <Camera size={18} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 6 }}>
            {qcUploading ? 'Uploading' : 'Add photo'}
          </Text>
        </Pressable>
      </View>

      {qcUploadError ? (
        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{qcUploadError}</Text>
      ) : null}

      <View className="py-3 mt-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>QC verified</Text>
            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
              Requires all checklist items and at least one proof photo.
            </Text>
          </View>
          <Switch
            value={qcVerified}
            onValueChange={handleToggleQcVerified}
            trackColor={{ false: '#9CA3AF', true: '#111111' }}
            thumbColor="#FFFFFF"
          />
        </View>
        {qcVerified && order.qcVerifiedBy ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 8 }}>
            Verified by {order.qcVerifiedBy}
            {order.qcVerifiedAt ? ` · ${new Date(order.qcVerifiedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
        ) : null}
      </View>

      <View className="mt-3">
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>QC note</Text>
        <View className="rounded-xl px-3" style={{ borderWidth: 1, borderColor: colors.border.light }}>
          <TextInput
            placeholder="Add QC notes (optional)"
            placeholderTextColor={colors.text.muted}
            value={order.qcNote ?? ''}
            onChangeText={(value) => mergeDraftUpdates({ qcNote: value })}
            multiline
            numberOfLines={3}
            style={{ paddingVertical: 6, color: colors.text.primary, fontSize: 13, minHeight: 64 }}
          />
        </View>
      </View>
    </>
  );

  const qcSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Quality Control</Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 4 }}>
            {qcReady ? 'Proof, checklist and verification are complete.' : 'Run QC before dispatching this order.'}
          </Text>
        </View>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: qcCompletedBg }}>
          <Text style={{ color: qcCompletedColor, fontSize: 11, fontWeight: '600' }}>{qcCompletedLabel}</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.bg.secondary }}>
          <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600' }}>{qcChecklistProgress}</Text>
        </View>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.bg.secondary }}>
          <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600' }}>{qcPhotos.length} proof photo{qcPhotos.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      {showQcDetails ? (
        <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          {qcRequirements.length > 0 ? (
            <View style={{ gap: 6 }}>
              {qcRequirements.map((item) => {
                const checked = qcChecklist.includes(item.key);
                return (
                  <View key={`summary-${item.key}`} className="flex-row items-center" style={{ gap: 8 }}>
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        backgroundColor: checked ? '#10B981' : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: checked ? '#10B981' : colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked ? <Check size={10} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <Text style={{ color: checked ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: checked ? '600' : '400' }}>
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          {order.qcNote?.trim() ? (
            <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 10 }}>
              Note: {order.qcNote.trim()}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center mt-4" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => {
            if (qcReady) {
              setShowQcDetails((previous) => !previous);
            } else {
              setShowQcModal(true);
            }
          }}
          className="active:opacity-80"
          style={{
            minHeight: 46,
            paddingHorizontal: 18,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.text.primary,
            backgroundColor: colors.text.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
          }}
        >
          <Check size={16} color={colors.bg.primary} strokeWidth={2} />
          <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            {qcReady ? (showQcDetails ? 'Hide QC details' : 'View QC details') : 'Start quality control'}
          </Text>
        </Pressable>
        {qcReady ? (
          <Pressable
            onPress={() => setShowQcModal(true)}
            className="active:opacity-80"
            style={{
              minHeight: 46,
              paddingHorizontal: 18,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const casesSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Cases</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleCreateCase}
            className="active:opacity-70 flex-row items-center justify-center"
            style={outlineActionPillStyle}
          >
            <Plus size={13} color={colors.text.secondary} strokeWidth={2.5} />
            <Text style={[outlineActionTextStyle, { marginLeft: 5 }]}>Create Case</Text>
          </Pressable>
        </View>
      </View>

      {orderCases.length > 0 ? (
        <View className="gap-2">
          {orderCases.map((caseItem) => (
            <Pressable
              key={caseItem.id}
              onPress={() => router.push(`/case/${caseItem.id}`)}
              className="flex-row items-center justify-between rounded-2xl px-4 py-3"
              style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{caseItem.caseNumber}</Text>
              <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="py-4 items-center">
          <FileText size={24} color={colors.text.muted} strokeWidth={1.5} />
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>No cases yet</Text>
        </View>
      )}
    </View>
  );

  const partnerJobSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Partner Job</Text>
        <Pressable
          onPress={handleSendToPartner}
          disabled={partners.length === 0}
          className="active:opacity-70 flex-row items-center justify-center"
          style={[outlineActionPillStyle, partners.length === 0 ? { opacity: 0.5 } : null]}
        >
          <Send size={13} color={colors.text.secondary} strokeWidth={2.5} />
          <Text style={[outlineActionTextStyle, { marginLeft: 5 }]}>Send to Partner</Text>
        </Pressable>
      </View>

      {orderPartnerJobs.length > 0 ? (
        <View className="gap-2">
          {orderPartnerJobs.map((job) => {
            const partner = partners.find((p) => p.id === job.partnerId);
            const isAwaitingDispatch = job.status === 'awaiting_dispatch';
            const statusLabel = isAwaitingDispatch
              ? 'Not sent yet'
              : job.status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
            return (
              <Pressable
                key={job.id}
                onPress={() => router.push('/partners?partnerSection=jobs' as any)}
                className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {partner?.name ?? 'Unknown partner'}
                  </Text>
                  <Text style={{ color: isAwaitingDispatch ? '#B45309' : colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                    {statusLabel}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View className="py-4 items-center">
          <Truck size={24} color={colors.text.muted} strokeWidth={1.5} />
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>Not sent to a partner yet</Text>
        </View>
      )}
    </View>
  );

  const printLabelSection = (
    <View className={cn('mt-4', !isWebDesktop && 'mx-5')}>
      {isDark ? (
        <Pressable
          onPress={handlePrintLabel}
          className="rounded-full items-center justify-center active:opacity-80 flex-row"
          style={{ backgroundColor: '#FFFFFF', height: 52 }}
        >
          <Printer size={18} color="#111111" strokeWidth={2} />
          <Text style={{ color: '#111111', fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            Print Shipping Label
          </Text>
        </Pressable>
      ) : (
        <Button
          onPress={handlePrintLabel}
          icon={<Printer size={18} color="#FFFFFF" strokeWidth={2} />}
        >
          Print Shipping Label
        </Button>
      )}
    </View>
  );

  const updateStatusSection = (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' }}>Update Status</Text>

      <Pressable
        onPress={() => setShowStatusModal((current) => !current)}
        className="flex-row items-center rounded-full px-4"
        style={{
          minHeight: 48,
          backgroundColor: activeStatusDisplay.bg,
          borderWidth: 1,
          borderColor: `${activeStatusDisplay.color}55`,
        }}
      >
        <View
          className="w-8 h-8 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: activeStatusDisplay.bg }}
        >
          <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeStatusDisplay.color }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Current status</Text>
          <Text style={{ color: activeStatusDisplay.color, fontSize: 12, fontWeight: '500', marginTop: 2 }} numberOfLines={1}>
            {activeStatusDisplay.label}
          </Text>
        </View>
        <ChevronDown size={18} color={activeStatusDisplay.color} strokeWidth={2.2} />
      </Pressable>
      {showStatusModal ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          {orderedOrderStatuses.map((status) => {
            const currentStatus = baseOrder?.status ?? order.status;
            const selectedStatus = draft.status ?? currentStatus;
            const isSelected = selectedStatus === status.name;
            const isDispatch = isDispatchStatus(status.name);
            const isDisabled = isDispatch && !qcReady;
            const optionDisplay = getSystemOrderStatusDisplay(status.name, status.color);
            return (
              <Pressable
                key={status.id}
                onPress={() => {
                  if (isDisabled) {
                    showToast('error', 'Add QC photos and verify QC before dispatching.');
                    return;
                  }
                  handleUpdateStatus(status.name);
                }}
                className="rounded-full px-4 active:opacity-80"
                style={{
                  minHeight: 46,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  ...(isSelected ? { backgroundColor: optionDisplay.color } : { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }),
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : optionDisplay.bg,
                  }}
                >
                  {isSelected ? (
                    <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  ) : (
                    <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: optionDisplay.color }} />
                  )}
                </View>
                <Text style={{ color: isSelected ? '#FFFFFF' : colors.text.primary, fontSize: 12, fontWeight: '500', flex: 1 }}>
                  {optionDisplay.label}
                </Text>
                {isSelected ? <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '500' }}>Selected</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const relatedPaymentSection = isWebDesktop && relatedPayment ? (
    <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Payment</Text>
        {relatedPayment.amount > 0 ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
            {formatCurrency(relatedPayment.amount)}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center">
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: colors.bg.secondary,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <CreditCard size={18} color={colors.text.secondary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
            {relatedPayment.reference}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {relatedPayment.label} · {relatedPayment.status.replace(/[_-]+/g, ' ')}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => router.push(relatedPayment.route as never)}
        className="rounded-full flex-row items-center justify-center active:opacity-80 mt-4"
        style={{ height: 40, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, gap: 8 }}
      >
        <ExternalLink size={15} color={colors.text.primary} strokeWidth={2.2} />
        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>View payment</Text>
      </Pressable>
    </View>
  ) : null;

  const orderActivityEntries = [
    ...filteredActivityLog.map((entry) => ({
      key: `activity-${entry.date}-${entry.staffName}-${entry.action}`,
      action: entry.action,
      user: entry.staffName,
      date: entry.date,
    })),
    ...(filteredActivityLog.length === 0 && order.updatedBy && order.updatedAt ? [{
      key: `updated-${order.updatedAt}-${order.updatedBy}`,
      action: 'Last updated order',
      user: order.updatedBy,
      date: order.updatedAt,
    }] : []),
    ...(order.createdBy && order.createdAt ? [{
      key: `created-${order.createdAt}-${order.createdBy}`,
      action: 'Created order',
      user: order.createdBy,
      date: order.createdAt,
    }] : []),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  const staffActivitySection =
    (order.createdBy || order.updatedBy || (order.activityLog && order.activityLog.length > 0)) ? (
      <View className={cn('mt-4', !isWebDesktop && 'mx-5')}>
        <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, gap: 14 }}>
          <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
            <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Activity</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>
              {orderActivityEntries.length} event{orderActivityEntries.length === 1 ? '' : 's'}
            </Text>
          </View>

          {orderActivityEntries.map((entry, index) => (
            <View key={entry.key} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 10, alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: index === 0 ? colors.text.primary : colors.text.tertiary, marginTop: 5 }} />
                {index < orderActivityEntries.length - 1 ? (
                  <View style={{ width: 1, flex: 1, minHeight: 26, backgroundColor: colors.border.light, marginTop: 5 }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: index < orderActivityEntries.length - 1 ? 12 : 0 }}>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{entry.action}</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 3 }}>
                  {entry.user} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(entry.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: isWebDesktop ? colors.bg.primary : colors.bg.secondary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        {isWebDesktop ? (
          <View style={{ backgroundColor: colors.bg.primary, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View
              style={{
                paddingHorizontal: 28,
                paddingTop: 20,
                paddingBottom: 12,
                width: '100%',
                maxWidth: webMaxWidth,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <Pressable
                    onPress={handleBack}
                    className="active:opacity-70"
                    style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                  >
                    <ArrowLeft size={19} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }} numberOfLines={1}>
                        {order.orderNumber}
                      </Text>
                      <Pressable
                        onPress={() => setShowStatusModal(true)}
                        className="active:opacity-80"
                        style={{ backgroundColor: badgeBgColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}
                      >
                        <Text style={{ color: badgeTextColor, fontSize: 12, fontWeight: '700' }}>
                          {displayStatus}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {showDeliveryConfirmationTrigger ? (
                    <View
                      style={{
                        height: 40,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        opacity: canSendDeliveryConfirmationEmail ? 1 : 0.6,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          Send delivery email
                        </Text>
                      </View>
                      <Switch
                        value={sendDeliveryConfirmationEmail && canSendDeliveryConfirmationEmail}
                        onValueChange={(value) => setSendDeliveryConfirmationEmail(value)}
                        disabled={!canSendDeliveryConfirmationEmail}
                        trackColor={{ false: '#9CA3AF', true: '#111111' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ) : null}

                  <Button
                    onPress={handleSaveAll}
                    disabled={!hasUnsavedChanges}
                    fullWidth={false}
                    size="sm"
                    variant={isDark ? (hasUnsavedChanges ? 'secondary' : 'ghost') : 'primary'}
                    icon={
                      <Save
                        size={16}
                        color={isDark ? (hasUnsavedChanges ? '#111111' : '#E5E7EB') : '#FFFFFF'}
                        strokeWidth={2.5}
                      />
                    }
                  >
                    Save Changes
                  </Button>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={handleOpenEdit}
                      accessibilityLabel="Edit order"
                      className="active:opacity-80"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Edit2 size={16} color={colors.text.primary} strokeWidth={2.15} />
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        void handleOpenThread();
                      }}
                      accessibilityLabel={orderThreadQuery.data ? 'Open order thread' : 'Start order thread'}
                      className="active:opacity-80"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}
                    >
                      <MessageSquare size={17} color={colors.text.primary} strokeWidth={2} />
                      <View
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: orderThreadQuery.data ? '#EF4444' : '#9CA3AF',
                        }}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        void handleShareOrderToGeneralThread();
                      }}
                      disabled={isSharingOrderToThread}
                      accessibilityLabel="Share order to thread"
                      className="active:opacity-80"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: isSharingOrderToThread ? 0.55 : 1,
                      }}
                    >
                      <Share2 size={16} color={colors.text.primary} strokeWidth={2.15} />
                    </Pressable>

                    <Pressable
                      ref={headerActionButtonRef}
                      onPress={handleOpenHeaderActionMenu}
                      accessibilityLabel="More order actions"
                      className="active:opacity-80"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MoreVertical size={17} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.primary }}>
            <View
              className="flex-row items-center"
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Pressable
                onPress={handleBack}
                className="active:opacity-50 items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }}
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
              <View className="flex-1">
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700' }}>{order.orderNumber}</Text>
                  <Pressable
                    onPress={() => setShowStatusModal(true)}
                    className="active:opacity-80"
                    style={{ backgroundColor: badgeBgColor, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}
                  >
                    <Text style={{ color: badgeTextColor, fontSize: 11, fontWeight: '700' }}>
                      {displayStatus}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  void handleOpenThread();
                }}
                className="w-10 h-10 rounded-full items-center justify-center mr-2 active:opacity-70"
                style={{ width: 36, height: 36, backgroundColor: colors.bg.secondary, position: 'relative' }}
              >
                <MessageSquare size={17} color={colors.text.primary} strokeWidth={2} />
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: orderThreadQuery.data ? '#EF4444' : '#9CA3AF',
                  }}
                />
              </Pressable>
              <Pressable
                ref={headerActionButtonRef}
                onPress={handleOpenHeaderActionMenu}
                className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                style={{ width: 36, height: 36, backgroundColor: colors.bg.secondary }}
              >
                <MoreVertical size={17} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        )}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: isWebDesktop ? colors.bg.primary : colors.bg.secondary }}
          contentContainerStyle={{
            paddingBottom: isWebDesktop ? 40 : Math.max(24, insets.bottom + 140),
            paddingTop: isWebDesktop ? 14 : 16,
            width: '100%',
            maxWidth: isWebDesktop ? webMaxWidth : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : undefined,
            paddingHorizontal: isWebDesktop ? 28 : 0,
          }}
        >
          {isWebDesktop ? (
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {customerSection}
                {itemsSection}
                {wooCommerceSection}
                {sourcePaymentSection}
                {fulfillmentSection}
                {customerNoteSection}
                {prescriptionSection}
                {logisticsSection}
                {qcSection}
              </View>
              <View style={{ width: rightColumnWidth ?? 420 }}>
                {updateStatusSection}
                {relatedPaymentSection}
                {casesSection}
                {partnerJobSection}
                {refundSection}
                {printLabelSection}
                {staffActivitySection}
              </View>
            </View>
          ) : (
            <>
              {updateStatusSection}
              {customerSection}
              {itemsSection}
              {wooCommerceSection}
              {sourcePaymentSection}
              {fulfillmentSection}
              {customerNoteSection}
              {prescriptionSection}
              {partnerJobSection}
              {logisticsSection}
              {refundSection}
              {qcSection}
              {casesSection}
              {printLabelSection}
              {staffActivitySection}
            </>
          )}

        </ScrollView>

        {/* Sticky Save */}
        {!isWebDesktop ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light, backgroundColor: colors.bg.primary }}>
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: Math.max(12, insets.bottom + 12),
                width: '100%',
              }}
            >
              {showDeliveryConfirmationTrigger ? (
                <View
                  style={{
                    marginBottom: 12,
                    minHeight: 48,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    backgroundColor: colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    justifyContent: 'center',
                    opacity: canSendDeliveryConfirmationEmail ? 1 : 0.6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                        Send delivery confirmation email
                      </Text>
                    </View>
                    <Switch
                      value={sendDeliveryConfirmationEmail && canSendDeliveryConfirmationEmail}
                      onValueChange={(value) => setSendDeliveryConfirmationEmail(value)}
                      disabled={!canSendDeliveryConfirmationEmail}
                      trackColor={{ false: '#9CA3AF', true: '#111111' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              ) : null}
              <Button
                onPress={handleSaveAll}
                disabled={!hasUnsavedChanges}
                variant={isDark ? (hasUnsavedChanges ? 'secondary' : 'ghost') : 'primary'}
              >
                Save Changes
              </Button>
            </View>
          </View>
        ) : null}

        <Modal
          visible={showHeaderActionMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHeaderActionMenu(false)}
        >
          <Pressable
            className="flex-1"
            style={{ backgroundColor: 'transparent' }}
            onPress={() => setShowHeaderActionMenu(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                position: 'absolute',
                ...headerActionMenuPosition,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border.light,
                shadowColor: isWebDesktop ? '#000000' : 'transparent',
                shadowOpacity: isWebDesktop ? 0.08 : 0,
                shadowRadius: isWebDesktop ? 16 : 0,
                shadowOffset: isWebDesktop ? { width: 0, height: 8 } : { width: 0, height: 0 },
                elevation: isWebDesktop ? 8 : 0,
              }}
            >
              <Pressable
                onPress={handleOpenEdit}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}
              >
                <Edit2 size={18} color={colors.text.secondary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, ...headerActionMenuTextStyle }}>
                  Edit Order
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: 14 }} />
              <Pressable
                onPress={() => {
                  void handleShareOrderToGeneralThread();
                }}
                disabled={isSharingOrderToThread}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44, opacity: isSharingOrderToThread ? 0.6 : 1 }}
              >
                <Send size={18} color={colors.text.secondary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, ...headerActionMenuTextStyle }}>
                  Share to Threads
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: 14 }} />
              <Pressable
                onPress={() => {
                  void handleCopyThreadMessage();
                }}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}
              >
                <Copy size={18} color={colors.text.secondary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, ...headerActionMenuTextStyle }}>
                  Copy Thread Message
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: 14 }} />
              <Pressable
                onPress={openDeletePrompt}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}
              >
                <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                <Text style={{ color: '#EF4444', ...headerActionMenuTextStyle }}>
                  Move to Recycle Bin
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: 14 }} />
              <Pressable
                onPress={openCancelPrompt}
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}
              >
                <Trash2 size={18} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, ...headerActionMenuTextStyle }}>
                  Cancel Order
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showQcModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowQcModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingHorizontal: 18 }}
              onPress={() => setShowQcModal(false)}
            >
              <Pressable
                onPress={(event) => event.stopPropagation()}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: colors.bg.primary,
                  width: '100%',
                  maxWidth: 560,
                  maxHeight: '88%',
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Quality Control</Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }}>
                      Confirm checklist, proof photos, and QC note.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setShowQcModal(false)}
                    className="rounded-full items-center justify-center active:opacity-70"
                    style={{ width: 34, height: 34, backgroundColor: colors.bg.secondary }}
                  >
                    <X size={17} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView
                  className="px-5 py-4"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {qcDetailContent}
                </ScrollView>

                <View className="flex-row items-center justify-end px-5 py-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
                  <Pressable
                    onPress={() => setShowQcModal(false)}
                    className="rounded-full px-4 items-center justify-center active:opacity-80"
                    style={{ height: 40, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>Close</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { void handleSaveQcAndClose(); }}
                    disabled={qcUploading}
                    className="rounded-full px-5 items-center justify-center active:opacity-80"
                    style={{ height: 40, backgroundColor: colors.text.primary, opacity: qcUploading ? 0.55 : 1 }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '700' }}>
                      {qcReady ? 'Save QC' : 'Save progress'}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        <FulfillmentEditModal
          visible={showFulfillmentModal}
          order={order}
          onClose={() => setShowFulfillmentModal(false)}
          onSave={handleSaveFulfillment}
        />

        <Modal
          visible={showDeletePrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeletePrompt(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            onPress={() => setShowDeletePrompt(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="w-[90%] rounded-2xl p-5"
              style={{ backgroundColor: '#FFFFFF', maxWidth: 420 }}
            >
              <Text className="text-lg font-bold text-gray-900 mb-2">Move order to Recycle Bin?</Text>
              <Text className="text-sm text-gray-600 mb-4">
                This will remove order {order.orderNumber} from active orders, restore its stock, and let you recover it later from Settings {'>'} Recycle Bin.
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setShowDeletePrompt(false)}
                  className="flex-1 rounded-full items-center justify-center"
                  style={{ height: 48, backgroundColor: '#F3F4F6' }}
                >
                  <Text className="text-gray-700 font-semibold">Close</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDeleteOrder}
                  className="flex-1 rounded-full items-center justify-center"
                  style={{ height: 48, backgroundColor: '#111111' }}
                >
                  <Text className="text-white font-semibold">Move to Bin</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showCancelPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCancelPrompt(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            onPress={() => setShowCancelPrompt(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="w-[90%] rounded-2xl p-5"
              style={{ backgroundColor: '#FFFFFF', maxWidth: 420 }}
            >
              <Text className="text-lg font-bold text-gray-900 mb-2">Cancel order?</Text>
              <Text className="text-sm text-gray-600 mb-4">
                This will keep order {order.orderNumber} in your records, mark it as cancelled, and return its stock.
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setShowCancelPrompt(false)}
                  className="flex-1 rounded-full items-center justify-center"
                  style={{ height: 48, backgroundColor: '#F3F4F6' }}
                >
                  <Text className="text-gray-700 font-semibold">Close</Text>
                </Pressable>
                <Pressable
                  onPress={confirmCancelOrder}
                  className="flex-1 rounded-full items-center justify-center"
                  style={{ height: 48, backgroundColor: '#EF4444' }}
                >
                  <Text className="text-white font-semibold">Cancel Order</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <PartnerJobFormModal
          visible={showSendToPartnerModal}
          onClose={() => setShowSendToPartnerModal(false)}
          prefill={partnerJobPrefill}
          autoDispatch
          onSaved={handlePartnerJobSaved}
          title="Send to Partner"
          subtitle="Create and send the partner job directly from this order."
        />

        {/* Edit Order Modal */}
        <Modal
          visible={showEditModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowEditModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              onPress={() => setShowEditModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxHeight: '85%', maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Edit Order</Text>
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Customer Name */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Customer Name</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="Customer Name"
                        placeholderTextColor={colors.input.placeholder}
                        value={editName}
                        onChangeText={setEditName}
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Phone */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Phone</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="Phone Number"
                        placeholderTextColor={colors.input.placeholder}
                        value={editPhone}
                        onChangeText={setEditPhone}
                        keyboardType="phone-pad"
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Email */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Email</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="Email Address"
                        placeholderTextColor={colors.input.placeholder}
                        value={editEmail}
                        onChangeText={setEditEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Delivery State */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Delivery State</Text>
                    <Pressable
                      onPress={() => setShowStateDropdown(!showStateDropdown)}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                    >
                      <Text style={{ color: editState ? colors.input.text : colors.input.placeholder }}>
                        {editState || 'Select State'}
                      </Text>
                      <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                    {showStateDropdown && (
                      <ScrollView className="rounded-xl mt-2 overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxHeight: 200 }}>
                        {NIGERIA_STATES.map((state) => (
                          <Pressable
                            key={state}
                            onPress={() => {
                              setEditState(state);
                              setShowStateDropdown(false);
                            }}
                            className="px-4 py-3 border-b active:opacity-70"
                            style={{ borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: editState === state ? colors.text.primary : colors.text.tertiary }} className={cn('text-sm', editState === state && 'font-semibold')}>
                              {state}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>

                  {/* Delivery Address */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Delivery Address</Text>
                    <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 80 }}>
                      <TextInput
                        placeholder="Full Address"
                        placeholderTextColor={colors.input.placeholder}
                        value={editAddress}
                        onChangeText={setEditAddress}
                        multiline
                        numberOfLines={3}
                        style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Website Order Ref (WooCommerce) */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Website Order Ref (WooCommerce)</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="e.g. WC #10234 (optional)"
                        placeholderTextColor={colors.input.placeholder}
                        value={editWebsiteOrderRef}
                        onChangeText={setEditWebsiteOrderRef}
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Delivery Fee */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Delivery Fee</Text>
                    <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}>
                      <Text style={{ color: colors.input.placeholder, fontSize: 14, marginRight: 4 }}>₦</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={colors.input.placeholder}
                        value={editDeliveryFee}
                        onChangeText={setEditDeliveryFee}
                        keyboardType="decimal-pad"
                        style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Discount Code */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Discount Code</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="Enter discount code (optional)"
                        placeholderTextColor={colors.input.placeholder}
                        value={editDiscountCode}
                        onChangeText={setEditDiscountCode}
                        autoCapitalize="characters"
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Discount Amount */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Discount Amount</Text>
                    <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}>
                      <Text style={{ color: colors.input.placeholder, fontSize: 14, marginRight: 4 }}>₦</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={colors.input.placeholder}
                        value={editDiscountAmount}
                        onChangeText={setEditDiscountAmount}
                        keyboardType="decimal-pad"
                        style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Products Section */}
                  <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-2">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Products</Text>
                      <Pressable
                        onPress={() => setShowProductSearch(!showProductSearch)}
                        className="px-3 py-1.5 rounded-full flex-row items-center active:opacity-70"
                        style={{ backgroundColor: colors.bg.secondary }}
                      >
                        <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                        <Text style={{ color: colors.text.primary }} className="text-xs font-medium ml-1">Add</Text>
                      </Pressable>
                    </View>

                    {/* Product Search */}
                    {showProductSearch && (
                      <View className="mb-3">
                        <View className="flex-row items-center rounded-xl px-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
                          <Search size={16} color={colors.input.placeholder} strokeWidth={2} />
                          <TextInput
                            placeholder="Search products..."
                            placeholderTextColor={colors.input.placeholder}
                            value={productSearchQuery}
                            onChangeText={setProductSearchQuery}
                            autoFocus
                            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, color: colors.input.text, fontSize: 14 }}
                          />
                        </View>
                        {productSearchResults.length > 0 && (
                          <View className="mt-2 rounded-xl overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxHeight: 150 }}>
                            <ScrollView nestedScrollEnabled>
                              {productSearchResults.map((result) => (
                                <Pressable
                                  key={`${result.productId}-${result.variantId}`}
                                  onPress={() => handleAddEditItem(result)}
                                  className="flex-row items-center p-3 border-b active:opacity-70"
                                  style={{ borderBottomColor: colors.border.light }}
                                >
                                  <View className="flex-1">
                                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                                      {result.productName} - {result.variantName}
                                    </Text>
                                    <Text style={{ color: result.stock > 0 ? '#10B981' : '#EF4444' }} className="text-xs">
                                      {result.stock > 0 ? `${result.stock} in stock` : 'Out of stock'}
                                    </Text>
                                  </View>
                                  <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{formatCurrency(result.price)}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Current Items */}
                    {editItems.length > 0 ? (
                      <View className="rounded-xl overflow-hidden" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                        {editItems.map((item, index) => {
                          const { productName, variantName } = getEditItemDetails(item);
                          return (
                            <View
                              key={`${item.productId}-${item.variantId}`}
                              className="flex-row items-center p-3 border-b"
                              style={{ borderBottomColor: colors.border.light }}
                            >
                              <View className="flex-1">
                                <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{productName}</Text>
                                <Text style={{ color: colors.text.muted }} className="text-xs">{variantName}</Text>
                              </View>
                              <View className="flex-row items-center rounded-lg mr-2" style={{ backgroundColor: colors.bg.card }}>
                                <Pressable onPress={() => handleUpdateEditItemQty(index, -1)} className="p-2 active:opacity-50">
                                  <Minus size={12} color={colors.text.primary} strokeWidth={2} />
                                </Pressable>
                                <Text style={{ color: colors.text.primary }} className="text-sm font-bold w-6 text-center">{item.quantity}</Text>
                                <Pressable onPress={() => handleUpdateEditItemQty(index, 1)} className="p-2 active:opacity-50">
                                  <Plus size={12} color={colors.text.primary} strokeWidth={2} />
                                </Pressable>
                              </View>
                              <Text style={{ color: colors.text.primary }} className="text-sm font-bold w-20 text-right">{formatCurrency(item.unitPrice * item.quantity)}</Text>
                              <Pressable onPress={() => handleRemoveEditItem(index)} className="ml-2 p-1 active:opacity-50">
                                <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View className="py-6 items-center rounded-xl" style={{ backgroundColor: colors.bg.secondary }}>
                        <Package size={24} color={colors.text.muted} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.muted }} className="text-sm mt-2">No products added</Text>
                      </View>
                    )}
                  </View>

                  {/* Payment Method */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Payment Method</Text>
                    <Pressable
                      onPress={() => setShowPaymentDropdown(!showPaymentDropdown)}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                    >
                      <Text style={{ color: editPaymentMethod ? colors.input.text : colors.input.placeholder }}>
                        {editPaymentMethod || 'Select Payment Method'}
                      </Text>
                      <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                    {showPaymentDropdown && (
                      <View className="rounded-xl mt-2 overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                        {paymentMethods.map((method) => (
                          <Pressable
                            key={method.id}
                            onPress={() => {
                              setEditPaymentMethod(method.name);
                              setShowPaymentDropdown(false);
                            }}
                            className="px-4 py-3 border-b active:opacity-70"
                            style={{ borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: editPaymentMethod === method.name ? colors.text.primary : colors.text.tertiary }} className={cn('text-sm', editPaymentMethod === method.name && 'font-semibold')}>
                              {method.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Sales Source */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Sales Source</Text>
                    <Pressable
                      onPress={() => setShowSourceDropdown(!showSourceDropdown)}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                    >
                      <Text style={{ color: editSource ? colors.input.text : colors.input.placeholder }}>
                        {editSource || 'Select Source'}
                      </Text>
                      <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                    {showSourceDropdown && (
                      <View className="rounded-xl mt-2 overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                        {saleSources.map((source) => (
                          <Pressable
                            key={source.id}
                            onPress={() => {
                              setEditSource(source.name);
                              setShowSourceDropdown(false);
                            }}
                            className="px-4 py-3 border-b active:opacity-70"
                            style={{ borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: editSource === source.name ? colors.text.primary : colors.text.tertiary }} className={cn('text-sm', editSource === source.name && 'font-semibold')}>
                              {source.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Order Total */}
                  <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: colors.bg.secondary }}>
                    <View className="flex-row justify-between mb-1">
                      <Text style={{ color: colors.text.tertiary }} className="text-sm">Subtotal</Text>
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{formatCurrency(editedSubtotal)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-1">
                      <Text style={{ color: colors.text.tertiary }} className="text-sm">Delivery</Text>
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{formatCurrency(parseFloat(editDeliveryFee) || 0)}</Text>
                    </View>
                    {(parseFloat(editDiscountAmount) || 0) > 0 && (
                      <View className="flex-row justify-between mb-1">
                        <Text style={{ color: '#10B981' }} className="text-sm">Discount{editDiscountCode ? ` (${editDiscountCode})` : ''}</Text>
                        <Text style={{ color: '#10B981' }} className="text-sm font-medium">-{formatCurrency(parseFloat(editDiscountAmount) || 0)}</Text>
                      </View>
                    )}
                    <View className="flex-row justify-between pt-2 border-t" style={{ borderTopColor: colors.border.light }}>
                      <Text style={{ color: colors.text.primary }} className="text-base font-bold">Total</Text>
                      <Text style={{ color: colors.text.primary }} className="text-base font-bold">{formatCurrency(editedTotal)}</Text>
                    </View>
                  </View>

                  {/* Done (stages changes) */}
                  <Button onPress={handleSaveEdit} className="mb-4">
                    Done
                  </Button>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Logistics Modal */}
        <Modal
          visible={showLogisticsModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowLogisticsModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              onPress={() => setShowLogisticsModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxHeight: '85%', maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Logistics Info</Text>
                  <Pressable
                    onPress={() => setShowLogisticsModal(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Carrier Selection */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Carrier</Text>
                    <Pressable
                      onPress={() => setShowCarrierDropdown(!showCarrierDropdown)}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                    >
                      <Text style={{ color: editCarrierName ? colors.input.text : colors.input.placeholder }}>
                        {editCarrierName || 'Select Carrier'}
                      </Text>
                      <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                    {showCarrierDropdown && (
                      <View className="rounded-xl mt-2 overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                        {logisticsCarriers.map((carrier) => (
                          <Pressable
                            key={carrier.id}
                            onPress={() => handleSelectCarrier(carrier.id, carrier.name)}
                            className="px-4 py-3 border-b active:opacity-70"
                            style={{ borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: editCarrierId === carrier.id ? colors.text.primary : colors.text.tertiary }} className={cn('text-sm', editCarrierId === carrier.id && 'font-semibold')}>
                              {carrier.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Date Picked Up */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Date Picked Up/Shipped</Text>
                    <Pressable
                      onPress={() => {
                        console.log('[Logistics Calendar] Opening date picker on', Platform.OS);
                        setShowDatePicker(true);
                      }}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                    >
                      <Text style={{ color: editDatePickedUp ? colors.input.text : colors.input.placeholder }}>
                        {editDatePickedUp ? editDatePickedUp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}
                      </Text>
                      <Calendar size={18} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                  </View>

                  {/* Tracking Number */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Tracking Number (Optional)</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="Enter tracking number"
                        placeholderTextColor={colors.input.placeholder}
                        value={editTrackingNumber}
                        onChangeText={setEditTrackingNumber}
                        autoCapitalize="characters"
                        style={{ color: colors.input.text, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Save (stages changes) */}
                  <Pressable
                    onPress={handleSaveLogistics}
                    className="mb-4 rounded-full items-center justify-center active:opacity-80"
                    style={{
                      height: 52,
                      backgroundColor: isDark ? '#FFFFFF' : '#111111',
                    }}
                  >
                    <Text
                      className="font-semibold text-base"
                      style={{ color: isDark ? '#111111' : '#FFFFFF' }}
                    >
                      Save
                    </Text>
                  </Pressable>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Logistics Date Picker Modal - Custom Calendar Grid */}
        <Modal
          visible={showDatePicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => setShowDatePicker(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', maxWidth: 400 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
                <Text className="text-gray-900 font-bold text-lg">Select Pickup Date</Text>
                <Pressable
                  onPress={() => setShowDatePicker(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50 bg-gray-100"
                >
                  <X size={18} color="#666666" strokeWidth={2} />
                </Pressable>
              </View>

              {/* Calendar View */}
              <View className="p-4">
                {/* Month/Year Navigation */}
                <View className="flex-row items-center justify-between mb-4">
                  <Pressable
                    onPress={() => {
                      const newDate = new Date(calendarViewDate);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setCalendarViewDate(newDate);
                    }}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-50 bg-gray-100"
                  >
                    <ChevronLeft size={20} color="#111111" strokeWidth={2} />
                  </Pressable>
                  <Text className="text-gray-900 font-bold text-base">
                    {calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const newDate = new Date(calendarViewDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setCalendarViewDate(newDate);
                    }}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-50 bg-gray-100"
                  >
                    <ChevronRight size={20} color="#111111" strokeWidth={2} />
                  </Pressable>
                </View>

                {/* Day Labels */}
                <View className="flex-row mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} className="flex-1 items-center py-2">
                      <Text className="text-gray-500 text-xs font-semibold">{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Grid */}
                {(() => {
                  const year = calendarViewDate.getFullYear();
                  const month = calendarViewDate.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date();

                  const weeks: (number | null)[][] = [];
                  let currentWeek: (number | null)[] = [];

                  // Fill in empty slots before first day
                  for (let i = 0; i < firstDay; i++) {
                    currentWeek.push(null);
                  }

                  // Fill in days
                  for (let day = 1; day <= daysInMonth; day++) {
                    currentWeek.push(day);
                    if (currentWeek.length === 7) {
                      weeks.push(currentWeek);
                      currentWeek = [];
                    }
                  }

                  // Fill in remaining slots
                  if (currentWeek.length > 0) {
                    while (currentWeek.length < 7) {
                      currentWeek.push(null);
                    }
                    weeks.push(currentWeek);
                  }

                  return weeks.map((week, weekIndex) => (
                    <View key={weekIndex} className="flex-row">
                      {week.map((day, dayIndex) => {
                        if (day === null) {
                          return <View key={dayIndex} className="flex-1 items-center py-2" />;
                        }

                        const isSelected = editDatePickedUp &&
                          editDatePickedUp.getDate() === day &&
                          editDatePickedUp.getMonth() === month &&
                          editDatePickedUp.getFullYear() === year;
                        const isToday = today.getDate() === day &&
                          today.getMonth() === month &&
                          today.getFullYear() === year;

                        return (
                          <Pressable
                            key={dayIndex}
                            onPress={() => {
                              const newDate = new Date(year, month, day, 12, 0, 0);
                              setEditDatePickedUp(newDate);
                            }}
                            className={cn(
                              'flex-1 items-center py-2 mx-0.5 my-0.5 rounded-lg',
                              isSelected && 'bg-gray-900',
                              !isSelected && 'active:bg-gray-100'
                            )}
                          >
                            <Text className={cn(
                              'text-sm font-medium',
                              isSelected ? 'text-white' : 'text-gray-900',
                              isToday && !isSelected && 'text-blue-600 font-bold'
                            )}>
                              {day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ));
                })()}

                {/* Confirm Button */}
                <View className="flex-row mt-4 gap-3">
                  <Pressable
                    onPress={() => {
                      setEditDatePickedUp(null);
                      setShowDatePicker(false);
                    }}
                    className="flex-1 py-3 rounded-full items-center bg-gray-200"
                  >
                    <Text className="text-gray-700 font-semibold">Clear</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="flex-1 py-3 rounded-full items-center bg-gray-900"
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Refund Request Modal */}
        <Modal
          visible={showRefundRequestModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowRefundRequestModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              onPress={() => setShowRefundRequestModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxHeight: '85%', maxWidth: 400 }}
              >
                <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Refund Request</Text>
                  <Pressable
                    onPress={() => setShowRefundRequestModal(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Refund Amount *</Text>
                    <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}>
                      <Text style={{ color: colors.input.placeholder, fontSize: 14, marginRight: 4 }}>₦</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={colors.input.placeholder}
                        value={refundAmount}
                        onChangeText={setRefundAmount}
                        keyboardType="decimal-pad"
                        style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                      Remaining refundable: {formatCurrency(Math.max(0, order.totalAmount - (order.refund?.amount ?? 0)))}
                    </Text>
                  </View>

                  <View className="mb-4 rounded-xl px-4 py-3" style={{ borderWidth: 1, borderColor: colors.input.border, backgroundColor: colors.input.bg }}>
                    <Pressable
                      onPress={() => setApplyRefundBankCharges((value) => !value)}
                      className="flex-row items-center justify-between"
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Apply bank charges</Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                          Include transfer fee, VAT and stamp duty in debit total
                        </Text>
                      </View>
                      <View style={{ width: 38, height: 22, borderRadius: 11, backgroundColor: applyRefundBankCharges ? '#F59E0B' : colors.border.light, justifyContent: 'center', paddingHorizontal: 2 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', marginLeft: applyRefundBankCharges ? 16 : 0 }} />
                      </View>
                    </Pressable>
                    {applyRefundBankCharges ? (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        <Text style={{ color: colors.text.muted }} className="text-xs">
                          Auto-filled from finance transfer fee settings. You can edit the actual debit if needed.
                        </Text>
                        <TextInput
                          placeholder="Bank charges"
                          placeholderTextColor={colors.input.placeholder}
                          value={refundBankChargeDraft}
                          onChangeText={(value) => {
                            setRefundBankChargeDraft(value);
                            setRefundBankChargeManuallyEdited(true);
                          }}
                          keyboardType="decimal-pad"
                          style={{ color: colors.input.text, fontSize: 14, borderWidth: 1, borderColor: colors.input.border, backgroundColor: colors.bg.secondary, borderRadius: 10, paddingHorizontal: 12, height: 44 }}
                          selectionColor={colors.text.primary}
                        />
                        <TextInput
                          placeholder="Stamp duty"
                          placeholderTextColor={colors.input.placeholder}
                          value={refundStampDutyDraft}
                          onChangeText={(value) => {
                            setRefundStampDutyDraft(value);
                            setRefundStampDutyManuallyEdited(true);
                          }}
                          keyboardType="decimal-pad"
                          style={{ color: colors.input.text, fontSize: 14, borderWidth: 1, borderColor: colors.input.border, backgroundColor: colors.bg.secondary, borderRadius: 10, paddingHorizontal: 12, height: 44 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    ) : (
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-2">Bank charges are turned off for this refund.</Text>
                    )}
                    <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Total debit</Text>
                      <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{formatCurrency(refundTotalDebit)}</Text>
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Requested Refund Date *</Text>
                    {Platform.OS === 'web' ? (
                      <View
                        className="rounded-xl px-4 flex-row items-center"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                      >
                        <input
                          type="date"
                          value={refundDate.toISOString().split('T')[0]}
                          onChange={(e) => {
                            const dateValue = e.target.value;
                            if (dateValue) {
                              const [year, month, day] = dateValue.split('-').map(Number);
                              const newDate = new Date(year, month - 1, day, 12, 0, 0);
                              setRefundDate(newDate);
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            fontSize: 14,
                            color: colors.input.text,
                            backgroundColor: 'transparent',
                            border: 'none',
                            outline: 'none',
                          }}
                        />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setShowRefundDatePicker(true)}
                        className="rounded-xl px-4 flex-row items-center justify-between"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                      >
                        <Text style={{ color: colors.input.text }}>
                          {refundDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        <Calendar size={18} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>

                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Reason</Text>
                    <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 80 }}>
                      <TextInput
                        placeholder="Explain why the refund is needed"
                        placeholderTextColor={colors.input.placeholder}
                        value={refundReason}
                        onChangeText={setRefundReason}
                        multiline
                        numberOfLines={3}
                        style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Context screenshots (optional)</Text>
                    {refundRequestAttachments.length === 0 ? (
                      <Pressable
                        onPress={() => { void handlePickRefundRequestAttachment(); }}
                        className="rounded-2xl items-center justify-center"
                        style={{
                          minHeight: 136,
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: colors.input.border,
                          backgroundColor: colors.input.bg,
                          paddingHorizontal: 20,
                          paddingVertical: 24,
                        }}
                      >
                        <View
                          className="rounded-full items-center justify-center mb-3"
                          style={{ width: 46, height: 46, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.input.border }}
                        >
                          <Camera size={20} color={colors.text.tertiary} strokeWidth={2} />
                        </View>
                        <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>Upload screenshot</Text>
                        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                          Optional context for the refund reason. Refund proof is uploaded after approval.
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={{ gap: 10 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                          {refundRequestAttachments.map((attachment) => (
                            <View key={attachment.id} style={{ width: 110 }}>
                              <View
                                className="rounded-2xl overflow-hidden"
                                style={{
                                  height: 110,
                                  borderWidth: 1,
                                  borderColor: colors.input.border,
                                  backgroundColor: colors.input.bg,
                                  position: 'relative',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {attachment.localUri ? (
                                  <Image source={{ uri: attachment.localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : (
                                  <View className="items-center justify-center px-3">
                                    <FileText size={22} color={colors.text.tertiary} strokeWidth={2} />
                                    <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 8, textAlign: 'center' }} numberOfLines={2}>
                                      {attachment.fileName}
                                    </Text>
                                  </View>
                                )}
                                <Pressable
                                  onPress={() => {
                                    setRefundRequestAttachments((previous) => previous.filter((item) => item.id !== attachment.id));
                                    setRefundRequestUploadError('');
                                  }}
                                  className="rounded-full items-center justify-center"
                                  style={{
                                    position: 'absolute',
                                    top: 8,
                                    right: 8,
                                    width: 28,
                                    height: 28,
                                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                                  }}
                                >
                                  <X size={14} color="#FFFFFF" strokeWidth={2} />
                                </Pressable>
                              </View>
                              <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 6, textAlign: 'center' }} numberOfLines={2}>
                                {attachment.fileName}
                              </Text>
                            </View>
                          ))}
                        </ScrollView>

                        <Pressable
                          onPress={() => { void handlePickRefundRequestAttachment(); }}
                          className="rounded-xl items-center justify-center"
                          style={{
                            height: 44,
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: colors.input.border,
                          }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>+ Add Another Image</Text>
                        </Pressable>
                      </View>
                    )}

                    {refundRequestUploadError ? (
                      <Text style={{ color: colors.accent.danger, fontSize: 12, marginTop: 8 }}>
                        {refundRequestUploadError}
                      </Text>
                    ) : null}
                  </View>

                  <View className="flex-row items-center justify-end mb-4" style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => { void handleSubmitRefundRequest('save'); }}
                      className="rounded-full px-5"
                      style={{ height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Save Draft</Text>
                    </Pressable>
                    <Button
                      onPress={() => { void handleSubmitRefundRequest('submit'); }}
                      disabled={!refundAmount || parseFloat(refundAmount) <= 0}
                      variant="primary"
                      fullWidth={false}
                    >
                      Submit
                    </Button>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Refund Modal */}
        <Modal
          visible={showRefundModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowRefundModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              onPress={() => setShowRefundModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxHeight: '85%', maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Refund</Text>
                  <Pressable
                    onPress={() => setShowRefundModal(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Refund Amount */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Refund Amount *</Text>
                    <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}>
                      <Text style={{ color: colors.input.placeholder, fontSize: 14, marginRight: 4 }}>₦</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={colors.input.placeholder}
                        value={refundAmount}
                        onChangeText={setRefundAmount}
                        keyboardType="decimal-pad"
                        style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Order total: {formatCurrency(order.totalAmount)}</Text>
                  </View>

                  {/* Refund Date */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Refund Date *</Text>
                    {Platform.OS === 'web' ? (
                      /* Web fallback - HTML date input */
                      <View
                        className="rounded-xl px-4 flex-row items-center"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                      >
                        <input
                          type="date"
                          value={refundDate.toISOString().split('T')[0]}
                          onChange={(e) => {
                            const dateValue = e.target.value;
                            if (dateValue) {
                              const [year, month, day] = dateValue.split('-').map(Number);
                              const newDate = new Date(year, month - 1, day, 12, 0, 0);
                              setRefundDate(newDate);
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            fontSize: 14,
                            color: colors.input.text,
                            backgroundColor: 'transparent',
                            border: 'none',
                            outline: 'none',
                          }}
                        />
                      </View>
                    ) : (
                      /* Native iOS/Android - Button to open picker */
                      <Pressable
                        onPress={() => setShowRefundDatePicker(true)}
                        className="rounded-xl px-4 flex-row items-center justify-between"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 52 }}
                      >
                        <Text style={{ color: colors.input.text }}>
                          {refundDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        <Calendar size={18} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>

                  {/* Reason */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Reason</Text>
                    <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 80 }}>
                      <TextInput
                        placeholder="Enter refund reason"
                        placeholderTextColor={colors.input.placeholder}
                        value={refundReason}
                        onChangeText={setRefundReason}
                        multiline
                        numberOfLines={3}
                        style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Proof Image */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Proof (Screenshot of Transfer)</Text>
                    {refundProofUri ? (
                      <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                        <Image source={{ uri: refundProofUri }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
                        <Pressable
                          onPress={() => setRefundProofUri('')}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                        >
                          <X size={16} color="#FFFFFF" strokeWidth={2} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={handlePickRefundProof}
                        className="rounded-xl items-center justify-center py-6 active:opacity-70"
                        style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, borderStyle: 'dashed' }}
                      >
                        <Camera size={24} color={colors.text.tertiary} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.tertiary }} className="text-sm mt-2">Upload proof image</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Done (stages changes) */}
                  <Button
                    onPress={handleSaveRefund}
                    disabled={!refundAmount || parseFloat(refundAmount) <= 0}
                    variant="danger"
                    className="mb-4"
                  >
                    Done
                  </Button>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Refund Date Picker Modal for iOS/Android */}
        {Platform.OS !== 'web' && showRefundDatePicker && (
          <Modal
            visible={showRefundDatePicker}
            animationType="fade"
            transparent
            onRequestClose={() => setShowRefundDatePicker(false)}
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              onPress={() => setShowRefundDatePicker(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: '#FFFFFF', maxWidth: 400 }}
              >
                <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-200">
                  <Text className="text-gray-900 font-bold text-lg">Select Refund Date</Text>
                  <Pressable
                    onPress={() => setShowRefundDatePicker(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50 bg-gray-100"
                  >
                    <X size={18} color="#666666" strokeWidth={2} />
                  </Pressable>
                </View>
                <View className="p-4 items-center">
                  <DateTimePicker
                    value={refundDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowRefundDatePicker(false);
                      }
                      if (date) {
                        setRefundDate(date);
                      }
                    }}
                    style={{ width: '100%' }}
                    themeVariant="light"
                  />
                  {Platform.OS === 'ios' && (
                    <Pressable
                      onPress={() => setShowRefundDatePicker(false)}
                      className="mt-4 w-full py-3 rounded-full items-center bg-gray-900"
                    >
                      <Text className="text-white font-semibold">Done</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        <CaseForm
          visible={showCaseForm}
          onClose={() => setShowCaseForm(false)}
          onSave={handleSaveCase}
          orderId={order.id}
          orderNumber={order.orderNumber}
          customerId={order.customerId}
          customerName={order.customerName}
          createdBy={currentUser?.name}
        />
      </SafeAreaView>

      {toast && (
        <View
          className="absolute left-5 right-5 items-center"
          style={{ top: Math.max(12, insets.top + 12), pointerEvents: 'none' }}
        >
          <View
            className="flex-row items-center px-5 py-4 rounded-xl"
            style={{ backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444' }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-white">
              <Check size={18} color={toast.type === 'success' ? '#111111' : '#EF4444'} strokeWidth={2.5} />
            </View>
            <Text className="text-white font-semibold text-sm">{toast.message}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
