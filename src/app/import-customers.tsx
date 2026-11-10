import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Upload, Check, X, AlertCircle, FileText } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { Customer } from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { InventorySettingsHero } from '@/components/settings/InventorySettingsScaffold';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

type ImportRow = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
};

type ImportSummary = {
  totalRows: number;
  totalNew: number;
  totalUpdated: number;
  skippedInvalid: number;
};

const TEMPLATE_CSV = `name,email,phone,address,city,state
Aisha Bello,aisha@example.com,+2348012345678,"12 Adeyemi St, Ikeja",Lagos,Lagos
Tunde Okafor,tunde@example.com,+2348098765432,"45 Unity Rd",Abuja,FCT
Chidinma Nwosu,chidinma@example.com,,"7 Market Ave",Enugu,Enugu
`;

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

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

const generateCustomerId = () => {
  return `cust-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export default function ImportCustomersScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const settingsPalette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, settingsPalette.page, settingsPalette.border);
  const businessId = useAuthStore((s) => s.businessId);
  const existingCustomers = useFyllStore((s) => s.customers);
  const addCustomer = useFyllStore((s) => s.addCustomer);
  const updateCustomer = useFyllStore((s) => s.updateCustomer);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [templateNotice, setTemplateNotice] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);


  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const handlePickFile = async () => {
    setError('');
    setTemplateNotice('');
    setIsParsing(true);
    setRows([]);
    setSummary(null);

    try {
      const file = await pickCsvFile();
      if (!file) {
        setIsParsing(false);
        return;
      }

      const incomingName = file.name ?? 'customers.csv';
      if (incomingName && !incomingName.toLowerCase().endsWith('.csv')) {
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

      const nameIndex = getIndex(['name', 'customer_name', 'full_name']);
      const emailIndex = getIndex(['email', 'email_address']);
      const phoneIndex = getIndex(['phone', 'phone_number', 'mobile', 'telephone']);
      const addressIndex = getIndex(['address', 'street_address', 'street']);
      const cityIndex = getIndex(['city', 'town']);
      const stateIndex = getIndex(['state', 'province', 'region']);

      if (nameIndex === -1) {
        setError('CSV must include a "name" or "customer_name" column.');
        setIsParsing(false);
        return;
      }

      const mapped: ImportRow[] = parsed.slice(1).map((row) => ({
        name: row[nameIndex]?.trim() ?? '',
        email: emailIndex >= 0 ? row[emailIndex]?.trim() : '',
        phone: phoneIndex >= 0 ? row[phoneIndex]?.trim() : '',
        address: addressIndex >= 0 ? row[addressIndex]?.trim() : '',
        city: cityIndex >= 0 ? row[cityIndex]?.trim() : '',
        state: stateIndex >= 0 ? row[stateIndex]?.trim() : '',
      })).filter((row) => row.name);

      if (!mapped.length) {
        setError('No valid rows found. Check that name column has values.');
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

  const handleDownloadTemplate = async () => {
    setTemplateNotice('');
    if (Platform.OS === 'web') {
      const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customer-import-template.csv';
      link.click();
      URL.revokeObjectURL(url);
      setTemplateNotice('Template downloaded.');
      return;
    }

    await Clipboard.setStringAsync(TEMPLATE_CSV);
    setTemplateNotice('Template copied to clipboard.');
  };

  const handleImport = async () => {
    if (!rows.length || !businessId) return;
    setIsImporting(true);
    setError('');
    setTemplateNotice('');

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const existingByName = new Map(
        existingCustomers.map((c) => [c.fullName.toLowerCase(), c])
      );

      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        if (!row.name) {
          skippedCount++;
          continue;
        }

        const key = row.name.toLowerCase();
        const existing = existingByName.get(key);

        const fullAddress = [row.address, row.city, row.state]
          .filter(Boolean)
          .join(', ');

        if (existing) {
          // Update existing customer if new info is provided
          const updated: Partial<Customer> = {};
          if (row.email && row.email !== existing.email) updated.email = row.email;
          if (row.phone && row.phone !== existing.phone) updated.phone = row.phone;
          if (fullAddress && fullAddress !== existing.defaultAddress) updated.defaultAddress = fullAddress;
          if (row.state && row.state !== existing.defaultState) updated.defaultState = row.state;

          if (Object.keys(updated).length > 0) {
            updateCustomer(existing.id, updated);
            updatedCount++;
          }
        } else {
          // Add new customer
          const newCustomer: Customer = {
            id: generateCustomerId(),
            fullName: row.name,
            email: row.email || '',
            phone: row.phone || '',
            defaultAddress: fullAddress,
            defaultState: row.state || '',
            createdAt: new Date().toISOString(),
          };
          await addCustomer(newCustomer, businessId);
          newCount++;
        }
      }

      setSummary({
        totalRows: rows.length,
        totalNew: newCount,
        totalUpdated: updatedCount,
        skippedInvalid: skippedCount,
      });
      setIsImporting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Import failed:', err);
      setError('Import failed. Some customers may not have been added.');
      setIsImporting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          <InternalSettingsHeader title="Import Customers" description="Upload, preview, and import customer records from a CSV file." isDesktop={isDesktop} onBack={goBack} />

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: openedFromSettings ? 22 : 12, paddingBottom: isDesktop ? 64 : tabBarHeight + 48 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={isDesktop ? { width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } : { width: '100%', maxWidth: 520, alignSelf: 'center' }}>
            <InventorySettingsHero
              eyebrow="Customer data"
              title="CSV import"
              description={summary ? `${summary.totalRows} rows processed` : rows.length ? `${rows.length} customers ready` : 'Upload, preview, then import'}
              isDesktop={isDesktop}
            />
            {!rows.length && !summary && (
              <View className="p-5 mb-6" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View className="flex-row items-start mb-3">
                  <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}>
                    <AlertCircle size={19} color={settingsPalette.limeOnSurface} strokeWidth={2} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text style={{ color: settingsPalette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }} className="mb-2">
                      CSV format requirements
                    </Text>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12 }} className="leading-5 mb-2">
                      Your CSV must have a header row with at least a <Text className="font-bold">name</Text> column.
                    </Text>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12 }} className="leading-5 mb-2">
                      Optional columns: <Text className="font-bold">email</Text>, <Text className="font-bold">phone</Text>, <Text className="font-bold">address</Text>, <Text className="font-bold">city</Text>, <Text className="font-bold">state</Text>
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                      Example: name, email, phone, address, city, state
                    </Text>
                    <Pressable
                      onPress={handleDownloadTemplate}
                      className="mt-4 px-5 rounded-full self-start items-center justify-center active:opacity-80"
                      style={{ height: 44, backgroundColor: FYLL_LIME }}
                    >
                      <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Download CSV template</MoneyText>
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
                      Tap to select a file from your device
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {error ? (
              <View className="rounded-2xl px-4 py-3 mb-4 flex-row items-start" style={{ backgroundColor: settingsPalette.dangerBg, borderWidth: 1, borderColor: settingsPalette.dangerBorder }}>
                <X size={18} color={settingsPalette.danger} strokeWidth={2.2} />
                <Text style={{ color: settingsPalette.danger, fontSize: 12, lineHeight: 18, marginLeft: 9, flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            {rows.length > 0 && !summary ? (
              <View className="mb-5">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text style={{ color: settingsPalette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Preview</Text>
                    <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 2 }}>{fileName} · {rows.length} customers</Text>
                  </View>
                  <Pressable onPress={handlePickFile} className="px-4 rounded-full items-center justify-center active:opacity-70" style={{ minHeight: 40, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.outline }}>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>Change file</MoneyText>
                  </Pressable>
                </View>
                <View className="overflow-hidden" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                  {preview.map((row, index) => (
                    <View key={index} className="p-4" style={index < preview.length - 1 ? { borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline } : undefined}>
                      <View className="flex-row items-start" style={{ gap: 11 }}>
                        <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: settingsPalette.nudgeBg }}><FileText size={17} color={settingsPalette.limeOnSurface} strokeWidth={2} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '500' }}>{row.name}</Text>
                          {row.email ? <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>Email: {row.email}</Text> : null}
                          {row.phone ? <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>Phone: {row.phone}</Text> : null}
                          {(row.address || row.city || row.state) ? <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>Address: {[row.address, row.city, row.state].filter(Boolean).join(', ')}</Text> : null}
                        </View>
                      </View>
                    </View>
                  ))}
                  {rows.length > preview.length ? (
                    <View className="p-4 items-center"><Text style={{ color: settingsPalette.faint, fontSize: 12 }}>+{rows.length - preview.length} more customers</Text></View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {rows.length > 0 && !summary ? (
              <Pressable
                onPress={handleImport}
                disabled={isImporting}
                className="rounded-full items-center justify-center active:opacity-80"
                style={{ backgroundColor: FYLL_LIME, opacity: isImporting ? 0.6 : 1, height: 52 }}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color={FYLL_LIME_INK} />
                ) : (
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Import {rows.length} customers</MoneyText>
                )}
              </Pressable>
            ) : null}

            {summary ? (
              <View className="mb-6">
                <View className="w-16 h-16 rounded-full items-center justify-center mb-4 self-center" style={{ backgroundColor: settingsPalette.nudgeBg }}><Check size={32} color={settingsPalette.limeOnSurface} strokeWidth={2.5} /></View>
                <MoneyText style={{ color: settingsPalette.text, fontSize: 24, textAlign: 'center', fontWeight: '700', marginBottom: 5 }}>Import complete</MoneyText>
                <Text style={{ color: settingsPalette.faint, fontSize: 13, textAlign: 'center', marginBottom: 22 }}>{summary.totalNew} new customers and {summary.totalUpdated} updated</Text>
                <View className="overflow-hidden mb-6" style={{ borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                  <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                    <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>New customers</Text>
                    <Text style={{ color: settingsPalette.limeOnSurface, fontSize: 16, fontWeight: '700' }}>{summary.totalNew}</Text>
                  </View>
                  <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                    <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Updated existing</Text>
                    <Text style={{ color: settingsPalette.text, fontSize: 16, fontWeight: '700' }}>{summary.totalUpdated}</Text>
                  </View>
                  {summary.skippedInvalid > 0 ? (
                    <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
                      <Text style={{ color: settingsPalette.textSoft, fontSize: 13 }}>Rows skipped</Text>
                      <Text style={{ color: settingsPalette.faint, fontSize: 16, fontWeight: '700' }}>{summary.skippedInvalid}</Text>
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
