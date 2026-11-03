import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Check, ChevronRight, Clock3, MapPin, Package } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_300Light, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import {
  confirmPublicOrderDelivery,
  fetchPublicTrackingBusiness,
  lookupPublicOrderTracking,
  sendDeliveryConfirmationResultEmail,
  type PublicOrderTrackingLookupResult,
} from '@/lib/supabase/public-tracking';
import { findOrderTrackingStageByName } from '@/lib/order-status';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { buildCustomerTrackingHostUrl } from '@/lib/tracking-url';
import { TrackLanding, type TrackLandingCopy } from '@/app/track';
import type { PublicTrackingBusinessMatch } from '@/lib/supabase/public-tracking';

const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');
const fyllFieldPhone = require('../../assets/fyll-field-phone.jpg');
const fyllFieldDesktop = require('../../assets/fyll-field-desktop.jpg');

// Same look as the tracking and payment pages: the Fyll Field on top, a soft sheet of cards below.
const PAGE_BG = '#F8F8F4';
const INK = '#1E1E1E';
const BODY = '#55564E';
const MUTED = '#6B6C63';
const LIME = '#D5E057';
const LIME_DEEP = '#3F4A08';
const LIME_TEXT = '#5F6A00';
const CARD_BORDER = 'rgba(30,30,30,0.08)';
const AMBER = '#A8741C';
const AMBER_SOFT = 'rgba(227,177,90,0.18)';
const DANGER = '#C2410C';
// The big headlines on the confirm page use a light Bricolage weight (300), lighter than the rest of the app.
const HEADLINE_FONT = 'BricolageGrotesque_300Light';
const DISPLAY_FONT = Platform.OS === 'web' ? "BricolageGrotesque_800ExtraBold, 'Arial Black', sans-serif" : 'BricolageGrotesque_800ExtraBold';
const DISPLAY_FONT_COMPACT = Platform.OS === 'web' ? "BricolageGrotesque_700Bold, 'Arial Black', sans-serif" : 'BricolageGrotesque_700Bold';
const BODY_FONT = Platform.OS === 'web' ? "DMSans_400Regular, system-ui, -apple-system, 'Segoe UI', sans-serif" : 'DMSans_400Regular';
const BODY_FONT_BOLD = 'DMSans_600SemiBold';

const CONFETTI_PIECES = [
  { x: -108, y: -10, rotate: '-28deg', color: '#16A34A' },
  { x: -74, y: -34, rotate: '18deg', color: '#F59E0B' },
  { x: -34, y: -62, rotate: '-16deg', color: '#0F1115' },
  { x: 18, y: -68, rotate: '14deg', color: '#22C55E' },
  { x: 62, y: -40, rotate: '-12deg', color: '#FBBF24' },
  { x: 98, y: -6, rotate: '24deg', color: '#1F2937' },
  { x: -92, y: 34, rotate: '20deg', color: '#A3E635' },
  { x: -44, y: 58, rotate: '-24deg', color: '#FACC15' },
  { x: 4, y: 72, rotate: '16deg', color: '#22C55E' },
  { x: 52, y: 52, rotate: '-18deg', color: '#111827' },
  { x: 90, y: 28, rotate: '26deg', color: '#4ADE80' },
  { x: 0, y: -96, rotate: '10deg', color: '#84CC16' },
];

const getParamValue = (value?: string | string[]) => (
  typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
);

const trimTransparentLogo = async (sourceUri: string): Promise<string> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return sourceUri;
  if (!sourceUri.startsWith('data:image/')) return sourceUri;

  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => {
      try {
        const sourceCanvas = document.createElement('canvas');
        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;

        if (!sourceWidth || !sourceHeight) {
          resolve(sourceUri);
          return;
        }

        sourceCanvas.width = sourceWidth;
        sourceCanvas.height = sourceHeight;
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });

        if (!sourceContext) {
          resolve(sourceUri);
          return;
        }

        sourceContext.drawImage(img, 0, 0);
        const { data } = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
        let minX = sourceWidth;
        let minY = sourceHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < sourceHeight; y += 1) {
          for (let x = 0; x < sourceWidth; x += 1) {
            const alpha = data[((y * sourceWidth + x) * 4) + 3];
            if (alpha <= 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (maxX < minX || maxY < minY) {
          resolve(sourceUri);
          return;
        }

        const padding = 2;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropWidth = Math.min(sourceWidth - cropX, maxX - minX + 1 + padding * 2);
        const cropHeight = Math.min(sourceHeight - cropY, maxY - minY + 1 + padding * 2);
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = cropWidth;
        trimmedCanvas.height = cropHeight;
        const trimmedContext = trimmedCanvas.getContext('2d');

        if (!trimmedContext) {
          resolve(sourceUri);
          return;
        }

        trimmedContext.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        resolve(trimmedCanvas.toDataURL('image/png'));
      } catch {
        resolve(sourceUri);
      }
    };
    img.onerror = () => resolve(sourceUri);
    img.src = sourceUri;
  });
};

const useTrimmedLogoUri = (sourceUri: string | null) => {
  const [trimmedUri, setTrimmedUri] = useState<string | null>(sourceUri);

  useEffect(() => {
    let isCancelled = false;
    setTrimmedUri(sourceUri);

    if (!sourceUri) {
      return () => {
        isCancelled = true;
      };
    }

    void trimTransparentLogo(sourceUri).then((nextUri) => {
      if (!isCancelled) {
        setTrimmedUri(nextUri);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [sourceUri]);

  return trimmedUri;
};

const useImageAspectRatio = (sourceUri: string | null) => {
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
      (width, height) => {
        if (!isCancelled && width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      () => {
        if (!isCancelled) {
          setAspectRatio(null);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [sourceUri]);

  return aspectRatio;
};

const normalizeExternalUrl = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

function ConfettiBurst() {
  const progress = React.useRef(CONFETTI_PIECES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, index) => (
      Animated.timing(value, {
        toValue: 1,
        duration: 900,
        delay: index * 24,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    ));

    Animated.parallel(animations).start();
  }, [progress]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -24,
        left: '50%',
        marginLeft: -8,
        width: 16,
        height: 16,
      }}
    >
      {CONFETTI_PIECES.map((piece, index) => {
        const opacity = progress[index].interpolate({
          inputRange: [0, 0.12, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });

        const translateY = progress[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.y],
        });

        const translateX = progress[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.x],
        });

        const scale = progress[index].interpolate({
          inputRange: [0, 0.18, 1],
          outputRange: [0.2, 1, 0.84],
        });

        return (
          <Animated.View
            key={`${piece.x}-${piece.y}-${index}`}
            style={{
              position: 'absolute',
              width: 8,
              height: 16,
              borderRadius: 999,
              backgroundColor: piece.color,
              opacity,
              transform: [
                { translateX },
                { translateY },
                { scale },
                { rotate: piece.rotate },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const GLASS_CARD = { borderRadius: 22, backgroundColor: 'rgba(20,20,20,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' } as const;
const CONFIRM_LANDING_COPY: TrackLandingCopy = {
  tag: 'Confirm',
  domain: 'confirm.fyll.app',
  headline: 'Confirm your delivery',
  headlineWide: 'Confirm your\ndelivery',
  sub: (businessName) => (businessName
    ? `Let ${businessName} know your order has arrived.`
    : 'Let the business you bought from know your order has arrived.'),
  steps: ['Find your order', 'Confirm delivery', 'Done'],
  formTitle: 'Your order details',
  formSub: (hasBusiness) => (hasBusiness ? 'Both details help us find the right order.' : 'Pick the business, then your order details.'),
  submit: 'Confirm delivery',
  submitting: 'Finding your order…',
  hint: 'Your order number is in your confirmation email and in the DM from the business.',
  headlineFont: HEADLINE_FONT,
};

const CARD = { borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: CARD_BORDER } as const;

function HeroHeader({
  wide,
  businessName,
  businessLogo,
  subline,
}: {
  wide: boolean;
  businessName: string;
  businessLogo: string | null;
  subline: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUri = useTrimmedLogoUri(businessLogo && !logoFailed ? businessLogo : null);
  useEffect(() => {
    setLogoFailed(false);
  }, [businessLogo]);

  const logoSize = wide ? 48 : 40;
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: wide ? 12 : 10 }}>
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            onError={() => setLogoFailed(true)}
            style={{ width: logoSize, height: logoSize, borderRadius: logoSize / 2, borderWidth: 2, borderColor: LIME, backgroundColor: '#FFFFFF' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ width: logoSize, height: logoSize, borderRadius: logoSize / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: LIME }}>
            <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: 16, color: INK }}>{(businessName.trim()[0] ?? 'F').toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: BODY_FONT_BOLD, fontSize: wide ? 17 : 15, color: '#FFFFFF' }}>{businessName}</Text>
          <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontSize: wide ? 13 : 12, color: 'rgba(244,244,239,0.75)' }}>{subline}</Text>
        </View>
      </View>
      <View style={{ height: wide ? 34 : 30, paddingHorizontal: wide ? 14 : 12, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
        <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: wide ? 12.5 : 11.5, color: '#EEF2C4' }}>Delivery check</Text>
      </View>
    </View>
  );
  return header;
}

function Hero({
  compact,
  wide,
  businessName,
  businessLogo,
  subline,
  eyebrow,
  headline,
  sub,
  summary,
  bare,
}: {
  compact: boolean;
  wide: boolean;
  // Wide screens put the Field behind the whole page, so the hero only brings its text.
  bare?: boolean;
  businessName: string;
  businessLogo: string | null;
  subline: string;
  eyebrow: string;
  headline: string;
  sub: string;
  // Wide screens show the order on the Field itself, on a frosted pane; phones show it as a card below.
  summary?: { title: string; subtitle: string } | null;
}) {
  const header = <HeroHeader wide={wide} businessName={businessName} businessLogo={businessLogo} subline={subline} />;

  const heading = (
    <View style={{ gap: wide ? 12 : 8, maxWidth: wide ? 520 : undefined }}>
      <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: wide ? 17 : 15, color: 'rgba(244,244,239,0.9)' }}>{eyebrow}</Text>
      <Text
        style={{
          fontFamily: HEADLINE_FONT,
          fontWeight: '400',
          fontSize: wide ? 56 : 36,
          lineHeight: wide ? 56 : 37,
          letterSpacing: wide ? -1.8 : -1.1,
          color: '#FFFFFF',
        }}
      >
        {headline}
      </Text>
      <Text style={{ fontFamily: BODY_FONT, fontSize: wide ? 16 : 14, lineHeight: wide ? 23 : 20, color: 'rgba(244,244,239,0.85)' }}>{sub}</Text>
      {wide && summary ? (
        <View
          style={[
            { marginTop: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 16, borderRadius: 18, backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
            Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : null,
          ]}
        >
          <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Package size={22} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: BODY_FONT_BOLD, fontSize: 15, color: '#FFFFFF' }}>{summary.title}</Text>
            <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontSize: 13, color: 'rgba(244,244,239,0.75)' }}>{summary.subtitle}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  if (bare && !wide) {
    return (
      <View style={{ flexGrow: 1, minHeight: compact ? 360 : 560, paddingHorizontal: compact ? 20 : 40, paddingTop: compact ? 30 : 48, paddingBottom: compact ? 36 : 56 }}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 36 }}>{heading}</View>
      </View>
    );
  }

  if (bare) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 56, paddingTop: 40, paddingBottom: 56 }}>
        {header}
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>{heading}</View>
      </View>
    );
  }

  return (
    <ImageBackground
      source={wide ? fyllFieldDesktop : fyllFieldPhone}
      resizeMode="cover"
      style={[{ overflow: 'hidden', backgroundColor: '#3F4A08' }, wide ? { flex: 1 } : null]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={wide ? ['rgba(20,20,20,0.3)', 'rgba(20,20,20,0.05)', 'rgba(20,20,20,0.55)'] : ['rgba(20,20,20,0.25)', 'rgba(20,20,20,0.1)', 'rgba(20,20,20,0.3)']}
        locations={wide ? [0, 0.45, 1] : [0, 0.6, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView edges={['top']} style={wide ? { flex: 1 } : undefined}>
        {wide ? (
          <View style={{ flex: 1, paddingHorizontal: 56, paddingTop: 40, paddingBottom: 56, justifyContent: 'space-between' }}>
            {header}
            {heading}
          </View>
        ) : (
          <View style={{ width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 104, gap: 34 }}>
            {header}
            {heading}
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

function LimePill({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({ height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#E1EB6B' : LIME, opacity: disabled ? 0.6 : 1 })}
    >
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: INK }}>{label}</Text>
    </Pressable>
  );
}

function ChoiceRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  primary,
  glass,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  glass?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: primary ? LIME : glass ? 'rgba(255,255,255,0.22)' : CARD_BORDER,
        backgroundColor: primary ? (pressed ? '#E1EB6B' : LIME) : glass ? (pressed ? 'rgba(20,20,20,0.6)' : 'rgba(20,20,20,0.45)') : '#FFFFFF',
        opacity: disabled ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? 'rgba(30,30,30,0.1)' : glass ? 'rgba(245,201,118,0.22)' : AMBER_SOFT }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: glass && !primary ? '#F4F4EF' : INK }}>{title}</Text>
        <Text style={{ fontFamily: BODY_FONT, fontSize: 13, color: primary ? LIME_DEEP : glass ? 'rgba(244,244,239,0.82)' : MUTED }}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={primary ? INK : glass ? 'rgba(244,244,239,0.8)' : '#9A9B90'} strokeWidth={2.2} />
    </Pressable>
  );
}

export default function ConfirmDeliveryScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    order_id?: string | string[];
    email?: string | string[];
    businessSlug?: string | string[];
  }>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const {
    businessName: localBusinessName,
    companyName: localCompanyName,
    businessLogo: localBusinessLogo,
  } = useBusinessSettings();

  const [issueView, setIssueView] = useState(false);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const initialCode = getParamValue(params.code) || getParamValue(params.order_id);
  const initialEmail = getParamValue(params.email);
  const routeBusinessSlug = getParamValue(params.businessSlug);
  // A business can be picked on the landing page when the link does not name one.
  const [pickedBusiness, setPickedBusiness] = useState<PublicTrackingBusinessMatch | null>(null);
  const businessSlug = routeBusinessSlug || pickedBusiness?.slug || '';

  const publicBusinessQuery = useQuery({
    queryKey: ['public-confirm-delivery-business', businessSlug],
    queryFn: () => fetchPublicTrackingBusiness(businessSlug),
    enabled: businessSlug.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const localBusinessQuery = useQuery({
    queryKey: ['local-confirm-delivery-business', businessId],
    queryFn: async () => {
      if (!businessId) return null;
      const { data, error } = await supabase
        .from('businesses')
        .select('name,data')
        .eq('id', businessId)
        .maybeSingle();

      if (error) throw error;

      const businessData = (data?.data ?? {}) as Record<string, unknown>;
      const queriedBusinessName = typeof businessData.businessName === 'string' && businessData.businessName.trim()
        ? businessData.businessName.trim()
        : typeof data?.name === 'string'
          ? data.name
          : '';
      const queriedBusinessLogo = typeof businessData.businessLogo === 'string' && businessData.businessLogo.trim()
        ? businessData.businessLogo.trim()
        : null;
      const queriedBusinessWebsite = typeof businessData.businessWebsite === 'string' && businessData.businessWebsite.trim()
        ? businessData.businessWebsite.trim()
        : null;

      return {
        businessName: queriedBusinessName,
        businessLogo: queriedBusinessLogo,
        businessWebsite: queriedBusinessWebsite,
      };
    },
    enabled: Boolean(businessId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const [lookupCode, setLookupCode] = useState<string>(initialCode);
  const [lookupEmail, setLookupEmail] = useState<string>(initialEmail);
  const [showCelebration, setShowCelebration] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<'received' | 'pending' | null>(null);

  const lookupMutation = useMutation<PublicOrderTrackingLookupResult | null, Error, { code: string; email: string }>({
    mutationFn: ({ code, email }) => lookupPublicOrderTracking({
      trackingCode: code,
      email,
      businessSlug: businessSlug || null,
    }),
    onMutate: () => {
      setLookupFeedback(null);
      setResponseMessage(null);
      setHasSearched(true);
      setSubmissionResult(null);
    },
    onError: () => {
      setLookupFeedback('Delivery confirmation is temporarily unavailable. Please try again shortly.');
    },
  });

  const runLookup = lookupMutation.mutate;

  useEffect(() => {
    if (!initialCode.trim() || !initialEmail.trim()) return;
    runLookup({ code: initialCode, email: initialEmail });
  }, [initialCode, initialEmail, runLookup]);

  const order = lookupMutation.data?.order ?? null;
  const businessName = lookupMutation.data?.businessName?.trim()
    || publicBusinessQuery.data?.businessName?.trim()
    || localBusinessQuery.data?.businessName?.trim()
    || localBusinessName.trim()
    || localCompanyName.trim()
    || 'Fyll';
  const businessLogo = lookupMutation.data?.businessLogo
    ?? publicBusinessQuery.data?.businessLogo
    ?? localBusinessQuery.data?.businessLogo
    ?? localBusinessLogo
    ?? null;
  const businessWebsite = normalizeExternalUrl(
    lookupMutation.data?.businessWebsite
    ?? publicBusinessQuery.data?.businessWebsite
    ?? localBusinessQuery.data?.businessWebsite
  );
  const displayOrderId = order?.websiteOrderReference || order?.orderNumber || lookupCode;
  const trackingStage = findOrderTrackingStageByName(order?.status, lookupMutation.data?.orderStatuses ?? []);
  const isDelivered = trackingStage === 'delivered' || order?.deliveryConfirmationStatus === 'confirmed';

  const identityRows = useMemo(() => ([
    { label: 'Customer', value: order?.customerName || 'Unknown customer' },
    { label: 'Email', value: order?.customerEmail || lookupEmail },
    { label: 'Order', value: displayOrderId || '-' },
  ]), [displayOrderId, lookupEmail, order?.customerEmail, order?.customerName]);

  const handleSearch = () => {
    const normalizedCode = lookupCode.trim().toUpperCase();
    const normalizedEmail = lookupEmail.trim().toLowerCase();

    if (!normalizedCode || !normalizedEmail) {
      setLookupFeedback('Enter your order reference and email to continue.');
      setHasSearched(true);
      return;
    }

    runLookup({ code: normalizedCode, email: normalizedEmail });
  };

  const updateMutation = useMutation({
    mutationFn: async (received: boolean) => confirmPublicOrderDelivery({
      trackingCode: lookupCode.trim(),
      email: lookupEmail.trim(),
      businessSlug: businessSlug || null,
      received,
    }),
    onSuccess: async (result, received) => {
      queryClient.setQueryData(['confirm-delivery-order', lookupCode, lookupEmail, businessSlug], result);
      setSubmissionResult(received ? 'received' : 'pending');
      setResponseMessage(
        received
          ? 'Thanks. Your delivery has been confirmed.'
          : 'Thanks. We have marked this order as Pending Delivery and the business will keep following up on it.'
      );
      setShowCelebration(received);
      void sendDeliveryConfirmationResultEmail({
        trackingCode: lookupCode.trim(),
        email: lookupEmail.trim(),
        businessSlug: businessSlug || null,
        received,
      }).catch((error) => {
        console.warn('Failed to send delivery confirmation result email:', error);
      });
      try {
        await Haptics.notificationAsync(
          received ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
        );
      } catch {}
    },
    onError: async () => {
      setResponseMessage('Could not update delivery right now. Please try again shortly.');
      setShowCelebration(false);
      setSubmissionResult(null);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
    },
  });

  const showLookupScreen = !order && !lookupMutation.isPending;
  const showLoadingState = lookupMutation.isPending && !order;
  const showDeliveredState = submissionResult === 'received' || (Boolean(order) && isDelivered && submissionResult !== 'pending');
  const showPendingState = submissionResult === 'pending';
  const showDecisionState = Boolean(order) && !isDelivered && submissionResult === null;
  const headerBrandLabel = businessName || 'Fyll';
  const handleContinueShopping = async () => {
    if (!businessWebsite) return;
    try {
      await Linking.openURL(businessWebsite);
    } catch {}
  };


  const trackUrl = order
    ? buildCustomerTrackingHostUrl({
      businessName,
      businessSlug: lookupMutation.data?.businessSlug || businessSlug || null,
      trackingCode: lookupCode.trim(),
      email: lookupEmail.trim(),
    })
    : null;
  const handleTrackOrder = async () => {
    if (!trackUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = trackUrl;
      return;
    }
    try {
      await Linking.openURL(trackUrl);
    } catch {}
  };
  const whatsappDigits = (lookupMutation.data?.businessPhone ?? '').replace(/[^0-9]/g, '');
  const handleMessageBusiness = async () => {
    if (!whatsappDigits) return;
    try {
      await Linking.openURL(`https://wa.me/${whatsappDigits}`);
    } catch {}
  };
  const wide = width >= 1000;

  const [fontsLoaded] = useFonts({ BricolageGrotesque_300Light, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold });
  void fontsLoaded;

  const firstName = (order?.customerName ?? '').trim().split(/\s+/)[0] ?? '';
  // Hide payment labels (Fyll Checkout, how they paid) that some orders carry as an item or variant name.
  const isPaymentLabel = (value?: string) => /checkout|paid|payment/i.test(value ?? '');
  const orderItems = (order?.items ?? []).filter((item) => !isPaymentLabel(item.productName));
  const firstItem = orderItems[0];
  const firstVariant = firstItem?.variantName && !isPaymentLabel(firstItem.variantName) ? firstItem.variantName : '';
  const itemsTitle = firstItem
    ? `${firstItem.productName ?? 'Your order'}${firstVariant ? ` \u00b7 ${firstVariant}` : ''}${orderItems.length > 1 ? ` + ${orderItems.length - 1} more` : ''}`
    : `Order ${displayOrderId}`;
  const dispatchRaw = order?.logistics?.dispatchDate;
  const dispatchDate = dispatchRaw && !Number.isNaN(new Date(dispatchRaw).getTime())
    ? new Date(dispatchRaw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;
  const itemsSubtitle = [dispatchDate ? `Dispatched ${dispatchDate}` : null, order?.deliveryState || null].filter(Boolean).join(' \u00b7 ') || `Order ${displayOrderId}`;

  const showIssueState = showDecisionState && issueView;
  const hero = showIssueState
    ? { eyebrow: firstName ? `Thanks, ${firstName}` : 'Thanks', headline: 'Sorry about that', sub: `Let ${businessName} know what went wrong.` }
    : showLoadingState
    ? { eyebrow: 'One moment', headline: 'Finding your order', sub: 'This only takes a second.' }
    : showLookupScreen
      ? { eyebrow: 'Delivery check', headline: 'Confirm your order', sub: 'Enter your order number and billing email to continue.' }
      : showDeliveredState
        ? { eyebrow: 'Delivered', headline: firstName ? `Enjoy your order, ${firstName}!` : 'Enjoy your order!', sub: 'Thanks for confirming.' }
        : showPendingState
          ? { eyebrow: firstName ? `Thanks, ${firstName}` : 'Thanks', headline: "We're on it", sub: `${businessName} has been told.` }
          : { eyebrow: 'Quick question', headline: firstName ? `Have you received your order, ${firstName}?` : 'Have you received your order?', sub: `Tell us if ${businessName} has delivered it to you.` };

  const continueShopping = businessWebsite ? <LimePill label="Continue shopping" onPress={handleContinueShopping} /> : null;
  const messageText = responseMessage ? (
    <Text style={{ textAlign: 'center', fontFamily: BODY_FONT, fontSize: 12, lineHeight: 18, color: 'rgba(244,244,239,0.8)' }}>{responseMessage}</Text>
  ) : null;

  const summary = showDecisionState && !issueView ? { title: itemsTitle, subtitle: itemsSubtitle } : null;
  const trackButton = trackUrl ? (
    <Pressable
      onPress={handleTrackOrder}
      accessibilityRole="button"
      style={({ pressed }) => ({ height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: pressed ? 'rgba(20,20,20,0.6)' : 'rgba(20,20,20,0.45)' })}
    >
      <MapPin size={17} color="#F4F4EF" strokeWidth={2} />
      <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: 15, color: '#F4F4EF' }}>Track my order</Text>
    </Pressable>
  ) : null;
  const whatsappButton = whatsappDigits ? (
    <Pressable
      onPress={handleMessageBusiness}
      accessibilityRole="button"
      style={({ pressed }) => ({ height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#E1EB6B' : LIME })}
    >
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: INK }}>Message {businessName} on WhatsApp</Text>
    </Pressable>
  ) : null;

  const glass = true;
  const cardSurface = glass ? GLASS_CARD : CARD;
  const textInk = glass ? '#F4F4EF' : INK;
  const textBody = glass ? 'rgba(244,244,239,0.8)' : BODY;
  const body = (
    <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', flexGrow: wide ? 0 : 1, gap: 12 }}>
      {showDecisionState && !issueView ? (
        <>
          {wide ? (
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -0.3, color: textInk, marginBottom: 4 }}>Let {businessName} know</Text>
          ) : (
            <View style={[cardSurface, { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}>
                <Package size={22} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontFamily: BODY_FONT_BOLD, fontSize: 14.5, color: '#FFFFFF' }}>{itemsTitle}</Text>
                <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontSize: 13, color: 'rgba(244,244,239,0.78)' }}>{itemsSubtitle}</Text>
              </View>
            </View>
          )}

          <View style={{ gap: 10, marginTop: 4 }}>
            <ChoiceRow
              primary
              icon={<Check size={20} color={INK} strokeWidth={2.8} />}
              title="Yes, I have it"
              subtitle="Everything arrived"
              onPress={() => updateMutation.mutate(true)}
              disabled={updateMutation.isPending}
            />
            <ChoiceRow
              glass={glass}
              icon={<Clock3 size={20} color={glass ? '#F5C976' : AMBER} strokeWidth={2.2} />}
              title="Not yet"
              subtitle="I'm still waiting"
              onPress={() => updateMutation.mutate(false)}
              disabled={updateMutation.isPending}
            />
          </View>
          {trackButton}
          <Pressable onPress={() => setIssueView(true)} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: 14.5, color: glass ? LIME : LIME_TEXT }}>It arrived, but something's wrong</Text>
          </Pressable>
          {messageText}
        </>
      ) : null}

      {showIssueState ? (
        <>
          <View style={[cardSurface, { padding: 16, gap: 6 }]}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: textInk }}>Tell them what happened</Text>
            <Text style={{ fontFamily: BODY_FONT, fontSize: 14, lineHeight: 21, color: textBody }}>
              Send a message with a photo of the problem and {businessName} will sort it out with you.
            </Text>
          </View>
          {whatsappButton}
          {trackButton}
          <Pressable onPress={() => setIssueView(false)} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <Text style={{ fontFamily: BODY_FONT_BOLD, fontSize: 14.5, color: glass ? LIME : LIME_TEXT }}>Back</Text>
          </Pressable>
        </>
      ) : null}

      {showPendingState ? (
        <>
          <View style={[cardSurface, { padding: 16, gap: 6 }]}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: textInk }}>What happens now</Text>
            <Text style={{ fontFamily: BODY_FONT, fontSize: 14, lineHeight: 21, color: textBody }}>
              We have marked this order as Pending Delivery and {businessName} will keep following up. Deliveries outside Lagos may take up to 7 days, and you will get an update by email shortly.
            </Text>
          </View>
          {whatsappButton}
          {trackButton}
          {continueShopping}
          {messageText}
        </>
      ) : null}

      {showDeliveredState ? (
        <>
          <View style={[cardSurface, { padding: 22, alignItems: 'center', gap: 12 }]}>
            {showCelebration ? <ConfettiBurst /> : null}
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: LIME }}>
              <Check size={30} color={INK} strokeWidth={2.8} />
            </View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: textInk }}>Delivery confirmed</Text>
            <Text style={{ textAlign: 'center', fontFamily: BODY_FONT, fontSize: 14, lineHeight: 21, color: textBody }}>
              We have updated your order to Delivered. Thank you for shopping with {businessName}.
            </Text>
          </View>
          {continueShopping}
          {trackButton}
          {messageText}
        </>
      ) : null}

      {wide ? null : (
      <View style={{ marginTop: 'auto', paddingTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: 'rgba(244,244,239,0.7)' }}>Powered by</Text>
        <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 15 * (344 / 195), height: 15, tintColor: '#FFFFFF' }} />
      </View>
      )}
    </View>
  );

  const heroNode = (
    <Hero
      compact={compact}
      wide={wide}
      businessName={businessName}
      businessLogo={businessLogo}
      subline={order ? `Order ${displayOrderId}` : 'Delivery confirmation'}
      eyebrow={hero.eyebrow}
      headline={hero.headline}
      sub={hero.sub}
      summary={summary}
      bare
    />
  );

  if (showLookupScreen || showLoadingState) {
    // The same landing page as track.fyll.app. A business sharing its own link gets its name and logo in the form.
    const landingBusiness = routeBusinessSlug
      ? { name: businessName, logo: businessLogo }
      : pickedBusiness
        ? { name: pickedBusiness.name, logo: pickedBusiness.logo }
        : null;
    const handleChangeBusiness = () => {
      if (!routeBusinessSlug) {
        setPickedBusiness(null);
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign('/');
    };
    return (
      <TrackLanding
        business={landingBusiness}
        onChangeBusiness={handleChangeBusiness}
        onPickBusiness={setPickedBusiness}
        code={lookupCode}
        onChangeCode={setLookupCode}
        email={lookupEmail}
        onChangeEmail={setLookupEmail}
        onSubmit={handleSearch}
        pending={lookupMutation.isPending}
        openingDeepLink={Boolean(initialCode.trim() && initialEmail.trim())}
        feedback={lookupFeedback ?? (hasSearched && !lookupMutation.isPending && !order ? 'No order matched that number and email. Check both and try again.' : null)}
        copy={CONFIRM_LANDING_COPY}
        sheet
        split
        lockBusiness={Boolean(routeBusinessSlug)}
      />
    );
  }

  if (wide) {
    return (
      <ImageBackground source={fyllFieldDesktop} resizeMode="cover" style={{ flex: 1, backgroundColor: '#3F4A08' }}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(20,20,20,0.3)', 'rgba(20,20,20,0.05)', 'rgba(20,20,20,0.55)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SafeAreaView edges={['top']} style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>{heroNode}</View>
          <View
            style={[
              { flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(20,20,20,0.42)' },
              Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as object) : null,
            ]}
          >
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 72, paddingVertical: 40 }}>
              {body}
            </ScrollView>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 32 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: 'rgba(244,244,239,0.7)' }}>Powered by</Text>
        <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 15 * (344 / 195), height: 15, tintColor: '#FFFFFF' }} />
      </View>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // Phones: the same Field and glass as the first screen. The heading sits on the Field and the answers are in a glass
  // sheet fixed to the bottom.
  return (
    <ImageBackground source={fyllFieldPhone} resizeMode="cover" style={{ flex: 1, backgroundColor: '#3F4A08' }}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(20,20,20,0.25)', 'rgba(20,20,20,0.08)', 'rgba(20,20,20,0.45)']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          {heroNode}
          <View
            style={[
              { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(34,36,26,0.78)', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 38 },
              Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as object) : null,
            ]}
          >
            {body}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}
