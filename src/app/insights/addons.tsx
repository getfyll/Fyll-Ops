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
import { FigureText, InsightSentence } from '@/components/stats/FigureText';
import { topItemSentence } from '@/lib/insights-sentences';
import { InsightsRangeTabs } from '@/components/stats/InsightsRangeTabs';
import { useInsightsBottomPad, useInsightsColors, useInsightsTopCardHeight } from '@/lib/insights-theme';

export default function AddonsInsightScreen({ inline }: { inline?: boolean }) {
  const bottomPad = useInsightsBottomPad();
  const topCardMinHeight = useInsightsTopCardHeight();
  const colors = useInsightsColors();
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
        >
          {/* Time Range Selector */}
          <InsightsRangeTabs options={timeRangeOptions} value={timeRange} onChange={setTimeRange} />

          {/* Total Add-on Revenue Card */}
          <View
            className="rounded-[26px] p-5 mt-4"
            style={[colors.getCardStyle(), { minHeight: topCardMinHeight }]}
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
              <FigureText desktop={36} mobile={20}
                style={{ color: colors.text.primary }}
                
              >
              {formatCurrency(analytics.addOnMetrics.revenue)}
            </FigureText>
            <Text
              style={{ color: colors.text.secondary }}
              className="text-base mt-1"
            >
              From {analytics.addOnMetrics.addOnItems} add-on items
            </Text>
            <InsightSentence parts={topItemSentence(analytics.addOnBreakdown ?? [], 'add-on')} />
          </View>

          {/* Add-ons by Period */}
          {analytics.addOnByPeriod.some((point) => point.value > 0) && (
            <View
              className="rounded-[26px] p-5 mt-4"
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
