import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { useAnalytics } from '@/hooks/useAnalytics';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange, getDateRange, getRefundedAmount, getRefundDate, filterOrdersByRefundDateRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function RefundsInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'orders');
  const orders = useFyllStore((s) => s.orders);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Get refunded orders in range
  // Get refunded orders in range (by REFUND DATE, not order date)
  const { start, end } = getDateRange(timeRange);
  const refundedOrders = filterOrdersByRefundDateRange(orders, start, end);

  // Format refunded orders for table
  const refundRows = refundedOrders.map((order) => {
    const refundAmount = getRefundedAmount(order);
    const isPartial = refundAmount < order.totalAmount;
    const refundDate = getRefundDate(order);
    return {
      label: order.customerName,
      value: formatCurrency(refundAmount),
      subValue: `${isPartial ? 'Partial' : 'Full'} · ${refundDate?.toLocaleDateString()}`,
      percentage: undefined,
    };
  });

  // Calculate refund rate
  const refundRate =
    analytics.totalOrders > 0
      ? ((analytics.refundsCount / (analytics.totalOrders + analytics.refundsCount)) * 100).toFixed(1)
      : '0.0';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Refunds Analytics"
            subtitle="Refund breakdown and trends"
          />
        )}

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

          {/* Main Refunds Card */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-2">
              <RefreshCw size={20} color={colors.danger} strokeWidth={2} />
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm font-medium ml-2"
              >
                Total Refunds
              </Text>
            </View>
            <Text
              style={{ color: colors.danger }}
              className="text-4xl font-bold"
            >
              {formatCurrency(analytics.refundsAmount)}
            </Text>
            <View className="flex-row items-center mt-2">
              {analytics.kpiMetrics.refunds.change <= 0 ? (
                <TrendingDown size={16} color={colors.success} strokeWidth={2.5} />
              ) : (
                <TrendingUp size={16} color={colors.danger} strokeWidth={2.5} />
              )}
              <Text
                style={{
                  color:
                    analytics.kpiMetrics.refunds.change <= 0
                      ? colors.success
                      : colors.danger,
                }}
                className="text-sm font-medium ml-1"
              >
                {analytics.kpiMetrics.refunds.change >= 0 ? '+' : ''}
                {analytics.kpiMetrics.refunds.change.toFixed(1)}% vs last period
              </Text>
            </View>
          </View>

          {/* KPI Row */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Refund Count
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {analytics.refundsCount}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Refund Rate
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {refundRate}%
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Avg Refund
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {analytics.refundsCount > 0
                  ? formatCurrency(analytics.refundsAmount / analytics.refundsCount)
                  : formatCurrency(0)}
              </Text>
            </View>
          </View>

          {/* Net Revenue Impact */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <Text
              style={{ color: colors.text.primary }}
              className={` font-bold mb-4`}
            >
              Revenue Impact
            </Text>
            <View className="flex-row items-center justify-between py-3">
              <Text style={{ color: colors.text.secondary }} className="text-sm">
                Gross Revenue
              </Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                {formatCurrency(analytics.totalSales)}
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between py-3"
              style={{ borderTopWidth: 1, borderTopColor: colors.barBg }}
            >
              <Text style={{ color: colors.danger }} className="text-sm">
                Refunds
              </Text>
              <Text style={{ color: colors.danger }} className="text-sm font-semibold">
                -{formatCurrency(analytics.refundsAmount)}
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between py-3"
              style={{ borderTopWidth: 1, borderTopColor: colors.barBg }}
            >
              <Text style={{ color: colors.success }} className="text-sm font-semibold">
                Net Revenue
              </Text>
              <Text style={{ color: colors.success }} className="text-sm font-bold">
                {formatCurrency(analytics.netRevenue)}
              </Text>
            </View>
          </View>

          {/* Refunded Orders */}
          <View className="mt-4">
            <BreakdownTable
              title="Refunded Orders"
              data={refundRows}
              columns={{
                label: 'Customer',
                value: 'Refund Amount',
              }}
              showIndex={true}
              emptyMessage="No refunds in this period"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
