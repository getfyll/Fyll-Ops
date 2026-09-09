import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Package, DollarSign, TrendingUp, TrendingDown, Users } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/state/fyll-store';
import { TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';

export default function ServicesInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const analytics = useAnalytics(timeRange, 'services');

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  const serviceBreakdown = analytics.serviceBreakdown ?? [];
  const serviceByPeriod = analytics.serviceByPeriod ?? [];
  const serviceRevenueChange = analytics.serviceRevenueChange ?? 0;
  const serviceVariableBreakdown = analytics.serviceVariableBreakdown ?? [];

  // Services table rows
  const serviceRows = serviceBreakdown.map((item) => ({
    label: item.name,
    value: formatCurrency(item.revenue),
    subValue: `${item.orders} orders · ${item.quantity} services`,
    percentage: undefined,
  }));

  // Services for chart
  const totalServiceRevenue = serviceBreakdown.reduce(
    (sum, item) => sum + item.revenue,
    0
  );
  const serviceChartData = serviceBreakdown.map((item) => ({
    label: item.name,
    value: item.revenue,
    percentage: Math.round(
      (item.revenue / (totalServiceRevenue || 1)) * 100
    ),
  }));

  // Calculate totals
  const totalOrders = analytics.serviceMetrics?.ordersWithServices ?? 0;
  const totalServiceItems = analytics.serviceMetrics?.serviceItems ?? 0;

  // Top service
  const topService = serviceBreakdown[0];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Services Analytics"
            subtitle="Service performance breakdown"
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

          {/* Total Service Revenue Card */}
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
                Total Service Revenue
              </Text>
            </View>
            <Text
              style={{ color: colors.text.primary }}
              className="text-4xl font-bold"
            >
              {formatCurrency(analytics.serviceMetrics?.revenue ?? 0)}
            </Text>
            <View className="flex-row items-center mt-2">
              {serviceRevenueChange >= 0 ? (
                <TrendingUp size={14} color={colors.success} strokeWidth={2.5} />
              ) : (
                <TrendingDown size={14} color={colors.danger} strokeWidth={2.5} />
              )}
              <Text
                style={{
                  color: serviceRevenueChange >= 0 ? colors.success : colors.danger,
                }}
                className="text-sm font-medium ml-1"
              >
                {serviceRevenueChange >= 0 ? '+' : ''}
                {serviceRevenueChange.toFixed(1)}% vs last period
              </Text>
            </View>
            <View className="flex-row items-center mt-3">
              <View className="flex-row items-center mr-4">
                <Package size={14} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.secondary }}
                  className="text-sm ml-1.5"
                >
                  {totalOrders} orders
                </Text>
              </View>
              <View className="flex-row items-center">
                <Users size={14} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.secondary }}
                  className="text-sm ml-1.5"
                >
                  {totalServiceItems} services
                </Text>
              </View>
            </View>
          </View>

          {/* Revenue Trend */}
          {serviceByPeriod.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Revenue Trend
              </Text>
              <SalesBarChart
                data={serviceByPeriod}
                height={160}
                barColor={colors.bar}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
              />
            </View>
          )}

          {/* Top Service Card */}
          {topService && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Package size={20} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm font-medium ml-2"
                >
                  Top Service
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {topService.name}
              </Text>
              <View className="flex-row items-center mt-2">
                <Text
                  style={{ color: colors.success }}
                  className="text-lg font-semibold"
                >
                  {formatCurrency(topService.revenue)}
                </Text>
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm ml-2"
                >
                  from {topService.orders} orders
                </Text>
              </View>
            </View>
          )}

          {/* Service Revenue Chart */}
          {serviceChartData.length > 0 && (
            <View
              className="rounded-2xl p-5 mt-4"
              style={colors.getCardStyle()}
            >
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold mb-4`}
              >
                Revenue by Service
              </Text>
              <HorizontalBarChart
                data={serviceChartData}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                formatValue={(v) => formatCurrency(v)}
              />
            </View>
          )}

          {/* Services Breakdown Table */}
          <View className="mt-4">
            <BreakdownTable
              title="All Services"
              data={serviceRows}
              columns={{
                label: 'Service',
                value: 'Revenue',
              }}
              showIndex={true}
              emptyMessage="No service data available"
            />
          </View>

          {/* Service Variable Metrics */}
          {serviceVariableBreakdown.length > 0 && (
            <View className="mt-4">
              <View
                className="rounded-2xl p-5"
                style={colors.getCardStyle()}
              >
                <Text
                  style={{ color: colors.text.primary }}
                  className={` font-bold mb-4`}
                >
                  Service Variables
                </Text>
                {serviceVariableBreakdown.map((variable, index) => (
                  <View
                    key={`${variable.serviceName}-${variable.variableName}`}
                    className="pb-4 mb-4"
                    style={{
                      borderBottomWidth:
                        index < serviceVariableBreakdown.length - 1 ? 1 : 0,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <Text
                      style={{ color: colors.text.primary }}
                      className="text-sm font-semibold"
                    >
                      {variable.serviceName} · {variable.variableName}
                    </Text>
                    <View className="mt-3">
                      {variable.values.slice(0, 6).map((value) => (
                        <View
                          key={`${variable.serviceName}-${variable.variableName}-${value.label}`}
                          className="flex-row items-center justify-between py-2"
                          style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}
                        >
                          <Text style={{ color: colors.text.secondary }} className="text-sm">
                            {value.label}
                          </Text>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                            {value.count}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
