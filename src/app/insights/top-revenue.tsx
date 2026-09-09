import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { calculateTopProductsByRevenue } from '@/lib/inventory-analytics';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';
import { DetailHeader } from '@/components/stats/DetailHeader';

export default function TopRevenueScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [limit, setLimit] = useState<20 | 50>(20);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  const topRevenue = useMemo(() => {
    const { start, end } = getDateRange(timeRange);
    const ordersInRange = orders.filter((order) => {
      const orderDate = new Date(order.orderDate ?? order.createdAt);
      return orderDate >= start && orderDate <= end && order.status !== 'Refunded';
    });

    return calculateTopProductsByRevenue(ordersInRange, products, limit);
  }, [products, orders, timeRange, limit]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Top Revenue"
            subtitle="Products ranked by revenue"
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
                    timeRange === option.key ? '#FFFFFF' : colors.bg.card,
                }}
              >
                <Text
                  style={{
                    color: timeRange === option.key ? '#000000' : colors.text.tertiary,
                  }}
                  className="text-sm font-medium"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Limit Toggle */}
          <View className="flex-row mt-3">
            <Pressable
              onPress={() => setLimit(20)}
              className="mr-2 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: limit === 20 ? colors.bg.card : 'transparent',
                borderWidth: 1,
                borderColor: limit === 20 ? colors.text.tertiary : colors.divider,
              }}
            >
              <Text
                style={{ color: limit === 20 ? colors.text.primary : colors.text.tertiary }}
                className="text-xs font-medium"
              >
                Top 20
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLimit(50)}
              className="px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: limit === 50 ? colors.bg.card : 'transparent',
                borderWidth: 1,
                borderColor: limit === 50 ? colors.text.tertiary : colors.divider,
              }}
            >
              <Text
                style={{ color: limit === 50 ? colors.text.primary : colors.text.tertiary }}
                className="text-xs font-medium"
              >
                Top 50
              </Text>
            </Pressable>
          </View>

          {/* Results */}
          <View
            className="rounded-2xl mt-4 overflow-hidden"
            style={colors.getCardStyle()}
          >
            {topRevenue.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">
                  No sales data for this period
                </Text>
              </View>
            ) : (
              topRevenue.map((product, index) => (
                <Pressable
                  key={product.productId}
                  onPress={() => router.push(`/product/${product.productId}`)}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < topRevenue.length - 1 ? 1 : 0,
                    borderBottomColor: colors.divider,
                  }}
                >
                  {/* Rank */}
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: index < 3 ? colors.success + '20' : colors.divider,
                    }}
                  >
                    <Text
                      style={{ color: index < 3 ? colors.success : colors.text.tertiary }}
                      className="text-sm font-bold"
                    >
                      {index + 1}
                    </Text>
                  </View>

                  {/* Product Info */}
                  <View className="flex-1 mr-3">
                    <Text
                      style={{ color: colors.text.primary }}
                      className="text-sm font-medium"
                      numberOfLines={1}
                    >
                      {product.productName}
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      {product.unitsSold} units sold
                    </Text>
                  </View>

                  {/* Revenue */}
                  <View className="items-end mr-2">
                    <Text
                      style={{ color: colors.text.primary }}
                      className="text-sm font-bold"
                    >
                      {formatCurrency(product.revenue)}
                    </Text>
                  </View>

                  <ChevronRight size={16} color={colors.text.tertiary} />
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
