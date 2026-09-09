import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function LocationsInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'customers');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Location breakdown rows
  const locationRows = analytics.locationBreakdown.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  // Customer location rows
  const customerLocationRows = analytics.customersByLocation.map((item) => ({
    label: item.label,
    value: item.value,
    subValue: `${item.percentage}% of customers`,
    percentage: item.percentage,
  }));

  // Top location
  const topLocation = analytics.locationBreakdown[0];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Location Analytics"
            subtitle="Geographic breakdown of customers"
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

          {/* Top Location Card */}
          {topLocation && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <MapPin size={20} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm font-medium ml-2"
                >
                  Top Location
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-3xl font-bold"
              >
                {topLocation.label}
              </Text>
              <Text
                style={{ color: colors.success }}
                className="text-lg font-semibold mt-1"
              >
                {topLocation.value} orders ({topLocation.percentage}%)
              </Text>
            </View>
          )}

          {/* Orders by Location Chart */}
          {analytics.locationBreakdown.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Orders by Location
              </Text>
              <HorizontalBarChart
                data={analytics.locationBreakdown}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                formatValue={(v) => `${v}`}
              />
            </View>
          )}

          {/* Location Breakdown Table */}
          <View className="mt-4">
            <BreakdownTable
              title="Orders by Location"
              data={locationRows}
              columns={{
                label: 'Location',
                value: 'Orders',
                percentage: 'Share',
              }}
              emptyMessage="No location data available"
            />
          </View>

          {/* Customers by Location */}
          {customerLocationRows.length > 0 && (
            <View className="mt-4">
              <BreakdownTable
                title="Unique Customers by Location"
                data={customerLocationRows}
                columns={{
                  label: 'Location',
                  value: 'Customers',
                  percentage: 'Share',
                }}
                emptyMessage="No customer location data"
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
