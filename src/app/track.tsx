import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Clock3, Copy, Link2, MapPin, MessageCircle, Package, Search, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import useFyllStore, { formatCurrency, type Order } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { findOrderTrackingStageByName } from '@/lib/order-status';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import {
  getCustomerTrackingCode,
  getFulfillmentDayMetrics,
  getFulfillmentEffectiveEta,
  getFulfillmentSnapshot,
  type PublicTrackingStep,
} from '@/lib/fulfillment';
import {
  fetchPublicTrackingBusiness,
  lookupPublicOrderTracking,
  type PublicOrderTrackingLookupResult,
  searchPublicTrackingBusinesses,
  confirmPublicOrderDelivery,
  type PublicSocialCheckoutTracking,
  type PublicTrackingBusinessMatch,
} from '@/lib/supabase/public-tracking';
import { supabase } from '@/lib/supabase';
import { isTrackingHostname } from '@/lib/tracking-host';

const fyllFieldPhone = require('../../assets/fyll-field-phone.jpg');
const fyllFieldDesktop = require('../../assets/fyll-field-desktop.jpg');
const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');


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

const trackingDisplayFont = Platform.OS === 'web'
  ? "BricolageGrotesque_800ExtraBold, 'Arial Black', sans-serif"
  : 'BricolageGrotesque_800ExtraBold';
// Phones use one weight lighter (700) for headings.
const trackingDisplayFontCompact = Platform.OS === 'web'
  ? "BricolageGrotesque_700Bold, 'Arial Black', sans-serif"
  : 'BricolageGrotesque_700Bold';
const trackingBodyFont = Platform.OS === 'web'
  ? "DMSans_400Regular, system-ui, -apple-system, 'Segoe UI', sans-serif"
  : 'DMSans_400Regular';

// Status changes are logged as "Updated status to <name>"; only these become
// customer updates, mapped to wording that suits the buyer.
const CUSTOMER_STATUS_CHANGE = /^Updated status to\s+(.+)$/i;
const CUSTOMER_MILESTONE_LABEL: Partial<Record<ReturnType<typeof findOrderTrackingStageByName>, string>> = {
  received: 'Order confirmed',
  processing: 'Being prepared',
  'out-for-delivery': 'On its way',
  delivered: 'Delivered',
  completed: 'Delivered',
  cancelled: 'Order cancelled',
};

// Defensive: tracking payloads come from JSON that may hold non-string values.
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// "30 Sept, 16:20" — compact dates for the stepper, cards and updates.
const formatShortStamp = (value?: string | null, includeTime = true) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const day = date.toLocaleDateString('en-GB', date.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  return includeTime ? `${day}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : day;
};

// "Today, 16:40" / "Yesterday, 09:10" / "Wed 30 Sept, 18:45" — for the Updates list.
const formatUpdateStamp = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString('en-GB', date.getFullYear() === now.getFullYear()
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day.replace(',', '')}, ${time}`;
};

type TrackingEta = {
  weekday: string;
  longDate: string;
  shortDate: string;
  startLabel: string;
  dayLabel: string;
  percent: number;
  late: boolean;
};

// Estimate shown on the tracking page — the same ETA Ops uses (explicit ETA if
// staff set one, otherwise start date + the order type's timeline days).
const buildTrackingEta = (order: Parameters<typeof getFulfillmentSnapshot>[0] | null, statuses: Parameters<typeof getFulfillmentSnapshot>[2]): TrackingEta | null => {
  if (!order) return null;
  const snapshot = getFulfillmentSnapshot(order, new Date(), statuses);
  if (snapshot.stage === 'cancelled') return null;
  const metrics = getFulfillmentDayMetrics(order);
  const etaDate = getFulfillmentEffectiveEta(order);
  if (Number.isNaN(etaDate.getTime())) return null;
  const startDate = new Date(order.orderDate ?? order.createdAt);
  const weekday = etaDate.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayMonth = etaDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return {
    weekday,
    longDate: `${weekday}, ${dayMonth}`,
    shortDate: `${etaDate.toLocaleDateString('en-GB', { weekday: 'short' })} ${dayMonth}`,
    startLabel: Number.isNaN(startDate.getTime()) ? 'Ordered' : startDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
    dayLabel: `Day ${metrics.elapsedDays} of ${metrics.timelineDays} · estimated delivery`,
    percent: metrics.timelineDays > 0 ? (metrics.elapsedDays / metrics.timelineDays) * 100 : 0,
    late: metrics.elapsedDays > metrics.timelineDays || snapshot.statusMeta.isLate,
  };
};

const socialStatusLabel = (status: PublicSocialCheckoutTracking['status']) => {
  if (status === 'verified') return 'Verified';
  if (status === 'payment_submitted') return 'Under review';
  if (status === 'rejected') return 'Not verified';
  if (status === 'expired') return 'Expired';
  if (status === 'cancelled') return 'Cancelled';
  return 'Awaiting payment';
};

const buildLocalTrackingPreview = (mode: 'payment' | 'order'): PublicOrderTrackingLookupResult => {
  const now = new Date();
  const submittedAt = new Date(now.getTime() - 24 * 60 * 1000).toISOString();
  const reviewedAt = new Date(now.getTime() - 16 * 60 * 1000).toISOString();
  const orderCreatedAt = new Date(now.getTime() - 9 * 60 * 1000).toISOString();
  const socialCheckout: PublicSocialCheckoutTracking = {
    code: 'QW428VHZZR',
    status: 'verified',
    amount: 22000,
    billNote: 'Hamza rimless · Delivery',
    customerName: 'Tayo Sarumi',
    customerEmail: 'tayosarumi@gmail.com',
    deliveryAddress: '12 Admiralty Way, Lekki Phase 1',
    deliveryState: 'Lagos',
    submittedAt,
    reviewedAt,
    convertedOrderId: mode === 'order' ? 'preview-order' : undefined,
    createdAt: submittedAt,
    updatedAt: reviewedAt,
    activityLog: [],
  };

  return {
    businessId: 'preview-business',
    businessSlug: 'mint-eyewear',
    businessName: 'Mint Eyewear',
    businessLogo: null,
    businessPhone: '+2348001234567',
    businessWebsite: 'https://mint.fyll.store',
    socialCheckout,
    order: mode === 'order'
      ? {
          id: 'preview-order',
          businessId: 'preview-business',
          orderNumber: 'ORD-406541',
          customerTrackingCode: 'TRK-406541',
          customerName: 'Tayo Sarumi',
          customerEmail: 'tayosarumi@gmail.com',
          deliveryState: 'Lagos',
          items: [{ productId: 'preview-hamza', variantId: 'rimless', quantity: 1, unitPrice: 17000 }],
          services: [],
          status: 'Processing',
          totalAmount: 22000,
          deliveryFee: 5000,
          fulfillmentStage: 'processing',
          fulfillmentStartedAt: orderCreatedAt,
          fulfillmentTimelineDays: 5,
          orderDate: orderCreatedAt,
          createdAt: orderCreatedAt,
          updatedAt: now.toISOString(),
          activityLog: [
            { action: 'Order ORD-406541 created', date: orderCreatedAt },
          ],
        }
      : null,
    products: [{ id: 'preview-hamza', name: 'Hamza rimless' }],
    orderStatuses: [],
    orderTimelineSettings: null,
  };
};

type PurchaseTrackingUpdate = {
  key: string;
  label: string;
  time: string;
};

function PurchaseTrackingResult({
  result,
  logoUri,
  publicStep,
  onReset,
  canConfirmDelivery,
  showDeliveryConfirmation,
  confirmingDelivery,
  confirmMessage,
  onConfirmDelivery,
  eta = null,
  trackingCode = null,
  confettiKey = 0,
}: {
  result: PublicOrderTrackingLookupResult;
  logoUri: string | null;
  publicStep: PublicTrackingStep | null;
  onReset: () => void;
  canConfirmDelivery: boolean;
  showDeliveryConfirmation: boolean;
  confirmingDelivery: boolean;
  confirmMessage: string | null;
  onConfirmDelivery: () => void;
  eta?: TrackingEta | null;
  trackingCode?: string | null;
  confettiKey?: number;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  // Second tap guards against accidental confirmations from either button.
  const [confirmArmed, setConfirmArmed] = useState<boolean>(false);
  const compact = viewportWidth < 720;
  const displayFont = compact ? trackingDisplayFontCompact : trackingDisplayFont;
  const displayWeight = (compact ? '700' : '800') as '700' | '800';
  const order = result.order;
  const payment = result.socialCheckout;
  const businessName = result.businessName || 'Fyll merchant';
  const paymentVerified = payment?.status === 'verified' || Boolean(order);
  const setupTitle = payment?.status === 'verified'
    ? 'Your order is being set up'
    : payment?.status === 'payment_submitted'
      ? 'Waiting for payment verification'
      : 'Your order will appear here';
  const setupSubtitle = payment?.status === 'verified'
    ? 'Items and delivery details appear here once it’s ready.'
    : payment?.status === 'payment_submitted'
      ? 'Order details appear after the transfer is confirmed.'
      : 'Complete and verify payment before order fulfilment begins.';
  const orderProgressIndex = publicStep === 'delivered' || publicStep === 'completed'
    ? 4
    : publicStep === 'out-for-delivery'
      ? 3
      : order
        ? 2
        : payment?.status === 'verified'
          ? 2
          : payment?.status === 'payment_submitted'
            ? 1
            : 0;
  const progressLabels = ['Paid', 'Verified', order ? 'Preparing' : 'Order', 'On its way', 'Delivered'];
  const title = order
    ? publicStep === 'out-for-delivery'
      ? 'On its way'
      : publicStep === 'delivered' || publicStep === 'completed'
        ? 'Delivered'
        : 'Being prepared'
    : payment?.status === 'verified'
      ? "We're creating your order"
      : payment?.status === 'payment_submitted'
        ? 'Verifying your payment'
        : payment?.status === 'rejected'
          ? 'Payment needs attention'
          : payment?.status === 'expired'
            ? 'Payment link expired'
            : 'Waiting for payment';
  const eyebrow = order
    ? publicStep === 'out-for-delivery'
      ? 'Dispatched'
      : publicStep === 'delivered' || publicStep === 'completed'
        ? 'Order delivered'
        : 'Order in progress'
    : payment?.status === 'verified'
      ? 'Payment confirmed'
      : socialStatusLabel(payment?.status ?? 'awaiting_payment');
  const subtitle = order
    ? publicStep === 'out-for-delivery'
      ? `${businessName} has sent order ${order.orderNumber}. We’ll keep updating this page until it arrives.`
      : publicStep === 'delivered' || publicStep === 'completed'
        ? `Order ${order.orderNumber} has reached its destination.`
        : `${businessName} is preparing order ${order.orderNumber}. We’ll update you here when it is on its way.`
    : payment?.status === 'verified'
      ? `${businessName} has verified your ${formatCurrency(payment.amount)} payment. Your order details will appear here shortly.`
      : payment?.status === 'payment_submitted'
        ? `${businessName} is reviewing your bank transfer. You’ll see the result here as soon as it is confirmed.`
        : payment?.status === 'rejected'
          ? `${businessName} could not verify this transfer. Please contact them before trying again.`
          : 'Complete the payment from your checkout link to continue.';

  const itemLines = order
    ? [
        ...order.items.map((item, index) => {
          const product = result.products.find((entry) => entry.id === item.productId) as
            | (PublicOrderTrackingLookupResult['products'][number] & { imageUrl?: string | null; variants?: { id: string; imageUrl?: string | null }[] })
            | undefined;
          const unitPrice = Number(item.unitPrice) || 0;
          const variantImage = product?.variants?.find((variant) => variant.id === item.variantId)?.imageUrl;
          // Images can be stored in other shapes (objects, arrays); only use real URL strings.
          const image = [variantImage, product?.imageUrl].map(asText).find(Boolean) ?? '';
          return {
            key: `${item.productId}-${item.variantId}-${index}`,
            label: product?.name || 'Order item',
            image: image || null,
            detail: `Qty ${item.quantity}`,
            amount: unitPrice * item.quantity,
          };
        }),
        ...(order.services ?? []).map((service, index) => ({
          key: `${service.serviceId}-${index}`,
          label: service.name,
          image: null as string | null,
          detail: 'Service',
          amount: Number(service.price) || 0,
        })),
      ]
    : [];

  const updates: PurchaseTrackingUpdate[] = [];
  if (order) {
    const currentLabel = publicStep === 'out-for-delivery' ? 'On its way' : publicStep === 'delivered' || publicStep === 'completed' ? 'Delivered' : 'Being prepared';
    updates.push({ key: 'current-order-status', label: currentLabel, time: 'Now' });
    // Customer-facing milestones only: status changes, reworded per tracking
    // stage. Staff notes, edits, WooCommerce syncs etc. never appear here.
    const seenLabels = new Set<string>([currentLabel]);
    [...(order.activityLog ?? [])]
      .reverse()
      .forEach((entry, index) => {
        const statusName = typeof entry.action === 'string' ? entry.action.match(CUSTOMER_STATUS_CHANGE)?.[1]?.trim() : undefined;
        if (!statusName) return;
        const label = CUSTOMER_MILESTONE_LABEL[findOrderTrackingStageByName(statusName, result.orderStatuses)];
        if (!label || seenLabels.has(label)) return;
        seenLabels.add(label);
        updates.push({ key: `order-milestone-${index}-${entry.date}`, label, time: formatUpdateStamp(entry.date) });
      });
    updates.push({
      key: 'order-created',
      label: `Order ${order.orderNumber} created`,
      time: formatUpdateStamp(order.createdAt),
    });
  } else if (payment?.status === 'verified') {
    updates.push({ key: 'creating-order', label: 'Creating your order', time: 'In progress' });
  } else if (payment?.status === 'payment_submitted') {
    updates.push({ key: 'reviewing-payment', label: 'Payment verification in progress', time: 'In progress' });
  } else if (payment) {
    updates.push({
      key: `payment-${payment.status}`,
      label: payment.status === 'rejected'
        ? 'Payment could not be verified'
        : payment.status === 'expired'
          ? 'Payment link expired'
          : payment.status === 'cancelled'
            ? 'Payment link cancelled'
            : 'Waiting for payment',
      time: formatUpdateStamp(payment.updatedAt),
    });
  }
  if (payment?.reviewedAt && paymentVerified) {
    updates.push({
      key: 'payment-verified',
      label: `Payment verified by ${businessName}`,
      time: formatUpdateStamp(payment.reviewedAt),
    });
  }
  if (payment?.submittedAt) {
    updates.push({
      key: 'payment-sent',
      label: 'Payment sent',
      time: formatUpdateStamp(payment.submittedAt),
    });
  }

  const messageBusiness = async () => {
    const storedPhone = result.businessPhone?.trim() ?? '';
    const phoneDigits = storedPhone.replace(/\D/g, '');
    if (!phoneDigits) return;
    // Keep legacy Nigerian local numbers working while settings move businesses to international format.
    const whatsAppNumber = !storedPhone.startsWith('+') && /^0\d{10}$/.test(phoneDigits)
      ? `234${phoneDigits.slice(1)}`
      : phoneDigits;
    const purchaseReference = order?.orderNumber
      ? `order ${order.orderNumber}`
      : payment?.code
        ? `payment SC-${payment.code}`
        : 'my purchase';
    const message = encodeURIComponent(`Hi ${businessName}, I need help with ${purchaseReference}.`);
    try {
      await Linking.openURL(`https://wa.me/${whatsAppNumber}?text=${message}`);
    } catch {
      await Linking.openURL(`tel:+${phoneDigits}`);
    }
  };

  const wide = viewportWidth >= 1000;
  const hasPhone = Boolean(result.businessPhone?.trim());
  const showArriving = Boolean(order && eta && publicStep !== 'delivered' && publicStep !== 'completed');
  const onItsWay = showArriving && publicStep === 'out-for-delivery';
  const heroTitle = onItsWay && eta ? `Arriving ${eta.weekday}` : title;
  const heroEyebrow = onItsWay ? 'On its way' : eyebrow;
  const heroSubtitle = onItsWay && eta && order
    ? `Your ${businessName} order is with the courier and on track for ${eta.longDate}.`
    : subtitle;
  const reference = onItsWay && trackingCode
    ? { label: 'Tracking code', value: trackingCode }
    : order
      ? { label: 'Order number', value: order.orderNumber }
      : payment
        ? { label: 'Payment reference', value: `SC-${payment.code}` }
        : null;
  const stepWhen = [
    payment?.submittedAt ? formatShortStamp(payment.submittedAt) : '',
    payment?.reviewedAt ? formatShortStamp(payment.reviewedAt) : '',
    order
      ? orderProgressIndex === 2 ? 'Now' : formatShortStamp(order.createdAt, false)
      : payment?.status === 'verified' ? 'In progress' : '',
    orderProgressIndex === 3 ? 'Now' : '',
    eta && orderProgressIndex < 4 ? `Est. ${eta.shortDate}` : orderProgressIndex === 4 ? 'Done' : '',
  ];
  const sidePadding = compact ? 20 : 32;
  const circle = compact ? 32 : 40;
  const stepperPadH = compact ? 18 : 40;
  const stepperPadTop = compact ? 18 : 26;
  const card = { borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(30,30,30,0.08)', padding: compact ? 18 : 26 } as const;
  const cardTitle = { fontFamily: displayFont, fontWeight: displayWeight, fontSize: compact ? 20 : 22, letterSpacing: -0.5, color: '#1E1E1E' };
  const muted = '#6B6C63';
  const recipientName = payment?.customerName || order?.customerName || '';
  const streetAddress = asText(payment?.deliveryAddress) || asText(order?.deliveryAddress);
  const deliveryState = asText(payment?.deliveryState) || asText(order?.deliveryState);
  const recipientAddress = deliveryState && !streetAddress.toLowerCase().includes(deliveryState.toLowerCase())
    ? [streetAddress, deliveryState].filter(Boolean).join(', ')
    : streetAddress || deliveryState;
  const recipientPhone = payment?.customerPhone || order?.customerPhone || '';
  const deliveryTo = recipientName || recipientAddress || recipientPhone;
  const recipientDetails = (
    <View style={{ gap: 2 }}>
      {recipientName ? <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 15, lineHeight: compact ? 17 : 21, color: '#1E1E1E' }}>{recipientName}</Text> : null}
      {recipientAddress ? <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, lineHeight: compact ? 17 : 21, color: '#1E1E1E' }} selectable>{recipientAddress}</Text> : null}
      {recipientPhone ? <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, lineHeight: 20, color: '#55564E' }} selectable>{recipientPhone}</Text> : null}
      {!deliveryTo ? <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, lineHeight: compact ? 17 : 21, color: '#1E1E1E' }}>Delivery details from your checkout</Text> : null}
    </View>
  );

  const copyTrackingCode = async () => {
    if (!trackingCode) return;
    await Clipboard.setStringAsync(trackingCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1600);
  };

  const itemsList = itemLines.map((item) => (
    <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 12 : 16 }}>
      {item.image ? (
        <Image source={{ uri: item.image }} resizeMode="cover" accessibilityLabel={item.label} style={{ width: compact ? 52 : 64, height: compact ? 52 : 64, borderRadius: compact ? 14 : 16, backgroundColor: '#F1F1EC' }} />
      ) : null}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 16.5, color: '#1E1E1E' }}>{item.label}</Text>
        <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, color: muted }}>{item.detail}</Text>
      </View>
      {item.amount > 0 ? <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 16.5, color: '#1E1E1E' }}>{formatCurrency(item.amount)}</Text> : null}
    </View>
  ));

  const arrivingCard = showArriving && eta && order ? (
    <View style={{ ...card, gap: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 11 : 13, letterSpacing: 0.8, textTransform: 'uppercase', color: muted }}>Arriving</Text>
          <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: compact ? 32 : 40, lineHeight: compact ? 34 : 42, letterSpacing: -1.4, color: '#1E1E1E' }}>{eta.longDate}</Text>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, color: muted }}>{eta.dayLabel}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: eta.late ? 'rgba(220,38,38,0.1)' : 'rgba(213,224,87,0.3)' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: eta.late ? '#DC2626' : '#7D8A00' }} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 14, color: eta.late ? '#B91C1C' : '#3F4A08' }}>{eta.late ? 'Running late' : 'On track'}</Text>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ height: 10, borderRadius: 999, backgroundColor: '#EFEFE9', overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(6, Math.min(100, eta.percent))}%`, height: '100%', borderRadius: 999, backgroundColor: eta.late ? '#DC2626' : '#D5E057' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 10 : 12.5, color: '#8C8D84' }}>{eta.startLabel}</Text>
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 10 : 12.5, color: '#1E1E1E' }}>Today</Text>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 10 : 12.5, color: '#8C8D84' }}>{eta.shortDate}</Text>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(30,30,30,0.07)' }} />
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: compact ? 16 : 20 }}>
        <View style={{ flex: compact ? undefined : 1, gap: 4 }}>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Order</Text>
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 17, letterSpacing: 0.2, color: '#1E1E1E' }}>{order.orderNumber}</Text>
        </View>
        {trackingCode ? (
          <View style={{ flex: compact ? undefined : 1, gap: 4 }}>
            <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Tracking</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 17, letterSpacing: 0.2, color: '#1E1E1E' }} selectable>{trackingCode}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Copy tracking code" onPress={() => { void copyTrackingCode(); }} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#F3F3EE', alignItems: 'center', justifyContent: 'center' }}>
                {codeCopied ? <Check size={14} color="#3F4A08" strokeWidth={2.6} /> : <Copy size={14} color="#55564E" strokeWidth={2.2} />}
              </Pressable>
            </View>
          </View>
        ) : null}
        {deliveryTo ? (
          <View style={{ flex: compact ? undefined : 1.4, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <MapPin size={18} color={muted} strokeWidth={2} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Delivering to</Text>
              {recipientDetails}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  ) : null;

  const orderCard = order ? (
    showArriving ? (
      itemLines.length > 0 ? <View style={{ ...card, paddingVertical: 18, gap: 14 }}>{itemsList}</View> : null
    ) : (
      <View style={{ ...card, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <Text style={cardTitle}>Your order</Text>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, color: muted }}>{order.orderNumber} · Created {formatShortStamp(order.createdAt)}</Text>
        </View>
        {itemLines.length > 0 ? itemsList : <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, color: muted }}>Items will appear here shortly.</Text>}
        <View style={{ height: 1, backgroundColor: 'rgba(30,30,30,0.07)' }} />
        <View style={{ flexDirection: compact ? 'column' : 'row', gap: compact ? 14 : 20 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <MapPin size={20} color={muted} strokeWidth={2} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, color: muted }}>Delivering to</Text>
              {recipientDetails}
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Truck size={20} color={muted} strokeWidth={2} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, color: muted }}>Delivery</Text>
              <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, lineHeight: compact ? 17 : 21, color: '#1E1E1E' }}>
                {publicStep === 'delivered' || publicStep === 'completed'
                  ? 'Delivered'
                  : eta ? `Estimated ${eta.longDate}` : 'Dispatch details appear once it ships'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  ) : (
    <View style={{ ...card, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(213,224,87,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          <Package size={22} color="#5F6A00" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 17, color: '#1E1E1E' }}>{setupTitle}</Text>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, lineHeight: 20, color: muted }}>{setupSubtitle}</Text>
        </View>
      </View>
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 14 }}>
        {[['70%', '40%'], ['56%', '32%']].map(([wideBar, shortBar], index) => (
          <View key={`placeholder-${index}`} style={{ flex: compact ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#F8F8F4' }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#EFEFE9' }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 11, width: wideBar as `${number}%`, borderRadius: 6, backgroundColor: '#E9E9E2' }} />
              <View style={{ height: 9, width: shortBar as `${number}%`, borderRadius: 6, backgroundColor: '#EFEFE9' }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const updatesCard = (
    <View style={{ ...card, paddingBottom: compact ? 4 : 10 }}>
      <Text style={{ ...cardTitle, fontSize: compact ? 16 : cardTitle.fontSize, paddingBottom: 18 }}>Updates</Text>
      {updates.map((update, index) => (
        <View key={update.key} style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ width: 14, alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: index === 0 ? '#D5E057' : '#7D8A00', borderWidth: index === 0 ? 3 : 0, borderColor: 'rgba(213,224,87,0.35)' }} />
            {index < updates.length - 1 ? <View style={{ width: 2, flex: 1, marginVertical: 4, backgroundColor: 'rgba(95,106,0,0.22)' }} /> : null}
          </View>
          <View style={{ flex: 1, flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between', gap: compact ? 2 : 16, paddingBottom: 18 }}>
            <Text style={{ flex: compact ? undefined : 1, fontFamily: index === 0 ? 'DMSans_600SemiBold' : trackingBodyFont, fontSize: compact ? 12 : 15.5, color: '#1E1E1E' }}>{update.label}</Text>
            <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, color: muted }}>{update.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  // Confirm delivery appears in the timeline and in a card lower down; both
  // ask for a second tap ("Yes, I received it") before anything is saved.
  const deliveryConfirmed = Boolean(confirmMessage?.startsWith('Delivery confirmed'));
  const showConfirmRow = (showDeliveryConfirmation && canConfirmDelivery) || Boolean(confirmMessage);
  const renderConfirmControls = (onDark: boolean) => {
    if (deliveryConfirmed || !canConfirmDelivery) return null;
    const height = compact ? 46 : 52;
    const limeStyle = (state: { pressed: boolean }) => ({
      height,
      paddingHorizontal: compact ? 18 : 24,
      borderRadius: 999,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      backgroundColor: (state as { hovered?: boolean }).hovered ? '#E1EB6B' : '#D5E057',
      opacity: state.pressed || confirmingDelivery ? 0.85 : 1,
    });
    if (!confirmArmed) {
      return (
        <Pressable accessibilityRole="button" onPress={() => setConfirmArmed(true)} style={limeStyle}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: compact ? 12 : 16, color: '#1E1E1E' }}>Confirm delivery</Text>
        </Pressable>
      );
    }
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmArmed(false)}
          disabled={confirmingDelivery}
          style={{ height, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: onDark ? 'rgba(255,255,255,0.28)' : 'rgba(30,30,30,0.16)' }}
        >
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 15, color: onDark ? '#F4F4EF' : '#1E1E1E' }}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setConfirmArmed(false);
            onConfirmDelivery();
          }}
          disabled={confirmingDelivery}
          style={limeStyle}
        >
          {confirmingDelivery ? <ActivityIndicator size="small" color="#1E1E1E" /> : <Check size={16} color="#1E1E1E" strokeWidth={2.8} />}
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: compact ? 12 : 16, color: '#1E1E1E' }}>{confirmingDelivery ? 'Confirming…' : 'Yes, I received it'}</Text>
        </Pressable>
      </View>
    );
  };
  const deliveryCard = showDeliveryConfirmation ? (
    <View style={{ ...card, position: 'relative', gap: 12 }}>
      <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 16, color: '#1E1E1E' }}>
        {deliveryConfirmed ? 'Delivery confirmed' : 'Have you received this order?'}
      </Text>
      <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, lineHeight: 20, color: muted }}>
        {deliveryConfirmed
          ? `Thanks! ${businessName} has been told your order arrived.`
          : canConfirmDelivery
            ? confirmArmed
              ? 'Only confirm once the order is in your hands.'
              : 'Confirm it here so the business can close your order.'
            : 'You can confirm delivery once your order is out for delivery.'}
      </Text>
      {canConfirmDelivery && !deliveryConfirmed ? (
        <View style={{ alignSelf: compact ? 'stretch' : 'flex-start' }}>{renderConfirmControls(false)}</View>
      ) : null}
      {confirmMessage && !deliveryConfirmed ? <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: '#B91C1C' }}>{confirmMessage}</Text> : null}
    </View>
  ) : null;

  // Itemised receipt like global order-status pages: items, delivery, extra
  // charges and discount, then the total. Payment-link-only purchases (no
  // order yet) fall back to the bill note.
  const receiptRows: { key: string; label: string; amount: number; muted?: boolean }[] = order
    ? [
        ...itemLines.filter((item) => item.amount > 0).map((item) => ({ key: item.key, label: item.label, amount: item.amount })),
        ...((order.deliveryFee ?? 0) > 0 ? [{ key: 'delivery', label: 'Delivery', amount: order.deliveryFee ?? 0, muted: true }] : []),
        ...((order.additionalCharges ?? 0) > 0 ? [{ key: 'charges', label: order.additionalChargesNote || 'Additional charges', amount: order.additionalCharges ?? 0, muted: true }] : []),
        ...((order.discountAmount ?? 0) > 0 ? [{ key: 'discount', label: 'Discount', amount: -(order.discountAmount ?? 0), muted: true }] : []),
      ]
    : payment
      ? [{ key: 'bill', label: payment.billNote || 'Payment link', amount: payment.amount }]
      : [];
  const receiptList = receiptRows.map((row) => (
    <View key={row.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
      <Text style={{ flex: 1, fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, lineHeight: compact ? 17 : 21, color: row.muted ? '#55564E' : '#1E1E1E' }}>{row.label}</Text>
      <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, color: row.muted ? '#55564E' : '#1E1E1E' }}>{row.amount < 0 ? `−${formatCurrency(-row.amount)}` : formatCurrency(row.amount)}</Text>
    </View>
  ));

  const paymentCard = payment ? (
    <View style={{ ...card, gap: 13 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...cardTitle, fontSize: compact ? 16 : cardTitle.fontSize }}>Payment</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: paymentVerified ? 'rgba(213,224,87,0.3)' : '#F1F1EC' }}>
          {paymentVerified ? <Check size={12} color="#3F4A08" strokeWidth={3} /> : <Clock3 size={12} color="#55564E" strokeWidth={2.5} />}
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 10 : 12.5, color: paymentVerified ? '#3F4A08' : '#55564E' }}>{socialStatusLabel(payment.status)}</Text>
        </View>
      </View>
      {receiptList}
      <View style={{ height: 1, backgroundColor: 'rgba(30,30,30,0.07)' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 15.5, color: '#1E1E1E' }}>{paymentVerified ? 'Total paid' : 'Amount'}</Text>
                      <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: compact ? 18 : 28, letterSpacing: compact ? -0.4 : -0.8, color: '#1E1E1E' }}>{formatCurrency(payment.amount)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Bank transfer · {formatShortStamp(payment.reviewedAt || payment.submittedAt || payment.createdAt)}</Text>
        <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }} selectable>SC-{payment.code}</Text>
      </View>
    </View>
  ) : order ? (
    <View style={{ ...card, gap: 13 }}>
      <Text style={{ ...cardTitle, fontSize: compact ? 16 : cardTitle.fontSize }}>Payment</Text>
      {receiptList}
      {receiptList.length > 0 ? <View style={{ height: 1, backgroundColor: 'rgba(30,30,30,0.07)' }} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 15.5, color: '#1E1E1E' }}>Order total</Text>
        <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: 28, letterSpacing: -0.8, color: '#1E1E1E' }}>{formatCurrency(order.totalAmount ?? 0)}</Text>
      </View>
      <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Ordered {formatShortStamp(order.orderDate || order.createdAt, false)}</Text>
    </View>
  ) : null;

  const asideBlocks = (
    <>
      {paymentCard}
      {hasPhone ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { void messageBusiness(); }}
          style={{ height: 54, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1E1E1E' }}
        >
          <MessageCircle size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 14 : 15, color: '#FFFFFF' }} numberOfLines={1}>Message {businessName}</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#EFEFE9' }}>
        <Link2 size={18} color="#5F6A00" strokeWidth={2} />
        <Text style={{ flex: 1, fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, lineHeight: 19, color: '#55564E' }}>Bookmark this page. Every update for this purchase shows up here.</Text>
      </View>
      {compact ? (
        <Pressable accessibilityRole="button" onPress={onReset} style={{ height: 48, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(30,30,30,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 14 : 14.5, color: '#1E1E1E' }}>Track another order</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 6 }}>
        <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: muted }}>Tracked by</Text>
        <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 16 * (344 / 195), height: 16, tintColor: '#1E1E1E' }} />
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F8F4' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: compact ? 36 : 56 }}>
        <ImageBackground source={wide ? fyllFieldDesktop : fyllFieldPhone} resizeMode="cover" style={{ overflow: 'hidden' }}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(20,20,20,0.3)', 'rgba(20,20,20,0.08)', 'rgba(20,20,20,0.3)']}
            locations={[0, 0.55, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SafeAreaView edges={['top']}>
            <View style={{ width: '100%', maxWidth: 1160 + sidePadding * 2, alignSelf: 'center', paddingHorizontal: sidePadding, paddingTop: compact ? 30 : 28, paddingBottom: compact ? 70 : 92, gap: compact ? 22 : 44 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <View style={{ width: compact ? 40 : 46, height: compact ? 40 : 46, borderRadius: 999, borderWidth: 2, borderColor: '#D5E057', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {logoUri ? (
                      <Image source={{ uri: logoUri }} resizeMode="contain" style={{ width: compact ? 34 : 40, height: compact ? 34 : 40 }} />
                    ) : (
                      <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 16 : 18, color: '#1E1E1E' }}>{businessName.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 15 : 16, color: '#FFFFFF' }}>{businessName}</Text>
                    <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, color: 'rgba(244,244,239,0.75)' }}>Order tracking</Text>
                  </View>
                </View>
                {!compact ? (
                  <Pressable accessibilityRole="button" onPress={onReset} style={{ height: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>Track another order</Text>
                  </Pressable>
                ) : null}
                <View style={{ height: compact ? 32 : 38, paddingHorizontal: compact ? 12 : 14, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 10 : 12.5, color: '#EEF2C4' }}>Secured by</Text>
                  <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 11 * (344 / 195), height: 11, tintColor: '#EEF2C4' }} />
                </View>
              </View>

              <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch', justifyContent: 'space-between', gap: wide ? 40 : 12 }}>
                <View style={{ gap: compact ? 10 : 14, maxWidth: 680, flexShrink: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D5E057' }, Platform.OS === 'web' ? ({ boxShadow: '0 0 10px #D5E057' } as object) : null]} />
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 14, color: '#EEF2C4' }}>{heroEyebrow}</Text>
                  </View>
                  <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: compact ? 44 : 68, lineHeight: compact ? 44 : 66, letterSpacing: compact ? -1.8 : -2.6, color: '#FFFFFF' }}>{heroTitle}</Text>
                  <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 15 : 17, lineHeight: compact ? 22 : 26, color: 'rgba(244,244,239,0.88)' }}>{heroSubtitle}</Text>
                </View>
                {reference ? (
                  <View style={{ alignItems: wide ? 'flex-end' : 'flex-start', gap: 4, paddingBottom: wide ? 6 : 0, flexDirection: wide ? 'column' : 'row' }}>
                    <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, color: 'rgba(244,244,239,0.8)' }}>{reference.label}{wide ? '' : ' ·'}</Text>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: wide ? 20 : 14, letterSpacing: 0.3, color: '#FFFFFF' }} selectable>{reference.value}</Text>
                  </View>
                ) : null}
              </View>

              <View
                style={[
                  { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(34,36,26,0.58)', paddingHorizontal: stepperPadH, paddingTop: stepperPadTop, paddingBottom: compact ? 16 : 22 },
                  Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as object) : null,
                ]}
              >
                {compact ? (
                  <View>
                    {progressLabels.map((label, index) => {
                      const complete = index < orderProgressIndex || (index === 4 && orderProgressIndex === 4);
                      const active = index === orderProgressIndex && !complete;
                      const reached = index <= orderProgressIndex;
                      const isLast = index === progressLabels.length - 1;
                      return (
                        <View key={label} style={{ minHeight: isLast ? circle : 58, flexDirection: 'row', alignItems: 'flex-start' }}>
                          {!isLast ? (
                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                left: circle / 2 - 1.5,
                                top: circle,
                                width: 3,
                                height: 58 - circle,
                                backgroundColor: index < orderProgressIndex ? '#D5E057' : 'rgba(255,255,255,0.16)',
                              }}
                            />
                          ) : null}
                          <View
                            style={[
                              {
                                width: circle,
                                height: circle,
                                borderRadius: circle / 2,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: complete ? '#D5E057' : active ? '#1E1E1E' : 'rgba(255,255,255,0.06)',
                                borderWidth: active ? 2 : complete ? 0 : 1,
                                borderColor: active ? '#D5E057' : 'rgba(255,255,255,0.26)',
                              },
                              active && Platform.OS === 'web' ? ({ boxShadow: '0 0 0 5px rgba(213,224,87,0.16), 0 0 16px rgba(213,224,87,0.38)' } as object) : null,
                            ]}
                          >
                            <Check size={15} color={complete ? '#1E1E1E' : active ? '#D5E057' : 'rgba(244,244,239,0.35)'} strokeWidth={3} />
                          </View>
                          <Text style={{ flex: 1, marginLeft: 16, paddingTop: 6, fontFamily: reached ? 'DMSans_600SemiBold' : trackingBodyFont, fontSize: 13, color: reached ? '#FFFFFF' : 'rgba(244,244,239,0.5)' }} numberOfLines={1}>{label}</Text>
                          <Text style={{ marginLeft: 12, paddingTop: 6, fontFamily: trackingBodyFont, fontSize: 11, color: reached ? 'rgba(244,244,239,0.68)' : 'rgba(244,244,239,0.48)' }} numberOfLines={1}>{stepWhen[index] || '—'}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    {/* Desktop retains the wide horizontal timeline. */}
                    <View pointerEvents="none" style={{ position: 'absolute', left: stepperPadH + circle / 2, right: stepperPadH + circle / 2, top: stepperPadTop + circle / 2 - 1.5, height: 3 }}>
                      <View style={{ position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' }} />
                      <View style={{ position: 'absolute', left: 0, width: `${(orderProgressIndex / 4) * 100}%`, height: 3, borderRadius: 999, backgroundColor: '#D5E057' }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 46 }}>
                      {progressLabels.map((label, index) => {
                        const complete = index < orderProgressIndex || (index === 4 && orderProgressIndex === 4);
                        const active = index === orderProgressIndex && !complete;
                        const isFirst = index === 0;
                        const isLast = index === progressLabels.length - 1;
                        const labelWidth = 130;
                        const textAlign = isFirst ? 'left' : isLast ? 'right' : 'center';
                        return (
                          <View key={label} style={{ width: circle, alignItems: 'center' }}>
                            <View style={[{ width: circle, height: circle, borderRadius: circle / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? '#D5E057' : active ? '#1E1E1E' : 'rgba(255,255,255,0.06)', borderWidth: active ? 2 : complete ? 0 : 1, borderColor: active ? '#D5E057' : 'rgba(255,255,255,0.24)' }, active && Platform.OS === 'web' ? ({ boxShadow: '0 0 0 6px rgba(213,224,87,0.2), 0 0 20px rgba(213,224,87,0.5)' } as object) : null]}>
                              <Check size={18} color={complete ? '#1E1E1E' : active ? '#D5E057' : 'rgba(244,244,239,0.3)'} strokeWidth={3} />
                            </View>
                            <View style={{ position: 'absolute', top: circle + 10, width: labelWidth, left: isFirst ? 0 : isLast ? undefined : (circle - labelWidth) / 2, right: isLast ? 0 : undefined, gap: 2 }}>
                              <Text style={{ fontFamily: active ? 'DMSans_600SemiBold' : trackingBodyFont, fontSize: 14, lineHeight: 18, textAlign, color: index <= orderProgressIndex ? '#FFFFFF' : 'rgba(244,244,239,0.55)' }} numberOfLines={1}>{label}</Text>
                              <Text style={{ fontFamily: trackingBodyFont, fontSize: 12, lineHeight: 16, color: 'rgba(244,244,239,0.6)', textAlign }} numberOfLines={1}>{stepWhen[index] || ' '}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
                {showConfirmRow ? (
                  <View style={{ marginTop: compact ? 16 : 20, paddingTop: compact ? 14 : 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    {confettiKey > 0 ? <DeliveryConfetti burstKey={confettiKey} /> : null}
                    <Text style={{ flex: 1, fontFamily: trackingBodyFont, fontSize: compact ? 12 : 15, color: confirmMessage?.includes('Could not') ? '#FFD3CD' : 'rgba(244,244,239,0.75)' }}>
                      {confirmMessage ?? (confirmArmed ? 'Received it in good condition?' : 'Got your order?')}
                    </Text>
                    {renderConfirmControls(true)}
                  </View>
                ) : null}
              </View>
            </View>
          </SafeAreaView>
        </ImageBackground>

        <View style={{ width: '100%', maxWidth: 1160 + sidePadding * 2, alignSelf: 'center', paddingHorizontal: compact ? 16 : sidePadding, marginTop: -44 }}>
          {wide ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
                {arrivingCard}
                {orderCard}
                {updatesCard}
                {deliveryCard}
              </View>
              <View style={{ width: 400, gap: 16 }}>{asideBlocks}</View>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {arrivingCard}
              {orderCard}
              {updatesCard}
              {deliveryCard}
              {asideBlocks}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// Landing for track.fyll.app and track.fyll.app/<business>: the Field hero
// with a glass "Track an order" form. On a business URL the business is
// already known, so it shows as a picked chip; the root URL asks only for
// order number and email (the lookup works without a business).
// Search-as-you-type business picker (published storefronts only). Results
// render inline under the field — the glass card clips overflow, so an
// absolutely positioned popover would be cut off.
function BusinessPicker({ onPick }: { onPick: (match: PublicTrackingBusinessMatch) => void }) {
  const [query, setQuery] = useState<string>('');
  const [debounced, setDebounced] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ['tracking-business-search', debounced],
    queryFn: () => searchPublicTrackingBusinesses(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60 * 1000,
    retry: 0,
  });
  const matches = searchQuery.data ?? [];
  const showList = debounced.length >= 2 && query.trim().length >= 2 && !searchQuery.isError;
  const needle = debounced.toLowerCase();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 54, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8 }}>
        <Search size={18} color="#6B6C63" strokeWidth={2.2} />
        <TextInput
          accessibilityLabel="Business"
          value={query}
          onChangeText={setQuery}
          placeholder="Search the business you bought from"
          placeholderTextColor="#8C8D84"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            { flex: 1, height: 52, marginLeft: 10, color: '#1E1E1E', fontFamily: trackingBodyFont, fontSize: 16 },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {searchQuery.isFetching ? <ActivityIndicator size="small" color="#6B6C63" /> : null}
      </View>
      {showList ? (
        <View style={[{ padding: 8, borderRadius: 18, backgroundColor: '#FFFFFF', gap: 2 }, Platform.OS === 'web' ? ({ boxShadow: '0 24px 60px rgba(20,20,20,0.35)' } as object) : null]}>
          {searchQuery.isFetching && matches.length === 0 ? (
            <Text style={{ fontFamily: trackingBodyFont, fontSize: 13.5, color: '#6B6C63', paddingVertical: 10, paddingHorizontal: 12 }}>Searching…</Text>
          ) : matches.length === 0 ? (
            <Text style={{ fontFamily: trackingBodyFont, fontSize: 13.5, lineHeight: 19, color: '#6B6C63', paddingVertical: 10, paddingHorizontal: 12 }}>
              No business called “{debounced}” on Fyll yet. You can still track with your order number below.
            </Text>
          ) : (
            <>
              <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: '#8C8D84', paddingTop: 6, paddingHorizontal: 12, paddingBottom: 4 }}>
                {matches.length} {matches.length === 1 ? 'business' : 'businesses'} on Fyll
              </Text>
              {matches.map((match) => {
                const lower = match.name.toLowerCase();
                const at = lower.indexOf(needle);
                const before = at >= 0 ? match.name.slice(0, at) : match.name;
                const hit = at >= 0 ? match.name.slice(at, at + needle.length) : '';
                const after = at >= 0 ? match.name.slice(at + needle.length) : '';
                const meta = [match.category, match.city].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    key={match.slug}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${match.name}`}
                    onPress={() => {
                      onPick(match);
                      setQuery('');
                    }}
                    style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: state.pressed || (state as { hovered?: boolean }).hovered ? '#F3F3EE' : 'transparent' })}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: '#EFEFE9', alignItems: 'center', justifyContent: 'center' }}>
                      {match.logo ? (
                        <Image source={{ uri: match.logo }} resizeMode="cover" style={{ width: 38, height: 38 }} />
                      ) : (
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13.5, color: '#55564E' }}>{match.name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={{ fontFamily: trackingBodyFont, fontSize: 15, color: '#1E1E1E' }} numberOfLines={1}>
                        {before}<Text style={{ fontFamily: 'DMSans_700Bold' }}>{hit}</Text>{after}
                      </Text>
                      {meta ? <Text style={{ fontFamily: trackingBodyFont, fontSize: 12.5, color: '#6B6C63' }} numberOfLines={1}>{meta}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      ) : (
        <Text style={{ fontFamily: trackingBodyFont, fontSize: 12.5, color: 'rgba(244,244,239,0.7)' }}>
          {focused ? 'Type at least 2 letters of the business name.' : "Can't find it? You can still track with just your order number."}
        </Text>
      )}
    </View>
  );
}

function TrackLanding({
  business,
  onChangeBusiness,
  onPickBusiness,
  code,
  onChangeCode,
  email,
  onChangeEmail,
  onSubmit,
  pending,
  openingDeepLink,
  feedback,
}: {
  business: { name: string; logo: string | null } | null;
  onChangeBusiness: () => void;
  onPickBusiness: (match: PublicTrackingBusinessMatch) => void;
  code: string;
  onChangeCode: (value: string) => void;
  email: string;
  onChangeEmail: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  openingDeepLink: boolean;
  feedback: string | null;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const wide = viewportWidth >= 1000;
  const compact = viewportWidth < 720;
  const displayFont = compact ? trackingDisplayFontCompact : trackingDisplayFont;
  const displayWeight = (compact ? '700' : '800') as '700' | '800';
  const [focused, setFocused] = useState<string | null>(null);
  const canSubmit = code.trim().length > 0 && email.trim().length > 0 && !pending;

  const inputStyle = (key: string) => [
    {
      height: 54,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      color: '#1E1E1E',
      fontFamily: trackingBodyFont,
      fontSize: 16,
    },
    Platform.OS === 'web'
      ? ({ outlineStyle: 'none', boxShadow: focused === key ? '0 0 0 3px rgba(213,224,87,0.6)' : 'none' } as object)
      : { borderWidth: 2, borderColor: focused === key ? 'rgba(213,224,87,0.8)' : 'transparent' },
  ];
  const label = (text: string) => (
    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 13.5, color: '#F4F4EF' }}>{text}</Text>
  );

  const form = (
    <View
      style={[
        {
          width: wide ? 500 : '100%',
          borderRadius: compact ? 26 : 30,
          overflow: 'hidden',
          backgroundColor: 'rgba(34,36,26,0.58)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          paddingVertical: compact ? 20 : 30,
          paddingHorizontal: compact ? 16 : 30,
          gap: compact ? 16 : 18,
        },
        Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as object) : null,
      ]}
    >
      {!compact ? (
        <View style={{ gap: 4, paddingBottom: 2 }}>
          <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: 28, letterSpacing: -0.8, color: '#FFFFFF' }}>Track an order</Text>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 14, color: 'rgba(244,244,239,0.75)' }}>
            {business ? 'All three details help us find the right one.' : 'Pick the business, then your order details.'}
          </Text>
        </View>
      ) : null}

      {business ? (
        <View style={{ gap: 8 }}>
          {label('Business')}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Business: ${business.name}. Change business`}
            onPress={onChangeBusiness}
            style={{ height: 54, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingRight: 16 }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: '#EFEFE9', alignItems: 'center', justifyContent: 'center' }}>
              {business.logo ? (
                <Image source={{ uri: business.logo }} resizeMode="cover" style={{ width: 34, height: 34 }} />
              ) : (
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: compact ? 10 : 12.5, color: '#1E1E1E' }}>{business.name.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <Text style={{ flex: 1, fontFamily: 'DMSans_600SemiBold', fontSize: 16, color: '#1E1E1E' }} numberOfLines={1}>{business.name}</Text>
            <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 13.5, color: '#5F6A00' }}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {label('Business')}
          <BusinessPicker onPick={onPickBusiness} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        {label('Order or payment number')}
        <TextInput
          accessibilityLabel="Order or payment number"
          value={code}
          onChangeText={onChangeCode}
          placeholder="e.g. SF-680230, ORD-406541 or SC-QW428VHZZR"
          placeholderTextColor="#8C8D84"
          autoCapitalize="characters"
          autoCorrect={false}
          onFocus={() => setFocused('code')}
          onBlur={() => setFocused(null)}
          returnKeyType="next"
          style={inputStyle('code')}
        />
      </View>
      <View style={{ gap: 8 }}>
        {label('Email')}
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={onChangeEmail}
          placeholder="The email you used at checkout"
          placeholderTextColor="#8C8D84"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused(null)}
          onSubmitEditing={() => { if (canSubmit) onSubmit(); }}
          returnKeyType="go"
          style={inputStyle('email')}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        disabled={!canSubmit}
        style={(state) => ({
          height: 58,
          marginTop: 6,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: canSubmit || pending ? ((state as { hovered?: boolean }).hovered ? '#E1EB6B' : '#D5E057') : 'rgba(255,255,255,0.12)',
          opacity: state.pressed ? 0.88 : 1,
        })}
      >
        {pending ? <ActivityIndicator color="#1E1E1E" /> : null}
        <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 17, color: canSubmit || pending ? '#1E1E1E' : 'rgba(244,244,239,0.55)' }}>
          {pending ? (openingDeepLink ? 'Opening your order…' : 'Finding your order…') : 'Track order'}
        </Text>
        {!pending ? <ArrowRight size={18} color={canSubmit ? '#1E1E1E' : 'rgba(244,244,239,0.55)'} strokeWidth={2.4} /> : null}
      </Pressable>

      {feedback ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(229,119,109,0.16)', borderWidth: 1, borderColor: 'rgba(229,119,109,0.35)' }}>
          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, lineHeight: 19, color: '#FFD3CD', textAlign: 'center' }}>{feedback}</Text>
        </View>
      ) : null}
      <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 11 : 13, lineHeight: 19.5, color: 'rgba(244,244,239,0.72)', textAlign: 'center' }}>
        Your order or payment number is in your confirmation email and in the DM from the business.
      </Text>
    </View>
  );

  const steps = ['Payment verified', 'Order prepared', 'Delivered'];

  return (
    <ImageBackground source={wide ? fyllFieldDesktop : fyllFieldPhone} resizeMode="cover" style={{ flex: 1, backgroundColor: '#3F4A08' }}>
      <LinearGradient
        pointerEvents="none"
        colors={wide ? ['rgba(20,20,20,0.45)', 'rgba(20,20,20,0.1)', 'rgba(20,20,20,0.3)'] : ['rgba(20,20,20,0.35)', 'rgba(20,20,20,0.1)', 'rgba(20,20,20,0.4)']}
        locations={[0, wide ? 0.6 : 0.4, 1]}
        start={wide ? { x: 0, y: 0.3 } : { x: 0.5, y: 0 }}
        end={wide ? { x: 1, y: 0.7 } : { x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: 1200 + (compact ? 40 : 64), alignSelf: 'center', paddingHorizontal: compact ? 20 : 32, paddingTop: compact ? 22 : 30, flexGrow: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 10 : 12 }}>
                <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: (compact ? 24 : 28) * (344 / 195), height: compact ? 24 : 28, tintColor: '#FFFFFF' }} />
                <View style={{ width: 1, height: compact ? 18 : 20, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 15, color: '#F4F4EF' }}>Track</Text>
              </View>

              <View
                style={{
                  flexDirection: wide ? 'row' : 'column',
                  alignItems: wide ? 'flex-start' : 'stretch',
                  justifyContent: 'space-between',
                  gap: wide ? 80 : 28,
                  paddingTop: wide ? 96 : 44,
                }}
              >
                <View style={{ flex: wide ? 1 : undefined, gap: compact ? 14 : 22, paddingTop: wide ? 30 : 0 }}>
                  {wide ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D5E057' }, Platform.OS === 'web' ? ({ boxShadow: '0 0 10px #D5E057' } as object) : null]} />
                      <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: compact ? 12 : 14, color: '#EEF2C4' }}>track.fyll.app</Text>
                    </View>
                  ) : null}
                  <Text style={{ fontFamily: displayFont, fontWeight: displayWeight, fontSize: wide ? 84 : 52, lineHeight: wide ? 80 : 50, letterSpacing: wide ? -3.4 : -2, color: '#FFFFFF' }}>
                    {wide ? "Where's my\norder?" : "Where's my order?"}
                  </Text>
                  <Text style={{ fontFamily: trackingBodyFont, fontSize: wide ? 18 : 15.5, lineHeight: wide ? 28 : 23, color: 'rgba(244,244,239,0.88)', maxWidth: 460 }}>
                    {business
                      ? `Track anything you bought from ${business.name}, from payment to your door.`
                      : 'Track anything you bought from a business on Fyll, from payment to your door.'}
                  </Text>
                  {wide ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 14 }}>
                      {steps.map((step, index) => (
                        <View key={step} style={{ height: 38, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(20,20,20,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: compact ? 12 : 13.5, color: '#D5E057' }}>{index + 1}</Text>
                          <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 12 : 13.5, color: '#F4F4EF' }}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                {form}
              </View>

              <View style={{ marginTop: 'auto', paddingTop: 36, paddingBottom: compact ? 22 : 26, alignItems: 'center' }}>
                <Text style={{ fontFamily: trackingBodyFont, fontSize: compact ? 10 : 13, color: 'rgba(244,244,239,0.65)', textAlign: 'center' }}>
                  Fyll never asks for your bank PIN or password.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

export default function TrackOrderScreen() {
  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold });
  const router = useRouter();
  const isTrackingHost = Platform.OS === 'web'
    && typeof window !== 'undefined'
    && isTrackingHostname(window.location.hostname);
  const params = useLocalSearchParams<{
    code?: string | string[];
    email?: string | string[];
    businessSlug?: string | string[];
    preview?: string | string[];
  }>();
  const businessSlugParam = typeof params.businessSlug === 'string'
    ? params.businessSlug
    : Array.isArray(params.businessSlug)
      ? params.businessSlug[0] ?? ''
      : '';
  const previewParam = typeof params.preview === 'string'
    ? params.preview
    : Array.isArray(params.preview)
      ? params.preview[0] ?? ''
      : '';
  const isLocalPreviewHost = Platform.OS === 'web'
    && typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const previewMode = __DEV__ && isLocalPreviewHost && (previewParam === 'payment' || previewParam === 'order')
    ? previewParam
    : null;
  const localPreviewResult = useMemo(
    () => previewMode ? buildLocalTrackingPreview(previewMode) : null,
    [previewMode]
  );
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
    businessPhone: localBusinessPhone,
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
  const [pickedBusiness, setPickedBusiness] = useState<PublicTrackingBusinessMatch | null>(null);
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
      const businessPhone = typeof businessData.businessPhone === 'string' && businessData.businessPhone.trim()
        ? businessData.businessPhone.trim()
        : null;
      const businessWebsite = typeof businessData.businessWebsite === 'string' && businessData.businessWebsite.trim()
        ? businessData.businessWebsite.trim()
        : null;

      return { businessName, businessLogo, businessPhone, businessWebsite };
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
        const storefrontReference = /^ORD[-_]?/i.test(order.orderNumber)
          ? `SF-${order.orderNumber.replace(/^ORD[-_]?/i, '')}`
          : '';
        const candidates = [
          order.websiteOrderReference,
          order.orderNumber,
          storefrontReference,
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
      businessPhone: publicBusinessQuery.data?.businessPhone ?? localBusinessQuery.data?.businessPhone ?? localBusinessPhone ?? null,
      businessWebsite: publicBusinessQuery.data?.businessWebsite ?? localBusinessQuery.data?.businessWebsite ?? null,
      socialCheckout: null,
      products,
      orderStatuses,
      orderTimelineSettings,
    })
  ), [
    businessId,
    localBusinessQuery.data?.businessLogo,
    localBusinessQuery.data?.businessName,
    localBusinessQuery.data?.businessPhone,
    localBusinessLogo,
    localBusinessPhone,
    localBusinessName,
    localCompanyName,
    localBusinessQuery.data?.businessWebsite,
    orderStatuses,
    orderTimelineSettings,
    products,
    publicBusinessQuery.data?.businessLogo,
    publicBusinessQuery.data?.businessName,
    publicBusinessQuery.data?.businessPhone,
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
          businessSlug: businessSlugParam || pickedBusiness?.slug || null,
        });

        if (remoteResult?.order || remoteResult?.socialCheckout) {
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
  const resultOrderStatuses = lookupMutation.data?.orderStatuses?.length ? lookupMutation.data.orderStatuses : orderStatuses;
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

  useEffect(() => {
    if (localPreviewResult) return;
    if (!codeParam.trim() || !emailParam.trim()) return;
    setHasSearched(true);
    runLookup({ code: codeParam, email: emailParam });
  }, [codeParam, emailParam, localPreviewResult, runLookup]);

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

  const snapshot = resultOrder ? getFulfillmentSnapshot(resultOrder, new Date(), resultOrderStatuses) : null;

  const trackingEta = useMemo(() => buildTrackingEta(resultOrder, resultOrderStatuses), [resultOrder, resultOrderStatuses]);
  const previewEta = useMemo(() => buildTrackingEta(localPreviewResult?.order ?? null, []), [localPreviewResult]);

  const isStoreBackedResult = Boolean(
    resultOrder && orders.some((order) => order.id === resultOrder.id)
  );

  // Customers confirm through the public RPC; signed-in staff update the order directly.
  const showDeliveryConfirmation = Boolean(
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
      if (isStoreBackedResult) {
        await updateOrder(
          resultOrder.id,
          {
            status: deliveredStatusName,
            updatedBy: 'Customer',
            updatedAt: new Date().toISOString(),
          },
          businessId
        );
      } else {
        const lookedUp = lookupMutation.variables;
        // Keep the page as-is so the confirmation message and confetti stay visible.
        await confirmPublicOrderDelivery({
          trackingCode: (lookedUp?.code || lookupCode).trim().toUpperCase(),
          email: (lookedUp?.email || lookupEmail).trim().toLowerCase(),
          businessSlug: businessSlugParam || pickedBusiness?.slug || null,
          received: true,
        });
      }
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

  if (localPreviewResult) {
    return (
      <PurchaseTrackingResult
        result={localPreviewResult}
        logoUri={null}
        publicStep={previewMode === 'order' ? 'processing' : null}
        onReset={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.href = '/order-tracking';
          }
        }}
        canConfirmDelivery={false}
        showDeliveryConfirmation={false}
        confirmingDelivery={false}
        confirmMessage={null}
        onConfirmDelivery={() => {}}
        eta={previewEta}
        trackingCode={localPreviewResult.order?.customerTrackingCode ?? null}
      />
    );
  }

  if (lookupMutation.data && (lookupMutation.data.order || lookupMutation.data.socialCheckout)) {
    return (
      <PurchaseTrackingResult
        result={lookupMutation.data}
        logoUri={trimmedBusinessLogo}
        publicStep={snapshot?.publicStep ?? null}
        onReset={handleReset}
        canConfirmDelivery={canConfirmDelivery}
        showDeliveryConfirmation={showDeliveryConfirmation}
        confirmingDelivery={confirmingDelivery}
        confirmMessage={confirmMessage}
        onConfirmDelivery={() => { void handleConfirmDelivery(); }}
        eta={trackingEta}
        trackingCode={snapshot?.trackingCode ?? null}
        confettiKey={deliveryConfettiKey}
      />
    );
  }

  const landingBusiness = businessSlugParam.trim()
    ? { name: resultBusinessName || slugToDisplayName(businessSlugParam) || 'This business', logo: resultBusinessLogo }
    : pickedBusiness
      ? { name: pickedBusiness.name, logo: pickedBusiness.logo }
      : null;
  const noMatch = hasSearched && !lookupMutation.isPending && lookupMutation.isSuccess && !lookupFeedback;
  const handleChangeBusiness = () => {
    if (!businessSlugParam.trim()) {
      setPickedBusiness(null);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(isTrackingHost ? '/' : '/order-tracking');
      return;
    }
    router.replace('/order-tracking' as never);
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
      openingDeepLink={hasDeepLinkLookup}
      feedback={lookupFeedback ?? (noMatch ? 'No payment or order matched that number and email. Check both and try again.' : null)}
    />
  );
}
