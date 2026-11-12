import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { InsightsRangeTabs } from '@/components/stats/InsightsRangeTabs';
import { useInsightsBottomPad, useInsightsColors } from '@/lib/insights-theme';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency';
import { buildOrderItemProductResolver } from '@/lib/order-item-product-match';

type MovementRange = '30d' | '90d' | 'year' | 'all';
type SortKey = 'sold' | 'restocked' | 'revenue';

const RANGE_OPTIONS: { key: MovementRange; label: string }[] = [
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All time' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'sold', label: 'Most sold' },
  { key: 'restocked', label: 'Most restocked' },
  { key: 'revenue', label: 'Revenue' },
];

const PAGE_SIZE = 20;

const getRangeStart = (range: MovementRange): Date | null => {
  if (range === 'all') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === '30d') start.setDate(start.getDate() - 29);
  else if (range === '90d') start.setDate(start.getDate() - 89);
  else start.setMonth(0, 1);
  return start;
};

type ProductMovement = {
  productId: string;
  productName: string;
  sold: number;
  revenue: number;
  restockCount: number;
  restocked: number;
};

const formatUnits = (value: number) => value.toLocaleString();

export default function StockMovementScreen({ inline }: { inline?: boolean }) {
  const bottomPad = useInsightsBottomPad();
  const colors = useInsightsColors();
  const router = useRouter();
  const { currency } = useBusinessCurrency();
  const [range, setRange] = useState<MovementRange>('30d');
  const [sortBy, setSortBy] = useState<SortKey>('sold');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  const movement = useMemo(() => {
    const start = getRangeStart(range)?.getTime() ?? null;
    const resolveProduct = buildOrderItemProductResolver(products);
    const rows = new Map<string, ProductMovement>();
    const rowFor = (productId: string, productName: string) => {
      let row = rows.get(productId);
      if (!row) {
        row = { productId, productName, sold: 0, revenue: 0, restockCount: 0, restocked: 0 };
        rows.set(productId, row);
      }
      return row;
    };

    orders.forEach((order) => {
      const status = (order.status ?? '').toLowerCase();
      if (status.includes('cancel') || status.includes('refund')) return;
      const at = new Date(order.orderDate ?? order.createdAt ?? order.updatedAt ?? '').getTime();
      if (start !== null && !(at >= start)) return;
      (order.items ?? []).forEach((item) => {
        if (!(item.quantity > 0)) return;
        const product = resolveProduct(item);
        if (!product) return;
        const row = rowFor(product.id, product.name);
        row.sold += item.quantity;
        row.revenue += item.quantity * (item.unitPrice ?? 0);
      });
    });

    restockLogs.forEach((log) => {
      if (!(log.quantityAdded > 0)) return;
      const at = new Date(log.timestamp).getTime();
      if (start !== null && !(at >= start)) return;
      const product = products.find((candidate) => candidate.id === log.productId);
      const row = rowFor(log.productId, product?.name ?? 'Unknown product');
      row.restockCount += 1;
      row.restocked += log.quantityAdded;
    });

    const all = Array.from(rows.values());
    const totals = all.reduce(
      (sum, row) => ({
        sold: sum.sold + row.sold,
        revenue: sum.revenue + row.revenue,
        restockCount: sum.restockCount + row.restockCount,
        restocked: sum.restocked + row.restocked,
      }),
      { sold: 0, revenue: 0, restockCount: 0, restocked: 0 }
    );
    return { all, totals };
  }, [orders, products, restockLogs, range]);

  const sorted = useMemo(() => {
    const key = sortBy === 'sold' ? 'sold' : sortBy === 'restocked' ? 'restocked' : 'revenue';
    return [...movement.all]
      .filter((row) => row[key] > 0)
      .sort((a, b) => b[key] - a[key] || a.productName.localeCompare(b.productName));
  }, [movement.all, sortBy]);

  const net = movement.totals.restocked - movement.totals.sold;
  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'Units sold', value: formatUnits(movement.totals.sold) },
    { label: 'Sales', value: formatCurrency(movement.totals.revenue, currency) },
    { label: 'Restocks', value: formatUnits(movement.totals.restockCount), hint: `${formatUnits(movement.totals.restocked)} units added` },
    { label: 'Net stock change', value: `${net > 0 ? '+' : net < 0 ? '−' : ''}${formatUnits(Math.abs(net))}`, hint: 'restocked minus sold' },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && <DetailHeader title="Stock Movement" subtitle="Sold and restocked, by period" />}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
        >
          <InsightsRangeTabs
            options={RANGE_OPTIONS}
            value={range}
            onChange={(next) => {
              setRange(next);
              setVisibleCount(PAGE_SIZE);
            }}
          />

          <View className="flex-row flex-wrap mt-4" style={{ gap: 10 }}>
            {stats.map((stat) => (
              <View
                key={stat.label}
                className="rounded-2xl p-4"
                style={[colors.getCardStyle(), { flexBasis: '47%', flexGrow: 1 }]}
              >
                <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">{stat.label}</Text>
                <Text style={{ color: colors.text.primary }} className="text-xl font-bold mt-1" numberOfLines={1} adjustsFontSizeToFit>
                  {stat.value}
                </Text>
                {stat.hint ? (
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>{stat.hint}</Text>
                ) : null}
              </View>
            ))}
          </View>

          <View className="flex-row mt-4 items-center">
            <Text style={{ color: colors.text.tertiary }} className="text-xs mr-2">Sort by:</Text>
            {SORT_OPTIONS.map((option) => {
              const selected = sortBy === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setSortBy(option.key);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className="mr-2 px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: selected ? colors.bg.card : 'transparent',
                    borderWidth: 1,
                    borderColor: selected ? colors.text.tertiary : colors.divider,
                  }}
                >
                  <Text style={{ color: selected ? colors.text.primary : colors.text.tertiary }} className="text-xs font-medium">
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="rounded-2xl mt-4 overflow-hidden" style={colors.getCardStyle()}>
            {sorted.length === 0 ? (
              <View className="p-5">
                <Text style={{ color: colors.text.tertiary }} className="text-center">No stock movement for this period</Text>
              </View>
            ) : (
              sorted.slice(0, visibleCount).map((row, index, visible) => (
                <Pressable
                  key={row.productId}
                  onPress={() => router.push(`/product/${row.productId}`)}
                  className="flex-row items-center p-4"
                  style={{ borderBottomWidth: index < visible.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}
                >
                  <View className="flex-1 mr-3">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>{row.productName}</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                      {formatCurrency(row.revenue, currency)} sales · {row.restockCount} {row.restockCount === 1 ? 'restock' : 'restocks'}
                    </Text>
                  </View>
                  <View className="items-end mr-2">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{formatUnits(row.sold)} sold</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">+{formatUnits(row.restocked)} restocked</Text>
                  </View>
                  <ChevronRight size={16} color={colors.text.tertiary} />
                </Pressable>
              ))
            )}
          </View>

          {sorted.length > visibleCount ? (
            <Pressable
              onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="items-center justify-center mt-3 rounded-xl"
              style={{ height: 44, borderWidth: 1, borderColor: colors.divider }}
            >
              <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                Show more ({sorted.length - visibleCount} left)
              </Text>
            </Pressable>
          ) : null}

          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-4 leading-4">
            Sales count orders that aren't cancelled or refunded, including website and WooCommerce orders linked to an inventory product.
            Restocks count stock added through Restock and procurement receipts.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
