import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Truck, CheckCircle, Clock } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function LogisticsInsightScreen() {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'orders');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Logistics breakdown rows
  const logisticsRows = analytics.logisticsBreakdown.map((item) => ({
    label: item.label,
    value: `${item.ordersShipped} shipped`,
    subValue: `${item.onTimeRate}% delivery rate`,
    percentage: item.onTimeRate,
    color:
      item.onTimeRate >= 90
        ? colors.success
        : item.onTimeRate >= 70
        ? colors.warning
        : colors.danger,
  }));

  // Calculate totals
  const totalShipped = analytics.logisticsBreakdown.reduce(
    (sum, item) => sum + item.ordersShipped,
    0
  );
  const avgDeliveryRate =
    analytics.logisticsBreakdown.length > 0
      ? (
          analytics.logisticsBreakdown.reduce((sum, item) => sum + item.onTimeRate, 0) /
          analytics.logisticsBreakdown.length
        ).toFixed(0)
      : '0';

  // Top carrier
  const topCarrier = analytics.logisticsBreakdown[0];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <DetailHeader
          title="Logistics Analytics"
          subtitle="Shipping carrier performance"
        />

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* Time Range Selector */}
          <View className="flex-row mt-4">
            {timeRangeOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setTimeRange(option.key)}
                className="mr-2 px-4 py-2 rounded-full"
                style={{
                  backgroundColor:
                    timeRange === option.key ? colors.bar : colors.bg.input,
                }}
              >
                <Text
                  style={{
                    color:
                      timeRange === option.key
                        ? colors.bg.screen
                        : colors.text.tertiary,
                  }}
                  className="text-sm font-semibold"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Top Carrier Card */}
          {topCarrier && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Truck size={20} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm font-medium ml-2"
                >
                  Top Carrier
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-3xl font-bold"
              >
                {topCarrier.label}
              </Text>
              <View className="flex-row items-center mt-2">
                <Text
                  style={{ color: colors.text.secondary }}
                  className="text-base"
                >
                  {topCarrier.ordersShipped} orders shipped
                </Text>
                <View
                  className="ml-3 px-2 py-0.5 rounded"
                  style={{
                    backgroundColor:
                      topCarrier.onTimeRate >= 90
                        ? colors.success + '20'
                        : colors.warning + '20',
                  }}
                >
                  <Text
                    style={{
                      color:
                        topCarrier.onTimeRate >= 90 ? colors.success : colors.warning,
                    }}
                    className="text-sm font-medium"
                  >
                    {topCarrier.onTimeRate}% delivered
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* KPI Row */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Truck size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Total Shipped
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {totalShipped}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <CheckCircle size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Avg Delivery Rate
                </Text>
              </View>
              <Text
                style={{
                  color:
                    Number(avgDeliveryRate) >= 90 ? colors.success : colors.text.primary,
                }}
                className="text-2xl font-bold"
              >
                {avgDeliveryRate}%
              </Text>
            </View>
          </View>

          {/* Processing Orders */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-4">
              <Clock size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.primary }}
                className="text-base font-bold ml-2"
              >
                Order Status
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3">
              <Text style={{ color: colors.text.secondary }} className="text-sm">
                Processing
              </Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                {analytics.processingOrders}
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between py-3"
              style={{ borderTopWidth: 1, borderTopColor: colors.barBg }}
            >
              <Text style={{ color: colors.text.secondary }} className="text-sm">
                Delivered
              </Text>
              <Text style={{ color: colors.success }} className="text-sm font-semibold">
                {analytics.deliveredOrders}
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between py-3"
              style={{ borderTopWidth: 1, borderTopColor: colors.barBg }}
            >
              <Text style={{ color: colors.text.secondary }} className="text-sm">
                Total Orders
              </Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-bold">
                {analytics.totalOrders}
              </Text>
            </View>
          </View>

          {/* Carrier Performance Table */}
          <View className="mt-4">
            <BreakdownTable
              title="Carrier Performance"
              data={logisticsRows}
              columns={{
                label: 'Carrier',
                value: 'Orders',
                percentage: 'Rate',
              }}
              emptyMessage="No logistics data available"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
