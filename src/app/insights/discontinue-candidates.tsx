import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { XCircle, ChevronRight, AlertTriangle, Calendar } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import { calculateDiscontinueCandidates, type DiscontinuePeriod } from '@/lib/inventory-analytics';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { FigureText } from '@/components/stats/FigureText';
import { useInsightsBottomPad, useInsightsColors } from '@/lib/insights-theme';

export default function DiscontinueCandidatesScreen() {
  const bottomPad = useInsightsBottomPad();
  const colors = useInsightsColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string; threshold?: string }>();

  const initialPeriod = (params.period as DiscontinuePeriod) || '30d';
  const initialThreshold = params.threshold ? parseInt(params.threshold, 10) : 5;

  const [period, setPeriod] = useState<DiscontinuePeriod>(initialPeriod);
  const [stockThreshold, setStockThreshold] = useState(initialThreshold);
  const [limit, setLimit] = useState<20 | 50>(20);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  const periodOptions: { key: DiscontinuePeriod; label: string }[] = [
    { key: '30d', label: 'Last 30 days' },
    { key: '90d', label: 'Last 90 days' },
    { key: 'year', label: 'This Year' },
  ];

  const thresholdOptions = [1, 3, 5, 10, 20];

  const result = useMemo(() => {
    return calculateDiscontinueCandidates(
      products,
      orders,
      restockLogs,
      period,
      stockThreshold,
      limit
    );
  }, [products, orders, restockLogs, period, stockThreshold, limit]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never sold';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <DetailHeader
          title="Discontinue Candidates"
          subtitle="Products with no sales"
        />

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
        >
          {/* Period Selector */}
          <View className="flex-row mt-4">
            {periodOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setPeriod(option.key)}
                className="mr-2 px-4 py-2 rounded-full"
                style={{
                  backgroundColor:
                    period === option.key ? '#FFFFFF' : colors.bg.card,
                }}
              >
                <Text
                  style={{
                    color: period === option.key ? '#000000' : colors.text.tertiary,
                  }}
                  className="text-sm font-medium"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Stock Threshold Selector */}
          <View className="mt-3">
            <Text style={{ color: colors.text.tertiary }} className="text-xs mb-2">
              Min stock to show:
            </Text>
            <View className="flex-row">
              {thresholdOptions.map((threshold) => (
                <Pressable
                  key={threshold}
                  onPress={() => setStockThreshold(threshold)}
                  className="mr-2 px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: stockThreshold === threshold ? colors.bg.card : 'transparent',
                    borderWidth: 1,
                    borderColor: stockThreshold === threshold ? colors.text.tertiary : colors.divider,
                  }}
                >
                  <Text
                    style={{ color: stockThreshold === threshold ? colors.text.primary : colors.text.tertiary }}
                    className="text-xs font-medium"
                  >
                    {threshold}+
                  </Text>
                </Pressable>
              ))}
            </View>
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

          {/* Info Banner */}
          <View
            className="rounded-xl p-3 mt-4 flex-row items-center"
            style={{ backgroundColor: colors.danger + '15' }}
          >
            <AlertTriangle size={16} color={colors.danger} />
            <Text style={{ color: colors.danger }} className="text-xs ml-2 flex-1">
              Products with {stockThreshold}+ units in stock and zero sales in period. Consider discontinuing or clearance sale.
            </Text>
          </View>

          {/* Summary */}
          <View
            className="rounded-xl p-4 mt-4"
            style={colors.getCardStyle()}
          >
            <Text style={{ color: colors.text.tertiary }} className="text-xs">
              Total Candidates Found
            </Text>
            <FigureText desktop={24} mobile={24} style={{ color: colors.text.primary }} >
              {result.totalCandidates}
            </FigureText>
          </View>

          {/* Results */}
          <View
            className="rounded-2xl mt-4 overflow-hidden"
            style={colors.getCardStyle()}
          >
            {result.candidates.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">
                  No discontinue candidates found with current filters
                </Text>
              </View>
            ) : (
              result.candidates.map((candidate, index) => (
                <Pressable
                  key={candidate.productId}
                  onPress={() => router.push(`/product/${candidate.productId}`)}
                  className="flex-row items-center p-4"
                  style={{
                    borderBottomWidth: index < result.candidates.length - 1 ? 1 : 0,
                    borderBottomColor: colors.divider,
                  }}
                >
                  {/* Rank with discontinued indicator */}
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: candidate.isDiscontinued
                        ? colors.text.tertiary + '30'
                        : colors.danger + '20',
                    }}
                  >
                    {candidate.isDiscontinued ? (
                      <XCircle size={14} color={colors.text.tertiary} />
                    ) : (
                      <Text
                        style={{ color: colors.danger }}
                        className="text-sm font-bold"
                      >
                        {index + 1}
                      </Text>
                    )}
                  </View>

                  {/* Product Info */}
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center">
                      <Text
                        style={{
                          color: candidate.isDiscontinued
                            ? colors.text.tertiary
                            : colors.text.primary
                        }}
                        className="text-sm font-medium"
                        numberOfLines={1}
                      >
                        {candidate.productName}
                      </Text>
                      {candidate.isDiscontinued && (
                        <View
                          className="ml-2 px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: colors.text.tertiary + '30' }}
                        >
                          <Text style={{ color: colors.text.tertiary }} className="text-[10px]">
                            Discontinued
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="flex-row items-center mt-0.5">
                      <Calendar size={10} color={colors.text.tertiary} />
                      <Text style={{ color: colors.text.tertiary }} className="text-xs ml-1">
                        Last sold: {formatDate(candidate.lastSoldDate)}
                      </Text>
                    </View>
                  </View>

                  {/* Stock & Restock Info */}
                  <View className="items-end mr-2">
                    <Text style={{ color: colors.danger }} className="text-sm font-bold">
                      {candidate.currentStock} units
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      {candidate.restockCountThisYear} restocks this year
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
