import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function SalesInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'sales');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Format sales data for table
  const salesByPeriodRows = analytics.salesByPeriod.map((item) => ({
    label: item.label,
    value: formatCurrency(item.value),
    percentage: undefined,
  }));

  // Revenue by source rows
  const revenueSourceRows = analytics.revenueBySource.map((item) => ({
    label: item.label,
    value: formatCurrency(item.value),
    percentage: item.percentage,
  }));

  const revenueCategoryRows = analytics.revenueByCategory.map((item) => ({
    label: item.label,
    value: formatCurrency(item.value),
    percentage: item.percentage,
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Sales Analytics"
            subtitle="Revenue breakdown and trends"
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

          {/* Main Revenue Card */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <Text
              style={{ color: colors.text.tertiary }}
              className="text-sm font-medium mb-2"
            >
              Total Revenue
            </Text>
            <Text
              style={{ color: colors.text.primary }}
              className="text-4xl font-bold"
            >
              {formatCurrency(analytics.totalSales)}
            </Text>
            <View className="flex-row items-center mt-2">
              {analytics.salesChange >= 0 ? (
                <TrendingUp size={16} color={colors.success} strokeWidth={2.5} />
              ) : (
                <TrendingDown size={16} color={colors.danger} strokeWidth={2.5} />
              )}
              <Text
                style={{
                  color: analytics.salesChange >= 0 ? colors.success : colors.danger,
                }}
                className="text-sm font-medium ml-1"
              >
                {analytics.salesChange >= 0 ? '+' : ''}
                {analytics.salesChange.toFixed(1)}% vs last period
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
                Net Revenue
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {formatCurrency(analytics.netRevenue)}
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
                Avg Order Value
              </Text>
              <Text
                style={{ color: colors.text.primary }}
                className="text-xl font-bold"
              >
                {formatCurrency(analytics.averageOrderValue)}
              </Text>
            </View>
          </View>

          {/* Sales Chart */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <Text
              style={{ color: colors.text.primary }}
              className={` font-bold mb-4`}
            >
              Revenue Over Time
            </Text>
            <SalesBarChart
              data={analytics.salesByPeriod}
              height={220}
              barColor={colors.bar}
              gridColor={colors.barBg}
              textColor={colors.text.tertiary}
            />
          </View>

          {/* Revenue by Period Table */}
          <View className="mt-4">
            <BreakdownTable
              title="Revenue Breakdown"
              data={salesByPeriodRows}
              columns={{
                label: 'Period',
                value: 'Revenue',
              }}
              emptyMessage="No sales data available"
            />
          </View>

          {/* Revenue by Source */}
          {revenueCategoryRows.length > 0 && (
            <View className="mt-4">
              <BreakdownTable
                title="Revenue by Order Category"
                data={revenueCategoryRows}
                columns={{
                  label: 'Category',
                  value: 'Revenue',
                  percentage: 'Share',
                }}
                emptyMessage="No category data available"
              />
            </View>
          )}

          {/* Revenue by Source */}
          {revenueSourceRows.length > 0 && (
            <View className="mt-4">
              <BreakdownTable
                title="Revenue by Source"
                data={revenueSourceRows}
                columns={{
                  label: 'Source',
                  value: 'Revenue',
                  percentage: 'Share',
                }}
                emptyMessage="No source data available"
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
