import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Copy, Lock, Upload, CircleAlert, ShieldCheck } from 'lucide-react-native';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { getFyllPayPublic, submitFyllPayPayment, type FyllPaySubmitError } from '@/lib/supabase/fyll-pay-public';
import { uploadSocialCheckoutProof } from '@/lib/storage-attachments';
import { generateCheckoutCode } from '@/lib/generateCheckoutCode';
import { formatCurrency } from '@/lib/state/fyll-store';
import { getBankAccountTransferFields } from '@/lib/bank-account-regions';

// Public Fyll Pay page, opened by scanning a business's Fyll Pay QR:
// payment.fyll.app/<business>/pay (optionally ?amount=). The bank details always come
// from the account the business marked for Fyll Pay in Ops, never from the link.

const C = {
  ink: '#141414',
  lime: '#D5E057',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.72)',
  faint: 'rgba(255,255,255,0.5)',
  glass: 'rgba(34,36,26,0.62)',
  border: 'rgba(255,255,255,0.14)',
  field: 'rgba(255,255,255,0.08)',
  error: '#FFB4A8',
};
const fieldPhone = require('../../../assets/fyll-field-phone.jpg');
const fieldDesktop = require('../../../assets/fyll-field-desktop.jpg');
const wordmarkLight = require('../../../assets/fyll-wordmark-thick-light.png');
const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
const glassBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object) : null;

const ERROR_COPY: Record<FyllPaySubmitError | 'upload' | 'unknown', string> = {
  business_not_found: 'We could not find this business. Ask them for a new QR code.',
  not_enabled: 'This business has turned off Fyll Pay. Ask them how to pay.',
  invalid_code: 'Something went wrong. Please try again.',
  invalid_amount: 'Enter the amount you sent.',
  invalid_name: 'Enter your name so the business knows who paid.',
  invalid_phone: 'Enter a phone number the business can reach you on.',
  invalid_email: 'Check your email address, or leave it empty.',
  invalid_receipt: 'Upload your receipt again and try once more.',
  duplicate: 'Something went wrong. Please try again.',
  rate_limited: 'This business is receiving a lot of payments right now. Please wait a few minutes and try again.',
  upload: 'Your receipt could not be uploaded. Check your connection and try again.',
  unknown: 'We could not send your payment. Check your connection and try again.',
};

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

function Glass({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ borderRadius: 24, borderWidth: 1, borderColor: C.border, backgroundColor: C.glass, padding: 16, gap: 12 }, glassBlur, style]}>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.muted, fontSize: 13, fontWeight: '400' }}>{label}</Text>
      {children}
    </View>
  );
}

// Text field that shows a Fyll lime outline while you type in it.
function FocusInput({ style, onFocus, onBlur, ...props }: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={[style, focused ? { borderColor: C.lime, borderWidth: 1.5 } : null]}
    />
  );
}

// The typed amount and its currency symbol share one size.
const AMOUNT_TYPE = { fontSize: 40, lineHeight: 48 };

const inputStyle = {
  height: 48,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.2)',
  backgroundColor: C.field,
  color: C.white,
  paddingHorizontal: 16,
  fontSize: 16,
};

export default function FyllPayPublicScreen() {
  const params = useLocalSearchParams<{ businessSlug?: string | string[]; amount?: string | string[] }>();
  const businessSlug = readParam(params.businessSlug);
  const fixedAmount = useMemo(() => {
    const n = Number(readParam(params.amount).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params.amount]);
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const [fontsLoaded] = useFonts({ BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold });
  const headingFont = fontsLoaded ? { fontFamily: 'PublicSans_600SemiBold', fontWeight: '400' as const } : { fontWeight: '600' as const };
  const numberFont = fontsLoaded ? { fontFamily: 'PublicSans_700Bold', fontWeight: '400' as const } : { fontWeight: '700' as const };

  const [amountText, setAmountText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofName, setProofName] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorKey, setErrorKey] = useState<keyof typeof ERROR_COPY | null>(null);

  const { data: info, isLoading, isError } = useQuery({
    queryKey: ['fyll-pay-public', businessSlug],
    queryFn: () => getFyllPayPublic(businessSlug),
    enabled: !!businessSlug,
    staleTime: 60_000,
  });

  const amount = fixedAmount ?? Number(amountText.replace(/[^0-9.]/g, ''));
  const amountValid = Number.isFinite(amount) && amount > 0;
  const emailValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = amountValid && name.trim().length > 1 && phone.replace(/\D/g, '').length >= 7 && emailValid && !!proofUri;

  const submit = useMutation({
    mutationFn: async () => {
      const code = await generateCheckoutCode();
      let publicUrl = '';
      try {
        const upload = await uploadSocialCheckoutProof({ code, uri: proofUri as string, fileName: proofName || 'receipt.jpg' });
        publicUrl = upload.publicUrl;
      } catch {
        throw new Error('upload');
      }
      const result = await submitFyllPayPayment({
        businessSlug,
        code,
        amount,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        proofImageUrl: publicUrl,
      });
      if (!result.ok) throw new Error(result.error ?? 'unknown');
      return result;
    },
    onMutate: () => setErrorKey(null),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
    onError: (error) => {
      const key = error instanceof Error && error.message in ERROR_COPY ? (error.message as keyof typeof ERROR_COPY) : 'unknown';
      setErrorKey(key);
    },
  });

  const pickReceipt = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        setProofUri(result.assets[0].uri);
        setProofName(result.assets[0].fileName ?? 'Receipt');
        setErrorKey(null);
      }
    } catch {
      setErrorKey('upload');
    }
  };

  const copyAccount = async () => {
    if (!info?.bankAccount?.accountNumber) return;
    await Clipboard.setStringAsync(info.bankAccount.accountNumber.replace(/\s+/g, ''));
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setTimeout(() => setCopied(false), 1800);
  };

  const initials = (info?.businessName ?? 'Fyll').split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
  const extraFields = info?.bankAccount ? getBankAccountTransferFields(info.bankAccount).filter((f) => f.label.toLowerCase() !== 'account number') : [];

  let body: React.ReactNode;
  if (isLoading || (!businessSlug && !isError)) {
    body = <ActivityIndicator color={C.white} style={{ marginTop: 80 }} />;
  } else if (isError || !info || !info.enabled || !info.bankAccount) {
    body = (
      <Glass style={{ marginTop: 40 }}>
        <CircleAlert size={24} color={C.lime} />
        <Text style={{ color: C.white, fontSize: 20, fontWeight: '800' }}>{info ? `${info.businessName} has not set up Fyll Pay` : 'This payment page is not available'}</Text>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>Ask the business how they would like you to pay. Do not send money to an account you were not given directly.</Text>
      </Glass>
    );
  } else if (submit.isSuccess) {
    body = (
      <Glass style={{ marginTop: 24, alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={28} color={C.ink} strokeWidth={3} />
        </View>
        <Text style={{ color: C.white, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Receipt sent</Text>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          {info.businessName} will check your {formatCurrency(amount, info.currency)} transfer and confirm it. You can close this page.
        </Text>
      </Glass>
    );
  } else {
    const bank = info.bankAccount;
    const symbol = formatCurrency(0, info.currency).replace(/[\d.,\s]/g, '');
    body = (
      <View style={{ gap: 12 }}>
      {/* Amount gets its own card, above the bank details. */}
      <Glass style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Text style={{ color: C.muted, fontSize: 13, fontWeight: '400' }}>{fixedAmount ? 'Amount to pay' : 'How much are you paying?'}</Text>
        {fixedAmount ? (
          <Text style={[{ color: C.white, fontSize: 40, letterSpacing: -0.5 }, numberFont]}>{formatCurrency(fixedAmount, info.currency)}</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 2 }}>
            <Text style={[{ color: amountText ? C.white : C.faint }, numberFont, AMOUNT_TYPE]}>{symbol}</Text>
            <FocusInput
              value={amountText}
              onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={C.faint}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount you are paying"
              nativeID="fyll-pay-amount"
              // Sized to the digits typed so the symbol sits right beside the amount.
              style={[{ width: Math.min(280, Math.max(1, amountText.length) * 26 + 28), height: 64, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', color: C.white, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 0 }, numberFont, AMOUNT_TYPE, noOutline]}
            />
          </View>
        )}
        <Text style={{ color: C.faint, fontSize: 12 }}>{fixedAmount ? 'Set by ' + info.businessName : 'Enter the exact amount you will transfer'}</Text>
      </Glass>

      <Glass>
        <Text style={{ color: C.muted, fontSize: 13, fontWeight: '400' }}>Transfer to</Text>
        <View style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text style={{ color: C.muted, fontSize: 12 }}>Account number</Text>
              <Text selectable style={[{ color: C.white, fontSize: 26, letterSpacing: 1 }, numberFont]}>{bank.accountNumber}</Text>
            </View>
            <Pressable
              onPress={copyAccount}
              accessibilityRole="button"
              accessibilityLabel="Copy account number"
              style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: copied ? C.lime : C.white, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.85 : 1 })}
            >
              {copied ? <Check size={16} color={C.ink} strokeWidth={2.6} /> : <Copy size={16} color={C.ink} strokeWidth={2.2} />}
              <Text style={{ color: C.ink, fontSize: 14, fontWeight: '700' }}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
          {[{ label: 'Bank', value: bank.bankName }, { label: 'Account name', value: bank.accountName }, ...extraFields].filter((f) => f.value).map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: C.muted, fontSize: 14, flexShrink: 0 }}>{f.label}</Text>
              <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: C.white, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{f.value}</Text>
            </View>
          ))}
        </View>

        <Field label="Your name">
          <FocusInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={C.faint} autoComplete="name" accessibilityLabel="Your name" style={[inputStyle, noOutline]} />
        </Field>
        <Field label="Phone number">
          <FocusInput value={phone} onChangeText={setPhone} placeholder="0803 000 0000" placeholderTextColor={C.faint} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Phone number" style={[inputStyle, noOutline]} />
        </Field>
        <Field label="Email (optional)">
          <FocusInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={C.faint} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email, optional" style={[inputStyle, noOutline]} />
        </Field>

        <Pressable
          onPress={pickReceipt}
          accessibilityRole="button"
          accessibilityLabel={proofUri ? 'Change receipt' : 'Upload your receipt'}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: proofUri ? C.lime : 'rgba(255,255,255,0.35)', opacity: pressed ? 0.85 : 1 })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(213,224,87,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            {proofUri ? <Check size={20} color={C.lime} strokeWidth={2.6} /> : <Upload size={20} color={C.lime} strokeWidth={2} />}
          </View>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={{ color: C.white, fontSize: 14, fontWeight: '700' }}>{proofUri ? 'Receipt added' : 'Upload your receipt'}</Text>
            <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>{proofUri ? `${proofName} · tap to change` : 'Screenshot of your transfer'}</Text>
          </View>
        </Pressable>

        {errorKey ? <Text accessibilityLiveRegion="polite" style={{ color: C.error, fontSize: 13, lineHeight: 18 }}>{ERROR_COPY[errorKey]}</Text> : null}

        <Pressable
          onPress={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || submit.isPending }}
          style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1 })}
        >
          {submit.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700' }}>I've sent the money</Text>}
        </Pressable>
        <Text style={{ color: C.faint, fontSize: 12, textAlign: 'center' }}>Transfer first, then upload your receipt so {info.businessName} can confirm it.</Text>
      </Glass>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: compact ? 560 : 620, overflow: 'hidden' }}>
        <Image source={compact ? fieldPhone : fieldDesktop} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,20,0.3)' }} />
        <LinearGradient colors={['rgba(20,20,20,0)', C.ink]} locations={[0.45, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      </View>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image source={wordmarkLight} resizeMode="contain" style={{ height: 24, width: 24 * (900 / 493), tintColor: '#F7F8EA' }} accessibilityLabel="Fyll" />
              <Text style={{ color: C.white, fontSize: 14, fontWeight: '700', paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.45)' }}>Pay</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(20,22,10,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
              <Lock size={12} color={C.white} strokeWidth={2.4} />
              <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>Secured by Fyll</Text>
            </View>
          </View>

          {info && info.enabled && !submit.isSuccess ? (
            <View style={{ alignItems: 'center', gap: 8, paddingTop: 22, paddingBottom: 18 }}>
              {info.businessLogo ? (
                <Image source={{ uri: info.businessLogo }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' }} accessibilityLabel={`${info.businessName} logo`} />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' }}>
                  <Text style={{ color: C.lime, fontSize: 18, fontWeight: '800' }}>{initials}</Text>
                </View>
              )}
              <Text accessibilityRole="header" style={[{ color: C.white, fontSize: 26, textAlign: 'center' }, headingFont]}>Pay {info.businessName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.lime }}>
                <ShieldCheck size={12} color={C.ink} strokeWidth={2.2} />
                <Text style={{ color: C.ink, fontSize: 11.5, fontWeight: '500' }}>Account set by {info.businessName} in Fyll</Text>
              </View>
            </View>
          ) : null}

          {body}

          {info && info.enabled && !submit.isSuccess ? (
            <Text style={{ color: C.faint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18, paddingHorizontal: 8 }}>
              Only pay into the account shown above. It comes straight from {info.businessName}'s Fyll account.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
