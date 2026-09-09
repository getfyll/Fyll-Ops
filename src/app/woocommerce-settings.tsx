import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Eye, EyeOff, Globe, KeyRound, Link2, ShoppingCart, RefreshCcw } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';

import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  type Customer,
  type Order,
  type OrderItem,
} from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useThemeColors } from '@/lib/theme';
import { fetchWooCommerceOrders, fetchWooCommerceProducts, testWooCommerceConnection } from '@/lib/woocommerce';
import {
  ensureWooCatalogProductsExist,
  ensureWooProductsExist,
  mapWooOrderToOrderItems,
  normalizeWooLookupValue,
  resolveWooResidualCharges,
} from '@/lib/woocommerce-link';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type SyncSummary = {
  fetched: number;
  linked: number;
  unmatched: number;
  failed: number;
  customersCreated: number;
  productsCreated: number;
  productsUpdated: number;
};

type ProductPullSummary = {
  fetched: number;
  productsCreated: number;
  productsUpdated: number;
};

type PersistOptions = {
  goBackOnSuccess?: boolean;
  successMessage?: string;
  errorFallback?: string;
};

const generateEntityId = () => Math.random().toString(36).substring(2, 15);

function SettingRow({
  icon,
  label,
  description,
  value,
  onValueChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-start rounded-2xl p-4"
      style={{
        backgroundColor: colors.bg.primary,
        borderWidth: 1,
        borderColor: colors.border.light,
      }}
    >
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: colors.bg.secondary }}
      >
        {icon}
      </View>
      <View className="flex-1 pr-3">
        <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
          {label}
        </Text>
        <Text style={{ color: colors.text.secondary }} className="mt-1 text-xs leading-5">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D1D5DB', true: '#111111' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function WooCommerceSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(
    openedFromSettings,
    colors.bg.primary,
    colors.border.light
  );
  const {
    woocommerceEnabled,
    woocommerceStoreUrl,
    woocommerceConsumerKey,
    woocommerceConsumerSecret,
    woocommerceAutoLinkOrders,
    hasWooCommerceConnection,
    isLoading,
    saveSettings,
  } = useBusinessSettings();

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const orders = useFyllStore((s) => s.orders);
  const customers = useFyllStore((s) => s.customers);
  const products = useFyllStore((s) => s.products);
  const updateOrder = useFyllStore((s) => s.updateOrder);
  const addCustomer = useFyllStore((s) => s.addCustomer);
  const addProductsBulk = useFyllStore((s) => s.addProductsBulk);
  const updateProduct = useFyllStore((s) => s.updateProduct);

  const [enabled, setEnabled] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [autoLinkOrders, setAutoLinkOrders] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPullingProducts, setIsPullingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [productPullSummary, setProductPullSummary] = useState<ProductPullSummary | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setEnabled(woocommerceEnabled);
      setStoreUrl(woocommerceStoreUrl);
      setConsumerKey(woocommerceConsumerKey);
      setConsumerSecret(woocommerceConsumerSecret);
      setAutoLinkOrders(woocommerceAutoLinkOrders);
    }
  }, [
    isLoading,
    woocommerceEnabled,
    woocommerceStoreUrl,
    woocommerceConsumerKey,
    woocommerceConsumerSecret,
    woocommerceAutoLinkOrders,
  ]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  const hasChanges = useMemo(() => (
    enabled !== woocommerceEnabled
    || storeUrl.trim() !== woocommerceStoreUrl.trim()
    || consumerKey.trim() !== woocommerceConsumerKey.trim()
    || consumerSecret.trim() !== woocommerceConsumerSecret.trim()
    || autoLinkOrders !== woocommerceAutoLinkOrders
  ), [
    autoLinkOrders,
    consumerKey,
    consumerSecret,
    enabled,
    storeUrl,
    woocommerceAutoLinkOrders,
    woocommerceConsumerKey,
    woocommerceConsumerSecret,
    woocommerceEnabled,
    woocommerceStoreUrl,
  ]);

  const connectionInput = useMemo(() => ({
    storeUrl: storeUrl.trim(),
    consumerKey: consumerKey.trim(),
    consumerSecret: consumerSecret.trim(),
  }), [consumerKey, consumerSecret, storeUrl]);

  const canAttemptConnection = Boolean(
    connectionInput.storeUrl
    && connectionInput.consumerKey
    && connectionInput.consumerSecret
  );

  const persistCurrentSettings = async (options?: PersistOptions) => {
    setError(null);
    const {
      goBackOnSuccess = false,
      successMessage = 'WooCommerce settings saved.',
      errorFallback = 'Failed to save WooCommerce settings.',
    } = options ?? {};

    setIsSaving(true);

    try {
      const result = await saveSettings({
        woocommerceEnabled: enabled,
        woocommerceStoreUrl: connectionInput.storeUrl,
        woocommerceConsumerKey: connectionInput.consumerKey,
        woocommerceConsumerSecret: connectionInput.consumerSecret,
        woocommerceAutoLinkOrders: autoLinkOrders,
      });

      if (!result.success) {
        const message = result.error || errorFallback;
        setError(message);
        showToast('error', message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return { success: false, error: message };
      }

      showToast('success', successMessage);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (goBackOnSuccess) {
        goBack();
      }
      return { success: true };
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message
        ? `${errorFallback} ${saveError.message}`
        : errorFallback;
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    await persistCurrentSettings({ goBackOnSuccess: true });
  };

  const handleTestConnection = async () => {
    if (!canAttemptConnection) {
      const message = 'Add the store URL, consumer key, and consumer secret first.';
      setError(message);
      showToast('error', message);
      return;
    }

    setError(null);
    setIsTesting(true);

    try {
      if (hasChanges) {
        const saved = await persistCurrentSettings({
          goBackOnSuccess: false,
          successMessage: 'WooCommerce settings saved.',
        });
        if (!saved.success) return;
      }

      await testWooCommerceConnection(connectionInput);
      showToast('success', 'WooCommerce connection is working.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (testError) {
      const message = testError instanceof Error && testError.message
        ? testError.message
        : 'WooCommerce connection test failed.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncOrders = async () => {
    if (!businessId) {
      const message = 'No business selected. Please sign in again and retry.';
      setError(message);
      showToast('error', message);
      return;
    }

    if (!canAttemptConnection) {
      const message = 'Add the store URL, consumer key, and consumer secret first.';
      setError(message);
      showToast('error', message);
      return;
    }

    setError(null);
    setSyncSummary(null);
    setIsSyncing(true);

    try {
      if (hasChanges) {
        const saved = await persistCurrentSettings({
          goBackOnSuccess: false,
          successMessage: 'WooCommerce settings saved.',
        });
        if (!saved.success) return;
      }

      const { orders: wooOrders } = await fetchWooCommerceOrders({
        ...connectionInput,
        limit: 50,
      });

      const timestamp = new Date().toISOString();
      const { productMap, createdCount, updatedCount } = await ensureWooProductsExist({
        businessId,
        lineItems: wooOrders.flatMap((order) => order.lineItems),
        products,
        addProductsBulk,
        updateProduct,
      });

      const customersByEmail = new Map<string, Customer>();
      const customersByPhone = new Map<string, Customer>();
      const customersByName = new Map<string, Customer>();

      customers.forEach((customer) => {
        const emailKey = normalizeWooLookupValue(customer.email);
        const phoneKey = normalizeWooLookupValue(customer.phone);
        const nameKey = normalizeWooLookupValue(customer.fullName);
        if (emailKey) customersByEmail.set(emailKey, customer);
        if (phoneKey) customersByPhone.set(phoneKey, customer);
        if (nameKey) customersByName.set(nameKey, customer);
      });

      const existingByWebsiteRef = new Map<string, Order>();
      const existingByOrderNumber = new Map<string, Order>();
      orders.forEach((order) => {
        const refKey = normalizeWooLookupValue(order.websiteOrderReference);
        const orderKey = normalizeWooLookupValue(order.orderNumber);
        if (refKey && !existingByWebsiteRef.has(refKey)) existingByWebsiteRef.set(refKey, order);
        if (orderKey && !existingByOrderNumber.has(orderKey)) existingByOrderNumber.set(orderKey, order);
      });

      const nextSummary: SyncSummary = {
        fetched: wooOrders.length,
        linked: 0,
        unmatched: 0,
        failed: 0,
        customersCreated: 0,
        productsCreated: createdCount,
        productsUpdated: updatedCount,
      };

      for (const wooOrder of wooOrders) {
        try {
          const websiteRefKey = normalizeWooLookupValue(wooOrder.websiteOrderReference);
          const matchedOrder = autoLinkOrders
            ? existingByWebsiteRef.get(websiteRefKey) ?? existingByOrderNumber.get(websiteRefKey)
            : existingByWebsiteRef.get(websiteRefKey);

          const emailKey = normalizeWooLookupValue(wooOrder.customerEmail);
          const phoneKey = normalizeWooLookupValue(wooOrder.customerPhone);
          const nameKey = normalizeWooLookupValue(wooOrder.customerName);

          let resolvedCustomer = customersByEmail.get(emailKey)
            ?? customersByPhone.get(phoneKey)
            ?? customersByName.get(nameKey);

          if (!resolvedCustomer && wooOrder.customerName.trim()) {
            const createdCustomer: Customer = {
              id: `cust-${generateEntityId()}`,
              fullName: wooOrder.customerName.trim(),
              email: wooOrder.customerEmail.trim(),
              phone: wooOrder.customerPhone.trim(),
              defaultAddress: wooOrder.deliveryAddress.trim(),
              defaultState: wooOrder.deliveryState.trim(),
              createdAt: timestamp,
            };

            await addCustomer(createdCustomer, businessId);
            resolvedCustomer = createdCustomer;
            nextSummary.customersCreated += 1;

            if (emailKey) customersByEmail.set(emailKey, createdCustomer);
            if (phoneKey) customersByPhone.set(phoneKey, createdCustomer);
            if (nameKey) customersByName.set(nameKey, createdCustomer);
          }

          const mappedItems: OrderItem[] = mapWooOrderToOrderItems(wooOrder.lineItems, productMap);

          if (matchedOrder) {
            const residualCharges = resolveWooResidualCharges(wooOrder);
            const nextItems = matchedOrder.items.length > 0 ? matchedOrder.items : mappedItems;
            await updateOrder(matchedOrder.id, {
              websiteOrderReference: wooOrder.websiteOrderReference,
              customerId: resolvedCustomer?.id,
              customerName: wooOrder.customerName || matchedOrder.customerName,
              customerNote: wooOrder.customerNote || matchedOrder.customerNote,
              customerEmail: wooOrder.customerEmail || matchedOrder.customerEmail,
              customerPhone: wooOrder.customerPhone || matchedOrder.customerPhone,
              deliveryState: wooOrder.deliveryState || matchedOrder.deliveryState,
              deliveryAddress: wooOrder.deliveryAddress || matchedOrder.deliveryAddress,
              items: nextItems,
              additionalCharges: residualCharges,
              additionalChargesNote: residualCharges > 0 ? 'WooCommerce taxes and extra charges' : '',
              deliveryFee: wooOrder.shippingAmount,
              discountAmount: wooOrder.discountAmount || undefined,
              paymentMethod: wooOrder.paymentMethod || matchedOrder.paymentMethod,
              status: wooOrder.status || matchedOrder.status,
              subtotal: wooOrder.subtotalAmount,
              totalAmount: wooOrder.totalAmount,
              orderDate: wooOrder.createdAt,
              updatedBy: 'WooCommerce Sync',
            }, businessId);

            nextSummary.linked += 1;
            existingByWebsiteRef.set(websiteRefKey, {
              ...matchedOrder,
              websiteOrderReference: wooOrder.websiteOrderReference,
            });
            continue;
          }
          nextSummary.unmatched += 1;
        } catch (syncError) {
          console.error('WooCommerce order sync failed:', wooOrder.orderNumber, syncError);
          nextSummary.failed += 1;
        }
      }

      setSyncSummary(nextSummary);
      showToast(
        nextSummary.failed > 0 ? 'error' : 'success',
        `WooCommerce sync finished. ${nextSummary.linked} linked, ${nextSummary.unmatched} unmatched.`
      );
      void Haptics.notificationAsync(
        nextSummary.failed > 0
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      );
    } catch (syncError) {
      const message = syncError instanceof Error && syncError.message
        ? syncError.message
        : 'WooCommerce sync failed.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullProducts = async () => {
    if (!businessId) {
      const message = 'No business selected. Please sign in again and retry.';
      setError(message);
      showToast('error', message);
      return;
    }

    if (!canAttemptConnection) {
      const message = 'Add the store URL, consumer key, and consumer secret first.';
      setError(message);
      showToast('error', message);
      return;
    }

    setError(null);
    setProductPullSummary(null);
    setIsPullingProducts(true);

    try {
      if (hasChanges) {
        const saved = await persistCurrentSettings({
          goBackOnSuccess: false,
          successMessage: 'WooCommerce settings saved.',
        });
        if (!saved.success) return;
      }

      const { products: wooProducts, fetchedCount } = await fetchWooCommerceProducts({
        ...connectionInput,
        limit: 100,
      });

      const result = await ensureWooCatalogProductsExist({
        businessId,
        wooProducts,
        products,
        addProductsBulk,
        updateProduct,
      });

      const nextSummary = {
        fetched: fetchedCount || result.fetchedCount,
        productsCreated: result.createdCount,
        productsUpdated: result.updatedCount,
      };

      setProductPullSummary(nextSummary);
      showToast(
        'success',
        `WooCommerce products pulled. ${nextSummary.productsCreated} created, ${nextSummary.productsUpdated} updated.`
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (pullError) {
      const message = pullError instanceof Error && pullError.message
        ? pullError.message
        : 'WooCommerce product pull failed.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPullingProducts(false);
    }
  };

  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;

  if (isLoading) {
    return (
      <View style={panelStyles.outer}>
        <View className="flex-1 items-center justify-center" style={panelStyles.inner}>
          <ActivityIndicator size="large" color={colors.text.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" edges={['top']}>
          {toast ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 18,
                left: 16,
                right: 16,
                alignItems: 'center',
                zIndex: 9999,
                elevation: 9999,
              }}
            >
              <View
                style={{
                  maxWidth: 420,
                  borderRadius: 999,
                  backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                  {toast.message}
                </Text>
              </View>
            </View>
          ) : null}

          <View
            className="flex-row items-center justify-between px-5 pb-3 pt-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
          >
            <View className="flex-row items-center" style={{ flex: 1, minWidth: 0, paddingRight: hasChanges ? 12 : 0 }}>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  goBack();
                }}
                className="mr-3 h-10 w-10 items-center justify-center rounded-xl active:opacity-50"
                style={{ backgroundColor: 'transparent' }}
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.text.primary,
                    fontSize: Platform.OS === 'web' ? 14 : 20,
                    lineHeight: Platform.OS === 'web' ? 18 : 24,
                    fontWeight: '600',
                  }}
                >
                  WooCommerce
                </Text>
                <Text style={{ color: colors.text.secondary, lineHeight: 16 }} className="text-xs" numberOfLines={2}>
                  Test the store, pull orders, and link existing FYLL orders by Website Order Ref.
                </Text>
              </View>
            </View>

            {hasChanges ? (
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className="h-10 items-center justify-center rounded-full px-4 active:opacity-80"
                style={[primaryPillButtonStyle, { opacity: isSaving ? 0.7 : 1 }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.bg.primary} />
                ) : (
                  <View className="flex-row items-center">
                    <Check size={16} color={colors.bg.primary} strokeWidth={2} />
                    <Text style={primaryPillTextStyle} className="ml-1 text-sm font-semibold">
                      Save
                    </Text>
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>

          <KeyboardAwareScrollView
            className="flex-1 px-5 pt-4"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
          >
            <View
              className="mb-4 rounded-2xl p-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View
                    className="mr-3 h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <ShoppingCart size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                      Connection Status
                    </Text>
                    <Text style={{ color: colors.text.secondary }} className="mt-1 text-xs">
                      {hasWooCommerceConnection ? 'Configured' : 'Not configured'}
                    </Text>
                  </View>
                </View>

                <View
                  className="rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: hasWooCommerceConnection ? '#ECFDF3' : colors.bg.secondary,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: hasWooCommerceConnection ? '#16A34A' : colors.text.secondary }}
                  >
                    {hasWooCommerceConnection ? 'Ready' : 'Setup'}
                  </Text>
                </View>
              </View>

              <Text style={{ color: colors.text.secondary }} className="mt-4 text-sm leading-6">
                FYLL will test the WooCommerce API, pull recent orders, and only link them to existing FYLL orders using Website Order Ref.
              </Text>
            </View>

            <Text style={{ color: colors.text.tertiary }} className="mb-3 text-xs font-semibold uppercase tracking-wider">
              Connection
            </Text>

            <View
              className="mb-6 rounded-2xl p-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <SettingRow
                icon={<Link2 size={18} color={colors.text.primary} strokeWidth={2} />}
                label="Enable WooCommerce"
                description="Turn on WooCommerce linking for this business."
                value={enabled}
                onValueChange={(value) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEnabled(value);
                }}
              />

              <View className="mt-4">
                <Text style={{ color: colors.text.tertiary }} className="mb-2 text-xs font-semibold uppercase tracking-wider">
                  Store URL
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={{
                    minHeight: 60,
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Globe size={18} color={colors.text.secondary} strokeWidth={2} />
                  <TextInput
                    value={storeUrl}
                    onChangeText={setStoreUrl}
                    placeholder="https://store.example.com"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    className="ml-3 flex-1 py-4 text-base"
                    style={{ color: colors.text.primary }}
                  />
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ color: colors.text.tertiary }} className="mb-2 text-xs font-semibold uppercase tracking-wider">
                  Consumer Key
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={{
                    minHeight: 60,
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <KeyRound size={18} color={colors.text.secondary} strokeWidth={2} />
                  <TextInput
                    value={consumerKey}
                    onChangeText={setConsumerKey}
                    placeholder="ck_..."
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="ml-3 flex-1 py-4 text-base"
                    style={{ color: colors.text.primary }}
                  />
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ color: colors.text.tertiary }} className="mb-2 text-xs font-semibold uppercase tracking-wider">
                  Consumer Secret
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={{
                    minHeight: 60,
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <KeyRound size={18} color={colors.text.secondary} strokeWidth={2} />
                  <TextInput
                    value={consumerSecret}
                    onChangeText={setConsumerSecret}
                    placeholder="cs_..."
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showSecret}
                    className="ml-3 flex-1 py-4 text-base"
                    style={{ color: colors.text.primary }}
                  />
                  <Pressable
                    onPress={() => setShowSecret((current) => !current)}
                    className="ml-3 h-10 w-10 items-center justify-center rounded-xl active:opacity-60"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    {showSecret ? (
                      <EyeOff size={18} color={colors.text.secondary} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.text.secondary} strokeWidth={2} />
                    )}
                  </Pressable>
                </View>
              </View>
            </View>

            <Text style={{ color: colors.text.tertiary }} className="mb-3 text-xs font-semibold uppercase tracking-wider">
              Order Linking
            </Text>

            <View
              className="mb-6 rounded-2xl p-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <SettingRow
                icon={<ShoppingCart size={18} color={colors.text.primary} strokeWidth={2} />}
                label="Auto-link by Website Order Ref"
                description="Match WooCommerce orders to existing FYLL orders using Website Order Ref. Unmatched Woo orders are skipped."
                value={autoLinkOrders}
                onValueChange={(value) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAutoLinkOrders(value);
                }}
              />
            </View>

            <Text style={{ color: colors.text.tertiary }} className="mb-3 text-xs font-semibold uppercase tracking-wider">
              Actions
            </Text>

            <View
              className="mb-6 rounded-2xl p-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row flex-wrap gap-3">
                <Pressable
                  onPress={handleTestConnection}
                  disabled={!canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving}
                  className="flex-row items-center justify-center rounded-full px-4 py-3 active:opacity-80"
                  style={{
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    flexBasis: 150,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 150,
                    opacity: !canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving ? 0.6 : 1,
                  }}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                  ) : (
                    <>
                      <Check size={16} color={colors.text.primary} strokeWidth={2} />
                      <Text style={{ color: colors.text.primary }} className="ml-2 text-sm font-semibold">
                        Test Connection
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handlePullProducts}
                  disabled={!canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving}
                  className="flex-row items-center justify-center rounded-full px-4 py-3 active:opacity-80"
                  style={{
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    flexBasis: 150,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 150,
                    opacity: !canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving ? 0.6 : 1,
                  }}
                >
                  {isPullingProducts ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                  ) : (
                    <>
                      <ShoppingCart size={16} color={colors.text.primary} strokeWidth={2} />
                      <Text style={{ color: colors.text.primary }} className="ml-2 text-sm font-semibold">
                        Pull Products
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleSyncOrders}
                  disabled={!canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving}
                  className="flex-row items-center justify-center rounded-full px-4 py-3 active:opacity-80"
                  style={[
                    primaryPillButtonStyle,
                    {
                      flexBasis: 150,
                      flexGrow: 1,
                      flexShrink: 1,
                      minWidth: 150,
                      opacity: !canAttemptConnection || isTesting || isSyncing || isPullingProducts || isSaving ? 0.6 : 1,
                    },
                  ]}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color={colors.bg.primary} />
                  ) : (
                    <>
                      <RefreshCcw size={16} color={colors.bg.primary} strokeWidth={2} />
                      <Text style={primaryPillTextStyle} className="ml-2 text-sm font-semibold">
                        Link 50 Orders
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={{ color: colors.text.secondary }} className="mt-4 text-xs leading-5">
                Pull Products imports up to 100 WooCommerce catalog products into FYLL inventory. Link 50 Orders pulls recent WooCommerce orders and links matching FYLL orders only.
              </Text>
            </View>

            {productPullSummary ? (
              <View
                className="mb-6 rounded-2xl p-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                  Last Product Pull
                </Text>
                <View className="mt-4 flex-row flex-wrap">
                  {[
                    ['Fetched', productPullSummary.fetched],
                    ['Created', productPullSummary.productsCreated],
                    ['Updated', productPullSummary.productsUpdated],
                  ].map(([label, value]) => (
                    <View key={String(label)} className="mb-3 w-1/3 pr-2">
                      <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase tracking-wider">
                        {label}
                      </Text>
                      <Text style={{ color: colors.text.primary }} className="mt-1 text-lg font-semibold">
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {syncSummary ? (
              <View
                className="mb-6 rounded-2xl p-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                  Last Sync Summary
                </Text>
                <View className="mt-4 flex-row flex-wrap">
                  {[
                    ['Fetched', syncSummary.fetched],
                    ['Linked', syncSummary.linked],
                    ['Unmatched', syncSummary.unmatched],
                    ['Failed', syncSummary.failed],
                    ['Customers', syncSummary.customersCreated],
                    ['Products', syncSummary.productsCreated],
                    ['Variants', syncSummary.productsUpdated],
                  ].map(([label, value]) => (
                    <View key={String(label)} className="mb-3 w-1/2 pr-2">
                      <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase tracking-wider">
                        {label}
                      </Text>
                      <Text style={{ color: colors.text.primary }} className="mt-1 text-lg font-semibold">
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {error ? (
              <View
                className="mb-8 rounded-2xl px-4 py-3"
                style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}
              >
                <Text style={{ color: '#DC2626' }} className="text-sm font-medium">
                  {error}
                </Text>
              </View>
            ) : (
              <View className="h-8" />
            )}
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
