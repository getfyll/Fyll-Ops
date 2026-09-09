import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  Users,
  UserPlus,
  UserCheck,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function CustomersInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'customers');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  // Top customers rows
  const topCustomerRows = analytics.topCustomers.map((customer) => ({
    label: customer.name,
    value: formatCurrency(customer.totalSpent),
    subValue: `${customer.orderCount} orders`,
    percentage: undefined,
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Customer Analytics"
            subtitle="Customer breakdown and insights"
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

          {/* Main Customers Card */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-2">
              <Users size={20} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm font-medium ml-2"
              >
                Unique Customers
              </Text>
            </View>
            <Text
              style={{ color: colors.text.primary }}
              className="text-4xl font-bold"
            >
              {analytics.kpiMetrics.customers.value}
            </Text>
            <View className="flex-row items-center mt-2">
              {analytics.kpiMetrics.customers.change >= 0 ? (
                <TrendingUp size={16} color={colors.success} strokeWidth={2.5} />
              ) : (
                <TrendingDown size={16} color={colors.danger} strokeWidth={2.5} />
              )}
              <Text
                style={{
                  color:
                    analytics.kpiMetrics.customers.change >= 0
                      ? colors.success
                      : colors.danger,
                }}
                className="text-sm font-medium ml-1"
              >
                {analytics.kpiMetrics.customers.change >= 0 ? '+' : ''}
                {analytics.kpiMetrics.customers.change.toFixed(1)}% vs last period
              </Text>
            </View>
          </View>

          {/* New vs Returning */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <Text
              style={{ color: colors.text.primary }}
              className={` font-bold mb-4`}
            >
              New vs Returning
            </Text>
            <View className="flex-row items-center justify-around">
              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: colors.bg.input }}
                >
                  <UserPlus size={28} color={colors.success} strokeWidth={2} />
                </View>
                <Text
                  style={{ color: colors.text.primary }}
                  className="text-3xl font-bold"
                >
                  {analytics.returningVsNew.new}
                </Text>
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm mt-1"
                >
                  New Customers
                </Text>
              </View>

              <View
                className="h-20 w-px"
                style={{ backgroundColor: colors.barBg }}
              />

              <View className="items-center">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: colors.bg.input }}
                >
                  <UserCheck size={28} color={colors.bar} strokeWidth={2} />
                </View>
                <Text
                  style={{ color: colors.text.primary }}
                  className="text-3xl font-bold"
                >
                  {analytics.returningVsNew.returning}
                </Text>
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm mt-1"
                >
                  Returning ({analytics.returningVsNew.returningPercentage}%)
                </Text>
              </View>
            </View>
          </View>

          {/* Top Customers */}
          <View className="mt-4">
            <BreakdownTable
              title="Top Customers by Spend"
              data={topCustomerRows}
              columns={{
                label: 'Customer',
                value: 'Total Spent',
              }}
              showIndex={true}
              emptyMessage="No customer data yet"
            />
          </View>

          {/* Customer Locations */}
          {analytics.customersByLocation.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Customers by Location
              </Text>
              <HorizontalBarChart
                data={analytics.customersByLocation}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                formatValue={(v) => `${v}`}
              />
            </View>
          )}

          {/* Customer Platforms */}
          {analytics.customersByPlatform.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Customers by Platform
              </Text>
              <HorizontalBarChart
                data={analytics.customersByPlatform}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                formatValue={(v) => `${v}`}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
