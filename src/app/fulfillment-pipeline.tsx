import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ChevronRight, Package, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import type { FulfillmentStageKey } from '@/components/FulfillmentPipelineCard';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getFulfillmentPipelineBucket, getFulfillmentSnapshot } from '@/lib/fulfillment';
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

const getTimelineMeta = (snapshot: ReturnType<typeof getFulfillmentSnapshot>) => {
  const dayCount = parseDayCount(snapshot.dayCountLabel);

  if (snapshot.stage === 'cancelled') {
    return {
      label: 'Cancelled',
      text: '#DC2626',
      bg: 'rgba(220,38,38,0.12)',
      dayLabel: null,
    };
  }

  if (snapshot.statusMeta.isLate) {
    return {
      label: snapshot.stage === 'completed' ? 'Delivered late' : 'Overdue',
      text: '#DC2626',
      bg: 'rgba(220,38,38,0.12)',
      dayLabel: dayCount ? `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}` : null,
    };
  }

  if (snapshot.stage === 'completed') {
    return {
      label: 'On time',
      text: '#16A34A',
      bg: 'rgba(34,197,94,0.12)',
      dayLabel: null,
    };
  }

  if (dayCount && dayCount.elapsedDays >= dayCount.timelineDays) {
    return {
      label: 'Due soon',
      text: '#D97706',
      bg: 'rgba(245,158,11,0.12)',
      dayLabel: `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}`,
    };
  }

  return {
    label: 'On track',
    text: '#2563EB',
    bg: 'rgba(37,99,235,0.12)',
    dayLabel: dayCount ? `Day ${dayCount.elapsedDays}/${dayCount.timelineDays}` : null,
  };
};

export default function FulfillmentPipelineScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { isMobile, isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const isDark = colors.bg.primary === '#111111';

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

  const filtered = useMemo(() => {
    return [...orders]
      .filter((o) => getFulfillmentPipelineBucket(o) === active)
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  }, [orders, active]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="px-5 pt-4 pb-3 flex-row items-center" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-11 h-11 rounded-2xl items-center justify-center mr-4 active:opacity-70"
            style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <View className="flex-1">
            <Text style={{ color: colors.text.primary }} className="text-2xl font-bold tracking-tight">
              Fulfillment
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm">
              Track orders by stage
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View className="px-5 pt-5">
          <View
            className="rounded-full p-1 flex-row"
            style={{
              backgroundColor: isMobile
                ? (isDark ? 'rgba(255,255,255,0.10)' : '#F3F4F6')
                : colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
            {STAGES.map((s) => {
              const isActive = s.key === active;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActive(s.key);
                  }}
                  className="flex-1 rounded-full items-center justify-center active:opacity-80"
                  style={{
                    height: 44,
                    backgroundColor: isActive
                      ? (isDark ? '#FFFFFF' : colors.bg.secondary)
                      : 'transparent',
                  }}
                >
                  <Text
                    className="text-xs font-bold tracking-wider"
                    style={{
                      color: isActive
                        ? (isDark ? '#111111' : colors.text.primary)
                        : colors.text.tertiary,
                    }}
                  >
                    {s.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* List */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View
              className="rounded-2xl p-6 items-center"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                No orders in {STAGES.find((s) => s.key === active)?.label ?? active}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1 text-center">
                When orders move into this stage, they’ll show up here automatically.
              </Text>
            </View>
          ) : (
            <View
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              {filtered.map((order, index) => {
                const key = getFulfillmentPipelineBucket(order) ?? active;
                const color = getOrderStatusColor(order.status, orderStatusColorMap, stageColor(key));
                const Icon = stageIcon(key);
                const age = formatAge(order.updatedAt ?? order.createdAt);
                const fulfillmentSnapshot = getFulfillmentSnapshot(order, new Date(), orderStatuses);
                const timelineMeta = getTimelineMeta(fulfillmentSnapshot);

                return (
                  <Pressable
                    key={order.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const orderRoute = isWebDesktop ? `/orders/${order.id}` : `/order/${order.id}`;
                      router.push(orderRoute as any);
                    }}
                    className="active:opacity-80"
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border.light,
                    }}
                  >
                    <View className="flex-row items-center">
                      <View
                        className="w-11 h-11 rounded-2xl items-center justify-center mr-4"
                        style={{ backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}35` }}
                      >
                        <Icon size={20} color={color} strokeWidth={2} />
                      </View>

                      <View className="flex-1">
                        <Text style={{ color: colors.text.primary }} className="text-sm font-bold" numberOfLines={1}>
                          {order.customerName}
                        </Text>
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                          #{order.orderNumber}
                        </Text>
                        <View className="flex-row items-center flex-wrap mt-2" style={{ gap: 8 }}>
                          <View
                            className="px-2.5 py-1 rounded-full"
                            style={{ backgroundColor: timelineMeta.bg }}
                          >
                            <Text style={{ color: timelineMeta.text }} className="text-[11px] font-semibold">
                              {timelineMeta.label}
                            </Text>
                          </View>
                          {timelineMeta.dayLabel ? (
                            <Text style={{ color: colors.text.muted }} className="text-[11px] font-medium">
                              {timelineMeta.dayLabel}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <View className="items-end ml-3">
                        <View className="flex-row items-center">
                          <View className="px-2.5 py-1 rounded-full mr-2" style={{ backgroundColor: `${color}15` }}>
                            <Text style={{ color }} className="text-xs font-semibold">
                              {order.status}
                            </Text>
                          </View>
                          <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} />
                        </View>
                        {age ? (
                          <Text style={{ color: colors.text.muted }} className="text-[11px] mt-1">
                            Updated {age.toLowerCase()}
                          </Text>
                        ) : null}
                      </View>
                    </View>
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
