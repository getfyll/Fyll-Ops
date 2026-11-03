import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ListPlus, Printer, Check, Minus, Plus } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { OrderLabel80x90Preview } from '@/components/labels/OrderLabel80x90';
import { addFyllPrintQueueItem, createShippingPrintQueueItem } from '@/lib/fyll-print-queue';
import {
  prepareOrderLabelData,
  printOrderLabel,
  SHIPPING_LABEL_SIZE_PRESETS,
} from '@/utils/printOrderLabel';
import * as Haptics from 'expo-haptics';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { formatAddressValue } from '@/lib/format-address';
import { MAX_PARCELS, getWeightText } from '@/lib/shipping-label-options';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

export default function OrderLabelPreviewScreen() {
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const { orderId, carrierName } = useLocalSearchParams<{ orderId: string; carrierName?: string }>();
  const orders = useFyllStore((s) => s.orders);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const order = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);
  const {
    businessName,
    businessSlug,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
    isLoading,
  } = useBusinessSettings();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const products = useFyllStore((s) => s.products);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [queueNotice, setQueueNotice] = useState(false);
  const [parcels, setParcels] = useState(1);
  const [weightKg, setWeightKg] = useState('');
  const [editingWeight, setWeightEditing] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [showReturn, setShowReturn] = useState(true);
  const [showThanks, setShowThanks] = useState(true);
  const labelSize = SHIPPING_LABEL_SIZE_PRESETS[0];

  const carrierNameOverride =
    typeof carrierName === 'string' && carrierName.trim().length > 0 ? carrierName.trim() : '';

  const labelData = useMemo(() => {
    if (!order) return null;
    return prepareOrderLabelData(
      {
        orderNumber: order.orderNumber,
        customerTrackingCode: order.customerTrackingCode,
        websiteOrderReference: order.websiteOrderReference,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        deliveryState: order.deliveryState,
        itemCount: (order.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0),
        logistics: {
          ...order.logistics,
          carrierName: carrierNameOverride || order.logistics?.carrierName,
        },
      },
      {
        businessName: businessName || 'FYLL',
        businessSlug,
        businessLogo,
        businessPhone,
        businessWebsite,
        returnAddress,
      }
    );
  }, [order, businessName, businessSlug, businessLogo, businessPhone, businessWebsite, returnAddress, carrierNameOverride]);

  // The label as it will print: the order's details plus what is switched on and how many parcels there are.
  const finalLabelData = useMemo(() => (
    labelData ? { ...labelData, parcelCount: parcels, parcelNumber: 1, weightKg, showPhone, showQr, showReturn, showThanks } : null
  ), [labelData, parcels, weightKg, showPhone, showQr, showReturn, showThanks]);

  const handlePrint = async () => {
    if (!finalLabelData || isPrinting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrinting(true);
    await printOrderLabel(finalLabelData, labelSize.size, { isDesktop });
    setIsPrinting(false);
  };

  const handleAddToQueue = async () => {
    if (!order || !finalLabelData || isQueueing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsQueueing(true);
    const item = createShippingPrintQueueItem({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      destination: order.fulfillmentMethod === 'pickup' ? 'Pick up' : order.deliveryState || order.deliveryAddress || '',
      carrierName: carrierNameOverride || order.logistics?.carrierName || 'Shipping',
      labelData: finalLabelData,
    });
    await addFyllPrintQueueItem(item, businessId);
    setIsQueueing(false);
    setQueueNotice(true);
    setTimeout(() => setQueueNotice(false), 2500);
  };

  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { width: windowWidth } = useWindowDimensions();
  // The label is shown up to 400px wide, and shrinks to fit when the window is narrow.
  const previewWidth = Math.max(280, Math.min(400, windowWidth - 360 - 320 - 80));
  const sizeText = '100 × 150 mm';

  if (!order) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: palette.page }}>
        <Text style={{ color: palette.muted, fontSize: 15, fontWeight: '600' }}>Order not found</Text>
        <Pressable onPress={() => router.back()} className="mt-3">
          <Text style={{ color: palette.limeOnSurface, fontSize: 14, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cardStyle = { borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const capLabel = (text: string) => (
    <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 11 : 10, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{text}</Text>
  );
  const kvRow = (label: string, value: string, first = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: palette.hairline }}>
      <Text style={{ color: palette.muted, fontSize: isWebDesktop ? 14 : 12 }}>{label}</Text>
      <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14 : 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{value}</Text>
    </View>
  );

  const courier = carrierNameOverride || order.logistics?.carrierName || 'Fyll Dispatch';
  const isPickup = order.fulfillmentMethod === 'pickup';
  const addressText = formatAddressValue([order.deliveryAddress, order.deliveryState].filter(Boolean).join(', '));
  const lineItems = (order.items ?? []).map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues ?? {}).filter(Boolean).join(' · ') : (item.variantName ?? '');
    return { key: item.id ?? `${item.productId}:${item.variantId}`, name: product?.name ?? item.productName ?? 'Item', variantName, quantity: item.quantity };
  });
  const canAct = Boolean(finalLabelData) && !isLoading;

  const queueButton = (
    <Pressable
      onPress={handleAddToQueue}
      disabled={!canAct || isQueueing}
      accessibilityRole="button"
      style={(state) => ({ height: isWebDesktop ? 42 : 52, paddingHorizontal: 18, flex: isWebDesktop ? undefined : 1, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canAct ? 1 : 0.45 })}
    >
      {isQueueing ? <ActivityIndicator color={palette.text} size="small" /> : <ListPlus size={16} color={palette.text} strokeWidth={2} />}
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Add to print queue</Text>
    </Pressable>
  );
  const labelsWord = `${parcels} label${parcels === 1 ? '' : 's'}`;
  const printLabelText = Platform.OS === 'web' && !isDesktop ? 'Download PDF' : `Print ${labelsWord}`;
  const printButton = (
    <Pressable
      onPress={handlePrint}
      disabled={!canAct || isPrinting}
      accessibilityRole="button"
      style={(state) => ({ height: isWebDesktop ? 42 : 52, paddingHorizontal: 22, flex: isWebDesktop ? undefined : 1, borderRadius: 999, backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canAct ? 1 : 0.45 })}
    >
      {isPrinting ? <ActivityIndicator color={FYLL_LIME_INK} size="small" /> : <Printer size={16} color={FYLL_LIME_INK} strokeWidth={2.2} />}
      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{printLabelText}</Text>
    </Pressable>
  );

  const shipToCard = (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {capLabel(isPickup ? 'Pick up' : 'Ship to')}
        <Pressable onPress={() => router.push(`/order-edit/${order.id}` as never)} accessibilityRole="button">
          <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>Edit</Text>
        </Pressable>
      </View>
      <View style={{ ...cardStyle, padding: 16, gap: 6 }}>
        <Text style={{ color: palette.text, fontSize: isWebDesktop ? 16 : 14, fontWeight: '600' }}>{order.customerName}</Text>
        {order.customerPhone ? <Text style={{ color: palette.muted, fontSize: isWebDesktop ? 14 : 12 }}>{order.customerPhone}</Text> : null}
        <Text style={{ color: palette.muted, fontSize: isWebDesktop ? 14 : 12, lineHeight: isWebDesktop ? 20 : 17 }}>{addressText || 'No delivery address on this order'}</Text>
      </View>
    </View>
  );

  // What the label prints for the parcel. These come from the order; the label itself shows them as fixed text.
  const parcelCard = (
    <View style={{ gap: 10 }}>
      {capLabel('Parcel')}
      <View style={{ ...cardStyle, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12 }}>Number of parcels</Text>
            <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 12.5 : 10 }}>One label per parcel</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fewer parcels" disabled={parcels <= 1} onPress={() => setParcels((value) => Math.max(1, value - 1))} style={(state) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', opacity: parcels <= 1 ? 0.4 : 1 })}>
            <Minus size={15} color={palette.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={{ width: 22, textAlign: 'center', color: palette.text, fontSize: isWebDesktop ? 15 : 12, fontWeight: '600' }}>{parcels}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="More parcels" disabled={parcels >= MAX_PARCELS} onPress={() => setParcels((value) => Math.min(MAX_PARCELS, value + 1))} style={(state) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', opacity: parcels >= MAX_PARCELS ? 0.4 : 1 })}>
            <Plus size={15} color={palette.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        {kvRow('Courier', courier)}
        {kvRow('Service', 'Dispatch Nigeria')}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Text style={{ color: palette.muted, fontSize: isWebDesktop ? 14 : 12 }}>Weight</Text>
          {editingWeight ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.nudgeBorder, backgroundColor: palette.inset, gap: 6 }}>
                <TextInput
                  value={weightKg}
                  onChangeText={(text) => setWeightKg(text.replace(/[^0-9.]/g, '').slice(0, 6))}
                  keyboardType="decimal-pad"
                  placeholder="< 2"
                  placeholderTextColor={palette.faint}
                  autoFocus
                  onSubmitEditing={() => setWeightEditing(false)}
                  returnKeyType="done"
                  style={{ width: 52, color: palette.text, fontSize: isWebDesktop ? 14 : 13, fontWeight: '600', textAlign: 'right', paddingVertical: 0 }}
                />
                <Text style={{ color: palette.muted, fontSize: isWebDesktop ? 14 : 12 }}>kg</Text>
              </View>
              <Pressable onPress={() => setWeightEditing(false)} accessibilityRole="button">
                <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14 : 12, fontWeight: '600' }}>{weightKg.trim() ? getWeightText({ weightKg }).toLowerCase() : 'Under 2 kg'}</Text>
              <Pressable onPress={() => setWeightEditing(true)} accessibilityRole="button" accessibilityLabel="Edit weight">
                <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>Edit</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const itemsCard = (
    <View style={{ gap: 10 }}>
      {capLabel('In this order')}
      <View style={{ ...cardStyle, paddingHorizontal: 16 }}>
        {lineItems.length === 0 ? (
          <Text style={{ color: palette.faint, fontSize: 13, paddingVertical: 14 }}>No items on this order.</Text>
        ) : lineItems.map((item, index) => (
          <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12 }} numberOfLines={1}>{item.name}</Text>
              {item.variantName ? <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 12.5 : 10 }} numberOfLines={1}>{item.variantName}</Text> : null}
            </View>
            <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 14 : 12 }}>×{item.quantity}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const previewBlock = (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: isWebDesktop ? 8 : 4 }}>
      {finalLabelData && !isLoading ? (
        isWebDesktop ? (
          // The label is built for a phone-sized preview; on desktop it is shown scaled up.
          <View style={{ width: previewWidth, height: previewWidth * 1.5 }}>
            <View style={{ width: 340, transform: [{ scale: previewWidth / 340 }], transformOrigin: 'top left' } as never}>
              <OrderLabel80x90Preview data={finalLabelData} widthMm={labelSize.size.widthMm} heightMm={labelSize.size.heightMm} />
            </View>
          </View>
        ) : (
          <OrderLabel80x90Preview data={finalLabelData} widthMm={labelSize.size.widthMm} heightMm={labelSize.size.heightMm} />
        )
      ) : (
        <View style={{ ...cardStyle, padding: 28 }}>
          <ActivityIndicator color={palette.limeOnSurface} size="small" />
        </View>
      )}
    </View>
  );

  const optionRow = (label: string, value: boolean, onChange: (next: boolean) => void, last = false) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline }}
    >
      <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12 }}>{label}</Text>
      <View style={{ width: 40, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center', alignItems: value ? 'flex-end' : 'flex-start', backgroundColor: value ? FYLL_LIME : palette.outline }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: value ? FYLL_LIME_INK : palette.card }} />
      </View>
    </Pressable>
  );
  const optionsCard = (
    <View style={{ gap: 10 }}>
      {capLabel('On the label')}
      <View style={{ ...cardStyle, paddingHorizontal: 16, paddingVertical: 2 }}>
        {optionRow("Customer's phone", showPhone, setShowPhone)}
        {optionRow('Delivery QR code', showQr, setShowQr)}
        {optionRow('Return address', showReturn, setShowReturn)}
        {optionRow('Thank-you line', showThanks, setShowThanks, true)}
      </View>
    </View>
  );

  const sizeCard = (
    <View style={{ gap: 10 }}>
      {capLabel('Label size')}
      <View style={{ ...cardStyle, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12, fontWeight: '500' }}>{sizeText}</Text>
        <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 13 : 10 }}>4 × 6 in</Text>
      </View>
    </View>
  );

  // The printer is chosen in the device's print dialog, so the card says that instead of naming one.
  const printerCard = (
    <View style={{ gap: 10 }}>
      {capLabel('Printer')}
      <View style={{ ...cardStyle, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
          <Printer size={16} color={palette.limeOnSurface} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12, fontWeight: '500' }}>Choose when you print</Text>
          <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 12.5 : 10 }}>Pick the shipping printer (4 × 6 roll) in the print dialog.</Text>
        </View>
      </View>
    </View>
  );

  const readyCard = (
    <View style={{ ...cardStyle, padding: 16, gap: 6 }}>
      {capLabel('Ready to print')}
      <MoneyText style={{ color: palette.text, fontSize: isWebDesktop ? 30 : 26, letterSpacing: -0.6 }}>{labelsWord}</MoneyText>
      <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 13 : 10 }}>1 order · {sizeText}</Text>
    </View>
  );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: isWebDesktop ? 28 : 16, paddingVertical: isWebDesktop ? 18 : 12 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={(state) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
      >
        <ArrowLeft size={18} color={palette.text} strokeWidth={2.2} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <MoneyText style={{ color: palette.text, fontSize: isWebDesktop ? 26 : 22, letterSpacing: -0.6 }} numberOfLines={1}>Shipping label</MoneyText>
        <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{order.orderNumber} · {order.customerName}</Text>
      </View>
      {isWebDesktop ? (
        <>
          {queueButton}
          {printButton}
        </>
      ) : null}
    </View>
  );

  // A toast at the top of the screen when the label has been added to the print queue.
  const queueToast = queueNotice ? (
    <Animated.View
      pointerEvents="none"
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(200)}
      style={{ position: 'absolute', top: Math.max(insets.top, 12) + 8, left: 16, right: 16, alignItems: 'center', zIndex: 100 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingLeft: 10, paddingRight: 18, borderRadius: 999, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.nudgeBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 10, ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 32px rgba(0,0,0,0.35)' } as object) : null) }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
          <Check size={15} color={FYLL_LIME_INK} strokeWidth={3} />
        </View>
        <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>Added to the print queue</Text>
      </View>
    </Animated.View>
  ) : null;

  if (isWebDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page }}>
        <SafeAreaView className="flex-1" edges={['top']}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: palette.hairline }}>{header}</View>
          <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
            <ScrollView style={{ width: 360, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: palette.hairline }} contentContainerStyle={{ padding: 24, gap: 20 }} showsVerticalScrollIndicator={false}>
              {shipToCard}
              {parcelCard}
              {itemsCard}
            </ScrollView>
            <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <LinearGradient
                pointerEvents="none"
                colors={palette.isDark ? ['rgba(111,125,18,0.18)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.22)', 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.7 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 24, gap: 14, alignItems: 'stretch' }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  {capLabel(`Preview · ${sizeText} (4 × 6 in)`)}
                  <Text style={{ color: palette.faint, fontSize: 13 }}>Parcel 1 of {parcels}</Text>
                </View>
                {previewBlock}
              </ScrollView>
            </View>
            <ScrollView style={{ width: 320, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: palette.hairline }} contentContainerStyle={{ padding: 24, gap: 22 }} showsVerticalScrollIndicator={false}>
              {sizeCard}
              {optionsCard}
              {printerCard}
              {readyCard}
            </ScrollView>
          </View>
        </SafeAreaView>
        {queueToast}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {header}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24, gap: 22 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            {capLabel(`Preview · ${sizeText}`)}
            {previewBlock}
          </View>
          {shipToCard}
          {parcelCard}
          {itemsCard}
          {sizeCard}
          {optionsCard}
          {printerCard}
          {readyCard}
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 12, backgroundColor: palette.page, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {queueButton}
            {printButton}
          </View>
        </View>
      </SafeAreaView>
      {queueToast}
    </View>
  );
}
