import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Upload, AlertCircle, Check, X, FileText } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { Customer, Order, OrderItem, generateOrderNumber } from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { InventorySettingsHero } from '@/components/settings/InventorySettingsScaffold';

type ImportSummary = {
  totalRows: number;
  importedOrders: number;
  importedItems: number;
  newCustomers: number;
  skippedInvalidRows: number;
  skippedExistingOrders: number;
  failedOrders: number;
};

type ParseMeta = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  skippedExistingOrders: number;
};

type ImportPreviewRow = {
  orderNumber: string;
  customerName: string;
  productName: string;
  itemReference: string;
  quantity: number;
};

type VariantLookupEntry = {
  productId: string;
  variantId: string;
  defaultUnitPrice: number;
};

type PreparedOrderDraft = {
  sourceOrderNumber?: string;
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

const TEMPLATE_CSV = `order_number,import_group,customer_name,customer_email,customer_phone,delivery_state,delivery_address,payment_method,source,status,order_date,delivery_fee,additional_charges,additional_charges_note,discount_code,discount_amount,product_name,item_sku,item_barcode,quantity,unit_price,website_order_reference
,IMPORT-1001,Aisha Bello,aisha@example.com,+2348012345678,Lagos,"12 Adeyemi St, Ikeja",Bank Transfer,Instagram,Processing,2026-02-25,2500,0,,WELCOME5,500,Aviator 1.0,AV1-GOLD,,1,129000,
,IMPORT-1001,Aisha Bello,aisha@example.com,+2348012345678,Lagos,"12 Adeyemi St, Ikeja",Bank Transfer,Instagram,Processing,2026-02-25,2500,0,,WELCOME5,500,Wayfarer Classic,,,1,99000,
,IMPORT-1002,Tunde Okafor,tunde@example.com,+2348098765432,FCT,"45 Unity Rd, Abuja",POS,WhatsApp,Ready for Pickup,2026-02-26,3500,1000,"Express handling",,0,Wayfarer Classic,,123456789012,2,109000,WC-22019
`;

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const normalizeLookupValue = (value: string) => value.trim().toLowerCase();

const pickCsvFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv'],
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

const parseNumber = (value: string | undefined, fallback = 0) => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePositiveInt = (value: string | undefined) => {
  if (!value) return NaN;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseOrderDate = (value: string | undefined) => {
  const candidate = value?.trim();
  if (!candidate) return new Date().toISOString();
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const generateEntityId = () => Math.random().toString(36).substring(2, 15);

export default function ImportOrdersScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, settingsPalette.page, settingsPalette.border);

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? '');

  const products = useFyllStore((s) => s.products);
  const existingOrders = useFyllStore((s) => s.orders);
  const existingCustomers = useFyllStore((s) => s.customers);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const saleSources = useFyllStore((s) => s.saleSources);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const addOrder = useFyllStore((s) => s.addOrder);
  const addCustomer = useFyllStore((s) => s.addCustomer);

  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [preparedOrders, setPreparedOrders] = useState<PreparedOrderDraft[]>([]);
  const [parseMeta, setParseMeta] = useState<ParseMeta>({
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    skippedExistingOrders: 0,
  });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [templateNotice, setTemplateNotice] = useState('');
  const [parseNotice, setParseNotice] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const preview = useMemo(() => previewRows.slice(0, 6), [previewRows]);

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
        if (skuKey && !skuMap.has(skuKey)) {
          skuMap.set(skuKey, lookupEntry);
        }

        const barcodeKey = normalizeLookupValue(variant.barcode ?? '');
        if (barcodeKey && !barcodeMap.has(barcodeKey)) {
          barcodeMap.set(barcodeKey, lookupEntry);
        }
      });
    });

    return { productNameMap, skuMap, barcodeMap };
  }, [products]);

  const existingOrderNumbers = useMemo(() => {
    return new Set(
      existingOrders
        .map((order) => normalizeLookupValue(order.orderNumber ?? ''))
        .filter((value) => Boolean(value))
    );
  }, [existingOrders]);

  const handlePickFile = async () => {
    setError('');
    setTemplateNotice('');
    setParseNotice('');
    setIsParsing(true);
    setPreviewRows([]);
    setPreparedOrders([]);
    setSummary(null);
    setParseMeta({
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      skippedExistingOrders: 0,
    });

    try {
      const file = await pickCsvFile();
      if (!file) {
        setIsParsing(false);
        return;
      }

      const incomingName = file.name ?? 'orders.csv';
      if (!incomingName.toLowerCase().endsWith('.csv')) {
        setError('Please choose a .csv file.');
        setIsParsing(false);
        return;
      }

      setFileName(incomingName);
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

      const orderNumberIndex = getIndex(['order_number', 'order_no', 'ordernumber']);
      const customerNameIndex = getIndex(['customer_name', 'customer_full_name', 'full_name']);
      const deliveryStateIndex = getIndex(['delivery_state', 'state']);
      const deliveryAddressIndex = getIndex(['delivery_address', 'address']);
      const productNameIndex = getIndex(['product_name', 'item_name', 'product']);
      const quantityIndex = getIndex(['quantity', 'qty']);
      const orderGroupIndex = getIndex(['import_group', 'order_group', 'group_key']);
      const skuIndex = getIndex(['item_sku', 'sku', 'variant_sku']);
      const barcodeIndex = getIndex(['item_barcode', 'barcode', 'variant_barcode']);

      const customerEmailIndex = getIndex(['customer_email', 'email']);
      const customerPhoneIndex = getIndex(['customer_phone', 'phone', 'phone_number']);
      const paymentMethodIndex = getIndex(['payment_method']);
      const sourceIndex = getIndex(['source', 'sale_source']);
      const statusIndex = getIndex(['status', 'order_status']);
      const orderDateIndex = getIndex(['order_date', 'date']);
      const deliveryFeeIndex = getIndex(['delivery_fee']);
      const additionalChargesIndex = getIndex(['additional_charges']);
      const additionalChargesNoteIndex = getIndex(['additional_charges_note', 'charges_note']);
      const discountCodeIndex = getIndex(['discount_code']);
      const discountAmountIndex = getIndex(['discount_amount']);
      const unitPriceIndex = getIndex(['unit_price', 'item_price', 'price']);
      const websiteOrderReferenceIndex = getIndex(['website_order_reference', 'website_reference', 'external_order_reference']);

      if (
        customerNameIndex === -1
        || deliveryStateIndex === -1
        || deliveryAddressIndex === -1
        || productNameIndex === -1
        || quantityIndex === -1
      ) {
        setError('Missing required columns. Required: customer_name, delivery_state, delivery_address, product_name, quantity.');
        setIsParsing(false);
        return;
      }

      const grouped = new Map<string, PreparedOrderDraft>();
      const validPreviewRows: ImportPreviewRow[] = [];
      const skippedExistingOrderNumbers = new Set<string>();
      let invalidRows = 0;

      const dataRows = parsed.slice(1);

      dataRows.forEach((row, rowIndex) => {
        const orderNumber = orderNumberIndex >= 0 ? row[orderNumberIndex]?.trim() ?? '' : '';
        const customerName = row[customerNameIndex]?.trim() ?? '';
        const deliveryState = row[deliveryStateIndex]?.trim() ?? '';
        const deliveryAddress = row[deliveryAddressIndex]?.trim() ?? '';
        const productName = row[productNameIndex]?.trim() ?? '';
        const quantity = parsePositiveInt(row[quantityIndex]);
        const importGroup = orderGroupIndex >= 0 ? row[orderGroupIndex]?.trim() ?? '' : '';
        const websiteOrderReference = websiteOrderReferenceIndex >= 0 ? row[websiteOrderReferenceIndex]?.trim() ?? '' : '';

        if (!customerName || !deliveryState || !deliveryAddress || !productName || !Number.isFinite(quantity) || quantity <= 0) {
          invalidRows += 1;
          return;
        }

        const suppliedOrderNumberKey = normalizeLookupValue(orderNumber);
        if (suppliedOrderNumberKey && existingOrderNumbers.has(suppliedOrderNumberKey)) {
          skippedExistingOrderNumbers.add(suppliedOrderNumberKey);
          return;
        }

        const groupSeed = orderNumber || importGroup || websiteOrderReference || `row-${rowIndex}`;
        const groupType = orderNumber
          ? 'order'
          : importGroup
            ? 'group'
            : websiteOrderReference
              ? 'webref'
              : 'row';
        const orderLookupKey = `${groupType}:${normalizeLookupValue(groupSeed)}`;

        const sku = skuIndex >= 0 ? row[skuIndex]?.trim() ?? '' : '';
        const barcode = barcodeIndex >= 0 ? row[barcodeIndex]?.trim() ?? '' : '';
        const productNameLookup = variantLookup.productNameMap.get(normalizeLookupValue(productName));

        if (!productNameLookup) {
          invalidRows += 1;
          return;
        }

        const skuLookup = sku ? variantLookup.skuMap.get(normalizeLookupValue(sku)) : undefined;
        const barcodeLookup = barcode ? variantLookup.barcodeMap.get(normalizeLookupValue(barcode)) : undefined;
        let lookup = productNameLookup;
        if (skuLookup && skuLookup.productId === productNameLookup.productId) {
          lookup = skuLookup;
        } else if (barcodeLookup && barcodeLookup.productId === productNameLookup.productId) {
          lookup = barcodeLookup;
        }

        if (
          (skuLookup && skuLookup.productId !== productNameLookup.productId)
          || (barcodeLookup && barcodeLookup.productId !== productNameLookup.productId)
        ) {
          invalidRows += 1;
          return;
        }

        const parsedUnitPrice = unitPriceIndex >= 0 ? parseNumber(row[unitPriceIndex], NaN) : NaN;
        const unitPrice = Number.isFinite(parsedUnitPrice) && parsedUnitPrice >= 0
          ? parsedUnitPrice
          : lookup.defaultUnitPrice;

        const item: OrderItem = {
          productId: lookup.productId,
          variantId: lookup.variantId,
          quantity,
          unitPrice,
        };

        const group = grouped.get(orderLookupKey);
        if (group) {
          group.items.push(item);
          if (!group.customerEmail && customerEmailIndex >= 0) {
            group.customerEmail = row[customerEmailIndex]?.trim() ?? '';
          }
          if (!group.customerPhone && customerPhoneIndex >= 0) {
            group.customerPhone = row[customerPhoneIndex]?.trim() ?? '';
          }
          if (!group.websiteOrderReference && websiteOrderReferenceIndex >= 0) {
            group.websiteOrderReference = row[websiteOrderReferenceIndex]?.trim() ?? '';
          }
          if (!group.sourceOrderNumber && orderNumber) {
            group.sourceOrderNumber = orderNumber;
          }
          if (!group.paymentMethod && paymentMethodIndex >= 0) {
            group.paymentMethod = row[paymentMethodIndex]?.trim() ?? '';
          }
          if (!group.source && sourceIndex >= 0) {
            group.source = row[sourceIndex]?.trim() ?? '';
          }
          if (!group.status && statusIndex >= 0) {
            group.status = row[statusIndex]?.trim() ?? '';
          }
        } else {
          grouped.set(orderLookupKey, {
            sourceOrderNumber: orderNumber,
            websiteOrderReference,
            customerName,
            customerEmail: customerEmailIndex >= 0 ? row[customerEmailIndex]?.trim() ?? '' : '',
            customerPhone: customerPhoneIndex >= 0 ? row[customerPhoneIndex]?.trim() ?? '' : '',
            deliveryState,
            deliveryAddress,
            paymentMethod: paymentMethodIndex >= 0 ? row[paymentMethodIndex]?.trim() ?? '' : '',
            source: sourceIndex >= 0 ? row[sourceIndex]?.trim() ?? '' : '',
            status: statusIndex >= 0 ? row[statusIndex]?.trim() ?? '' : '',
            orderDateIso: orderDateIndex >= 0 ? parseOrderDate(row[orderDateIndex]) : new Date().toISOString(),
            deliveryFee: deliveryFeeIndex >= 0 ? parseNumber(row[deliveryFeeIndex]) : 0,
            additionalCharges: additionalChargesIndex >= 0 ? parseNumber(row[additionalChargesIndex]) : 0,
            additionalChargesNote: additionalChargesNoteIndex >= 0 ? row[additionalChargesNoteIndex]?.trim() ?? '' : '',
            discountCode: discountCodeIndex >= 0 ? row[discountCodeIndex]?.trim() ?? '' : '',
            discountAmount: discountAmountIndex >= 0 ? parseNumber(row[discountAmountIndex]) : 0,
            items: [item],
          });
        }

        validPreviewRows.push({
          orderNumber: orderNumber || (importGroup ? `Auto via ${importGroup}` : 'Auto-generated'),
          customerName,
          productName,
          itemReference: sku || barcode || 'Name match',
          quantity,
        });
      });

      const prepared = Array.from(grouped.values()).filter((order) => order.items.length > 0);
      const parsedMeta: ParseMeta = {
        totalRows: dataRows.length,
        validRows: validPreviewRows.length,
        invalidRows,
        skippedExistingOrders: skippedExistingOrderNumbers.size,
      };

      setPreparedOrders(prepared);
      setPreviewRows(validPreviewRows);
      setParseMeta(parsedMeta);

      if (!prepared.length) {
        setError('No importable orders found. Check required fields, product_name values, and quantity.');
      } else {
        setParseNotice(
          `Ready: ${prepared.length} orders from ${parsedMeta.validRows} valid rows. `
          + `Skipped ${parsedMeta.invalidRows} invalid rows and ${parsedMeta.skippedExistingOrders} existing orders. `
          + 'Order numbers will be auto-generated when missing.'
        );
      }

      setIsParsing(false);
    } catch (err) {
      console.error('Order CSV parse failed:', err);
      setError('Failed to read that file. Please try another CSV.');
      setIsParsing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setTemplateNotice('');

    if (Platform.OS === 'web') {
      const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'order-import-template.csv';
      link.click();
      URL.revokeObjectURL(url);
      setTemplateNotice('Template downloaded.');
      return;
    }

    await Clipboard.setStringAsync(TEMPLATE_CSV);
    setTemplateNotice('Template copied to clipboard.');
  };

  const handleImport = async () => {
    if (!preparedOrders.length || !businessId) {
      if (!businessId) {
        setError('No business selected. Please sign in again and retry.');
      }
      return;
    }

    setError('');
    setIsImporting(true);

    try {
      const customersByEmail = new Map<string, Customer>();
      const customersByPhone = new Map<string, Customer>();
      const customersByName = new Map<string, Customer>();

      existingCustomers.forEach((customer) => {
        const emailKey = normalizeLookupValue(customer.email ?? '');
        const phoneKey = normalizeLookupValue(customer.phone ?? '');
        const nameKey = normalizeLookupValue(customer.fullName ?? '');
        if (emailKey) customersByEmail.set(emailKey, customer);
        if (phoneKey) customersByPhone.set(phoneKey, customer);
        if (nameKey) customersByName.set(nameKey, customer);
      });

      let importedOrders = 0;
      let importedItems = 0;
      let newCustomers = 0;
      let failedOrders = 0;
      const usedOrderNumbers = new Set(
        existingOrders
          .map((order) => normalizeLookupValue(order.orderNumber ?? ''))
          .filter((value) => Boolean(value))
      );
      const generateUniqueImportedOrderNumber = () => {
        let candidate = generateOrderNumber();
        let candidateKey = normalizeLookupValue(candidate);
        let attempts = 0;
        while (usedOrderNumbers.has(candidateKey)) {
          attempts += 1;
          candidate = `${generateOrderNumber()}-${attempts}`;
          candidateKey = normalizeLookupValue(candidate);
        }
        usedOrderNumbers.add(candidateKey);
        return candidate;
      };

      for (const draft of preparedOrders) {
        try {
          const emailKey = normalizeLookupValue(draft.customerEmail);
          const phoneKey = normalizeLookupValue(draft.customerPhone);
          const nameKey = normalizeLookupValue(draft.customerName);

          let resolvedCustomer = customersByEmail.get(emailKey)
            ?? customersByPhone.get(phoneKey)
            ?? customersByName.get(nameKey);

          if (!resolvedCustomer && draft.customerName.trim()) {
            const created: Customer = {
              id: `cust-${generateEntityId()}`,
              fullName: draft.customerName,
              email: draft.customerEmail,
              phone: draft.customerPhone,
              defaultAddress: draft.deliveryAddress,
              defaultState: draft.deliveryState,
              createdAt: new Date().toISOString(),
            };
            await addCustomer(created, businessId);
            resolvedCustomer = created;
            newCustomers += 1;

            if (emailKey) customersByEmail.set(emailKey, created);
            if (phoneKey) customersByPhone.set(phoneKey, created);
            if (nameKey) customersByName.set(nameKey, created);
          }

          const subtotal = draft.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          const discountAmount = (draft.discountAmount ?? 0) > 0 ? draft.discountAmount : undefined;
          const totalAmount = subtotal + draft.deliveryFee + draft.additionalCharges - (discountAmount ?? 0);
          const resolvedOrderNumber = draft.sourceOrderNumber?.trim()
            ? draft.sourceOrderNumber.trim()
            : generateUniqueImportedOrderNumber();
          const resolvedOrderNumberKey = normalizeLookupValue(resolvedOrderNumber);

          if (draft.sourceOrderNumber?.trim()) {
            if (usedOrderNumbers.has(resolvedOrderNumberKey)) {
              throw new Error(`Order number already exists: ${resolvedOrderNumber}`);
            }
            usedOrderNumbers.add(resolvedOrderNumberKey);
          }

          const order: Order = {
            id: `order-${generateEntityId()}`,
            orderNumber: resolvedOrderNumber,
            websiteOrderReference: draft.websiteOrderReference || undefined,
            customerId: resolvedCustomer?.id,
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
            createdBy: currentUserName || 'Import',
          };

          await addOrder(order, businessId);
          importedOrders += 1;
          importedItems += order.items.length;
        } catch (orderError) {
          console.error('Order import failed for', draft.sourceOrderNumber ?? '(auto-number)', orderError);
          failedOrders += 1;
        }
      }

      setSummary({
        totalRows: parseMeta.totalRows,
        importedOrders,
        importedItems,
        newCustomers,
        skippedInvalidRows: parseMeta.invalidRows,
        skippedExistingOrders: parseMeta.skippedExistingOrders,
        failedOrders,
      });

      if (importedOrders > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError('No orders were imported. Check your file and try again.');
      }
    } catch (err) {
      console.error('Order import failed:', err);
      setError('Import failed. Please check the file and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    goBack();
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: settingsPalette.page }} edges={['top']}>
          {!isDesktop ? (
            <LinearGradient
              pointerEvents="none"
              colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: openedFromSettings ? 390 : 300 }}
            />
          ) : null}
          <InternalSettingsHeader title="Import Orders" description="Upload, validate, and import order records from a CSV file." isDesktop={isDesktop} onBack={goBack} />

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: openedFromSettings ? 22 : 12, paddingBottom: isDesktop ? 64 : tabBarHeight + 48 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={isDesktop ? { width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } : { width: '100%', maxWidth: 520, alignSelf: 'center' }}>
            <InventorySettingsHero
              eyebrow="Order data"
              title="CSV import"
              description={summary ? `${summary.totalRows} rows processed` : preparedOrders.length ? `${preparedOrders.length} orders ready` : 'Upload, preview, then import'}
              isDesktop={isDesktop}
            />
            {!preparedOrders.length && !summary && (
              <View className="p-5 mb-6" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View className="flex-row items-start mb-3">
                  <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}>
                    <AlertCircle size={19} color={settingsPalette.limeOnSurface} strokeWidth={2} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text style={{ color: settingsPalette.text, fontSize: isMobile ? 14 : 15, fontWeight: '600' }} className="mb-2">
                      CSV format requirements
                    </Text>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12.5 }} className="leading-5 mb-2">
                      Required columns: <Text className="font-bold">customer_name</Text>, <Text className="font-bold">delivery_state</Text>, <Text className="font-bold">delivery_address</Text>, <Text className="font-bold">product_name</Text>, <Text className="font-bold">quantity</Text>.
                    </Text>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12.5 }} className="leading-5 mb-2">
                      FYLL maps rows by <Text className="font-bold">product_name</Text>. <Text className="font-bold">item_sku</Text> and <Text className="font-bold">item_barcode</Text> are optional for variant matching. <Text className="font-bold">order_number</Text> is optional and FYLL can generate it.
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                      Optional: order_number, import_group, customer_email, customer_phone, item_sku, item_barcode, payment_method, source, status, order_date, unit_price, fees and discount columns.
                    </Text>
                    <Pressable
                      onPress={handleDownloadTemplate}
                      className="mt-3 px-4 rounded-full self-start items-center justify-center active:opacity-80"
                      style={{ height: 40, backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline }}
                    >
                      <MoneyText style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>Download CSV template</MoneyText>
                    </Pressable>
                    {templateNotice ? (
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                        {templateNotice}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {!summary && (
              <Pressable
                onPress={handlePickFile}
                disabled={isParsing || isImporting}
                className="p-8 items-center justify-center mb-6 active:opacity-80"
                style={{
                  backgroundColor: settingsPalette.card,
                  borderRadius: 26,
                  borderWidth: 2,
                  borderColor: settingsPalette.nudgeBorder,
                  borderStyle: 'dashed',
                }}
              >
                {isParsing ? (
                  <>
                    <ActivityIndicator size="large" color={settingsPalette.limeOnSurface} />
                    <Text style={{ color: colors.text.tertiary }} className="text-sm mt-3">
                      Reading file...
                    </Text>
                  </>
                ) : (
                  <>
                    <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: settingsPalette.nudgeBg }}>
                      <Upload size={28} color={settingsPalette.limeOnSurface} strokeWidth={2} />
                    </View>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>Choose CSV file</MoneyText>
                    <Text style={{ color: settingsPalette.faint, fontSize: 12 }} className="mt-1 text-center">
                      One row per order item. Use the same order_number or import_group for multi-item orders.
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {fileName && preview.length === 0 ? (
              <Text style={{ color: colors.text.muted }} className="text-xs mb-3">
                Selected: {fileName}
              </Text>
            ) : null}

            {parseNotice ? (
              <View className="rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: settingsPalette.nudgeBg, borderWidth: 1, borderColor: settingsPalette.nudgeBorder }}>
                <Text style={{ color: settingsPalette.textSoft, fontSize: 12, lineHeight: 18 }}>{parseNotice}</Text>
              </View>
            ) : null}

            {!businessId ? (
              <View className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }}>
                <Text className="text-sm" style={{ color: '#92400E' }}>
                  Orders need an active business to sync. Please sign in again before importing.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View className="rounded-2xl px-4 py-3 mb-4 flex-row items-start" style={{ backgroundColor: settingsPalette.dangerBg, borderWidth: 1, borderColor: settingsPalette.dangerBorder }}>
                <X size={18} color={settingsPalette.danger} strokeWidth={2.2} />
                <Text style={{ color: settingsPalette.danger, fontSize: 12, lineHeight: 18, marginLeft: 9, flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            {preview.length > 0 && !summary ? (
              <View className="mb-5">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text style={{ color: settingsPalette.text, fontSize: 15, fontWeight: '600' }}>Preview</Text>
                    <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 2 }}>{fileName} · {preparedOrders.length} orders</Text>
                  </View>
                  <Pressable onPress={handlePickFile} className="px-4 rounded-full items-center justify-center active:opacity-70" style={{ minHeight: 40, backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline }}>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>Change file</MoneyText>
                  </Pressable>
                </View>
                <View className="overflow-hidden" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                {preview.map((row, index) => (
                  <View key={`${row.orderNumber}-${row.productName}-${index}`} className="p-4" style={index < preview.length - 1 ? { borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline } : undefined}>
                    <View className="flex-row items-start" style={{ gap: 11 }}>
                      <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: settingsPalette.nudgeBg }}><FileText size={17} color={settingsPalette.limeOnSurface} strokeWidth={2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '500' }}>{row.orderNumber} · {row.customerName}</Text>
                        <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>{row.productName} · {row.itemReference} · Qty {row.quantity}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                {previewRows.length > preview.length ? (
                  <View className="p-4 items-center" style={{ backgroundColor: settingsPalette.inset }}><Text style={{ color: settingsPalette.faint, fontSize: 12 }}>+{previewRows.length - preview.length} more rows</Text></View>
                ) : null}
                </View>
              </View>
            ) : null}

            {preparedOrders.length > 0 && !summary ? (
              <Pressable
                onPress={handleImport}
                disabled={isImporting || !businessId}
                className="rounded-full items-center justify-center active:opacity-80"
                style={{
                  backgroundColor: FYLL_LIME,
                  opacity: isImporting || !businessId ? 0.6 : 1,
                  height: 52,
                }}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color={FYLL_LIME_INK} />
                ) : (
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Import {preparedOrders.length} orders</MoneyText>
                )}
              </Pressable>
            ) : null}

            {summary ? (
              <View className="mb-6">
                <View className="w-16 h-16 rounded-full items-center justify-center mb-4 self-center" style={{ backgroundColor: settingsPalette.nudgeBg }}><Check size={32} color={settingsPalette.limeOnSurface} strokeWidth={2.5} /></View>
                <MoneyText style={{ color: settingsPalette.text, fontSize: 24, textAlign: 'center', fontWeight: '700', marginBottom: 5 }}>Import complete</MoneyText>
                <Text style={{ color: settingsPalette.faint, fontSize: 13, textAlign: 'center', marginBottom: 22 }}>{summary.importedOrders} orders and {summary.importedItems} items imported</Text>
                <View className="overflow-hidden mb-6" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Orders imported</Text>
                  <Text style={{ color: settingsPalette.text, fontSize: 16, fontWeight: '700' }}>{summary.importedOrders}</Text>
                </View>
                <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Items imported</Text>
                  <Text style={{ color: settingsPalette.text, fontSize: 16, fontWeight: '700' }}>{summary.importedItems}</Text>
                </View>
                <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>New customers</Text>
                  <Text style={{ color: settingsPalette.limeOnSurface, fontSize: 16, fontWeight: '700' }}>{summary.newCustomers}</Text>
                </View>
                <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Rows skipped</Text>
                  <Text style={{ color: settingsPalette.faint, fontSize: 16, fontWeight: '700' }}>{summary.skippedInvalidRows + summary.skippedExistingOrders}</Text>
                </View>
                {summary.failedOrders > 0 ? (
                  <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                    <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Failed orders</Text>
                    <Text style={{ color: settingsPalette.warn, fontSize: 16, fontWeight: '700' }}>{summary.failedOrders}</Text>
                  </View>
                ) : null}
                <View className="p-4 flex-row items-center justify-between">
                  <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Total rows processed</Text>
                  <Text style={{ color: settingsPalette.text, fontSize: 16, fontWeight: '700' }}>{summary.totalRows}</Text>
                </View>
                </View>

                <Pressable
                  onPress={handleDone}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{ backgroundColor: FYLL_LIME, height: 52 }}
                >
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Done</MoneyText>
                </Pressable>
              </View>
            ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
