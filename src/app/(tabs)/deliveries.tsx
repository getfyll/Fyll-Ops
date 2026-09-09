import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, ChevronRight, Filter, Search, Truck, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { formatCurrency, type Order } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { bucketFulfillmentStatus, getCustomerTrackingCode, getOrderFulfillmentStage } from '@/lib/fulfillment';
import { createOrderStatusColorMap, getOrderStatusChipColors } from '@/lib/order-status-colors';
import useAuthStore from '@/lib/state/auth-store';
import { normalizeDeliveryStateValue } from '@/lib/format-address';

type DeliveryState = 'picked-up' | 'in-transit' | 'delivered';
type DeliveryDateFilter = '7d' | 'month' | '30d' | 'year' | 'all';
type DeliveryStatusFilter = 'all' | 'active' | DeliveryState;
type DeliverySort = 'updated-desc' | 'updated-asc' | 'dispatch-desc' | 'dispatch-asc' | 'order-asc';

type ShipmentEntry = {
  order: Order;
  state: DeliveryState;
  destination: string;
  tracking: string;
  labelCode: string;
  carrier: string;
  pickedUpLabel: string;
  updatedLabel: string;
  updatedAt: number;
  dispatchAt: number;
};

const DELIVERY_DATE_FILTERS: Array<{ key: DeliveryDateFilter; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

const DELIVERY_STATUS_FILTERS: Array<{ key: DeliveryStatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'picked-up', label: 'Picked up' },
  { key: 'in-transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

const DELIVERY_SORT_OPTIONS: Array<{ key: DeliverySort; label: string }> = [
  { key: 'updated-desc', label: 'Newest first' },
  { key: 'updated-asc', label: 'Oldest first' },
  { key: 'dispatch-desc', label: 'Latest dispatch' },
  { key: 'dispatch-asc', label: 'Earliest dispatch' },
  { key: 'order-asc', label: 'Order A-Z' },
];

const formatRelativeTime = (value?: string) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now';
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDisplayDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const toDeliveryState = (order: Order, orderStatuses: ReturnType<typeof useFyllStore.getState>['orderStatuses']): DeliveryState => {
  const normalizedStatus = (order.status ?? '').trim().toLowerCase();
  const stageBucket = bucketFulfillmentStatus(order.status ?? '');
  const fulfillmentStage = getOrderFulfillmentStage(order, orderStatuses);

  if (fulfillmentStage === 'completed' || normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
    return 'delivered';
  }
  if (
    normalizedStatus.includes('transit')
    || normalizedStatus.includes('pending delivery')
    || normalizedStatus.includes('delivery confirmation')
    || normalizedStatus.includes('out for delivery')
  ) {
    return 'in-transit';
  }
  if (stageBucket === 'dispatch' || order.logistics?.datePickedUp || order.logistics?.dispatchDate) {
    return 'picked-up';
  }
  return 'in-transit';
};

const getDeliveryLabel = (state: DeliveryState) => {
  switch (state) {
    case 'picked-up':
      return 'Picked up';
    case 'in-transit':
      return 'In transit';
    case 'delivered':
      return 'Delivered';
  }
};

const getDeliveryChipColors = (state: DeliveryState) => {
  switch (state) {
    case 'picked-up':
      return {
        bg: 'rgba(59,130,246,0.12)',
        text: '#3B82F6',
        border: 'rgba(59,130,246,0.18)',
      };
    case 'in-transit':
      return {
        bg: 'rgba(139,92,246,0.12)',
        text: '#8B5CF6',
        border: 'rgba(139,92,246,0.18)',
      };
    case 'delivered':
      return {
        bg: 'rgba(34,197,94,0.12)',
        text: '#22C55E',
        border: 'rgba(34,197,94,0.18)',
      };
  }
};

const formatInputDate = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const toIsoFromInputDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.length === 10 ? `${trimmed}T12:00:00.000Z` : trimmed;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

export default function DeliveriesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const isWebDesktop = Platform.OS === 'web' && isDesktop;

  const orders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const logisticsCarriers = useFyllStore((s) => s.logisticsCarriers);
  const updateOrder = useFyllStore((s) => s.updateOrder);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name || s.currentUser?.email || 'Staff');
  const statusColorMap = useMemo(() => createOrderStatusColorMap(orderStatuses), [orderStatuses]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [selectedCarrierName, setSelectedCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dispatchDateInput, setDispatchDateInput] = useState(formatInputDate());
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DeliveryDateFilter>('30d');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatusFilter>('all');
  const [sortBy, setSortBy] = useState<DeliverySort>('updated-desc');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const shipments = useMemo<ShipmentEntry[]>(() => {
    return orders
      .filter((order) => {
        const hasCarrier = Boolean(order.logistics?.carrierName?.trim());
        const fulfillmentStage = getOrderFulfillmentStage(order, orderStatuses);
        const dispatchBucket = bucketFulfillmentStatus(order.status ?? '');
        const hasDispatchMetadata = Boolean(order.logistics?.dispatchDate || order.logistics?.datePickedUp);
        return hasCarrier && (dispatchBucket === 'dispatch' || fulfillmentStage === 'completed' || hasDispatchMetadata);
      })
      .map((order) => {
        const state = toDeliveryState(order, orderStatuses);
        const destination = normalizeDeliveryStateValue(order.deliveryState, order.deliveryAddress) || 'Unknown';
        const updatedSource = order.updatedAt || order.logistics?.datePickedUp || order.logistics?.dispatchDate || order.createdAt;
        const dispatchSource = order.logistics?.datePickedUp || order.logistics?.dispatchDate || order.updatedAt || order.createdAt;
        return {
          order,
          state,
          destination,
          tracking: order.logistics?.trackingNumber?.trim() || 'Not set',
          labelCode: getCustomerTrackingCode(order),
          carrier: order.logistics?.carrierName?.trim() || 'Unassigned',
          pickedUpLabel: formatDisplayDate(order.logistics?.datePickedUp || order.logistics?.dispatchDate),
          updatedLabel: formatRelativeTime(updatedSource),
          updatedAt: new Date(updatedSource).getTime(),
          dispatchAt: new Date(dispatchSource).getTime(),
        };
      });
  }, [orderStatuses, orders]);

  const selectableOrders = useMemo(() => {
    return [...orders]
      .filter((order) => {
        const normalizedStatus = (order.status ?? '').trim().toLowerCase();
        const fulfillmentStage = getOrderFulfillmentStage(order, orderStatuses);
        return (
          fulfillmentStage === 'completed'
          || normalizedStatus === 'dispatched'
          || normalizedStatus === 'delivery confirmation'
          || normalizedStatus === 'delivered'
          || normalizedStatus === 'completed'
          || Boolean(order.logistics?.dispatchDate || order.logistics?.datePickedUp)
        );
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [orderStatuses, orders]);

  const selectedOrder = useMemo(
    () => selectableOrders.find((order) => order.id === selectedOrderId) ?? null,
    [selectableOrders, selectedOrderId]
  );

  const periodShipments = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    return shipments.filter((entry) => {
      if (dateFilter === '7d' && entry.dispatchAt < sevenDaysAgo) return false;
      if (dateFilter === 'month' && entry.dispatchAt < monthStart) return false;
      if (dateFilter === '30d' && entry.dispatchAt < thirtyDaysAgo) return false;
      if (dateFilter === 'year' && entry.dispatchAt < yearStart) return false;
      return true;
    });
  }, [dateFilter, shipments]);

  const filteredShipments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return periodShipments
      .filter((entry) => {
        if (statusFilter === 'active' && entry.state === 'delivered') return false;
        if (statusFilter !== 'all' && statusFilter !== 'active' && entry.state !== statusFilter) return false;

        if (!query) return true;
        const haystack = [
          entry.order.orderNumber,
          entry.order.customerName,
          entry.carrier,
          entry.destination,
          entry.tracking,
          entry.labelCode,
          entry.order.status,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'updated-asc':
            return a.updatedAt - b.updatedAt;
          case 'dispatch-desc':
            return b.dispatchAt - a.dispatchAt;
          case 'dispatch-asc':
            return a.dispatchAt - b.dispatchAt;
          case 'order-asc':
            return a.order.orderNumber.localeCompare(b.order.orderNumber);
          case 'updated-desc':
          default:
          return b.updatedAt - a.updatedAt;
        }
      });
  }, [periodShipments, searchQuery, sortBy, statusFilter]);

  const activeShipments = useMemo(
    () => periodShipments.filter((entry) => entry.state !== 'delivered'),
    [periodShipments]
  );

  const deliveredShipments = useMemo(
    () => periodShipments.filter((entry) => entry.state === 'delivered'),
    [periodShipments]
  );

  const stats = useMemo(() => {
    const activeCarrierCount = new Set(
      periodShipments.map((entry) => entry.carrier.toLowerCase()).filter(Boolean)
    ).size;

    const periodOrders = periodShipments.map((entry) => entry.order);
    const averageDeliveryFee = periodOrders.length > 0
      ? Math.round(
          periodOrders.reduce((sum, order) => sum + (order.deliveryFee ?? 0), 0)
          / Math.max(1, periodOrders.filter((order) => (order.deliveryFee ?? 0) > 0).length || 1)
        )
      : 0;

    return [
      {
        key: 'delivered',
        label: 'Deliveries made',
        value: deliveredShipments.length.toLocaleString(),
        caption: 'Completed with courier tagged',
      },
      {
        key: 'active',
        label: 'Active deliveries',
        value: activeShipments.length.toLocaleString(),
        caption: 'Currently out with riders',
      },
      {
        key: 'partners',
        label: 'Delivery partners',
        value: activeCarrierCount.toLocaleString(),
        caption: 'Carriers used so far',
      },
      {
        key: 'fee',
        label: 'Avg delivery fee',
        value: formatCurrency(averageDeliveryFee),
        caption: 'Based on tagged orders',
      },
    ];
  }, [activeShipments.length, deliveredShipments.length, periodShipments]);

  const handleOpenOrder = (orderId: string) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push((isWebDesktop ? `/orders/${orderId}` : `/order/${orderId}`) as any);
  };

  const handlePrintShippingLabel = (orderId: string, carrierName?: string) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const search = carrierName?.trim()
      ? `?orderId=${encodeURIComponent(orderId)}&carrierName=${encodeURIComponent(carrierName)}`
      : `?orderId=${encodeURIComponent(orderId)}`;
    router.push((`/order-label-preview${search}`) as any);
  };

  const resetCreateDeliveryModal = () => {
    setSelectedOrderId('');
    setSelectedCarrierId('');
    setSelectedCarrierName('');
    setTrackingNumber('');
    setDispatchDateInput(formatInputDate());
    setDeliveryNotes('');
    setShowOrderDropdown(false);
    setShowCarrierDropdown(false);
  };

  const handleOpenCreateModal = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    resetCreateDeliveryModal();
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    if (isSavingDelivery) return;
    setShowCreateModal(false);
    setShowOrderDropdown(false);
    setShowCarrierDropdown(false);
  };

  const handleCreateDelivery = async () => {
    if (!selectedOrder || !selectedCarrierName.trim()) return;
    const dispatchDateIso = toIsoFromInputDate(dispatchDateInput);
    if (!dispatchDateIso) return;

    const noteEntry = deliveryNotes.trim()
      ? {
          staffName: currentUserName,
          action: `Delivery note: ${deliveryNotes.trim()}`,
          date: new Date().toISOString(),
        }
      : null;

    setIsSavingDelivery(true);
    try {
      await updateOrder(
        selectedOrder.id,
        {
          logistics: {
            carrierId: selectedCarrierId,
            carrierName: selectedCarrierName.trim(),
            trackingNumber: trackingNumber.trim(),
            dispatchDate: dispatchDateIso,
            datePickedUp: dispatchDateIso,
          },
          updatedBy: currentUserName,
          updatedAt: new Date().toISOString(),
          activityLog: noteEntry
            ? [...(selectedOrder.activityLog ?? []), noteEntry]
            : selectedOrder.activityLog,
        },
        businessId
      );
      setShowCreateModal(false);
      resetCreateDeliveryModal();
    } finally {
      setIsSavingDelivery(false);
    }
  };

  const contentPaddingBottom = (isDesktop ? 32 : 24) + tabBarHeight;
  const contentMaxWidth = isWebDesktop ? 1400 : isDesktop ? 980 : undefined;
  const actionDisabled = !selectedOrderId || !selectedCarrierName.trim() || !toIsoFromInputDate(dispatchDateInput) || isSavingDelivery;
  const separatorColor = colors.border.light;
  const isDark = colors.bg.primary === '#111111';
  const activeFilterCount =
    (dateFilter !== '30d' ? 1 : 0)
    + (statusFilter !== 'all' ? 1 : 0)
    + (sortBy !== 'updated-desc' ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
          <View
            style={[
              {
                paddingHorizontal: isWebDesktop ? 0 : 20,
                paddingTop: isWebDesktop ? 0 : 16,
                paddingBottom: isWebDesktop ? 0 : 12,
              },
              isWebDesktop ? { width: '100%' } : undefined,
            ]}
          >
            <View
              className={isWebDesktop ? 'flex-row items-center justify-between' : undefined}
              style={isWebDesktop ? {
                width: '100%',
                maxWidth: 1400,
                alignSelf: 'flex-start',
                minHeight: desktopHeaderMinHeight,
                paddingLeft: 20,
                paddingRight: 20,
                paddingTop: 20,
                paddingBottom: 16,
              } : {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={isWebDesktop ? undefined : { flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>Delivery</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: isMobile ? 10 : 14, lineHeight: isMobile ? 14 : 20, marginTop: 4 }}>
                  Follow tagged shipments and monitor courier activity from one place.
                </Text>
              </View>
              <Pressable
                onPress={handleOpenCreateModal}
                className="rounded-full flex-row items-center active:opacity-80"
                style={{
                  backgroundColor: colors.accent.primary,
                  height: 44,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                }}
              >
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                  New Delivery
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              width: '100%',
              maxWidth: contentMaxWidth,
              alignSelf: isWebDesktop ? 'flex-start' : 'stretch',
              paddingHorizontal: 20,
            }}
          >
            <View style={{ paddingTop: 16 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
                contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
              >
                {DELIVERY_DATE_FILTERS.map((option) => {
                  const isActive = dateFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setDateFilter(option.key)}
                      className="rounded-full active:opacity-70"
                      style={{
                        height: 44,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isActive ? colors.accent.primary : colors.bg.card,
                        borderWidth: isActive ? 0 : 1,
                        borderColor: separatorColor,
                      }}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: isActive ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View
                className="flex-row flex-wrap"
                style={{ marginHorizontal: -6, marginBottom: 12 }}
              >
                {stats.map((item) => {
                  return (
                    <View
                      key={item.key}
                      style={{
                        width: isDesktop ? '25%' : isMobile ? '50%' : '50%',
                        paddingHorizontal: 6,
                        marginBottom: 12,
                      }}
                    >
                      <View
                        className="rounded-[24px]"
                        style={{
                          backgroundColor: colors.bg.card,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          padding: isMobile ? 14 : 18,
                          minHeight: isMobile ? 104 : 138,
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: colors.text.primary, fontSize: isMobile ? 22 : 26, fontWeight: '700', marginTop: 8 }}>
                          {item.value}
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: isMobile ? 10 : 12, fontWeight: '400', lineHeight: isMobile ? 14 : 18, marginTop: isMobile ? 4 : 6 }}>
                          {item.caption}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <View
                  className="flex-row items-center rounded-full px-4"
                  style={{
                    height: isDesktop ? 44 : 46,
                    width: isDesktop ? '30%' : undefined,
                    maxWidth: isDesktop ? 420 : undefined,
                    minWidth: isDesktop ? 320 : undefined,
                    flex: isDesktop ? undefined : 1,
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Search size={18} color={colors.text.muted} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search deliveries..."
                    placeholderTextColor={colors.input.placeholder}
                    style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                </View>

                {isDesktop ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
                  >
                    {DELIVERY_STATUS_FILTERS.map((option) => {
                      const isActive = statusFilter === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => setStatusFilter(option.key)}
                          className="rounded-full active:opacity-70"
                          style={{
                            height: 44,
                            paddingHorizontal: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isActive ? colors.accent.primary : colors.bg.card,
                            borderWidth: isActive ? 0 : 1,
                            borderColor: separatorColor,
                          }}
                        >
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: isActive ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setShowFilterMenu(true);
                  }}
                  className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
                  style={{
                    width: isDesktop ? undefined : 46,
                    height: isDesktop ? 44 : 46,
                    paddingHorizontal: isDesktop ? 16 : 0,
                    backgroundColor: activeFilterCount > 0 ? colors.accent.primary : isDesktop ? colors.bg.card : colors.bg.secondary,
                    borderWidth: activeFilterCount > 0 ? 0 : isDesktop ? 1 : 0.5,
                    borderColor: separatorColor,
                  }}
                >
                  <Filter size={18} color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                  {activeFilterCount > 0 && (
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
                      {activeFilterCount}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View
                className={isDesktop ? 'rounded-2xl overflow-hidden' : undefined}
                style={{
                  backgroundColor: isDesktop ? colors.bg.card : 'transparent',
                  borderWidth: isDesktop ? 1 : 0,
                  borderColor: colors.border.light,
                }}
              >
                {filteredShipments.length === 0 ? (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                      No deliveries found
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 6 }}>
                      Try another date range or status filter, or tag a courier on an order first.
                    </Text>
                  </View>
                ) : isDesktop ? (
                  <View>
                    <View
                      className="flex-row items-center"
                      style={{
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border.light,
                      }}
                    >
                      {[
                        ['ORDER', 1.05],
                        ['COURIER', 1.15],
                        ['TRACKING', 1],
                        ['DISPATCHED', 1],
                        ['DESTINATION', 1],
                        ['STATUS', 0.9],
                        ['UPDATED', 0.85],
                        ['ACTIONS', 1.25],
                      ].map(([label, flex]) => (
                        <Text
                          key={label}
                          className="text-xs font-semibold"
                          style={{
                            color: colors.text.muted,
                            flex: Number(flex),
                          }}
                        >
                          {label}
                        </Text>
                      ))}
                    </View>

                    {filteredShipments.map(({ order, carrier, tracking, labelCode, pickedUpLabel, destination, state, updatedLabel }, index) => {
                      const chip = getDeliveryChipColors(state);
                      return (
                        <View
                          key={order.id}
                          className="flex-row items-center"
                          style={{
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                            borderBottomWidth: index === filteredShipments.length - 1 ? 0 : 1,
                            borderBottomColor: colors.border.light,
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1.05 }}>
                            {order.orderNumber}
                          </Text>
                          <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1.15 }}>
                            {carrier}
                          </Text>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                              {tracking}
                            </Text>
                            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                              Code: {labelCode}
                            </Text>
                          </View>
                          <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1 }}>
                            {pickedUpLabel}
                          </Text>
                          <Text style={{ color: colors.text.secondary, fontSize: 12, flex: 1 }}>
                            {destination}
                          </Text>
                          <View style={{ flex: 0.9 }}>
                            <View
                              className="self-start rounded-full px-4 py-2"
                              style={{ backgroundColor: chip.bg, borderWidth: 1, borderColor: chip.border }}
                            >
                              <Text style={{ color: chip.text, fontSize: 10, fontWeight: '600' }}>
                                {getDeliveryLabel(state)}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.text.muted, fontSize: 12, flex: 0.85 }}>
                            {updatedLabel}
                          </Text>
                          <View style={{ flex: 1.25, alignItems: 'flex-start', flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={() => handlePrintShippingLabel(order.id, carrier)}
                              className="rounded-full px-4 active:opacity-80"
                              style={{
                                height: 40,
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: colors.border.light,
                                backgroundColor: colors.bg.card,
                              }}
                            >
                              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                Print label
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ paddingBottom: 6, gap: 10 }}>
                    {filteredShipments.map(({ order, carrier, pickedUpLabel }) => {
                      const fallbackStatusChip = getOrderStatusChipColors(order.status, statusColorMap, colors.bg.primary === '#111111');
                      return (
                        <Pressable
                          key={order.id}
                          onPress={() => handleOpenOrder(order.id)}
                          className="rounded-[18px] active:opacity-80"
                          style={{
                            backgroundColor: colors.bg.card,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                          }}
                        >
                          <View className="flex-row items-center justify-between">
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                                {order.orderNumber}
                              </Text>
                              <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 3 }}>
                                Dispatched {pickedUpLabel}
                              </Text>
                            </View>
                            <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} />
                          </View>

                          <View className="flex-row items-center justify-between" style={{ gap: 10, marginTop: 9 }}>
                            <View className="rounded-full px-3" style={{ minHeight: 30, justifyContent: 'center', backgroundColor: fallbackStatusChip.bg, borderWidth: 1, borderColor: fallbackStatusChip.border }}>
                              <Text style={{ color: fallbackStatusChip.text, fontSize: 10, fontWeight: '500' }}>{order.status}</Text>
                            </View>
                            <Pressable
                              onPress={(event) => {
                                event.stopPropagation();
                                handlePrintShippingLabel(order.id, carrier);
                              }}
                              className="rounded-full px-4 active:opacity-80"
                              style={{
                                height: 34,
                                justifyContent: 'center',
                                backgroundColor: colors.text.primary,
                              }}
                            >
                              <Text style={{ color: colors.bg.primary, fontSize: 11, fontWeight: '500' }}>
                                Print shipping label
                              </Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={showFilterMenu}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onPress={() => setShowFilterMenu(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.bg.primary, maxHeight: '75%' }}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
            </View>

            <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter & Sort</Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-5 pt-4">
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Filter by Status</Text>
                {DELIVERY_STATUS_FILTERS.map((option) => {
                  const isActive = statusFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          void Haptics.selectionAsync();
                        }
                        setStatusFilter(option.key);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                          {option.key === 'all' ? 'All Deliveries' : option.label}
                        </Text>
                      </View>
                      {isActive ? (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Date Range</Text>
                {DELIVERY_DATE_FILTERS.map((option) => {
                  const isActive = dateFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          void Haptics.selectionAsync();
                        }
                        setDateFilter(option.key);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                      </View>
                      {isActive ? (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort By</Text>
                {DELIVERY_SORT_OPTIONS.map((option) => {
                  const isActive = sortBy === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          void Haptics.selectionAsync();
                        }
                        setSortBy(option.key);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                      </View>
                      {isActive ? (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 py-4">
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                    setShowFilterMenu(false);
                  }}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{ height: 50, backgroundColor: colors.accent.primary }}
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
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={handleCloseCreateModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            onPress={handleCloseCreateModal}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="w-[88%] rounded-[24px] overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxWidth: 560, maxHeight: '76%' }}
            >
              <View
                className="flex-row items-center justify-between"
                style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
                  New Delivery
                </Text>
                <Pressable
                  onPress={handleCloseCreateModal}
                  className="items-center justify-center rounded-full active:opacity-60"
                  style={{ width: 36, height: 36 }}
                >
                  <X size={22} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
              >
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                    Link to Order
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowOrderDropdown((current) => !current);
                      setShowCarrierDropdown(false);
                    }}
                    className="rounded-[16px] flex-row items-center justify-between"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 50,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text style={{ color: selectedOrder ? colors.input.text : colors.input.placeholder, fontSize: 14 }}>
                      {selectedOrder ? `${selectedOrder.orderNumber} — ${selectedOrder.customerName}` : 'Select order...'}
                    </Text>
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                  {showOrderDropdown ? (
                    <View
                      className="rounded-[16px] overflow-hidden"
                      style={{ marginTop: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 288 }} showsVerticalScrollIndicator>
                        {selectableOrders.map((order) => (
                          <Pressable
                            key={order.id}
                            onPress={() => {
                              setSelectedOrderId(order.id);
                              setShowOrderDropdown(false);
                            }}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 13,
                              backgroundColor: selectedOrderId === order.id ? colors.bg.secondary : colors.bg.card,
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: selectedOrderId === order.id ? '600' : '500' }}>
                              {order.orderNumber} — {order.customerName}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>

                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                    Delivery Company
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowCarrierDropdown((current) => !current);
                      setShowOrderDropdown(false);
                    }}
                    className="rounded-[16px] flex-row items-center justify-between"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 50,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text style={{ color: selectedCarrierName ? colors.input.text : colors.input.placeholder, fontSize: 14 }}>
                      {selectedCarrierName || 'Select company...'}
                    </Text>
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                  {showCarrierDropdown ? (
                    <View
                      className="rounded-[16px] overflow-hidden"
                      style={{ marginTop: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} showsVerticalScrollIndicator>
                        {logisticsCarriers.map((carrier) => (
                          <Pressable
                            key={carrier.id}
                            onPress={() => {
                              setSelectedCarrierId(carrier.id);
                              setSelectedCarrierName(carrier.name);
                              setShowCarrierDropdown(false);
                            }}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 13,
                              backgroundColor: selectedCarrierId === carrier.id ? colors.bg.secondary : colors.bg.card,
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: selectedCarrierId === carrier.id ? '600' : '500' }}>
                              {carrier.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>

                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                    Tracking Number
                  </Text>
                  <View
                    className="rounded-[16px]"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 50,
                      justifyContent: 'center',
                      paddingHorizontal: 16,
                    }}
                  >
                    <TextInput
                      value={trackingNumber}
                      onChangeText={setTrackingNumber}
                      placeholder="Optional"
                      placeholderTextColor={colors.input.placeholder}
                      autoCapitalize="characters"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                    Dispatch Date
                  </Text>
                  <View
                    className="rounded-[16px]"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 50,
                      justifyContent: 'center',
                      paddingHorizontal: 16,
                    }}
                  >
                    <TextInput
                      value={dispatchDateInput}
                      onChangeText={setDispatchDateInput}
                      placeholder="yyyy-mm-dd"
                      placeholderTextColor={colors.input.placeholder}
                      autoCapitalize="none"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                    Notes
                  </Text>
                  <View
                    className="rounded-[16px]"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 100,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <TextInput
                      value={deliveryNotes}
                      onChangeText={setDeliveryNotes}
                      placeholder=""
                      placeholderTextColor={colors.input.placeholder}
                      multiline
                      style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top', minHeight: 72 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View className="flex-row items-center justify-end" style={{ gap: 12 }}>
                  <Pressable onPress={handleCloseCreateModal} className="active:opacity-70" style={{ height: 48, justifyContent: 'center', paddingHorizontal: 10 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreateDelivery}
                    disabled={actionDisabled}
                    className="rounded-[14px] flex-row items-center justify-center active:opacity-80"
                    style={{
                      backgroundColor: actionDisabled ? colors.bg.secondary : colors.text.primary,
                      height: 48,
                      paddingHorizontal: 20,
                    }}
                  >
                    <Truck size={18} color={actionDisabled ? colors.text.muted : colors.bg.primary} strokeWidth={2} />
                    <Text
                      style={{
                        color: actionDisabled ? colors.text.muted : colors.bg.primary,
                        fontSize: 14,
                        fontWeight: '600',
                        marginLeft: 10,
                      }}
                    >
                      {isSavingDelivery ? 'Creating...' : 'Create'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
