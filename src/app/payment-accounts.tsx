import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Star, Landmark, Check, MoreVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { supabaseSettings } from '@/lib/supabase/settings';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import type { BankAccount } from '@/lib/state/fyll-store';

// Styled to match the reference dashboard: flat list rows (icon + name +
// DEFAULT pill + subtitle) with the add/edit form shown inline above the
// existing accounts.

const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

const emptyForm = { bankName: '', accountName: '', accountNumber: '' };

export default function PaymentAccountsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const panelStyles = getSettingsWebPanelStyles(isFromSettingsRoute(from), colors.bg.primary, colors.border.light);
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const primaryButtonBg = isDark ? '#FFFFFF' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const bankIconBg = isDark ? 'rgba(255, 255, 255, 0.08)' : colors.bg.secondary;
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? null);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    supabaseSettings
      .fetchSettings<BankAccount>('payment_accounts', businessId)
      .then((rows) => setAccounts(rows.map((row) => row.data)))
      .finally(() => setIsLoading(false));
  }, [businessId]);

  const persist = async (next: BankAccount[]) => {
    if (!businessId) return;
    setIsSaving(true);
    try {
      await supabaseSettings.upsertSettings('payment_accounts', businessId, next, currentUserName);
      setAccounts(next);
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddForm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (account: BankAccount) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpenMenuAccountId(null);
    setEditingId(account.id);
    setForm({ bankName: account.bankName, accountName: account.accountName, accountNumber: account.accountNumber });
    setShowForm(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    const bankName = form.bankName.trim();
    const accountName = form.accountName.trim();
    const accountNumber = form.accountNumber.trim();
    if (!bankName || !accountName || !accountNumber) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (editingId) {
      await persist(accounts.map((a) => (a.id === editingId ? { ...a, bankName, accountName, accountNumber } : a)));
    } else {
      const newAccount: BankAccount = {
        id: `bank-${Date.now()}`,
        bankName,
        accountName,
        accountNumber,
        isDefault: accounts.length === 0,
      };
      await persist([newAccount, ...accounts]);
    }
    closeForm();
  };

  const handleDelete = (account: BankAccount) => {
    setOpenMenuAccountId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove bank account', `Remove ${account.bankName} (${account.accountNumber})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          let next = accounts.filter((a) => a.id !== account.id);
          if (account.isDefault && next.length > 0) next = next.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
          persist(next);
        },
      },
    ]);
  };

  const handleSetDefault = (account: BankAccount) => {
    if (account.isDefault) return;
    setOpenMenuAccountId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(accounts.map((a) => ({ ...a, isDefault: a.id === account.id })));
  };

  if (currentUserRole !== 'admin') {
    return (
      <View className="flex-1" style={panelStyles.outer}>
        <SafeAreaView className="flex-1" edges={['top']} style={panelStyles.inner}>
          <View className="flex-1 items-center justify-center px-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-4" style={{ backgroundColor: bankIconBg }}>
              <Landmark size={24} color={colors.text.tertiary} strokeWidth={2} />
            </View>
            <Text style={{ color: colors.text.primary }} className="text-base font-semibold text-center">Admin Access Required</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm text-center mt-2 max-w-xs">
              Bank account settings are only available to admins.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={panelStyles.outer}>
      <SafeAreaView className="flex-1" edges={['top']} style={panelStyles.inner}>
        <View
          className="px-5 pt-4 pb-3 flex-row items-center justify-between"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
            ...(Platform.OS === 'web' ? { paddingTop: 10, paddingBottom: 10 } : {}),
          }}
        >
          <View className="flex-row items-center flex-1 min-w-0">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                goBack();
              }}
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
              numberOfLines={1}
            >
              Bank Accounts
            </Text>
          </View>
          {!showForm ? (
            <Pressable
              onPress={openAddForm}
              className="rounded-full items-center justify-center flex-row gap-1.5 active:opacity-80 px-4"
              style={{ height: 40, backgroundColor: primaryButtonBg, minWidth: 92 }}
            >
              <Plus size={16} color={primaryButtonText} strokeWidth={2.5} />
              <Text style={{ color: primaryButtonText }} className="text-sm font-semibold">Add</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: isDesktop ? 40 : tabBarHeight + 32,
            maxWidth: isDesktop ? 720 : undefined,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isDesktop ? 'center' : undefined,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ color: colors.text.tertiary }} className="text-sm mb-5">Shown to customers on checkout links.</Text>

          {!isLoading && (showForm || accounts.length === 0) ? (
            <View className="rounded-[24px] p-5 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
              <Text style={{ color: colors.text.primary }} className="text-base font-bold mb-5">{editingId ? 'Edit bank account' : 'New bank account'}</Text>
              <View style={{ gap: 16 }}>
                <View
                  className="rounded-full px-5"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 56, justifyContent: 'center' }}
                >
                  <TextInput
                    placeholder="Bank name (e.g. GTBank)"
                    placeholderTextColor={colors.input.placeholder}
                    value={form.bankName}
                    onChangeText={(text) => setForm((f) => ({ ...f, bankName: text }))}
                    style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                    selectionColor={colors.text.primary}
                  />
                </View>
                <View
                  className="rounded-full px-5"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 56, justifyContent: 'center' }}
                >
                  <TextInput
                    placeholder="Account name"
                    placeholderTextColor={colors.input.placeholder}
                    value={form.accountName}
                    onChangeText={(text) => setForm((f) => ({ ...f, accountName: text }))}
                    style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                    selectionColor={colors.text.primary}
                  />
                </View>
                <View
                  className="rounded-full px-5"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 56, justifyContent: 'center' }}
                >
                  <TextInput
                    placeholder="Account number"
                    placeholderTextColor={colors.input.placeholder}
                    value={form.accountNumber}
                    onChangeText={(text) => setForm((f) => ({ ...f, accountNumber: text }))}
                    keyboardType="number-pad"
                    style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>

              <View className="flex-row justify-end gap-3 mt-6">
                <Pressable
                  onPress={closeForm}
                  disabled={isSaving || accounts.length === 0}
                  className="rounded-full items-center justify-center px-7"
                  style={{ height: 48, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, opacity: accounts.length === 0 ? 0.45 : 1 }}
                >
                  <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={isSaving || !form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim()}
                  className="rounded-full items-center justify-center px-7"
                  style={{
                    height: 48,
                    backgroundColor: form.bankName.trim() && form.accountName.trim() && form.accountNumber.trim() ? '#111111' : colors.border.light,
                  }}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={{ color: '#FFFFFF' }} className="font-semibold text-sm">Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}

          {isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.text.tertiary} />
            </View>
          ) : accounts.length === 0 ? null : (
            <View style={{ gap: 12 }}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() => openEditForm(account)}
                  className="flex-row items-start p-5 rounded-[24px] active:opacity-70"
                  style={{ minHeight: 104, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, position: 'relative', overflow: 'visible' }}
                >
                  <View className="w-14 h-14 rounded-full items-center justify-center mr-4 mt-0.5" style={{ backgroundColor: bankIconBg }}>
                    <Landmark size={22} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1 pr-3">
                    {account.isDefault ? (
                      <View className="px-3 py-1 rounded-full flex-row items-center gap-1.5 mb-2 self-start" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)' }}>
                        <Check size={12} color="#059669" strokeWidth={3} />
                        <Text style={{ color: '#059669' }} className="text-xs font-bold uppercase tracking-wider">Default</Text>
                      </View>
                    ) : null}
                    <Text style={{ color: colors.text.primary, lineHeight: 22 }} className="font-semibold text-base">{account.bankName}</Text>
                    <Text style={{ color: colors.text.secondary, lineHeight: 20 }} className="text-sm mt-1">{account.accountName}</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">{account.accountNumber}</Text>
                  </View>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      setOpenMenuAccountId((current) => current === account.id ? null : account.id);
                    }}
                    className="w-9 h-9 items-center justify-center active:opacity-50"
                  >
                    <MoreVertical size={20} color={colors.text.muted} strokeWidth={2.2} />
                  </Pressable>
                  {openMenuAccountId === account.id ? (
                    <View
                      style={{
                        position: 'absolute',
                        right: 16,
                        top: 54,
                        width: 176,
                        borderRadius: 16,
                        backgroundColor: colors.bg.card,
                        borderWidth: 1,
                        borderColor: separatorColor,
                        shadowColor: '#000000',
                        shadowOpacity: colors.bg.primary === '#111111' ? 0.36 : 0.12,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 8,
                        zIndex: 10,
                      }}
                    >
                      {!account.isDefault ? (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            handleSetDefault(account);
                          }}
                          className="flex-row items-center px-4 py-3 active:opacity-70"
                        >
                          <Star size={16} color={colors.text.primary} strokeWidth={2.2} />
                          <Text style={{ color: colors.text.primary }} className="text-sm font-medium ml-2">Set Default</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          handleDelete(account);
                        }}
                        className="flex-row items-center px-4 py-3 active:opacity-70"
                      >
                        <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
                        <Text style={{ color: '#DC2626' }} className="text-sm font-medium ml-2">Delete</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
