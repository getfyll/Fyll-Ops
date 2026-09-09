import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Search, X, Check, ChevronDown, ChevronRight, ChevronLeft, Filter, ArrowDownAZ, ArrowUpAZ, Clock, MapPin } from 'lucide-react-native';
import useFyllStore, { Customer, formatCurrency, NIGERIA_STATES, Order } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getActiveSplitCardStyle } from '@/lib/selection-style';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { SplitViewLayout } from '@/components/SplitViewLayout';
import { CustomerDetailPanel } from '@/components/CustomerDetailPanel';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles } from '@/lib/settings-web-panel';

type CustomerFilterTab = 'all' | 'new' | 'repeat';
const CUSTOMERS_PAGE_SIZE = 24;

export default function CustomersScreen() {
  const router = useRouter();
  const { editCustomerId, from: localFrom } = useLocalSearchParams<{ editCustomerId?: string; from?: string }>();
  const { from: globalFrom } = useGlobalSearchParams<{ from?: string }>();
  const colors = useThemeColors();
  const { isMobile, isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const showSplitView = !isMobile && !isWebDesktop;
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const fromParam = localFrom ?? globalFrom;
  const openedFromSettings = Array.isArray(fromParam) ? fromParam[0] === 'settings' : fromParam === 'settings';
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
  const settingsHeaderTopPadding = openedFromSettings ? 28 : 24;

  const customers = useFyllStore((s) => s.customers);
  const orders = useFyllStore((s) => s.orders);
  const lastDataSyncAt = useFyllStore((s) => s.lastDataSyncAt);
  const addCustomer = useFyllStore((s) => s.addCustomer);
  const updateCustomer = useFyllStore((s) => s.updateCustomer);
  const deleteCustomer = useFyllStore((s) => s.deleteCustomer);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<CustomerFilterTab>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showStateModal, setShowStateModal] = useState(false);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState<Customer | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'state'>('name-asc');
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(CUSTOMERS_PAGE_SIZE);
  const isDark = colors.bg.primary === '#111111';
  const isPaginatingRef = useRef(false);

  const lastSyncLabel = useMemo(() => {
    if (!lastDataSyncAt) return 'Not synced yet';
    try {
      return new Date(lastDataSyncAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Recently';
    }
  }, [lastDataSyncAt]);

  // Split view state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Get selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [defaultState, setDefaultState] = useState('');

  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const normalizePhone = (value: string) => value.replace(/\D/g, '');

  const getCustomerInitials = (name: string) => {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '—';
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const customerStatsById = useMemo(() => {
    const byCustomerId = new Map<string, Order[]>();
    const byEmail = new Map<string, Order[]>();
    const byPhone = new Map<string, Order[]>();

    const push = (map: Map<string, Order[]>, key: string, order: Order) => {
      if (!key) return;
      const list = map.get(key);
      if (list) {
        list.push(order);
      } else {
        map.set(key, [order]);
      }
    };

    orders.forEach((order) => {
      if (order.customerId) push(byCustomerId, order.customerId, order);
      if (order.customerEmail) push(byEmail, normalizeEmail(order.customerEmail), order);
      if (order.customerPhone) push(byPhone, normalizePhone(order.customerPhone), order);
    });

    const result = new Map<string, { ordersCount: number; totalSpent: number; totalRefunded: number; hasRefunds: boolean; isFullyRefunded: boolean }>();
    customers.forEach((customer) => {
      const matches = new Map<string, Order>();
      const byId = byCustomerId.get(customer.id) ?? [];

      const addOrders = (list: Order[]) => {
        list.forEach((order) => {
          matches.set(order.id, order);
        });
      };

      if (byId.length > 0) {
        addOrders(byId);
      } else {
        const phoneKey = customer.phone ? normalizePhone(customer.phone) : '';
        const emailKey = customer.email ? normalizeEmail(customer.email) : '';
        if (phoneKey) addOrders(byPhone.get(phoneKey) ?? []);
        if (emailKey) addOrders(byEmail.get(emailKey) ?? []);
      }

      let totalSpent = 0;
      let totalRefunded = 0;
      let allOrdersFullyRefunded = true;
      matches.forEach((order) => {
        const orderAmount = order.totalAmount ?? 0;
        const refundAmount = order.refund?.amount ?? 0;
        const isRefundStatus = (order.status || '').toLowerCase().includes('refund');

        // Add to refund total if there's a refund
        if (refundAmount > 0 || isRefundStatus) {
          totalRefunded += refundAmount;
        }

        // Calculate net amount for this order (amount after refund)
        const netAmount = orderAmount - refundAmount;

        // If net amount > 0, customer has some actual spend
        if (netAmount > 0) {
          totalSpent += netAmount;
          allOrdersFullyRefunded = false;
        } else if (!isRefundStatus) {
          // Non-refunded order with positive amount
          allOrdersFullyRefunded = false;
        }
      });

      // Only mark as "fully refunded" if ALL orders are fully refunded
      const hasRefunds = totalRefunded > 0;
      const isFullyRefunded = hasRefunds && allOrdersFullyRefunded && totalSpent === 0;

      result.set(customer.id, { ordersCount: matches.size, totalSpent, totalRefunded, hasRefunds, isFullyRefunded });
    });

    return result;
  }, [customers, orders]);

  const filterTabCounts = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    let newCount = 0;
    let repeatCount = 0;

    customers.forEach((customer) => {
      const createdAt = new Date(customer.createdAt);
      if (createdAt >= start) newCount += 1;
      const stats = customerStatsById.get(customer.id);
      if ((stats?.ordersCount ?? 0) >= 2) repeatCount += 1;
    });

    return {
      all: customers.length,
      new: newCount,
      repeat: repeatCount,
    };
  }, [customers, customerStatsById]);

  const filteredCustomers = useMemo(() => {
    let result = [...customers];
    if (activeFilterTab === 'new') {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      result = result.filter((c) => new Date(c.createdAt) >= start);
    }
    if (activeFilterTab === 'repeat') {
      result = result.filter((c) => (customerStatsById.get(c.id)?.ordersCount ?? 0) >= 2);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.fullName.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.phone.includes(query)
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.fullName.localeCompare(b.fullName);
        case 'name-desc':
          return b.fullName.localeCompare(a.fullName);
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'state':
          return (a.defaultState || '').localeCompare(b.defaultState || '');
        default:
          return 0;
      }
    });
    return result;
  }, [customers, searchQuery, sortBy, activeFilterTab, customerStatsById]);

  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, visibleCustomersCount),
    [filteredCustomers, visibleCustomersCount]
  );
  const hasMoreCustomers = visibleCustomers.length < filteredCustomers.length;

  useEffect(() => {
    setVisibleCustomersCount(CUSTOMERS_PAGE_SIZE);
  }, [searchQuery, sortBy, activeFilterTab, customers.length]);

  const loadMoreCustomers = () => {
    if (isPaginatingRef.current || !hasMoreCustomers) return;
    isPaginatingRef.current = true;
    setVisibleCustomersCount((prev) => Math.min(prev + CUSTOMERS_PAGE_SIZE, filteredCustomers.length));
    setTimeout(() => {
      isPaginatingRef.current = false;
    }, 150);
  };

  const handleCustomersScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 220;
    if (isNearBottom) {
      loadMoreCustomers();
    }
  };

  useEffect(() => {
    if (!showSplitView) return;
    if (selectedCustomerId && filteredCustomers.some((customer) => customer.id === selectedCustomerId)) return;
    if (filteredCustomers.length > 0) {
      setSelectedCustomerId(filteredCustomers[0].id);
    }
  }, [showSplitView, filteredCustomers, selectedCustomerId]);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setDefaultAddress('');
    setDefaultState('');
    setEditingCustomer(null);
  };

  const openEditModal = useCallback((customer: Customer) => {
    setEditingCustomer(customer);
    setFullName(customer.fullName);
    setEmail(customer.email);
    setPhone(customer.phone);
    setDefaultAddress(customer.defaultAddress);
    setDefaultState(customer.defaultState);
    setShowAddModal(true);
  }, []);

  useEffect(() => {
    if (!editCustomerId) return;
    const idToEdit = Array.isArray(editCustomerId) ? editCustomerId[0] : editCustomerId;
    const customerToEdit = customers.find((c) => c.id === idToEdit);
    if (!customerToEdit) return;
    openEditModal(customerToEdit);
    router.setParams({ editCustomerId: undefined });
  }, [customers, editCustomerId, openEditModal, router]);

  const handleSave = () => {
    if (!fullName.trim()) {
      Alert.alert('Required Field', 'Please enter the customer name');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Required Field', 'Phone number is required');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        defaultAddress: defaultAddress.trim(),
        defaultState,
      });
    } else {
      const newCustomer: Customer = {
        id: Math.random().toString(36).substring(2, 15),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        defaultAddress: defaultAddress.trim(),
        defaultState,
        createdAt: new Date().toISOString(),
      };
      addCustomer(newCustomer, businessId);
    }

    setShowAddModal(false);
    resetForm();
  };

  const confirmDeleteCustomer = () => {
    if (!pendingDeleteCustomer) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    deleteCustomer(pendingDeleteCustomer.id, businessId);
    if (selectedCustomerId === pendingDeleteCustomer.id) {
      setSelectedCustomerId(null);
    }
    setPendingDeleteCustomer(null);
  };

  const handleCustomerSelect = (customerId: string) => {
    if (isWebDesktop) {
      router.push(`/customers/${customerId}`);
      return;
    }
    if (showSplitView) {
      setSelectedCustomerId(customerId);
    } else {
      // On mobile, navigate to customer detail screen
      router.push(`/customer/${customerId}`);
    }
  };

  const handleEditFromPanel = (customer: Customer) => {
    openEditModal(customer);
  };

  const handleBackToSettings = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    router.push('/settings');
  };

  const formatMonthYear = (isoLike: string) => {
    const date = new Date(isoLike);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Master pane content
  const masterContent = (
    <>
      {/* Header + Search */}
      <View style={{
        backgroundColor: isDark ? 'transparent' : (isWebDesktop ? colors.bg.card : colors.bg.primary),
        borderBottomWidth: isWebDesktop ? 1 : (isDark ? 0 : 0.5),
        borderBottomColor: colors.border.light,
      }}>
        <View
          style={[
            { paddingHorizontal: isWebDesktop ? 0 : 20, paddingTop: isWebDesktop ? 0 : settingsHeaderTopPadding, paddingBottom: isWebDesktop ? 0 : 12 },
            isWebDesktop ? { width: '100%' } : undefined,
          ]}
        >
          <View
            className={isWebDesktop ? 'flex-row items-start' : 'flex-row items-start mb-4'}
            style={isWebDesktop ? {
              gap: 12,
              width: '100%',
              maxWidth: 1400,
              alignSelf: 'flex-start',
              minHeight: desktopHeaderMinHeight,
              alignItems: 'center',
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 20,
              paddingBottom: 16,
            } : { gap: 12 }}
          >
            {openedFromSettings ? (
              <Pressable
                onPress={handleBackToSettings}
                className="active:opacity-70"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
            ) : null}

              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>Customers</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">Manage your customer database.</Text>
                  {isOfflineMode ? (
                    <View
                      style={{
                        marginTop: 6,
                        alignSelf: 'flex-start',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: isDark ? 'rgba(248,113,113,0.16)' : 'rgba(239,68,68,0.12)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(248,113,113,0.35)' : 'rgba(239,68,68,0.28)',
                      }}
                    >
                      <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, fontWeight: '600' }}>
                        Offline · Last synced {lastSyncLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    resetForm();
                    setShowAddModal(true);
                  }}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{ paddingHorizontal: 14, height: 44, flexDirection: 'row', backgroundColor: colors.accent.primary }}
                >
                  <Plus size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5 text-sm">Add</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View
        style={[
          {
            paddingHorizontal: isWebDesktop ? 0 : 20,
            paddingTop: isWebDesktop ? 12 : 0,
            paddingBottom: 12,
          },
          isWebDesktop ? { width: '100%' } : undefined,
        ]}
      >
          {isWebDesktop ? (
            <View style={{ width: '100%', maxWidth: 1400, alignSelf: 'flex-start', paddingLeft: 20, paddingRight: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                className="flex-row items-center rounded-full px-4"
                style={{
                  height: 44,
                  width: '30%',
                  maxWidth: 420,
                  minWidth: 320,
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  placeholder="Search customers..."
                  placeholderTextColor={colors.input.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {([
                  { key: 'all' as const, label: 'All', count: filterTabCounts.all },
                  { key: 'new' as const, label: 'New', count: filterTabCounts.new },
                  { key: 'repeat' as const, label: 'Repeat', count: filterTabCounts.repeat },
                ]).map((tab) => (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveFilterTab(tab.key)}
                    className="rounded-full active:opacity-70"
                    style={{
                      height: 44,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: activeFilterTab === tab.key ? colors.accent.primary : colors.bg.card,
                      borderWidth: activeFilterTab === tab.key ? 0 : 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{
                        color: activeFilterTab === tab.key ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
                      }}
                    >
                      {tab.label}
                      <Text style={{ color: activeFilterTab === tab.key ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary }}>
                        {`  ${tab.count}`}
                      </Text>
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowFilterMenu(true);
                }}
                className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
                style={{
                  height: 44,
                  backgroundColor: sortBy !== 'name-asc' ? colors.accent.primary : colors.bg.card,
                  borderWidth: sortBy !== 'name-asc' ? 0 : 1,
                  borderColor: colors.border.light,
                }}
              >
                <Filter size={18} color={sortBy !== 'name-asc' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                {sortBy !== 'name-asc' && (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">1</Text>
                )}
              </Pressable>
            </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View
                className="flex-1 flex-row items-center rounded-full px-4"
                style={{ height: 52, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  placeholder="Search customers..."
                  placeholderTextColor={colors.input.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowFilterMenu(true);
                }}
                className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
                style={{
                  height: 52,
                  backgroundColor: sortBy !== 'name-asc' ? colors.accent.primary : colors.bg.secondary,
                  borderWidth: sortBy !== 'name-asc' ? 0 : 0.5,
                  borderColor: colors.border.light,
                }}
              >
                <Filter size={18} color={sortBy !== 'name-asc' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                {sortBy !== 'name-asc' && (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">1</Text>
                )}
              </Pressable>
            </View>
          )}
      </View>

      <ScrollView
        style={{
          flex: 1,
          paddingHorizontal: isWebDesktop ? 0 : 20,
          paddingTop: isWebDesktop ? 0 : 16,
          backgroundColor: showSplitView ? colors.bg.primary : (isWebDesktop ? colors.bg.primary : colors.bg.secondary),
        }}
        contentContainerStyle={{
          maxWidth: isWebDesktop ? 1400 : isDesktop ? 600 : undefined,
          alignSelf: isWebDesktop ? 'flex-start' : isDesktop && !selectedCustomerId ? 'center' : undefined,
          width: '100%',
          paddingLeft: isWebDesktop ? 20 : 0,
          paddingRight: isWebDesktop ? 20 : 0,
          paddingTop: isWebDesktop ? 16 : 0,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleCustomersScroll}
        scrollEventThrottle={16}
      >
        {isWebDesktop ? (
          <View
            style={{
              width: '100%',
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: colors.bg.card,
            }}
          >
            <View style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 12 }}>
                <Text style={{ color: colors.text.muted, flex: 1.9 }} className="text-xs font-semibold">
                  CUSTOMER
                </Text>
                <Text style={{ color: colors.text.muted, flex: 1.8 }} className="text-xs font-semibold">
                  EMAIL
                </Text>
                <Text style={{ color: colors.text.muted, width: 150 }} className="text-xs font-semibold">
                  PHONE
                </Text>
                <Text style={{ color: colors.text.muted, flex: 1 }} className="text-xs font-semibold">
                  STATE
                </Text>
                <Text style={{ color: colors.text.muted, width: 90, textAlign: 'center' }} className="text-xs font-semibold">
                  ORDERS
                </Text>
                <Text style={{ color: colors.text.muted, width: 150, textAlign: 'right' }} className="text-xs font-semibold">
                  TOTAL SPENT
                </Text>
                <Text style={{ color: colors.text.muted, width: 120, textAlign: 'right' }} className="text-xs font-semibold">
                  JOINED
                </Text>
                <View style={{ width: 24 }} />
              </View>
            </View>

            {filteredCustomers.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <View style={{ width: 80, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: colors.border.light }}>
                  <Plus size={36} color={colors.text.muted} strokeWidth={1.5} />
                </View>
                <Text style={{ color: colors.text.tertiary, fontSize: 16, marginBottom: 4 }}>No customers found</Text>
                <Text style={{ color: colors.text.muted, fontSize: 14, marginBottom: 16 }}>Add your first customer to get started</Text>
                <Pressable
                  onPress={() => { resetForm(); setShowAddModal(true); }}
                  style={{ backgroundColor: colors.accent.primary, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>Add First Customer</Text>
                </Pressable>
              </View>
            ) : visibleCustomers.map((customer, index) => (
              (() => {
                const stats = customerStatsById.get(customer.id);
                const ordersCount = stats?.ordersCount ?? 0;
                const totalSpent = stats?.totalSpent ?? 0;
                const isFullyRefunded = stats?.isFullyRefunded ?? false;
                const initials = getCustomerInitials(customer.fullName);

                return (
              <Pressable
                key={customer.id}
                onPress={() => handleCustomerSelect(customer.id)}
                className="active:opacity-70"
                style={{
                  backgroundColor: colors.bg.card,
                  borderBottomWidth: index === visibleCustomers.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 14 }}>
                  <View style={{ flex: 1.9, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.text.primary,
                      }}
                    >
                      <Text style={{ color: colors.bg.primary }} className="text-xs font-bold">
                        {initials}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text.primary, flex: 1 }} className="text-sm font-semibold" numberOfLines={1}>
                      {customer.fullName}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.secondary, flex: 1.8 }} className="text-sm" numberOfLines={1}>
                    {customer.email || '—'}
                  </Text>
                  <Text style={{ color: colors.text.secondary, width: 150 }} className="text-sm" numberOfLines={1}>
                    {customer.phone || '—'}
                  </Text>
                  <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm" numberOfLines={1}>
                    {customer.defaultState || '—'}
                  </Text>
                  <Text style={{ color: colors.text.secondary, width: 90, textAlign: 'center' }} className="text-sm font-semibold" numberOfLines={1}>
                    {ordersCount}
                  </Text>
                  <Text style={{ color: isFullyRefunded ? colors.text.muted : colors.text.primary, width: 150, textAlign: 'right' }} className="text-sm font-semibold" numberOfLines={1}>
                    {isFullyRefunded ? 'Refunded' : formatCurrency(totalSpent)}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, width: 120, textAlign: 'right' }} className="text-sm" numberOfLines={1}>
                    {formatMonthYear(customer.createdAt)}
                  </Text>
                  <View style={{ width: 24, alignItems: 'flex-end' }}>
                    <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
                  </View>
                </View>
              </Pressable>
                );
              })()
            ))}
          </View>
        ) : filteredCustomers.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
              <Plus size={36} color={colors.text.muted} strokeWidth={1.5} />
            </View>
            <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No customers found</Text>
            <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Add your first customer to get started</Text>
            <Pressable
              onPress={() => { resetForm(); setShowAddModal(true); }}
              className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center"
              style={{ backgroundColor: colors.accent.primary }}
            >
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Add First Customer</Text>
            </Pressable>
          </View>
        ) : (
          visibleCustomers.map((customer) => (
            <View
              key={customer.id}
              className="mb-3"
            >
              <Pressable
                onPress={() => handleCustomerSelect(customer.id)}
                className="active:opacity-80"
              >
                <View
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.bg.card,
                    borderWidth: 0.5,
                    borderColor: colors.border.light,
                    borderLeftWidth: 0.5,
                    borderLeftColor: colors.border.light,
                    ...getActiveSplitCardStyle({
                      isSelected: selectedCustomerId === customer.id,
                      showSplitView,
                      isDark,
                      colors,
                    }),
                  }}
                >
                  <View className="flex-row items-start">
                    <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-bold text-base">{customer.fullName}</Text>
                      {customer.email && (
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">{customer.email}</Text>
                      )}
                      {customer.defaultState && (
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{customer.defaultState}</Text>
                      )}
                    </View>
                    <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
                  </View>
                </View>
              </Pressable>
            </View>
          ))
        )}
          <View className="items-center py-2">
            {hasMoreCustomers ? (
              <Pressable
                onPress={loadMoreCustomers}
                className="rounded-full active:opacity-80 px-4"
                style={{
                  height: 38,
                  justifyContent: 'center',
                  backgroundColor: colors.bg.card,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                  Load more customers
                </Text>
              </Pressable>
            ) : (
              <Text style={{ color: colors.text.muted }} className="text-xs">
                Showing {visibleCustomers.length} of {filteredCustomers.length}
              </Text>
            )}
          </View>
          <View className="h-24" />
        </ScrollView>
      </>
    );

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        <SplitViewLayout
          detailContent={
            showSplitView && selectedCustomerId
              ? <CustomerDetailPanel customerId={selectedCustomerId} onEdit={handleEditFromPanel} onClose={() => setSelectedCustomerId(null)} />
              : null
          }
          detailTitle={showSplitView ? (selectedCustomer?.fullName || 'Customer Details') : undefined}
          onCloseDetail={showSplitView ? () => setSelectedCustomerId(null) : undefined}
        >
          {masterContent}
        </SplitViewLayout>
      </SafeAreaView>
      </View>

      <Modal
        visible={!!pendingDeleteCustomer}
        animationType="fade"
        transparent
        onRequestClose={() => setPendingDeleteCustomer(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => setPendingDeleteCustomer(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.bg.primary, maxWidth: 360 }}
          >
            <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Delete Customer</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                {pendingDeleteCustomer?.fullName ? `Delete ${pendingDeleteCustomer.fullName}?` : 'Delete this customer?'}
              </Text>
            </View>
            <View className="px-5 py-4 flex-row gap-3">
              <Pressable
                onPress={() => setPendingDeleteCustomer(null)}
                className="flex-1 rounded-full items-center"
                style={{ backgroundColor: colors.bg.secondary, height: 48, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteCustomer}
                className="flex-1 rounded-full items-center"
                style={{ backgroundColor: '#EF4444', height: 48, justifyContent: 'center' }}
              >
                <Text className="text-white font-semibold">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add/Edit Customer Modal */}
      <Modal
        visible={showAddModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => {
              setShowAddModal(false);
              resetForm();
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxWidth: 400, maxHeight: '80%' }}
            >
              {/* Modal Header */}
              <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">
                  {editingCustomer ? 'Edit Customer' : 'New Customer'}
                </Text>
                <Pressable
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false}>
                {/* Full Name */}
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Full Name *</Text>
                  <View
                    className="rounded-xl px-4"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 50, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="Enter customer name"
                      placeholderTextColor={colors.input.placeholder}
                      value={fullName}
                      onChangeText={setFullName}
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                {/* Phone */}
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Phone Number *</Text>
                  <View
                    className="rounded-xl px-4"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 50, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="+234 xxx xxx xxxx"
                      placeholderTextColor={colors.input.placeholder}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                {/* Email */}
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Email</Text>
                  <View
                    className="rounded-xl px-4"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 50, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="email@example.com"
                      placeholderTextColor={colors.input.placeholder}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                {/* Default State */}
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Default Delivery State</Text>
                  <Pressable
                    onPress={() => setShowStateModal(true)}
                    className="rounded-xl px-4 flex-row items-center justify-between"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 50 }}
                  >
                    <Text style={{ color: defaultState ? colors.input.text : colors.input.placeholder }} className="text-sm">
                      {defaultState || 'Select state'}
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                {/* Default Address */}
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Default Delivery Address</Text>
                  <View
                    className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 80 }}
                  >
                    <TextInput
                      placeholder="Enter full address"
                      placeholderTextColor={colors.input.placeholder}
                      value={defaultAddress}
                      onChangeText={setDefaultAddress}
                      multiline
                      numberOfLines={3}
                      style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                {/* Buttons */}
                <View className="flex-row gap-3 mb-4">
                  <Pressable
                    onPress={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="flex-1 rounded-full items-center"
                    style={{ backgroundColor: colors.bg.secondary, height: 50, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={!fullName.trim()}
                    className="flex-1 rounded-full items-center flex-row justify-center"
                    style={{ backgroundColor: isDark ? '#FFFFFF' : '#111111', height: 50, opacity: fullName.trim() ? 1 : 0.5 }}
                  >
                    {!editingCustomer ? (
                      <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                    ) : null}
                    <Text
                      style={{ color: isDark ? '#000000' : '#FFFFFF' }}
                      className={editingCustomer ? 'font-semibold' : 'font-semibold ml-1.5'}
                    >
                      {editingCustomer ? 'Save' : 'Add Customer'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={showFilterMenu}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          className="flex-1 items-center justify-end"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => setShowFilterMenu(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl overflow-hidden"
            style={{ backgroundColor: colors.bg.primary, maxHeight: '60%' }}
          >
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
            </View>
            <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Sort</Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-5 pt-4 pb-2">
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort By</Text>
                {([
                  { key: 'name-asc' as const, label: 'Name (A-Z)', icon: <ArrowDownAZ size={18} strokeWidth={2} /> },
                  { key: 'name-desc' as const, label: 'Name (Z-A)', icon: <ArrowUpAZ size={18} strokeWidth={2} /> },
                  { key: 'newest' as const, label: 'Newest First', icon: <Clock size={18} strokeWidth={2} /> },
                  { key: 'oldest' as const, label: 'Oldest First', icon: <Clock size={18} strokeWidth={2} /> },
                  { key: 'state' as const, label: 'State', icon: <MapPin size={18} strokeWidth={2} /> },
                ]).map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy(option.key);
                    }}
                    className="flex-row items-center py-3 px-2 rounded-xl active:opacity-70"
                    style={{
                      backgroundColor: sortBy === option.key
                        ? (isDark ? '#FFFFFF' : colors.bg.secondary)
                        : 'transparent',
                    }}
                  >
                    {React.cloneElement(option.icon, {
                      color: sortBy === option.key
                        ? (isDark ? '#111111' : colors.accent.primary)
                        : colors.text.muted,
                    })}
                    <View className="flex-1 ml-3">
                      <Text
                        style={{
                          color: sortBy === option.key
                            ? (isDark ? '#111111' : colors.text.primary)
                            : colors.text.primary,
                        }}
                        className="font-medium text-sm"
                      >
                        {option.label}
                      </Text>
                    </View>
                    {sortBy === option.key && (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: isDark ? '#111111' : colors.accent.primary }}
                      >
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
              <View className="px-5 py-4">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowFilterMenu(false);
                  }}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{ height: 50, backgroundColor: isDark ? '#FFFFFF' : '#111111' }}
                >
                  <Text style={{ color: isDark ? '#111111' : '#FFFFFF' }} className="font-semibold">Done</Text>
                </Pressable>
              </View>
              <View className="h-8" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* State Selection Modal */}
      <Modal
        visible={showStateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowStateModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => setShowStateModal(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.bg.primary, maxHeight: '70%', maxWidth: 400 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Select State</Text>
              <Pressable
                onPress={() => setShowStateModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false}>
              {NIGERIA_STATES.map((state) => (
                <Pressable
                  key={state}
                  onPress={() => {
                    setDefaultState(state);
                    setShowStateModal(false);
                    Haptics.selectionAsync();
                  }}
                  className="py-3 px-4 rounded-full mb-2 active:opacity-70"
                  style={{ backgroundColor: defaultState === state ? colors.accent.primary + '15' : colors.bg.secondary }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: defaultState === state ? colors.text.primary : colors.text.tertiary }} className="text-base">
                      {state}
                    </Text>
                    {defaultState === state && <Check size={20} color={colors.text.primary} strokeWidth={2} />}
                  </View>
                </Pressable>
              ))}
              <View className="h-4" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
