import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, Package, Search, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import useFyllStore, { formatCurrency, type Order } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { findOrderTrackingStageByName, type OrderTrackingStage } from '@/lib/order-status';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import {
  getCustomerTrackingCode,
  getFulfillmentDayMetrics,
  getFulfillmentSnapshot,
  resolveOrderTimeline,
  type PublicTrackingStep,
} from '@/lib/fulfillment';
import {
  fetchPublicTrackingBusiness,
  lookupPublicOrderTracking,
  type PublicOrderTrackingLookupResult,
} from '@/lib/supabase/public-tracking';
import { supabase } from '@/lib/supabase';
import { isTrackingHostname } from '@/lib/tracking-host';
import { CustomerAccountPromptCard } from '@/components/public/CustomerAccountPromptCard';

const fyllCombinationPng = require('../../assets/Group 20fyll combination.png');
const TRACKING_CONTENT_MAX_WIDTH = 760;
const PUBLIC_FRAME_MAX_WIDTH = 1280;

const TRACKING_STAGE_META: Record<OrderTrackingStage, { label: string; subtitle: string; Icon: typeof Clock3 }> = {
  'pending-payment': { label: 'Pending payment', subtitle: 'Awaiting payment', Icon: Clock3 },
  received: { label: 'Order received', subtitle: 'Order logged', Icon: CheckCircle2 },
  processing: { label: 'Processing', subtitle: 'In progress', Icon: Package },
  'out-for-delivery': { label: 'Out for delivery', subtitle: 'On its way to you', Icon: Truck },
  delivered: { label: 'Delivered', subtitle: 'Enjoy!', Icon: CheckCircle2 },
  completed: { label: 'Completed', subtitle: 'Order closed', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', subtitle: 'This order was cancelled', Icon: Clock3 },
};

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');
const STATUS_UPDATE_PATTERN = /^Updated status to\s+(.+)$/i;

const stepIndexMap: Record<PublicTrackingStep, number> = {
  'pending-payment': 0,
  received: 1,
  processing: 2,
  'out-for-delivery': 3,
  delivered: 4,
  completed: 5,
};

type RenderedProgressStep = {
  key: string;
  label: string;
  subtitle: string;
  Icon: typeof Clock3;
  trackingStage: OrderTrackingStage;
};

const DEFAULT_PROGRESS_STEPS: RenderedProgressStep[] = [
  { key: 'pending-payment', trackingStage: 'pending-payment', ...TRACKING_STAGE_META['pending-payment'] },
  { key: 'received', trackingStage: 'received', ...TRACKING_STAGE_META.received },
  { key: 'processing', trackingStage: 'processing', ...TRACKING_STAGE_META.processing },
  { key: 'out-for-delivery', trackingStage: 'out-for-delivery', ...TRACKING_STAGE_META['out-for-delivery'] },
  { key: 'delivered', trackingStage: 'delivered', ...TRACKING_STAGE_META.delivered },
  { key: 'completed', trackingStage: 'completed', ...TRACKING_STAGE_META.completed },
];

const normalizeStatusName = (value?: string | null) => value?.trim().toLowerCase() ?? '';
const slugToDisplayName = (value?: string | null) => (
  value
    ?.split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    ?? ''
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

    if (!sourceUri) return () => {
      isCancelled = true;
    };

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

    if (!sourceUri) return () => {
      isCancelled = true;
    };

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

const extractOrderStatusHistory = (activityLog?: { action: string; date: string }[] | null) => (
  (activityLog ?? [])
    .map((entry, index) => ({
      index,
      date: entry.date ? new Date(entry.date).getTime() : Number.NaN,
      match: entry.action.match(STATUS_UPDATE_PATTERN),
    }))
    .filter((entry) => entry.match?.[1]?.trim())
    .sort((a, b) => {
      if (Number.isNaN(a.date) && Number.isNaN(b.date)) return a.index - b.index;
      if (Number.isNaN(a.date)) return 1;
      if (Number.isNaN(b.date)) return -1;
      return a.date - b.date;
    })
    .map((entry) => entry.match?.[1]?.trim() ?? '')
    .filter(Boolean)
);

const palette = {
  page: '#FFFFFF',
  card: '#FFFFFF',
  subtle: '#F7F7F6',
  border: '#E9E5DD',
  text: '#111111',
  muted: '#7A7A7A',
  soft: '#A3A3A3',
  line: '#ECE9E2',
  black: '#111111',
  greenBg: 'rgba(34,197,94,0.12)',
  greenText: '#15803D',
  amberBg: 'rgba(37,99,235,0.12)',
  amberText: '#1D4ED8',
  redBg: '#FEE2E2',
  redText: '#DC2626',
  blueBg: 'rgba(37,99,235,0.12)',
  blueText: '#1D4ED8',
};

type DeliveryConfettiPieceDefinition = {
  x: number;
  y: number;
  rotate: number;
  width: number;
  height: number;
  color: string;
};

const DELIVERY_CONFETTI_PIECES: DeliveryConfettiPieceDefinition[] = [
  { x: -52, y: -20, rotate: -34, width: 5, height: 12, color: '#2563EB' },
  { x: -34, y: -40, rotate: -18, width: 4, height: 10, color: '#22C55E' },
  { x: -16, y: -54, rotate: -8, width: 5, height: 11, color: '#F59E0B' },
  { x: 0, y: -60, rotate: 0, width: 6, height: 13, color: '#111111' },
  { x: 16, y: -54, rotate: 8, width: 5, height: 11, color: '#10B981' },
  { x: 34, y: -40, rotate: 18, width: 4, height: 10, color: '#8B5CF6' },
  { x: 52, y: -20, rotate: 34, width: 5, height: 12, color: '#EC4899' },
  { x: -42, y: 12, rotate: -24, width: 4, height: 9, color: '#F97316' },
  { x: 42, y: 12, rotate: 24, width: 4, height: 9, color: '#14B8A6' },
];

function DeliveryConfettiPiece({
  progress,
  piece,
}: {
  progress: Animated.SharedValue<number>;
  piece: DeliveryConfettiPieceDefinition;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: piece.x * progress.value },
      { translateY: piece.y * progress.value + (28 * progress.value) },
      { rotate: `${piece.rotate * progress.value}deg` },
      { scale: 1 - (0.32 * progress.value) },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 64,
          top: 46,
          width: piece.width,
          height: piece.height,
          borderRadius: 999,
          backgroundColor: piece.color,
        },
        animatedStyle,
      ]}
    />
  );
}

function DeliveryConfetti({ burstKey }: { burstKey: number }) {
  const progress = useSharedValue<number>(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, [burstKey, progress]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -24,
        left: '50%',
        marginLeft: -64,
        width: 128,
        height: 104,
        zIndex: 5,
      }}
    >
      {DELIVERY_CONFETTI_PIECES.map((piece, index) => (
        <DeliveryConfettiPiece key={`${burstKey}-${piece.color}-${index}`} progress={progress} piece={piece} />
      ))}
    </View>
  );
}

export default function TrackOrderScreen() {
  const { isMobile, isTablet } = useBreakpoint();
  const isTrackingHost = Platform.OS === 'web'
    && typeof window !== 'undefined'
    && isTrackingHostname(window.location.hostname);
  const params = useLocalSearchParams<{
    code?: string | string[];
    email?: string | string[];
    businessSlug?: string | string[];
  }>();
  const businessSlugParam = typeof params.businessSlug === 'string'
    ? params.businessSlug
    : Array.isArray(params.businessSlug)
      ? params.businessSlug[0] ?? ''
      : '';
  const orders = useFyllStore((s) => s.orders);
  const products = useFyllStore((s) => s.products);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const updateOrder = useFyllStore((s) => s.updateOrder);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const {
    businessName: localBusinessName,
    companyName: localCompanyName,
    businessLogo: localBusinessLogo,
  } = useBusinessSettings();

  const rawCodeParam = typeof params.code === 'string' ? params.code : Array.isArray(params.code) ? params.code[0] ?? '' : '';
  const codeParam = isTrackingHost && rawCodeParam === 'order-tracking' ? '' : rawCodeParam;
  const emailParam = typeof params.email === 'string' ? params.email : Array.isArray(params.email) ? params.email[0] ?? '' : '';
  const [lookupCode, setLookupCode] = useState(codeParam);
  const [lookupEmail, setLookupEmail] = useState(emailParam);
  const [hasSearched, setHasSearched] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [deliveryConfettiKey, setDeliveryConfettiKey] = useState(0);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const hasDeepLinkLookup = Boolean(codeParam.trim() && emailParam.trim());

  const publicBusinessQuery = useQuery({
    queryKey: ['public-tracking-business', businessSlugParam],
    queryFn: () => fetchPublicTrackingBusiness(businessSlugParam),
    enabled: businessSlugParam.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const localBusinessQuery = useQuery({
    queryKey: ['local-tracking-business', businessId],
    queryFn: async () => {
      if (!businessId) return null;
      const { data, error } = await supabase
        .from('businesses')
        .select('name,data')
        .eq('id', businessId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const businessData = (data?.data ?? {}) as Record<string, unknown>;
      const businessName = typeof businessData.businessName === 'string' && businessData.businessName.trim()
        ? businessData.businessName.trim()
        : typeof data?.name === 'string'
          ? data.name
          : '';
      const businessLogo = typeof businessData.businessLogo === 'string' && businessData.businessLogo.trim()
        ? businessData.businessLogo.trim()
        : null;
      const businessWebsite = typeof businessData.businessWebsite === 'string' && businessData.businessWebsite.trim()
        ? businessData.businessWebsite.trim()
        : null;

      return { businessName, businessLogo, businessWebsite };
    },
    enabled: Boolean(businessId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const localMatchingOrder = useMemo(() => {
    const normalizedCode = normalizeToken(lookupCode);
    const normalizedEmail = normalizeToken(lookupEmail);
    if (!normalizedCode || !normalizedEmail) return null;

    return (
      orders.find((order) => {
        const candidates = [
          order.websiteOrderReference,
          order.orderNumber,
          getCustomerTrackingCode(order),
          order.logistics?.trackingNumber,
        ]
          .filter(Boolean)
          .map((value) => normalizeToken(String(value)));

        return (
          candidates.includes(normalizedCode) &&
          normalizeToken(order.customerEmail ?? '') === normalizedEmail
        );
      }) ?? null
    );
  }, [lookupCode, lookupEmail, orders]);

  const buildLocalLookupResult = useMemo(() => (
    (order: Order): PublicOrderTrackingLookupResult => ({
      order,
      businessId,
      businessName: publicBusinessQuery.data?.businessName?.trim()
        || localBusinessQuery.data?.businessName?.trim()
        || localBusinessName.trim()
        || localCompanyName.trim()
        || '',
      businessLogo: publicBusinessQuery.data?.businessLogo ?? localBusinessQuery.data?.businessLogo ?? localBusinessLogo ?? null,
      businessWebsite: publicBusinessQuery.data?.businessWebsite ?? localBusinessQuery.data?.businessWebsite ?? null,
      products,
      orderStatuses,
      orderTimelineSettings,
    })
  ), [
    businessId,
    localBusinessQuery.data?.businessLogo,
    localBusinessQuery.data?.businessName,
    localBusinessLogo,
    localBusinessName,
    localCompanyName,
    localBusinessQuery.data?.businessWebsite,
    orderStatuses,
    orderTimelineSettings,
    products,
    publicBusinessQuery.data?.businessLogo,
    publicBusinessQuery.data?.businessName,
    publicBusinessQuery.data?.businessWebsite,
  ]);

  const lookupMutation = useMutation<PublicOrderTrackingLookupResult | null, Error, { code: string; email: string }>({
    mutationFn: async ({ code, email }) => {
      const normalizedCode = code.trim().toUpperCase();
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedCode || !normalizedEmail) {
        return null;
      }

      try {
        const remoteResult = await lookupPublicOrderTracking({
          trackingCode: normalizedCode,
          email: normalizedEmail,
          businessSlug: businessSlugParam || null,
        });

        if (remoteResult?.order) {
          return remoteResult;
        }
      } catch (error) {
        console.warn('Public order tracking lookup failed:', error);
        if (!localMatchingOrder) {
          throw error instanceof Error ? error : new Error('Public tracking lookup failed');
        }
      }

      return localMatchingOrder ? buildLocalLookupResult(localMatchingOrder) : null;
    },
    onMutate: () => {
      setLookupFeedback(null);
      setConfirmMessage(null);
    },
    onError: () => {
      setLookupFeedback('Tracking is temporarily unavailable. Please try again shortly.');
    },
  });
  const runLookup = lookupMutation.mutate;
  const resetLookup = lookupMutation.reset;

  const resultOrder = lookupMutation.data?.order ?? null;
  const resultProducts = lookupMutation.data?.products ?? products;
  const resultOrderStatuses = lookupMutation.data?.orderStatuses?.length ? lookupMutation.data.orderStatuses : orderStatuses;
  const resultOrderTimelineSettings = lookupMutation.data?.orderTimelineSettings ?? orderTimelineSettings;
  const resultBusinessName = lookupMutation.data?.businessName?.trim()
    || publicBusinessQuery.data?.businessName?.trim()
    || localBusinessQuery.data?.businessName?.trim()
    || localBusinessName.trim()
    || localCompanyName.trim()
    || slugToDisplayName(businessSlugParam)
    || '';
  const resultBusinessLogo = lookupMutation.data?.businessLogo
    ?? publicBusinessQuery.data?.businessLogo
    ?? localBusinessQuery.data?.businessLogo
    ?? localBusinessLogo
    ?? null;
  const trimmedBusinessLogo = useTrimmedLogoUri(resultBusinessLogo);
  const businessLogoAspectRatio = useImageAspectRatio(trimmedBusinessLogo);
  const trackingBrandName = resultBusinessName;
  const customerTrackingEmail = resultOrder?.customerEmail?.trim() || lookupEmail.trim();
  const businessHeaderMaxWidth = isMobile ? 160 : 220;
  const businessLogoHeight = isMobile ? 30 : 36;
  const businessHeaderWidth = Math.min(
    businessHeaderMaxWidth,
    businessLogoHeight * (businessLogoAspectRatio ?? 2.8)
  );
  const trackingShellMaxWidth = isTablet ? 900 : TRACKING_CONTENT_MAX_WIDTH;
  const trackingShellGutter = isMobile ? 24 : isTablet ? 48 : 0;
  const publicFrameGutter = isMobile ? 18 : 28;

  useEffect(() => {
    if (!codeParam.trim() || !emailParam.trim()) return;
    setHasSearched(true);
    runLookup({ code: codeParam, email: emailParam });
  }, [codeParam, emailParam, runLookup]);

  const handleSearch = () => {
    setHasSearched(true);
    setLookupFeedback(null);
    runLookup({ code: lookupCode, email: lookupEmail });
  };

  const handleReset = () => {
    setLookupCode('');
    setLookupEmail('');
    setHasSearched(false);
    setConfirmMessage(null);
    setLookupFeedback(null);
    resetLookup();
  };

  const deliveredStatusName = useMemo(
    () => resultOrderStatuses.find((status) => findOrderTrackingStageByName(status.name, resultOrderStatuses) === 'delivered')?.name ?? 'Delivered',
    [resultOrderStatuses]
  );

  const orderItems = useMemo(() => {
    if (!resultOrder) return [];

    const productLines = resultOrder.items.map((item) => {
      const product = resultProducts.find((entry) => entry.id === item.productId);
      return {
        id: `${item.productId}-${item.variantId}`,
        label: product?.name || 'Order item',
        quantity: item.quantity,
      };
    });

    const serviceLines = (resultOrder.services ?? []).map((service) => ({
      id: service.serviceId,
      label: service.name,
      quantity: 1,
    }));

    return [...productLines, ...serviceLines];
  }, [resultProducts, resultOrder]);

  const snapshot = resultOrder ? getFulfillmentSnapshot(resultOrder, new Date(), resultOrderStatuses) : null;
  const dayMetrics = resultOrder ? getFulfillmentDayMetrics(resultOrder) : null;
  const statusHistory = useMemo(
    () => extractOrderStatusHistory(resultOrder?.activityLog),
    [resultOrder?.activityLog]
  );
  const configuredWorkflowStatuses = useMemo(() => {
    if (!resultOrder) return [];
    const resolvedTimeline = resolveOrderTimeline(
      {
        orderTypeId: resultOrder.orderTypeId,
        orderTypeName: resultOrder.orderTypeName,
        deliveryState: resultOrder.deliveryState,
      },
      resultOrderTimelineSettings
    );

    return (resolvedTimeline.orderType.workflowStatusIds ?? [])
      .map((statusId) => resultOrderStatuses.find((status) => status.id === statusId))
      .filter((status): status is NonNullable<typeof status> => Boolean(status))
      .map((status) => status.name.trim())
      .filter(Boolean);
  }, [resultOrderStatuses, resultOrderTimelineSettings, resultOrder]);
  const progressSteps = useMemo<RenderedProgressStep[]>(() => {
    if (!resultOrder || !snapshot) {
      return DEFAULT_PROGRESS_STEPS;
    }

    const currentStatusName = normalizeStatusName(resultOrder.status);
    const actualPath: string[] = [];
    const seen = new Set<string>();
    const pushStatus = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const normalized = normalizeStatusName(trimmed);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      actualPath.push(trimmed);
    };

    statusHistory.forEach(pushStatus);
    pushStatus(resultOrder.status);

    const currentTrackingStage = findOrderTrackingStageByName(resultOrder.status, resultOrderStatuses);
    const configuredWorkflowPath = configuredWorkflowStatuses.map((statusName) => statusName.trim()).filter(Boolean);
    const workflowContainsCurrent = configuredWorkflowPath.some((statusName) => normalizeStatusName(statusName) === currentStatusName);
    const sourceStatuses = workflowContainsCurrent ? configuredWorkflowPath : actualPath;

    if (
      currentTrackingStage !== 'delivered' &&
      currentTrackingStage !== 'cancelled' &&
      !sourceStatuses.some((statusName) => findOrderTrackingStageByName(statusName, resultOrderStatuses) === 'delivered')
    ) {
      sourceStatuses.push(deliveredStatusName);
    }

    const baseStatuses = sourceStatuses.filter((statusName) => {
      const trackingStage = findOrderTrackingStageByName(statusName, resultOrderStatuses);
      if (trackingStage === 'cancelled') {
        return normalizeStatusName(statusName) === currentStatusName;
      }
      return true;
    });
    const currentPathIndex = baseStatuses.findIndex((statusName) => normalizeStatusName(statusName) === currentStatusName);
    const reachedStatusSet = new Set(actualPath.map((statusName) => normalizeStatusName(statusName)));

    const renderedStatuses: RenderedProgressStep[] = [
      {
        key: 'order-received',
        trackingStage: 'received',
        label: TRACKING_STAGE_META.received.label,
        subtitle: currentStatusName ? 'Completed' : 'Current status',
        Icon: TRACKING_STAGE_META.received.Icon,
      },
      ...baseStatuses.map((statusName, index) => {
        const normalized = normalizeStatusName(statusName);
        const trackingStage = findOrderTrackingStageByName(statusName, resultOrderStatuses);
        const stageMeta = TRACKING_STAGE_META[trackingStage];
        const isCurrent = normalized === currentStatusName;
        const isReached = (
          (currentPathIndex >= 0 && index < currentPathIndex)
          || reachedStatusSet.has(normalized)
        );

        return {
          key: `${normalized}-${index}`,
          label: statusName.trim(),
          subtitle: isCurrent ? 'Current status' : isReached ? 'Completed' : stageMeta.subtitle,
          Icon: stageMeta.Icon,
          trackingStage,
        };
      }),
    ];

    if (currentStatusName) {
      const exactCurrentIndex = renderedStatuses.findIndex((step) => normalizeStatusName(step.label) === currentStatusName);

      if (exactCurrentIndex === -1) {
        const stageMatchedIndex = renderedStatuses.findIndex((step) => (
          step.key !== 'order-received'
          && step.trackingStage === currentTrackingStage
        ));

        if (stageMatchedIndex >= 0) {
          renderedStatuses[stageMatchedIndex] = {
            ...renderedStatuses[stageMatchedIndex],
            label: resultOrder.status.trim(),
            subtitle: 'Current status',
          };
        }
      }
    }

    return renderedStatuses.length > 1 ? renderedStatuses : DEFAULT_PROGRESS_STEPS;
  }, [configuredWorkflowStatuses, deliveredStatusName, resultOrderStatuses, resultOrder, snapshot, statusHistory]);

  const activeStepIndex = useMemo(() => {
    if (!snapshot) return 0;

    const currentStatusName = resultOrder?.status?.trim().toLowerCase();
    if (currentStatusName) {
      const matchedIndex = progressSteps.findIndex((step) => step.label.trim().toLowerCase() === currentStatusName);
      if (matchedIndex >= 0) return matchedIndex;
    }

    const stageIndex = progressSteps.findIndex((step) => step.trackingStage === snapshot.publicStep);
    if (stageIndex >= 0) return stageIndex;

    return Math.min(stepIndexMap[snapshot.publicStep], Math.max(0, progressSteps.length - 1));
  }, [progressSteps, resultOrder, snapshot]);

  const summaryMeta = useMemo(() => {
    if (!snapshot || !dayMetrics) return null;

    const deliveredLate = snapshot.statusMeta.isLate;
    if (snapshot.stage === 'cancelled') {
      return {
        label: 'Cancelled',
        bg: palette.redBg,
        text: palette.redText,
        eyebrow: 'Cancelled',
      };
    }
    if (dayMetrics.elapsedDays > dayMetrics.timelineDays || deliveredLate) {
      return {
        label: snapshot.stage === 'completed' ? 'Delivered late' : 'Overdue',
        bg: palette.redBg,
        text: palette.redText,
        eyebrow: snapshot.stage === 'completed' ? 'Delivered' : 'Arriving',
      };
    }
    return {
      label: 'On track',
      bg: palette.blueBg,
      text: palette.blueText,
      eyebrow: snapshot.stage === 'completed' ? 'Delivered' : 'Arriving',
    };
  }, [dayMetrics, snapshot]);

  const progressPercent = useMemo(() => {
    if (!snapshot || progressSteps.length <= 1) return 0;
    if (snapshot.publicStep === 'delivered' || snapshot.stage === 'completed') return 100;
    return Math.max(12, Math.min(100, (activeStepIndex / (progressSteps.length - 1)) * 100));
  }, [activeStepIndex, progressSteps.length, snapshot]);

  const progressColors = useMemo(() => {
    if (!snapshot || !dayMetrics) {
      return { fill: '#111111', track: palette.line };
    }

    const deliveredLate = snapshot.statusMeta.isLate;
    if (snapshot.stage === 'completed' && !deliveredLate) {
      return { fill: '#16A34A', track: 'rgba(34,197,94,0.14)' };
    }
    if (dayMetrics.elapsedDays > dayMetrics.timelineDays || deliveredLate || snapshot.stage === 'cancelled') {
      return { fill: '#DC2626', track: 'rgba(220,38,38,0.12)' };
    }
    return { fill: '#2563EB', track: 'rgba(37,99,235,0.12)' };
  }, [dayMetrics, snapshot]);

  const effectiveEtaDisplay = useMemo(() => {
    if (!resultOrder) return '';
    const source = resultOrder.fulfillmentEffectiveEta
      ?? resultOrder.fulfillmentOriginalEta
      ?? resultOrder.orderDate
      ?? resultOrder.createdAt;

    return new Date(source).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [resultOrder]);

  const orderDateDisplay = useMemo(() => {
    if (!resultOrder) return '';
    return new Date(resultOrder.orderDate ?? resultOrder.createdAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [resultOrder]);

  const progressEndLabel = useMemo(() => {
    if (progressSteps.length === 0) return 'Delivered';
    return progressSteps[progressSteps.length - 1]?.label ?? 'Delivered';
  }, [progressSteps]);

  const isStoreBackedResult = Boolean(
    resultOrder && orders.some((order) => order.id === resultOrder.id)
  );

  const showDeliveryConfirmation = Boolean(
    isStoreBackedResult &&
    resultOrder &&
    snapshot &&
    snapshot.stage !== 'completed' &&
    snapshot.stage !== 'cancelled'
  );
  const canConfirmDelivery = Boolean(
    showDeliveryConfirmation &&
    snapshot &&
    snapshot.publicStep === 'out-for-delivery'
  );

  const handleConfirmDelivery = async () => {
    if (!resultOrder || confirmingDelivery) return;
    setConfirmingDelivery(true);
    setConfirmMessage(null);
    try {
      await updateOrder(
        resultOrder.id,
        {
          status: deliveredStatusName,
          updatedBy: 'Customer',
          updatedAt: new Date().toISOString(),
        },
        businessId
      );
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setDeliveryConfettiKey((current) => current + 1);
      setConfirmMessage('Delivery confirmed.');
    } catch (error) {
      console.warn('Customer delivery confirmation failed:', error);
      setConfirmMessage('Could not confirm delivery right now.');
    } finally {
      setConfirmingDelivery(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          style={{
            width: '100%',
            borderBottomWidth: 1,
            borderBottomColor: palette.border,
            backgroundColor: palette.card,
          }}
        >
	          <View
	            style={{
	              width: '100%',
	              maxWidth: PUBLIC_FRAME_MAX_WIDTH,
	              alignSelf: 'center',
	              paddingHorizontal: publicFrameGutter,
	            }}
	          >
            <View
              style={{
                paddingVertical: isMobile ? 18 : 20,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
	              <View
	                style={{
	                  width: businessHeaderWidth,
	                  alignItems: 'flex-start',
	                  justifyContent: 'center',
	                  flexShrink: 0,
	                }}
	              >
	                {trimmedBusinessLogo ? (
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
                      source={{ uri: trimmedBusinessLogo }}
                      resizeMode="contain"
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
                ) : trackingBrandName ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: palette.text,
                      fontSize: isMobile ? 16 : 20,
                      fontWeight: '600',
                      width: businessHeaderMaxWidth,
                    }}
                  >
                    {trackingBrandName}
                  </Text>
	                ) : (
	                  <View style={{ width: businessHeaderMaxWidth, height: businessLogoHeight }} />
	                )}
              </View>

              <Pressable
                onPress={handleReset}
                style={{
                  minHeight: isMobile ? 42 : 50,
                  paddingHorizontal: isMobile ? 16 : 22,
                  borderRadius: 999,
                  backgroundColor: palette.black,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  flexShrink: 0,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: isMobile ? 13 : 15, fontWeight: '500' }}>
                  Track another order
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
	          <View
	            style={{
	              width: '100%',
	              maxWidth: trackingShellMaxWidth,
	              alignSelf: 'center',
                flex: 1,
                justifyContent: resultOrder ? 'flex-start' : 'center',
	              paddingHorizontal: trackingShellGutter,
	              paddingTop: isMobile ? 28 : isTablet ? 34 : 38,
	              paddingBottom: isMobile ? 40 : 56,
	            }}
	          >
            <View style={{ alignItems: 'center', marginBottom: 34 }}>
              {customerTrackingEmail ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: palette.text,
                    fontSize: isMobile ? 15 : 16,
                    fontWeight: '500',
                    textAlign: 'center',
                    maxWidth: '100%',
                    marginBottom: isMobile ? 14 : 18,
                  }}
                >
                  {customerTrackingEmail}
                </Text>
              ) : null}
              <Text style={{ color: palette.text, fontSize: isMobile ? 28 : 34, fontWeight: '600', textAlign: 'center' }}>
                Track your order
              </Text>
              <Text
                style={{
                  color: '#7A7A7A',
                  fontSize: isMobile ? 13 : 15,
                  lineHeight: isMobile ? 19 : 22,
                  marginTop: 8,
                  textAlign: 'center',
                  fontWeight: '400',
                  maxWidth: 360,
                }}
              >
                {hasDeepLinkLookup && lookupMutation.isPending
                  ? 'Opening your order status. This should only take a moment.'
                  : 'Enter your website order ID, FYLL order ID, or tracking code and email to see live status.'}
              </Text>
            </View>

            {!resultOrder ? (
              <View style={{ width: '100%', maxWidth: 540, alignSelf: 'center', gap: 18 }}>
                <View
	                  style={{
	                    width: '100%',
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    padding: 28,
                  }}
                >
                  <Text style={{ color: '#7A7A7A', fontSize: 14, fontWeight: '500', marginBottom: 12 }}>
                    Website Order ID, FYLL Order ID, or Tracking Code
                  </Text>
                  <TextInput
                    value={lookupCode}
                    onChangeText={setLookupCode}
                    placeholder="WC-10234, ORD-001, or TRK-6576"
                    placeholderTextColor="#A3A3A3"
                    autoCapitalize="characters"
                    style={{
                      minHeight: 56,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#E9E5DD',
                      backgroundColor: '#FFFFFF',
                      color: palette.text,
                      paddingHorizontal: 20,
                      fontSize: 16,
                    }}
                  />

                  <Text style={{ color: '#7A7A7A', fontSize: 14, fontWeight: '500', marginTop: 24, marginBottom: 12 }}>
                    Email
                  </Text>
                  <TextInput
                    value={lookupEmail}
                    onChangeText={setLookupEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#A3A3A3"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={{
                      minHeight: 56,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#E9E5DD',
                      backgroundColor: '#FFFFFF',
                      color: palette.text,
                      paddingHorizontal: 20,
                      fontSize: 16,
                    }}
                  />

                  <Pressable
                    onPress={handleSearch}
                    disabled={lookupMutation.isPending}
                    style={{
                      marginTop: 26,
                      minHeight: 58,
                      borderRadius: 999,
                      backgroundColor: palette.black,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      opacity: lookupMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Search size={20} color="#FFFFFF" strokeWidth={2} />
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500', marginLeft: 10 }}>
                      {lookupMutation.isPending ? 'Checking order...' : 'Track Order'}
                    </Text>
                  </Pressable>

                  {lookupFeedback ? (
                    <Text style={{ color: palette.redText, fontSize: 13, marginTop: 14, textAlign: 'center' }}>
                      {lookupFeedback}
                    </Text>
                  ) : null}

                  {hasSearched && !lookupMutation.isPending && !resultOrder && !lookupFeedback ? (
                    <Text style={{ color: palette.redText, fontSize: 13, marginTop: 14, textAlign: 'center' }}>
                      No order matched that order ID or tracking code and email.
                    </Text>
                  ) : null}
                </View>
                <CustomerAccountPromptCard compact={isMobile} />
              </View>
            ) : null}

	            {resultOrder && snapshot && dayMetrics && summaryMeta ? (
	              <View style={{ width: '100%', maxWidth: trackingShellMaxWidth, alignSelf: 'center' }}>
                <View
                  style={{
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    padding: 28,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: 10,
                          fontWeight: '500',
                          letterSpacing: 2.4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {summaryMeta.eyebrow}
                      </Text>
                      <Text style={{ color: palette.text, fontSize: isMobile ? 20 : 36, fontWeight: '600', marginTop: 8, lineHeight: isMobile ? 28 : 42 }}>
                        {effectiveEtaDisplay}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: isMobile ? 13 : 15, fontWeight: '400', marginTop: 8 }}>
                        Day {dayMetrics.elapsedDays} of {dayMetrics.timelineDays} · estimated delivery
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 15,
                        paddingVertical: 9,
                        borderRadius: 999,
                        backgroundColor: summaryMeta.bg,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: summaryMeta.text,
                        }}
                      />
                      <Text style={{ color: summaryMeta.text, fontSize: isMobile ? 12 : 13, fontWeight: '500' }}>
                        {summaryMeta.label}
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: isMobile ? 24 : 32 }}>
                    <View
                      style={{
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: progressColors.track,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${progressPercent}%`,
                          maxWidth: '100%',
                          minWidth: progressPercent > 0 ? 24 : 0,
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: progressColors.fill,
                        }}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        Ordered
                      </Text>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        {progressEndLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={{ height: 1, backgroundColor: palette.border, marginTop: isMobile ? 20 : 28, marginBottom: isMobile ? 18 : 24 }} />

                  <View style={{ flexDirection: 'row', gap: 32, flexWrap: 'wrap' }}>
                    <View style={{ minWidth: 136 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        Order
                      </Text>
                      <Text style={{ color: palette.text, fontSize: isMobile ? 14 : 18, fontWeight: '700', marginTop: 8 }}>
                        {resultOrder.orderNumber}
                      </Text>
                    </View>

                    <View style={{ minWidth: 180 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        Tracking
                      </Text>
                      <Text style={{ color: palette.text, fontSize: isMobile ? 14 : 18, fontWeight: '700', marginTop: 8 }}>
                        {snapshot.trackingCode}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 22,
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    padding: isMobile ? 22 : 28,
                  }}
                >
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: isMobile ? 10 : 12,
                      fontWeight: '500',
                      letterSpacing: 2.4,
                      textTransform: 'uppercase',
                      marginBottom: 18,
                    }}
                  >
                    Progress
                  </Text>

                  {progressSteps.map((step, index) => {
                    const Icon = step.Icon;
                    const isComplete = index < activeStepIndex;
                    const isActive = index === activeStepIndex;
                    const isFuture = index > activeStepIndex;

                    const iconBorder = isComplete ? palette.black : isActive ? palette.black : '#DFDFDF';
                    const iconFill = isComplete ? palette.black : palette.card;
                    const iconColor = isComplete ? '#FFFFFF' : isActive ? palette.black : '#A9A9A9';
                    const titleColor = isFuture ? '#A9A9A9' : palette.text;
                    const subtitleColor = isFuture ? '#BCBCBC' : palette.muted;
                    const subtitleText = isComplete ? 'Completed' : step.subtitle;

                    return (
                      <View key={step.key} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                        <View style={{ width: isMobile ? 58 : 72, alignItems: 'center' }}>
                          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', width: isMobile ? 40 : 48, height: isMobile ? 40 : 48 }}>
                            {isActive ? (
                              <View
                                style={{
                                  position: 'absolute',
                                  width: isMobile ? 44 : 50,
                                  height: isMobile ? 44 : 50,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: '#EBEBEB',
                                  backgroundColor: '#F7F7F7',
                                }}
                              />
                            ) : null}
                            <View
                              style={{
                                width: isMobile ? 30 : 34,
                                height: isMobile ? 30 : 34,
                                borderRadius: 999,
                                borderWidth: 2,
                                borderColor: iconBorder,
                                backgroundColor: iconFill,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Icon size={isMobile ? 15 : 18} color={iconColor} strokeWidth={2} />
                            </View>
                          </View>

                          {index < progressSteps.length - 1 ? (
                            <View
                              style={{
                                width: 2,
                                flex: 1,
                                backgroundColor: isComplete ? palette.black : palette.line,
                                marginTop: 4,
                                marginBottom: 4,
                              }}
                            />
                          ) : null}
                        </View>

                        <View style={{ flex: 1, paddingTop: 4, paddingBottom: index === progressSteps.length - 1 ? 0 : (isMobile ? 38 : 42) }}>
                          <Text style={{ color: titleColor, fontSize: isMobile ? 13 : 15, fontWeight: isActive ? '600' : '500' }}>
                            {step.label}
                          </Text>
                          <Text style={{ color: subtitleColor, fontSize: isMobile ? 12 : 14, fontWeight: '400', marginTop: 3 }}>
                            {subtitleText}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View
                  style={{
                    marginTop: 22,
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    padding: isMobile ? 22 : 28,
                  }}
                >
                  <Text
                    style={{
                      color: palette.text,
                      fontSize: isMobile ? 11 : 13,
                      fontWeight: '600',
                      letterSpacing: 2.2,
                      textTransform: 'uppercase',
                      marginBottom: 14,
                    }}
                  >
                    Order details
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                    <View style={{ width: isMobile ? '100%' : undefined, minWidth: isMobile ? undefined : 180, flex: isMobile ? undefined : 1 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        Order date
                      </Text>
                      <Text style={{ color: palette.text, fontSize: isMobile ? 13 : 16, fontWeight: '500', marginTop: 8 }}>
                        {orderDateDisplay}
                      </Text>
                    </View>

                    <View style={{ width: isMobile ? '100%' : undefined, minWidth: isMobile ? undefined : 180, flex: isMobile ? undefined : 1 }}>
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: '500',
                          letterSpacing: 1.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        Order total
                      </Text>
                      <Text style={{ color: palette.text, fontSize: isMobile ? 13 : 16, fontWeight: '500', marginTop: 8 }}>
                        {formatCurrency(resultOrder.totalAmount ?? 0)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ height: 1, backgroundColor: palette.border, marginVertical: isMobile ? 18 : 22 }} />

                  <Text
                    style={{
                      color: palette.text,
                      fontSize: isMobile ? 11 : 13,
                      fontWeight: '600',
                      letterSpacing: 2.2,
                      textTransform: 'uppercase',
                      marginBottom: 12,
                    }}
                  >
                    Items
                  </Text>

                  {orderItems.length > 0 ? (
                    orderItems.map((item, index) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 16,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: palette.border,
                          gap: 12,
                        }}
                      >
                        <Text style={{ color: palette.text, fontSize: isMobile ? 13 : 15, fontWeight: '500', flex: 1 }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 15, fontWeight: '400' }}>
                          × {item.quantity}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: palette.muted, fontSize: isMobile ? 13 : 15 }}>
                      No tracked items on this order yet.
                    </Text>
                  )}
                </View>

                {showDeliveryConfirmation ? (
                  <View
                    style={{
                      position: 'relative',
                      marginTop: 22,
                      borderRadius: 28,
                      borderWidth: 1,
                      borderColor: palette.border,
                      backgroundColor: palette.card,
                      padding: isMobile ? 22 : 28,
                    }}
                  >
                    {deliveryConfettiKey > 0 ? <DeliveryConfetti burstKey={deliveryConfettiKey} /> : null}
                      <Text
                        style={{
                        color: palette.muted,
                        fontSize: isMobile ? 10 : 12,
                        fontWeight: '500',
                        letterSpacing: 2.4,
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                      >
                        Delivery confirmation
                      </Text>
                    <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 14, lineHeight: isMobile ? 18 : 20 }}>
                      {canConfirmDelivery
                        ? 'If you have received this order, confirm it here so our team can close it properly.'
                        : 'This button becomes available once your order is out for delivery.'}
                    </Text>
                    <Pressable
                      onPress={() => {
                        if (!canConfirmDelivery) return;
                        void handleConfirmDelivery();
                      }}
                      style={{
                        marginTop: 16,
                        minHeight: 48,
                        borderRadius: 999,
                        backgroundColor: palette.black,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: !canConfirmDelivery || confirmingDelivery ? 0.45 : 1,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: isMobile ? 13 : 14, fontWeight: '600' }}>
                        {!canConfirmDelivery
                          ? 'Available when out for delivery'
                          : confirmingDelivery
                            ? 'Confirming...'
                            : 'Mark as delivered'}
                      </Text>
                    </Pressable>
                    {confirmMessage ? (
                      <Text style={{ color: confirmMessage.includes('Could not') ? palette.redText : palette.blueText, fontSize: 12, marginTop: 10 }}>
                        {confirmMessage}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={{ marginTop: 22 }}>
                  <CustomerAccountPromptCard compact={isMobile} />
                </View>

                <Pressable
                  onPress={handleReset}
                  style={{
                    marginTop: 18,
                    alignSelf: 'flex-start',
                    minHeight: 50,
                    paddingHorizontal: 22,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: '#D7D3CA',
                    backgroundColor: palette.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  <ArrowLeft size={18} color={palette.text} strokeWidth={2} />
                  <Text style={{ color: palette.text, fontSize: isMobile ? 13 : 15, fontWeight: '500', marginLeft: 10 }}>
                    Track another order
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

        </ScrollView>
        <View
          style={{
            width: '100%',
            marginTop: 'auto',
            borderTopWidth: 1,
            borderTopColor: palette.border,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: PUBLIC_FRAME_MAX_WIDTH,
              alignSelf: 'center',
              paddingHorizontal: publicFrameGutter,
              paddingTop: isMobile ? 14 : 18,
              paddingBottom: isMobile ? 12 : 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: isMobile ? 10 : 24,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: isMobile ? 8 : 10,
                flex: isMobile ? 0.7 : 1,
              }}
            >
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500' }}>
                Powered by
              </Text>
              <Image
                source={fyllCombinationPng}
                resizeMode="contain"
                style={{
                  width: isMobile ? 74 : 92,
                  height: isMobile ? 20 : 24,
                }}
              />
            </View>
            <Text
              style={{
                color: palette.muted,
                fontSize: isMobile ? 12 : 13,
                lineHeight: isMobile ? 18 : 19,
                maxWidth: isMobile ? undefined : 360,
                textAlign: 'right',
                flex: isMobile ? 0.3 : undefined,
              }}
            >
              © Fyll 2026
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
