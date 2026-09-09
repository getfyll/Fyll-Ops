import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Smartphone } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function PlatformsInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'sales');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Platform breakdown rows (orders)
  const platformOrderRows = analytics.platformBreakdown.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  // Revenue by source rows
  const revenueSourceRows = analytics.revenueBySource.map((item) => ({
    label: item.label,
    value: formatCurrency(item.value),
    percentage: item.percentage,
  }));

  // Customer platform rows
  const customerPlatformRows = analytics.customersByPlatform.map((item) => ({
    label: item.label,
    value: item.value,
    subValue: `${item.percentage}% of customers`,
    percentage: item.percentage,
  }));

  // Top platform
  const topPlatform = analytics.platformBreakdown[0];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Platform Analytics"
            subtitle="Sales channel breakdown"
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

          {/* Top Platform Card */}
          {topPlatform && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Smartphone size={20} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm font-medium ml-2"
                >
                  Top Platform
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-3xl font-bold"
              >
                {topPlatform.label}
              </Text>
              <Text
                style={{ color: colors.success }}
                className="text-lg font-semibold mt-1"
              >
                {topPlatform.value} orders ({topPlatform.percentage}%)
              </Text>
            </View>
          )}

          {/* Revenue by Source Chart */}
          {analytics.revenueBySource.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Revenue by Platform
              </Text>
              <HorizontalBarChart
                data={analytics.revenueBySource}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                formatValue={(v) => formatCurrency(v)}
              />
            </View>
          )}

          {/* Orders by Platform Table */}
          <View className="mt-4">
            <BreakdownTable
              title="Orders by Platform"
              data={platformOrderRows}
              columns={{
                label: 'Platform',
                value: 'Orders',
                percentage: 'Share',
              }}
              emptyMessage="No platform data available"
            />
          </View>

          {/* Revenue by Source Table */}
          {revenueSourceRows.length > 0 && (
            <View className="mt-4">
              <BreakdownTable
                title="Revenue by Platform"
                data={revenueSourceRows}
                columns={{
                  label: 'Platform',
                  value: 'Revenue',
                  percentage: 'Share',
                }}
                emptyMessage="No revenue data available"
              />
            </View>
          )}

          {/* Customers by Platform */}
          {customerPlatformRows.length > 0 && (
            <View className="mt-4">
              <BreakdownTable
                title="Customers by Platform"
                data={customerPlatformRows}
                columns={{
                  label: 'Platform',
                  value: 'Customers',
                  percentage: 'Share',
                }}
                emptyMessage="No customer data"
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
