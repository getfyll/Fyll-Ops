import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle2, Copy, Edit2 } from 'lucide-react-native';
import type { Order } from '@/lib/state/fyll-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getFulfillmentSnapshot, resolveOrderTimeline } from '@/lib/fulfillment';
import { buildCustomerTrackingHostUrl } from '@/lib/tracking-url';

interface OrderFulfillmentSectionProps {
  order: Order;
  title?: string;
  editable?: boolean;
  onCopied?: () => void;
  dense?: boolean;
  onEditFulfillment?: () => void;
}

export function OrderFulfillmentSection({
  order,
  title,
  editable = true,
  onCopied,
  dense = false,
  onEditFulfillment,
}: OrderFulfillmentSectionProps) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const { businessName, businessSlug } = useBusinessSettings();
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const snapshot = getFulfillmentSnapshot(order, new Date(), orderStatuses);
  const activeStage = snapshot.stage;
  const resolvedTimeline = useMemo(
    () => resolveOrderTimeline(
      {
        orderTypeId: order.orderTypeId,
        orderTypeName: order.orderTypeName,
        deliveryState: order.deliveryState,
      },
      orderTimelineSettings
    ),
    [order.deliveryState, order.orderTypeId, order.orderTypeName, orderTimelineSettings]
  );
  const timelineChip = useMemo(() => {
    if (snapshot.statusMeta.label.toLowerCase().includes('cancel')) {
      return { label: 'Cancelled', bg: 'rgba(220,38,38,0.14)', text: '#DC2626' };
    }
    if (snapshot.statusMeta.isLate) {
      return { label: activeStage === 'completed' ? 'Exceeded timeline' : 'Overdue', bg: 'rgba(220,38,38,0.14)', text: '#DC2626' };
    }
    if (activeStage === 'completed') {
      return { label: 'On time', bg: 'rgba(34,197,94,0.14)', text: '#16A34A' };
    }
    if (snapshot.dayCountLabel) {
      const [elapsedPart = '0', totalPart = '0'] = snapshot.dayCountLabel
        .replace('Day', '')
        .split('/')
        .map((part) => part.trim());
      const elapsed = Number.parseInt(elapsedPart, 10);
      const total = Number.parseInt(totalPart, 10);
      if (Number.isFinite(elapsed) && Number.isFinite(total) && elapsed > total) {
        return { label: 'Overdue', bg: 'rgba(220,38,38,0.14)', text: '#DC2626' };
      }
    }
    return { label: 'On time', bg: 'rgba(37,99,235,0.14)', text: '#2563EB' };
  }, [activeStage, snapshot.dayCountLabel, snapshot.statusMeta.isLate, snapshot.statusMeta.label]);
  const timelineMeasureLabel = `${snapshot.dayCountLabel.replace('Day ', '')} total business days`;
  const timelineBreakdownLabel = resolvedTimeline.shippingZone
    ? `Includes ${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing business days and ${resolvedTimeline.shippingZone.minBusinessDays}-${resolvedTimeline.shippingZone.maxBusinessDays} delivery business days.`
    : `${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing business days.`;

  const metrics = [
    { label: 'Order Type', value: resolvedTimeline.orderType.name },
    { label: 'Started', value: snapshot.startedLabel },
    { label: 'Day Count', value: snapshot.dayCountLabel },
    { label: 'Effective ETA', value: snapshot.effectiveEtaLabel },
  ];

  const handleCopy = async () => {
    const customerLookupCode = snapshot.trackingCode || order.websiteOrderReference?.trim() || order.orderNumber;
    const trackingUrl = buildCustomerTrackingHostUrl({
      businessName,
      businessSlug,
      trackingCode: customerLookupCode,
      email: order.customerEmail,
    });
    await Clipboard.setStringAsync(
      [
        `Order: ${order.orderNumber}`,
        order.websiteOrderReference?.trim() ? `Website order ID: ${order.websiteOrderReference.trim()}` : null,
        `Tracking code: ${snapshot.trackingCode}`,
        order.customerEmail?.trim() ? `Lookup email: ${order.customerEmail.trim()}` : null,
        trackingUrl ? `Track here: ${trackingUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
    onCopied?.();
  };

  return (
    <View style={{ gap: dense ? 10 : 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          alignSelf: 'stretch',
          width: '100%',
        }}
      >
        {title ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, flex: 1, textTransform: 'uppercase' }} numberOfLines={1}>
            {title}
          </Text>
        ) : <View style={{ flex: 1 }} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: timelineChip.bg,
            }}
          >
            <Text style={{ color: timelineChip.text, fontSize: 12, fontWeight: '600' }}>
              {timelineChip.label}
            </Text>
          </View>
          {editable ? (
            <Pressable
              onPress={onEditFulfillment}
              style={{
                minHeight: 34,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Edit2 size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', marginLeft: 6 }}>
                Edit
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginTop: -4 }}>
        {timelineMeasureLabel}
      </Text>
      <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '400', marginTop: -6 }}>
        {timelineBreakdownLabel}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 12 }}>
        {metrics.map((metric) => (
          <View
            key={metric.label}
            style={{
              flex: isMobile ? undefined : 1,
              width: isMobile ? '47.5%' : undefined,
              minWidth: 0,
              borderRadius: 10,
              paddingHorizontal: 15,
              paddingVertical: dense ? 12 : 14,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
            <Text
              style={{
                color: colors.text.tertiary,
                fontSize: 10,
                fontWeight: '500',
                textTransform: 'uppercase',
              }}
            >
              {metric.label}
            </Text>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: '500',
                marginTop: 7,
              }}
            >
              {metric.value}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.card,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
            Customer tracking
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 4 }}>
            Code: {snapshot.trackingCode}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
            {snapshot.customerLookupLabel}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void handleCopy();
          }}
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
            alignSelf: isMobile ? 'stretch' : 'auto',
          }}
        >
          <Copy size={16} color={colors.bg.primary} strokeWidth={2} />
          <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            Copy tracking info
          </Text>
        </Pressable>
      </View>

      {activeStage === 'completed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <CheckCircle2 size={15} color={snapshot.statusMeta.text} strokeWidth={2.2} />
          <Text style={{ color: snapshot.statusMeta.text, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            Fulfillment finished.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
