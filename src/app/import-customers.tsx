import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Upload, Check, X, AlertCircle } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { Customer } from '@/lib/state/fyll-store';
import { parseCsv } from '@/lib/csv';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

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
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }} edges={['top']}>
      {/* Header */}
      <View
        className="flex-row items-center px-5 py-4 border-b"
        style={{ borderBottomColor: colors.border.light }}
      >
        <Pressable
          onPress={goBack}
          className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
          style={{ backgroundColor: 'transparent' }}
        >
          <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
        <View className="flex-1">
          <Text
            style={{
              color: colors.text.primary,
              fontSize: Platform.OS === 'web' ? 14 : 20,
              lineHeight: Platform.OS === 'web' ? 18 : 24,
              fontWeight: '600',
            }}
          >
            Import Customers
          </Text>
          <Text style={{ color: colors.text.tertiary }} className="text-sm mt-0.5">
            Upload a CSV file with customer data
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 py-6" showsVerticalScrollIndicator={false}>
        {/* Instructions */}
        {!rows.length && !summary && (
          <View className="rounded-2xl p-5 mb-6" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
            <View className="flex-row items-start mb-3">
              <AlertCircle size={20} color={colors.accent.primary} strokeWidth={2} />
              <View className="flex-1 ml-3">
                <Text style={{ color: colors.text.primary }} className="font-semibold text-base mb-2">
                  CSV Format Requirements
                </Text>
                <Text style={{ color: colors.text.secondary }} className="text-sm leading-5 mb-2">
                  Your CSV must have a header row with at least a <Text className="font-bold">name</Text> column.
                </Text>
                <Text style={{ color: colors.text.secondary }} className="text-sm leading-5 mb-2">
                  Optional columns: <Text className="font-bold">email</Text>, <Text className="font-bold">phone</Text>, <Text className="font-bold">address</Text>, <Text className="font-bold">city</Text>, <Text className="font-bold">state</Text>
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">
                  Example: name, email, phone, address, city, state
                </Text>
                <Pressable
                  onPress={handleDownloadTemplate}
                  className="mt-3 px-4 py-2 rounded-lg self-start active:opacity-80"
                  style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">
                    Download CSV Template
                  </Text>
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

        {/* Upload Button */}
        {!summary && (
          <Pressable
            onPress={handlePickFile}
            disabled={isParsing || isImporting}
            className="rounded-2xl p-8 items-center justify-center mb-6 active:opacity-80"
            style={{
              backgroundColor: colors.bg.secondary,
              borderWidth: 2,
              borderColor: colors.border.light,
              borderStyle: 'dashed',
            }}
          >
            {isParsing ? (
              <>
                <ActivityIndicator size="large" color={colors.accent.primary} />
                <Text style={{ color: colors.text.tertiary }} className="text-sm mt-3">
                  Reading file...
                </Text>
              </>
            ) : (
              <>
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: colors.accent.primary + '20' }}
                >
                  <Upload size={28} color={colors.accent.primary} strokeWidth={2} />
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>
                  Choose CSV File
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                  Tap to select a file from your device
                </Text>
              </>
            )}
          </Pressable>
        )}

        {/* Preview */}
        {rows.length > 0 && !summary && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>
                  Preview
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                  {fileName} • {rows.length} customers
                </Text>
              </View>
              <Pressable
                onPress={handlePickFile}
                className="px-4 py-2 rounded-lg active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Text style={{ color: colors.accent.primary }} className="font-semibold text-sm">
                  Change File
                </Text>
              </Pressable>
            </View>

            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              {preview.map((row, index) => (
                <View
                  key={index}
                  className="p-4"
                  style={index < preview.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border.light } : undefined}
                >
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base mb-1">
                    {row.name}
                  </Text>
                  {row.email && (
                    <Text style={{ color: colors.text.tertiary }} className="text-sm">
                      Email: {row.email}
                    </Text>
                  )}
                  {row.phone && (
                    <Text style={{ color: colors.text.tertiary }} className="text-sm">
                      Phone: {row.phone}
                    </Text>
                  )}
                  {(row.address || row.city || row.state) && (
                    <Text style={{ color: colors.text.tertiary }} className="text-sm">
                      Address: {[row.address, row.city, row.state].filter(Boolean).join(', ')}
                    </Text>
                  )}
                </View>
              ))}
              {rows.length > 5 && (
                <View className="p-4 items-center" style={{ backgroundColor: colors.bg.secondary }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm">
                    + {rows.length - 5} more customers
                  </Text>
                </View>
              )}
            </View>

            {/* Import Button */}
            <Pressable
              onPress={handleImport}
              disabled={isImporting}
              className="rounded-2xl p-4 items-center justify-center mt-6 active:opacity-80"
              style={{ backgroundColor: colors.accent.primary }}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.bg.primary} />
              ) : (
                <Text style={{ color: colors.bg.primary === '#111111' ? '#000000' : '#FFFFFF' }} className="font-bold text-base">
                  Import {rows.length} Customers
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Success Summary */}
        {summary && (
          <View className="mb-6">
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4 self-center"
              style={{ backgroundColor: '#10B98120' }}
            >
              <Check size={32} color="#10B981" strokeWidth={2.5} />
            </View>
            <Text style={{ color: colors.text.primary }} className="font-bold text-2xl text-center mb-2">
              Import Complete!
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-base text-center mb-6">
              Your customer data has been imported successfully
            </Text>

            <View className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.secondary }} className="text-sm">Total Rows</Text>
                <Text style={{ color: colors.text.primary }} className="font-bold text-base">{summary.totalRows}</Text>
              </View>
              <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.secondary }} className="text-sm">New Customers</Text>
                <Text className="text-emerald-500 font-bold text-base">{summary.totalNew}</Text>
              </View>
              <View className="p-4 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.secondary }} className="text-sm">Updated Existing</Text>
                <Text className="text-blue-500 font-bold text-base">{summary.totalUpdated}</Text>
              </View>
              {summary.skippedInvalid > 0 && (
                <View className="p-4 flex-row items-center justify-between">
                  <Text style={{ color: colors.text.secondary }} className="text-sm">Skipped (Invalid)</Text>
                  <Text className="text-amber-500 font-bold text-base">{summary.skippedInvalid}</Text>
                </View>
              )}
            </View>

            <Pressable
              onPress={handleDone}
              className="rounded-2xl p-4 items-center justify-center active:opacity-80"
              style={{ backgroundColor: colors.accent.primary }}
            >
              <Text style={{ color: colors.bg.primary === '#111111' ? '#000000' : '#FFFFFF' }} className="font-bold text-base">
                Done
              </Text>
            </Pressable>
          </View>
        )}

        {/* Error Message */}
        {error && (
          <View className="rounded-2xl p-4 flex-row items-start mb-6" style={{ backgroundColor: '#EF444420' }}>
            <X size={20} color="#EF4444" strokeWidth={2} />
            <Text className="text-red-500 text-sm ml-3 flex-1">{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
      </View>
    </View>
  );
}
