import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { TrendingUp, TrendingDown, ShoppingCart } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { FigureCaption, FigureText, InsightSentence } from '@/components/stats/FigureText';
import { ordersSentence } from '@/lib/insights-sentences';
import { InsightsRangeTabs } from '@/components/stats/InsightsRangeTabs';
import { useInsightsBottomPad, useInsightsColors, useInsightsTopCardHeight } from '@/lib/insights-theme';

export default function OrdersInsightScreen({ inline }: { inline?: boolean }) {
  const bottomPad = useInsightsBottomPad();
  const topCardMinHeight = useInsightsTopCardHeight();
  const colors = useInsightsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'orders');
  const orders = useFyllStore((s) => s.orders);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Status breakdown rows
  const statusRows = analytics.statusBreakdown.map((item) => ({
    label: item.status,
    value: item.count,
    percentage: item.percentage,
    color: item.color,
  }));

  const categoryRows = analytics.ordersByCategory.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  // Top orders by value
  const topOrders = [...orders]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10)
    .map((order) => ({
      label: order.customerName,
      value: formatCurrency(order.totalAmount),
      subValue: new Date(order.orderDate ?? order.createdAt).toLocaleDateString(),
      percentage: undefined,
    }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Orders Analytics"
            subtitle="Order volume and status breakdown"
          />
        )}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
        >
          {/* Time Range Selector */}
          <InsightsRangeTabs options={timeRangeOptions} value={timeRange} onChange={setTimeRange} />

          {/* Main Orders Card */}
          <View
            className="rounded-[26px] p-5 mt-4"
            style={[colors.getCardStyle(), { minHeight: topCardMinHeight }]}
          >
            <View className="flex-row items-center mb-2">
              <ShoppingCart size={20} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm font-medium ml-2"
              >
                Total Orders
              </Text>
            </View>
            <FigureText desktop={36} mobile={20}
              style={{ color: colors.text.primary }}
              
            >
              {analytics.totalOrders}
            </FigureText>
            <View className="flex-row items-center mt-2">
              {analytics.kpiMetrics.orders.change >= 0 ? (
                <TrendingUp size={16} color={colors.success} strokeWidth={2.5} />
              ) : (
                <TrendingDown size={16} color={colors.danger} strokeWidth={2.5} />
              )}
              <FigureCaption desktop={14}
                style={{
                  color:
                    analytics.kpiMetrics.orders.change >= 0
                      ? colors.success
                      : colors.danger,
                }}
                className="font-medium ml-1"
              >
                {analytics.kpiMetrics.orders.change >= 0 ? '+' : ''}
                {analytics.kpiMetrics.orders.change.toFixed(1)}% vs last period
              </FigureCaption>
            </View>
            <InsightSentence parts={ordersSentence(analytics.totalOrders, analytics.completedOrders, analytics.processingOrders, analytics.refundsCount)} />
          </View>

          {/* KPI Row */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-[26px] p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Completed
              </Text>
              <Text
                style={{ color: colors.success }}
                className="text-xl font-bold"
              >
                {analytics.completedOrders}
              </Text>
            </View>

            <View
              className="flex-1 rounded-[26px] p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Processing
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {analytics.processingOrders}
              </Text>
            </View>

            <View
              className="flex-1 rounded-[26px] p-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-xs font-medium mb-1"
              >
                Refunded
              </Text>
              <Text
                style={{ color: analytics.refundsCount > 0 ? colors.danger : colors.text.primary }}
                className="text-xl font-bold"
              >
                {analytics.refundsCount}
              </Text>
            </View>
          </View>

          {/* Orders Chart */}
          <View
            className="rounded-[26px] p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <Text
              style={{ color: colors.text.primary }}
              className={` font-bold mb-4`}
            >
              Orders Over Time
            </Text>
            <SalesBarChart
              data={analytics.ordersByPeriod}
              height={220}
              barColor={colors.bar}
              gridColor={colors.barBg}
              textColor={colors.text.tertiary}
            />
          </View>

          {/* Status Breakdown */}
          <View className="mt-4">
            <BreakdownTable
              title="Fulfillment Status"
              data={statusRows}
              columns={{
                label: 'Status',
                value: 'Count',
                percentage: 'Share',
              }}
              emptyMessage="No orders yet"
            />
          </View>

          <View className="mt-4">
            <BreakdownTable
              title="Orders by Category"
              data={categoryRows}
              columns={{
                label: 'Category',
                value: 'Count',
                percentage: 'Share',
              }}
              emptyMessage="No category data yet"
            />
          </View>

          {/* Top Orders */}
          <View className="mt-4">
            <BreakdownTable
              title="Top Orders by Value"
              data={topOrders}
              columns={{
                label: 'Customer',
                value: 'Amount',
              }}
              showIndex={true}
              emptyMessage="No orders yet"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
