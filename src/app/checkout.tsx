import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Image, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Landmark, Check, Copy, Upload, CircleCheck, CircleAlert, ChevronDown, Clock } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { getSocialCheckoutPublic, submitSocialCheckoutPayment } from '@/lib/supabase/social-checkout-public';
import { queueSocialCheckoutEmail } from '@/lib/supabase/social-checkout-emails';
import { uploadSocialCheckoutProof } from '@/lib/storage-attachments';
import { formatCurrency, NIGERIA_STATES } from '@/lib/state/fyll-store';

const fyllCombinationPng = require('../../assets/Group 20fyll combination.png');
const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');

const MUTED = '#97A3BB';
const FYLL_BLACK = '#0F1115';

// Fyll Lime rebrand tokens — see checkout.fyll.store reference.
const fyllColors = {
  primary: '#1E1E1E',
  accent: '#D5E057',
  accentSoft: '#F5F8D0',
  accentText: '#6B7700',
  surface: '#F8F8F5',
  border: '#E8E8E0',
};
const PAGE_GRADIENT = ['#FFFFFF', '#F9FBE7', '#EEF2B0'] as const;
const PAGE_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

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
  tone = 'lime',
}: {
  children: React.ReactNode;
  tone?: 'lime' | 'white';
}) {
  const colors = tone === 'white' ? (['#FFFFFF', '#FFFFFF', '#FFFFFF'] as const) : PAGE_GRADIENT;
  return (
    <LinearGradient
      colors={colors}
      locations={PAGE_GRADIENT_LOCATIONS}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 2.2 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: '#A3A3A3' }} className="text-[11px] font-semibold uppercase tracking-wider mb-3">{children}</Text>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View className="flex-row justify-between py-1.5" style={{ gap: 16 }}>
      <Text style={{ color: '#737373' }} className="text-sm">{label}</Text>
      <Text style={{ color: '#111111', flex: 1, textAlign: 'right' }} className="text-sm font-medium">
        {value}
      </Text>
    </View>
  );
}

function RequiredSummaryRow({ label, value }: { label: string; value: string }) {
  const displayValue = value.trim() || 'Not provided';
  return (
    <View className="flex-row justify-between py-1.5" style={{ gap: 16 }}>
      <Text style={{ color: '#737373' }} className="text-sm">{label}</Text>
      <Text
        style={{
          color: value.trim() ? '#111111' : '#A3A3A3',
          flex: 1,
          textAlign: 'right',
        }}
        className="text-sm font-medium"
      >
        {displayValue}
      </Text>
    </View>
  );
}

function PublicFooter({ compact }: { compact: boolean }) {
  return (
    <View style={{ width: '100%', marginTop: 'auto' }}>
      <LinearGradient
        colors={[fyllColors.accent, '#EEF2B0', fyllColors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: '100%', height: 1 }}
      />
      <View
        style={{
          width: '100%',
          maxWidth: 1280,
          alignSelf: 'center',
          paddingHorizontal: compact ? 18 : 28,
          paddingTop: compact ? 14 : 18,
          paddingBottom: compact ? 12 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: compact ? 10 : 24,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, flex: compact ? 0.7 : 1 }}>
          <Text style={{ color: FYLL_BLACK, fontSize: 12, fontWeight: '500' }}>Powered by</Text>
          <Image source={fyllCombinationPng} resizeMode="contain" style={{ width: compact ? 74 : 92, height: compact ? 20 : 24 }} />
        </View>
        <Text style={{ color: FYLL_BLACK, fontSize: compact ? 12 : 13, lineHeight: compact ? 18 : 19, textAlign: 'right', flex: compact ? 0.3 : undefined }}>
          © Fyll 2026
        </Text>
      </View>
    </View>
  );
}

function useImageAspectRatio(sourceUri: string | null) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setAspectRatio(null);

    if (!sourceUri) {
      return () => {
        isCancelled = true;
      };
    }

    Image.getSize(
      sourceUri,
      (imageWidth, imageHeight) => {
        if (!isCancelled && imageWidth > 0 && imageHeight > 0) {
          setAspectRatio(imageWidth / imageHeight);
        }
      },
      () => {
        if (!isCancelled) setAspectRatio(null);
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [sourceUri]);

  return aspectRatio;
}

function PublicHeader({
  compact,
  brandLabel = 'Fyll',
  brandLogo = null,
}: {
  compact: boolean;
  brandLabel?: string;
  brandLogo?: string | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const resolvedLogo = brandLogo && !logoFailed ? brandLogo : null;
  const logoAspectRatio = useImageAspectRatio(resolvedLogo);
  const logoHeight = compact ? 30 : 36;
  const logoWidth = Math.min(compact ? 160 : 220, logoHeight * (logoAspectRatio ?? 2.8));

  useEffect(() => {
    setLogoFailed(false);
  }, [brandLogo]);

  return (
    <View style={{ width: '100%' }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1280,
          alignSelf: 'center',
          paddingHorizontal: compact ? 18 : 28,
          paddingVertical: compact ? 18 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <View style={{ width: compact ? 160 : 220, alignItems: 'flex-start', justifyContent: 'center', flexShrink: 1 }}>
          {resolvedLogo ? (
            <Image
              source={{ uri: resolvedLogo }}
              resizeMode="contain"
              onError={() => setLogoFailed(true)}
              style={[
                { width: logoWidth, height: logoHeight, backgroundColor: 'transparent' },
                Platform.OS === 'web' ? ({ objectFit: 'contain', objectPosition: 'left center' } as any) : null,
              ]}
            />
          ) : (
            <Text numberOfLines={1} style={{ color: FYLL_BLACK, fontSize: compact ? 16 : 20, fontWeight: '600' }}>
              {brandLabel}
            </Text>
          )}
        </View>
        <Image
          source={fyllWordmarkPng}
          resizeMode="contain"
          style={{ width: compact ? 42 : 52, height: compact ? 24 : 30 }}
        />
      </View>
      <LinearGradient
        colors={[fyllColors.accent, '#EEF2B0', fyllColors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: '100%', height: 1 }}
      />
    </View>
  );
}

function PublicMessageState({
  compact,
  icon,
  title,
  body,
  brandLabel,
  brandLogo,
}: {
  compact: boolean;
  icon: React.ReactNode;
  title: string;
  body?: string;
  brandLabel?: string;
  brandLogo?: string | null;
}) {
  return (
    <PublicPageBackground tone="white">
      <PublicHeader compact={compact} brandLabel={brandLabel} brandLogo={brandLogo} />
      <View className="flex-1 items-center justify-center px-8">
        {icon}
        <Text style={{ color: '#111111' }} className="text-lg font-bold mt-4 text-center">{title}</Text>
        {body ? <Text style={{ color: '#737373' }} className="text-sm mt-2 text-center max-w-xs">{body}</Text> : null}
      </View>
      <PublicFooter compact={compact} />
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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View
      className="rounded-[16px] px-4 mb-3"
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: isFocused ? fyllColors.accent : fyllColors.border,
        height: 52,
        justifyContent: 'center',
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#A3A3A3"
        keyboardType={keyboardType ?? 'default'}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ color: '#111111', fontSize: 14 }}
      />
    </View>
  );
}

function AddressField({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View
      className="rounded-[18px] px-4 py-3 mb-3"
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: isFocused ? fyllColors.accent : fyllColors.border,
        minHeight: 112,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Delivery address"
        placeholderTextColor="#A3A3A3"
        multiline
        textAlignVertical="top"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ color: '#111111', fontSize: 14, lineHeight: 20, minHeight: 86 }}
      />
    </View>
  );
}

function StatePickerTrigger({
  open,
  value,
  onPress,
}: {
  open: boolean;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-[16px] px-4 flex-row items-center justify-between"
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: open ? fyllColors.accent : fyllColors.border,
        height: 52,
      }}
    >
      <Text style={{ color: value ? '#111111' : '#A3A3A3', fontSize: 16 }}>
        {value || 'State'}
      </Text>
      <ChevronDown size={16} color="#A3A3A3" strokeWidth={2} />
    </Pressable>
  );
}

export default function PublicSocialCheckoutScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 768;
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
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [proofLinkCopied, setProofLinkCopied] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const draftQuery = useQuery({
    queryKey: ['social-checkout-public', code],
    queryFn: () => getSocialCheckoutPublic(code),
    enabled: code.trim().length > 0,
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
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJustSubmitted(true);
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

  const handleCopyProofLink = async () => {
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : `https://fyll.app/checkout?code=${code}`;
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProofLinkCopied(true);
    setTimeout(() => setProofLinkCopied(false), 1800);
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
        compact={compact}
        icon={<CircleAlert size={40} color="#DC2626" strokeWidth={1.5} />}
        title="Missing payment link code"
      />
    );
  }

  if (draftQuery.isLoading) {
    return (
      <PublicPageBackground>
        <PublicHeader compact={compact} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#111111" />
        </View>
        <PublicFooter compact={compact} />
      </PublicPageBackground>
    );
  }

  const draft = draftQuery.data;

  if (draftQuery.isError || !draft) {
    return (
      <PublicMessageState
        compact={compact}
        icon={<CircleAlert size={40} color="#DC2626" strokeWidth={1.5} />}
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

  if (showTerminalState) {
    const isVerified = draft.status === 'verified';
    const isExpired = !justSubmitted && draft.status === 'expired';
    const isCancelled = !justSubmitted && draft.status === 'cancelled';
    const isRejected = !justSubmitted && draft.status === 'rejected';
    const submittedCustomerName = (draft.customerName || customerName).trim();
    const submittedCustomerPhone = (draft.customerPhone || customerPhone).trim();
    const submittedCustomerEmail = (draft.customerEmail || customerEmail).trim();
    const submittedDeliveryAddress = (draft.deliveryAddress || deliveryAddress).trim();
    const submittedDeliveryState = (draft.deliveryState || deliveryState).trim();

    if (isExpired || isCancelled || isRejected) {
      return (
        <PublicMessageState
          compact={compact}
          icon={(
            <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: isRejected ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)' }}>
              {isExpired ? <Clock size={28} color="#D97706" strokeWidth={1.8} /> : <CircleAlert size={28} color={isRejected ? '#DC2626' : '#D97706'} strokeWidth={1.8} />}
            </View>
          )}
          title={isExpired ? 'This payment link has expired' : isRejected ? 'Payment proof was rejected' : 'This payment link was cancelled'}
          body={isExpired
            ? 'For your security, links only stay active for 24 hours. Ask the seller to send you a new one.'
            : isRejected
              ? 'Please contact the seller so they can confirm the payment details or send you a new link.'
              : 'Ask the seller to send you a new payment link.'}
          brandLabel={draft.businessName}
          brandLogo={draft.businessLogo}
        />
      );
    }

    return (
      <PublicPageBackground tone="white">
        <PublicHeader compact={compact} brandLabel={draft.businessName} brandLogo={draft.businessLogo} />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: compact ? 24 : 28, paddingTop: compact ? 38 : 56, paddingBottom: compact ? 36 : 44 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-5"
            style={{ backgroundColor: isVerified ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)' }}
          >
            {isVerified ? <CircleCheck size={30} color="#059669" strokeWidth={1.8} /> : <Clock size={28} color="#D97706" strokeWidth={1.8} />}
          </View>
          <Text style={{ color: '#111111' }} className="text-xl font-bold text-center">
            {isVerified ? 'Payment verified' : 'Thank you'}
          </Text>
          <Text style={{ color: '#737373' }} className="text-sm mt-2.5 text-center leading-5 max-w-xs">
            {isVerified
              ? 'Your order has been confirmed and is being prepared.'
              : "Payment awaiting confirmation. You'll be notified as soon as it's been verified."}
          </Text>

          {billNote ? (
            <View className="w-full max-w-xs rounded-[24px] p-5 mt-6" style={{ borderWidth: 1, borderColor: '#E5E5E5' }}>
              <SectionLabel>What you paid for</SectionLabel>
              <Text style={{ color: '#111111', fontSize: 14, lineHeight: 22 }}>{billNote}</Text>
            </View>
          ) : null}

          <View className="w-full max-w-xs rounded-[24px] p-4 mt-4" style={{ borderWidth: 1, borderColor: '#E5E5E5' }}>
            <View className="flex-row items-center justify-between mb-2">
              <Text style={{ color: '#737373' }} className="text-sm">Amount</Text>
              <Text style={{ color: '#111111' }} className="text-sm font-semibold">{formatCurrency(draft.amount)}</Text>
            </View>
            <Pressable
              onPress={handleCopyReference}
              className="flex-row items-center justify-between active:opacity-70"
            >
              <Text style={{ color: '#737373' }} className="text-sm">Reference</Text>
              <View className="flex-row items-center gap-1.5">
                <Text style={{ color: copiedReference ? '#059669' : '#111111' }} className="text-sm font-semibold">{code}</Text>
                {copiedReference ? <Check size={14} color="#059669" strokeWidth={2.5} /> : <Copy size={14} color="#737373" strokeWidth={2} />}
              </View>
            </Pressable>
          </View>

          <View className="w-full max-w-xs rounded-[24px] p-4 mt-4" style={{ borderWidth: 1, borderColor: '#E5E5E5' }}>
            <SectionLabel>Your details</SectionLabel>
            <RequiredSummaryRow label="Name" value={submittedCustomerName} />
            <RequiredSummaryRow label="Phone" value={submittedCustomerPhone} />
            <RequiredSummaryRow label="Email" value={submittedCustomerEmail} />
            <RequiredSummaryRow label="State" value={submittedDeliveryState} />
            <RequiredSummaryRow label="Address" value={submittedDeliveryAddress} />
          </View>

          {!isVerified ? (
            <Pressable
              onPress={handleCopyProofLink}
              className="w-full max-w-xs rounded-full items-center justify-center flex-row gap-2 mt-4 active:opacity-70"
              style={{ height: 48, borderWidth: 1, borderColor: '#E5E5E5' }}
            >
              {proofLinkCopied ? <Check size={16} color="#059669" strokeWidth={2.5} /> : <Copy size={16} color="#111111" strokeWidth={2} />}
              <Text style={{ color: proofLinkCopied ? '#059669' : '#111111' }} className="font-medium text-sm">
                {proofLinkCopied ? 'Link copied' : 'Copy proof of payment link'}
              </Text>
            </Pressable>
          ) : null}
          {!isVerified ? (
            <Text style={{ color: '#A3A3A3' }} className="text-xs mt-2.5 text-center max-w-xs">
              Share this link with customer support if you need to confirm your payment.
            </Text>
          ) : null}
        </ScrollView>
        <PublicFooter compact={compact} />
      </PublicPageBackground>
    );
  }

  return (
    <PublicPageBackground tone="white">
      <PublicHeader compact={compact} brandLabel={draft.businessName} brandLogo={draft.businessLogo} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: compact ? 24 : 28, paddingTop: compact ? 32 : 38, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View className="items-center mb-6" style={{ maxWidth: 440, alignSelf: 'center', width: '100%' }}>
          <SectionLabel>Amount due</SectionLabel>
          <Text style={{ color: '#111111' }} className="text-[38px] font-bold">{formatCurrency(draft.amount)}</Text>
          {expiryMsRemaining <= 0 && Number.isFinite(expiresAtMs) ? (
            <View className="rounded-full px-4 py-2 mt-3 flex-row items-center" style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.24)' }}>
              <Clock size={14} color="#DC2626" strokeWidth={2} />
              <Text style={{ color: '#DC2626', fontSize: 14 }} className="ml-2 font-semibold">Payment link expired</Text>
            </View>
          ) : (
            <LinearGradient
              colors={[fyllColors.accent, '#EEF2B0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginTop: 12, flexDirection: 'row', alignItems: 'center' }}
            >
              <Clock size={14} color={fyllColors.primary} strokeWidth={2} />
              <Text style={{ color: fyllColors.primary, fontSize: 14 }} className="ml-2">Payment Expires In</Text>
              <Text style={{ color: fyllColors.primary, fontSize: 14 }} className="font-bold ml-2">{expiryLabel}</Text>
            </LinearGradient>
          )}
        </View>

        <View style={{ maxWidth: 440, alignSelf: 'center', width: '100%' }}>
          {billNote ? (
            <View
              className="rounded-[24px] p-5 mb-4"
              style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
            >
              <SectionLabel>What you're paying for</SectionLabel>
              <Text style={{ color: '#111111', fontSize: 14, lineHeight: 22 }}>{billNote}</Text>
            </View>
          ) : null}

          <View
            className="rounded-[24px] p-5 mb-4"
            style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
          >
            <View className="flex-row items-center mb-3">
              <Landmark size={13} color="#A3A3A3" strokeWidth={2} />
              <Text style={{ color: '#A3A3A3' }} className="text-[11px] font-semibold uppercase tracking-wider ml-2">Pay via bank transfer</Text>
            </View>
            <View className="mb-3">
              <Text style={{ color: '#A3A3A3' }} className="text-[10px] font-semibold uppercase tracking-wider mb-1">Bank</Text>
              <Text style={{ color: '#111111', fontSize: 14, fontWeight: '400' }}>{draft.bankAccount.bankName}</Text>
            </View>
            <View className="mb-3">
              <Text style={{ color: '#A3A3A3' }} className="text-[10px] font-semibold uppercase tracking-wider mb-1">Account name</Text>
              <Text style={{ color: '#111111', fontSize: 14, fontWeight: '400' }}>{draft.bankAccount.accountName}</Text>
            </View>
            <Pressable
              onPress={() => handleCopyAccountNumber(draft.bankAccount.accountNumber)}
              className="rounded-2xl px-4 py-3 flex-row items-center justify-between active:opacity-70 mb-3"
              style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
            >
              <View>
                <Text style={{ color: '#A3A3A3' }} className="text-[10px] font-semibold uppercase tracking-wider mb-1">Account number — tap to copy</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '700' }} selectable>{draft.bankAccount.accountNumber}</Text>
              </View>
              {copiedAccount ? <Check size={18} color="#059669" strokeWidth={2.5} /> : <Copy size={18} color="#737373" strokeWidth={2} />}
            </Pressable>

            <Pressable
              onPress={handleCopyReference}
              className="rounded-2xl px-4 py-3 flex-row items-center justify-between active:opacity-70"
              style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
            >
              <View>
                <Text style={{ color: '#A3A3A3' }} className="text-[10px] font-semibold uppercase tracking-wider mb-1">Payment reference — tap to copy</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '700' }} selectable>{code}</Text>
              </View>
              {copiedReference ? <Check size={18} color="#059669" strokeWidth={2.5} /> : <Copy size={18} color="#737373" strokeWidth={2} />}
            </Pressable>
          </View>

          <View
            className="rounded-[24px] p-5 mb-4"
            style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
          >
            <SectionLabel>Your details</SectionLabel>
            <Field value={customerName} onChangeText={setCustomerName} placeholder="Full name" />
            <Field value={customerPhone} onChangeText={setCustomerPhone} placeholder="Phone number" keyboardType="phone-pad" />
            <Field value={customerEmail} onChangeText={setCustomerEmail} placeholder="Email" keyboardType="email-address" />
            <Text style={{ color: '#A3A3A3', fontSize: 12, lineHeight: 18 }} className="-mt-1 mb-3 px-1">
              We'll send confirmation and verification updates here.
            </Text>
            <AddressField value={deliveryAddress} onChangeText={setDeliveryAddress} />

            <StatePickerTrigger
              open={showStatePicker}
              value={deliveryState}
              onPress={() => setShowStatePicker((v) => !v)}
            />
            {showStatePicker ? (
              <View className="rounded-xl mt-2 p-2" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border, maxHeight: 220 }}>
                <View className="rounded-[14px] px-4 mb-2" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border, height: 46, justifyContent: 'center' }}>
                  <TextInput
                    value={stateSearchQuery}
                    onChangeText={setStateSearchQuery}
                    placeholder="Search state"
                    placeholderTextColor="#A3A3A3"
                    style={{ color: '#111111', fontSize: 16 }}
                  />
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {filteredStates.map((state) => (
                    <Pressable
                      key={state}
                      onPress={() => {
                        setDeliveryState(state);
                        setStateSearchQuery('');
                        setShowStatePicker(false);
                      }}
                      className="px-3 py-3 rounded-lg active:opacity-70"
                    >
                      <Text style={{ color: '#111111', fontSize: 16 }}>{state}</Text>
                    </Pressable>
                  ))}
                  {filteredStates.length === 0 ? (
                    <Text style={{ color: '#737373', fontSize: 14, paddingHorizontal: 12, paddingVertical: 14 }}>No state found</Text>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View
            className="rounded-[24px] p-5 mb-4"
            style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border }}
          >
            <SectionLabel>Payment proof</SectionLabel>
            {proofUri ? (
              <Pressable onPress={handlePickProof} className="active:opacity-80">
                <Image source={{ uri: proofUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" />
              </Pressable>
            ) : (
              <Pressable onPress={handlePickProof} className="flex-row items-center rounded-xl px-4 active:opacity-70" style={{ height: 68, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fyllColors.border, borderStyle: 'dashed' }}>
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#F5F5F5' }}>
                  <Upload size={16} color="#737373" strokeWidth={2} />
                </View>
                <View>
                  <Text style={{ color: '#111111' }} className="text-base font-semibold">Upload A Screenshot</Text>
                  <Text style={{ color: '#A3A3A3' }} className="text-xs mt-0.5">Bank receipt, transfer confirmation, etc.</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, maxWidth: 420, alignSelf: 'center', width: '100%' }}>
        {isFormValid ? (
          <LinearGradient
            colors={[fyllColors.accent, '#FFFFFF', fyllColors.accent]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 999 }}
          >
            <Pressable
              onPress={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="items-center justify-center flex-row gap-2"
              style={{ height: 54 }}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color={fyllColors.primary} />
              ) : (
                <Text style={{ color: fyllColors.primary }} className="font-bold text-base">I've Made This Payment →</Text>
              )}
            </Pressable>
          </LinearGradient>
        ) : (
          <View
            className="rounded-full items-center justify-center flex-row gap-2"
            style={{ backgroundColor: '#D4D4D4', height: 54 }}
          >
            <Text style={{ color: '#FFFFFF' }} className="font-semibold text-base">I've Made This Payment →</Text>
          </View>
        )}
      </View>
      <PublicFooter compact={compact} />
    </PublicPageBackground>
  );
}
