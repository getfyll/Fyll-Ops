import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { Product, ProductVariant, generateProductId, generateVariantBarcode } from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

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
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-5">
          <View className="flex-row items-center mb-4">
            <Pressable
              onPress={goBack}
              className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
              style={{ backgroundColor: 'transparent' }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: Platform.OS === 'web' ? 14 : 20,
                lineHeight: Platform.OS === 'web' ? 18 : 24,
                fontWeight: '600',
              }}
            >
              Import Products
            </Text>
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-sm mb-4">
            Upload a CSV with product_name, category, and color. We will group colors under the same product.
          </Text>

          <Pressable
            onPress={handlePickFile}
            className="rounded-2xl items-center justify-center active:opacity-80"
            style={{ backgroundColor: colors.bg.secondary, height: 56 }}
          >
            <View className="flex-row items-center">
              <Upload size={18} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary }} className="font-semibold ml-2">Choose CSV File</Text>
            </View>
          </Pressable>

          {fileName ? (
            <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
              Selected: {fileName}
            </Text>
          ) : null}

          {isParsing ? (
            <View className="mt-4">
              <ActivityIndicator color={colors.text.primary} />
            </View>
          ) : null}

          {error ? (
            <Text className="text-red-500 text-sm mt-3">{error}</Text>
          ) : null}

          {rows.length > 0 && (
            <View className="mt-6 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold mb-2">Preview</Text>
              {preview.map((row, index) => (
                <View key={`${row.name}-${row.color}-${index}`} className="mb-2">
                  <Text style={{ color: colors.text.secondary }} className="text-sm">
                    {row.name} • {row.color}{row.category ? ` • ${row.category}` : ''}
                  </Text>
                </View>
              ))}
              {rows.length > preview.length && (
                <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                  +{rows.length - preview.length} more rows
                </Text>
              )}
            </View>
          )}

          {rows.length > 0 && (
            <Pressable
              onPress={handleImport}
              disabled={isImporting}
              className="mt-6 rounded-2xl items-center justify-center active:opacity-80"
              style={{ backgroundColor: '#111111', height: 56, opacity: isImporting ? 0.6 : 1 }}
            >
              {isImporting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold">Import Products</Text>
              )}
            </Pressable>
          )}

          {summary && (
            <View className="mt-6 rounded-2xl p-4" style={{ backgroundColor: colors.bg.secondary }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold mb-1">Import complete</Text>
              <Text style={{ color: colors.text.secondary }} className="text-sm">
                {summary.totalProducts} products • {summary.totalVariants} variants
              </Text>
              {summary.skippedExisting > 0 && (
                <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
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
