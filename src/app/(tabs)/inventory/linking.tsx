import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowDownAZ, ArrowLeft, Check, ChevronDown, Link2, Package, Search, Unlink, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, type Product, type ProductVariant } from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';

type WebsiteVariantRow = {
  key: string;
  product: Product;
  variant: ProductVariant;
  productName: string;
  variantName: string;
  sku: string;
  price: number;
  stock: number;
  imageUrl?: string;
  wooProductId: string;
  wooVariationId: string;
};

type InventoryVariantOption = {
  product: Product;
  variant: ProductVariant;
  productName: string;
  variantName: string;
  sku: string;
  price: number;
  stock: number;
};

const normalizeLookupValue = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^woo[\s#:-]*/i, '')
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^product[\s#:-]*/i, '')
    .replace(/^variation[\s#:-]*/i, '')
    .replace(/[^a-z0-9]+/g, '')
);

const getVariantName = (variant: ProductVariant) => (
  Object.values(variant.variableValues ?? {}).join(' / ').trim() || variant.sku || 'Default'
);

const getWooProductId = (product: Product) => (
  product.wooCommerceProductId?.trim()
  || product.sourceProductId?.trim()
  || product.websiteProductId?.trim()
  || product.id.replace(/^woo-product-/i, '')
);

const getWooVariationId = (variant: ProductVariant) => (
  variant.wooCommerceVariationId?.trim()
  || variant.sourceVariantId?.trim()
  || variant.id.replace(/^woo-variant-/i, '')
);

const isWebsiteProduct = (product: Product) => (
  product.catalogSource === 'woocommerce-plugin'
  || product.id.toLowerCase().startsWith('woo-product-')
  || product.createdBy === 'WooCommerce Sync'
  || product.categories?.some((category) => category.toLowerCase() === 'woocommerce')
);

const isFyllInventoryProduct = (product: Product) => (
  product.productType !== 'service'
  && !product.isArchived
  && !product.isDiscontinued
);

const getManualLink = (row: WebsiteVariantRow, options: InventoryVariantOption[]) => {
  const rowProductKey = normalizeLookupValue(row.wooProductId);
  const rowVariantKey = normalizeLookupValue(row.wooVariationId);
  if (!rowProductKey && !rowVariantKey) return null;

  return options.find((option) => {
    const productKeys = [
      option.product.wooCommerceProductId,
      option.product.sourceProductId,
      option.product.websiteProductId,
    ].map(normalizeLookupValue).filter(Boolean);
    const variantKeys = [
      option.variant.wooCommerceVariationId,
      option.variant.sourceVariantId,
      option.variant.wooCommerceProductId,
      option.variant.sourceProductId,
    ].map(normalizeLookupValue).filter(Boolean);

    return Boolean(
      (rowProductKey && productKeys.includes(rowProductKey))
      || (rowVariantKey && variantKeys.includes(rowVariantKey))
    );
  }) ?? null;
};

const getSkuMatch = (row: WebsiteVariantRow, options: InventoryVariantOption[]) => {
  const skuKey = normalizeLookupValue(row.sku);
  if (!skuKey) return null;
  return options.find((option) => normalizeLookupValue(option.sku) === skuKey) ?? null;
};

const getOptionKey = (option: InventoryVariantOption) => `${option.product.id}:${option.variant.id}`;

const getSuggestionKey = (row: WebsiteVariantRow, option: InventoryVariantOption) => `${row.key}:${getOptionKey(option)}`;

const getTokens = (...values: string[]) => (
  values
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
);

const scoreSmartMatch = (row: WebsiteVariantRow, option: InventoryVariantOption) => {
  const rowSku = normalizeLookupValue(row.sku);
  const optionSku = normalizeLookupValue(option.sku);
  const rowName = normalizeLookupValue(row.productName + row.variantName);
  const optionName = normalizeLookupValue(option.productName + option.variantName);
  const rowVariant = normalizeLookupValue(row.variantName);
  const optionVariant = normalizeLookupValue(option.variantName);
  const rowProduct = normalizeLookupValue(row.productName);
  const optionProduct = normalizeLookupValue(option.productName);
  const rowTokens = Array.from(new Set(getTokens(row.productName, row.variantName, row.sku)));
  const optionTokens = new Set(getTokens(option.productName, option.variantName, option.sku));
  const commonTokens = rowTokens.filter((token) => optionTokens.has(token));
  const tokenScore = rowTokens.length ? (commonTokens.length / rowTokens.length) * 46 : 0;
  const priceScore = row.price === option.price ? 10 : Math.abs(row.price - option.price) <= Math.max(row.price * 0.08, 1000) ? 5 : 0;

  let score = tokenScore + priceScore;
  if (rowSku && optionSku && rowSku === optionSku) score += 42;
  if (rowName && optionName && rowName === optionName) score += 30;
  if (rowName && optionName && (rowName.includes(optionName) || optionName.includes(rowName))) score += 18;
  if (rowVariant && optionVariant && rowVariant === optionVariant) score += 14;
  if (rowProduct && optionProduct && rowProduct === optionProduct) score += 12;

  return Math.min(Math.round(score), 100);
};

const getSmartSuggestion = (
  row: WebsiteVariantRow,
  options: InventoryVariantOption[],
  rejectedMatches: Record<string, boolean>,
) => {
  const [best] = options
    .map((option) => ({ option, score: scoreSmartMatch(row, option) }))
    .filter(({ option, score }) => score >= 58 && !rejectedMatches[getSuggestionKey(row, option)])
    .sort((a, b) => b.score - a.score);

  return best ?? null;
};

const cellTextStyle = (color: string, size = 14) => ({
  color,
  fontSize: size,
  fontWeight: '400' as const,
});

type LinkFilter = 'all' | 'linked' | 'not-linked';
type StockFilter = 'all' | 'in-stock' | 'out-of-stock';
type SortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

const sortLabels: Record<SortOption, string> = {
  'name-asc': 'Name A-Z',
  'name-desc': 'Name Z-A',
  'price-asc': 'Price low-high',
  'price-desc': 'Price high-low',
};

export default function InventoryLinkingScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = isDesktop && Platform.OS === 'web';
  const tabBarHeight = useTabBarHeight();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const products = useFyllStore((s) => s.products);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const { hasWooCommerceConnection, isLoading } = useBusinessSettings();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [targetQueryByRow, setTargetQueryByRow] = useState<Record<string, string>>({});
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [rejectedSmartMatches, setRejectedSmartMatches] = useState<Record<string, boolean>>({});

  const websiteRows = useMemo<WebsiteVariantRow[]>(() => (
    products
      .filter(isWebsiteProduct)
      .flatMap((product) => product.variants.map((variant) => ({
        key: `${product.id}:${variant.id}`,
        product,
        variant,
        productName: product.name,
        variantName: getVariantName(variant),
        sku: variant.sku ?? '',
        price: variant.sellingPrice ?? 0,
        stock: variant.stock ?? 0,
        imageUrl: variant.imageUrl || product.imageUrl,
        wooProductId: getWooProductId(product),
        wooVariationId: getWooVariationId(variant),
      })))
      .sort((a, b) => `${a.productName} ${a.variantName}`.localeCompare(`${b.productName} ${b.variantName}`))
  ), [products]);

  const inventoryOptions = useMemo<InventoryVariantOption[]>(() => (
    products
      .filter(isFyllInventoryProduct)
      .flatMap((product) => product.variants.map((variant) => ({
        product,
        variant,
        productName: product.name,
        variantName: getVariantName(variant),
        sku: variant.sku ?? '',
        price: variant.sellingPrice ?? 0,
        stock: variant.stock ?? 0,
      })))
      .sort((a, b) => `${a.productName} ${a.variantName}`.localeCompare(`${b.productName} ${b.variantName}`))
  ), [products]);

  const rowsWithMatches = useMemo(() => websiteRows.map((row) => {
    const manualMatch = getManualLink(row, inventoryOptions);
    const skuMatch = manualMatch ? null : getSkuMatch(row, inventoryOptions);
    const confirmedMatch = manualMatch ?? skuMatch;
    const smartSuggestion = confirmedMatch ? null : getSmartSuggestion(row, inventoryOptions, rejectedSmartMatches);
    return {
      ...row,
      match: confirmedMatch,
      matchType: manualMatch ? 'Linked' : skuMatch ? 'Auto SKU' : 'Not linked',
      isManual: Boolean(manualMatch),
      suggestedMatch: smartSuggestion?.option ?? null,
      suggestionScore: smartSuggestion?.score ?? 0,
    };
  }), [inventoryOptions, rejectedSmartMatches, websiteRows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let nextRows = rowsWithMatches.filter((row) => {
      if (linkFilter === 'linked' && !row.match) return false;
      if (linkFilter === 'not-linked' && row.match) return false;
      if (stockFilter === 'in-stock' && row.stock <= 0) return false;
      if (stockFilter === 'out-of-stock' && row.stock > 0) return false;
      if (!query) return true;
      return [
        row.productName,
        row.variantName,
        row.sku,
        row.match?.productName,
        row.match?.variantName,
        row.match?.sku,
        row.suggestedMatch?.productName,
        row.suggestedMatch?.variantName,
        row.suggestedMatch?.sku,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });

    nextRows = [...nextRows].sort((a, b) => {
      if (sortOption === 'name-desc') return `${b.productName} ${b.variantName}`.localeCompare(`${a.productName} ${a.variantName}`);
      if (sortOption === 'price-asc') return a.price - b.price;
      if (sortOption === 'price-desc') return b.price - a.price;
      return `${a.productName} ${a.variantName}`.localeCompare(`${b.productName} ${b.variantName}`);
    });

    return nextRows;
  }, [linkFilter, rowsWithMatches, searchQuery, sortOption, stockFilter]);

  const filterCounts = useMemo(() => ({
    all: rowsWithMatches.length,
    linked: rowsWithMatches.filter((row) => row.match).length,
    notLinked: rowsWithMatches.filter((row) => !row.match).length,
    inStock: rowsWithMatches.filter((row) => row.stock > 0).length,
    outOfStock: rowsWithMatches.filter((row) => row.stock <= 0).length,
  }), [rowsWithMatches]);

  const getFilteredOptions = (rowKey: string) => {
    const query = (targetQueryByRow[rowKey] ?? '').trim().toLowerCase();
    if (!query) return inventoryOptions.slice(0, 8);
    return inventoryOptions.filter((option) => [
      option.productName,
      option.variantName,
      option.sku,
    ].some((value) => value.toLowerCase().includes(query))).slice(0, 8);
  };

  const linkRowToOption = async (row: WebsiteVariantRow, option: InventoryVariantOption) => {
    const nextVariants = option.product.variants.map((variant) => (
      variant.id === option.variant.id
        ? {
          ...variant,
          wooCommerceProductId: row.wooProductId,
          wooCommerceVariationId: row.wooVariationId,
          sourceProductId: row.wooProductId,
          sourceVariantId: row.wooVariationId,
        }
        : variant
    ));

    await updateProduct(option.product.id, {
      wooCommerceProductId: row.wooProductId,
      sourceProductId: row.wooProductId,
      websiteProductId: row.wooProductId,
      variants: nextVariants,
    }, businessId);
    setActiveRowKey(null);
    setTargetQueryByRow((current) => ({ ...current, [row.key]: '' }));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const unlinkRow = async (row: WebsiteVariantRow) => {
    const manualMatch = getManualLink(row, inventoryOptions);
    if (!manualMatch) return;
    const rowProductKey = normalizeLookupValue(row.wooProductId);
    const rowVariantKey = normalizeLookupValue(row.wooVariationId);
    const nextVariants = manualMatch.product.variants.map((variant) => {
      if (variant.id !== manualMatch.variant.id) return variant;
      const nextVariant = { ...variant };
      if (normalizeLookupValue(nextVariant.wooCommerceVariationId) === rowVariantKey) delete nextVariant.wooCommerceVariationId;
      if (normalizeLookupValue(nextVariant.sourceVariantId) === rowVariantKey) delete nextVariant.sourceVariantId;
      if (normalizeLookupValue(nextVariant.wooCommerceProductId) === rowProductKey) delete nextVariant.wooCommerceProductId;
      if (normalizeLookupValue(nextVariant.sourceProductId) === rowProductKey) delete nextVariant.sourceProductId;
      return nextVariant;
    });

    const nextProduct: Partial<Product> = { variants: nextVariants };
    if (normalizeLookupValue(manualMatch.product.wooCommerceProductId) === rowProductKey) nextProduct.wooCommerceProductId = undefined;
    if (normalizeLookupValue(manualMatch.product.sourceProductId) === rowProductKey) nextProduct.sourceProductId = undefined;
    if (normalizeLookupValue(manualMatch.product.websiteProductId) === rowProductKey) nextProduct.websiteProductId = undefined;

    await updateProduct(manualMatch.product.id, nextProduct, businessId);
  };

  return (
    <SafeAreaView
      className="flex-1"
      edges={isWebDesktop ? [] : ['top']}
      style={{ backgroundColor: colors.bg.primary }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: isWebDesktop ? 1400 : undefined,
          alignSelf: isWebDesktop ? 'flex-start' : undefined,
          paddingHorizontal: isWebDesktop ? 20 : 18,
          paddingTop: isWebDesktop ? 24 : 12,
          paddingBottom: (isWebDesktop ? 36 : tabBarHeight + 32),
          gap: 16,
        }}
      >
        <View className="flex-row items-center">
          {!isWebDesktop ? (
            <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full">
              <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <View className="flex-1">
            <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 28 : 24, lineHeight: isWebDesktop ? 34 : 30, fontWeight: '700' }}>
              Product Linking
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4, fontWeight: '400' }}>
              Link website variants to Fyll inventory products.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
            <Text style={cellTextStyle(colors.text.secondary)}>Checking WooCommerce connection...</Text>
          </View>
        ) : !hasWooCommerceConnection ? (
          <View className="rounded-2xl p-5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
            <Text style={cellTextStyle(colors.text.primary, 18)}>WooCommerce is not connected</Text>
            <Text style={{ ...cellTextStyle(colors.text.secondary, 13), marginTop: 8, lineHeight: 20 }}>
              Product linking only appears after WooCommerce is activated in Connections.
            </Text>
            <Pressable
              onPress={() => router.push('/woocommerce-settings?from=settings' as any)}
              className="mt-4 self-start rounded-full px-4 py-3"
              style={{ backgroundColor: colors.text.primary }}
            >
              <Text style={cellTextStyle(colors.bg.primary, 13)}>Open Connections</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className={isWebDesktop ? 'flex-row items-center' : ''} style={{ gap: 8, zIndex: 80, overflow: 'visible' }}>
              <View
                className="flex-row items-center rounded-full px-4"
                style={{
                  height: 46,
                  width: isWebDesktop ? 360 : '100%',
                  maxWidth: '100%',
                  backgroundColor: colors.bg.card,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Search size={17} color={colors.text.tertiary} strokeWidth={2.1} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search WooCommerce products..."
                  placeholderTextColor={colors.text.tertiary}
                  style={{ flex: 1, marginLeft: 10, color: colors.text.primary, fontSize: 12, fontWeight: '400', outlineStyle: 'none' as any }}
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, flexShrink: 1, marginLeft: isWebDesktop ? 'auto' : 0 }}
                contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 4 }}
              >
                {[
                  { key: 'all' as const, label: `All ${filterCounts.all}` },
                  { key: 'linked' as const, label: `Linked ${filterCounts.linked}` },
                  { key: 'not-linked' as const, label: `Not linked ${filterCounts.notLinked}` },
                ].map((item) => {
                  const active = linkFilter === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setLinkFilter(item.key)}
                      className="rounded-full items-center justify-center px-4"
                      style={{
                        height: 44,
                        backgroundColor: active ? colors.accent.primary : colors.bg.card,
                        borderWidth: active ? 0 : 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{item.label}</Text>
                    </Pressable>
                  );
                })}

                <View style={{ width: 1, height: 26, backgroundColor: colors.border.light }} />

                {[
                  { key: 'in-stock' as const, label: `In stock ${filterCounts.inStock}` },
                  { key: 'out-of-stock' as const, label: `Out of stock ${filterCounts.outOfStock}` },
                ].map((item) => {
                  const active = stockFilter === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setStockFilter(active ? 'all' : item.key)}
                      className="rounded-full items-center justify-center px-4"
                      style={{
                        height: 44,
                        backgroundColor: active ? colors.accent.primary : colors.bg.card,
                        borderWidth: active ? 0 : 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ position: 'relative', zIndex: 90 }}>
                <Pressable
                  onPress={() => setShowSortMenu((value) => !value)}
                  className="rounded-full flex-row items-center justify-center px-4"
                  style={{
                    height: 44,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.text.primary,
                  }}
                >
                  <ArrowDownAZ size={17} color={colors.text.secondary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>{sortLabels[sortOption]}</Text>
                  <ChevronDown size={17} color={colors.text.secondary} strokeWidth={2} style={{ marginLeft: 8 }} />
                </Pressable>

                {showSortMenu ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 52,
                      right: 0,
                      width: 188,
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 16,
                      overflow: 'hidden',
                      zIndex: 100,
                      shadowColor: '#000000',
                      shadowOpacity: 0.12,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 10 },
                    }}
                  >
                    {([
                      ['name-asc', 'Name A-Z'],
                      ['name-desc', 'Name Z-A'],
                      ['price-asc', 'Price low-high'],
                      ['price-desc', 'Price high-low'],
                    ] as Array<[SortOption, string]>).map(([key, label]) => (
                      <Pressable
                        key={key}
                        onPress={() => {
                          setSortOption(key);
                          setShowSortMenu(false);
                        }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          borderBottomWidth: key === 'price-desc' ? 0 : 1,
                          borderBottomColor: colors.border.light,
                          backgroundColor: sortOption === key ? colors.bg.secondary : colors.bg.primary,
                        }}
                      >
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '400' }}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View
                style={{
                  width: '100%',
                  minWidth: isWebDesktop ? 1360 : 980,
                  backgroundColor: colors.bg.card,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                <View
                  className="flex-row items-center"
                  style={{
                    height: 44,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                    paddingHorizontal: 18,
                  }}
                >
                  {[
                    ['Product', 2.1],
                    ['SKU', 1.1],
                    ['Price', 0.8],
                    ['Stock', 0.8],
                    ['Link', 0.9],
                    ['Linked Fyll Ops Product', 2.4],
                  ].map(([label, flex]) => (
                    <Text
                      key={String(label)}
                      style={{
                        flex: Number(flex),
                        color: colors.text.muted,
                        fontSize: 10,
                        fontWeight: '600',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </Text>
                  ))}
                </View>

                {filteredRows.length === 0 ? (
                  <View className="items-center p-10">
                    <Package size={30} color={colors.text.tertiary} strokeWidth={1.8} />
                    <Text style={{ ...cellTextStyle(colors.text.primary, 16), marginTop: 12 }}>No website products found</Text>
                    <Text style={{ ...cellTextStyle(colors.text.tertiary, 13), marginTop: 4, textAlign: 'center' }}>
                      Sync WooCommerce products/orders first, then they will appear here.
                    </Text>
                  </View>
                ) : (
                  filteredRows.map((row, index) => {
                    const active = activeRowKey === row.key;
                    const linked = Boolean(row.match);
                    const statusColor = linked ? '#059669' : '#6B7280';
                    const statusBg = linked ? 'rgba(5, 150, 105, 0.10)' : colors.bg.secondary;
                    const stockColor = row.stock > 0 ? '#6B7280' : '#EF4444';
                    const stockBg = row.stock > 0 ? colors.bg.secondary : 'rgba(239, 68, 68, 0.10)';
                    const rowOptions = active ? getFilteredOptions(row.key) : [];
                    const linkedOptionLabel = row.match ? `${row.match.productName} - ${row.match.variantName}` : '';
                    const suggestedMatch = row.suggestedMatch;
                    const suggestedOptionLabel = suggestedMatch ? `${suggestedMatch.productName} - ${suggestedMatch.variantName}` : '';
                    const displayOptionLabel = linkedOptionLabel || suggestedOptionLabel;

                    return (
                      <View
                        key={row.key}
                        className="flex-row items-center"
                        style={{
                          minHeight: 78,
                          paddingHorizontal: 18,
                          borderBottomWidth: index < filteredRows.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border.light,
                          zIndex: active ? 30 : 1,
                        }}
                      >
                        <View style={{ flex: 2.1, flexDirection: 'row', alignItems: 'center', paddingRight: 18 }}>
                          <View className="h-9 w-9 items-center justify-center rounded-xl mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                            <Package size={17} color={colors.text.tertiary} strokeWidth={1.9} />
                          </View>
                          <View className="flex-1">
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.productName}</Text>
                            <Text style={{ ...cellTextStyle(colors.text.secondary, 12), marginTop: 3 }} numberOfLines={1}>{row.variantName}</Text>
                          </View>
                        </View>

                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', flex: 1.1 }} numberOfLines={1}>{row.sku || '-'}</Text>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 0.8 }} numberOfLines={1}>{formatCurrency(row.price)}</Text>

                        <View style={{ flex: 0.8 }}>
                          <View className="self-start rounded-full px-2.5 py-1" style={{ backgroundColor: stockBg }}>
                            <Text style={{ color: stockColor, fontSize: 12, fontWeight: '600' }}>
                              {row.stock > 0 ? 'In stock' : 'Out of stock'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flex: 0.9 }}>
                          <View
                            className="self-start rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: row.suggestedMatch && !linked ? 'rgba(37, 99, 235, 0.10)' : statusBg,
                            }}
                          >
                            <Text
                              style={{
                                color: row.suggestedMatch && !linked ? '#2563EB' : statusColor,
                                fontSize: 12,
                                fontWeight: '600',
                              }}
                            >
                              {linked ? 'Linked' : row.suggestedMatch ? 'Smart match' : 'Not linked'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flex: 2.4, position: 'relative' }}>
                          <View
                            className="flex-row items-center rounded-2xl px-4"
                            style={{
                              height: 50,
                              backgroundColor: colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: active ? colors.text.primary : colors.border.light,
                            }}
                          >
                            {active ? (
                              <TextInput
                                autoFocus
                                value={targetQueryByRow[row.key] ?? ''}
                                onFocus={() => setActiveRowKey(row.key)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setActiveRowKey((currentKey) => (currentKey === row.key ? null : currentKey));
                                  }, 150);
                                }}
                                onChangeText={(value) => {
                                  setActiveRowKey(row.key);
                                  setTargetQueryByRow((current) => ({ ...current, [row.key]: value }));
                                }}
                                placeholder="Search Fyll Ops products..."
                                placeholderTextColor={colors.text.tertiary}
                                style={{ flex: 1, color: colors.text.primary, fontSize: 12, lineHeight: 16, fontWeight: '400', outlineStyle: 'none' as any }}
                              />
                            ) : (
                              <Pressable onPress={() => setActiveRowKey(row.key)} style={{ flex: 1, justifyContent: 'center' }}>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color: displayOptionLabel ? colors.text.primary : colors.text.tertiary,
                                    fontSize: 12,
                                    lineHeight: 16,
                                    fontWeight: '400',
                                  }}
                                >
                                  {displayOptionLabel || 'Search Fyll Ops products...'}
                                </Text>
                                {row.suggestedMatch && !linked ? (
                                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '400', marginTop: 2 }} numberOfLines={1}>
                                    {row.suggestionScore}% confidence
                                  </Text>
                                ) : null}
                              </Pressable>
                            )}
                            <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={1.9} />
                            {suggestedMatch && !linked ? (
                              <View className="ml-2 flex-row items-center" style={{ gap: 4 }}>
                                <Pressable
                                  onPress={() => linkRowToOption(row, suggestedMatch)}
                                  className="h-8 w-8 items-center justify-center rounded-full"
                                  style={{ backgroundColor: 'rgba(5, 150, 105, 0.12)' }}
                                >
                                  <Check size={15} color="#059669" strokeWidth={2.2} />
                                </Pressable>
                                <Pressable
                                  onPress={() => {
                                    setRejectedSmartMatches((current) => ({
                                      ...current,
                                      [getSuggestionKey(row, suggestedMatch)]: true,
                                    }));
                                  }}
                                  className="h-8 w-8 items-center justify-center rounded-full"
                                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)' }}
                                >
                                  <X size={15} color="#DC2626" strokeWidth={2.2} />
                                </Pressable>
                              </View>
                            ) : null}
                            {row.isManual ? (
                              <Pressable onPress={() => unlinkRow(row)} className="ml-2 h-8 w-8 items-center justify-center rounded-full">
                                <Unlink size={15} color="#DC2626" strokeWidth={2} />
                              </Pressable>
                            ) : null}
                          </View>

                          {active ? (
                            <View
                              style={{
                                position: 'absolute',
                                top: 56,
                                left: 0,
                                right: 0,
                                maxHeight: 276,
                                backgroundColor: colors.bg.primary,
                                borderWidth: 1,
                                borderColor: colors.border.light,
                                borderRadius: 16,
                                overflow: 'hidden',
                                zIndex: 50,
                                shadowColor: '#000000',
                                shadowOpacity: 0.12,
                                shadowRadius: 18,
                                shadowOffset: { width: 0, height: 10 },
                              }}
                            >
                              <ScrollView nestedScrollEnabled style={{ maxHeight: 276 }}>
                                {rowOptions.length === 0 ? (
                                  <View className="p-4">
                                    <Text style={cellTextStyle(colors.text.tertiary, 13)}>No matching Fyll products.</Text>
                                  </View>
                                ) : rowOptions.map((option) => (
                                  <Pressable
                                    key={`${option.product.id}:${option.variant.id}`}
                                    onPress={() => linkRowToOption(row, option)}
                                    className="flex-row items-center px-4 py-3"
                                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                                  >
                                    <Link2 size={15} color={colors.text.tertiary} strokeWidth={1.9} />
                                    <View className="flex-1 ml-3">
                                      <Text style={cellTextStyle(colors.text.primary, 13)} numberOfLines={1}>
                                        {option.productName} - {option.variantName}
                                      </Text>
                                      <Text style={{ ...cellTextStyle(colors.text.tertiary, 11), marginTop: 2 }} numberOfLines={1}>
                                        SKU {option.sku || '-'} · {formatCurrency(option.price)} · {option.stock} in stock
                                      </Text>
                                    </View>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
