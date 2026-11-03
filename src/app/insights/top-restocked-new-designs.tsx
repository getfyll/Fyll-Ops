import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import { calculateNewDesignAnalytics } from '@/lib/inventory-analytics';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { useInsightsBottomPad, useInsightsColors } from '@/lib/insights-theme';

export default function TopRestockedNewDesignsScreen() {
  const bottomPad = useInsightsBottomPad();
  const colors = useInsightsColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const initialYear = params.year ? parseInt(params.year, 10) : new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [limit, setLimit] = useState<20 | 50>(20);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear];

  const analytics = useMemo(() => {
    return calculateNewDesignAnalytics(products, orders, restockLogs, selectedYear);
  }, [products, orders, restockLogs, selectedYear]);

  const topRestocked = useMemo(() => {
    return [...analytics.allNewDesigns]
      .sort((a, b) => {
        if (b.restockCount !== a.restockCount) {
          return b.restockCount - a.restockCount;
        }
        return b.unitsRestocked - a.unitsRestocked;
      })
      .slice(0, limit);
  }, [analytics.allNewDesigns, limit]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <DetailHeader
          title="Top Restocked"
          subtitle="New designs by restock frequency"
        />

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
        >
          {/* Year Selector */}
          <View className="flex-row mt-4">
            {yearOptions.map((year) => (
              <Pressable
                key={year}
                onPress={() => setSelectedYear(year)}
                className="mr-2 px-4 py-2 rounded-full"
                style={{
                  backgroundColor: selectedYear === year ? colors.accent : colors.bg.card,
                }}
              >
                <Text
                  style={{
                    color: selectedYear === year ? '#FFFFFF' : colors.text.tertiary,
                  }}
                  className="text-sm font-medium"
                >
                  {year}
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
            {topRestocked.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">
                  No new designs marked for {selectedYear}
                </Text>
              </View>
            ) : (
              topRestocked.map((product, index) => (
                <Pressable
                  key={product.productId}
                  onPress={() => router.push(`/product/${product.productId}`)}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < topRestocked.length - 1 ? 1 : 0,
                    borderBottomColor: colors.divider,
                  }}
                >
                  {/* Rank */}
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: index < 3 ? colors.accent + '30' : colors.divider,
                    }}
                  >
                    <Text
                      style={{ color: index < 3 ? colors.accent : colors.text.tertiary }}
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
                      {product.stockRemaining} in stock · {product.unitsSold} sold
                    </Text>
                  </View>

                  {/* Restock Info */}
                  <View className="items-end mr-2">
                    <Text style={{ color: colors.accent }} className="text-sm font-bold">
                      {product.restockCount} restocks
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      {product.unitsRestocked} units
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
