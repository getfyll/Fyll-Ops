import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Platform, Share, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Clock, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabaseSettings } from '@/lib/supabase/settings';
import { supabaseData } from '@/lib/supabase/data';
import { generateCheckoutCode } from '@/lib/generateCheckoutCode';
import { buildSocialCheckoutUrl } from '@/lib/tracking-url';
import { SOCIAL_CHECKOUT_EXPIRY_MS, type BankAccount, type SocialCheckoutDraft } from '@/lib/state/fyll-store';

// Styled to match the reference dashboard: quiet card sections with a small
// uppercase-free section title, hairline borders, pill actions.

const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  return (
    <View className="rounded-2xl p-5 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
      <View className="flex-row items-center justify-between mb-4">
        <Text style={{ color: colors.text.primary }} className="font-semibold text-base">{title}</Text>
        {hint ? <Text style={{ color: colors.text.muted }} className="text-xs">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function NewSocialCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const primaryButtonBg = isDark ? '#FFFFFF' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { businessName, businessSlug } = useBusinessSettings();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [billNote, setBillNote] = useState('');
  const [amount, setAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    supabaseSettings.fetchSettings<BankAccount>('payment_accounts', businessId).then((rows) => {
      const list = rows.map((row) => row.data);
      setAccounts(list);
      const defaultAccount = list.find((a) => a.isDefault) ?? list[0];
      if (defaultAccount) setSelectedAccountId(defaultAccount.id);
    });
  }, [businessId]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
  const parsedAmount = parseFloat(amount) || 0;
  const isFormValid = parsedAmount > 0 && !!selectedAccount;

  const buildPaymentMessage = (link: string) => {
    const bill = billNote.trim() || 'No bill details provided.';

    return [
      'Kindly make payment using the below information.',
      '',
      'Bill',
      bill,
      '',
      `Amount: ₦${parsedAmount.toLocaleString('en-NG')}`,
      '',
      'Bank Transfer Link',
      link,
      '',
      'Your payment link expires in 24 hours.',
    ].join('\n');
  };

  const handleCreate = async () => {
    if (!isFormValid || !businessId || !selectedAccount) return;
    setIsCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const code = await generateCheckoutCode();
      const now = Date.now();

      const draft: SocialCheckoutDraft = {
        id: code,
        businessId,
        status: 'awaiting_payment',
        billNote: billNote.trim(),
        amount: parsedAmount,
        bankAccount: {
          bankName: selectedAccount.bankName,
          accountName: selectedAccount.accountName,
          accountNumber: selectedAccount.accountNumber,
        },
        createdBy: currentUser?.name ?? 'Staff',
        createdByUserId: currentUser?.id ?? '',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SOCIAL_CHECKOUT_EXPIRY_MS).toISOString(),
        updatedAt: new Date(now).toISOString(),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
      };

      await supabaseData.upsertCollection('social_checkouts', businessId, [draft]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['social-checkouts', businessId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-social-checkouts', businessId] }),
      ]);

      const url =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? buildSocialCheckoutUrl({ origin: window.location.origin, businessName, businessSlug, code })
          : buildSocialCheckoutUrl({ origin: '', businessName, businessSlug, code });

      setCreatedLink(url);
    } catch {
      Alert.alert('Could not create link', 'Please check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    await Clipboard.setStringAsync(buildPaymentMessage(createdLink));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const handleShareLink = async () => {
    if (!createdLink) return;
    try {
      await Share.share({ message: buildPaymentMessage(createdLink) });
    } catch {
      // user cancelled — nothing to do
    }
  };

  if (createdLink) {
    return (
      <View className="flex-1 flex-row" style={{ backgroundColor: colors.bg.primary }}>
        {isDesktop ? <DesktopSidebar /> : null}
        <SafeAreaView
          className="flex-1 items-center justify-center px-6"
          edges={['top']}
          style={{ paddingBottom: isDesktop ? 0 : tabBarHeight }}
        >
          <View className="w-14 h-14 rounded-2xl items-center justify-center mb-5" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)' }}>
            <Check size={26} color="#059669" strokeWidth={2} />
          </View>
          <Text style={{ color: colors.text.primary }} className="text-lg font-bold mb-1 text-center">Payment link ready</Text>
          <Text style={{ color: colors.text.tertiary }} className="text-sm mb-6 text-center">Send this to your customer over WhatsApp or Instagram.</Text>

          <View className="w-full max-w-sm rounded-2xl p-4 mb-3" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}>
            <Text style={{ color: colors.text.secondary }} className="text-sm" numberOfLines={2} selectable>
              {createdLink}
            </Text>
          </View>

          <View className="flex-row items-center mb-4">
            <Clock size={13} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.muted }} className="text-xs ml-1.5">Expires in 24 hours</Text>
          </View>

          <View className="w-full max-w-sm flex-row gap-3">
            <Pressable
              onPress={handleCopyLink}
              className="flex-1 rounded-full items-center justify-center flex-row gap-2 active:opacity-80"
              style={{ height: 44, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor }}
            >
              {linkCopied ? <Check size={16} color="#059669" strokeWidth={2.5} /> : <Copy size={16} color={colors.text.primary} strokeWidth={2} />}
              <Text style={{ color: linkCopied ? '#059669' : colors.text.primary }} className="font-medium text-sm">
                {linkCopied ? 'Copied' : 'Copy Message'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShareLink}
              className="flex-1 rounded-full items-center justify-center flex-row gap-2 active:opacity-80"
              style={{ height: 44, backgroundColor: primaryButtonBg }}
            >
              <Link2 size={16} color={primaryButtonText} strokeWidth={2} />
              <Text style={{ color: primaryButtonText }} className="font-semibold text-sm">Share</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.back()} className="mt-6 active:opacity-70">
            <Text style={{ color: colors.text.tertiary }} className="text-sm">Done</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: colors.bg.primary }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          className="flex-row items-center justify-between px-5 py-4"
          style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: separatorColor }}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center active:opacity-50"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <X size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text style={{ color: colors.text.primary }} className="text-lg font-bold" numberOfLines={1}>
            Payment Link
          </Text>
          <View className="w-10 h-10" />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: isDesktop ? 24 : 20,
            paddingBottom: isDesktop ? 40 : tabBarHeight + 32,
            maxWidth: isDesktop ? 720 : undefined,
            width: isDesktop ? '100%' : undefined,
            alignSelf: isDesktop ? 'center' : undefined,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ color: colors.text.tertiary }} className="text-sm mb-2">Generate a one-tap payment link for a DM order.</Text>
          <View className="flex-row items-center mb-6">
            <Clock size={12} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.muted }} className="text-xs ml-1.5">Link expires 24 hours after you generate it</Text>
          </View>

          <Section title="Order bill" hint="Paste the bill you gave over DM">
            <View
              className="rounded-xl px-3.5 py-3"
              style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, minHeight: 110 }}
            >
              <TextInput
                placeholder={'e.g.\n2x Gold hoop earrings\n1x Silver chain, 18"'}
                placeholderTextColor={colors.input.placeholder}
                value={billNote}
                onChangeText={setBillNote}
                multiline
                textAlignVertical="top"
                style={[{ color: colors.input.text, fontSize: 14, minHeight: 86 }, noWebOutline]}
                selectionColor={colors.text.primary}
              />
            </View>
          </Section>

          <Section title="Total amount (₦)">
            <View
              className="rounded-full px-4 flex-row items-center"
              style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 52 }}
            >
              <TextInput
                placeholder="0"
                placeholderTextColor={colors.input.placeholder}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={[{ color: colors.input.text, fontSize: 16, fontWeight: '600', flex: 1 }, noWebOutline]}
                selectionColor={colors.text.primary}
              />
            </View>
          </Section>

          <Section title="Bank account shown to customer">
            {accounts.length === 0 ? (
              <Pressable
                onPress={() => router.push('/payment-accounts' as never)}
                className="rounded-2xl p-4 active:opacity-70"
                style={{ backgroundColor: 'rgba(217, 119, 6, 0.08)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.25)' }}
              >
                <Text style={{ color: '#D97706' }} className="text-sm font-medium">No bank accounts yet — tap to add one</Text>
              </Pressable>
            ) : (
              accounts.map((account, index) => {
                const isSelected = selectedAccountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedAccountId(account.id);
                    }}
                    className="rounded-2xl p-4 active:opacity-80"
                    style={{
                      marginBottom: index === accounts.length - 1 ? 0 : 8,
                      backgroundColor: isSelected ? colors.bg.secondary : 'transparent',
                      borderWidth: 1,
                      borderColor: isSelected ? colors.text.primary : separatorColor,
                    }}
                  >
                    <View className="flex-row items-start">
                      <View
                        className="w-[18px] h-[18px] rounded-full items-center justify-center mr-3 mt-1"
                        style={{ borderWidth: 1.5, borderColor: isSelected ? colors.text.primary : colors.border.medium }}
                      >
                        {isSelected ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.text.primary }} /> : null}
                      </View>
                      <View className="flex-1">
                        {account.isDefault ? (
                          <Text style={{ color: colors.text.muted }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Default</Text>
                        ) : null}
                        <Text style={{ color: colors.text.primary, lineHeight: 20 }} className="font-semibold text-sm">{account.bankName}</Text>
                        <Text style={{ color: colors.text.secondary, lineHeight: 18 }} className="text-sm mt-1">{account.accountName}</Text>
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">{account.accountNumber}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Section>

          <Section title="Customer (optional)" hint="If you already know them from the DM.">
            <View className="flex-row gap-3">
              <View
                className="flex-1 rounded-full px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Name"
                  placeholderTextColor={colors.input.placeholder}
                  value={customerName}
                  onChangeText={setCustomerName}
                  style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View
                className="flex-1 rounded-full px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: separatorColor, height: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Phone"
                  placeholderTextColor={colors.input.placeholder}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                  style={[{ color: colors.input.text, fontSize: 14 }, noWebOutline]}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>
          </Section>

          <View className="mt-2">
            <Pressable
              onPress={handleCreate}
              disabled={!isFormValid || isCreating}
              className="rounded-full items-center justify-center px-6 w-full"
              style={{ height: 48, backgroundColor: isFormValid ? primaryButtonBg : colors.border.light }}
            >
              {isCreating ? (
                <ActivityIndicator color={primaryButtonText} size="small" />
              ) : (
                <Text style={{ color: isFormValid ? primaryButtonText : colors.text.muted, fontSize: isDesktop ? 14 : 16 }} className="font-semibold">
                  Generate payment link
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
