import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  Users,
  ShoppingCart,
  Package,
  RefreshCw,
  DollarSign,
  Clock,
} from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { SparklineChart } from '@/components/stats/SparklineChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { useStatsColors } from '@/lib/theme';

export default function TodayInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const analytics = useAnalytics('7d', 'sales');
  const orders = useFyllStore((s) => s.orders);

  // Get today's orders for the breakdown table
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = orders.filter((order) => {
    const orderDate = new Date(order.orderDate ?? order.createdAt);
    return orderDate >= today;
  });

  // Format orders for the table
  const orderRows = todayOrders.map((order) => ({
    label: order.customerName,
    value: formatCurrency(order.totalAmount),
    subValue: `${order.items.length} items · ${order.status}`,
    percentage: undefined,
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Today's Summary"
            subtitle={new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          />
        )}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* Main Stats Card */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-sm font-medium mb-2"
                >
                  Today's Revenue
                </Text>
                <Text
                  style={{ color: colors.text.primary }}
                  className="text-4xl font-bold"
                >
                  {formatCurrency(analytics.todaySales)}
                </Text>
              </View>
              <SparklineChart
                data={analytics.hourlyTrend}
                width={120}
                height={60}
                strokeColor={colors.bar}
                strokeWidth={2}
              />
            </View>
          </View>

          {/* KPI Grid */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <ShoppingCart size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Orders
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {analytics.todayOrders}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Users size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Customers
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {analytics.todayCustomers}
              </Text>
            </View>
          </View>

          <View className="flex-row mt-3" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Package size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Units Sold
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {analytics.todayUnits}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <RefreshCw size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Refunds
                </Text>
              </View>
              <Text
                style={{ color: analytics.todayRefunds > 0 ? colors.danger : colors.text.primary }}
                className="text-2xl font-bold"
              >
                {analytics.todayRefunds}
              </Text>
            </View>
          </View>

          {/* Average Order Value */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-2">
              <DollarSign size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold ml-2`}
              >
                Average Order Value
              </Text>
            </View>
            <Text
              style={{ color: colors.text.primary }}
              className="text-3xl font-bold"
            >
              {analytics.todayOrders > 0
                ? formatCurrency(analytics.todaySales / analytics.todayOrders)
                : formatCurrency(0)}
            </Text>
          </View>

          {/* Hourly Activity */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-4">
              <Clock size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold ml-2`}
              >
                Activity by Hour
              </Text>
            </View>
            <View className="flex-row items-end justify-between h-24">
              {analytics.hourlyTrend.map((value, index) => {
                const maxVal = Math.max(...analytics.hourlyTrend, 1);
                const height = (value / maxVal) * 80;
                const hours = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];
                return (
                  <View key={index} className="items-center flex-1">
                    <View
                      className="w-3 rounded-t"
                      style={{
                        height: Math.max(height, 4),
                        backgroundColor: value > 0 ? colors.bar : colors.barBg,
                      }}
                    />
                    <Text
                      style={{ color: colors.text.tertiary }}
                      className="text-[8px] mt-1"
                    >
                      {hours[index]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Today's Orders Table */}
          <View className="mt-4">
            <BreakdownTable
              title="Today's Orders"
              data={orderRows}
              columns={{
                label: 'Customer',
                value: 'Amount',
              }}
              showIndex={true}
              emptyMessage="No orders today yet"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
