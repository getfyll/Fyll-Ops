import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Eye, EyeOff, Globe, KeyRound, Link2, ShoppingCart, RefreshCcw } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  type Customer,
  type Order,
  type OrderItem,
} from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
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
import { matchWooOrdersForReferenceRepair } from '@/lib/woocommerce-reference-repair';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { LimeToggle } from '@/components/settings/LimeToggle';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { useBreakpoint } from '@/lib/useBreakpoint';

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type SyncSummary = {
  fetched: number;
  linked: number;
  repaired: number;
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
  const palette = usePaymentsPalette();

  return (
    <View
      className="flex-row items-start rounded-2xl p-4"
      style={{
        backgroundColor: palette.inset,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: palette.nudgeBg }}
      >
        {icon}
      </View>
      <View className="flex-1 pr-3">
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }}>
          {label}
        </Text>
        <Text style={{ color: palette.faint }} className="mt-1 text-xs leading-5">
          {description}
        </Text>
      </View>
      <LimeToggle
        compact
        value={value}
        onValueChange={onValueChange}
        activeColor={FYLL_LIME}
        inactiveColor={palette.softFill}
        inactiveBorderColor={palette.outline}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function WooCommerceSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const resolvedThemeMode = useResolvedThemeMode();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
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
  const [focusedField, setFocusedField] = useState<'url' | 'key' | 'secret' | null>(null);
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
        limit: 300,
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
      const existingById = new Map(orders.map((order) => [order.id, order]));
      const referenceRepairs = matchWooOrdersForReferenceRepair(wooOrders, orders);
      orders.forEach((order) => {
        const refKey = normalizeWooLookupValue(order.websiteOrderReference);
        const orderKey = normalizeWooLookupValue(order.orderNumber);
        if (refKey && !existingByWebsiteRef.has(refKey)) existingByWebsiteRef.set(refKey, order);
        if (orderKey && !existingByOrderNumber.has(orderKey)) existingByOrderNumber.set(orderKey, order);
      });

      const nextSummary: SyncSummary = {
        fetched: wooOrders.length,
        linked: 0,
        repaired: 0,
        unmatched: 0,
        failed: 0,
        customersCreated: 0,
        productsCreated: createdCount,
        productsUpdated: updatedCount,
      };

      for (const wooOrder of wooOrders) {
        try {
          const websiteRefKey = normalizeWooLookupValue(wooOrder.websiteOrderReference);
          const regularlyMatchedOrder = autoLinkOrders
            ? existingByWebsiteRef.get(websiteRefKey) ?? existingByOrderNumber.get(websiteRefKey)
            : existingByWebsiteRef.get(websiteRefKey);
          const repairedOrderId = referenceRepairs.get(wooOrder.externalId);
          const matchedOrder = regularlyMatchedOrder
            ?? (repairedOrderId ? existingById.get(repairedOrderId) : undefined);

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
            if (!regularlyMatchedOrder && repairedOrderId) nextSummary.repaired += 1;
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
        `WooCommerce sync finished. ${nextSummary.linked} linked (${nextSummary.repaired} repaired), ${nextSummary.unmatched} unmatched.`
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

  const isBusy = isTesting || isSyncing || isPullingProducts || isSaving;
  const actionDisabled = !canAttemptConnection || isBusy;
  const fieldStyle = (field: 'url' | 'key' | 'secret') => ({
    minHeight: 56,
    backgroundColor: palette.inset,
    borderWidth: 1,
    borderColor: focusedField === field ? FYLL_LIME : palette.outline,
    shadowColor: FYLL_LIME,
    shadowOpacity: focusedField === field ? 0.12 : 0,
    shadowRadius: 8,
  } as const);

  if (isLoading) {
    return (
      <View style={panelStyles.outer}>
        <View className="flex-1 items-center justify-center" style={panelStyles.inner}>
          <ActivityIndicator size="large" color={palette.limeOnSurface} />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.page }}>
          {!isWebDesktop ? (
            <LinearGradient
              pointerEvents="none"
              colors={resolvedThemeMode === 'dark'
                ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)']
                : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }}
            />
          ) : null}
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
                  borderRadius: 16,
                  backgroundColor: toast.type === 'success' ? palette.card : palette.dangerBg,
                  borderWidth: 1,
                  borderColor: toast.type === 'success' ? palette.nudgeBorder : palette.dangerBorder,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: toast.type === 'success' ? palette.text : palette.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                  {toast.message}
                </Text>
              </View>
            </View>
          ) : null}

          {isWebDesktop ? (
            <InternalSettingsHeader
              title="WooCommerce"
              description="Connect your store and control how products and orders stay in sync."
              isDesktop
              onBack={goBack}
              rightElement={hasChanges ? (
                <Pressable onPress={handleSave} disabled={isSaving} className="h-10 items-center justify-center rounded-full px-4 active:opacity-80" style={{ backgroundColor: FYLL_LIME, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? <ActivityIndicator size="small" color={FYLL_LIME_INK} /> : <View className="flex-row items-center"><Check size={16} color={FYLL_LIME_INK} strokeWidth={2} /><MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, marginLeft: 5 }}>Save</MoneyText></View>}
                </Pressable>
              ) : null}
            />
          ) : <View style={{ minHeight: 66, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View className="flex-row items-center" style={{ flex: 1, minWidth: 0, paddingRight: hasChanges ? 12 : 0 }}>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  goBack();
                }}
                className="mr-3 h-10 w-10 items-center justify-center rounded-full active:opacity-50"
                style={{ backgroundColor: palette.softFill }}
              >
                <ArrowLeft size={20} color={palette.text} strokeWidth={2} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
                <Text style={{ color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>WooCommerce</Text>
              </View>
            </View>

            {hasChanges ? (
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className="h-10 items-center justify-center rounded-full px-4 active:opacity-80"
                style={{ backgroundColor: FYLL_LIME, opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={FYLL_LIME_INK} />
                ) : (
                  <View className="flex-row items-center">
                    <Check size={16} color={FYLL_LIME_INK} strokeWidth={2} />
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, marginLeft: 5 }}>Save</MoneyText>
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>}

          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
            contentContainerStyle={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingTop: 18, paddingBottom: 64 }}
          >
            <View style={{ width: '100%', maxWidth: 1440, alignSelf: Platform.OS === 'web' ? 'flex-start' : 'center' }}>
            <View
              style={{ position: 'relative', overflow: 'hidden', minHeight: isWebDesktop ? 142 : 156, marginBottom: 24, padding: isWebDesktop ? 24 : 20, justifyContent: 'center', borderRadius: 28, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}
            >
              {!isWebDesktop ? <LinearGradient pointerEvents="none" colors={[palette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.15, y: 1 }} style={{ position: 'absolute', top: -54, right: -32, width: 230, height: 230, borderRadius: 115 }} /> : null}
              <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
              <View className="flex-row items-center justify-between" style={{ gap: 16 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Commerce connection</Text>
                  <MoneyText style={{ color: palette.text, fontSize: isMobile ? 24 : 28, lineHeight: isMobile ? 29 : 34 }}>WooCommerce</MoneyText>
                  <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 3 }}>{hasWooCommerceConnection ? 'Configured and ready to sync' : 'Connect your store to get started'}</Text>
                </View>
                <View
                  className="rounded-full px-3 py-1.5"
                  style={{ backgroundColor: hasWooCommerceConnection ? palette.nudgeBg : palette.softFill, borderWidth: 1, borderColor: hasWooCommerceConnection ? palette.nudgeBorder : palette.border }}
                >
                  <Text style={{ color: hasWooCommerceConnection ? palette.limeOnSurface : palette.faint, fontSize: 11, fontWeight: '600' }}>
                    {hasWooCommerceConnection ? 'Ready' : 'Setup'}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>
              Connection
            </Text>

            <View
              className="mb-6 p-4"
              style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 26 }}
            >
              <SettingRow
                icon={<Link2 size={18} color={palette.limeOnSurface} strokeWidth={2} />}
                label="Enable WooCommerce"
                description="Turn on WooCommerce linking for this business."
                value={enabled}
                onValueChange={(value) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEnabled(value);
                }}
              />

              <View className="mt-4">
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '500', marginBottom: 8 }}>
                  Store URL
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={fieldStyle('url')}
                >
                  <Globe size={18} color={palette.faint} strokeWidth={2} />
                  <TextInput
                    value={storeUrl}
                    onChangeText={setStoreUrl}
                    placeholder="https://store.example.com"
                    placeholderTextColor={palette.faint}
                    onFocus={() => setFocusedField('url')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    className="ml-3 flex-1 py-4"
                    style={{ color: palette.text, fontSize: 15 }}
                  />
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '500', marginBottom: 8 }}>
                  Consumer Key
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={fieldStyle('key')}
                >
                  <KeyRound size={18} color={palette.faint} strokeWidth={2} />
                  <TextInput
                    value={consumerKey}
                    onChangeText={setConsumerKey}
                    placeholder="ck_..."
                    placeholderTextColor={palette.faint}
                    onFocus={() => setFocusedField('key')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="ml-3 flex-1 py-4"
                    style={{ color: palette.text, fontSize: 15 }}
                  />
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '500', marginBottom: 8 }}>
                  Consumer Secret
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-4"
                  style={fieldStyle('secret')}
                >
                  <KeyRound size={18} color={palette.faint} strokeWidth={2} />
                  <TextInput
                    value={consumerSecret}
                    onChangeText={setConsumerSecret}
                    placeholder="cs_..."
                    placeholderTextColor={palette.faint}
                    onFocus={() => setFocusedField('secret')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showSecret}
                    className="ml-3 flex-1 py-4"
                    style={{ color: palette.text, fontSize: 15 }}
                  />
                  <Pressable
                    onPress={() => setShowSecret((current) => !current)}
                    className="ml-3 h-10 w-10 items-center justify-center rounded-xl active:opacity-60"
                    style={{ backgroundColor: palette.softFill }}
                  >
                    {showSecret ? (
                      <EyeOff size={18} color={palette.faint} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={palette.faint} strokeWidth={2} />
                    )}
                  </Pressable>
                </View>
              </View>
            </View>

            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>
              Order Linking
            </Text>

            <View
              className="mb-6 p-4"
              style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 26 }}
            >
              <SettingRow
                icon={<ShoppingCart size={18} color={palette.limeOnSurface} strokeWidth={2} />}
                label="Auto-link by Website Order Ref"
                description="Match WooCommerce orders to existing FYLL orders using Website Order Ref. Unmatched Woo orders are skipped."
                value={autoLinkOrders}
                onValueChange={(value) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAutoLinkOrders(value);
                }}
              />
            </View>

            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>
              Actions
            </Text>

            <View
              className="mb-6 p-4"
              style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 26 }}
            >
              <View className="flex-row flex-wrap gap-3">
                <Pressable
                  onPress={handleTestConnection}
                  disabled={actionDisabled}
                  className="flex-row items-center justify-center rounded-full px-4 active:opacity-80"
                  style={{
                    minHeight: 46,
                    backgroundColor: palette.inset,
                    borderWidth: 1,
                    borderColor: palette.outline,
                    flexBasis: 150,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 150,
                    opacity: actionDisabled ? 0.5 : 1,
                  }}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color={palette.text} />
                  ) : (
                    <>
                      <Check size={16} color={palette.text} strokeWidth={2} />
                      <MoneyText style={{ color: palette.text, fontSize: 14, marginLeft: 8 }}>Test Connection</MoneyText>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handlePullProducts}
                  disabled={actionDisabled}
                  className="flex-row items-center justify-center rounded-full px-4 active:opacity-80"
                  style={{
                    minHeight: 46,
                    backgroundColor: palette.inset,
                    borderWidth: 1,
                    borderColor: palette.outline,
                    flexBasis: 150,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 150,
                    opacity: actionDisabled ? 0.5 : 1,
                  }}
                >
                  {isPullingProducts ? (
                    <ActivityIndicator size="small" color={palette.text} />
                  ) : (
                    <>
                      <ShoppingCart size={16} color={palette.text} strokeWidth={2} />
                      <MoneyText style={{ color: palette.text, fontSize: 14, marginLeft: 8 }}>Pull Products</MoneyText>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleSyncOrders}
                  disabled={actionDisabled}
                  className="flex-row items-center justify-center rounded-full px-4 active:opacity-80"
                  style={{
                      minHeight: 46,
                      backgroundColor: FYLL_LIME,
                      flexBasis: 150,
                      flexGrow: 1,
                      flexShrink: 1,
                      minWidth: 150,
                      opacity: actionDisabled ? 0.5 : 1,
                  }}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color={FYLL_LIME_INK} />
                  ) : (
                    <>
                      <RefreshCcw size={16} color={FYLL_LIME_INK} strokeWidth={2} />
                      <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, marginLeft: 8 }}>Link 50 Orders</MoneyText>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '500' }} className="mt-4 leading-5">
                Pull Products imports up to 100 WooCommerce catalog products into FYLL inventory. Link 50 Orders pulls recent WooCommerce orders and links matching FYLL orders only.
              </Text>
            </View>

            {productPullSummary ? (
              <View
                className="mb-6 p-4"
                style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 26 }}
              >
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
                  Last Product Pull
                </Text>
                <View className="mt-4 flex-row flex-wrap">
                  {[
                    ['Fetched', productPullSummary.fetched],
                    ['Created', productPullSummary.productsCreated],
                    ['Updated', productPullSummary.productsUpdated],
                  ].map(([label, value]) => (
                    <View key={String(label)} className="mb-3 w-1/3 pr-2">
                      <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {label}
                      </Text>
                      <MoneyText style={{ color: palette.text, fontSize: 18, marginTop: 4 }}>
                        {value}
                      </MoneyText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {syncSummary ? (
              <View
                className="mb-6 p-4"
                style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 26 }}
              >
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
                  Last Sync Summary
                </Text>
                <View className="mt-4 flex-row flex-wrap">
                  {[
                    ['Fetched', syncSummary.fetched],
                    ['Linked', syncSummary.linked],
                    ['Repaired refs', syncSummary.repaired],
                    ['Unmatched', syncSummary.unmatched],
                    ['Failed', syncSummary.failed],
                    ['Customers', syncSummary.customersCreated],
                    ['Products', syncSummary.productsCreated],
                    ['Variants', syncSummary.productsUpdated],
                  ].map(([label, value]) => (
                    <View key={String(label)} className="mb-3 w-1/2 pr-2">
                      <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {label}
                      </Text>
                      <MoneyText style={{ color: palette.text, fontSize: 18, marginTop: 4 }}>
                        {value}
                      </MoneyText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {error ? (
              <View
                className="mb-8 rounded-2xl px-4 py-3"
                style={{ backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}
              >
                <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '500' }}>
                  {error}
                </Text>
              </View>
            ) : (
              <View className="h-8" />
            )}
            </View>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
