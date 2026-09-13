import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Calculator, Package, Plus, Receipt, Search, Sparkles, Target, Trash2, X } from 'lucide-react-native';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, type FixedCostFrequency, type FixedCostSetting, type Product } from '@/lib/state/fyll-store';
import { normalizeProductType } from '@/lib/product-utils';
import { SearchClearButton } from '@/components/SearchClearButton';

type ProductChoice = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  currentStock: number;
  currentSellingPrice: number;
  latestProcurementCost: number;
  latestProcurementLabel: string | null;
};

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parseMoney = (value: string): number => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const parsePercent = (value: string): number => Math.min(99, parseMoney(value));

const monthlyFixedCost = (cost: FixedCostSetting): number => {
  if (cost.frequency === 'Quarterly') return cost.amount / 3;
  if (cost.frequency === 'Yearly') return cost.amount / 12;
  return cost.amount;
};

const getVariantName = (values?: Record<string, string>): string => {
  const parts = Object.values(values ?? {}).filter((value) => value.trim().length > 0);
  return parts.length > 0 ? parts.join(' / ') : 'Default';
};

const getChoiceDisplayName = (choice: ProductChoice): string => {
  if (choice.variantName === 'Default') return choice.productName;
  return `${choice.productName} ${choice.variantName}`;
};

const roundPrice = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 1000) return Math.ceil(value / 50) * 50;
  return Math.ceil(value / 500) * 500;
};

const isCalculatorProduct = (product: Product): boolean => {
  if (normalizeProductType(product.productType) === 'service') return false;
  if (product.isArchived || product.isDiscontinued) return false;
  if (product.catalogSource === 'woocommerce-plugin') return false;
  if (product.createdBy === 'WooCommerce Sync') return false;
  if (product.wooCommerceProductId || product.sourceProductId || product.websiteProductId) return false;
  if (product.variants.some((variant) => variant.wooCommerceProductId || variant.sourceProductId)) return false;
  return true;
};

export default function PricingCalculatorScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const isDark = colors.bg.primary !== '#FFFFFF';
  const businessId = useAuthStore((state) => state.businessId ?? state.currentUser?.businessId ?? null);

  const products = useFyllStore((state) => state.products);
  const procurements = useFyllStore((state) => state.procurements);
  const fixedCosts = useFyllStore((state) => state.fixedCosts);
  const addFixedCost = useFyllStore((state) => state.addFixedCost);
  const deleteFixedCost = useFyllStore((state) => state.deleteFixedCost);

  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [procurementCostInput, setProcurementCostInput] = useState('0');
  const [expectedUnitsInput, setExpectedUnitsInput] = useState('100');
  const [fixedCostAllocationInput, setFixedCostAllocationInput] = useState('10');
  const [packagingInput, setPackagingInput] = useState('0');
  const [marketingInput, setMarketingInput] = useState('0');
  const [lossBufferInput, setLossBufferInput] = useState('5');
  const [paymentFeeInput, setPaymentFeeInput] = useState('1.5');
  const [vatInput, setVatInput] = useState('0');
  const [targetMarginInput, setTargetMarginInput] = useState('40');
  const [fixedCostName, setFixedCostName] = useState('');
  const [fixedCostAmount, setFixedCostAmount] = useState('');
  const [fixedCostCategory, setFixedCostCategory] = useState('Overhead');
  const [fixedCostFrequency, setFixedCostFrequency] = useState<FixedCostFrequency>('Monthly');

  const latestProcurementCostByVariant = useMemo(() => {
    const map = new Map<string, { cost: number; label: string; createdAt: number }>();
    procurements.forEach((procurement) => {
      const createdAt = new Date(procurement.createdAt).getTime();
      procurement.items.forEach((item) => {
        const unitCost = Math.max(0, Number(item.unitCost ?? item.costAtPurchase ?? 0));
        const landedUnitCost = Math.max(
          0,
          Number(item.landedUnitCost ?? (unitCost + (item.serviceFee ?? 0) + (item.deliveryFee ?? 0) + (item.shippingClearanceFee ?? 0) + (item.additionalFee ?? 0)))
        );
        const keys = [item.variantId, item.inventoryProductId ? `${item.inventoryProductId}:${item.variantId}` : '', `${item.productId}:${item.variantId}`].filter(Boolean);
        keys.forEach((key) => {
          const previous = map.get(key);
          if (!previous || createdAt > previous.createdAt) {
            map.set(key, {
              cost: landedUnitCost,
              label: procurement.title || `${procurement.supplierName} PO`,
              createdAt,
            });
          }
        });
      });
    });
    return map;
  }, [procurements]);

  const productChoices = useMemo<ProductChoice[]>(() => {
    return products
      .filter(isCalculatorProduct)
      .flatMap((product) =>
        product.variants.map((variant) => {
          const variantName = getVariantName(variant.variableValues);
          const latestCost = latestProcurementCostByVariant.get(`${product.id}:${variant.id}`) ?? latestProcurementCostByVariant.get(variant.id);
          return {
            id: `${product.id}:${variant.id}`,
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName,
            sku: variant.sku,
            currentStock: variant.stock,
            currentSellingPrice: variant.sellingPrice,
            latestProcurementCost: latestCost?.cost ?? 0,
            latestProcurementLabel: latestCost?.label ?? null,
          };
        })
      )
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [latestProcurementCostByVariant, products]);

  const selectedChoice = productChoices.find((choice) => choice.id === selectedChoiceId) ?? null;

  const startNewCalculation = () => {
    setProductSearch('');
    setShowProductModal(true);
  };

  const selectProduct = (choice: ProductChoice) => {
    setSelectedChoiceId(choice.id);
    setProcurementCostInput(String(Math.round(choice.latestProcurementCost || 0)));
    setShowProductModal(false);
  };

  const totalMonthlyFixedCost = fixedCosts.reduce((sum, cost) => sum + monthlyFixedCost(cost), 0);
  const expectedUnits = Math.max(1, Math.floor(parseMoney(expectedUnitsInput)));
  const fixedCostAllocation = parsePercent(fixedCostAllocationInput) / 100;
  const allocatedFixedCostPerUnit = (totalMonthlyFixedCost * fixedCostAllocation) / expectedUnits;
  const procurementCost = parseMoney(procurementCostInput);
  const packagingCost = parseMoney(packagingInput);
  const marketingCost = parseMoney(marketingInput);
  const lossBufferPercent = parsePercent(lossBufferInput) / 100;
  const feePercent = (parsePercent(paymentFeeInput) + parsePercent(vatInput)) / 100;
  const targetMarginPercent = parsePercent(targetMarginInput) / 100;
  const percentageDeductions = feePercent + targetMarginPercent;
  const bufferCost = procurementCost * lossBufferPercent;
  const totalCostBeforePriceFees = procurementCost + allocatedFixedCostPerUnit + packagingCost + marketingCost + bufferCost;
  const rawTargetPrice = percentageDeductions >= 1 ? 0 : totalCostBeforePriceFees / (1 - percentageDeductions);
  const recommendedPrice = roundPrice(rawTargetPrice);
  const estimatedFees = recommendedPrice * feePercent;
  const profitPerUnit = recommendedPrice - totalCostBeforePriceFees - estimatedFees;
  const netMargin = recommendedPrice > 0 ? (profitPerUnit / recommendedPrice) * 100 : 0;
  const markupPercent = totalCostBeforePriceFees > 0 ? ((recommendedPrice - totalCostBeforePriceFees) / totalCostBeforePriceFees) * 100 : 0;
  const currentPrice = selectedChoice?.currentSellingPrice ?? 0;
  const currentProfit = currentPrice - totalCostBeforePriceFees - (currentPrice * feePercent);
  const currentMargin = currentPrice > 0 ? (currentProfit / currentPrice) * 100 : 0;
  const priceGap = recommendedPrice - currentPrice;

  const cardBg = isDark ? '#171719' : '#FFFFFF';
  const insetBg = isDark ? '#101012' : '#F5F5F6';
  const borderColor = isDark ? '#2B2B30' : '#E5E5E5';
  const muted = colors.text.tertiary;
  const primaryButtonBg = colors.text.primary;
  const primaryButtonText = colors.bg.primary;

  const saveFixedCost = () => {
    const name = fixedCostName.trim();
    const amount = parseMoney(fixedCostAmount);
    if (!name || amount <= 0) return;
    addFixedCost({
      id: generateId('fixed-cost'),
      name,
      category: fixedCostCategory.trim() || 'Overhead',
      amount,
      frequency: fixedCostFrequency,
      createdAt: new Date().toISOString(),
    }, businessId ?? undefined);
    setFixedCostName('');
    setFixedCostAmount('');
  };

  const inputStyle = {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor,
    backgroundColor: insetBg,
    color: colors.text.primary,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500' as const,
  };

  const filteredChoices = productChoices.filter((choice) => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      choice.productName.toLowerCase().includes(query) ||
      choice.variantName.toLowerCase().includes(query) ||
      choice.sku.toLowerCase().includes(query)
    );
  });

  const selectedChoiceDisplayName = selectedChoice ? getChoiceDisplayName(selectedChoice) : null;

  const assistantNotes = [
    selectedChoice ? `Sell ${selectedChoiceDisplayName} at about ${formatCurrency(recommendedPrice)} per unit to reach ${parsePercent(targetMarginInput)}% profit margin.` : 'Choose a product, then enter what one unit costs you.',
    currentPrice > 0 && priceGap > 0 ? `Current price is ${formatCurrency(priceGap)} below the recommendation.` : null,
    totalMonthlyFixedCost > 0 ? `${formatCurrency(allocatedFixedCostPerUnit)} from rent, salary and other fixed costs is being added to each unit.` : 'Add rent, salary or other fixed costs if you want them included.',
    lossBufferPercent > 0 ? `Risk buffer adds ${formatCurrency(bufferCost)} per unit for damage, returns or exchange-rate movement.` : null,
  ].filter((note): note is string => Boolean(note));

  const screen = (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 24 : 18, paddingBottom: 48, maxWidth: 1320, width: '100%', alignSelf: 'flex-start' }}
      >
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center flex-1">
            <Pressable
              onPress={() => router.push('/(tabs)/finance?section=overview' as never)}
              className="w-11 h-11 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: insetBg, borderWidth: 1, borderColor }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.25} />
            </Pressable>
            <View className="flex-1">
              <Text style={{ color: colors.text.primary }} className="text-2xl font-semibold">Pricing Calculator</Text>
              <Text style={{ color: muted }} className="text-sm mt-1">Work out what one product should sell for after cost, packaging, fixed costs and profit.</Text>
            </View>
          </View>
          <Pressable
            onPress={startNewCalculation}
            className="h-11 rounded-full px-4 flex-row items-center justify-center"
            style={{ backgroundColor: primaryButtonBg }}
          >
            <Plus size={16} color={primaryButtonText} strokeWidth={2.4} />
            <Text style={{ color: primaryButtonText }} className="text-sm font-semibold ml-1.5">New</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
          <View style={{ flex: 1.05, gap: 16 }}>
            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <Package size={18} color={colors.text.primary} strokeWidth={2.25} />
                  <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Product</Text>
                </View>
                <Pressable onPress={startNewCalculation} className="rounded-full px-3 py-2" style={{ backgroundColor: insetBg }}>
                  <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">Choose</Text>
                </Pressable>
              </View>
              {selectedChoice ? (
                <View className="rounded-2xl p-4 mt-3" style={{ backgroundColor: insetBg }}>
                  <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">{selectedChoiceDisplayName}</Text>
                  <Text style={{ color: muted }} className="text-sm mt-1">SKU {selectedChoice.sku}</Text>
                  <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                    <Pill label={`Stock ${selectedChoice.currentStock}`} />
                    <Pill label={`Current ${formatCurrency(selectedChoice.currentSellingPrice)}`} />
                    <Pill label={selectedChoice.latestProcurementLabel ? `PO ${selectedChoice.latestProcurementLabel}` : 'No PO cost found'} />
                  </View>
                </View>
              ) : (
                <Pressable onPress={startNewCalculation} className="rounded-2xl p-5 mt-3 items-center" style={{ backgroundColor: insetBg, borderWidth: 1, borderColor }}>
                  <Package size={24} color={muted} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="text-base font-semibold mt-2">Choose a product</Text>
                  <Text style={{ color: muted }} className="text-sm mt-1 text-center">Start a new calculation by selecting one product or variant.</Text>
                </Pressable>
              )}
            </View>

            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <View className="flex-row items-center mb-3">
                <Calculator size={18} color={colors.text.primary} strokeWidth={2.25} />
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Calculation inputs</Text>
              </View>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                <Field label="What one unit costs you" help="Use the PO landed cost. Example: if Duc Sip cost 8000, enter 8000." value={procurementCostInput} onChangeText={setProcurementCostInput} inputStyle={inputStyle} />
                <Field label="How many units you expect to sell" help="This spreads rent, salary and other fixed costs across those units." value={expectedUnitsInput} onChangeText={setExpectedUnitsInput} inputStyle={inputStyle} />
                <Field label="How much fixed cost to include" help="Use 10 if this product should carry 10% of your monthly fixed costs." value={fixedCostAllocationInput} onChangeText={setFixedCostAllocationInput} inputStyle={inputStyle} suffix="%" />
              </View>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginTop: 12 }}>
                <Field label="Packaging for one unit" help="Box, bag, cloth, label or handling cost for this item." value={packagingInput} onChangeText={setPackagingInput} inputStyle={inputStyle} />
                <Field label="Marketing or commission per unit" help="Ads, sales commission or marketplace charge for this item." value={marketingInput} onChangeText={setMarketingInput} inputStyle={inputStyle} />
                <Field label="Extra risk buffer" help="Small cover for damage, return, shrinkage or exchange-rate movement." value={lossBufferInput} onChangeText={setLossBufferInput} inputStyle={inputStyle} suffix="%" />
              </View>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginTop: 12 }}>
                <Field label="Payment charge" help="POS/card/Paystack fee. Use 0 if most sales are cash or transfer." value={paymentFeeInput} onChangeText={setPaymentFeeInput} inputStyle={inputStyle} suffix="%" />
                <Field label="Tax to account for" help="Use 0 if tax does not apply to this pricing decision." value={vatInput} onChangeText={setVatInput} inputStyle={inputStyle} suffix="%" />
                <Field label="Profit you want" help="The profit margin you want after all costs and charges." value={targetMarginInput} onChangeText={setTargetMarginInput} inputStyle={inputStyle} suffix="%" />
              </View>
            </View>

            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <View className="flex-row items-center mb-3">
                <Receipt size={18} color={colors.text.primary} strokeWidth={2.25} />
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Fixed costs</Text>
              </View>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10 }}>
                <TextInput placeholder="Rent, salary, utilities..." placeholderTextColor={colors.text.muted} value={fixedCostName} onChangeText={setFixedCostName} style={[inputStyle, { flex: 1.3 }]} />
                <TextInput placeholder="Category" placeholderTextColor={colors.text.muted} value={fixedCostCategory} onChangeText={setFixedCostCategory} style={[inputStyle, { flex: 1 }]} />
                <TextInput placeholder="Amount" placeholderTextColor={colors.text.muted} value={fixedCostAmount} onChangeText={(text) => setFixedCostAmount(text.replace(/[^\d.]/g, ''))} keyboardType="numeric" style={[inputStyle, { flex: 0.8 }]} />
              </View>
              <View className="flex-row items-center mt-3" style={{ gap: 8, flexWrap: 'wrap' }}>
                {(['Monthly', 'Quarterly', 'Yearly'] as FixedCostFrequency[]).map((frequency) => (
                  <Pressable
                    key={frequency}
                    onPress={() => setFixedCostFrequency(frequency)}
                    className="rounded-full px-4 items-center justify-center"
                    style={{ height: 38, backgroundColor: fixedCostFrequency === frequency ? colors.text.primary : insetBg }}
                  >
                    <Text style={{ color: fixedCostFrequency === frequency ? colors.bg.primary : colors.text.secondary }} className="text-xs font-semibold">{frequency}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={saveFixedCost} className="rounded-full px-4 flex-row items-center justify-center" style={{ height: 38, backgroundColor: colors.text.primary }}>
                  <Plus size={14} color={colors.bg.primary} strokeWidth={2.5} />
                  <Text style={{ color: colors.bg.primary }} className="text-xs font-semibold ml-1.5">Add cost</Text>
                </Pressable>
              </View>
              <View className="mt-3">
                {fixedCosts.length === 0 ? (
                  <Text style={{ color: muted }} className="text-sm">Add recurring costs to allocate overhead into product pricing.</Text>
                ) : fixedCosts.map((cost) => (
                  <View key={cost.id} className="flex-row items-center justify-between py-2.5" style={{ borderTopWidth: 1, borderTopColor: borderColor }}>
                    <View className="flex-1 pr-3">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{cost.name}</Text>
                      <Text style={{ color: muted }} className="text-xs mt-0.5">{cost.category} · {cost.frequency}</Text>
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mr-3">{formatCurrency(monthlyFixedCost(cost))}/mo</Text>
                    <Pressable onPress={() => deleteFixedCost(cost.id, businessId ?? undefined)} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: insetBg }}>
                      <Trash2 size={15} color="#DC2626" strokeWidth={2.25} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={{ flex: 0.8, gap: 16 }}>
            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <View className="flex-row items-center mb-4">
                <Target size={18} color={colors.text.primary} strokeWidth={2.25} />
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Sell one unit for</Text>
              </View>
              <Text style={{ color: colors.text.primary }} className="text-4xl font-semibold">{formatCurrency(recommendedPrice)}</Text>
              <Text style={{ color: muted }} className="text-sm mt-2">
                {selectedChoiceDisplayName ?? 'Choose a product to calculate its price.'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                <Metric label="Profit / unit" value={formatCurrency(profitPerUnit)} tone={profitPerUnit >= 0 ? '#16A34A' : '#DC2626'} />
                <Metric label="Net margin" value={`${netMargin.toFixed(1)}%`} tone={netMargin >= 0 ? '#16A34A' : '#DC2626'} />
                <Metric label="Markup" value={`${markupPercent.toFixed(1)}%`} tone={colors.text.primary} />
                <Metric label="Current gap" value={currentPrice > 0 ? formatCurrency(priceGap) : '-'} tone={priceGap > 0 ? '#B45309' : colors.text.primary} />
              </View>
              {percentageDeductions >= 1 ? (
                <Text style={{ color: '#DC2626' }} className="text-sm font-medium mt-4">Target margin plus fees is too high. Lower the percentages.</Text>
              ) : null}
            </View>

            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <View className="flex-row items-center mb-3">
                <Sparkles size={18} color={colors.text.primary} strokeWidth={2.25} />
                <Text style={{ color: colors.text.primary }} className="text-base font-semibold ml-2">Pricing notes</Text>
              </View>
              {assistantNotes.map((note) => (
                <View key={note} className="rounded-2xl p-3 mb-2" style={{ backgroundColor: insetBg }}>
                  <Text style={{ color: colors.text.secondary }} className="text-sm">{note}</Text>
                </View>
              ))}
            </View>

            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <Text style={{ color: colors.text.primary }} className="text-base font-semibold mb-3">What is included per unit</Text>
              {[
                ['Procurement cost', procurementCost],
                ['Business cost per unit', allocatedFixedCostPerUnit],
                ['Packaging per unit', packagingCost],
                ['Marketing / commission', marketingCost],
                ['Risk buffer', bufferCost],
                ['Subtotal before fees', totalCostBeforePriceFees],
                ['Payment fee + VAT at recommended price', estimatedFees],
              ].map(([label, value]) => (
                <View key={label as string} className="flex-row items-center justify-between py-2.5" style={{ borderTopWidth: label === 'Procurement cost' ? 0 : 1, borderTopColor: borderColor }}>
                  <Text style={{ color: muted }} className="text-sm">{label as string}</Text>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{formatCurrency(value as number)}</Text>
                </View>
              ))}
            </View>

            <View className="rounded-3xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
              <Text style={{ color: colors.text.primary }} className="text-base font-semibold mb-3">Current price check</Text>
              {currentPrice > 0 ? (
                <>
                  <Row label="Current selling price" value={formatCurrency(currentPrice)} />
                  <Row label="Current profit / unit" value={formatCurrency(currentProfit)} tone={currentProfit >= 0 ? '#16A34A' : '#DC2626'} />
                  <Row label="Current net margin" value={`${currentMargin.toFixed(1)}%`} tone={currentMargin >= 0 ? '#16A34A' : '#DC2626'} />
                </>
              ) : (
                <Text style={{ color: muted }} className="text-sm">This product has no current selling price saved.</Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showProductModal} transparent animationType="fade" onRequestClose={() => setShowProductModal(false)}>
        <Pressable
          onPress={() => setShowProductModal(false)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)', padding: 18 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="rounded-3xl p-4"
            style={{ width: '100%', maxWidth: 560, maxHeight: '82%', backgroundColor: cardBg, borderWidth: 1, borderColor }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">Choose product variant</Text>
              <Pressable onPress={() => setShowProductModal(false)} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: insetBg }}>
                <X size={17} color={colors.text.secondary} strokeWidth={2.25} />
              </Pressable>
            </View>
            <View className="flex-row items-center rounded-2xl px-3 mb-3" style={{ height: 48, backgroundColor: insetBg, borderWidth: 1, borderColor }}>
              <Search size={17} color={muted} strokeWidth={2} />
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search product, variant or SKU"
                placeholderTextColor={colors.text.muted}
                style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
              />
              <SearchClearButton visible={Boolean(productSearch.trim())} onPress={() => setProductSearch('')} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredChoices.length === 0 ? (
                <Text style={{ color: muted }} className="text-sm text-center py-6">No products found.</Text>
              ) : filteredChoices.map((choice) => (
                <Pressable
                  key={choice.id}
                  onPress={() => selectProduct(choice)}
                  className="rounded-2xl p-3 mb-2"
                  style={{ backgroundColor: choice.id === selectedChoiceId ? insetBg : 'transparent', borderWidth: 1, borderColor }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{getChoiceDisplayName(choice)}</Text>
                  <Text style={{ color: muted }} className="text-xs mt-1">SKU {choice.sku}</Text>
                  <Text style={{ color: colors.text.secondary }} className="text-xs mt-2">
                    Current {formatCurrency(choice.currentSellingPrice)} · PO cost {choice.latestProcurementCost > 0 ? formatCurrency(choice.latestProcurementCost) : 'not found'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );

  if (!isDesktop) return screen;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
      <DesktopSidebar />
      <View style={{ flex: 1 }}>{screen}</View>
    </View>
  );
}

function Field({
  label,
  help,
  suffix,
  value,
  onChangeText,
  inputStyle,
}: {
  label: string;
  help?: string;
  suffix?: string;
  value: string;
  onChangeText: (value: string) => void;
  inputStyle: Record<string, unknown>;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold mb-2">{label}</Text>
      <View>
        <TextInput
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/[^\d.]/g, ''))}
          keyboardType="numeric"
          style={[inputStyle, suffix ? { paddingRight: 34 } : undefined]}
        />
        {suffix ? (
          <Text
            style={{
              color: colors.text.tertiary,
              fontSize: 14,
              fontWeight: '600',
              position: 'absolute',
              right: 14,
              top: 14,
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
      {help ? (
        <Text style={{ color: colors.text.muted }} className="text-xs mt-1.5">{help}</Text>
      ) : null}
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  const colors = useThemeColors();
  return (
    <View className="rounded-2xl p-3" style={{ width: '48%', backgroundColor: colors.bg.secondary }}>
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">{label}</Text>
      <Text style={{ color: tone }} className="text-lg font-semibold mt-1">{value}</Text>
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text style={{ color: colors.text.tertiary }} className="text-sm">{label}</Text>
      <Text style={{ color: tone ?? colors.text.primary }} className="text-sm font-semibold">{value}</Text>
    </View>
  );
}

function Pill({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.secondary }} className="text-xs font-medium">{label}</Text>
    </View>
  );
}
