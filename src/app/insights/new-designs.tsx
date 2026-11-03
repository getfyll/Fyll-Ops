import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import { calculateNewDesignAnalytics } from '@/lib/inventory-analytics';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { FigureText } from '@/components/stats/FigureText';
import { useInsightsBottomPad, useInsightsColors } from '@/lib/insights-theme';

export default function NewDesignsScreen() {
  const bottomPad = useInsightsBottomPad();
  const colors = useInsightsColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const initialYear = params.year ? parseInt(params.year, 10) : new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [sortBy, setSortBy] = useState<'restocks' | 'sales' | 'stock'>('restocks');

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear];

  const analytics = useMemo(() => {
    return calculateNewDesignAnalytics(products, orders, restockLogs, selectedYear);
  }, [products, orders, restockLogs, selectedYear]);

  const sortedDesigns = useMemo(() => {
    const designs = [...analytics.allNewDesigns];
    switch (sortBy) {
      case 'restocks':
        return designs.sort((a, b) => b.restockCount - a.restockCount);
      case 'sales':
        return designs.sort((a, b) => b.unitsSold - a.unitsSold);
      case 'stock':
        return designs.sort((a, b) => b.stockRemaining - a.stockRemaining);
      default:
        return designs;
    }
  }, [analytics.allNewDesigns, sortBy]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <DetailHeader
          title="New Designs"
          subtitle={`${selectedYear} collection`}
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

          {/* Stats Summary */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View className="flex-1 p-4 rounded-xl" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                Total New Designs
              </Text>
              <FigureText desktop={24} mobile={24} style={{ color: colors.text.primary }} >
                {analytics.totalNewDesigns}
              </FigureText>
            </View>
            <View className="flex-1 p-4 rounded-xl" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                Restocked
              </Text>
              <FigureText desktop={24} mobile={24} style={{ color: colors.text.primary }} >
                {analytics.newDesignsRestocked}
              </FigureText>
            </View>
          </View>

          <View className="flex-row mt-3" style={{ gap: 12 }}>
            <View className="flex-1 p-4 rounded-xl" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                Total Restocks
              </Text>
              <FigureText desktop={24} mobile={24} style={{ color: colors.text.primary }} >
                {analytics.totalRestocksForNewDesigns}
              </FigureText>
            </View>
            <View className="flex-1 p-4 rounded-xl" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                Units Restocked
              </Text>
              <FigureText desktop={24} mobile={24} style={{ color: colors.text.primary }} >
                {analytics.totalUnitsRestockedForNewDesigns}
              </FigureText>
            </View>
          </View>

          {/* Sort Options */}
          <View className="flex-row mt-4 items-center">
            <Text style={{ color: colors.text.tertiary }} className="text-xs mr-2">
              Sort by:
            </Text>
            {[
              { key: 'restocks', label: 'Restocks' },
              { key: 'sales', label: 'Sales' },
              { key: 'stock', label: 'Stock' },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setSortBy(option.key as typeof sortBy)}
                className="mr-2 px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: sortBy === option.key ? colors.bg.card : 'transparent',
                  borderWidth: 1,
                  borderColor: sortBy === option.key ? colors.text.tertiary : colors.divider,
                }}
              >
                <Text
                  style={{ color: sortBy === option.key ? colors.text.primary : colors.text.tertiary }}
                  className="text-xs font-medium"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Results */}
          <View
            className="rounded-2xl mt-4 overflow-hidden"
            style={colors.getCardStyle()}
          >
            {sortedDesigns.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">
                  No new designs marked for {selectedYear}
                </Text>
              </View>
            ) : (
              sortedDesigns.map((product, index) => (
                <Pressable
                  key={product.productId}
                  onPress={() => router.push(`/product/${product.productId}`)}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < sortedDesigns.length - 1 ? 1 : 0,
                    borderBottomColor: colors.divider,
                  }}
                >
                  {/* Rank */}
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: colors.accent + '20' }}
                  >
                    <Text style={{ color: colors.accent }} className="text-sm font-bold">
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
