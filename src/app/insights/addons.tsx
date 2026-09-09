import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { BarChart3, DollarSign } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function AddonsInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'sales');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Add-ons table rows
  const addOnRows = analytics.addOnBreakdown.map((item) => ({
    label: item.name,
    value: formatCurrency(item.revenue),
    subValue: `${item.quantity} times`,
    percentage: undefined,
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Add-ons Revenue"
            subtitle="Full add-on performance"
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

          {/* Total Add-on Revenue Card */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-2">
              <DollarSign size={20} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm font-medium ml-2"
              >
                Total Add-on Revenue
              </Text>
            </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-4xl font-bold"
              >
              {formatCurrency(analytics.addOnMetrics.revenue)}
            </Text>
            <Text
              style={{ color: colors.text.secondary }}
              className="text-base mt-1"
            >
              From {analytics.addOnMetrics.addOnItems} add-on items
            </Text>
          </View>

          {/* Add-ons by Period */}
          {analytics.addOnByPeriod.some((point) => point.value > 0) && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-4">
                <BarChart3 size={18} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.primary }}
                  className={` font-bold ml-2`}
                >
                  Add-ons by Period
                </Text>
              </View>
              <SalesBarChart
                data={analytics.addOnByPeriod}
                height={180}
                barColor={colors.bar}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
                showTopValue={false}
              />
            </View>
          )}

          {/* Add-ons Breakdown Table */}
          <View className="mt-4">
            <BreakdownTable
              title="All Add-ons"
              data={addOnRows}
              columns={{
                label: 'Add-on',
                value: 'Revenue',
              }}
              showIndex={true}
              emptyMessage="No add-on data available"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
