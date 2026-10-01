import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Platform, Share, ScrollView, Image, Linking, KeyboardAvoidingView, useWindowDimensions, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Clock, Landmark, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabaseSettings } from '@/lib/supabase/settings';
import { supabaseData } from '@/lib/supabase/data';
import { generateCheckoutCode } from '@/lib/generateCheckoutCode';
import { buildSocialCheckoutUrl } from '@/lib/tracking-url';
import { formatCurrency, SOCIAL_CHECKOUT_EXPIRY_MS, type BankAccount, type SocialCheckoutDraft } from '@/lib/state/fyll-store';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

// New payment link, presented over Payments: a centred dialog on desktop and
// a bottom sheet on phones. Staff paste the bill they sent in the DM, we add
// it up, and the right-hand preview shows exactly what the customer gets.

const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

type BillLine = { qty: number | null; name: string; amount: number };

// "2x Gold hoop earrings  8,500" -> 2 × ₦8,500. Lines without a trailing
// price are ignored; quantity is optional ("Delivery Lekki 5,000").
function parseBill(text: string): BillLine[] {
  return text
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line): BillLine | null => {
      const match = line.match(/^(?:(\d+)\s*[x×]\s*)?(.+?)[\s:–-]+₦?\s*([\d,]+(?:\.\d+)?)\s*$/i);
      if (!match) return null;
      const unit = Number(match[3].replace(/,/g, ''));
      if (!Number.isFinite(unit) || unit <= 0) return null;
      const qty = match[1] ? Number(match[1]) : null;
      return { qty, name: match[2].trim(), amount: unit * (qty ?? 1) };
    })
    .filter((line): line is BillLine => Boolean(line));
}

const formatPlain = (value: number) => value.toLocaleString('en-NG', { maximumFractionDigits: 2 });

function formatExpiry(ms: number) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const isTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toDateString() === date.toDateString();
  return isTomorrow ? `tomorrow, ${time}` : `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function NewSocialCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { isDesktop } = useBreakpoint();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { businessName, businessSlug, businessLogo } = useBusinessSettings();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState<boolean>(false);
  const [billNote, setBillNote] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [amountEdited, setAmountEdited] = useState<boolean>(false);
  const [showCustomer, setShowCustomer] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [created, setCreated] = useState<{ code: string; url: string; expiresAtMs: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [messageCopied, setMessageCopied] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    supabaseSettings.fetchSettings<BankAccount>('payment_accounts', businessId).then((rows) => {
      const list = rows.map((row) => row.data);
      setAccounts(list);
      const defaultAccount = list.find((a) => a.isDefault) ?? list[0];
      if (defaultAccount) setSelectedAccountId(defaultAccount.id);
    });
  }, [businessId]);

  const billLines = useMemo(() => parseBill(billNote), [billNote]);
  const billTotal = billLines.reduce((sum, line) => sum + line.amount, 0);

  // The total follows the bill until staff type their own figure.
  useEffect(() => {
    if (!amountEdited) setAmount(billTotal > 0 ? String(billTotal) : '');
  }, [amountEdited, billTotal]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const isFormValid = parsedAmount > 0 && !!selectedAccount;
  const storeName = businessName?.trim() || 'us';
  const itemCount = billLines.filter((line) => line.qty !== null).reduce((sum, line) => sum + (line.qty ?? 0), 0);

  // Same wording staff have always sent; the preview below renders this exact text.
  const buildPaymentMessage = (link: string) => [
    'Kindly make payment using the below information.',
    '',
    'Bill',
    billNote.trim() || 'No bill details provided.',
    '',
    `Amount: ₦${parsedAmount.toLocaleString('en-NG')}`,
    '',
    'Bank Transfer Link',
    link,
    '',
    'Your payment link expires in 24 hours.',
  ].join('\n');

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/payments' as never);
  };

  const resetForm = () => {
    setCreated(null);
    setBillNote('');
    setAmount('');
    setAmountEdited(false);
    setCustomerName('');
    setCustomerPhone('');
    setShowCustomer(false);
    setLinkCopied(false);
    setMessageCopied(false);
  };

  const handleCreate = async () => {
    if (!isFormValid || !businessId || !selectedAccount || isCreating) return;
    setIsCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const code = await generateCheckoutCode();
      const now = Date.now();
      const expiresAtMs = now + SOCIAL_CHECKOUT_EXPIRY_MS;

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
        expiresAt: new Date(expiresAtMs).toISOString(),
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

      setCreated({ code, url, expiresAtMs });
    } catch {
      Alert.alert('Could not create link', 'Please check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const flash = (set: (value: boolean) => void) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    set(true);
    setTimeout(() => set(false), 1800);
  };

  const handleCopyLink = async () => {
    if (!created) return;
    await Clipboard.setStringAsync(created.url);
    flash(setLinkCopied);
  };

  const handleCopyMessage = async () => {
    if (!created) return;
    await Clipboard.setStringAsync(buildPaymentMessage(created.url));
    flash(setMessageCopied);
  };

  const handleShareWhatsApp = async () => {
    if (!created) return;
    const text = encodeURIComponent(buildPaymentMessage(created.url));
    // Nigerian numbers typed as 080… become 23480… for wa.me.
    const digits = customerPhone.replace(/\D/g, '');
    const phone = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
    const url = `https://wa.me/${phone.length >= 10 ? phone : ''}?text=${text}`;
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener');
        return;
      }
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message: buildPaymentMessage(created.url) });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  const fieldStyle = (key: string, extra?: object) => [
    {
      minHeight: 46,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: focusedField === key ? (palette.isDark ? 'rgba(213,224,87,0.6)' : '#111111') : palette.border,
      backgroundColor: palette.inputBg,
      color: palette.text,
      fontSize: isDesktop ? 14.5 : 15,
    },
    extra,
    noWebOutline,
  ];
  const ghostButton = (state: PressableStateCallbackType, height = 44) => ({
    height,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    borderWidth: 1,
    borderColor: isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.3)' : '#BDBDBD') : palette.outline,
    backgroundColor: state.pressed ? palette.softFill : 'transparent',
  });
  const limeButton = (state: PressableStateCallbackType, enabled: boolean, height: number) => ({
    height,
    paddingHorizontal: 22,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    backgroundColor: enabled ? (isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME) : palette.softFill,
    opacity: state.pressed && enabled ? 0.85 : 1,
  });

  const label = (text: string, hint?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>{text}</Text>
      {hint ? <Text style={{ color: palette.faint, fontSize: 12.5, flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );

  const messageBubble = (
    <Text style={{ color: palette.textSoft, fontSize: 13.5, lineHeight: 21 }} selectable>
      {buildPaymentMessage(created ? created.url : 'Your link appears here once created')}
    </Text>
  );

  const billSection = (
    <View style={{ gap: 8 }}>
      {label('Order bill', isDesktop ? 'Paste the bill you sent in the DM' : undefined)}
      <TextInput
        accessibilityLabel="Order bill"
        placeholder={'2x Gold hoop earrings  8,500\n1x Silver chain 18"  6,000\nDelivery Lekki  5,000'}
        placeholderTextColor={palette.faint}
        value={billNote}
        onChangeText={setBillNote}
        onFocus={() => setFocusedField('bill')}
        onBlur={() => setFocusedField(null)}
        multiline
        textAlignVertical="top"
        style={fieldStyle('bill', { minHeight: 96, paddingTop: 12, paddingBottom: 12, lineHeight: 23 })}
        selectionColor={palette.text}
      />
      {!isDesktop ? <Text style={{ color: palette.faint, fontSize: 12.5 }}>Paste the bill you sent in the DM. We add it up.</Text> : null}
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.hairline, overflow: 'hidden' }}>
        {billLines.map((line, index) => (
          <View key={`${line.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
            <Text style={{ minWidth: 24, color: palette.faint, fontSize: 14 }}>{line.qty ? `${line.qty}×` : ''}</Text>
            <Text style={{ flex: 1, color: palette.textSoft, fontSize: 14 }} numberOfLines={1}>{line.name}</Text>
            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(line.amount)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: palette.isDark ? '#1B1B1B' : '#FAFAF8' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Total</Text>
            {isDesktop ? (
              <Text style={{ color: palette.faint, fontSize: 12.5 }}>
                {billLines.length > 0 && !amountEdited ? 'Added up from the bill. Tap to change.' : amountEdited && billLines.length > 0 ? 'Changed by you.' : 'Enter the amount to collect.'}
              </Text>
            ) : null}
          </View>
          {amountEdited && billLines.length > 0 ? (
            <Pressable onPress={() => setAmountEdited(false)} hitSlop={6}>
              <Text style={{ color: palette.muted, fontSize: 12.5, fontWeight: '600' }}>Use bill total</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: focusedField === 'amount' ? (palette.isDark ? 'rgba(213,224,87,0.6)' : '#111111') : palette.outline, backgroundColor: palette.page }}>
            <Text style={{ color: palette.faint, fontSize: 15 }}>₦</Text>
            <TextInput
              accessibilityLabel="Total amount"
              value={focusedField === 'amount' ? amount : parsedAmount > 0 ? formatPlain(parsedAmount) : ''}
              onChangeText={(text) => {
                setAmountEdited(true);
                setAmount(text.replace(/[^\d.]/g, ''));
              }}
              onFocus={() => setFocusedField('amount')}
              onBlur={() => setFocusedField(null)}
              placeholder="0"
              placeholderTextColor={palette.faint}
              keyboardType="decimal-pad"
              style={[{ minWidth: 70, maxWidth: 140, color: palette.text, fontSize: isDesktop ? 20 : 19, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }, noWebOutline]}
              selectionColor={palette.text}
            />
          </View>
        </View>
      </View>
    </View>
  );

  const accountSection = (
    <View style={{ gap: 8 }}>
      {label('Customer pays into')}
      {accounts.length === 0 ? (
        <Pressable
          onPress={() => router.push('/payment-accounts' as never)}
          style={(state) => ({ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.warnBorder, backgroundColor: isHovered(state) ? palette.warnBg : 'transparent' })}
        >
          <Text style={{ color: palette.warn, fontSize: 14, fontWeight: '600' }}>No bank accounts yet — add one</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change bank account"
            onPress={() => setShowAccountPicker((value) => !value)}
            style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: showAccountPicker ? palette.outline : palette.border, backgroundColor: isHovered(state) ? palette.cardHover : palette.inputBg })}
          >
            {isDesktop ? (
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                <Landmark size={18} color={palette.textSoft} strokeWidth={2} />
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>
                {selectedAccount ? `${selectedAccount.bankName} · ${selectedAccount.accountNumber}` : 'Choose an account'}
              </Text>
              {selectedAccount ? <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>{selectedAccount.accountName}</Text> : null}
            </View>
            {isDesktop && selectedAccount?.isDefault ? (
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: palette.softFill, justifyContent: 'center' }}>
                <Text style={{ color: palette.muted, fontSize: 11.5, fontWeight: '600' }}>Default</Text>
              </View>
            ) : null}
            {isDesktop ? (
              <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>{showAccountPicker ? 'Done' : 'Change'}</Text>
            ) : showAccountPicker ? (
              <ChevronDown size={16} color={palette.faint} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
            )}
          </Pressable>
          {showAccountPicker ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
              {accounts.map((account, index) => {
                const isSelected = account.id === selectedAccountId;
                return (
                  <Pressable
                    key={account.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedAccountId(account.id);
                      setShowAccountPicker(false);
                    }}
                    style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, backgroundColor: isHovered(state) || state.pressed ? palette.cardHover : 'transparent' })}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: isSelected ? '600' : '500' }} numberOfLines={1}>{account.bankName} · {account.accountNumber}</Text>
                      <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 1 }} numberOfLines={1}>{account.accountName}{account.isDefault ? ' · Default' : ''}</Text>
                    </View>
                    {isSelected ? <Check size={16} color={palette.text} strokeWidth={2.6} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const customerSection = showCustomer ? (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>Customer</Text>
        <Pressable
          onPress={() => {
            setShowCustomer(false);
            setCustomerName('');
            setCustomerPhone('');
          }}
          hitSlop={8}
        >
          <Text style={{ color: palette.faint, fontSize: 12.5 }}>Remove</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 8 }}>
        <TextInput accessibilityLabel="Customer name" placeholder="Name" placeholderTextColor={palette.faint} value={customerName} onChangeText={setCustomerName} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} autoFocus style={fieldStyle('name', { flex: isDesktop ? 1 : undefined })} selectionColor={palette.text} />
        <TextInput accessibilityLabel="Customer phone" placeholder="Phone" placeholderTextColor={palette.faint} value={customerPhone} onChangeText={setCustomerPhone} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} keyboardType="phone-pad" style={fieldStyle('phone', { flex: isDesktop ? 1 : undefined })} selectionColor={palette.text} />
      </View>
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={() => setShowCustomer(true)}
      style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}
    >
      <Plus size={16} color={palette.textSoft} strokeWidth={2.2} />
      <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '600' }}>Add customer</Text>
      <Text style={{ color: palette.faint, fontSize: 12.5, flexShrink: 1 }} numberOfLines={1}>{isDesktop ? 'Optional · if you know them from the DM' : 'Optional'}</Text>
    </Pressable>
  );

  const createButton = (height: number) => (
    <Pressable
      accessibilityRole="button"
      onPress={handleCreate}
      disabled={!isFormValid || isCreating}
      style={(state) => limeButton(state, isFormValid, height)}
    >
      {isCreating ? (
        <ActivityIndicator color={FYLL_LIME_INK} size="small" />
      ) : (
        <Text style={{ color: isFormValid ? FYLL_LIME_INK : palette.faint, fontSize: isDesktop ? 14.5 : 15, fontWeight: '600' }}>
          {parsedAmount > 0 ? `Create link · ${formatCurrency(parsedAmount)}` : 'Create link'}
        </Text>
      )}
    </Pressable>
  );

  const expiryNote = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Clock size={15} color={palette.faint} strokeWidth={2} />
      <Text style={{ color: palette.faint, fontSize: 12.5 }}>Link expires 24 hours after you create it</Text>
    </View>
  );

  const formBody = isDesktop ? (
    <View style={{ flex: 1, flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 24, paddingHorizontal: 28, gap: 22 }} keyboardShouldPersistTaps="handled">
        {billSection}
        {accountSection}
        {customerSection}
      </ScrollView>
      <ScrollView
        style={{ width: 340, flexGrow: 0, backgroundColor: palette.isDark ? '#111111' : '#F7F7F5', borderLeftWidth: 1, borderLeftColor: palette.hairline }}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 24, paddingHorizontal: 22, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: palette.faint, fontSize: 13, fontWeight: '600' }}>What the customer gets</Text>
        <View style={{ alignSelf: 'flex-end', maxWidth: 280, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderBottomRightRadius: 4, backgroundColor: palette.isDark ? '#1E1E1E' : '#FFFFFF', borderWidth: palette.isDark ? 0 : 1, borderColor: palette.border }}>
          {messageBubble}
        </View>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 10, backgroundColor: palette.isDark ? 'transparent' : '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {businessLogo ? (
              <Image source={{ uri: businessLogo }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF' }} resizeMode="cover" />
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: palette.avatarText, fontSize: 13, fontWeight: '600' }}>{storeName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{businessName || 'Your store'}</Text>
              <Text style={{ color: palette.faint, fontSize: 11.5 }}>Fyll checkout</Text>
            </View>
          </View>
          <MoneyText style={{ color: palette.text, fontSize: 26, letterSpacing: -0.5 }}>{parsedAmount > 0 ? formatCurrency(parsedAmount) : '₦0'}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 12.5, lineHeight: 19 }}>
            {[itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null, selectedAccount ? `transfer to ${selectedAccount.bankName}` : null].filter(Boolean).join(' · ') || 'Bank transfer'}
            {'\n'}Customer adds delivery details and uploads their receipt.
          </Text>
        </View>
        <View style={{ marginTop: 'auto', paddingTop: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Clock size={15} color={palette.faint} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, color: palette.faint, fontSize: 12.5, lineHeight: 18 }}>You get a pending payment to approve once they upload a receipt.</Text>
        </View>
      </ScrollView>
    </View>
  ) : (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 18, paddingHorizontal: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
      {billSection}
      {accountSection}
      {customerSection}
      <View style={{ gap: 8 }}>
        <Text style={{ color: palette.faint, fontSize: 13, fontWeight: '600' }}>Message preview</Text>
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.isDark ? '#1E1E1E' : '#F6F6F4' }}>{messageBubble}</View>
      </View>
    </ScrollView>
  );

  const formFooter = isDesktop ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingLeft: 28, paddingRight: 20, borderTopWidth: 1, borderTopColor: palette.hairline }}>
      <View style={{ flex: 1 }}>{expiryNote}</View>
      <Pressable onPress={close} style={(state) => ghostButton(state)}>
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
      </Pressable>
      {createButton(46)}
    </View>
  ) : (
    <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 14) + 10, borderTopWidth: 1, borderTopColor: palette.hairline, gap: 10 }}>
      {createButton(50)}
      <Text style={{ color: palette.faint, fontSize: 12.5, textAlign: 'center' }}>Link expires 24 hours after you create it</Text>
    </View>
  );

  const successBody = created ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: isDesktop ? 'center' : 'flex-start', paddingTop: isDesktop ? 24 : 40, paddingHorizontal: 20, paddingBottom: isDesktop ? 24 : Math.max(insets.bottom, 14) + 20 }}>
      <View style={{ width: '100%', maxWidth: 460, flexGrow: isDesktop ? 0 : 1, alignItems: 'center', gap: 18 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: palette.tones.verified.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={26} color={palette.tones.verified.ink} strokeWidth={2.6} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <MoneyText style={{ color: palette.text, fontSize: 34, letterSpacing: -0.6 }}>{formatCurrency(parsedAmount)}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 13.5, textAlign: 'center' }}>
            {[customerName.trim() || null, selectedAccount?.bankName ?? null, `expires ${formatExpiry(created.expiresAtMs)}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingRight: 6, paddingLeft: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.inputBg }}>
          <Text style={{ flex: 1, color: palette.text, fontSize: 15 }} numberOfLines={1} selectable>{created.url.replace(/^https?:\/\//, '')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy link"
            onPress={handleCopyLink}
            style={(state) => ({ height: 36, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isHovered(state) ? palette.outline : palette.softFill })}
          >
            {linkCopied ? <Check size={14} color={palette.text} strokeWidth={2.6} /> : null}
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{linkCopied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        <View style={{ width: '100%', flexDirection: isDesktop ? 'row' : 'column', gap: 8, marginTop: isDesktop ? 0 : 'auto' }}>
          <Pressable accessibilityRole="button" onPress={handleCopyMessage} style={(state) => ({ ...limeButton(state, true, isDesktop ? 46 : 50), flex: isDesktop ? 1 : undefined })}>
            {messageCopied ? <Check size={16} color={FYLL_LIME_INK} strokeWidth={2.6} /> : null}
            <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '600' }}>{messageCopied ? 'Message copied' : 'Copy message'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleShareWhatsApp} style={(state) => ({ ...ghostButton(state, 46), flex: isDesktop ? 1 : undefined })}>
            <Text style={{ color: palette.text, fontSize: 14.5, fontWeight: '600' }}>Share to WhatsApp</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(`/social-checkout/${created.code}` as never)}
            style={(state) => ({ height: 38, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: state.pressed || isHovered(state) ? palette.outline : palette.softFill })}
          >
            <ArrowUpRight size={15} color={palette.textSoft} strokeWidth={2.2} />
            <Text style={{ color: palette.textSoft, fontSize: 13.5, fontWeight: '600' }}>View payment</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={resetForm}
            style={(state) => ({ height: 38, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: state.pressed || isHovered(state) ? palette.outline : palette.softFill })}
          >
            <Plus size={15} color={palette.textSoft} strokeWidth={2.2} />
            <Text style={{ color: palette.textSoft, fontSize: 13.5, fontWeight: '600' }}>Create another</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  ) : null;

  const title = created ? 'Link ready' : 'New payment link';
  const subtitle = created
    ? isDesktop ? 'Send it in the same DM. It shows up in Payments as unpaid until they pay.' : 'Send it in the same DM'
    : isDesktop ? 'For an order you agreed over DM' : 'For an order agreed over DM';

  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center', padding: isDesktop ? 24 : 0 }}
      >
        <View
          accessibilityRole="none"
          style={[
            {
              width: isDesktop ? 940 : '100%',
              maxWidth: '100%',
              height: isDesktop ? Math.min(780, windowHeight - 48) : undefined,
              maxHeight: isDesktop ? undefined : windowHeight - Math.max(insets.top, 20) - 56,
              flexShrink: 1,
              backgroundColor: palette.isDark ? '#161616' : '#FFFFFF',
              borderRadius: isDesktop ? 24 : 26,
              borderBottomLeftRadius: isDesktop ? 24 : 0,
              borderBottomRightRadius: isDesktop ? 24 : 0,
              borderWidth: 1,
              borderColor: palette.isDark ? 'rgba(255,255,255,0.08)' : '#E8E8E8',
              overflow: 'hidden',
            },
            Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(0,0,0,0.5)' } as object) : { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 24 },
          ]}
        >
          {!isDesktop ? <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline, marginTop: 8 }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: isDesktop ? 20 : 12, paddingBottom: isDesktop ? 18 : 14, paddingLeft: isDesktop ? 28 : 20, paddingRight: isDesktop ? 20 : 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: palette.text, fontSize: isDesktop ? 18 : 17, fontWeight: '600' }}>{title}</Text>
              <Text style={{ color: palette.faint, fontSize: isDesktop ? 13 : 12.5 }}>{subtitle}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              style={(state) => ({ width: isDesktop ? 40 : 36, height: isDesktop ? 40 : 36, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.outline : palette.softFill })}
            >
              <X size={isDesktop ? 18 : 16} color={palette.text} strokeWidth={2.3} />
            </Pressable>
          </View>
          {created ? successBody : (
            <>
              {formBody}
              {formFooter}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
