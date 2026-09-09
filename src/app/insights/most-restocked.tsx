import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import { filterRestockLogsByDateRange } from '@/lib/inventory-analytics';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';
import { DetailHeader } from '@/components/stats/DetailHeader';

export default function MostRestockedScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [limit, setLimit] = useState<20 | 50>(20);
  const [sortBy, setSortBy] = useState<'count' | 'units'>('count');

  const products = useFyllStore((s) => s.products);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  const mostRestocked = useMemo(() => {
    const { start, end } = getDateRange(timeRange);
    const logsInRange = filterRestockLogsByDateRange(restockLogs, start, end);

    // Build product name map
    const productNames = new Map<string, string>();
    products.forEach((product) => {
      productNames.set(product.id, product.name);
    });

    // Aggregate by product
    const productMap = new Map<string, { restockCount: number; totalUnits: number }>();
    logsInRange.forEach((log) => {
      const existing = productMap.get(log.productId) || { restockCount: 0, totalUnits: 0 };
      existing.restockCount++;
      existing.totalUnits += log.quantityAdded;
      productMap.set(log.productId, existing);
    });

    // Convert and sort
    const results = Array.from(productMap.entries())
      .map(([productId, data]) => ({
        productId,
        productName: productNames.get(productId) || 'Unknown Product',
        restockCount: data.restockCount,
        totalUnits: data.totalUnits,
      }))
      .sort((a, b) => {
        if (sortBy === 'count') {
          return b.restockCount - a.restockCount;
        }
        return b.totalUnits - a.totalUnits;
      })
      .slice(0, limit);

    return results;
  }, [products, restockLogs, timeRange, limit, sortBy]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Most Restocked"
            subtitle="Products by restock frequency"
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

          {/* Sort By Toggle */}
          <View className="flex-row mt-3 items-center">
            <Text style={{ color: colors.text.tertiary }} className="text-xs mr-2">
              Sort by:
            </Text>
            <Pressable
              onPress={() => setSortBy('count')}
              className="mr-2 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: sortBy === 'count' ? colors.bg.card : 'transparent',
                borderWidth: 1,
                borderColor: sortBy === 'count' ? colors.text.tertiary : colors.divider,
              }}
            >
              <Text
                style={{ color: sortBy === 'count' ? colors.text.primary : colors.text.tertiary }}
                className="text-xs font-medium"
              >
                Restock Count
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSortBy('units')}
              className="px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: sortBy === 'units' ? colors.bg.card : 'transparent',
                borderWidth: 1,
                borderColor: sortBy === 'units' ? colors.text.tertiary : colors.divider,
              }}
            >
              <Text
                style={{ color: sortBy === 'units' ? colors.text.primary : colors.text.tertiary }}
                className="text-xs font-medium"
              >
                Units Restocked
              </Text>
            </Pressable>
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
            {mostRestocked.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">
                  No restock data for this period
                </Text>
              </View>
            ) : (
              mostRestocked.map((product, index) => (
                <Pressable
                  key={product.productId}
                  onPress={() => router.push(`/product/${product.productId}`)}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < mostRestocked.length - 1 ? 1 : 0,
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
                      {sortBy === 'count'
                        ? `${product.totalUnits} units total`
                        : `${product.restockCount} restocks`}
                    </Text>
                  </View>

                  {/* Primary Metric */}
                  <View className="items-end mr-2">
                    <Text
                      style={{ color: colors.text.primary }}
                      className="text-sm font-bold"
                    >
                      {sortBy === 'count'
                        ? `${product.restockCount} restocks`
                        : `${product.totalUnits} units`}
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
