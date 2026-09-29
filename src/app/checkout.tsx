import React, { useEffect, useState } from 'react';
import { View, Text as NativeText, Pressable, TextInput, Alert, ActivityIndicator, Image, Platform, ScrollView, Share, Linking, useWindowDimensions, type TextProps, type PressableStateCallbackType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFonts, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Landmark, Check, Copy, Upload, CircleAlert, ChevronDown, ChevronLeft, ChevronRight, Clock, Lock, ArrowRight, Share2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { getSocialCheckoutPublic, submitSocialCheckoutPayment } from '@/lib/supabase/social-checkout-public';
import { queueSocialCheckoutEmail } from '@/lib/supabase/social-checkout-emails';
import { uploadSocialCheckoutProof } from '@/lib/storage-attachments';
import { formatCurrency, NIGERIA_STATES } from '@/lib/state/fyll-store';
import { SearchClearButton } from '@/components/SearchClearButton';

const fyllColors = {
  primary: '#F4F4EF',
  ink: '#141414',
  accent: '#D5E057',
  accentSoft: 'rgba(213,224,87,0.12)',
  muted: 'rgba(244,244,239,0.62)',
  faint: 'rgba(244,244,239,0.42)',
  surface: 'rgba(27,27,27,0.88)',
  surfaceStrong: 'rgba(18,18,17,0.92)',
  border: 'rgba(255,255,255,0.13)',
};
const fyllFieldPhone = require('../../assets/fyll-field-phone.jpg');
const fyllFieldDesktop = require('../../assets/fyll-field-desktop.jpg');
const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');
// Fyll customer accounts (one account for every Fyll store).
const FYLL_SIGN_UP_URL = 'https://account.fyll.store';

function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[style, { fontWeight: '500' }]} />;
}

function AmountText({ fontReady, style, ...props }: TextProps & { fontReady: boolean }) {
  return (
    <NativeText
      {...props}
      style={[
        { fontFamily: fontReady ? 'BricolageGrotesque_800ExtraBold' : undefined, fontWeight: '800' },
        style,
      ]}
    />
  );
}

// Public, unauthenticated page — a customer opens this from a link staff
// shared over WhatsApp/Instagram, no Fyll account involved. Reachable at
// /checkout?code=... or /${businessSlug}/checkout/${code} (see
// [businessSlug]/checkout/[code].tsx and tracking-url.ts's
// buildSocialCheckoutPath). Both segments are exempted from the auth
// redirect in src/app/_layout.tsx the same way order-tracking/track are.
//
// Styled to match the reference design: quiet card sections, a tap-to-copy
// account number box, and a plain confirmation screen.

function PublicPageBackground({
  children,
  fieldHeight,
  fadeStart = 0.55,
}: {
  children: React.ReactNode;
  fieldHeight?: number;
  fadeStart?: number;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 768;

  return (
    <View style={{ flex: 1, backgroundColor: fyllColors.ink }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fieldHeight ?? (compact ? 760 : 680), overflow: 'hidden' }}>
        <Image source={compact ? fyllFieldPhone : fyllFieldDesktop} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        <LinearGradient
          colors={fieldHeight ? ['rgba(20,20,20,0)', fyllColors.ink] : ['rgba(20,20,20,0)', 'rgba(20,20,20,0.08)', fyllColors.ink]}
          locations={fieldHeight ? [fadeStart, 1] : [0, 0.56, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }}>
        {children}
      </SafeAreaView>
    </View>
  );
}

// Frosted pane from the payment-request design: translucent olive-charcoal
// over the Field, real backdrop blur on web, BlurView on native.
const REQUEST_GLASS_STYLE = {
  borderRadius: 30,
  overflow: 'hidden' as const,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
  backgroundColor: 'rgba(34,36,26,0.55)',
};

// 'hero' is the payment-request card, 'panel' the confirmation timeline,
// 'card' the smaller checkout section pane.
function RequestGlass({ children, style, variant = 'hero' }: { children: React.ReactNode; style?: object; variant?: 'hero' | 'panel' | 'card' }) {
  const isHero = variant !== 'card';
  const radius = variant === 'hero' ? 30 : variant === 'panel' ? 28 : 26;
  const highlight = variant === 'hero' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.1)';
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          REQUEST_GLASS_STYLE,
          {
            borderRadius: radius,
            backdropFilter: 'blur(22px) saturate(140%)',
            WebkitBackdropFilter: 'blur(22px) saturate(140%)',
            boxShadow: isHero
              ? `0 30px 60px rgba(0,0,0,0.45), inset 0 1px 0 ${highlight}`
              : `0 24px 50px rgba(0,0,0,0.4), inset 0 1px 0 ${highlight}`,
          } as object,
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <View style={[{ borderRadius: radius, shadowColor: '#000000', shadowOpacity: isHero ? 0.45 : 0.4, shadowRadius: isHero ? 30 : 25, shadowOffset: { width: 0, height: isHero ? 30 : 24 }, elevation: 12 }, style]}>
      <BlurView intensity={40} tint="dark" style={[REQUEST_GLASS_STYLE, { borderRadius: radius }]}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: highlight }} />
        {children}
      </BlurView>
    </View>
  );
}

function CardLabel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <DText weight="700" style={[{ color: 'rgba(244,244,239,0.5)', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }, style]}>{children}</DText>;
}

const INPUT_FOCUS_RING = Platform.OS === 'web' ? ({ boxShadow: '0 0 0 3px rgba(213,224,87,0.18)' } as object) : null;
const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

// react-native-web reports mouse hover on Pressable state; native never sets it.
const isHovered = (state: PressableStateCallbackType) => (state as PressableStateCallbackType & { hovered?: boolean }).hovered === true;
const WEB_TRANSITION = Platform.OS === 'web'
  ? ({ transitionProperty: 'background-color, border-color, box-shadow, transform, opacity', transitionDuration: '160ms', transitionTimingFunction: 'ease-out' } as object)
  : null;

// Primary lime pill (58px). lit=false renders the muted disabled pill.
function limeButtonStyle(state: PressableStateCallbackType, lit: boolean, interactive: boolean = lit) {
  const hovered = interactive && isHovered(state);
  const pressed = interactive && state.pressed;
  return [
    {
      height: 58,
      borderRadius: 999,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      backgroundColor: lit ? (hovered ? '#E1EB6B' : fyllColors.accent) : 'rgba(255,255,255,0.07)',
      borderWidth: lit ? 0 : 1,
      borderColor: 'rgba(255,255,255,0.1)',
      transform: [{ translateY: hovered && !pressed ? -1 : 0 }, { scale: pressed ? 0.98 : 1 }],
    },
    !lit
      ? null
      : Platform.OS === 'web'
        ? ({
          boxShadow: hovered
            ? '0 12px 32px rgba(213,224,87,0.42), inset 0 1px 0 rgba(255,255,255,0.55)'
            : '0 8px 24px rgba(213,224,87,0.28), inset 0 1px 0 rgba(255,255,255,0.5)',
        } as object)
        : { shadowColor: fyllColors.accent, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
    WEB_TRANSITION,
  ];
}

function CheckoutInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoComplete,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoComplete?: 'name' | 'tel' | 'email' | 'street-address';
  multiline?: boolean;
  hint?: string;
}) {
  const [isFocused, setIsFocused] = useState<boolean>(false);
  return (
    <View style={{ gap: 6 }}>
      <DText style={{ color: 'rgba(244,244,239,0.7)', fontSize: 12.5 }}>{label}</DText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(244,244,239,0.4)"
        keyboardType={keyboardType ?? 'default'}
        autoComplete={autoComplete}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[
          {
            height: multiline ? 104 : 52,
            paddingHorizontal: 16,
            paddingVertical: multiline ? 14 : 0,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isFocused ? fyllColors.accent : 'rgba(255,255,255,0.14)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: '#FFFFFF',
            fontFamily: 'DMSans_400Regular',
            fontSize: 15,
            lineHeight: multiline ? 22 : undefined,
          },
          isFocused ? INPUT_FOCUS_RING : null,
          WEB_NO_OUTLINE,
        ]}
      />
      {hint ? <DText style={{ color: 'rgba(244,244,239,0.5)', fontSize: 12, lineHeight: 17 }}>{hint}</DText> : null}
    </View>
  );
}

function CopyRow({ label, value, copied, onPress, fontReady }: { label: string; value: string; copied: boolean; onPress: () => void; fontReady: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label.toLowerCase()}`}
      onPress={onPress}
      style={(state) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: copied ? 'rgba(213,224,87,0.6)' : isHovered(state) ? 'rgba(213,224,87,0.4)' : 'rgba(255,255,255,0.14)',
          backgroundColor: copied ? 'rgba(213,224,87,0.1)' : isHovered(state) ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
          opacity: state.pressed ? 0.8 : 1,
        },
        WEB_TRANSITION,
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <DText weight="700" style={{ color: copied ? fyllColors.accent : 'rgba(244,244,239,0.5)', fontSize: 11, letterSpacing: 1.2 }}>
          {copied ? 'COPIED' : `${label} · TAP TO COPY`}
        </DText>
        <AmountText fontReady={fontReady} selectable style={{ color: '#FFFFFF', fontSize: 22, letterSpacing: 0.8 }}>{value}</AmountText>
      </View>
      {copied ? <Check size={22} color={fyllColors.accent} strokeWidth={2.6} /> : <Copy size={22} color="rgba(244,244,239,0.75)" strokeWidth={1.9} />}
    </Pressable>
  );
}

function DText({ weight = '400', style, ...props }: TextProps & { weight?: '400' | '600' | '700' }) {
  const family = weight === '700' ? 'DMSans_700Bold' : weight === '600' ? 'DMSans_600SemiBold' : 'DMSans_400Regular';
  return <NativeText {...props} style={[{ fontFamily: family }, style]} />;
}

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });

function MerchantLogo({ logo, name, size = 76, ring, innerBorder }: { logo: string | null; name: string; size?: number; ring?: number; innerBorder?: number }) {
  const [failed, setFailed] = useState(false);
  const inset = ring ?? Math.max(4, Math.round(size * 0.055));

  useEffect(() => {
    setFailed(false);
  }, [logo]);

  return (
    <LinearGradient
      colors={['#D5E057', '#7D8A00', '#E5EF61', '#D5E057']}
      locations={[0, 0.38, 0.72, 1]}
      start={{ x: 0.1, y: 1 }}
      end={{ x: 0.9, y: 0 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: inset, shadowColor: '#000000', shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}
    >
      <View className="flex-1 rounded-full items-center justify-center overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderWidth: innerBorder ?? Math.max(2, Math.round(size * 0.035)), borderColor: '#1D1F15' }}>
        {logo && !failed ? (
          <Image source={{ uri: logo }} onError={() => setFailed(true)} resizeMode="contain" style={{ width: '78%', height: '78%' }} />
        ) : (
          <Text style={{ color: '#30330F', fontSize: Math.round(size * 0.34) }}>{name.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
    </LinearGradient>
  );
}


type StatusTone = 'lime' | 'amber' | 'red';
const STATUS_TONE_RGB: Record<StatusTone, string> = { lime: '213,224,87', amber: '251,191,36', red: '248,113,113' };
const STATUS_TONE_HEX: Record<StatusTone, string> = { lime: '#D5E057', amber: '#FBBF24', red: '#F87171' };

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// Centered wordmark, glowing status ring, headline and body — the top of the
// Confirming design, shared by every end state of a payment link.
function StatusHero({ tone, icon: Icon, title, body, fontReady }: { tone: StatusTone; icon: LucideIcon; title: string; body?: string; fontReady: boolean }) {
  const rgb = STATUS_TONE_RGB[tone];
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ paddingTop: 14 }}>
        <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 24 * (344 / 195), height: 24, tintColor: '#F7F8EA' }} />
      </View>
      <View style={{ marginTop: 64, alignItems: 'center', gap: 18, paddingHorizontal: 16 }}>
        <View
          style={[
            { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(${rgb},0.08)` },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 60px rgba(${rgb},0.3)` } as object)
              : { shadowColor: STATUS_TONE_HEX[tone], shadowOpacity: 0.3, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
          ]}
        >
          <View
            style={[
              { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.45)', borderWidth: 1, borderColor: `rgba(${rgb},0.45)` },
              Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : null,
            ]}
          >
            <Icon size={40} color={STATUS_TONE_HEX[tone]} strokeWidth={2} />
          </View>
        </View>
        <AmountText fontReady={fontReady} style={{ color: '#F4F4EF', fontSize: 30, lineHeight: 33, letterSpacing: -1.2, textAlign: 'center' }}>{title}</AmountText>
        {body ? <DText style={{ color: 'rgba(244,244,239,0.7)', fontSize: 14.5, lineHeight: 22.5, textAlign: 'center' }}>{body}</DText> : null}
      </View>
    </View>
  );
}

function TimelineRow({ status, label, meta }: { status: 'done' | 'active' | 'todo'; label: string; meta?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {status === 'done' ? (
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: fyllColors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={14} color="#1E1E1E" strokeWidth={3} />
        </View>
      ) : status === 'active' ? (
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: fyllColors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fyllColors.accent }} />
        </View>
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }} />
      )}
      <DText weight={status === 'todo' ? '400' : '600'} style={{ flex: 1, color: status === 'todo' ? 'rgba(244,244,239,0.55)' : '#F4F4EF', fontSize: 14.5, lineHeight: 20 }}>{label}</DText>
      {meta ? (
        <DText weight={status === 'active' ? '600' : '400'} style={{ color: status === 'active' ? fyllColors.accent : 'rgba(244,244,239,0.5)', fontSize: 12 }}>{meta}</DText>
      ) : null}
    </View>
  );
}

function PublicMessageState({
  tone,
  icon,
  title,
  body,
  fontReady,
}: {
  tone: StatusTone;
  icon: LucideIcon;
  title: string;
  body?: string;
  fontReady: boolean;
}) {
  return (
    <PublicPageBackground fieldHeight={420} fadeStart={0.45}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 440, flexGrow: 1 }}>
          <StatusHero tone={tone} icon={icon} title={title} body={body} fontReady={fontReady} />
          <View style={{ marginTop: 'auto', paddingTop: 40, paddingBottom: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            <DText style={{ color: 'rgba(244,244,239,0.45)', fontSize: 12 }}>Secured by</DText>
            <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 11 * (344 / 195), height: 11, tintColor: fyllColors.accent }} />
          </View>
        </View>
      </ScrollView>
    </PublicPageBackground>
  );
}

function formatExpiryCountdown(ms: number) {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function PublicSocialCheckoutScreen() {
  const [bricolageReady] = useFonts({ BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold });
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = (typeof params.code === 'string' ? params.code : Array.isArray(params.code) ? params.code[0] : '') ?? '';

  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedReference, setCopiedReference] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [stateSearchQuery, setStateSearchQuery] = useState('');
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string>('');
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submittedAtMs, setSubmittedAtMs] = useState<number | null>(null);
  const [proofPublicUrl, setProofPublicUrl] = useState<string>('');
  const [proofShareCopied, setProofShareCopied] = useState<boolean>(false);
  const [checkoutStage, setCheckoutStage] = useState<'request' | 'checkout'>('request');
  const [nowMs, setNowMs] = useState(Date.now());

  const draftQuery = useQuery({
    queryKey: ['social-checkout-public', code],
    queryFn: () => getSocialCheckoutPublic(code),
    enabled: code.trim().length > 0,
    // While the seller is checking the transfer, keep the confirmation page live.
    refetchInterval: (query) => (query.state.data?.status === 'payment_submitted' ? 30000 : false),
  });
  const draftData = draftQuery.data;
  const refetchDraft = draftQuery.refetch;
  const filteredStates = NIGERIA_STATES.filter((state) => state.toLowerCase().includes(stateSearchQuery.trim().toLowerCase()));

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const expiresAtMs = draftData?.expiresAt ? Date.parse(draftData.expiresAt) : Number.NaN;
    if (draftData?.status === 'awaiting_payment' && Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      refetchDraft();
    }
  }, [draftData?.expiresAt, draftData?.status, nowMs, refetchDraft]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!proofUri) throw new Error('missing_proof');
      const upload = await uploadSocialCheckoutProof({ code, uri: proofUri, fileName: 'proof.jpg' });
      const result = await submitSocialCheckoutPayment({
        code,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        deliveryAddress: deliveryAddress.trim(),
        deliveryState,
        proofImageUrl: upload.publicUrl,
      });
      if (!result.ok) throw new Error(result.error ?? 'submit_failed');
      queueSocialCheckoutEmail({
        type: 'payment_submitted',
        businessId: draftData?.businessId,
        checkoutCode: code,
      });
      return upload.publicUrl;
    },
    onSuccess: (publicUrl: string) => {
      setProofPublicUrl(publicUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJustSubmitted(true);
      setSubmittedAtMs(Date.now());
      void draftQuery.refetch();
    },
    onError: (error: Error) => {
      if (error.message === 'expired') {
        Alert.alert('Link expired', 'This payment link has expired. Ask the seller to send you a new one.');
        draftQuery.refetch();
        return;
      }
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    },
  });

  const handleCopyAccountNumber = async (accountNumber: string) => {
    await Clipboard.setStringAsync(accountNumber);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 1800);
  };

  const handleCopyReference = async () => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedReference(true);
    setTimeout(() => setCopiedReference(false), 1800);
  };


  const handlePickProof = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos to upload proof of payment.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setProofUri(result.assets[0].uri);
        setProofName(result.assets[0].fileName ?? 'Receipt photo');
      }
    } catch {
      Alert.alert('Error', 'Could not open your photo library. Please try again.');
    }
  };

  const isFormValid =
    customerName.trim().length > 1 &&
    customerPhone.trim().length >= 7 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) &&
    deliveryAddress.trim().length > 4 &&
    deliveryState.trim().length > 0 &&
    !!proofUri;

  if (!code.trim()) {
    return (
      <PublicMessageState
        tone="red"
        icon={CircleAlert}
        fontReady={bricolageReady}
        title="Missing payment link code"
        body="Open the full link the seller sent you, or ask them to send it again."
      />
    );
  }

  if (draftQuery.isLoading) {
    return (
      <PublicPageBackground fieldHeight={420} fadeStart={0.45}>
        <View style={{ alignItems: 'center', paddingTop: 14 }}>
          <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 24 * (344 / 195), height: 24, tintColor: '#F7F8EA' }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={fyllColors.accent} />
        </View>
      </PublicPageBackground>
    );
  }

  const draft = draftQuery.data;

  if (draftQuery.isError || !draft) {
    return (
      <PublicMessageState
        tone="red"
        icon={CircleAlert}
        fontReady={bricolageReady}
        title="We couldn't find that payment link"
        body="Double check the link, or ask the seller to send a new one."
      />
    );
  }

  const showTerminalState = justSubmitted || draft.status !== 'awaiting_payment';
  const billNote = draft.billNote.trim();
  const expiresAtMs = draft.expiresAt ? Date.parse(draft.expiresAt) : Number.NaN;
  const expiryMsRemaining = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - nowMs) : 0;
  const expiryLabel = Number.isFinite(expiresAtMs) ? formatExpiryCountdown(expiryMsRemaining) : '24:00:00';
  const isExpiredByTime = Number.isFinite(expiresAtMs) && expiryMsRemaining <= 0;
  const missingDetails = [
    !customerName.trim() ? 'name' : '',
    customerPhone.trim().length < 7 ? 'phone' : '',
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) ? 'email' : '',
    deliveryAddress.trim().length <= 4 ? 'address' : '',
    !deliveryState.trim() ? 'state' : '',
    !proofUri ? 'payment receipt' : '',
  ].filter(Boolean);

  if (showTerminalState) {
    const isVerified = draft.status === 'verified';
    const isExpired = draft.status === 'expired';
    const isCancelled = draft.status === 'cancelled';
    const isRejected = draft.status === 'rejected';

    if (isExpired || isCancelled || isRejected) {
      return (
        <PublicMessageState
          tone={isRejected ? 'red' : 'amber'}
          icon={isExpired ? Clock : CircleAlert}
          fontReady={bricolageReady}
          title={isExpired ? 'This payment link has expired' : isRejected ? 'Payment proof was rejected' : 'This payment link was cancelled'}
          body={isExpired
            ? 'For your security, links only stay active for 24 hours. Ask the seller to send you a new one.'
            : isRejected
              ? 'Please contact the seller so they can confirm the payment details or send you a new link.'
              : 'Ask the seller to send you a new payment link.'}
        />
      );
    }

    // Orders come from WhatsApp/Instagram chats, so the most useful next step is
    // sending the receipt back into that chat. Web shares the photo itself when
    // the browser allows it; otherwise the details are copied for pasting.
    const handleShareProof = async () => {
      const pageUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '';
      const message = [
        `Hi ${draft.businessName}, I've paid for my order.`,
        `Amount: ${formatCurrency(draft.amount)}`,
        `Reference: ${code}`,
        proofPublicUrl ? `Receipt: ${proofPublicUrl}` : pageUrl ? `Payment page: ${pageUrl}` : '',
      ].filter(Boolean).join('\n');

      if (Platform.OS !== 'web') {
        try {
          await Share.share({ message });
        } catch {
          // user cancelled — nothing to do
        }
        return;
      }

      const webNavigator = typeof navigator !== 'undefined' ? navigator : undefined;
      if (webNavigator?.share) {
        try {
          let files: File[] | undefined;
          if (proofUri) {
            const blob = await fetch(proofUri).then((response) => response.blob()).catch(() => null);
            const file = blob ? new File([blob], proofName || 'proof-of-payment.jpg', { type: blob.type || 'image/jpeg' }) : null;
            if (file && webNavigator.canShare?.({ files: [file] })) files = [file];
          }
          await webNavigator.share(files ? { text: message, files } : { text: message });
          return;
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') return;
        }
      }

      await Clipboard.setStringAsync(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProofShareCopied(true);
      setTimeout(() => setProofShareCopied(false), 2400);
    };
    const submittedTimeLabel = submittedAtMs ? new Date(submittedAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined;
    const amountLabel = formatCurrency(draft.amount);

    return (
      <PublicPageBackground fieldHeight={420} fadeStart={0.45}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: 440, flexGrow: 1 }}>
            <StatusHero
              tone="lime"
              icon={isVerified ? Check : Clock}
              title={isVerified ? 'Payment confirmed' : 'Confirming your transfer'}
              body={isVerified
                ? `${draft.businessName} has confirmed your payment and is preparing your order. We’ve emailed you the details.`
                : 'Most transfers confirm within a few minutes. You can close this page — we’ll email you as soon as it lands.'}
              fontReady={bricolageReady}
            />

            <RequestGlass variant="panel" style={{ marginTop: 30 }}>
              <View style={{ paddingVertical: 20, paddingHorizontal: 22, gap: 16 }}>
                <TimelineRow status="done" label="Payment sent · receipt uploaded" meta={submittedTimeLabel} />
                <TimelineRow
                  status={isVerified ? 'done' : 'active'}
                  label={isVerified ? `Verified ${amountLabel} for ${code}` : `Verifying ${amountLabel} for ${code}`}
                  meta={isVerified ? undefined : 'Now'}
                />
                <TimelineRow status={isVerified ? 'done' : 'todo'} label={`Order confirmed by ${draft.businessName}`} />
              </View>
            </RequestGlass>

            <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 24, gap: 12 }}>
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void Linking.openURL(FYLL_SIGN_UP_URL);
                }}
                style={(state) => limeButtonStyle(state, true)}
              >
                <DText weight="700" style={{ color: '#1E1E1E', fontSize: 17 }}>Sign up to Fyll</DText>
                <ArrowRight size={18} color="#1E1E1E" strokeWidth={2.4} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleShareProof}
                style={(state) => [
                  { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: proofShareCopied ? 'rgba(213,224,87,0.6)' : isHovered(state) ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.18)', backgroundColor: state.pressed ? 'rgba(255,255,255,0.1)' : isHovered(state) ? 'rgba(255,255,255,0.07)' : 'transparent' },
                  WEB_TRANSITION,
                ]}
              >
                {proofShareCopied ? <Check size={17} color={fyllColors.accent} strokeWidth={2.6} /> : <Share2 size={17} color="#F4F4EF" strokeWidth={2} />}
                <DText weight="600" style={{ color: proofShareCopied ? fyllColors.accent : '#F4F4EF', fontSize: 15 }}>
                  {proofShareCopied ? 'Copied — paste it in your chat' : 'Share proof of payment'}
                </DText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </PublicPageBackground>
    );
  }

  if (checkoutStage === 'request') {
    const goToCheckout = () => {
      if (isExpiredByTime) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCheckoutStage('checkout');
    };
    const faintInk = 'rgba(244,244,239,0.55)';
    return (
      <PublicPageBackground fieldHeight={460}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: 440, flexGrow: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingHorizontal: 8 }}>
              <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 26 * (344 / 195), height: 26, tintColor: '#F7F8EA' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
                <Lock size={12} color="#EEF2C4" strokeWidth={2.4} />
                <DText weight="600" style={{ color: '#EEF2C4', fontSize: 12 }}>Secure checkout</DText>
              </View>
            </View>

            <RequestGlass style={{ marginTop: 150 }}>
              <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <DText numberOfLines={1} style={{ color: 'rgba(244,244,239,0.82)', fontSize: 15 }}>{draft.businessName} requests</DText>
                  <AmountText fontReady={bricolageReady} adjustsFontSizeToFit numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 50, lineHeight: 52, letterSpacing: -2.4 }}>{formatCurrency(draft.amount)}</AmountText>
                  <DText style={{ color: 'rgba(244,244,239,0.7)', fontSize: 15, lineHeight: 21, marginTop: 6 }}>{billNote || 'Payment request'}</DText>
                </View>
                <MerchantLogo logo={draft.businessLogo} name={draft.businessName} size={74} ring={3} innerBorder={3} />
              </View>

              <View style={{ marginHorizontal: 24, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <DText numberOfLines={1} style={{ color: faintInk, fontSize: 13, flexShrink: 1 }}>
                  Order <NativeText style={{ fontFamily: MONO_FONT, fontWeight: '600', color: '#F4F4EF' }}>{code}</NativeText>
                </DText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: isExpiredByTime ? 'rgba(248,113,113,0.12)' : 'rgba(213,224,87,0.12)', borderWidth: 1, borderColor: isExpiredByTime ? 'rgba(248,113,113,0.3)' : 'rgba(213,224,87,0.3)' }}>
                  <Clock size={12} color={isExpiredByTime ? '#F87171' : fyllColors.accent} strokeWidth={2.4} />
                  <DText weight="700" style={{ color: isExpiredByTime ? '#F87171' : fyllColors.accent, fontSize: 12, fontVariant: ['tabular-nums'] }}>{expiryLabel}</DText>
                </View>
              </View>

              <View style={{ backgroundColor: 'rgba(18,18,16,0.72)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isExpiredByTime}
                  onPress={goToCheckout}
                  style={(state) => limeButtonStyle(state, !isExpiredByTime)}
                >
                  <DText weight="700" style={{ color: isExpiredByTime ? fyllColors.faint : '#1E1E1E', fontSize: 17 }}>{isExpiredByTime ? 'Payment link expired' : 'Pay with bank transfer'}</DText>
                  {!isExpiredByTime ? <ArrowRight size={18} color="#1E1E1E" strokeWidth={2.4} /> : null}
                </Pressable>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                  <DText style={{ color: 'rgba(244,244,239,0.5)', fontSize: 13 }}>Or</DText>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={isExpiredByTime}
                  onPress={goToCheckout}
                  style={(state) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6, paddingLeft: 4, paddingRight: 8, marginHorizontal: -4, borderRadius: 20, backgroundColor: isHovered(state) && !isExpiredByTime ? 'rgba(255,255,255,0.05)' : 'transparent', opacity: state.pressed ? 0.7 : 1 },
                    WEB_TRANSITION,
                  ]}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                    <Landmark size={20} color="#F4F4EF" strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <DText weight="600" style={{ color: '#F4F4EF', fontSize: 16 }}>Sign in with Fyll</DText>
                    <DText style={{ color: faintInk, fontSize: 12.5 }}>Saved details · track this order</DText>
                  </View>
                  <ChevronRight size={18} color="rgba(244,244,239,0.6)" strokeWidth={2} />
                </Pressable>
              </View>
            </RequestGlass>

            <View style={{ marginTop: 'auto', paddingTop: 40, paddingHorizontal: 8, paddingBottom: 24, alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <DText style={{ color: 'rgba(244,244,239,0.72)', fontSize: 13 }}>Powered by</DText>
                <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 12 * (344 / 195), height: 12, tintColor: fyllColors.accent }} />
              </View>
              <DText style={{ color: 'rgba(244,244,239,0.45)', fontSize: 12, textAlign: 'center' }}>
                Payments you can see through · <NativeText style={{ color: fyllColors.accent }}>Privacy</NativeText>
              </DText>
            </View>
          </View>
        </ScrollView>
      </PublicPageBackground>
    );
  }

  const canSubmit = isFormValid && !isExpiredByTime && !submitMutation.isPending;
  const hasProof = !!proofUri;

  return (
    <PublicPageBackground fieldHeight={360} fadeStart={0.35}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 440, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => setCheckoutStage('request')}
              style={(state) => [
                { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? 'rgba(20,20,20,0.62)' : 'rgba(20,20,20,0.4)', borderWidth: 1, borderColor: isHovered(state) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)' },
                WEB_TRANSITION,
              ]}
            >
              <ChevronLeft size={18} color="#F4F4EF" strokeWidth={2.2} />
            </Pressable>
            <DText weight="600" style={{ flex: 1, color: '#F4F4EF', fontSize: 16 }}>Checkout</DText>
            <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 21 * (344 / 195), height: 21, tintColor: '#F7F8EA' }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 34, paddingHorizontal: 8 }}>
            <MerchantLogo logo={draft.businessLogo} name={draft.businessName} size={56} ring={3} innerBorder={2} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <DText numberOfLines={1} style={{ color: 'rgba(244,244,239,0.72)', fontSize: 13 }}>{draft.businessName} · amount due</DText>
              <AmountText fontReady={bricolageReady} adjustsFontSizeToFit numberOfLines={1} style={{ color: '#F4F4EF', fontSize: 40, lineHeight: 42, letterSpacing: -1.8 }}>{formatCurrency(draft.amount)}</AmountText>
            </View>
          </View>

          <View
            style={[
              {
                marginTop: 18,
                height: 52,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 18,
                backgroundColor: isExpiredByTime ? 'rgba(248,113,113,0.12)' : 'rgba(213,224,87,0.14)',
                borderWidth: 1,
                borderColor: isExpiredByTime ? 'rgba(248,113,113,0.4)' : 'rgba(213,224,87,0.4)',
              },
              Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : null,
            ]}
          >
            <Clock size={18} color={isExpiredByTime ? '#F87171' : fyllColors.accent} strokeWidth={2.2} />
            <DText style={{ flex: 1, color: isExpiredByTime ? '#F87171' : '#EEF2C4', fontSize: 14 }}>{isExpiredByTime ? 'Payment link expired' : 'Payment expires in'}</DText>
            {!isExpiredByTime ? (
              <AmountText fontReady={bricolageReady} style={{ color: '#FFFFFF', fontSize: 20, letterSpacing: 0.5, fontVariant: ['tabular-nums'] }}>{expiryLabel}</AmountText>
            ) : null}
          </View>

          <RequestGlass variant="card" style={{ marginTop: 16 }}>
            <View style={{ padding: 20 }}>
              <CardLabel style={{ marginBottom: 8 }}>What you’re paying for</CardLabel>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 4, paddingBottom: 2 }}>
                <DText style={{ flex: 1, color: '#FFFFFF', fontSize: 14.5, lineHeight: 21 }}>{billNote || 'Payment request'}</DText>
                <DText weight="600" style={{ color: '#FFFFFF', fontSize: 14.5, fontVariant: ['tabular-nums'] }}>{formatCurrency(draft.amount)}</DText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                <DText weight="700" style={{ color: '#F4F4EF', fontSize: 15 }}>Total</DText>
                <AmountText fontReady={bricolageReady} style={{ color: fyllColors.accent, fontSize: 22, letterSpacing: -0.6 }}>{formatCurrency(draft.amount)}</AmountText>
              </View>
            </View>
          </RequestGlass>

          <RequestGlass variant="card" style={{ marginTop: 14 }}>
            <View style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Landmark size={15} color="rgba(244,244,239,0.5)" strokeWidth={2} />
                <CardLabel>Pay via bank transfer</CardLabel>
              </View>
              <View style={{ gap: 3, marginBottom: 14 }}>
                <DText style={{ color: 'rgba(244,244,239,0.5)', fontSize: 12 }}>Bank</DText>
                <DText weight="600" style={{ color: '#F4F4EF', fontSize: 16 }}>{draft.bankAccount.bankName}</DText>
              </View>
              <View style={{ gap: 3, marginBottom: 16 }}>
                <DText style={{ color: 'rgba(244,244,239,0.5)', fontSize: 12 }}>Account name</DText>
                <DText weight="600" style={{ color: '#F4F4EF', fontSize: 16, lineHeight: 22 }}>{draft.bankAccount.accountName}</DText>
              </View>
              <View style={{ gap: 10 }}>
                <CopyRow label="ACCOUNT NUMBER" value={draft.bankAccount.accountNumber} copied={copiedAccount} onPress={() => handleCopyAccountNumber(draft.bankAccount.accountNumber)} fontReady={bricolageReady} />
                <CopyRow label="PAYMENT REFERENCE" value={code} copied={copiedReference} onPress={handleCopyReference} fontReady={bricolageReady} />
              </View>
            </View>
          </RequestGlass>

          <RequestGlass variant="card" style={{ marginTop: 14 }}>
            <View style={{ padding: 20, gap: 12 }}>
              <CardLabel style={{ marginBottom: 2 }}>Your details</CardLabel>
              <CheckoutInput label="Full name" value={customerName} onChangeText={setCustomerName} placeholder="Your full name" autoComplete="name" />
              <CheckoutInput label="Phone number" value={customerPhone} onChangeText={setCustomerPhone} placeholder="080…" keyboardType="phone-pad" autoComplete="tel" />
              <CheckoutInput
                label="Email"
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoComplete="email"
                hint="We’ll send your confirmation and verification updates here."
              />
              <CheckoutInput label="Delivery address" value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="House number, street, area" autoComplete="street-address" multiline />
              <View style={{ gap: 6 }}>
                <DText style={{ color: 'rgba(244,244,239,0.7)', fontSize: 12.5 }}>State</DText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select your state"
                  onPress={() => setShowStatePicker((value) => !value)}
                  style={(state) => [
                    { height: 52, borderRadius: 16, borderWidth: 1, borderColor: showStatePicker ? fyllColors.accent : isHovered(state) ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)', backgroundColor: isHovered(state) ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)', paddingLeft: 16, paddingRight: 16, flexDirection: 'row', alignItems: 'center' },
                    showStatePicker ? INPUT_FOCUS_RING : null,
                    WEB_TRANSITION,
                  ]}
                >
                  <DText style={{ flex: 1, color: deliveryState ? '#FFFFFF' : 'rgba(244,244,239,0.4)', fontSize: 15 }}>{deliveryState || 'Select your state'}</DText>
                  <ChevronDown size={18} color="rgba(244,244,239,0.6)" strokeWidth={2} />
                </Pressable>
                {showStatePicker ? (
                  <View style={{ borderRadius: 16, padding: 8, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', maxHeight: 260 }}>
                    <View style={{ height: 44, borderRadius: 12, paddingHorizontal: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                      <TextInput
                        value={stateSearchQuery}
                        onChangeText={setStateSearchQuery}
                        placeholder="Search state"
                        placeholderTextColor="rgba(244,244,239,0.4)"
                        autoFocus
                        style={[{ flex: 1, color: '#F4F4EF', fontSize: 15, fontFamily: 'DMSans_400Regular' }, WEB_NO_OUTLINE]}
                      />
                      <SearchClearButton visible={Boolean(stateSearchQuery.trim())} onPress={() => setStateSearchQuery('')} />
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredStates.map((state) => (
                        <Pressable
                          key={state}
                          onPress={() => { setDeliveryState(state); setStateSearchQuery(''); setShowStatePicker(false); }}
                          style={(pressState) => ({ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: state === deliveryState ? 'rgba(213,224,87,0.12)' : pressState.pressed || isHovered(pressState) ? 'rgba(255,255,255,0.06)' : 'transparent' })}
                        >
                          <DText weight={state === deliveryState ? '600' : '400'} style={{ color: state === deliveryState ? fyllColors.accent : '#F4F4EF', fontSize: 15 }}>{state}</DText>
                        </Pressable>
                      ))}
                      {filteredStates.length === 0 ? <DText style={{ color: 'rgba(244,244,239,0.55)', fontSize: 14, paddingHorizontal: 12, paddingVertical: 14 }}>No state found</DText> : null}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>
          </RequestGlass>

          <RequestGlass variant="card" style={{ marginTop: 14 }}>
            <View style={{ padding: 20 }}>
              <CardLabel style={{ marginBottom: 12 }}>Payment proof</CardLabel>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hasProof ? 'Change payment receipt' : 'Upload payment receipt'}
                onPress={handlePickProof}
                style={(state) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: hasProof ? 'rgba(213,224,87,0.7)' : isHovered(state) ? 'rgba(213,224,87,0.5)' : 'rgba(255,255,255,0.2)',
                    backgroundColor: hasProof
                      ? isHovered(state) ? 'rgba(213,224,87,0.13)' : 'rgba(213,224,87,0.08)'
                      : isHovered(state) ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    opacity: state.pressed ? 0.8 : 1,
                  },
                  WEB_TRANSITION,
                ]}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: hasProof ? fyllColors.accent : 'rgba(255,255,255,0.08)' }}>
                  {hasProof ? <Check size={20} color="#1E1E1E" strokeWidth={2.6} /> : <Upload size={20} color="#F4F4EF" strokeWidth={2} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <DText weight="700" style={{ color: '#FFFFFF', fontSize: 15.5 }}>{hasProof ? 'Receipt added' : 'Upload a screenshot'}</DText>
                  <DText numberOfLines={1} style={{ color: 'rgba(244,244,239,0.55)', fontSize: 12.5 }}>
                    {hasProof ? `${proofName || 'Receipt photo'} · tap to change` : 'Bank receipt, transfer confirmation, etc.'}
                  </DText>
                </View>
              </Pressable>
            </View>
          </RequestGlass>

          <View style={{ marginTop: 'auto', paddingTop: 22, paddingBottom: 24, gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => submitMutation.mutate()}
              style={(state) => limeButtonStyle(state, canSubmit || submitMutation.isPending, canSubmit)}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color="#1E1E1E" />
              ) : (
                <>
                  <DText weight="700" style={{ color: canSubmit ? '#1E1E1E' : 'rgba(244,244,239,0.45)', fontSize: 17 }}>
                    {isExpiredByTime ? 'Payment link expired' : 'I’ve made this payment'}
                  </DText>
                  {canSubmit ? <ArrowRight size={18} color="#1E1E1E" strokeWidth={2.4} /> : null}
                </>
              )}
            </Pressable>
            {!isFormValid && !isExpiredByTime && missingDetails.length > 0 ? (
              <DText style={{ color: 'rgba(244,244,239,0.5)', fontSize: 12.5, textAlign: 'center' }}>Still needed: {missingDetails.join(', ')}</DText>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
              <DText style={{ color: 'rgba(244,244,239,0.45)', fontSize: 12 }}>Secured by</DText>
              <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 11 * (344 / 195), height: 11, tintColor: fyllColors.accent }} />
              <DText style={{ color: 'rgba(244,244,239,0.45)', fontSize: 12 }}>· © Fyll 2026</DText>
            </View>
          </View>
        </View>
      </ScrollView>
    </PublicPageBackground>
  );
}
