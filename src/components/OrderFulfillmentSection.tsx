import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle2, Copy, Edit2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Order } from '@/lib/state/fyll-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getFulfillmentSnapshot, resolveOrderTimeline } from '@/lib/fulfillment';
import { buildCustomerTrackingHostUrl } from '@/lib/tracking-url';
import { sortOrderStatusesForFulfillment } from '@/lib/order-status';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';

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
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const [copied, setCopied] = useState<boolean>(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { businessName, businessSlug } = useBusinessSettings();
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const snapshot = getFulfillmentSnapshot(order, new Date(), orderStatuses);
  const activeStage = snapshot.stage;
  const steps = useMemo(
    () => sortOrderStatusesForFulfillment(orderStatuses).filter((status) => !/cancel/i.test(status.name)),
    [orderStatuses]
  );
  const isCancelled = activeStage === 'cancelled';
  const stepIndex = steps.findIndex((status) => status.name === order.status);
  const nextStep = stepIndex >= 0 ? steps[stepIndex + 1] : undefined;
  const fillPercent = isCancelled || stepIndex < 0 || steps.length === 0
    ? 0
    : stepIndex >= steps.length - 1
      ? 100
      : ((stepIndex + 0.5) / steps.length) * 100;
  const stepLabel = isCancelled
    ? 'Tracking stopped'
    : stepIndex < 0
      ? 'Not started'
      : `Step ${stepIndex + 1} of ${steps.length}`;
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
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const lbl = { color: palette.muted, fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const value = { color: palette.text, fontSize: isMobile ? 12 : 15, fontWeight: '600' as const };
  const chipInk = timelineChip.text;

  return (
    <View style={{ gap: 18 }}>
      {title ? (
        <Text style={{ color: palette.text, fontSize: isMobile ? 14 : 16, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: palette.text, fontSize: isMobile ? 12 : 15, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{order.status || snapshot.statusMeta.label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <Text style={{ color: palette.faint, fontSize: isMobile ? 12 : 13 }} numberOfLines={1}>
              {stepLabel}{nextStep && !isMobile ? ` · next: ${nextStep.name}` : ''}
            </Text>
            {editable ? (
              <Pressable
                onPress={onEditFulfillment}
                accessibilityLabel="Edit fulfillment"
                className="active:opacity-70"
                style={{ height: 30, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
              >
                <Edit2 size={13} color={palette.text} strokeWidth={2} />
                <Text style={{ color: palette.text, fontSize: isMobile ? 12 : 13, fontWeight: '600' }}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={{ height: 10, borderRadius: 999, backgroundColor: palette.softFill, overflow: 'hidden' }}>
          <LinearGradient
            colors={['#4A5410', '#8F9A26', FYLL_LIME]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fillPercent}%`, borderRadius: 999 }}
          />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
            {steps.map((status, index) => (
              <View key={status.id} style={{ flex: 1, borderRightWidth: index < steps.length - 1 ? 2 : 0, borderRightColor: palette.card }} />
            ))}
          </View>
        </View>
        {!isMobile && steps.length > 0 ? (
          <View style={{ flexDirection: 'row' }}>
            {steps.map((status, index) => {
              const reached = !isCancelled && stepIndex >= 0 && index <= stepIndex;
              return (
                <Text
                  key={status.id}
                  numberOfLines={1}
                  style={{ flex: 1, paddingRight: 6, fontSize: 12.5, fontWeight: index === stepIndex ? '600' : '500', color: reached ? palette.text : palette.faint }}
                >
                  {status.name}
                </Text>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 18 : 36, paddingTop: 16, borderTopWidth: 1, borderTopColor: palette.hairline }}>
        <View style={{ gap: 3 }}>
          <Text style={lbl}>Delivery</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={value}>{snapshot.dayCountLabel.replace(' / ', ' of ')}</Text>
            <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: timelineChip.bg, justifyContent: 'center' }}>
              <Text style={{ color: chipInk, fontSize: 12, fontWeight: '600' }}>{timelineChip.label}</Text>
            </View>
          </View>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={lbl}>ETA</Text>
          <Text style={value}>{snapshot.effectiveEtaLabel}</Text>
        </View>
        <View style={{ gap: 3, flexShrink: 1 }}>
          <Text style={lbl}>Type</Text>
          <Text style={value} numberOfLines={1}>{resolvedTimeline.orderType.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingLeft: 14, paddingRight: 6, borderRadius: 12, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border, ...(isMobile ? { width: '100%' as const } : { minWidth: 320, maxWidth: 400, marginLeft: 'auto' as const }) }}>
          <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 13 }}>Tracking</Text>
          <Text style={{ color: palette.text, fontSize: isMobile ? 12 : 14, fontWeight: '600', letterSpacing: 0.3, flexShrink: 1 }} numberOfLines={1}>{snapshot.trackingCode}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              void handleCopy();
            }}
            accessibilityLabel="Copy tracking info"
            style={{ height: 30, paddingHorizontal: 10, borderRadius: 8, backgroundColor: copied ? FYLL_LIME : palette.softFill, flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Copy size={14} color={copied ? FYLL_LIME_INK : palette.text} strokeWidth={2} />
            <Text style={{ color: copied ? FYLL_LIME_INK : palette.text, fontSize: 12.5, fontWeight: '600' }}>{copied ? 'Copied' : 'Copy link'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ color: palette.faint, fontSize: 12, marginTop: -6 }}>
        {timelineMeasureLabel} · {timelineBreakdownLabel} {snapshot.customerLookupLabel}.
      </Text>

      {activeStage === 'completed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <CheckCircle2 size={15} color={palette.limeOnSurface} strokeWidth={2.2} />
          <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            Fulfillment finished.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
