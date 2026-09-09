import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload, Sparkles, ShoppingCart, Users, Package, Receipt, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  type Customer,
  type Order,
  type OrderItem,
  type Product,
  type ProductVariant,
  type Expense,
  generateOrderNumber,
  generateProductId,
  generateVariantBarcode,
} from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import {
  type ImportEntityType,
  type ImportSelectionType,
  type ImportMappingSuggestion,
  IMPORT_FIELD_DEFINITIONS,
  IMPORT_REQUIRED_FIELDS,
  suggestImportMapping,
  readMappedValue,
  parseCurrencyNumber,
  parseFlexibleDateToIso,
} from '@/lib/ai-import-assistant';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

type ParseStats = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  skippedExisting: number;
};

type ImportSummary = {
  imported: number;
  updated: number;
  created: number;
  skippedInvalid: number;
  skippedExisting: number;
  failed: number;
  note: string;
};

type PreparedCustomerRow = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
};

type PreparedProductRow = {
  name: string;
  category: string;
  color: string;
  sku: string;
  sellingPrice: number;
  stock: number;
};

type PreparedExpenseRow = {
  name: string;
  amount: number;
  dateIso: string;
  category: string;
  supplier: string;
  type: 'one-time' | 'recurring';
  frequency: 'Monthly' | 'Quarterly' | 'Yearly';
  notes: string;
};

type PreparedOrderDraft = {
  sourceOrderNumber?: string;
  importGroup?: string;
  websiteOrderReference?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryState: string;
  deliveryAddress: string;
  paymentMethod?: string;
  source?: string;
  status?: string;
  orderDateIso: string;
  deliveryFee: number;
  additionalCharges: number;
  additionalChargesNote: string;
  discountCode?: string;
  discountAmount?: number;
  items: OrderItem[];
};

type VariantLookupEntry = {
  productId: string;
  variantId: string;
  defaultUnitPrice: number;
};

const IMPORT_OPTIONS: { key: ImportSelectionType; title: string; description: string; icon: typeof ShoppingCart }[] = [
  { key: 'products', title: 'Import Products', description: 'Catalog and inventory rows', icon: Package },
  { key: 'customers', title: 'Import Customers', description: 'Contacts and account data', icon: Users },
  { key: 'orders', title: 'Import Orders', description: 'WooCommerce and other order CSV files', icon: ShoppingCart },
  { key: 'expenses', title: 'Import Expenses', description: 'Historical expense records', icon: Receipt },
  { key: 'auto', title: 'Auto-detect File', description: 'AI detects the dataset type', icon: Sparkles },
];

const IMPORT_RECOMMENDED_STEP: Partial<Record<ImportEntityType, number>> = {
  products: 1,
  customers: 2,
  orders: 3,
  expenses: 4,
};

const AI_GRADIENT_COLORS = ['#4C1D95', '#7C3AED', '#A855F7'] as const;

const normalizeLookupValue = (value: string) => value.trim().toLowerCase();

const generateEntityId = () => Math.random().toString(36).slice(2, 15);

const parsePositiveInt = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseExpenseType = (value: string): 'one-time' | 'recurring' => {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('recur') || normalized.includes('month') || normalized.includes('quarter') || normalized.includes('year')) {
    return 'recurring';
  }
  return 'one-time';
};

const parseExpenseFrequency = (value: string): 'Monthly' | 'Quarterly' | 'Yearly' => {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('quarter')) return 'Quarterly';
  if (normalized.includes('year')) return 'Yearly';
  return 'Monthly';
};

const addInvalidReason = (target: Record<string, number>, reason: string) => {
  target[reason] = (target[reason] ?? 0) + 1;
};

const formatFieldLabel = (field: string) => field.replace(/_/g, ' ');

const buildImportedExpenseDescription = (
  name: string,
  supplier: string,
  type: 'one-time' | 'recurring',
  frequency: 'Monthly' | 'Quarterly' | 'Yearly',
  notes: string
) => {
  const metadataChunks: string[] = [`[type:${type}]`];
  if (supplier.trim()) metadataChunks.push(`[merchant:${supplier.trim()}]`);
  if (type !== 'one-time') metadataChunks.push(`[frequency:${frequency}]`);
  if (notes.trim()) metadataChunks.push(`[note:${notes.trim()}]`);
  return `${name.trim()} ${metadataChunks.join(' ')}`.trim();
};

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
    return response.text();
  }
  return FileSystem.readAsStringAsync(uri);
};

const toRowObjects = (headers: string[], rows: string[][]) => rows.map((row) => {
  const item: Record<string, string> = {};
  headers.forEach((header, index) => {
    item[header] = row[index] ?? '';
  });
  return item;
});

export default function ImportAiScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
  const { isDesktop } = useBreakpoint();
  const useImportTypeGrid = Platform.OS === 'web' && isDesktop;

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? 'Import Assistant');

  const existingCustomers = useFyllStore((s) => s.customers);
  const products = useFyllStore((s) => s.products);
  const productVariables = useFyllStore((s) => s.productVariables);
  const existingOrders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const saleSources = useFyllStore((s) => s.saleSources);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const expenseCategories = useFyllStore((s) => s.expenseCategories);
  const financeSuppliers = useFyllStore((s) => s.financeSuppliers);

  const addCustomer = useFyllStore((s) => s.addCustomer);
  const updateCustomer = useFyllStore((s) => s.updateCustomer);
  const addProductsBulk = useFyllStore((s) => s.addProductsBulk);
  const addProductVariable = useFyllStore((s) => s.addProductVariable);
  const addCategory = useFyllStore((s) => s.addCategory);
  const addOrder = useFyllStore((s) => s.addOrder);
  const addExpense = useFyllStore((s) => s.addExpense);
  const addExpenseCategory = useFyllStore((s) => s.addExpenseCategory);
  const addFinanceSupplier = useFyllStore((s) => s.addFinanceSupplier);

  const [selectedType, setSelectedType] = useState<ImportSelectionType>('auto');
  const [resolvedType, setResolvedType] = useState<ImportEntityType | null>(null);
  const [mappingSuggestion, setMappingSuggestion] = useState<ImportMappingSuggestion | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseStats, setParseStats] = useState<ParseStats>({ totalRows: 0, validRows: 0, invalidRows: 0, skippedExisting: 0 });
  const [ordersMissingProducts, setOrdersMissingProducts] = useState<string[]>([]);
  const [missingRequiredColumns, setMissingRequiredColumns] = useState<string[]>([]);
  const [invalidReasonCounts, setInvalidReasonCounts] = useState<Record<string, number>>({});
  const [previewRows, setPreviewRows] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [preparedCustomers, setPreparedCustomers] = useState<PreparedCustomerRow[]>([]);
  const [preparedProducts, setPreparedProducts] = useState<PreparedProductRow[]>([]);
  const [preparedExpenses, setPreparedExpenses] = useState<PreparedExpenseRow[]>([]);
  const [preparedOrders, setPreparedOrders] = useState<PreparedOrderDraft[]>([]);

  const aiPulse = useSharedValue(0);
  const aiSweep = useSharedValue(-140);

  useEffect(() => {
    if (isAnalyzing) {
      aiPulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
      aiSweep.value = -140;
      aiSweep.value = withRepeat(withTiming(420, { duration: 1250, easing: Easing.linear }), -1, false);
      return;
    }

    aiPulse.value = withTiming(0, { duration: 180 });
    aiSweep.value = withTiming(-140, { duration: 180 });
  }, [aiPulse, aiSweep, isAnalyzing]);

  const aiPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + (aiPulse.value * 0.55),
    transform: [{ scale: 0.92 + (aiPulse.value * 0.18) }],
  }));

  const aiSweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: aiSweep.value }],
  }));

  const variantLookup = useMemo(() => {
    const skuMap = new Map<string, VariantLookupEntry>();
    const barcodeMap = new Map<string, VariantLookupEntry>();
    const productNameMap = new Map<string, VariantLookupEntry>();

    products.forEach((product) => {
      const firstVariant = product.variants[0];
      const productNameKey = normalizeLookupValue(product.name ?? '');
      if (productNameKey && firstVariant && !productNameMap.has(productNameKey)) {
        productNameMap.set(productNameKey, {
          productId: product.id,
          variantId: firstVariant.id,
          defaultUnitPrice: firstVariant.sellingPrice ?? 0,
        });
      }

      product.variants.forEach((variant) => {
        const lookupEntry: VariantLookupEntry = {
          productId: product.id,
          variantId: variant.id,
          defaultUnitPrice: variant.sellingPrice ?? 0,
        };

        const skuKey = normalizeLookupValue(variant.sku ?? '');
        if (skuKey && !skuMap.has(skuKey)) skuMap.set(skuKey, lookupEntry);

        const barcodeKey = normalizeLookupValue(variant.barcode ?? '');
        if (barcodeKey && !barcodeMap.has(barcodeKey)) barcodeMap.set(barcodeKey, lookupEntry);
      });
    });

    return { productNameMap, skuMap, barcodeMap };
  }, [products]);

  const existingOrderNumbers = useMemo(() => new Set(
    existingOrders
      .map((order) => normalizeLookupValue(order.orderNumber ?? ''))
      .filter((value) => Boolean(value))
  ), [existingOrders]);

  const resetPreparedData = () => {
    setPreparedCustomers([]);
    setPreparedProducts([]);
    setPreparedExpenses([]);
    setPreparedOrders([]);
    setOrdersMissingProducts([]);
    setMissingRequiredColumns([]);
    setInvalidReasonCounts({});
    setPreviewRows([]);
    setParseStats({ totalRows: 0, validRows: 0, invalidRows: 0, skippedExisting: 0 });
    setImportSummary(null);
  };

  const handleSelectType = (type: ImportSelectionType) => {
    setSelectedType(type);
    setResolvedType(null);
    setMappingSuggestion(null);
    setFileName('');
    setError('');
    resetPreparedData();
  };

  const handleAnalyzeFile = async () => {
    setError('');
    resetPreparedData();
    setIsAnalyzing(true);
    try {
      const file = await pickCsvFile();
      if (!file) {
        setIsAnalyzing(false);
        return;
      }

      const incomingName = file.name ?? 'import.csv';
      if (!incomingName.toLowerCase().endsWith('.csv')) {
        setError('Please choose a .csv file for now.');
        setIsAnalyzing(false);
        return;
      }

      setFileName(incomingName);
      const text = await readFileAsString(file.uri);
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError('CSV is empty or missing data rows.');
        setIsAnalyzing(false);
        return;
      }

      const headers = parsed[0].map((header) => header.trim());
      const dataRows = parsed.slice(1);
      const rowObjects = toRowObjects(headers, dataRows);
      const suggestion = await suggestImportMapping({
        selectedType,
        headers,
        rows: dataRows,
      });

      const nextType = suggestion.detectedType;
      const mapping = suggestion.mapping;
      setResolvedType(nextType);
      setMappingSuggestion(suggestion);
      const missingRequired = (IMPORT_REQUIRED_FIELDS[nextType] ?? []).filter((field) => !mapping[field]);
      setMissingRequiredColumns(missingRequired);

      if (nextType === 'customers') {
        setOrdersMissingProducts([]);
        const mappedRows: PreparedCustomerRow[] = [];
        const reasonCounts: Record<string, number> = {};
        let invalid = 0;

        rowObjects.forEach((row) => {
          const name = readMappedValue(row, mapping, 'name');
          const email = readMappedValue(row, mapping, 'email');
          const phone = readMappedValue(row, mapping, 'phone');
          const address = readMappedValue(row, mapping, 'address');
          const city = readMappedValue(row, mapping, 'city');
          const state = readMappedValue(row, mapping, 'state');

          if (!name && !email && !phone) {
            invalid += 1;
            addInvalidReason(reasonCounts, 'Missing name, email, and phone.');
            return;
          }

          mappedRows.push({ name, email, phone, address, city, state });
        });

        setPreparedCustomers(mappedRows);
        setPreviewRows(mappedRows.slice(0, 8).map((row) => `${row.name || '-'} • ${row.email || '-'} • ${row.phone || '-'}`));
        setParseStats({
          totalRows: rowObjects.length,
          validRows: mappedRows.length,
          invalidRows: invalid,
          skippedExisting: 0,
        });
        setInvalidReasonCounts(reasonCounts);
      }

      if (nextType === 'products') {
        setOrdersMissingProducts([]);
        const mappedRows: PreparedProductRow[] = [];
        const reasonCounts: Record<string, number> = {};
        let invalid = 0;

        rowObjects.forEach((row) => {
          const name = readMappedValue(row, mapping, 'name');
          const category = readMappedValue(row, mapping, 'category');
          const color = readMappedValue(row, mapping, 'color') || 'Default';
          const sku = readMappedValue(row, mapping, 'sku');
          const sellingPrice = parseCurrencyNumber(readMappedValue(row, mapping, 'selling_price'));
          const stock = Number.parseInt(readMappedValue(row, mapping, 'stock') || '0', 10);

          if (!name) {
            invalid += 1;
            addInvalidReason(reasonCounts, 'Missing product name.');
            return;
          }

          mappedRows.push({
            name,
            category,
            color,
            sku,
            sellingPrice,
            stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
          });
        });

        setPreparedProducts(mappedRows);
        setPreviewRows(mappedRows.slice(0, 8).map((row) => `${row.name} • ${row.color} • ₦${row.sellingPrice.toLocaleString()}`));
        setParseStats({
          totalRows: rowObjects.length,
          validRows: mappedRows.length,
          invalidRows: invalid,
          skippedExisting: 0,
        });
        setInvalidReasonCounts(reasonCounts);
      }

      if (nextType === 'expenses') {
        setOrdersMissingProducts([]);
        const mappedRows: PreparedExpenseRow[] = [];
        const reasonCounts: Record<string, number> = {};
        let invalid = 0;

        rowObjects.forEach((row) => {
          const name = readMappedValue(row, mapping, 'name');
          const amount = parseCurrencyNumber(readMappedValue(row, mapping, 'amount'));
          const dateIso = parseFlexibleDateToIso(readMappedValue(row, mapping, 'date'));
          const category = readMappedValue(row, mapping, 'category') || 'General';
          const supplier = readMappedValue(row, mapping, 'supplier');
          const type = parseExpenseType(readMappedValue(row, mapping, 'type'));
          const frequency = parseExpenseFrequency(readMappedValue(row, mapping, 'frequency'));
          const notes = readMappedValue(row, mapping, 'notes');

          let hasError = false;
          if (!name) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Missing expense name.');
          }
          if (amount <= 0) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Amount must be greater than zero.');
          }

          if (hasError) {
            invalid += 1;
            return;
          }

          mappedRows.push({ name, amount, dateIso, category, supplier, type, frequency, notes });
        });

        setPreparedExpenses(mappedRows);
        setPreviewRows(mappedRows.slice(0, 8).map((row) => `${row.name} • ₦${row.amount.toLocaleString()} • ${row.category}`));
        setParseStats({
          totalRows: rowObjects.length,
          validRows: mappedRows.length,
          invalidRows: invalid,
          skippedExisting: 0,
        });
        setInvalidReasonCounts(reasonCounts);
      }

      if (nextType === 'orders') {
        setOrdersMissingProducts([]);
        const grouped = new Map<string, PreparedOrderDraft>();
        const missingProducts = new Set<string>();
        const reasonCounts: Record<string, number> = {};
        const validPreview: string[] = [];
        let invalidRows = 0;
        let skippedExistingRows = 0;

        rowObjects.forEach((row, index) => {
          const orderNumber = readMappedValue(row, mapping, 'order_number');
          const importGroup = readMappedValue(row, mapping, 'import_group');
          const websiteOrderReference = readMappedValue(row, mapping, 'website_order_reference');
          const customerName = readMappedValue(row, mapping, 'customer_name');
          const customerEmail = readMappedValue(row, mapping, 'customer_email');
          const customerPhone = readMappedValue(row, mapping, 'customer_phone');
          const deliveryState = readMappedValue(row, mapping, 'delivery_state');
          const deliveryAddress = readMappedValue(row, mapping, 'delivery_address');
          const productName = readMappedValue(row, mapping, 'product_name');
          const itemSku = readMappedValue(row, mapping, 'item_sku');
          const itemBarcode = readMappedValue(row, mapping, 'item_barcode');
          const quantity = parsePositiveInt(readMappedValue(row, mapping, 'quantity'));
          const unitPriceRaw = parseCurrencyNumber(readMappedValue(row, mapping, 'unit_price'));

          let hasError = false;
          if (!customerName) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Missing customer name.');
          }
          if (!deliveryState) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Missing delivery state.');
          }
          if (!deliveryAddress) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Missing delivery address.');
          }
          if (!productName) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Missing product name.');
          }
          if (!Number.isFinite(quantity) || quantity <= 0) {
            hasError = true;
            addInvalidReason(reasonCounts, 'Quantity must be a valid number greater than zero.');
          }

          if (hasError) {
            invalidRows += 1;
            return;
          }

          const orderNumberKey = normalizeLookupValue(orderNumber);
          if (orderNumberKey && existingOrderNumbers.has(orderNumberKey)) {
            skippedExistingRows += 1;
            return;
          }

          const productLookup = variantLookup.productNameMap.get(normalizeLookupValue(productName));
          if (!productLookup) {
            missingProducts.add(productName);
            invalidRows += 1;
            addInvalidReason(reasonCounts, 'Product name not found in existing catalog.');
            return;
          }

          const skuLookup = itemSku ? variantLookup.skuMap.get(normalizeLookupValue(itemSku)) : undefined;
          const barcodeLookup = itemBarcode ? variantLookup.barcodeMap.get(normalizeLookupValue(itemBarcode)) : undefined;
          let lookup = productLookup;

          if (skuLookup && skuLookup.productId === productLookup.productId) {
            lookup = skuLookup;
          } else if (barcodeLookup && barcodeLookup.productId === productLookup.productId) {
            lookup = barcodeLookup;
          }

          const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : lookup.defaultUnitPrice;
          const item: OrderItem = {
            productId: lookup.productId,
            variantId: lookup.variantId,
            quantity,
            unitPrice,
          };

          const groupSeed = orderNumber || importGroup || websiteOrderReference || `row-${index}`;
          const groupType = orderNumber ? 'order' : (importGroup ? 'group' : (websiteOrderReference ? 'web' : 'row'));
          const groupKey = `${groupType}:${normalizeLookupValue(groupSeed)}`;

          const existingGroup = grouped.get(groupKey);
          if (existingGroup) {
            existingGroup.items.push(item);
          } else {
            grouped.set(groupKey, {
              sourceOrderNumber: orderNumber,
              importGroup,
              websiteOrderReference,
              customerName,
              customerEmail,
              customerPhone,
              deliveryState,
              deliveryAddress,
              paymentMethod: readMappedValue(row, mapping, 'payment_method'),
              source: readMappedValue(row, mapping, 'source'),
              status: readMappedValue(row, mapping, 'status'),
              orderDateIso: parseFlexibleDateToIso(readMappedValue(row, mapping, 'order_date')),
              deliveryFee: parseCurrencyNumber(readMappedValue(row, mapping, 'delivery_fee')),
              additionalCharges: parseCurrencyNumber(readMappedValue(row, mapping, 'additional_charges')),
              additionalChargesNote: readMappedValue(row, mapping, 'additional_charges_note'),
              discountCode: readMappedValue(row, mapping, 'discount_code'),
              discountAmount: parseCurrencyNumber(readMappedValue(row, mapping, 'discount_amount')),
              items: [item],
            });
          }

          validPreview.push(`${orderNumber || 'Auto order'} • ${customerName} • ${productName} • Qty ${quantity}`);
        });

        const prepared = Array.from(grouped.values()).filter((row) => row.items.length > 0);
        setPreparedOrders(prepared);
        setOrdersMissingProducts(Array.from(missingProducts).slice(0, 8));
        setPreviewRows(validPreview.slice(0, 8));
        setParseStats({
          totalRows: rowObjects.length,
          validRows: validPreview.length,
          invalidRows,
          skippedExisting: skippedExistingRows,
        });
        setInvalidReasonCounts(reasonCounts);
      }

      setIsAnalyzing(false);
    } catch (analysisError) {
      console.error('AI import analysis failed:', analysisError);
      setError('Could not analyze this file. Please retry with a clean CSV export.');
      setIsAnalyzing(false);
    }
  };

  const handleRunImport = async () => {
    if (!resolvedType) {
      setError('Choose and analyze a file first.');
      return;
    }

    if (!businessId) {
      setError('No active business found. Sign in again and retry.');
      return;
    }

    setError('');
    setIsImporting(true);

    try {
      if (resolvedType === 'customers') {
        const byEmail = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.email), row]));
        const byPhone = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.phone), row]));
        const byName = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.fullName), row]));

        let created = 0;
        let updated = 0;
        let skippedInvalid = 0;

        for (const row of preparedCustomers) {
          if (!row.name && !row.email && !row.phone) {
            skippedInvalid += 1;
            continue;
          }

          const keyEmail = normalizeLookupValue(row.email);
          const keyPhone = normalizeLookupValue(row.phone);
          const keyName = normalizeLookupValue(row.name);

          const existing = byEmail.get(keyEmail) || byPhone.get(keyPhone) || byName.get(keyName);
          const fullAddress = [row.address, row.city, row.state].filter(Boolean).join(', ');

          if (existing) {
            const patch: Partial<Customer> = {};
            if (row.email && row.email !== existing.email) patch.email = row.email;
            if (row.phone && row.phone !== existing.phone) patch.phone = row.phone;
            if (fullAddress && fullAddress !== existing.defaultAddress) patch.defaultAddress = fullAddress;
            if (row.state && row.state !== existing.defaultState) patch.defaultState = row.state;
            if (Object.keys(patch).length > 0) {
              updateCustomer(existing.id, patch);
              updated += 1;
            }
            continue;
          }

          const newCustomer: Customer = {
            id: `cust-${generateEntityId()}`,
            fullName: row.name || row.email || row.phone,
            email: row.email,
            phone: row.phone,
            defaultAddress: fullAddress,
            defaultState: row.state,
            createdAt: new Date().toISOString(),
          };

          await addCustomer(newCustomer, businessId);
          created += 1;
        }

        setImportSummary({
          imported: created + updated,
          created,
          updated,
          skippedInvalid,
          skippedExisting: 0,
          failed: 0,
          note: 'Customers imported successfully.',
        });
      }

      if (resolvedType === 'products') {
        const existingNames = new Set(products.map((row) => normalizeLookupValue(row.name)));
        const grouped = new Map<string, PreparedProductRow[]>();
        preparedProducts.forEach((row) => {
          const key = normalizeLookupValue(row.name);
          const bucket = grouped.get(key) ?? [];
          bucket.push(row);
          grouped.set(key, bucket);
        });

        const productsToAdd: Product[] = [];
        let skippedExisting = 0;

        grouped.forEach((rows, key) => {
          if (existingNames.has(key)) {
            skippedExisting += 1;
            return;
          }

          const representative = rows[0];
          const productId = generateProductId();
          const categories = Array.from(new Set(rows.map((row) => row.category).filter(Boolean)));
          const variants: ProductVariant[] = rows.map((row, index) => ({
            id: `${productId}-${index + 1}`,
            sku: row.sku || `${representative.name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
            barcode: generateVariantBarcode(),
            variableValues: { Color: row.color || 'Default' },
            stock: row.stock,
            sellingPrice: row.sellingPrice,
          }));

          productsToAdd.push({
            id: productId,
            name: representative.name,
            description: '',
            categories,
            variants,
            lowStockThreshold: 5,
            createdAt: new Date().toISOString(),
            productType: 'product',
          });

          categories.forEach((category) => addCategory(category));
        });

        const hasColorVariable = productVariables.some((variable) => normalizeLookupValue(variable.name) === 'color');
        if (!hasColorVariable) {
          addProductVariable({ id: `var-color-${Date.now()}`, name: 'Color', values: [] });
        }

        await addProductsBulk(productsToAdd, businessId);

        setImportSummary({
          imported: productsToAdd.length,
          created: productsToAdd.length,
          updated: 0,
          skippedInvalid: Math.max(0, parseStats.invalidRows),
          skippedExisting,
          failed: 0,
          note: 'Products imported successfully.',
        });
      }

      if (resolvedType === 'expenses') {
        const existingCategoryNames = new Set(expenseCategories.map((row) => normalizeLookupValue(row.name)));
        const existingSuppliers = new Set(financeSuppliers.map((row) => normalizeLookupValue(row.name)));

        let created = 0;

        preparedExpenses.forEach((row) => {
          const categoryName = row.category || 'General';
          const supplierName = row.supplier;
          const description = buildImportedExpenseDescription(row.name, supplierName, row.type, row.frequency, row.notes);
          const expense: Expense = {
            id: `expense-${generateEntityId()}`,
            category: categoryName,
            description,
            amount: row.amount,
            date: row.dateIso,
            createdAt: new Date().toISOString(),
            createdBy: currentUserName,
            status: 'paid',
          };
          addExpense(expense, businessId);
          created += 1;

          const normalizedCategory = normalizeLookupValue(categoryName);
          if (normalizedCategory && !existingCategoryNames.has(normalizedCategory)) {
            existingCategoryNames.add(normalizedCategory);
            addExpenseCategory({ id: `expense-category-${generateEntityId()}`, name: categoryName });
          }

          const normalizedSupplier = normalizeLookupValue(supplierName);
          if (normalizedSupplier && !existingSuppliers.has(normalizedSupplier)) {
            existingSuppliers.add(normalizedSupplier);
            addFinanceSupplier({ id: `finance-supplier-${generateEntityId()}`, name: supplierName }, businessId);
          }
        });

        setImportSummary({
          imported: created,
          created,
          updated: 0,
          skippedInvalid: Math.max(0, parseStats.invalidRows),
          skippedExisting: 0,
          failed: 0,
          note: 'Expenses imported successfully.',
        });
      }

      if (resolvedType === 'orders') {
        const customersByEmail = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.email), row]));
        const customersByPhone = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.phone), row]));
        const customersByName = new Map(existingCustomers.map((row) => [normalizeLookupValue(row.fullName), row]));

        const usedOrderNumbers = new Set(
          existingOrders
            .map((row) => normalizeLookupValue(row.orderNumber))
            .filter(Boolean)
        );

        const generateUniqueOrderNumber = () => {
          let next = generateOrderNumber();
          let key = normalizeLookupValue(next);
          let attempts = 0;
          while (usedOrderNumbers.has(key)) {
            attempts += 1;
            next = `${generateOrderNumber()}-${attempts}`;
            key = normalizeLookupValue(next);
          }
          usedOrderNumbers.add(key);
          return next;
        };

        let imported = 0;
        let skippedExisting = 0;
        let failed = 0;

        for (const draft of preparedOrders) {
          try {
            const sourceOrderNumber = draft.sourceOrderNumber?.trim() ?? '';
            const sourceOrderKey = normalizeLookupValue(sourceOrderNumber);
            if (sourceOrderKey && usedOrderNumbers.has(sourceOrderKey)) {
              skippedExisting += 1;
              continue;
            }

            let customer = customersByEmail.get(normalizeLookupValue(draft.customerEmail))
              || customersByPhone.get(normalizeLookupValue(draft.customerPhone))
              || customersByName.get(normalizeLookupValue(draft.customerName));

            if (!customer) {
              const createdCustomer: Customer = {
                id: `cust-${generateEntityId()}`,
                fullName: draft.customerName,
                email: draft.customerEmail,
                phone: draft.customerPhone,
                defaultAddress: draft.deliveryAddress,
                defaultState: draft.deliveryState,
                createdAt: new Date().toISOString(),
              };
              await addCustomer(createdCustomer, businessId);
              customer = createdCustomer;

              if (createdCustomer.email) customersByEmail.set(normalizeLookupValue(createdCustomer.email), createdCustomer);
              if (createdCustomer.phone) customersByPhone.set(normalizeLookupValue(createdCustomer.phone), createdCustomer);
              if (createdCustomer.fullName) customersByName.set(normalizeLookupValue(createdCustomer.fullName), createdCustomer);
            }

            const subtotal = draft.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
            const discountAmount = draft.discountAmount && draft.discountAmount > 0 ? draft.discountAmount : undefined;
            const totalAmount = subtotal + draft.deliveryFee + draft.additionalCharges - (discountAmount ?? 0);

            const orderNumber = sourceOrderNumber || generateUniqueOrderNumber();
            if (sourceOrderKey) usedOrderNumbers.add(sourceOrderKey);

            const order: Order = {
              id: `order-${generateEntityId()}`,
              orderNumber,
              websiteOrderReference: draft.websiteOrderReference || undefined,
              customerId: customer.id,
              customerName: draft.customerName,
              customerEmail: draft.customerEmail,
              customerPhone: draft.customerPhone,
              deliveryState: draft.deliveryState,
              deliveryAddress: draft.deliveryAddress,
              items: draft.items,
              services: [],
              additionalCharges: draft.additionalCharges,
              additionalChargesNote: draft.additionalChargesNote,
              deliveryFee: draft.deliveryFee,
              discountCode: draft.discountCode || undefined,
              discountAmount,
              paymentMethod: draft.paymentMethod || paymentMethods[0]?.name || 'Imported',
              orderClassification: 'Sale',
              status: draft.status || orderStatuses[0]?.name || 'Processing',
              source: draft.source || saleSources[0]?.name || 'Imported CSV',
              subtotal,
              totalAmount,
              orderDate: draft.orderDateIso,
              createdAt: draft.orderDateIso,
              updatedAt: new Date().toISOString(),
              createdBy: currentUserName || 'Import Assistant',
            };

            await addOrder(order, businessId);
            imported += 1;
          } catch (orderError) {
            console.error('Order import failed for draft', orderError);
            failed += 1;
          }
        }

        setImportSummary({
          imported,
          created: imported,
          updated: 0,
          skippedInvalid: parseStats.invalidRows,
          skippedExisting,
          failed,
          note: 'Orders imported successfully.',
        });
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsImporting(false);
    } catch (importError) {
      console.error('AI import failed:', importError);
      setError('Import failed. Please retry with a cleaner file export.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsImporting(false);
    }
  };

  const canImport = (
    (resolvedType === 'customers' && preparedCustomers.length > 0)
    || (resolvedType === 'products' && preparedProducts.length > 0)
    || (resolvedType === 'orders' && preparedOrders.length > 0)
    || (resolvedType === 'expenses' && preparedExpenses.length > 0)
  );
  const invalidReasonEntries = Object.entries(invalidReasonCounts).sort((a, b) => b[1] - a[1]);
  const hasAnalyzedFile = Boolean(mappingSuggestion) || parseStats.totalRows > 0;
  const importDisabledReason = !businessId
    ? 'No active business found. Sign in again and retry.'
    : !resolvedType
      ? 'Analyze a CSV file first.'
      : canImport
        ? ''
        : (
          missingRequiredColumns.length > 0
            ? `Required columns not mapped: ${missingRequiredColumns.map(formatFieldLabel).join(', ')}.`
            : (
          resolvedType === 'orders' && ordersMissingProducts.length > 0
            ? 'No valid order rows yet. Product names in CSV must match products in your catalog.'
            : 'No valid rows to import yet. Check mapping and required fields.'
            )
        );

  const mappingFields = resolvedType ? IMPORT_FIELD_DEFINITIONS[resolvedType] : [];

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }} edges={['top']}>
          <View className="flex-row items-center px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
            <Pressable
              onPress={goBack}
              className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
              style={{ backgroundColor: 'transparent' }}
            >
              <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: Platform.OS === 'web' ? 14 : 20,
                  lineHeight: Platform.OS === 'web' ? 18 : 24,
                  fontWeight: '600',
                }}
              >
                AI Import Assistant
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-0.5">Choose what to import, then upload one CSV file.</Text>
            </View>
          </View>

          <ScrollView className="flex-1 px-5 py-5" showsVerticalScrollIndicator={false}>
            <View className="rounded-2xl p-4 overflow-hidden" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
              <LinearGradient
                colors={['rgba(124,58,237,0.18)', 'rgba(59,130,246,0.06)', 'rgba(217,70,239,0.16)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Choose Import Type</Text>
                <View className="rounded-full px-2.5 py-1" style={{ borderWidth: 1, borderColor: 'rgba(168,85,247,0.45)', backgroundColor: 'rgba(76,29,149,0.35)' }}>
                  <Text style={{ color: '#DDD6FE' }} className="text-[10px] font-semibold">AI Powered</Text>
                </View>
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mb-3">
                Recommended order: 1 Products, 2 Customers, 3 Orders, 4 Expenses. Use Auto-detect if unsure.
              </Text>
              <View style={useImportTypeGrid ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } : { gap: 10 }}>
                {IMPORT_OPTIONS.map((option) => {
                  const active = selectedType === option.key;
                  const isAiOption = option.key === 'auto';
                  const Icon = option.icon;
                  const recommendedStep = option.key === 'auto' ? null : IMPORT_RECOMMENDED_STEP[option.key as ImportEntityType] ?? null;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => handleSelectType(option.key)}
                      className={`rounded-xl ${useImportTypeGrid ? 'p-3' : 'p-3.5 flex-row items-center'}`}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? '#8B5CF6' : colors.border.light,
                        backgroundColor: active
                          ? (isAiOption ? 'rgba(124,58,237,0.22)' : colors.bg.card)
                          : (isAiOption ? 'rgba(76,29,149,0.12)' : colors.bg.primary),
                        ...(useImportTypeGrid
                          ? {
                              flexBasis: '24%',
                              maxWidth: '24%',
                              minWidth: 170,
                            }
                          : {}),
                      }}
                    >
                      {useImportTypeGrid ? (
                        <>
                          <View className="flex-row items-center justify-between">
                            <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: isAiOption ? 'rgba(76,29,149,0.35)' : colors.bg.secondary }}>
                              <Icon size={16} color={active ? '#DDD6FE' : colors.text.tertiary} strokeWidth={2} />
                            </View>
                            <View className="flex-row items-center" style={{ gap: 8 }}>
                              {recommendedStep ? (
                                <View
                                  className="w-5 h-5 rounded-full items-center justify-center"
                                  style={{ backgroundColor: active ? colors.text.primary : colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                                >
                                  <Text
                                    className="text-[10px] font-semibold"
                                    style={{ color: active ? colors.bg.primary : colors.text.secondary }}
                                  >
                                    {recommendedStep}
                                  </Text>
                                </View>
                              ) : null}
                              {active ? <CheckCircle2 size={15} color={colors.text.primary} strokeWidth={2.2} /> : null}
                            </View>
                          </View>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-2">{option.title}</Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={2}>{option.description}</Text>
                        </>
                      ) : (
                        <>
                          <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: isAiOption ? 'rgba(76,29,149,0.35)' : colors.bg.secondary }}>
                            <Icon size={16} color={active ? '#DDD6FE' : colors.text.tertiary} strokeWidth={2} />
                          </View>
                          <View className="ml-3" style={{ flex: 1 }}>
                            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{option.title}</Text>
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{option.description}</Text>
                          </View>
                          {recommendedStep ? (
                            <View
                              className="w-6 h-6 rounded-full items-center justify-center mr-2"
                              style={{ backgroundColor: active ? colors.text.primary : colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                            >
                              <Text
                                className="text-[11px] font-semibold"
                                style={{ color: active ? colors.bg.primary : colors.text.secondary }}
                              >
                                {recommendedStep}
                              </Text>
                            </View>
                          ) : null}
                          {active ? <CheckCircle2 size={16} color={colors.text.primary} strokeWidth={2.2} /> : null}
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="mt-4 rounded-2xl p-5 overflow-hidden" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, borderStyle: 'dashed' }}>
              <LinearGradient
                colors={['rgba(124,58,237,0.18)', 'rgba(2,6,23,0)', 'rgba(168,85,247,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mb-2">Upload CSV File</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mb-3">
                V1 accepts CSV files. AI maps columns, then you approve import.
              </Text>
              <Pressable
                onPress={handleAnalyzeFile}
                disabled={isAnalyzing || isImporting}
                className="rounded-full items-center justify-center active:opacity-80"
                style={{
                  height: 48,
                  borderWidth: 1,
                  borderColor: '#8B5CF6',
                  backgroundColor: isAnalyzing || isImporting ? 'rgba(76,29,149,0.22)' : 'transparent',
                  opacity: isImporting ? 0.6 : 1,
                  overflow: 'hidden',
                }}
              >
                {!isAnalyzing && !isImporting ? (
                  <LinearGradient
                    colors={AI_GRADIENT_COLORS}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                {isAnalyzing ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator size="small" color="#DDD6FE" />
                    <Text style={{ color: '#DDD6FE' }} className="font-semibold ml-2">AI Analyzing CSV...</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <Upload size={16} color="#F8FAFC" strokeWidth={2} />
                    <Text style={{ color: '#F8FAFC' }} className="font-semibold ml-2">Choose and Analyze CSV</Text>
                  </View>
                )}
              </Pressable>
              {isAnalyzing ? (
                <View
                  className="mt-3 rounded-xl px-3 py-3 overflow-hidden"
                  style={{ borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)', backgroundColor: 'rgba(76,29,149,0.3)' }}
                >
                  <LinearGradient
                    colors={['rgba(124,58,237,0.24)', 'rgba(59,130,246,0.14)', 'rgba(217,70,239,0.22)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                    <View className="flex-row items-center" style={{ gap: 8, flex: 1 }}>
                      <Animated.View
                        style={[
                          {
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            backgroundColor: '#E9D5FF',
                          },
                          aiPulseStyle,
                        ]}
                      />
                      <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600', flex: 1 }}>
                        AI is reading headers and mapping your fields...
                      </Text>
                    </View>
                    <Sparkles size={14} color="#DDD6FE" strokeWidth={2} />
                  </View>
                  <View
                    className="mt-2"
                    style={{ height: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(148,163,184,0.25)' }}
                  >
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          width: 140,
                        },
                        aiSweepStyle,
                      ]}
                    >
                      <LinearGradient
                        colors={['rgba(168,85,247,0)', 'rgba(196,181,253,0.95)', 'rgba(168,85,247,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ flex: 1 }}
                      />
                    </Animated.View>
                  </View>
                </View>
              ) : null}
              {fileName ? (
                <Text style={{ color: colors.text.muted }} className="text-xs mt-2">Selected: {fileName}</Text>
              ) : null}
            </View>

            {mappingSuggestion ? (
              <View
                className="mt-4 rounded-2xl p-4 overflow-hidden"
                style={{
                  backgroundColor: colors.bg.card,
                  borderWidth: 1,
                  borderColor: mappingSuggestion.usedAI ? '#8B5CF6' : colors.border.light,
                }}
              >
                {mappingSuggestion.usedAI ? (
                  <LinearGradient
                    colors={['rgba(124,58,237,0.22)', 'rgba(59,130,246,0.08)', 'rgba(217,70,239,0.16)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
                      Detected: {mappingSuggestion.detectedType.charAt(0).toUpperCase() + mappingSuggestion.detectedType.slice(1)}
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                      Confidence: {mappingSuggestion.confidence.toUpperCase()} • {mappingSuggestion.usedAI ? 'AI mapping' : 'Smart header mapping'}
                    </Text>
                  </View>
                  <Sparkles size={16} color={mappingSuggestion.usedAI ? '#C4B5FD' : colors.text.tertiary} strokeWidth={2} />
                </View>
                <Text style={{ color: colors.text.secondary }} className="text-xs mt-2">{mappingSuggestion.note}</Text>

                <View className="mt-3" style={{ gap: 8 }}>
                  {mappingFields.slice(0, 12).map((field) => (
                    <View key={field} className="flex-row items-center justify-between" style={{ gap: 10 }}>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>{field.replace(/_/g, ' ')}</Text>
                      <Text style={{ color: colors.text.primary }} className="text-xs font-medium" numberOfLines={1}>
                        {mappingSuggestion.mapping[field] || '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {(parseStats.totalRows > 0 || previewRows.length > 0) ? (
              <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Parse Summary</Text>
                <Text style={{ color: colors.text.secondary }} className="text-xs mt-1">
                  Rows: {parseStats.totalRows} • Valid: {parseStats.validRows} • Invalid: {parseStats.invalidRows}
                  {parseStats.skippedExisting > 0 ? ` • Existing skipped: ${parseStats.skippedExisting}` : ''}
                </Text>

                {missingRequiredColumns.length > 0 ? (
                  <View className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">Required columns not mapped</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                      {missingRequiredColumns.map(formatFieldLabel).join(', ')}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4 }}>
                      Include these columns in your CSV header or rename headers so AI can map them.
                    </Text>
                  </View>
                ) : null}

                {parseStats.invalidRows > 0 && invalidReasonEntries.length > 0 ? (
                  <View className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">Why rows are invalid</Text>
                    <View className="mt-1.5" style={{ gap: 2 }}>
                      {invalidReasonEntries.slice(0, 6).map(([reason, count]) => (
                        <Text key={reason} style={{ color: colors.text.tertiary, fontSize: 12 }}>
                          • {reason} ({count})
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : null}

                {previewRows.length > 0 ? (
                  <View className="mt-3" style={{ gap: 6 }}>
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">Preview</Text>
                    {previewRows.map((row, index) => (
                      <Text key={`${row}-${index}`} style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>
                        {row}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {resolvedType === 'orders' && ordersMissingProducts.length > 0 ? (
                  <View className="mt-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">Unmatched product names</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                      {ordersMissingProducts.join(', ')}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4 }}>
                      Import matching products first or rename CSV product_name values to your existing catalog names.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {error ? (
              <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <AlertTriangle size={14} color="#B91C1C" strokeWidth={2} />
                  <Text className="text-xs" style={{ color: '#991B1B', flex: 1 }}>{error}</Text>
                </View>
              </View>
            ) : null}

            {hasAnalyzedFile && !importSummary ? (
              <View className="mt-5">
              <Pressable
                onPress={handleRunImport}
                disabled={isImporting || !businessId || !canImport}
                className="rounded-full items-center justify-center active:opacity-80"
                style={{
                  height: 50,
                  backgroundColor: !canImport || isImporting ? colors.bg.secondary : 'transparent',
                  borderWidth: 1,
                  borderColor: !canImport || isImporting ? colors.border.light : '#8B5CF6',
                  opacity: !businessId ? 0.6 : 1,
                  overflow: 'hidden',
                }}
              >
                {!isImporting && canImport ? (
                  <LinearGradient
                    colors={AI_GRADIENT_COLORS}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                {isImporting ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Text style={{ color: canImport ? '#F8FAFC' : colors.text.primary }} className="font-semibold">
                    {canImport
                      ? `Import ${resolvedType ? resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1) : ''}`
                      : 'Fix rows to enable import'}
                  </Text>
                )}
              </Pressable>
                {!canImport && importDisabledReason ? (
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                    {importDisabledReason}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {importSummary ? (
              <View className="mt-5 rounded-2xl p-4" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Import Complete</Text>
                <Text style={{ color: colors.text.secondary }} className="text-xs mt-1">{importSummary.note}</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                  Imported: {importSummary.imported} • Created: {importSummary.created} • Updated: {importSummary.updated}
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                  Invalid skipped: {importSummary.skippedInvalid} • Existing skipped: {importSummary.skippedExisting} • Failed: {importSummary.failed}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
