import React, { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, Text as NativeText, TextInput, View, useWindowDimensions, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Check, ChevronLeft, Lock, Upload, X } from 'lucide-react-native';
import { useFonts, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { formatCurrency } from '@/lib/state/fyll-store';
import { getQuotePublic, respondToQuote, submitQuoteProof, type PublicQuote } from '@/lib/supabase/quote-public';
import { uploadSocialCheckoutProof } from '@/lib/storage-attachments';
import { buildWhatsAppUrl, formatQuoteDate } from '@/lib/quotes';

// The customer's quote page. Public and unauthenticated: the quote code in the link is the only
// credential, and everything goes through the RPCs in supabase/migrations/20261012120000_quotes.sql.
// One screen, a few steps: the quote, request changes, pay the deposit, proof sent.

const fieldPhone = require('../../../assets/fyll-field-phone.jpg');
const fieldDesktop = require('../../../assets/fyll-field-desktop.jpg');
const wordmark = require('../../../assets/fyll-wordmark-thick-light.png');

// Two looks. Phones get the light design (Field header, white cards). On the web (wide screens) the
// page matches the Fyll payment page instead: the Field fills the top of the screen and everything
// sits in dark frosted glass.
const LIGHT = {
  wide: false,
  page: '#F8F8F4',
  ink: '#1E1E1E',
  lime: '#D5E057',
  limeInk: '#5F6A00',
  muted: '#6B6C63',
  body: '#3A3B34',
  line: 'rgba(30,30,30,0.07)',
  line2: 'rgba(30,30,30,0.1)',
  card: '#FFFFFF',
  cardBorder: 'rgba(30,30,30,0.08)',
  onLime: '#1E1E1E',
  disabledBg: 'rgba(30,30,30,0.08)',
  disabledInk: '#9A9B90',
  outline: 'rgba(30,30,30,0.18)',
  soft: 'rgba(30,30,30,0.07)',
  field: '#FBFBF8',
  fieldBorder: 'rgba(30,30,30,0.14)',
  tint: 'rgba(213,224,87,0.4)',
  depositBg: 'rgba(213,224,87,0.3)',
  tintIcon: '#3F4A08',
  softText: '#55564E',
  placeholder: '#9A9B90',
  error: '#C2453A',
  closedBg: '#EFEFE9',
  stepNowBg: '#FFFFFF',
  stepBorder: 'rgba(30,30,30,0.2)',
  stepNextInk: '#8C8D84',
  proofBorder: 'rgba(95,106,0,0.35)',
  removeBg: 'rgba(30,30,30,0.06)',
};
const DARK: typeof LIGHT = {
  wide: true,
  page: '#141414',
  ink: '#F4F4EF',
  lime: '#D5E057',
  limeInk: '#D5E057',
  muted: 'rgba(244,244,239,0.62)',
  body: 'rgba(244,244,239,0.82)',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.1)',
  card: 'rgba(34,36,26,0.55)',
  cardBorder: 'rgba(255,255,255,0.12)',
  onLime: '#1E1E1E',
  disabledBg: 'rgba(255,255,255,0.08)',
  disabledInk: 'rgba(244,244,239,0.4)',
  outline: 'rgba(255,255,255,0.22)',
  soft: 'rgba(255,255,255,0.09)',
  field: 'rgba(255,255,255,0.05)',
  fieldBorder: 'rgba(255,255,255,0.16)',
  tint: 'rgba(213,224,87,0.16)',
  depositBg: 'rgba(213,224,87,0.14)',
  tintIcon: '#D5E057',
  softText: 'rgba(244,244,239,0.7)',
  placeholder: 'rgba(244,244,239,0.4)',
  error: '#F87171',
  closedBg: 'rgba(255,255,255,0.06)',
  stepNowBg: '#141414',
  stepBorder: 'rgba(255,255,255,0.25)',
  stepNextInk: 'rgba(244,244,239,0.45)',
  proofBorder: 'rgba(213,224,87,0.4)',
  removeBg: 'rgba(255,255,255,0.1)',
};
type Theme = typeof LIGHT;
const ThemeContext = createContext<Theme>(LIGHT);
const useC = () => useContext(ThemeContext);

type Weight = 'regular' | 'medium' | 'semi' | 'bold';
const FONT: Record<Weight, string> = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semi: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
};

function T({ weight = 'regular', style, ...props }: TextProps & { weight?: Weight }) {
  const C = useC();
  return <NativeText {...props} style={[{ fontFamily: FONT[weight], color: C.ink }, style]} />;
}

const DECLINE_REASONS = ['Too expensive', 'Need it sooner', 'Found another option', 'Other'];
const CHANGE_TOPICS = ['Quantities', 'Price', 'Delivery date', 'Design details'];

const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

type Screen = 'quote' | 'changes' | 'changesSent' | 'pay' | 'paid';

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const C = useC();
  return (
    <View
      style={[
        { borderRadius: C.wide ? 26 : 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
        C.wide && Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)', boxShadow: '0 24px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' } as object)
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const C = useC();
  return <T weight="semi" style={{ color: C.muted, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</T>;
}

function PrimaryButton({ label, onPress, disabled = false, loading = false }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const C = useC();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({ height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: disabled ? C.disabledBg : C.lime, opacity: pressed ? 0.85 : 1 })}
    >
      {loading ? <ActivityIndicator color={C.onLime} /> : null}
      <T weight="bold" style={{ fontSize: 16, color: disabled ? C.disabledInk : C.onLime }}>{label}</T>
    </Pressable>
  );
}

function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  const C = useC();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.outline, opacity: pressed ? 0.7 : 1 })}
    >
      <T weight="semi" style={{ fontSize: 15 }}>{label}</T>
    </Pressable>
  );
}

function TextButton({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const C = useC();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <T weight="semi" style={{ fontSize: 14, color: color ?? C.muted }}>{label}</T>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const C = useC();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ height: 38, paddingHorizontal: 15, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? C.ink : C.outline, backgroundColor: selected ? C.ink : 'transparent' }}
    >
      <T weight="semi" style={{ fontSize: 14, color: selected ? C.page : C.ink }}>{label}</T>
    </Pressable>
  );
}

function MerchantLogo({ quote, size }: { quote: PublicQuote; size: number }) {
  const C = useC();
  const ring = { borderWidth: 2, borderColor: C.lime };
  if (quote.businessLogo) {
    return <Image source={{ uri: quote.businessLogo }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', ...ring }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.35)', ...ring }}>
      <T weight="bold" style={{ color: '#FFFFFF', fontSize: size * 0.4 }}>{quote.businessName.charAt(0).toUpperCase()}</T>
    </View>
  );
}

function Hero({
  quote,
  subtitle,
  eyebrow,
  eyebrowIcon,
  lead,
  badge,
  title,
  titleSize = 52,
  body,
  onBack,
  fontsReady,
}: {
  quote: PublicQuote;
  subtitle: string;
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  lead?: string;
  badge?: React.ReactNode;
  title: string;
  titleSize?: number;
  body: string;
  onBack?: () => void;
  fontsReady: boolean;
}) {
  const C = useC();
  const backButton = onBack ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to quote"
      onPress={onBack}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}
    >
      <ChevronLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
    </Pressable>
  ) : null;
  const identity = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
      {backButton ?? <MerchantLogo quote={quote} size={C.wide ? 48 : 40} />}
      <View style={{ flexShrink: 1 }}>
        <T weight="semi" style={{ color: '#FFFFFF', fontSize: 15 }} numberOfLines={1}>{quote.businessName}</T>
        <T style={{ color: 'rgba(244,244,239,0.75)', fontSize: 12 }} numberOfLines={1}>{subtitle}</T>
      </View>
    </View>
  );
  const headline = (
    <View style={{ gap: 10 }}>
      {badge}
      {eyebrow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {eyebrowIcon ?? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime }} />}
          <T weight="semi" style={{ color: '#EEF2C4', fontSize: 13 }}>{eyebrow}</T>
        </View>
      ) : null}
      {lead ? <T weight="semi" style={{ color: 'rgba(244,244,239,0.9)', fontSize: 15 }}>{lead}</T> : null}
      <NativeText
        accessibilityRole="header"
        style={{
          color: '#FFFFFF',
          fontSize: titleSize,
          lineHeight: titleSize * 0.98,
          letterSpacing: -titleSize * 0.04,
          fontFamily: fontsReady ? 'BricolageGrotesque_800ExtraBold' : undefined,
          fontWeight: fontsReady ? '400' : '800',
        }}
      >
        {title}
      </NativeText>
      <T style={{ color: 'rgba(244,244,239,0.85)', fontSize: 14.5, lineHeight: 22 }}>{body}</T>
    </View>
  );

  // Wide screens: the headline sits in a glass pane over the Field, like the payment request.
  if (C.wide) {
    return (
      <Card style={{ padding: 24, gap: 22, borderRadius: 30 }}>
        {identity}
        {headline}
      </Card>
    );
  }

  return (
    <View style={{ backgroundColor: '#3F4A08', overflow: 'hidden', flexGrow: 0, flexShrink: 0 }}>
      <Image source={fieldPhone} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(20,20,20,0.25)', 'rgba(20,20,20,0.1)', 'rgba(20,20,20,0.3)']}
        locations={[0, 0.6, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 56, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {identity}
          <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
            <T weight="semi" style={{ color: '#EEF2C4', fontSize: 11.5 }}>Secured by fyll</T>
          </View>
        </View>
        {headline}
      </View>
    </View>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  const C = useC();
  if (C.wide) return <View style={{ gap: 14, paddingTop: 14 }}>{children}</View>;
  return (
    <View style={{ flexGrow: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.page, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36, gap: 14 }}>
      {children}
    </View>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const C = useC();

  if (C.wide) {
    return (
      <View style={{ flex: 1, backgroundColor: C.page }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 680, overflow: 'hidden' }}>
          <Image source={fieldDesktop} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
          <LinearGradient colors={['rgba(20,20,20,0)', 'rgba(20,20,20,0.08)', C.page]} locations={[0, 0.56, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={[]}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: 480, flexGrow: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingHorizontal: 8 }}>
                <Image source={wordmark} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 28 * (900 / 493), height: 28, tintColor: '#F7F8EA' }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
                  <Lock size={12} color="#EEF2C4" strokeWidth={2.4} />
                  <T weight="semi" style={{ color: '#EEF2C4', fontSize: 12 }}>Secured by fyll</T>
                </View>
              </View>
              <View style={{ marginTop: 56 }}>{children}</View>
              <View style={{ marginTop: 'auto', paddingTop: 40, paddingHorizontal: 8, paddingBottom: 28, alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T style={{ color: 'rgba(244,244,239,0.72)', fontSize: 13 }}>Powered by</T>
                  <Image source={wordmark} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 13 * (900 / 493), height: 13, tintColor: C.lime }} />
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', flexGrow: 1, backgroundColor: C.page }}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Centered({ title, body }: { title: string; body: string }) {
  const C = useC();
  return (
    <View style={{ flex: 1, backgroundColor: C.page, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 }}>
      <T weight="bold" style={{ fontSize: 20, textAlign: 'center' }}>{title}</T>
      <T style={{ color: C.muted, fontSize: 14.5, lineHeight: 22, textAlign: 'center', maxWidth: 320 }}>{body}</T>
    </View>
  );
}

function CopyButton({ value }: { value: string }) {
  const C = useC();
  const [copied, setCopied] = useState<boolean>(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: copied ? C.lime : C.soft }}
    >
      <T weight="semi" style={{ fontSize: 13, color: copied ? C.onLime : C.ink }}>{copied ? 'Copied' : 'Copy'}</T>
    </Pressable>
  );
}

function QuotePublicInner() {
  const C = useC();
  const { code: codeParam } = useLocalSearchParams<{ code?: string | string[] }>();
  const code = (Array.isArray(codeParam) ? codeParam[0] : codeParam ?? '').trim().toUpperCase();
  const queryClient = useQueryClient();
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  const fontsReady = fontsLoaded && !fontError;

  const [local, setLocal] = useState<Screen | null>(null);
  const [declining, setDeclining] = useState<boolean>(false);
  const [declineReason, setDeclineReason] = useState<string>(DECLINE_REASONS[0]);
  const [topics, setTopics] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string>('payment-screenshot.jpg');
  const [actionError, setActionError] = useState<string>('');

  const quoteQuery = useQuery({
    queryKey: ['quote-public', code],
    enabled: Boolean(code),
    queryFn: () => getQuotePublic(code),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['quote-public', code] });

  const respond = useMutation({
    mutationFn: (input: { action: 'accept' | 'decline' | 'request_changes' | 'reopen'; message?: string; topics?: string[]; reason?: string }) => (
      respondToQuote({ code, ...input })
    ),
    onSuccess: async (result, input) => {
      if (!result.ok) {
        setActionError(result.error === 'expired' ? 'This quote has expired.' : 'That did not go through. Please refresh and try again.');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActionError('');
      setDeclining(false);
      await refresh();
      setLocal(input.action === 'request_changes' ? 'changesSent' : null);
    },
    onError: () => setActionError('We could not reach the server. Check your connection and try again.'),
  });

  const sendProof = useMutation({
    mutationFn: async () => {
      if (!proofUri) throw new Error('Choose your payment screenshot first.');
      const upload = await uploadSocialCheckoutProof({ code, uri: proofUri, fileName: proofName });
      const result = await submitQuoteProof({ code, proofImageUrl: upload.publicUrl });
      if (!result.ok) throw new Error('This quote is no longer waiting for a deposit.');
    },
    onSuccess: async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActionError('');
      await refresh();
      setLocal(null);
    },
    onError: (error: Error) => setActionError(error.message || 'Could not send your proof. Please try again.'),
  });

  const pickProof = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos to upload your payment screenshot.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setProofUri(result.assets[0].uri);
        setProofName(result.assets[0].fileName ?? 'payment-screenshot.jpg');
      }
    } catch {
      Alert.alert('Error', 'Could not open your photo library. Please try again.');
    }
  };

  if (!code) return <Centered title="Quote not found" body="This link is missing its quote code. Ask the business to send it again." />;
  if (quoteQuery.isLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.limeInk} />
      </View>
    );
  }
  const quote = quoteQuery.data;
  if (quoteQuery.isError) return <Centered title="Could not load this quote" body="Check your connection and refresh the page." />;
  if (!quote) return <Centered title="Quote not found" body="This link is not valid. Ask the business to send it again." />;

  const first = quote.customerName.trim().split(/\s+/)[0] || '';
  const status = quote.status;
  const waitingForDeposit = status === 'accepted' || status === 'proof_rejected';
  const contactUrl = quote.businessPhone ? buildWhatsAppUrl(quote.businessPhone, `Hi ${quote.businessName}, a question about quote ${quote.quoteNumber}.`) : '';
  const validText = quote.validUntil ? `Valid until ${formatQuoteDate(quote.validUntil)}` : '';

  let screen: Screen;
  if (local === 'changes' || local === 'changesSent') screen = local;
  else if (local === 'quote') screen = 'quote';
  else if (waitingForDeposit) screen = 'pay';
  else if (status === 'proof_submitted' || status === 'order_created') screen = 'paid';
  else screen = 'quote';

  const backToQuote = () => { setLocal('quote'); setActionError(''); };

  // ── Request changes ──────────────────────────────────────────────────────
  if (screen === 'changes' || screen === 'changesSent') {
    const sent = screen === 'changesSent';
    return (
      <Frame>
        <Hero
          quote={quote}
          subtitle={`Quote ${quote.quoteNumber}`}
          title={sent ? (first ? `Thanks, ${first}` : 'Thanks') : 'Request changes'}
          titleSize={40}
          body={sent ? 'Your request is with the business.' : `Tell ${quote.businessName} what to change. They'll send you an updated quote.`}
          onBack={sent ? undefined : () => { setLocal(null); setActionError(''); }}
          fontsReady={fontsReady}
        />
        <Sheet>
          {sent ? (
            <View style={{ alignItems: 'center', gap: 14, paddingTop: 20 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint }}>
                <Check size={26} color={C.tintIcon} strokeWidth={2.8} />
              </View>
              <T weight="bold" style={{ fontSize: 22 }}>Request sent</T>
              <T style={{ color: C.softText, fontSize: 14.5, lineHeight: 22, textAlign: 'center', maxWidth: 290 }}>
                {quote.businessName} will update the quote and message you. Nothing is charged yet.
              </T>
              <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
                <PrimaryButton label="Back to quote" onPress={() => setLocal('quote')} />
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CHANGE_TOPICS.map((topic) => (
                  <Chip
                    key={topic}
                    label={topic}
                    selected={topics.includes(topic)}
                    onPress={() => setTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]))}
                  />
                ))}
              </View>
              <View style={{ gap: 8 }}>
                <T weight="semi" style={{ fontSize: 13 }}>Your message</T>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={5}
                  placeholder="e.g. Can we make it 15 frames instead of 12?"
                  placeholderTextColor={C.placeholder}
                  style={[{ minHeight: 120, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.fieldBorder, backgroundColor: C.field, color: C.ink, fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }, noOutline]}
                />
              </View>
              {actionError ? <T style={{ color: C.error, fontSize: 13.5 }}>{actionError}</T> : null}
              <PrimaryButton
                label={`Send to ${quote.businessName}`}
                loading={respond.isPending}
                disabled={!message.trim() && topics.length === 0}
                onPress={() => respond.mutate({ action: 'request_changes', message: message.trim(), topics })}
              />
              <T style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>Your quote stays open while they update it</T>
            </>
          )}
        </Sheet>
      </Frame>
    );
  }

  // ── Pay the deposit ──────────────────────────────────────────────────────
  if (screen === 'pay') {
    const full = quote.depositPercent >= 100;
    const bank = quote.bankAccount;
    return (
      <Frame>
        <Hero
          quote={quote}
          subtitle={`Quote ${quote.quoteNumber}`}
          eyebrow="You accepted the quote"
          eyebrowIcon={<Check size={14} color={C.lime} strokeWidth={3} />}
          lead={full ? 'Pay in full' : 'Pay deposit'}
          title={formatCurrency(quote.depositAmount)}
          body={full ? `Pay ${formatCurrency(quote.total)} in full to start your order` : `${quote.depositPercent}% of ${formatCurrency(quote.total)} · balance of ${formatCurrency(quote.balance)} is due before delivery`}
          fontsReady={fontsReady}
        />
        <Sheet>
          {status === 'proof_rejected' ? (
            <View style={{ padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(229,119,109,0.5)', backgroundColor: C.card, gap: 4 }}>
              <T weight="bold" style={{ fontSize: 15 }}>We could not verify that payment</T>
              <T style={{ color: C.muted, fontSize: 13.5, lineHeight: 20 }}>Check the transfer and upload your screenshot again, or message {quote.businessName}.</T>
            </View>
          ) : null}

          <Card style={{ padding: 16, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink }}>
                <T weight="bold" style={{ color: C.page, fontSize: 12.5 }}>1</T>
              </View>
              <T weight="bold" style={{ fontSize: 15.5 }}>{full ? 'Transfer the payment' : 'Transfer the deposit'}</T>
            </View>
            {bank ? (
              <>
                <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                  <T style={{ color: C.muted, fontSize: 13 }}>Bank</T>
                  <T weight="semi" style={{ fontSize: 15.5 }}>{bank.bankName}</T>
                </View>
                <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <T style={{ color: C.muted, fontSize: 13 }}>Account number</T>
                    <T weight="bold" style={{ fontSize: 20, letterSpacing: 0.5 }} selectable>{bank.accountNumber}</T>
                  </View>
                  <CopyButton value={bank.accountNumber} />
                </View>
                <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                  <T style={{ color: C.muted, fontSize: 13 }}>Account name</T>
                  <T weight="semi" style={{ fontSize: 14.5 }}>{bank.accountName}</T>
                </View>
                <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <T style={{ color: C.muted, fontSize: 13 }}>Add this to the narration</T>
                    <T weight="semi" style={{ fontSize: 15.5 }}>{quote.quoteNumber}</T>
                  </View>
                  <CopyButton value={quote.quoteNumber} />
                </View>
              </>
            ) : (
              <T style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>{quote.businessName} will send you their bank details.</T>
            )}
          </Card>

          <Card style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink }}>
                <T weight="bold" style={{ color: C.page, fontSize: 12.5 }}>2</T>
              </View>
              <T weight="bold" style={{ fontSize: 15.5 }}>Upload your payment screenshot</T>
            </View>
            {proofUri ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: C.field, borderWidth: 1, borderColor: C.proofBorder }}>
                <Image source={{ uri: proofUri }} style={{ width: 52, height: 64, borderRadius: 10, backgroundColor: C.ink }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="semi" style={{ fontSize: 14.5 }} numberOfLines={1}>{proofName}</T>
                  <T style={{ color: C.muted, fontSize: 13 }}>Ready to send</T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove screenshot"
                  onPress={() => setProofUri(null)}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.removeBg }}
                >
                  <X size={14} color={C.ink} strokeWidth={2.6} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={pickProof}
                style={{ alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.outline, backgroundColor: C.field }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint }}>
                  <Upload size={22} color={C.tintIcon} strokeWidth={2} />
                </View>
                <T weight="semi" style={{ fontSize: 15 }}>Tap to choose a screenshot</T>
                <T style={{ color: C.muted, fontSize: 13 }}>JPG or PNG, from your photos</T>
              </Pressable>
            )}
          </Card>

          {actionError ? <T style={{ color: C.error, fontSize: 13.5, textAlign: 'center' }}>{actionError}</T> : null}
          <PrimaryButton
            label={`I've paid · send proof of ${formatCurrency(quote.depositAmount)}`}
            disabled={!proofUri}
            loading={sendProof.isPending}
            onPress={() => sendProof.mutate()}
          />
          <T style={{ color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
            {quote.businessName} checks the transfer and starts your order.
          </T>
          <TextButton label="View quote" color={C.limeInk} onPress={backToQuote} />
        </Sheet>
      </Frame>
    );
  }

  // ── Proof sent / order started ───────────────────────────────────────────
  if (screen === 'paid') {
    const started = status === 'order_created';
    const steps = [
      { title: 'Quote accepted', sub: `${quote.quoteNumber} · ${formatCurrency(quote.total)}`, state: 'done' },
      { title: 'Deposit proof sent', sub: `${formatCurrency(quote.depositAmount)}`, state: 'done' },
      { title: `${quote.businessName} verifies`, sub: started ? 'Verified' : 'Usually within a few hours', state: started ? 'done' : 'now' },
      { title: 'Your order starts', sub: started ? 'Your order is in progress' : quote.readyIn ? `Ready about ${quote.readyIn} later` : 'You will be told when it starts', state: started ? 'done' : 'next' },
    ] as const;
    return (
      <Frame>
        <Hero
          quote={quote}
          subtitle={`Quote ${quote.quoteNumber}`}
          badge={(
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.lime }}>
              <Check size={24} color={C.ink} strokeWidth={3} />
            </View>
          )}
          title={started ? 'Order started' : 'Proof sent'}
          titleSize={44}
          body={started ? `${quote.businessName} has verified your payment and started your order.` : `${formatCurrency(quote.depositAmount)} deposit · ${quote.businessName} is checking your transfer.`}
          fontsReady={fontsReady}
        />
        <Sheet>
          <Card style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            {steps.map((step, index) => (
              <View key={step.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: C.line }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: step.state === 'done' ? C.lime : step.state === 'now' ? C.stepNowBg : 'transparent',
                    borderWidth: step.state === 'done' ? 0 : step.state === 'now' ? 2 : 1.5,
                    borderColor: step.state === 'now' ? C.limeInk : C.stepBorder,
                  }}
                >
                  {step.state === 'done' ? <Check size={13} color={C.ink} strokeWidth={3.2} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T weight={step.state === 'next' ? 'medium' : 'semi'} style={{ fontSize: 15, color: step.state === 'next' ? C.stepNextInk : C.ink }}>{step.title}</T>
                  <T style={{ color: C.muted, fontSize: 13 }}>{step.sub}</T>
                </View>
              </View>
            ))}
          </Card>
          {quote.balance > 0 ? (
            <Card style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <T style={{ color: C.muted, fontSize: 13 }}>Balance, due before delivery</T>
                <T weight="bold" style={{ fontSize: 18 }}>{formatCurrency(quote.balance)}</T>
              </View>
              <T style={{ color: C.muted, fontSize: 13 }}>We'll send the link</T>
            </Card>
          ) : null}
          {contactUrl ? <OutlineButton label={`Message ${quote.businessName}`} onPress={() => { void Linking.openURL(contactUrl); }} /> : null}
          <TextButton label="View quote" color={C.limeInk} onPress={backToQuote} />
        </Sheet>
      </Frame>
    );
  }

  // ── The quote ────────────────────────────────────────────────────────────
  const closed = status === 'expired' || status === 'cancelled';
  const declined = status === 'declined';
  const eyebrow = declined
    ? 'Quote declined'
    : status === 'expired'
      ? 'Quote expired'
      : status === 'cancelled'
        ? 'Quote cancelled'
        : `Quote ${quote.quoteNumber}${first ? ` · for ${first}` : ''}`;
  const heroBody = declined
    ? 'This quote is closed.'
    : status === 'expired'
      ? 'This quote has expired. Message the business for a new one.'
      : status === 'cancelled'
        ? 'The business has cancelled this quote.'
        : status === 'changes_requested'
          ? `You asked for changes. ${quote.businessName} will send an updated quote.`
          : `Review it, then accept or ask for changes.${validText ? ` ${validText}.` : ''}`;

  return (
    <Frame>
      <Hero quote={quote} subtitle="Quote for you" eyebrow={eyebrow} title={formatCurrency(quote.total)} body={heroBody} fontsReady={fontsReady} />
      <Sheet>
        <Card style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 8 }}>
            <SectionTitle>What's included</SectionTitle>
            <T style={{ color: C.muted, fontSize: 13 }}>{quote.quoteNumber}</T>
          </View>
          {quote.items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={{ flexDirection: 'row', gap: 10, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.line }}>
              <T style={{ minWidth: 30, color: C.muted, fontSize: 15 }}>{item.quantity}×</T>
              <T style={{ flex: 1, fontSize: 15 }}>{item.name}</T>
              <T weight="semi" style={{ fontSize: 15 }}>{formatCurrency(item.unitPrice * item.quantity)}</T>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.line2 }}>
            <T weight="bold" style={{ fontSize: 16 }}>Total</T>
            <T weight="bold" style={{ fontSize: 16 }}>{formatCurrency(quote.total)}</T>
          </View>
        </Card>

        <Card style={{ padding: 16, gap: 12 }}>
          <SectionTitle>How payment works</SectionTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: C.depositBg }}>
            <View style={{ gap: 2 }}>
              <T weight="semi" style={{ fontSize: 14 }}>{quote.depositPercent >= 100 ? 'Pay in full to start' : 'Deposit to start'}</T>
              <T style={{ color: C.muted, fontSize: 13 }}>{quote.depositPercent >= 100 ? 'The whole total' : `${quote.depositPercent}% of the total`}</T>
            </View>
            <T weight="bold" style={{ fontSize: 20 }}>{formatCurrency(quote.depositAmount)}</T>
          </View>
          {quote.balance > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T style={{ color: C.muted, fontSize: 14.5 }}>Balance, before delivery</T>
              <T weight="semi" style={{ fontSize: 14.5 }}>{formatCurrency(quote.balance)}</T>
            </View>
          ) : null}
          {quote.readyIn ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T style={{ color: C.muted, fontSize: 14.5 }}>Ready in</T>
              <T weight="semi" style={{ fontSize: 14.5 }}>{quote.readyIn}</T>
            </View>
          ) : null}
        </Card>

        {quote.note ? (
          <Card style={{ padding: 16, gap: 6 }}>
            <SectionTitle>Note from {quote.businessName}</SectionTitle>
            <T style={{ color: C.body, fontSize: 14.5, lineHeight: 22 }}>{quote.note}</T>
          </Card>
        ) : null}

        {actionError ? <T style={{ color: C.error, fontSize: 13.5, textAlign: 'center' }}>{actionError}</T> : null}

        {declined ? (
          <View style={{ alignItems: 'center', gap: 6, padding: 18, borderRadius: 22, backgroundColor: C.closedBg }}>
            <T weight="bold" style={{ fontSize: 16 }}>Quote declined</T>
            <T style={{ color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{quote.businessName} has been told. Changed your mind?</T>
            <TextButton label="Reopen quote" color={C.limeInk} onPress={() => respond.mutate({ action: 'reopen' })} />
          </View>
        ) : closed ? (
          contactUrl ? <OutlineButton label={`Message ${quote.businessName}`} onPress={() => { void Linking.openURL(contactUrl); }} /> : null
        ) : declining ? (
          <View style={{ gap: 12, padding: 16, borderRadius: 22, backgroundColor: C.card, borderWidth: 1.5, borderColor: 'rgba(229,119,109,0.5)' }}>
            <T weight="bold" style={{ fontSize: 16 }}>Decline this quote?</T>
            <T style={{ color: C.muted, fontSize: 13, lineHeight: 20 }}>{quote.businessName} will be told. You can tell them why, which helps them make it right.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DECLINE_REASONS.map((reason) => (
                <Chip key={reason} label={reason} selected={declineReason === reason} onPress={() => setDeclineReason(reason)} />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => respond.mutate({ action: 'decline', reason: declineReason })}
              disabled={respond.isPending}
              style={{ height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink }}
            >
              <T weight="semi" style={{ color: C.page, fontSize: 15 }}>{respond.isPending ? 'Declining…' : 'Yes, decline'}</T>
            </Pressable>
            <TextButton label="Keep the quote" color={C.limeInk} onPress={() => setDeclining(false)} />
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            {waitingForDeposit ? (
              <PrimaryButton label={`Pay deposit · ${formatCurrency(quote.depositAmount)}`} onPress={() => setLocal(null)} />
            ) : (
              <PrimaryButton label="Accept quote" loading={respond.isPending} onPress={() => respond.mutate({ action: 'accept' })} />
            )}
            {!waitingForDeposit ? <OutlineButton label="Request changes" onPress={() => { setActionError(''); setLocal('changes'); }} /> : null}
            {!waitingForDeposit ? <TextButton label="Decline quote" onPress={() => setDeclining(true)} /> : null}
          </View>
        )}

        <Pressable
          disabled={!contactUrl}
          onPress={() => { if (contactUrl) void Linking.openURL(contactUrl); }}
          style={{ paddingTop: 4 }}
        >
          <T style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            {[validText, quote.businessPhone ? `Questions? WhatsApp ${quote.businessPhone}` : ''].filter(Boolean).join(' · ')}
          </T>
        </Pressable>
      </Sheet>
    </Frame>
  );
}

export default function QuotePublicScreen() {
  const { width } = useWindowDimensions();
  return (
    <ThemeContext.Provider value={width >= 700 ? DARK : LIGHT}>
      <QuotePublicInner />
    </ThemeContext.Provider>
  );
}
