import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, TextInput, Modal, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ShoppingCart, ChevronRight, Filter, Check, X, ArrowDownAZ, ArrowUpAZ, DollarSign, Clock, AlertCircle, Flag, Sparkles } from 'lucide-react-native';
import useFyllStore, { Order, Product, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { collaborationData } from '@/lib/supabase/collaboration';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { MOBILE_FILTER_SHEET } from '@/lib/mobile-filter-sheet';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { getActiveSplitCardStyle } from '@/lib/selection-style';
import { SplitViewLayout } from '@/components/SplitViewLayout';
import { OrderDetailPanel } from '@/components/OrderDetailPanel';
import { FyllAiButton } from '@/components/FyllAiButton';
import { parseOrderFromText, type ParsedOrderData } from '@/lib/ai-order-parser';
import { getOrderStatusColor } from '@/lib/order-status-colors';
import { findOrderTrackingStageByName, sortOrderStatusesForFulfillment } from '@/lib/order-status';
import { getFulfillmentSnapshot } from '@/lib/fulfillment';
import * as Haptics from 'expo-haptics';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { SearchClearButton } from '@/components/SearchClearButton';
import { supabaseData } from '@/lib/supabase/data';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

// Hairline separator colors
const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const ORDERS_PAGE_SIZE = 20;

type OrdersPaymentRecord = {
  id: string;
  status?: string;
  customerName?: string;
  amount?: number;
  sourceOrderId?: string;
  linkedOrderId?: string | null;
  unlinkedOrderId?: string | null;
};

const normalizeOrderStatusLabel = (value?: string | null) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);

const toOrderStatusDisplayLabel = (value: string) => {
  const normalized = normalizeOrderStatusLabel(value);
  if (!normalized) return 'Status';
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getOrderStatusDisplay = (status: string) => {
  const normalized = normalizeOrderStatusLabel(status);
  const systemStatusMap: Record<string, { label: string; color: string; bg: string }> = {
    'awaiting payment': { label: 'Awaiting Payment', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'pending payment': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'payment approval': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'pending payment approval': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'awaiting verification': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'payment pending verification': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    'pending manual verification': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    processing: { label: 'Processing', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
    preparing: { label: 'Preparing', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    packed: { label: 'Packed', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
    dispatched: { label: 'Dispatched', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    dispatch: { label: 'Dispatch', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    shipped: { label: 'Shipped', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
    delivered: { label: 'Delivered', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    complete: { label: 'Complete', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    completed: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    refunded: { label: 'Refunded', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    rejected: { label: 'Rejected', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    failed: { label: 'Failed', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    cancelled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    canceled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  };
  const mappedStatus = systemStatusMap[normalized];
  if (mappedStatus) return mappedStatus;
  if (['verified', 'paid', 'payment confirmed', 'confirmed'].includes(normalized)) {
    return {
      label: 'Payment Confirmed',
      color: '#059669',
      bg: 'rgba(5,150,105,0.12)',
    };
  }
  if (['pending payment', 'payment approval', 'pending payment approval', 'awaiting verification', 'payment pending verification', 'pending manual verification'].includes(normalized)) {
    return {
      label: 'Payment Approval',
      color: '#D97706',
      bg: 'rgba(217,119,6,0.12)',
    };
  }
  if (normalized.includes('cancel') || normalized === 'payment failed') {
    return {
      label: toOrderStatusDisplayLabel(status),
      color: '#DC2626',
      bg: 'rgba(220,38,38,0.12)',
    };
  }
  return {
    label: toOrderStatusDisplayLabel(status),
    color: '',
    bg: '',
  };
};

const parseTimelineDayCount = (label?: string) => {
  if (!label) return null;
  const match = label.match(/Day\s+(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const elapsedDays = Number.parseInt(match[1] ?? '', 10);
  const timelineDays = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(elapsedDays) || !Number.isFinite(timelineDays)) return null;
  return { elapsedDays, timelineDays };
};

const getTimelineCellMeta = (order: Order, orderStatuses: ReturnType<typeof useFyllStore.getState>['orderStatuses']) => {
  const snapshot = getFulfillmentSnapshot(order, new Date(), orderStatuses);
  const dayCount = parseTimelineDayCount(snapshot.dayCountLabel);
  const statusLabel = snapshot.statusMeta.label.trim().toLowerCase();

  if (snapshot.stage === 'cancelled' || statusLabel.includes('cancel') || statusLabel.includes('refund')) {
    return null;
  }

  if (snapshot.statusMeta.isLate && dayCount) {
    return {
      label: 'Overdue',
      dayLabel: `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}`,
      text: '#DC2626',
      bg: 'rgba(220,38,38,0.12)',
      icon: AlertCircle,
    };
  }

  if (snapshot.stage === 'completed') {
    return {
      label: 'On time',
      dayLabel: dayCount ? `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}` : null,
      text: '#22C55E',
      bg: 'rgba(34,197,94,0.12)',
      icon: Check,
    };
  }

  if (dayCount) {
    if (dayCount.elapsedDays >= dayCount.timelineDays) {
      return {
        label: 'Due soon',
        dayLabel: `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}`,
        text: '#F59E0B',
        bg: 'rgba(245,158,11,0.12)',
        icon: Clock,
      };
    }

    if (dayCount.elapsedDays > 1 || snapshot.publicStep === 'processing' || snapshot.publicStep === 'out-for-delivery') {
      return {
        label: 'On track',
        dayLabel: `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}`,
        text: '#3B82F6',
        bg: 'rgba(59,130,246,0.12)',
        icon: Clock,
      };
    }
  }

  return {
    label: 'On time',
    dayLabel: dayCount ? `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}` : null,
    text: '#22C55E',
    bg: 'rgba(34,197,94,0.12)',
    icon: Check,
  };
};

interface OrderCardProps {
  order: Order;
  products: Product[];
  statusColor: string;
  onPress: () => void;
  isSelected?: boolean;
  showSplitView?: boolean;
  separatorColor: string;
  unreadCount?: number;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

const getOrderDate = (order: Order) => new Date(order.orderDate ?? order.createdAt);

const getOrderDayKey = (order: Order) => {
  const date = getOrderDate(order);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 10);
};

const getOrderDayLabel = (order: Order) => {
  const date = getOrderDate(order);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (difference === 0) return 'Today';
  if (difference === 1) return `Yesterday · ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const getCustomerInitials = (name: string) => (
  name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—'
);

const formatOrderItemSummary = (order: Order, products: Product[]) => {
  const firstItem = order.items?.[0];
  if (!firstItem) return 'No products';
  const product = products.find((candidate) => candidate.id === firstItem.productId);
  const variant = product?.variants.find((candidate) => candidate.id === firstItem.variantId);
  const productName = product?.name || firstItem.productName || 'Product unavailable';
  const variantName = variant ? Object.values(variant.variableValues).join(' / ') : (firstItem.variantName ?? '');
  const selectedOptions = Object.entries(firstItem.selectedOptions ?? {})
    .filter(([name, value]) => name.trim() && String(value).trim())
    .map(([name, value]) => `${name}: ${value}`)
    .join(' / ');
  const details = [variantName, selectedOptions].filter(Boolean).join(' / ');
  const suffix = (order.items?.length ?? 0) > 1 ? ` +${(order.items?.length ?? 1) - 1}` : '';
  return `${productName}${details ? ` - ${details}` : ''}${suffix}`;
};

function OrderCard({ order, products, statusColor, onPress, isSelected, showSplitView, separatorColor, unreadCount, isFirstInGroup, isLastInGroup }: OrderCardProps) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const statusDisplay = getOrderStatusDisplay(order.status);
  const chipTextColor = statusDisplay.color || statusColor;
  const itemSummary = formatOrderItemSummary(order, products);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const timelineMeta = getTimelineCellMeta(order, orderStatuses);
  const TimelineIcon = timelineMeta?.icon;
  const isCancelled = findOrderTrackingStageByName(order.status, orderStatuses) === 'cancelled';

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      className="active:opacity-80"
    >
      <View
        style={{
          backgroundColor: colors.bg.card,
          borderTopWidth: isFirstInGroup ? 1 : 0,
          borderBottomWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: separatorColor,
          borderTopLeftRadius: isFirstInGroup ? 18 : 0,
          borderTopRightRadius: isFirstInGroup ? 18 : 0,
          borderBottomLeftRadius: isLastInGroup ? 18 : 0,
          borderBottomRightRadius: isLastInGroup ? 18 : 0,
          ...getActiveSplitCardStyle({ isSelected, showSplitView, isDark, colors }),
        }}
        className="px-3.5 py-3"
      >
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#2A2B24' : colors.bg.secondary }}>
            <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600' }}>{getCustomerInitials(order.customerName)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
              <View className="flex-row items-center" style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{order.customerName}</Text>
                {order.flagNote ? <Flag size={11} color={colors.accent.warning} fill={colors.accent.warning} strokeWidth={2} style={{ marginLeft: 6 }} /> : null}
                {(unreadCount ?? 0) > 0 ? <View style={{ minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 6 }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unreadCount}</Text></View> : null}
              </View>
              <Text style={{ color: isCancelled ? colors.text.muted : colors.text.primary, fontSize: 12, fontWeight: '600', textDecorationLine: isCancelled ? 'line-through' : 'none' }}>{formatCurrency(order.totalAmount)}</Text>
            </View>
            <Text style={{ color: colors.text.muted, fontSize: 10 }} numberOfLines={1}>{order.orderNumber} · {itemSummary}</Text>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
              <View className="flex-row items-center" style={{ gap: 5, minWidth: 0 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: chipTextColor }} />
                <Text style={{ color: chipTextColor, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{statusDisplay.label}</Text>
              </View>
              {timelineMeta ? <View className="flex-row items-center" style={{ gap: 5 }}>{TimelineIcon ? <TimelineIcon size={11} color={timelineMeta.text} strokeWidth={2.2} /> : null}<Text style={{ color: timelineMeta.text, fontSize: 10 }} numberOfLines={1}>{timelineMeta.dayLabel ? `${timelineMeta.dayLabel} · ` : ''}{timelineMeta.label}</Text></View> : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function OrderRowWeb({
  order,
  products,
  statusColor,
  onPress,
  isSelected,
  baseBackgroundColor,
  separatorColor,
  isLast,
  unreadCount,
}: {
  order: Order;
  products: Product[];
  statusColor: string;
  onPress: () => void;
  isSelected?: boolean;
  baseBackgroundColor?: string;
  separatorColor: string;
  isLast?: boolean;
  unreadCount?: number;
}) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const orderStatuses = useFyllStore((s) => s.orderStatuses);

  const statusDisplay = getOrderStatusDisplay(order.status);
  const chipTextColor = statusDisplay.color || statusColor;
  const timelineMeta = getTimelineCellMeta(order, orderStatuses);
  const TimelineIcon = timelineMeta?.icon;
  const itemSummary = formatOrderItemSummary(order, products);
  const isCancelled = findOrderTrackingStageByName(order.status, orderStatuses) === 'cancelled';
  const dayCount = timelineMeta?.dayLabel ? parseTimelineDayCount(timelineMeta.dayLabel) : null;
  const progress = dayCount ? Math.min(100, Math.max(0, (dayCount.elapsedDays / Math.max(1, dayCount.timelineDays)) * 100)) : 0;

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
      style={{
        backgroundColor: isSelected
          ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
          : (baseBackgroundColor ?? colors.bg.card),
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: separatorColor,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 22, gap: 16 }}>
        <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12 }} className="font-semibold" numberOfLines={1}>
            {order.orderNumber}
          </Text>
          {order.flagNote && (
            <Flag size={12} color={colors.accent.warning} fill={colors.accent.warning} strokeWidth={2} />
          )}
          {(unreadCount ?? 0) > 0 && (
            <View style={{
              backgroundColor: '#DC2626',
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 5,
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}><View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#2A2B24' : colors.bg.secondary }}><Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>{getCustomerInitials(order.customerName)}</Text></View><Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', flex: 1 }} numberOfLines={1}>{order.customerName}</Text></View>
        <Text style={{ color: colors.text.secondary, flex: 1.2, fontSize: 12 }} numberOfLines={1}>
          {itemSummary}
        </Text>
        <Text style={{ color: colors.text.tertiary, width: 56, textAlign: 'right', fontSize: 12 }} numberOfLines={1}>
          {order.items?.length ?? 0}
        </Text>
        <Text style={{ color: isCancelled ? colors.text.muted : colors.text.primary, width: 110, textAlign: 'right', fontSize: 12, fontWeight: '600', textDecorationLine: isCancelled ? 'line-through' : 'none' }} numberOfLines={1}>
          {formatCurrency(order.totalAmount)}
        </Text>
        <View style={{ width: 200, minWidth: 0 }}>
          {timelineMeta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  height: 24,
                  paddingHorizontal: 9,
                  borderRadius: 999,
                  backgroundColor: timelineMeta.bg,
                }}
              >
                {TimelineIcon ? <TimelineIcon size={13} color={timelineMeta.text} strokeWidth={2.2} /> : null}
                <Text style={{ color: timelineMeta.text, fontSize: 12, fontWeight: '600', marginLeft: 5 }} numberOfLines={1}>
                  {timelineMeta.label}
                </Text>
              </View>
              {timelineMeta.dayLabel ? (
                <View style={{ width: 64, gap: 4 }}><Text style={{ color: colors.text.tertiary, fontSize: 12 }} numberOfLines={1}>{timelineMeta.dayLabel}</Text><View style={{ height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border.light }}><View style={{ height: 3, width: `${progress}%`, backgroundColor: timelineMeta.text }} /></View></View>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '400' }}>-</Text>
          )}
        </View>
        <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: chipTextColor }} /><Text style={{ color: chipTextColor, fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>{statusDisplay.label}</Text></View>
        <View style={{ width: 24, alignItems: 'flex-end' }}>
          <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
        </View>
      </View>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_700Bold });
  const router = useRouter();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const isWeb = Platform.OS === 'web';
  const isWebDesktop = isWeb && isDesktop;
  const showSplitView = !isMobile && !isWebDesktop;
  const horizontalPadding = isMobile ? 16 : isDesktop ? 28 : 20;
  const contentMaxWidth = isWebDesktop ? 1456 : isDesktop ? 980 : undefined;

  const orders = useFyllStore((s) => s.orders);
  const products = useFyllStore((s) => s.products);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const lastDataSyncAt = useFyllStore((s) => s.lastDataSyncAt);
  const hasVerifiedOrdersData = useFyllStore((s) => s.hasVerifiedOrdersData);
  const verifiedCollectionsBusinessId = useFyllStore((s) => s.verifiedCollectionsBusinessId);
  const businessId = useAuthStore((s) => s.businessId);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const isInitialLoading = Boolean(businessId) && !isOfflineMode && (
    !hasVerifiedOrdersData || verifiedCollectionsBusinessId !== businessId
  );

  // Fetch unread notification counts per order (badges clear after viewing thread)
  const threadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'order'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'order'),
    refetchInterval: 15000,
  });
  const unreadCounts = threadCountsQuery.data ?? {};
  const paymentsQuery = useQuery({
    queryKey: ['orders-unlinked-verified-payments', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<OrdersPaymentRecord>('payments', businessId!);
      return rows.map((row) => row.data);
    },
    staleTime: 30_000,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFyllAiModal, setShowFyllAiModal] = useState(false);
  const [aiMessageText, setAiMessageText] = useState('');
  const [aiIsParsing, setAiIsParsing] = useState(false);
  const [aiParsedData, setAiParsedData] = useState<ParsedOrderData | null>(null);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'amount-high' | 'amount-low'>('newest');
  const [visibleOrdersCount, setVisibleOrdersCount] = useState(ORDERS_PAGE_SIZE);

  // Split view state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const statusColorMap = useMemo(() => {
    return orderStatuses.reduce((acc, status) => {
      acc[status.name] = status.color;
      return acc;
    }, {} as Record<string, string>);
  }, [orderStatuses]);

  const sortedOrderStatuses = useMemo(() => (
    sortOrderStatusesForFulfillment(orderStatuses)
  ), [orderStatuses]);

  const availableSources = useMemo(() => (
    Array.from(new Set(orders.map((o) => o.source?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
  ), [orders]);

  // Get selected order
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(query) ||
          o.customerName?.toLowerCase().includes(query) ||
          (o.customerEmail && o.customerEmail.toLowerCase().includes(query)) ||
          formatOrderItemSummary(o, products).toLowerCase().includes(query)
      );
    }

    if (selectedStatus) {
      result = result.filter((o) => o.status === selectedStatus);
    }

    if (selectedSource) {
      result = result.filter((o) => o.source === selectedSource);
    }

    // Apply sorting
    result = result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name-asc':
          return a.customerName.localeCompare(b.customerName);
        case 'name-desc':
          return b.customerName.localeCompare(a.customerName);
        case 'amount-high':
          return b.totalAmount - a.totalAmount;
        case 'amount-low':
          return a.totalAmount - b.totalAmount;
        default:
          return 0;
      }
    });

    return result;
  }, [orders, products, searchQuery, selectedStatus, selectedSource, sortBy]);

  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, visibleOrdersCount),
    [filteredOrders, visibleOrdersCount]
  );
  const hasMoreOrders = visibleOrders.length < filteredOrders.length;

  useEffect(() => {
    setVisibleOrdersCount(ORDERS_PAGE_SIZE);
  }, [searchQuery, selectedStatus, sortBy, orders.length]);

  const loadMoreOrders = () => {
    if (!hasMoreOrders) return;
    setVisibleOrdersCount((prev) => Math.min(prev + ORDERS_PAGE_SIZE, filteredOrders.length));
  };

  useEffect(() => {
    if (!showSplitView) return;
    if (selectedOrderId && filteredOrders.some((order) => order.id === selectedOrderId)) return;
    if (filteredOrders.length > 0) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [showSplitView, filteredOrders, selectedOrderId]);

  const handleNewOrder = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/new-order');
  };

  const openOrderAi = () => {
    if (Platform.OS === 'web') {
      setShowFyllAiModal(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/ai-order');
  };

  const handleParseOrderWithAi = async () => {
    if (!aiMessageText.trim()) {
      setAiParseError('Paste the customer message first, then parse.');
      return;
    }

    setAiIsParsing(true);
    setAiParseError(null);
    setAiParsedData(null);

    try {
      const result = await parseOrderFromText(aiMessageText);
      if (!result) {
        setAiParseError('Fyll AI could not extract order details from this message. Please adjust the text and retry.');
        return;
      }
      setAiParsedData(result);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : 'Fyll AI parsing failed. Please retry.';
      setAiParseError(message);
    } finally {
      setAiIsParsing(false);
    }
  };

  const handleCreateDraftFromParsedOrder = () => {
    if (!aiParsedData) return;
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setShowFyllAiModal(false);
    router.push({
      pathname: '/new-order',
      params: {
        aiParsed: 'true',
        customerName: aiParsedData.customerName,
        customerPhone: aiParsedData.customerPhone,
        customerEmail: aiParsedData.customerEmail,
        deliveryAddress: aiParsedData.deliveryAddress,
        deliveryState: aiParsedData.deliveryState,
        deliveryFee: String(aiParsedData.deliveryFee || ''),
        websiteOrderReference: aiParsedData.websiteOrderReference || '',
        notes: aiParsedData.notes,
        items: JSON.stringify(aiParsedData.items),
        services: JSON.stringify(aiParsedData.services ?? []),
      },
    });
  };

  const handleResetOrderAiModal = () => {
    setAiMessageText('');
    setAiIsParsing(false);
    setAiParsedData(null);
    setAiParseError(null);
  };

  const handleOrderSelect = (orderId: string) => {
    if (isWebDesktop) {
      router.push(`/orders/${orderId}`);
      return;
    }
    if (showSplitView) {
      setSelectedOrderId(orderId);
    } else {
      router.push(`/order/${orderId}`);
    }
  };

  const lastSyncLabel = useMemo(() => {
    if (!lastDataSyncAt) return 'Not synced yet';
    try {
      return new Date(lastDataSyncAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  }, [lastDataSyncAt]);

  const orderSummary = useMemo(() => {
    const now = new Date();
    const stages = orders.map((order) => ({
      order,
      stage: findOrderTrackingStageByName(order.status, orderStatuses),
    }));
    const inProgress = stages.filter(({ stage }) => !['cancelled', 'delivered', 'completed'].includes(stage));
    return {
      inProgressCount: inProgress.length,
      inProgressValue: inProgress.reduce((sum, { order }) => sum + (order.totalAmount || 0), 0),
      processingCount: stages.filter(({ stage }) => stage === 'processing').length,
      dispatchedCount: stages.filter(({ stage }) => stage === 'out-for-delivery').length,
      completedThisMonth: orders.filter((order) => {
        const status = normalizeOrderStatusLabel(order.status);
        const date = getOrderDate(order);
        return (status === 'completed' || status === 'complete')
          && !Number.isNaN(date.getTime())
          && date.getMonth() === now.getMonth()
          && date.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [orderStatuses, orders]);

  const statusCounts = useMemo(() => orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
    return counts;
  }, {}), [orders]);

  const activeFilterCount = (selectedStatus ? 1 : 0) + (selectedSource ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0);
  const unlinkedVerifiedPayments = useMemo(() => (paymentsQuery.data ?? []).filter((payment) => {
    const status = normalizeOrderStatusLabel(payment.status);
    if (!['verified', 'confirmed', 'payment confirmed', 'paid'].includes(status)) return false;
    if (payment.linkedOrderId) return false;
    return !orders.some((order) => (
      order.id === payment.sourceOrderId
      || order.orderNumber === payment.sourceOrderId
      || order.id === payment.unlinkedOrderId
    ));
  }), [orders, paymentsQuery.data]);
  const firstUnlinkedPayment = unlinkedVerifiedPayments[0];

  const ordersHeaderContent = (
    <View style={{ paddingTop: isWebDesktop ? 28 : 14, paddingBottom: 12, width: '100%', gap: isWebDesktop ? 18 : 14 }}>
        <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 }}>Orders</Text>
            {isWebDesktop ? <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 4 }}>Track customer orders, fulfilment and delivery.</Text> : null}
            {isOfflineMode ? <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, fontWeight: '600', marginTop: 5 }}>Offline · Last synced {lastSyncLabel}</Text> : null}
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={openOrderAi}
              accessibilityRole="button"
              accessibilityLabel="Fyll AI Order"
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(17,17,17,0.14)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Sparkles size={15} color={isDark ? '#F2F2EE' : '#686862'} strokeWidth={2.2} />
            </Pressable>
            <Pressable onPress={handleNewOrder} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: FYLL_LIME, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.78 : 1 })}>
              <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.6} />
              <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>{isMobile ? 'New' : 'New order'}</Text>
            </Pressable>
          </View>
        </View>

        {isMobile ? (
          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, padding: 18, gap: 14 }}>
            <View style={{ gap: 4 }}><Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>In progress</Text><Text style={{ color: colors.text.primary, fontSize: 32, lineHeight: 36, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -1 }}>{orderSummary.inProgressCount} orders</Text><Text style={{ color: colors.text.muted, fontSize: 13 }}>{formatCurrency(orderSummary.inProgressValue)} across processing and delivery</Text></View>
            <View style={{ height: 1, backgroundColor: separatorColor }} />
            <View className="flex-row" style={{ gap: 10 }}>
              {[
                ['Processing', orderSummary.processingCount, getOrderStatusColor('Processing', statusColorMap, '#D97706')],
                ['Dispatched', orderSummary.dispatchedCount, getOrderStatusColor('Dispatched', statusColorMap, '#2563EB')],
                ['Completed', orderSummary.completedThisMonth, getOrderStatusColor('Completed', statusColorMap, '#059669')],
              ].map(([label, value, dot]) => <View key={String(label)} style={{ flex: 1, gap: 3 }}><View className="flex-row items-center" style={{ gap: 6 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} /><Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{label}</Text></View><Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '600' }}>{value}</Text></View>)}
            </View>
          </View>
        ) : (
          <View className="flex-row" style={{ borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
            {[
              ['In progress', `${orderSummary.inProgressCount} orders`, `${formatCurrency(orderSummary.inProgressValue)} being fulfilled`, null, 1.3],
              ['Processing', String(orderSummary.processingCount), 'Currently being prepared', getOrderStatusColor('Processing', statusColorMap, '#D97706'), 1],
              ['Dispatched', String(orderSummary.dispatchedCount), 'With delivery', getOrderStatusColor('Dispatched', statusColorMap, '#2563EB'), 1],
              ['Completed', String(orderSummary.completedThisMonth), 'This month', getOrderStatusColor('Completed', statusColorMap, '#059669'), 1],
            ].map(([label, value, sub, dot, flex], index) => <View key={String(label)} style={{ flex: Number(flex), paddingHorizontal: 22, paddingVertical: 18, gap: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: separatorColor }}><View className="flex-row items-center" style={{ gap: 6 }}>{dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} /> : null}<Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text></View><Text style={{ color: colors.text.primary, fontSize: index ? 22 : 28, fontWeight: index ? '600' : bricolageLoaded ? '400' : '700', fontFamily: !index && bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: index ? -0.5 : -0.9 }}>{value}</Text><Text style={{ color: colors.text.muted, fontSize: 13 }}>{sub}</Text></View>)}
          </View>
        )}

        {isWebDesktop && firstUnlinkedPayment ? (
          <Pressable onPress={() => router.push(`/storefront-payment/${firstUnlinkedPayment.id}`)} style={({ pressed }) => ({ minHeight: 54, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? 'rgba(213,224,87,0.10)' : 'rgba(133,145,26,0.08)', borderWidth: 1, borderColor: isDark ? 'rgba(213,224,87,0.28)' : 'rgba(133,145,26,0.25)', opacity: pressed ? 0.75 : 1 })}>
            <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent.primary }}><Check size={15} color={isDark ? '#1E1E1E' : '#FFFFFF'} strokeWidth={2.4} /></View>
            <Text style={{ color: colors.text.primary, flex: 1, fontSize: 14, fontWeight: '600' }}>{unlinkedVerifiedPayments.length} verified payment{unlinkedVerifiedPayments.length === 1 ? '' : 's'} {unlinkedVerifiedPayments.length === 1 ? 'has' : 'have'} no order yet <Text style={{ color: colors.text.muted, fontWeight: '400' }}>· {firstUnlinkedPayment.customerName || 'Customer'} · {formatCurrency(firstUnlinkedPayment.amount ?? 0)} · create it from the payment</Text></Text>
            <ChevronRight size={16} color={colors.accent.primary} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <View className="flex-row items-center" style={{ height: isMobile ? 48 : 44, width: isWebDesktop ? 340 : undefined, flex: isWebDesktop ? undefined : 1, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}>
              <Search size={17} color={colors.text.muted} strokeWidth={2} />
              <TextInput placeholder="Search orders, customers, products" placeholderTextColor={colors.input.placeholder} value={searchQuery} onChangeText={setSearchQuery} style={{ flex: 1, marginLeft: 10, color: colors.input.text, fontSize: 14.5 }} selectionColor={colors.text.primary} />
              <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
            </View>
            {!isWebDesktop ? <Pressable onPress={() => setShowFilterMenu(true)} style={{ width: 48, height: 48, borderRadius: 999, borderWidth: 1, borderColor: activeFilterCount ? colors.accent.primary : colors.border.light, backgroundColor: activeFilterCount ? colors.accent.primary : colors.bg.card, alignItems: 'center', justifyContent: 'center' }}><Filter size={18} color={activeFilterCount ? (isDark ? '#1E1E1E' : '#FFFFFF') : colors.text.muted} strokeWidth={2} /></Pressable> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={isWebDesktop ? { flex: 1 } : { position: 'absolute', width: 0, height: 0 }} contentContainerStyle={{ gap: 8 }}>
              <Pressable onPress={() => setSelectedStatus(null)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedStatus === null ? colors.text.primary : 'transparent', borderWidth: 1, borderColor: selectedStatus === null ? colors.text.primary : colors.border.medium }}><Text style={{ color: selectedStatus === null ? colors.bg.primary : colors.text.secondary, fontSize: 13, fontWeight: '600' }}>All <Text style={{ opacity: 0.55 }}>{orders.length}</Text></Text></Pressable>
              {sortedOrderStatuses.map((status) => <Pressable key={status.id} onPress={() => setSelectedStatus(status.name)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedStatus === status.name ? colors.text.primary : 'transparent', borderWidth: 1, borderColor: selectedStatus === status.name ? colors.text.primary : colors.border.medium }}><Text style={{ color: selectedStatus === status.name ? colors.bg.primary : colors.text.secondary, fontSize: 13, fontWeight: '600' }}>{status.name} <Text style={{ opacity: 0.55 }}>{statusCounts[status.name] ?? 0}</Text></Text></Pressable>)}
            </ScrollView>
            {isWebDesktop ? <Pressable onPress={() => setShowFilterMenu(true)} style={{ width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: activeFilterCount ? colors.accent.primary : colors.border.medium, backgroundColor: activeFilterCount ? colors.accent.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Filter size={17} color={activeFilterCount ? (isDark ? '#1E1E1E' : '#FFFFFF') : colors.text.secondary} strokeWidth={2} /></Pressable> : null}
          </View>
          {!isWebDesktop ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: -horizontalPadding }} contentContainerStyle={{ gap: 8, paddingRight: horizontalPadding }}><Pressable onPress={() => setSelectedStatus(null)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedStatus === null ? colors.text.primary : 'transparent', borderWidth: 1, borderColor: selectedStatus === null ? colors.text.primary : colors.border.medium }}><Text style={{ color: selectedStatus === null ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>All <Text style={{ opacity: 0.55 }}>{orders.length}</Text></Text></Pressable>{sortedOrderStatuses.map((status) => <Pressable key={status.id} onPress={() => setSelectedStatus(status.name)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedStatus === status.name ? colors.text.primary : 'transparent', borderWidth: 1, borderColor: selectedStatus === status.name ? colors.text.primary : colors.border.medium }}><Text style={{ color: selectedStatus === status.name ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>{status.name} <Text style={{ opacity: 0.55 }}>{statusCounts[status.name] ?? 0}</Text></Text></Pressable>)}</ScrollView> : null}
        </View>
    </View>
  );

  // Master pane content
  const masterContent = (
    <>
      {/* Order List */}
        <FlatList
          data={isInitialLoading ? [] : visibleOrders}
          keyExtractor={(item) => item.id}
          style={{
            flex: 1,
            paddingTop: isWebDesktop || isMobile ? 0 : 4,
            backgroundColor: colors.bg.primary,
          }}
          contentContainerStyle={{
            maxWidth: contentMaxWidth,
            alignSelf: isWebDesktop ? 'flex-start' : isDesktop ? 'center' : undefined,
            width: isDesktop ? '100%' : undefined,
            paddingHorizontal: horizontalPadding,
            paddingTop: isWebDesktop || isMobile ? 0 : 14,
            paddingBottom: tabBarHeight + 16,
            flexGrow: isInitialLoading || visibleOrders.length === 0 ? 1 : undefined,
          }}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={loadMoreOrders}
          ListEmptyComponent={
            isInitialLoading ? (
              <View className="flex-1 items-center justify-center py-20">
                <ActivityIndicator size="small" color={colors.text.tertiary} />
                <Text style={{ color: colors.text.muted }} className="text-sm mt-3">Loading orders…</Text>
              </View>
            ) : <View className="items-center justify-center py-20">
              <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
                <ShoppingCart size={40} color={colors.text.muted} strokeWidth={1.5} />
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No orders found</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Create your first order to get started</Text>
              <Pressable
                onPress={handleNewOrder}
                className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center"
                style={{ backgroundColor: colors.accent.primary }}
              >
                <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Create First Order</Text>
              </Pressable>
            </View>
          }
          ListHeaderComponent={
            <>
              {ordersHeaderContent}
              {isWebDesktop && visibleOrders.length > 0 ? (
                <View
                  style={{
                    width: '100%',
                    borderWidth: 1,
                    borderBottomWidth: 0,
                    borderColor: separatorColor,
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    overflow: 'hidden',
                    backgroundColor: colors.bg.card,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 14, gap: 16, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                    <Text style={{ color: colors.text.muted, width: 150, fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>ORDER</Text>
                    <Text style={{ color: colors.text.muted, flex: 1.3, fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>CUSTOMER</Text>
                    <Text style={{ color: colors.text.muted, flex: 1.2, fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>PRODUCT</Text>
                    <Text style={{ color: colors.text.muted, width: 56, textAlign: 'right', fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>ITEMS</Text>
                    <Text style={{ color: colors.text.muted, width: 110, textAlign: 'right', fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>TOTAL</Text>
                    <Text style={{ color: colors.text.muted, width: 200, fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>DELIVERY</Text>
                    <Text style={{ color: colors.text.muted, width: 150, fontSize: 10, fontWeight: '600', letterSpacing: 0.6 }}>STATUS</Text>
                    <View style={{ width: 24 }} />
                  </View>
                </View>
              ) : null}
            </>
          }
          ListFooterComponent={
            <View className="items-center pb-6">
              {hasMoreOrders ? (
                <Pressable
                  onPress={loadMoreOrders}
                  className="rounded-full active:opacity-80 px-4"
                  style={{
                    height: 38,
                    justifyContent: 'center',
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: separatorColor,
                  }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    Load more orders
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.text.muted }} className="text-xs">
                  Showing {visibleOrders.length} of {filteredOrders.length}
                </Text>
              )}
              <View className="h-24" />
            </View>
          }
          renderItem={({ item: order, index }) => {
            const previousOrder = index > 0 ? visibleOrders[index - 1] : null;
            const nextOrder = index < visibleOrders.length - 1 ? visibleOrders[index + 1] : null;
            const groupByDate = sortBy === 'newest' || sortBy === 'oldest';
            const isFirstInGroup = groupByDate
              ? !previousOrder || getOrderDayKey(previousOrder) !== getOrderDayKey(order)
              : index === 0;
            const isLastInGroup = groupByDate
              ? !nextOrder || getOrderDayKey(nextOrder) !== getOrderDayKey(order)
              : index === visibleOrders.length - 1;
            const groupLabel = groupByDate ? getOrderDayLabel(order) : 'All orders';
            const isLast = index === visibleOrders.length - 1;

            return isWebDesktop ? (
              <View>
                {isFirstInGroup ? <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, backgroundColor: isDark ? '#101010' : '#E9E9E6', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: separatorColor }}><Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{groupLabel}</Text></View> : null}
                <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: isLast ? 1 : 0, borderColor: separatorColor, borderBottomLeftRadius: isLast ? 18 : 0, borderBottomRightRadius: isLast ? 18 : 0, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  <OrderRowWeb order={order} products={products} statusColor={getOrderStatusColor(order.status, statusColorMap, '#888888')} isSelected={selectedOrderId === order.id} onPress={() => handleOrderSelect(order.id)} separatorColor={separatorColor} isLast={isLast} unreadCount={unreadCounts[order.id] ?? 0} />
                </View>
              </View>
            ) : (
              <View style={{ marginTop: isFirstInGroup && index > 0 ? 18 : 0 }}>
                {isFirstInGroup ? <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 8 }}>{groupLabel}</Text> : null}
                <OrderCard order={order} products={products} statusColor={getOrderStatusColor(order.status, statusColorMap, '#888888')} isSelected={selectedOrderId === order.id} showSplitView={showSplitView} onPress={() => handleOrderSelect(order.id)} separatorColor={separatorColor} unreadCount={unreadCounts[order.id] ?? 0} isFirstInGroup={isFirstInGroup} isLastInGroup={isLastInGroup} />
              </View>
            );
          }}
        />
    </>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        <SplitViewLayout
          detailContent={
            showSplitView && selectedOrderId
              ? <OrderDetailPanel orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
              : null
          }
          detailTitle={showSplitView ? (selectedOrder?.orderNumber || 'Order Details') : undefined}
          onCloseDetail={showSplitView ? () => setSelectedOrderId(null) : undefined}
        >
          {masterContent}
        </SplitViewLayout>

        {isMobile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new order"
            onPress={handleNewOrder}
            style={(state) => [
              {
                position: 'absolute',
                right: 20,
                bottom: Math.max(96, tabBarHeight - 48),
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                transform: [{ scale: state.pressed ? 0.94 : 1 }],
                zIndex: 40,
              },
              Platform.OS === 'web'
                ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
                : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
            ]}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
          </Pressable>
        ) : null}

        {/* Filter Menu Modal */}
        <Modal
          visible={showFilterMenu}
          animationType={isMobile ? 'fade' : 'none'}
          transparent
          onRequestClose={() => setShowFilterMenu(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              flexDirection: isWebDesktop ? 'row' : 'column',
              justifyContent: 'flex-end',
              paddingHorizontal: isWebDesktop ? 0 : MOBILE_FILTER_SHEET.horizontalInset,
              paddingBottom: isWebDesktop ? 0 : MOBILE_FILTER_SHEET.bottomInset,
            }}
            onPress={() => setShowFilterMenu(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className={isWebDesktop ? undefined : 'overflow-hidden'}
              style={
                isWebDesktop
                  ? {
                      backgroundColor: colors.bg.primary,
                      width: 400,
                      maxWidth: '100%',
                      borderTopLeftRadius: 24,
                      borderBottomLeftRadius: 24,
                      overflow: 'hidden',
                      borderWidth: isDark ? 1 : 0,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                    }
                  : {
                      backgroundColor: colors.bg.primary,
                      width: '100%',
                      maxHeight: MOBILE_FILTER_SHEET.maxHeight,
                      borderTopLeftRadius: MOBILE_FILTER_SHEET.borderRadius,
                      borderTopRightRadius: MOBILE_FILTER_SHEET.borderRadius,
                      borderBottomLeftRadius: 0,
                      borderBottomRightRadius: 0,
                      borderWidth: 0,
                      paddingTop: 8,
                      overflow: 'hidden',
                    }
              }
            >
              {/* Handle */}
              {!isWebDesktop && (
                <View className="items-center py-3">
                  <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
                </View>
              )}

              {/* Header */}
              <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor, paddingTop: isWebDesktop ? 20 : 0 }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter & Sort</Text>
                <Pressable
                  onPress={() => setShowFilterMenu(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={isWebDesktop ? { flex: 1 } : undefined}>
                {/* Filter by Status Section */}
                <View className="px-5 pt-4">
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Filter by Status</Text>

                  {/* All option */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedStatus(null);
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">All Orders</Text>
                    </View>
                    {selectedStatus === null && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Status options */}
                  {sortedOrderStatuses.map((status) => (
                    <Pressable
                      key={status.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedStatus(status.name);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View
                        className="w-3 h-3 rounded-full mr-3"
                        style={{ backgroundColor: status.color }}
                      />
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{status.name}</Text>
                      </View>
                      {selectedStatus === status.name && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>

                {/* Filter by Source Section */}
                {availableSources.length > 0 && (
                  <View className="px-5 pt-4" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                    <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Filter by Source</Text>

                    {/* All option */}
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedSource(null);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">All Sources</Text>
                      </View>
                      {selectedSource === null && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>

                    {/* Source options */}
                    {availableSources.map((sourceOption) => (
                      <Pressable
                        key={sourceOption}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedSource(sourceOption);
                        }}
                        className="flex-row items-center py-3 active:opacity-70"
                      >
                        <View className="flex-1">
                          <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{sourceOption}</Text>
                        </View>
                        {selectedSource === sourceOption && (
                          <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                            <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Sort Section */}
                <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort By</Text>

                  {/* Newest First */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('newest');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <Clock size={18} color={sortBy === 'newest' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Newest First</Text>
                    </View>
                    {sortBy === 'newest' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Oldest First */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('oldest');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <Clock size={18} color={sortBy === 'oldest' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Oldest First</Text>
                    </View>
                    {sortBy === 'oldest' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Customer Name A-Z */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('name-asc');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <ArrowDownAZ size={18} color={sortBy === 'name-asc' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Customer (A-Z)</Text>
                    </View>
                    {sortBy === 'name-asc' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Customer Name Z-A */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('name-desc');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <ArrowUpAZ size={18} color={sortBy === 'name-desc' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Customer (Z-A)</Text>
                    </View>
                    {sortBy === 'name-desc' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Amount: High to Low */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('amount-high');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <DollarSign size={18} color={sortBy === 'amount-high' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Amount: High to Low</Text>
                    </View>
                    {sortBy === 'amount-high' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Amount: Low to High */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('amount-low');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <DollarSign size={18} color={sortBy === 'amount-low' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Amount: Low to High</Text>
                    </View>
                    {sortBy === 'amount-low' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                </View>

                {/* Apply Button */}
                <View className="px-5 py-4">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowFilterMenu(false);
                    }}
                    className="items-center justify-center active:opacity-80"
                    style={{
                      height: MOBILE_FILTER_SHEET.actionHeight,
                      borderRadius: MOBILE_FILTER_SHEET.actionRadius,
                      backgroundColor: colors.accent.primary,
                    }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold">Apply</Text>
                  </Pressable>
                </View>

                <View className="h-8" />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showFyllAiModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFyllAiModal(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => setShowFyllAiModal(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '92%',
                maxWidth: 760,
                maxHeight: '88%',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                padding: 18,
              }}
            >
              <View className="flex-row items-start justify-between">
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                    Fyll AI
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                    Paste a WhatsApp order message to parse and create a draft without leaving this screen.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowFyllAiModal(false)}
                  className="rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.bg.secondary, width: 40, height: 40 }}
                >
                  <X size={20} color={colors.text.tertiary} strokeWidth={2.5} />
                </Pressable>
              </View>

              <ScrollView
                className="mt-4"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View
                  className="rounded-xl p-3.5 flex-row"
                  style={{ backgroundColor: isDark ? '#1E1B4B' : '#EDE9FE' }}
                >
                  <AlertCircle size={18} color="#8B5CF6" strokeWidth={2} style={{ marginTop: 1 }} />
                  <Text
                    style={{ color: isDark ? '#C4B5FD' : '#6D28D9', flex: 1, marginLeft: 8, lineHeight: 18 }}
                    className="text-xs font-medium"
                  >
                    Best results come when the message includes customer name, phone, address, items and quantities.
                  </Text>
                </View>

                <View className="mt-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mb-2">
                    Order message
                  </Text>
                  <View
                    className="rounded-xl px-3 py-3"
                    style={{
                      minHeight: 170,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      backgroundColor: colors.input.bg,
                    }}
                  >
                    <TextInput
                      placeholder={
                        'Adaeze Okonkwo\n+234 803 555 0101\n15 Admiralty Way, Lekki, Lagos\n\n2 Aviator Gold\n1 Wayfarer Black'
                      }
                      placeholderTextColor={colors.input.placeholder}
                      value={aiMessageText}
                      onChangeText={setAiMessageText}
                      multiline
                      textAlignVertical="top"
                      style={{ color: colors.input.text, fontSize: 14, minHeight: 140 }}
                    />
                  </View>
                </View>

                {aiParseError ? (
                  <View
                    className="mt-3 rounded-xl px-3 py-2.5"
                    style={{ borderWidth: 1, borderColor: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEE2E2' }}
                  >
                    <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C' }} className="text-xs font-medium">
                      {aiParseError}
                    </Text>
                  </View>
                ) : null}

                <View className="mt-4" style={{ gap: 10 }}>
                  <FyllAiButton
                    label={aiIsParsing ? 'Parsing with Fyll AI...' : 'Parse Order Message'}
                    onPress={handleParseOrderWithAi}
                    disabled={aiIsParsing || !aiMessageText.trim()}
                    height={48}
                    borderRadius={999}
                    textSize={14}
                  />
                  <Pressable
                    onPress={handleResetOrderAiModal}
                    className="rounded-full items-center justify-center active:opacity-80"
                    style={{ height: 42, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold">
                      Clear
                    </Text>
                  </Pressable>
                </View>

                {aiIsParsing ? (
                  <View className="mt-4 flex-row items-center">
                    <ActivityIndicator size="small" color={colors.text.tertiary} />
                    <Text style={{ color: colors.text.tertiary }} className="text-xs ml-2">
                      Parsing customer details...
                    </Text>
                  </View>
                ) : null}

                {aiParsedData ? (
                  <View
                    className="mt-4 rounded-xl p-4"
                    style={{ borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-bold">
                        Parsed Draft
                      </Text>
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                        <Text style={{ color: '#16A34A' }} className="text-[10px] font-semibold">
                          {aiParsedData.confidence.toUpperCase()} CONFIDENCE
                        </Text>
                      </View>
                    </View>

                    <View className="mt-3" style={{ gap: 6 }}>
                      <Text style={{ color: colors.text.secondary }} className="text-xs">
                        Customer: <Text style={{ color: colors.text.primary }}>{aiParsedData.customerName || 'Not found'}</Text>
                      </Text>
                      <Text style={{ color: colors.text.secondary }} className="text-xs">
                        Phone: <Text style={{ color: colors.text.primary }}>{aiParsedData.customerPhone || 'Not found'}</Text>
                      </Text>
                      <Text style={{ color: colors.text.secondary }} className="text-xs">
                        State: <Text style={{ color: colors.text.primary }}>{aiParsedData.deliveryState || 'Not found'}</Text>
                      </Text>
                      <Text style={{ color: colors.text.secondary }} className="text-xs">
                        Items: <Text style={{ color: colors.text.primary }}>{aiParsedData.items.length}</Text>
                      </Text>
                    </View>

                    {aiParsedData.items.length > 0 ? (
                      <View className="mt-3" style={{ gap: 6 }}>
                        {aiParsedData.items.slice(0, 4).map((item, index) => (
                          <View key={`${item.productName}-${index}`} className="flex-row items-center justify-between">
                            <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-xs" numberOfLines={1}>
                              {item.quantity}x {item.productName}
                            </Text>
                            {item.unitPrice ? (
                              <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-3">
                                ₦{item.unitPrice.toLocaleString()}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View className="mt-4">
                      <FyllAiButton
                        label="Create Draft Order"
                        onPress={handleCreateDraftFromParsedOrder}
                        height={46}
                        borderRadius={999}
                        textSize={14}
                      />
                    </View>
                  </View>
                ) : null}

                <View className="h-3" />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
