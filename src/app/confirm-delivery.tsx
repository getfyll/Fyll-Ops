import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
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
import { ArrowRight, Check, CheckCircle2, Clock3 } from 'lucide-react-native';
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
import { CustomerAccountPromptCard } from '@/components/public/CustomerAccountPromptCard';

const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');
const fyllCombinationPng = require('../../assets/Group 20fyll combination.png');

const PAGE_BG = '#FFFFFF';
const SURFACE = '#FFFFFF';
const SURFACE_BORDER = '#EEF2F7';
const MUTED = '#97A3BB';
const BODY = '#6D778B';
const HEADING = '#1A2440';
const FYLL_BLACK = '#0F1115';
const FYLL_BLACK_SOFT = '#F3F5F8';
const AMBER = '#E2A12A';
const AMBER_SOFT = '#FFF7E3';
const GREEN = '#16A34A';
const GREEN_SOFT = '#EBF8F0';

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

function PublicFooter({ compact }: { compact: boolean }) {
  return (
    <View
      style={{
        width: '100%',
        marginTop: 'auto',
        borderTopWidth: 1,
        borderTopColor: '#E8EDF5',
      }}
    >
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: compact ? 8 : 10,
            flex: compact ? 0.7 : 1,
          }}
        >
          <Text style={{ color: MUTED, fontSize: 12, fontWeight: '500' }}>Powered by</Text>
          <Image
            source={fyllCombinationPng}
            resizeMode="contain"
            style={{ width: compact ? 74 : 92, height: compact ? 20 : 24 }}
          />
        </View>
        <Text
          style={{
            color: MUTED,
            fontSize: compact ? 12 : 13,
            lineHeight: compact ? 18 : 19,
            textAlign: 'right',
            flex: compact ? 0.3 : undefined,
          }}
        >
          © Fyll 2026
        </Text>
      </View>
    </View>
  );
}

function PublicHeader({
  compact,
  brandLabel,
  brandLogo,
  rightContent,
}: {
  compact: boolean;
  brandLabel: string;
  brandLogo?: string | null;
  rightContent: React.ReactNode;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const trimmedBrandLogo = useTrimmedLogoUri(brandLogo && !logoFailed ? brandLogo : null);
  const brandLogoAspectRatio = useImageAspectRatio(trimmedBrandLogo);
  const businessHeaderMaxWidth = compact ? 160 : 220;
  const businessLogoHeight = compact ? 30 : 36;
  const businessHeaderWidth = Math.min(
    businessHeaderMaxWidth,
    businessLogoHeight * (brandLogoAspectRatio ?? 2.8)
  );

  useEffect(() => {
    setLogoFailed(false);
  }, [brandLogo]);

  return (
    <View style={{ width: '100%', borderBottomWidth: 1, borderBottomColor: '#E8EDF5' }}>
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
        <View
          style={{
            width: businessHeaderMaxWidth,
            alignItems: 'flex-start',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {trimmedBrandLogo ? (
            <View
              style={{
                width: businessHeaderWidth,
                height: businessLogoHeight,
                overflow: 'hidden',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: trimmedBrandLogo }}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
                style={[
                  {
                    width: businessHeaderWidth,
                    height: businessLogoHeight,
                    backgroundColor: 'transparent',
                  },
                  Platform.OS === 'web'
                    ? ({ objectFit: 'contain', objectPosition: 'left center' } as any)
                    : null,
                ]}
              />
            </View>
          ) : (
            <Text
              numberOfLines={1}
              style={{ color: FYLL_BLACK, fontSize: compact ? 16 : 20, fontWeight: '600' }}
            >
              {brandLabel}
            </Text>
          )}
        </View>
        {rightContent}
      </View>
    </View>
  );
}

type LookupCardProps = {
  businessName: string;
  lookupCode: string;
  lookupEmail: string;
  lookupMutationPending: boolean;
  lookupFeedback: string | null;
  hasSearched: boolean;
  hasOrder: boolean;
  onLookupCodeChange: (value: string) => void;
  onLookupEmailChange: (value: string) => void;
  onSearch: () => void;
  compact: boolean;
};

type ChoiceCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
  accentColor: string;
  accentBackground: string;
  hoverBackground: string;
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

function LookupCard({
  businessName,
  lookupCode,
  lookupEmail,
  lookupMutationPending,
  lookupFeedback,
  hasSearched,
  hasOrder,
  onLookupCodeChange,
  onLookupEmailChange,
  onSearch,
  compact,
}: LookupCardProps) {
  return (
    <>
      <View
        style={{
          width: '100%',
          maxWidth: 540,
          alignSelf: 'center',
          borderRadius: 30,
          borderWidth: 1,
          borderColor: '#E9E5DD',
          backgroundColor: SURFACE,
          paddingHorizontal: compact ? 22 : 28,
          paddingVertical: compact ? 28 : 34,
        }}
      >
        <View>
          <Text
            style={{
              marginBottom: 12,
              fontSize: 14,
              fontWeight: '500',
              color: '#7A7A7A',
            }}
          >
            Order number
          </Text>
          <TextInput
            value={lookupCode}
            onChangeText={onLookupCodeChange}
            placeholder="e.g. 47249"
            placeholderTextColor="#A3A3A3"
            autoCapitalize="characters"
            style={{
              minHeight: 56,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#E9E5DD',
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 20,
              fontSize: 16,
              color: HEADING,
            }}
          />

          <Text
            style={{
              marginTop: 24,
              marginBottom: 12,
              fontSize: 14,
              fontWeight: '500',
              color: '#7A7A7A',
            }}
          >
            Billing email
          </Text>
          <TextInput
            value={lookupEmail}
            onChangeText={onLookupEmailChange}
            placeholder="name@email.com"
            placeholderTextColor="#A3A3A3"
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              minHeight: 56,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#E9E5DD',
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 20,
              fontSize: 16,
              color: HEADING,
            }}
          />

          <Pressable
            onPress={onSearch}
            disabled={lookupMutationPending}
            style={{
              marginTop: 28,
              minHeight: 54,
              borderRadius: 999,
              backgroundColor: FYLL_BLACK,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: lookupMutationPending ? 0.6 : 1,
            }}
          >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '500',
              color: '#FFFFFF',
            }}
          >
            {lookupMutationPending ? 'Loading...' : 'Confirm Delivery'}
            </Text>
          </Pressable>

          {lookupFeedback ? (
            <Text style={{ marginTop: 14, textAlign: 'center', color: '#C2410C', fontSize: 13, lineHeight: 20 }}>
              {lookupFeedback}
            </Text>
          ) : null}

          {hasSearched && !lookupMutationPending && !hasOrder && !lookupFeedback ? (
            <Text style={{ marginTop: 14, textAlign: 'center', color: '#C2410C', fontSize: 13, lineHeight: 20 }}>
              No order matched that order reference and email.
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={{
          marginTop: 12,
          textAlign: 'center',
          fontSize: 12,
          lineHeight: 18,
          color: '#7A7A7A',
        }}
      >
        We only use this information to identify the right order and record your delivery response for {businessName}.
      </Text>
      <View style={{ width: '100%', maxWidth: 540, alignSelf: 'center', marginTop: 18 }}>
        <CustomerAccountPromptCard compact={compact} />
      </View>
    </>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  accentColor,
  accentBackground,
  hoverBackground,
}: ChoiceCardProps) {
  const { width } = useWindowDimensions();
  const compact = width < 768;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }) => ({
        width: '100%',
        maxWidth: 430,
        minHeight: compact ? 88 : 94,
        borderRadius: 26,
        borderWidth: 1.2,
        borderColor: hovered ? accentColor : '#E8EDF5',
        backgroundColor: hovered ? hoverBackground : SURFACE,
        paddingHorizontal: compact ? 20 : 24,
        paddingVertical: compact ? 18 : 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: disabled ? 0.65 : 1,
        transform: [{ scale: pressed ? 0.995 : 1 }],
      })}
    >
      {({ hovered }) => (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: compact ? 48 : 52,
                height: compact ? 48 : 52,
                borderRadius: 999,
                backgroundColor: accentBackground,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: compact ? 14 : 16,
              }}
            >
              {icon}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: HEADING }}>
                {title}
              </Text>
              <Text
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  fontWeight: '500',
                  letterSpacing: 1.1,
                  color: MUTED,
                  textTransform: 'uppercase',
                }}
              >
                {subtitle}
              </Text>
            </View>
          </View>
          <ArrowRight size={18} color={hovered ? accentColor : '#A8B3C5'} strokeWidth={2.1} />
        </>
      )}
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

  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const initialCode = getParamValue(params.code) || getParamValue(params.order_id);
  const initialEmail = getParamValue(params.email);
  const businessSlug = getParamValue(params.businessSlug);

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
  const lookupHeaderAction = (
    <View
      style={{
        minHeight: compact ? 42 : 50,
        paddingHorizontal: compact ? 16 : 22,
        borderRadius: 999,
        backgroundColor: FYLL_BLACK,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: compact ? 13 : 15, fontWeight: '500' }}>
        Delivery confirmation
      </Text>
    </View>
  );
  const orderHeaderAction = (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#DCE5F3',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          fontSize: compact ? 12 : 12,
          fontWeight: '700',
          letterSpacing: compact ? 1.1 : 1.8,
          color: FYLL_BLACK,
        }}
      >
        ORDER #{displayOrderId}
      </Text>
    </View>
  );
  const handleContinueShopping = async () => {
    if (!businessWebsite) return;
    try {
      await Linking.openURL(businessWebsite);
    } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <PublicHeader
        compact={compact}
        brandLabel={headerBrandLabel}
        brandLogo={businessLogo}
        rightContent={showLookupScreen || showLoadingState ? lookupHeaderAction : orderHeaderAction}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: compact ? 24 : 28,
          paddingTop: compact ? 32 : 38,
          paddingBottom: compact ? 36 : 44,
        }}
      >
        {showLookupScreen ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 34 }}>
              <Text
                style={{
                  fontSize: compact ? 28 : 34,
                  lineHeight: compact ? 34 : 40,
                  color: '#111111',
                  textAlign: 'center',
                  fontWeight: '600',
                }}
              >
                Confirm your order
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  maxWidth: 360,
                  fontSize: compact ? 13 : 15,
                  lineHeight: compact ? 19 : 22,
                  color: '#7A7A7A',
                  textAlign: 'center',
                  fontWeight: '400',
                }}
              >
                Enter your order number and billing email to open the delivery confirmation page.
              </Text>
            </View>
            <LookupCard
              businessName={businessName}
              lookupCode={lookupCode}
              lookupEmail={lookupEmail}
              lookupMutationPending={lookupMutation.isPending}
              lookupFeedback={lookupFeedback}
              hasSearched={hasSearched}
              hasOrder={Boolean(order)}
              onLookupCodeChange={setLookupCode}
              onLookupEmailChange={setLookupEmail}
              onSearch={handleSearch}
              compact={compact}
            />
          </View>
        ) : null}

        {showLoadingState ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={FYLL_BLACK} />
            <Text style={{ marginTop: 14, fontSize: 16, color: BODY }}>Loading order…</Text>
          </View>
        ) : null}

        {showDecisionState ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 20,
                  lineHeight: 26,
                  color: HEADING,
                  textAlign: 'center',
                  fontWeight: '600',
                }}
              >
                Hi, {order?.customerName}
              </Text>
              <Text
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  lineHeight: 18,
                  color: BODY,
                  textAlign: 'center',
                  maxWidth: 360,
                }}
              >
                It&apos;s been a few days. Has your order arrived?
              </Text>

              <View style={{ marginTop: 40, width: '100%', alignItems: 'center', gap: 16 }}>
                <ChoiceCard
                  icon={<CheckCircle2 size={24} color={GREEN} strokeWidth={2.2} />}
                  title="Yes, I have it"
                  subtitle="Everything is perfect"
                  onPress={() => updateMutation.mutate(true)}
                  disabled={updateMutation.isPending}
                  accentColor={GREEN}
                  accentBackground={GREEN_SOFT}
                  hoverBackground="#F3FBF5"
                />
                <ChoiceCard
                  icon={<Clock3 size={24} color={AMBER} strokeWidth={2.2} />}
                  title="No, not yet"
                  subtitle="I am still waiting"
                  onPress={() => updateMutation.mutate(false)}
                  disabled={updateMutation.isPending}
                  accentColor={AMBER}
                  accentBackground={AMBER_SOFT}
                  hoverBackground="#FFF9EC"
                />
              </View>

              {responseMessage ? (
                <Text
                  style={{
                    marginTop: 18,
                    textAlign: 'center',
                    color: BODY,
                    fontSize: 12,
                    lineHeight: 18,
                    maxWidth: 460,
                  }}
                >
                  {responseMessage}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {showPendingState ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 999,
                  backgroundColor: '#FFF9EC',
                  borderWidth: 1,
                  borderColor: '#F6DC97',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock3 size={36} color={AMBER} strokeWidth={2.2} />
              </View>

              <Text
                style={{
                  marginTop: 30,
                  fontSize: 20,
                  lineHeight: 26,
                  color: HEADING,
                  textAlign: 'center',
                  fontWeight: '500',
                }}
              >
                Status Updated
              </Text>
              <Text
                style={{
                  marginTop: 16,
                  maxWidth: 480,
                  textAlign: 'center',
                  fontSize: 12,
                  lineHeight: 18,
                  color: BODY,
                }}
              >
                We have marked this order as Pending Delivery. The business will keep following up on it.
              </Text>

              <View
                style={{
                  marginTop: 34,
                  width: '100%',
                  maxWidth: 540,
                  borderRadius: 26,
                  borderWidth: 1,
                  borderColor: '#E6ECF5',
                  backgroundColor: SURFACE,
                  paddingHorizontal: 22,
                  paddingVertical: 22,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: HEADING, marginBottom: 12 }}>
                  NOTE
                </Text>
                <Text style={{ fontSize: 12, lineHeight: 18, color: MUTED }}>
                  Deliveries outside Lagos may take up to 7 days. You will receive an update via email shortly.
                </Text>
              </View>

              {businessWebsite ? (
                <Pressable
                  onPress={handleContinueShopping}
                  style={{
                    marginTop: 42,
                    minWidth: compact ? 240 : 320,
                    minHeight: 54,
                    borderRadius: 999,
                    backgroundColor: FYLL_BLACK,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 28,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#FFFFFF' }}>
                    Continue Shopping
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ width: '100%', maxWidth: 540, marginTop: 24 }}>
                <CustomerAccountPromptCard compact={compact} />
              </View>
            </View>
          </View>
        ) : null}

        {showDeliveredState ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View
                style={{
                  width: '100%',
                  maxWidth: 520,
                  borderRadius: 30,
                  borderWidth: 1,
                  borderColor: SURFACE_BORDER,
                  backgroundColor: SURFACE,
                  paddingHorizontal: compact ? 24 : 34,
                  paddingVertical: compact ? 30 : 38,
                  alignItems: 'center',
                  shadowColor: '#111827',
                  shadowOpacity: 0.04,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 2,
                }}
              >
                {showCelebration ? <ConfettiBurst /> : null}
                <View
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 999,
                    backgroundColor: '#EBF8F0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={32} color={GREEN} strokeWidth={2.4} />
                </View>

              <Text
                style={{
                  marginTop: 26,
                  fontSize: 20,
                  lineHeight: 26,
                  color: HEADING,
                  textAlign: 'center',
                  fontWeight: '600',
                }}
              >
                Delivery Confirmed
              </Text>
              <Text
                style={{
                  marginTop: 14,
                  maxWidth: 360,
                  textAlign: 'center',
                  fontSize: 12,
                  lineHeight: 18,
                  color: BODY,
                }}
              >
                Great. We have updated your status to Delivered. Thank you for shopping with {businessName}.
              </Text>

                {businessWebsite ? (
                  <Pressable
                    onPress={handleContinueShopping}
                    style={{
                      marginTop: 34,
                      minWidth: compact ? 260 : 360,
                      minHeight: 58,
                      borderRadius: 999,
                      backgroundColor: FYLL_BLACK,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 30,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '500',
                        color: '#FFFFFF',
                      }}
                    >
                      Continue Shopping
                    </Text>
                  </Pressable>
                ) : null}

                {responseMessage ? (
                  <Text
                    style={{
                      marginTop: 16,
                      textAlign: 'center',
                      color: BODY,
                      fontSize: 12,
                      lineHeight: 18,
                      maxWidth: 460,
                    }}
                  >
                    {responseMessage}
                  </Text>
                ) : null}
              </View>
              <View style={{ width: '100%', maxWidth: 520, marginTop: 24 }}>
                <CustomerAccountPromptCard compact={compact} />
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <PublicFooter compact={compact} />
    </SafeAreaView>
  );
}
