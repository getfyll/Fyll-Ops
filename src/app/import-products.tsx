import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload, Package, Check, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { Product, ProductVariant, generateProductId, generateVariantBarcode } from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

type ImportRow = {
  name: string;
  category?: string;
  color: string;
};

type ImportSummary = {
  totalRows: number;
  totalProducts: number;
  totalVariants: number;
  skippedExisting: number;
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const pickCsvFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
};

const readFileAsString = async (uri: string) => {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return await response.text();
  }
  return await FileSystem.readAsStringAsync(uri);
};

const buildSku = (name: string, color: string, index: number) => {
  const clean = (value: string, size: number) =>
    value.replace(/[^a-z0-9]/gi, '').toUpperCase().padEnd(size, 'X').slice(0, size);
  return `${clean(name, 3)}-${clean(color, 4)}-${String(index + 1).padStart(2, '0')}`;
};

export default function ImportProductsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, settingsPalette.page, settingsPalette.border);
  const businessId = useAuthStore((s) => s.businessId);
  const existingProducts = useFyllStore((s) => s.products);
  const productVariables = useFyllStore((s) => s.productVariables);
  const addProductVariable = useFyllStore((s) => s.addProductVariable);
  const addCategory = useFyllStore((s) => s.addCategory);
  const addProductsBulk = useFyllStore((s) => s.addProductsBulk);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const handlePickFile = async () => {
    setError('');
    setIsParsing(true);
    setRows([]);
    setSummary(null);

    try {
      const file = await pickCsvFile();
      if (!file) {
        setIsParsing(false);
        return;
      }

      setFileName(file.name ?? 'products.csv');
      const contents = await readFileAsString(file.uri);
      const parsed = parseCsv(contents);

      if (parsed.length < 2) {
        setError('CSV is empty or missing data rows.');
        setIsParsing(false);
        return;
      }

      const headers = parsed[0].map((value) => normalizeHeader(value));
      const getIndex = (keys: string[]) =>
        keys.map((key) => headers.indexOf(key)).find((index) => index >= 0) ?? -1;

      const nameIndex = getIndex(['product_name', 'name']);
      const categoryIndex = getIndex(['category', 'product_category']);
      const colorIndex = getIndex(['color', 'colour']);

      if (nameIndex === -1 || colorIndex === -1) {
        setError('CSV must include product_name (or name) and color (or colour).');
        setIsParsing(false);
        return;
      }

      const mapped: ImportRow[] = parsed.slice(1).map((row) => ({
        name: row[nameIndex]?.trim() ?? '',
        category: categoryIndex >= 0 ? row[categoryIndex]?.trim() : '',
        color: row[colorIndex]?.trim() ?? '',
      })).filter((row) => row.name);

      if (!mapped.length) {
        setError('No valid rows found. Check that product_name and color have values.');
        setIsParsing(false);
        return;
      }

      setRows(mapped);
      setIsParsing(false);
    } catch (err) {
      console.error('CSV parse failed:', err);
      setError('Failed to read that file. Please try another CSV.');
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setIsImporting(true);
    setError('');

    try {
      const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));
      const grouped = new Map<string, { name: string; categories: Set<string>; colors: Set<string> }>();

      rows.forEach((row) => {
        const key = row.name.toLowerCase();
        if (!grouped.has(key)) {
          grouped.set(key, { name: row.name.trim(), categories: new Set(), colors: new Set() });
        }
        const group = grouped.get(key);
        if (!group) return;
        if (row.category) group.categories.add(row.category);
        group.colors.add(row.color || 'Default');
      });

      let skippedExisting = 0;
      const productsToAdd: Product[] = [];

      grouped.forEach((group) => {
        if (existingNames.has(group.name.toLowerCase())) {
          skippedExisting += 1;
          return;
        }

        const productId = generateProductId();
        const categories = Array.from(group.categories).filter(Boolean);
        const colors = Array.from(group.colors).filter(Boolean);
        const variants: ProductVariant[] = colors.map((color, index) => ({
          id: `${productId}-${index + 1}`,
          sku: buildSku(group.name, color, index),
          barcode: generateVariantBarcode(),
          variableValues: { Color: color },
          stock: 0,
          sellingPrice: 0,
        }));

        productsToAdd.push({
          id: productId,
          name: group.name,
          description: '',
          categories,
          variants,
          lowStockThreshold: 5,
          createdAt: new Date().toISOString(),
          productType: 'product',
        });

        categories.forEach((category) => addCategory(category));
      });

      const hasColorVariable = productVariables.some(
        (variable) => variable.name.toLowerCase() === 'color'
      );
      if (!hasColorVariable) {
        addProductVariable({
          id: `var-color-${Date.now()}`,
          name: 'Color',
          values: [],
        });
      }

      await addProductsBulk(productsToAdd, businessId);

      setSummary({
        totalRows: rows.length,
        totalProducts: productsToAdd.length,
        totalVariants: productsToAdd.reduce((sum, product) => sum + product.variants.length, 0),
        skippedExisting,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Import failed:', err);
      setError('Import failed. Please check the file and try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
    <SafeAreaView style={{ flex: 1, backgroundColor: settingsPalette.page }}>
      <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} />
      <View className="flex-row items-center" style={{ minHeight: isMobile ? 66 : 58, paddingHorizontal: 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4 }}>
            <Pressable
              onPress={goBack}
              className="w-10 h-10 rounded-full items-center justify-center mr-3 active:opacity-50"
              style={{ backgroundColor: settingsPalette.softFill }}
            >
              <ArrowLeft size={18} color={settingsPalette.text} strokeWidth={2.2} />
            </Pressable>
            <View><Text style={{ color: settingsPalette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text><Text style={{ color: settingsPalette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Import Products</Text></View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ position: 'relative', overflow: 'hidden', minHeight: 156, marginBottom: 22, padding: 20, justifyContent: 'center', borderRadius: 28, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, shadowColor: '#000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
            <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
            <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
            <View className="flex-row items-center" style={{ gap: 15 }}><LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Package size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient><View style={{ flex: 1 }}><Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Product data</Text><MoneyText style={{ color: settingsPalette.text, fontSize: 26, lineHeight: 31 }}>CSV import</MoneyText><Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 3 }}>{summary ? `${summary.totalRows} rows processed` : rows.length ? `${rows.length} rows ready` : 'Upload, preview, then import'}</Text></View></View>
          </View>

          {!rows.length && !summary ? <View className="rounded-3xl p-5 mb-6" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}><Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }}>CSV format</Text><Text style={{ color: settingsPalette.muted, fontSize: 12.5, lineHeight: 19 }}>Include product_name and color columns. Category is optional. Rows with the same product name become colour variants of one product.</Text></View> : null}

          {!summary ? <Pressable
            onPress={handlePickFile}
            className="items-center justify-center active:opacity-80 mb-5"
            style={{ minHeight: 154, padding: 24, borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 2, borderStyle: 'dashed', borderColor: settingsPalette.nudgeBorder }}
          >
            {isParsing ? <><ActivityIndicator color={settingsPalette.limeOnSurface} /><Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 10 }}>Reading file…</Text></> : <><View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: settingsPalette.nudgeBg }}><Upload size={25} color={settingsPalette.limeOnSurface} strokeWidth={2} /></View><MoneyText style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>{rows.length ? 'Change CSV file' : 'Choose CSV file'}</MoneyText><Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 4 }}>{fileName || 'Select a file from your device'}</Text></>}
          </Pressable> : null}

          {error ? (
            <View className="rounded-2xl p-4 mb-4 flex-row items-start" style={{ backgroundColor: settingsPalette.dangerBg, borderWidth: 1, borderColor: settingsPalette.dangerBorder }}><X size={18} color={settingsPalette.danger} strokeWidth={2.2} /><Text style={{ color: settingsPalette.danger, fontSize: 12, lineHeight: 18, marginLeft: 9, flex: 1 }}>{error}</Text></View>
          ) : null}

          {rows.length > 0 && (
            <View className="rounded-3xl overflow-hidden mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', padding: 16, borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>Preview</Text>
              {preview.map((row, index) => (
                <View key={`${row.name}-${row.color}-${index}`} className="px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>
                    {row.name} • {row.color}{row.category ? ` • ${row.category}` : ''}
                  </Text>
                </View>
              ))}
              {rows.length > preview.length && (
                <Text style={{ color: settingsPalette.faint, fontSize: 12, padding: 14, textAlign: 'center' }}>
                  +{rows.length - preview.length} more rows
                </Text>
              )}
            </View>
          )}

          {rows.length > 0 && (
            <Pressable
              onPress={handleImport}
              disabled={isImporting}
              className="rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: FYLL_LIME, height: 52, opacity: isImporting ? 0.6 : 1 }}
            >
              {isImporting ? (
                <ActivityIndicator color={FYLL_LIME_INK} />
              ) : (
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Import products</MoneyText>
              )}
            </Pressable>
          )}

          {summary && (
            <View className="rounded-3xl p-5 items-center" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: settingsPalette.nudgeBg }}><Check size={27} color={settingsPalette.limeOnSurface} strokeWidth={2.5} /></View>
              <MoneyText style={{ color: settingsPalette.text, fontSize: 22, fontWeight: '700', marginBottom: 5 }}>Import complete</MoneyText>
              <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>
                {summary.totalProducts} products • {summary.totalVariants} variants
              </Text>
              {summary.skippedExisting > 0 && (
                <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 5 }}>
                  {summary.skippedExisting} existing products skipped
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
      </View>
    </View>
  );
}
