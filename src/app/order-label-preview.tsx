import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ListPlus, Printer, Check } from 'lucide-react-native';
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
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

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
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const [isPrinting, setIsPrinting] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [queueNotice, setQueueNotice] = useState(false);
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

  const handlePrint = async () => {
    if (!labelData || isPrinting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrinting(true);
    await printOrderLabel(labelData, labelSize.size, { isDesktop });
    setIsPrinting(false);
  };

  const handleAddToQueue = async () => {
    if (!order || !labelData || isQueueing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsQueueing(true);
    const item = createShippingPrintQueueItem({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      destination: order.deliveryState || order.deliveryAddress || '',
      carrierName: carrierNameOverride || order.logistics?.carrierName || 'Shipping',
      labelData,
    });
    await addFyllPrintQueueItem(item, businessId);
    setIsQueueing(false);
    setQueueNotice(true);
    setTimeout(() => setQueueNotice(false), 2500);
  };

  if (!order) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.tertiary }} className="text-sm font-semibold">
          Order not found
        </Text>
        <Pressable onPress={() => router.back()} className="mt-3">
          <Text style={{ color: colors.accent.primary }} className="text-sm font-semibold">
            Go back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <SafeAreaView
        className="flex-1"
        edges={['top']}
        style={{
          alignItems: 'center',
          paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
          paddingVertical: Platform.OS === 'web' ? 20 : 0,
        }}
      >
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 600,
            backgroundColor: colors.bg.primary,
            borderRadius: Platform.OS === 'web' ? 22 : 0,
            borderWidth: Platform.OS === 'web' ? 1 : 0,
            borderColor: colors.border.light,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
              backgroundColor: colors.bg.secondary,
            }}
          >
            <Pressable onPress={() => router.back()} className="mr-4 active:opacity-50">
              <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <View className="flex-1">
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">
                Shipping Label
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase tracking-wider">
                {labelSize.label}
              </Text>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 28, paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' }}
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center">
              {labelData && !isLoading ? (
                <OrderLabel80x90Preview
                  data={labelData}
                  widthMm={labelSize.size.widthMm}
                  heightMm={labelSize.size.heightMm}
                />
              ) : (
                <View
                  className="rounded-2xl p-6"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <ActivityIndicator color={colors.accent.primary} size="small" />
                </View>
              )}
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 32,
              paddingTop: 14,
              backgroundColor: colors.bg.primary,
              borderTopWidth: 1,
              borderTopColor: colors.border.light,
            }}
          >
            {queueNotice ? (
              <View className="flex-row items-center justify-center mb-3">
                <Check size={14} color="#16A34A" strokeWidth={2.5} />
                <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                  Added to FYLL Print queue
                </Text>
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleAddToQueue}
                disabled={!labelData || isQueueing}
                className="flex-1 rounded-full items-center justify-center flex-row active:opacity-80"
                style={{ height: 56, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, opacity: labelData ? 1 : 0.55 }}
              >
                {isQueueing ? (
                  <ActivityIndicator color={colors.text.primary} size="small" />
                ) : (
                  <>
                    <ListPlus size={18} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold ml-2">
                      Send to Queue
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={handlePrint}
                disabled={isPrinting || !labelData}
                className="flex-1 rounded-full items-center justify-center flex-row active:opacity-80"
                style={{ height: 56, backgroundColor: isDark ? '#FFFFFF' : '#111111', opacity: isPrinting ? 0.7 : 1 }}
              >
                {isPrinting ? (
                  <ActivityIndicator color={isDark ? '#111111' : '#FFFFFF'} />
                ) : (
                  <>
                    <Printer size={18} color={isDark ? '#111111' : '#FFFFFF'} strokeWidth={2} />
                    <Text
                      className="font-semibold text-sm ml-2"
                      style={{ color: isDark ? '#111111' : '#FFFFFF' }}
                    >
                      {Platform.OS === 'web' && !isDesktop ? 'Download PDF' : 'Print Now'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
