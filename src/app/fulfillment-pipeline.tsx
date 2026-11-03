import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight, Package, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore from '@/lib/state/fyll-store';
import type { FulfillmentStageKey } from '@/components/FulfillmentPipelineCard';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getFulfillmentPipelineBucket, getFulfillmentSnapshot } from '@/lib/fulfillment';
import { BackButton, FYLL_LIME, FYLL_LIME_INK, InitialsAvatar, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import type { PaymentsPalette } from '@/components/payments/payments-ui';
import { createOrderStatusColorMap, getOrderStatusColor } from '@/lib/order-status-colors';

const STAGES: { key: FulfillmentStageKey; label: string }[] = [
  { key: 'processing', label: 'Processing' },
  { key: 'dispatch', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
];

const stageIcon = (key: FulfillmentStageKey) => {
  switch (key) {
    case 'processing':
      return Package;
    case 'dispatch':
      return Truck;
    case 'delivered':
      return CheckCircle2;
  }
};

const stageColor = (key: FulfillmentStageKey) => {
  switch (key) {
    case 'processing':
      return '#3B82F6';
    case 'dispatch':
      return '#F59E0B';
    case 'delivered':
      return '#22C55E';
  }
};

const formatAge = (iso: string) => {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${Math.max(1, minutes)}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
};

const parseDayCount = (label?: string) => {
  if (!label) return null;
  const match = label.match(/Day\s+(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const elapsedDays = Number.parseInt(match[1] ?? '', 10);
  const timelineDays = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(elapsedDays) || !Number.isFinite(timelineDays)) return null;
  return { elapsedDays, timelineDays };
};

// Chip colours follow the app's tones: lime when things are fine, amber when due, red when late.
const getTimelineMeta = (snapshot: ReturnType<typeof getFulfillmentSnapshot>, palette: PaymentsPalette) => {
  const dayCount = parseDayCount(snapshot.dayCountLabel);
  const dayLabel = dayCount ? `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}` : null;
  const danger = { text: palette.danger, bg: palette.dangerBg };
  const warn = { text: palette.warn, bg: palette.warnBg };
  const good = { text: palette.limeOnSurface, bg: palette.nudgeBg };

  if (snapshot.stage === 'cancelled') return { label: 'Cancelled', ...danger, dayLabel: null };
  if (snapshot.statusMeta.isLate) return { label: snapshot.stage === 'completed' ? 'Delivered late' : 'Overdue', ...danger, dayLabel };
  if (snapshot.stage === 'completed') return { label: 'On time', ...good, dayLabel: null };
  if (dayCount && dayCount.elapsedDays >= dayCount.timelineDays) return { label: 'Due soon', ...warn, dayLabel };
  return { label: 'On track', ...good, dayLabel };
};

export default function FulfillmentPipelineScreen() {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { isMobile, isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;

  const [active, setActive] = useState<FulfillmentStageKey>(() => {
    if (tab === 'processing' || tab === 'dispatch' || tab === 'delivered') return tab;
    if (tab === 'pending') return 'dispatch';
    return 'processing';
  });

  const orders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const orderStatusColorMap = useMemo(
    () => createOrderStatusColorMap(orderStatuses),
    [orderStatuses]
  );

  const counts = useMemo(() => {
    const result: Record<FulfillmentStageKey, number> = { processing: 0, dispatch: 0, delivered: 0 };
    for (const order of orders) {
      const bucket = getFulfillmentPipelineBucket(order);
      if (bucket && bucket in result) result[bucket as FulfillmentStageKey] += 1;
    }
    return result;
  }, [orders]);

  const filtered = useMemo(() => {
    return [...orders]
      .filter((o) => getFulfillmentPipelineBucket(o) === active)
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  }, [orders, active]);

  const primarySize = isMobile ? 12 : 14;
  const secondarySize = isMobile ? 10 : 12;
  const activeLabel = STAGES.find((stage) => stage.key === active)?.label ?? active;

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: isDesktop ? 40 : 16, paddingTop: isDesktop ? 32 : 14, paddingBottom: 40, gap: isDesktop ? 22 : 16, width: '100%', maxWidth: isDesktop ? 1000 : undefined, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton
              palette={palette}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <MoneyText style={{ color: palette.text, fontSize: isDesktop ? 28 : 22, letterSpacing: -0.6 }}>Fulfillment</MoneyText>
              <Text style={{ color: palette.faint, fontSize: secondarySize }}>Track orders by stage</Text>
            </View>
          </View>

          <View
            accessibilityRole="tablist"
            style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border, maxWidth: isDesktop ? 520 : undefined }}
          >
            {STAGES.map((stage) => {
              const selected = stage.key === active;
              return (
                <Pressable
                  key={stage.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActive(stage.key);
                  }}
                  style={(state) => ({
                    flex: 1,
                    height: 36,
                    borderRadius: 999,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: selected ? FYLL_LIME : isHovered(state) ? palette.softFill : 'transparent',
                  })}
                >
                  <Text style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: 12, fontWeight: '600' }}>{stage.label}</Text>
                  <Text style={{ color: selected ? 'rgba(30,30,30,0.6)' : palette.faint, fontSize: 12, fontWeight: '600' }}>{counts[stage.key]}</Text>
                </Pressable>
              );
            })}
          </View>

          {filtered.length === 0 ? (
            <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 28, alignItems: 'center', gap: 6 }}>
              <Text style={{ color: palette.text, fontSize: primarySize + 2, fontWeight: '600' }}>No orders in {activeLabel}</Text>
              <Text style={{ color: palette.faint, fontSize: secondarySize + 1, textAlign: 'center' }}>
                When orders move into this stage, they will show up here automatically.
              </Text>
            </View>
          ) : (
            <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
              {filtered.map((order, index) => {
                const key = getFulfillmentPipelineBucket(order) ?? active;
                const color = getOrderStatusColor(order.status, orderStatusColorMap, stageColor(key));
                const age = formatAge(order.updatedAt ?? order.createdAt);
                const snapshot = getFulfillmentSnapshot(order, new Date(), orderStatuses);
                const timeline = getTimelineMeta(snapshot, palette);

                return (
                  <Pressable
                    key={order.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push((isWebDesktop ? `/orders/${order.id}` : `/order/${order.id}`) as any);
                    }}
                    style={(state) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: isMobile ? 14 : 18,
                      paddingVertical: 14,
                      backgroundColor: isHovered(state) || state.pressed ? palette.cardHover : 'transparent',
                      borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                      borderBottomColor: palette.hairline,
                    })}
                  >
                    <InitialsAvatar name={order.customerName} palette={palette} size={isMobile ? 38 : 42} />
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <View style={{ gap: 2 }}>
                        <Text style={{ color: palette.text, fontSize: primarySize, fontWeight: '600' }} numberOfLines={1}>{order.customerName}</Text>
                        <Text style={{ color: palette.faint, fontSize: secondarySize }} numberOfLines={1}>
                          #{order.orderNumber}{age ? ` \u00b7 Updated ${age.toLowerCase()}` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: `${color}22` }}>
                          <Text style={{ color, fontSize: secondarySize, fontWeight: '600' }} numberOfLines={1}>{order.status}</Text>
                        </View>
                        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: timeline.bg }}>
                          <Text style={{ color: timeline.text, fontSize: secondarySize, fontWeight: '600' }}>{timeline.label}</Text>
                        </View>
                        {timeline.dayLabel ? <Text style={{ color: palette.faint, fontSize: secondarySize }}>{timeline.dayLabel}</Text> : null}
                      </View>
                    </View>
                    <ChevronRight size={18} color={palette.faint} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
