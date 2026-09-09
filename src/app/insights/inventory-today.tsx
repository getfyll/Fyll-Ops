import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  Package,
  Boxes,
  AlertTriangle,
  PackageX,
  RotateCcw,
  TrendingUp,
} from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { computeInventoryAnalytics } from '@/lib/inventory-analytics';
import { useStatsColors } from '@/lib/theme';

export default function InventoryTodayScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const router = useRouter();
  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  // Global low stock threshold settings
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);

  // Get inventory analytics
  const inventoryAnalytics = useMemo(() => {
    const threshold = useGlobalLowStockThreshold ? globalLowStockThreshold : undefined;
    return computeInventoryAnalytics(products, orders, restockLogs, '7d', threshold);
  }, [products, orders, restockLogs, useGlobalLowStockThreshold, globalLowStockThreshold]);

  // Get today's restocks
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayRestocks = restockLogs.filter((log) => {
    const logDate = new Date(log.timestamp);
    return logDate >= today;
  });

  const todayRestockUnits = todayRestocks.reduce((sum, log) => sum + log.quantityAdded, 0);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Inventory Overview"
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
            <Text
              style={{ color: colors.text.tertiary }}
              className="text-sm font-medium mb-2"
            >
              Total Units in Stock
            </Text>
            <Text
              style={{ color: colors.text.primary }}
              className="text-4xl font-bold"
            >
              {inventoryAnalytics.overview.totalUnitsInStock.toLocaleString()}
            </Text>
            <Text
              style={{ color: colors.text.tertiary }}
              className="text-sm mt-1"
            >
              Across {inventoryAnalytics.overview.totalProducts} products
            </Text>
          </View>

          {/* KPI Grid */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
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
                  Products
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {inventoryAnalytics.overview.totalProducts}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <Boxes size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Variants
                </Text>
              </View>
              <Text
                style={{ color: colors.text.primary }}
                className="text-2xl font-bold"
              >
                {inventoryAnalytics.overview.totalVariants}
              </Text>
            </View>
          </View>

          <View className="flex-row mt-3" style={{ gap: 12 }}>
            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Low Stock
                </Text>
              </View>
              <Text
                style={{ color: inventoryAnalytics.overview.lowStockItems > 0 ? colors.warning : colors.text.primary }}
                className="text-2xl font-bold"
              >
                {inventoryAnalytics.overview.lowStockItems}
              </Text>
            </View>

            <View
              className="flex-1 rounded-2xl p-4"
              style={colors.getCardStyle()}
            >
              <View className="flex-row items-center mb-2">
                <PackageX size={16} color={colors.danger} strokeWidth={2} />
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs font-medium ml-2"
                >
                  Out of Stock
                </Text>
              </View>
              <Text
                style={{ color: inventoryAnalytics.overview.outOfStockItems > 0 ? colors.danger : colors.text.primary }}
                className="text-2xl font-bold"
              >
                {inventoryAnalytics.overview.outOfStockItems}
              </Text>
            </View>
          </View>

          {/* Inventory Value */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-2">
              <TrendingUp size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold ml-2`}
              >
                Inventory Value
              </Text>
            </View>
            <Text
              style={{ color: colors.text.primary }}
              className="text-3xl font-bold"
            >
              {formatCurrency(inventoryAnalytics.overview.totalInventoryValue)}
            </Text>
          </View>

          {/* Today's Restocks */}
          <View
            className="rounded-2xl p-5 mt-4"
            style={colors.getCardStyle()}
          >
            <View className="flex-row items-center mb-4">
              <RotateCcw size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text
                style={{ color: colors.text.primary }}
                className={` font-bold ml-2`}
              >
                Today's Restocks
              </Text>
            </View>
            {todayRestocks.length > 0 ? (
              <>
                <Text
                  style={{ color: colors.success }}
                  className="text-2xl font-bold mb-3"
                >
                  +{todayRestockUnits} units
                </Text>
                {todayRestocks.map((log, index) => {
                  const product = products.find((p) => p.id === log.productId);
                  return (
                    <Pressable
                      key={log.id}
                      onPress={() => router.push(`/product/${log.productId}`)}
                      className="py-3"
                      style={{
                        borderBottomWidth: index < todayRestocks.length - 1 ? 1 : 0,
                        borderBottomColor: colors.divider,
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <Text
                            style={{ color: colors.text.primary }}
                            className="text-sm font-medium"
                            numberOfLines={1}
                          >
                            {product?.name ?? 'Unknown Product'}
                          </Text>
                          <Text
                            style={{ color: colors.text.tertiary }}
                            className="text-xs"
                          >
                            {log.variantId ?? 'Default variant'}
                          </Text>
                        </View>
                        <Text
                          style={{ color: colors.success }}
                          className="text-sm font-bold"
                        >
                          +{log.quantityAdded}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm text-center py-4"
              >
                No restocks recorded today
              </Text>
            )}
          </View>

          {/* Low Stock Items */}
          {inventoryAnalytics.lowStockList.length > 0 && (
            <Pressable
              onPress={() => router.push('/insights/low-stock')}
              className="mt-4"
            >
              <View
                className="rounded-2xl p-5"
                style={colors.getCardStyle()}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center">
                    <AlertTriangle size={18} color={colors.warning} strokeWidth={2} />
                    <Text
                      style={{ color: colors.text.primary }}
                      className={` font-bold ml-2`}
                    >
                      Low Stock Alert
                    </Text>
                  </View>
                  <View
                    className="px-2 py-1 rounded-full"
                    style={{ backgroundColor: colors.warning + '20' }}
                  >
                    <Text
                      style={{ color: colors.warning }}
                      className="text-xs font-bold"
                    >
                      {inventoryAnalytics.lowStockList.length}
                    </Text>
                  </View>
                </View>
                {inventoryAnalytics.lowStockList.slice(0, 3).map((item, index) => (
                  <View
                    key={`${item.productId}-${item.variantName}`}
                    className="py-2"
                    style={{
                      borderBottomWidth: index < Math.min(inventoryAnalytics.lowStockList.length, 3) - 1 ? 1 : 0,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text
                        style={{ color: colors.text.primary }}
                        className="text-sm font-medium flex-1 mr-3"
                        numberOfLines={1}
                      >
                        {item.productName}
                      </Text>
                      <Text
                        style={{ color: colors.warning }}
                        className="text-sm font-bold"
                      >
                        {item.stock} left
                      </Text>
                    </View>
                  </View>
                ))}
                {inventoryAnalytics.lowStockList.length > 3 && (
                  <Text
                    style={{ color: colors.text.tertiary }}
                    className="text-xs text-center mt-3"
                  >
                    +{inventoryAnalytics.lowStockList.length - 3} more items
                  </Text>
                )}
              </View>
            </Pressable>
          )}

          {/* Out of Stock Items */}
          {inventoryAnalytics.outOfStockList.length > 0 && (
            <Pressable
              onPress={() => router.push('/insights/out-of-stock')}
              className="mt-4"
            >
              <View
                className="rounded-2xl p-5"
                style={colors.getCardStyle()}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center">
                    <PackageX size={18} color={colors.danger} strokeWidth={2} />
                    <Text
                      style={{ color: colors.text.primary }}
                      className={` font-bold ml-2`}
                    >
                      Out of Stock
                    </Text>
                  </View>
                  <View
                    className="px-2 py-1 rounded-full"
                    style={{ backgroundColor: colors.danger + '20' }}
                  >
                    <Text
                      style={{ color: colors.danger }}
                      className="text-xs font-bold"
                    >
                      {inventoryAnalytics.outOfStockList.length}
                    </Text>
                  </View>
                </View>
                {inventoryAnalytics.outOfStockList.slice(0, 3).map((item, index) => (
                  <View
                    key={`${item.productId}-${item.variantName}`}
                    className="py-2"
                    style={{
                      borderBottomWidth: index < Math.min(inventoryAnalytics.outOfStockList.length, 3) - 1 ? 1 : 0,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text
                        style={{ color: colors.text.primary }}
                        className="text-sm font-medium flex-1 mr-3"
                        numberOfLines={1}
                      >
                        {item.productName}
                      </Text>
                      <Text
                        style={{ color: colors.danger }}
                        className="text-sm font-bold"
                      >
                        0 units
                      </Text>
                    </View>
                  </View>
                ))}
                {inventoryAnalytics.outOfStockList.length > 3 && (
                  <Text
                    style={{ color: colors.text.tertiary }}
                    className="text-xs text-center mt-3"
                  >
                    +{inventoryAnalytics.outOfStockList.length - 3} more items
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
