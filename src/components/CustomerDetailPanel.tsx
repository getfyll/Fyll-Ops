import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, Linking, Modal, Alert, KeyboardAvoidingView, ScrollView, TextInput } from 'react-native';
import { ArrowLeft, User as UserIcon, Phone, Mail, MapPin, Edit2, Trash2, ShoppingCart, Calendar, X, ChevronDown, Check, FileText, AlertTriangle } from 'lucide-react-native';
import useFyllStore, { Customer, formatCurrency, NIGERIA_STATES, CASE_STATUS_COLORS, CASE_PRIORITY_COLORS } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { DetailSection, DetailActionButton } from './SplitViewLayout';
import { getOrderStatusColor } from '@/lib/order-status-colors';
import * as Haptics from 'expo-haptics';
import { useBreakpoint } from '@/lib/useBreakpoint';

interface CustomerDetailPanelProps {
  customerId: string;
  onEdit?: (customer: Customer) => void;
  onClose?: () => void;
}

export function CustomerDetailPanel({ customerId, onEdit, onClose }: CustomerDetailPanelProps) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const { isMobile, isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const webNarrowMaxWidth = 1136; // 1080 content + 28px gutters

  const customers = useFyllStore((s) => s.customers);
  const orders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const cases = useFyllStore((s) => s.cases);
  const updateCustomer = useFyllStore((s) => s.updateCustomer);
  const deleteCustomer = useFyllStore((s) => s.deleteCustomer);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStateModal, setShowStateModal] = useState(false);

  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDefaultAddress, setFormDefaultAddress] = useState('');
  const [formDefaultState, setFormDefaultState] = useState('');

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  // Get orders for this customer
  const customerOrders = useMemo(() => {
    if (!customer) return [];
    return orders.filter((o) =>
      o.customerName?.toLowerCase() === customer.fullName.toLowerCase() ||
      (o.customerEmail && customer.email && o.customerEmail.toLowerCase() === customer.email.toLowerCase()) ||
      (o.customerPhone && customer.phone && o.customerPhone === customer.phone)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, customer]);

  // Calculate total spent (net of refunds)
  const totalSpent = useMemo(() => {
    return customerOrders.reduce((sum, order) => {
      const orderAmount = order.totalAmount ?? 0;
      const refundAmount = order.refund?.amount ?? 0;
      // Subtract refund amount from order total to get net spend
      const netAmount = orderAmount - refundAmount;
      return sum + Math.max(0, netAmount);
    }, 0);
  }, [customerOrders]);

  // Get orders with refunds (partial or full) for this customer
  const refundedOrders = useMemo(() => {
    return customerOrders.filter((order) =>
      (order.refund?.amount ?? 0) > 0 || (order.status || '').toLowerCase().includes('refund')
    );
  }, [customerOrders]);

  // Get cases for this customer
  const customerCases = useMemo(() => {
    if (!customer) return [];
    return cases.filter((c) =>
      c.customerName?.toLowerCase() === customer.fullName.toLowerCase() ||
      c.customerId === customer.id
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [cases, customer]);

  const statusColorByName = useMemo(() => {
    const map = new Map<string, string>();
    orderStatuses.forEach((s) => map.set(s.name, s.color));
    return map;
  }, [orderStatuses]);

  if (!customer) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <UserIcon size={48} color={colors.text.muted} strokeWidth={1.5} />
        <Text style={{ color: colors.text.muted, fontSize: 16, marginTop: 16 }}>
          Select a customer to view details
        </Text>
      </View>
    );
  }

  const handleDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (Platform.OS === 'web') {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }
    setShowDeletePrompt(true);
  };

  const openInlineEditModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (Platform.OS === 'web') {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }

    setFormFullName(customer.fullName);
    setFormEmail(customer.email);
    setFormPhone(customer.phone);
    setFormDefaultAddress(customer.defaultAddress);
    setFormDefaultState(customer.defaultState);
    setShowEditModal(true);
  };

  const handleEditPress = () => {
    if (onEdit) {
      onEdit(customer);
      return;
    }
    openInlineEditModal();
  };

  const handleSaveInlineEdit = () => {
    if (!formFullName.trim()) {
      Alert.alert('Required Field', 'Please enter the customer name');
      return;
    }

    if (!formPhone.trim()) {
      Alert.alert('Required Field', 'Phone number is required');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    updateCustomer(customer.id, {
      fullName: formFullName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      defaultAddress: formDefaultAddress.trim(),
      defaultState: formDefaultState,
    });

    setShowEditModal(false);
  };

  const confirmDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    deleteCustomer(customer.id, businessId);
    setShowDeletePrompt(false);
    onClose?.();
  };

  const customerSinceTimestamp = customerOrders.length
    ? Math.min(...customerOrders.map((order) => new Date(order.orderDate ?? order.createdAt).getTime()))
    : new Date(customer.createdAt ?? Date.now()).getTime();
  const createdDate = new Date(customerSinceTimestamp).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const memberSince = new Date(customerSinceTimestamp).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const getInitials = (name: string) => {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const getStatusChipColors = (statusName: string) => {
    const isRefund = statusName.toLowerCase().includes('refund');
    const color = isRefund ? '#EF4444' : getOrderStatusColor(statusName, Object.fromEntries(statusColorByName.entries()), '#6B7280');
    return { bg: `${color}15`, text: color };
  };

  return (
    <View style={{ flex: 1 }}>
      {isWebDesktop ? (
        <View
          style={{
            paddingHorizontal: 28,
            paddingTop: 32,
            paddingBottom: 18,
            width: '100%',
            maxWidth: webNarrowMaxWidth,
            alignSelf: 'flex-start',
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
              {onClose && (
                <Pressable
                  onPress={onClose}
                  className="active:opacity-70"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              )}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? '#FFFFFF' : '#111111',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ color: isDark ? '#111111' : '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                  {getInitials(customer.fullName)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }} numberOfLines={1}>
                  {customer.fullName}
                </Text>
                <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 6 }} numberOfLines={1}>
                  Joined {memberSince}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={handleDelete}
                className="active:opacity-80"
                style={{
                  paddingHorizontal: 8,
                  height: 44,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>Delete</Text>
              </Pressable>

              <Pressable
                onPress={handleEditPress}
                className="active:opacity-80"
                style={{
                  height: 44,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </View>
          </View>

          {/* Contact + Summary */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 20 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.bg.card,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '700', letterSpacing: 0.6, fontSize: 12 }}>
                CONTACT
              </Text>

              <View style={{ marginTop: 14, gap: 12 }}>
                {customer.email ? (
                  <Pressable onPress={() => Linking.openURL(`mailto:${customer.email}`)} className="active:opacity-80">
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Email</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={1}>
                        {customer.email}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Email</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14 }}>—</Text>
                  </View>
                )}

                {customer.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${customer.phone}`)} className="active:opacity-80">
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Phone</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{customer.phone}</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Phone</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14 }}>—</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Address</Text>
                  <Text
                    style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right', lineHeight: 18 }}
                    numberOfLines={2}
                  >
                    {customer.defaultAddress || customer.defaultState
                      ? `${customer.defaultAddress ?? ''}${customer.defaultAddress && customer.defaultState ? ', ' : ''}${customer.defaultState ?? ''}`
                      : '—'}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: colors.bg.card,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '700', letterSpacing: 0.6, fontSize: 12 }}>
                SUMMARY
              </Text>

              <View style={{ marginTop: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Total Orders</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{customerOrders.length}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Total Spent</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{formatCurrency(totalSpent)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Member Since</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{memberSince}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Order History */}
          <View
            style={{
              backgroundColor: colors.bg.card,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border.light,
              marginTop: 20,
            }}
          >
            <Text style={{ color: colors.text.primary, fontWeight: '700', letterSpacing: 0.6, fontSize: 12 }}>
              ORDER HISTORY
            </Text>

            {customerOrders.length === 0 ? (
              <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 12 }}>
                No orders yet.
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                {customerOrders.slice(0, 8).map((order, index) => {
                  const orderDate = new Date(order.orderDate ?? order.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const chip = getStatusChipColors(order.status);
                  return (
                    <View
                      key={order.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                        gap: 16,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          {order.orderNumber}
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: 13 }} numberOfLines={1}>
                          {orderDate}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                          {formatCurrency(order.totalAmount)}
                        </Text>
                        <View style={{ backgroundColor: chip.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: chip.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                            {order.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Cases History */}
          <View
            style={{
              backgroundColor: colors.bg.card,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border.light,
              marginTop: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FileText size={14} color={colors.text.muted} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontWeight: '700', letterSpacing: 0.6, fontSize: 12 }}>
                CASES ({customerCases.length})
              </Text>
            </View>

            {customerCases.length === 0 ? (
              <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 12 }}>
                No cases for this customer.
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                {customerCases.slice(0, 5).map((caseItem, index) => {
                  const caseDate = new Date(caseItem.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const statusHex = CASE_STATUS_COLORS[caseItem.status] || '#6B7280';
                  const statusColor = { bg: statusHex, text: '#FFFFFF' };
                  const priorityHex = CASE_PRIORITY_COLORS[caseItem.priority ?? 'Low'] || '#6B7280';
                  const priorityColor = { bg: priorityHex, text: priorityHex };
                  return (
                    <View
                      key={caseItem.id}
                      style={{
                        paddingVertical: 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          {caseItem.caseNumber}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ backgroundColor: priorityColor.bg + '20', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: priorityColor.text, fontSize: 10, fontWeight: '700', textTransform: 'lowercase' }}>
                              {caseItem.priority}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: statusColor.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: statusColor.text, fontSize: 10, fontWeight: '700' }}>
                              {caseItem.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text style={{ color: colors.text.secondary, fontSize: 13 }} numberOfLines={2}>
                        {caseItem.issueSummary || 'No summary'}
                      </Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                        {caseItem.type} • {caseDate}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Refund History */}
          {refundedOrders.length > 0 && (
            <View
              style={{
                backgroundColor: colors.bg.card,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border.light,
                marginTop: 20,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color="#EF4444" strokeWidth={2} />
                <Text style={{ color: colors.text.primary, fontWeight: '700', letterSpacing: 0.6, fontSize: 12 }}>
                  REFUNDS ({refundedOrders.length})
                </Text>
              </View>

              <View style={{ marginTop: 12 }}>
                {refundedOrders.map((order, index) => {
                  const refundDate = new Date(order.orderDate ?? order.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  return (
                    <View
                      key={order.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          {order.orderNumber}
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>
                          {refundDate}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '700' }}>
                          -{formatCurrency(order.refund?.amount ?? order.totalAmount)}
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                          {order.refund?.amount && order.refund.amount < (order.totalAmount ?? 0)
                            ? `Partial refund${order.refund?.reason ? ` - ${order.refund.reason}` : ''}`
                            : (order.refund?.reason || 'Full refund')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      ) : null}

      {isMobile && onClose && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 }}>
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text
            style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', flex: 1 }}
            numberOfLines={1}
          >
            {customer.fullName}
          </Text>
        </View>
      )}

      {!isWebDesktop && (
        <>
          {/* Customer Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, alignItems: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: isDark ? '#FFFFFF' : '#111111',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ color: isDark ? '#111111' : '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: 1 }}>
                {customer.fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
              </Text>
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
              {customer.fullName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Calendar size={12} color={colors.text.muted} strokeWidth={2} />
              <Text style={{ color: colors.text.muted, fontSize: 13, marginLeft: 4 }}>
                Customer since {createdDate}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.bg.card,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>Total Orders</Text>
              <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', marginTop: 4 }}>
                {customerOrders.length}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.bg.card,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>Total Spent</Text>
              <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', marginTop: 4 }}>
                {formatCurrency(totalSpent)}
              </Text>
            </View>
          </View>

          {/* Contact Info */}
          <DetailSection title="Contact">
            {customer.phone && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${customer.phone}`)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Phone size={16} color={colors.text.tertiary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11 }}>Phone</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>{customer.phone}</Text>
                </View>
              </Pressable>
            )}

            {customer.email && (
              <Pressable
                onPress={() => Linking.openURL(`mailto:${customer.email}`)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: customer.phone ? 1 : 0, borderTopColor: colors.border.light }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Mail size={16} color={colors.text.tertiary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11 }}>Email</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>{customer.email}</Text>
                </View>
              </Pressable>
            )}

            {!customer.phone && !customer.email && (
              <Text style={{ color: colors.text.muted, fontSize: 14, textAlign: 'center', paddingVertical: 12 }}>
                No contact information
              </Text>
            )}
          </DetailSection>

          {/* Default Address */}
          {(customer.defaultAddress || customer.defaultState) && (
            <DetailSection title="Default Delivery Address">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MapPin size={16} color={colors.text.tertiary} strokeWidth={2} style={{ marginTop: 2 }} />
                <Text style={{ color: colors.text.secondary, fontSize: 14, marginLeft: 10, flex: 1, lineHeight: 20 }}>
                  {customer.defaultAddress}
                  {customer.defaultAddress && customer.defaultState ? ', ' : ''}
                  {customer.defaultState}
                </Text>
              </View>
            </DetailSection>
          )}

          {/* Recent Orders */}
          {customerOrders.length > 0 && (
            <DetailSection title={`Recent Orders (${customerOrders.length})`}>
              {customerOrders.slice(0, 5).map((order, index) => {
                const orderDate = new Date(order.orderDate ?? order.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                return (
                  <View
                    key={order.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderTopWidth: index > 0 ? 1 : 0,
                      borderTopColor: colors.border.light,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: colors.bg.secondary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <ShoppingCart size={16} color={colors.text.tertiary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{order.orderNumber}</Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12 }}>{orderDate} · {order.status}</Text>
                    </View>
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>
                      {formatCurrency(order.totalAmount)}
                    </Text>
                  </View>
                );
              })}
            </DetailSection>
          )}

          {/* Actions */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 12 }}>
            <DetailActionButton
              label="Edit Customer"
              icon={<Edit2 size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />}
              onPress={handleEditPress}
            />
            <DetailActionButton
              label="Delete Customer"
              icon={<Trash2 size={18} color="#EF4444" strokeWidth={2} />}
              onPress={handleDelete}
              variant="danger"
            />
          </View>
        </>
      )}

      <Modal
        visible={showDeletePrompt}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeletePrompt(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => setShowDeletePrompt(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.bg.primary, maxWidth: 360 }}
          >
            <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Delete Customer</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                {`Delete ${customer.fullName}?`}
              </Text>
            </View>
            <View className="px-5 py-4 flex-row gap-3">
              <Pressable
                onPress={() => setShowDeletePrompt(false)}
                className="flex-1 rounded-full items-center"
                style={{ backgroundColor: colors.bg.secondary, height: 48, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                className="flex-1 rounded-full items-center"
                style={{ backgroundColor: '#EF4444', height: 48, justifyContent: 'center' }}
              >
                <Text className="text-white font-semibold">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Inline Edit Customer Modal (used on detail screen) */}
      <Modal
        visible={showEditModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => setShowEditModal(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxWidth: 420, maxHeight: '80%' }}
            >
              <View
                className="flex-row items-center justify-between px-5 py-4"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">
                  Edit Customer
                </Text>
                <Pressable
                  onPress={() => setShowEditModal(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Full Name *
                  </Text>
                  <View
                    className="rounded-xl px-4"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      height: 50,
                      justifyContent: 'center',
                    }}
                  >
                    <TextInput
                      placeholder="Enter customer name"
                      placeholderTextColor={colors.input.placeholder}
                      value={formFullName}
                      onChangeText={setFormFullName}
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Phone Number *
                  </Text>
                  <View
                    className="rounded-xl px-4"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      height: 50,
                      justifyContent: 'center',
                    }}
                  >
                    <TextInput
                      placeholder="+234 xxx xxx xxxx"
                      placeholderTextColor={colors.input.placeholder}
                      value={formPhone}
                      onChangeText={setFormPhone}
                      keyboardType="phone-pad"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Email
                  </Text>
                  <View
                    className="rounded-xl px-4"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      height: 50,
                      justifyContent: 'center',
                    }}
                  >
                    <TextInput
                      placeholder="email@example.com"
                      placeholderTextColor={colors.input.placeholder}
                      value={formEmail}
                      onChangeText={setFormEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Default Delivery State
                  </Text>
                  <Pressable
                    onPress={() => setShowStateModal(true)}
                    className="rounded-xl px-4 flex-row items-center justify-between"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 50 }}
                  >
                    <Text style={{ color: formDefaultState ? colors.input.text : colors.input.placeholder }} className="text-sm">
                      {formDefaultState || 'Select state'}
                    </Text>
                    <ChevronDown size={20} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>

                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Default Delivery Address
                  </Text>
                  <View
                    className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 80 }}
                  >
                    <TextInput
                      placeholder="Enter full address"
                      placeholderTextColor={colors.input.placeholder}
                      value={formDefaultAddress}
                      onChangeText={setFormDefaultAddress}
                      multiline
                      numberOfLines={3}
                      style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View className="flex-row gap-3 mb-2">
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    className="flex-1 rounded-full items-center"
                    style={{ backgroundColor: colors.bg.secondary, height: 50, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveInlineEdit}
                    disabled={!formFullName.trim()}
                    className="flex-1 rounded-full items-center flex-row justify-center"
                    style={{ backgroundColor: isDark ? '#FFFFFF' : '#111111', height: 50, opacity: formFullName.trim() ? 1 : 0.5 }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold">Save</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* State Selection Modal (used by inline edit) */}
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
            style={{ backgroundColor: colors.bg.primary, maxHeight: '70%', maxWidth: 420 }}
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
                    setFormDefaultState(state);
                    setShowStateModal(false);
                    Haptics.selectionAsync();
                  }}
                  className="py-3 px-4 rounded-full mb-2 active:opacity-70"
                  style={{ backgroundColor: formDefaultState === state ? colors.accent.primary + '15' : colors.bg.secondary }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: formDefaultState === state ? colors.text.primary : colors.text.tertiary }} className="text-base">
                      {state}
                    </Text>
                    {formDefaultState === state && <Check size={20} color={colors.text.primary} strokeWidth={2} />}
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
