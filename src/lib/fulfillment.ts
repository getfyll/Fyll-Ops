import { findOrderTrackingStageByName } from '@/lib/order-status';
import { normalizeDeliveryStateValue } from '@/lib/format-address';
import type { Order, OrderStatus, OrderTimelineSettings } from '@/lib/state/fyll-store';

export type FulfillmentStageKey = 'processing' | 'dispatch' | 'delivered';
export type OrderFulfillmentStage = 'pending' | 'processing' | 'completed' | 'cancelled';
export type PublicTrackingStep = 'pending-payment' | 'received' | 'processing' | 'out-for-delivery' | 'delivered' | 'completed';

export const DEFAULT_FULFILLMENT_TIMELINE_DAYS = 6;

const matchesAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

const DELIVERED_PATTERNS: RegExp[] = [
  /deliver/i,
  /fulfill(ed)?/i,
  /collection/i,
  /\bcollected?\b/i,
  /\bclosed\b/i,
];

const DISPATCH_PATTERNS: RegExp[] = [
  /dispatch/i,
  /shipp?/i,
  /in[\s-]?transit/i,
  /out[\s-]?for[\s-]?delivery/i,
  /courier/i,
  /rider/i,
  /waybill/i,
  /pick[\s-]?up/i,
];

const PROCESSING_PATTERNS: RegExp[] = [
  /process/i,
  /quality/i,
  /\bready\b/i,
  /\blab\b/i,
  /prescription/i,
  /\bpx\b/i,
  /lens/i,
  /fitt?ing/i,
  /\bpending\b/i,
  /\bnew\b/i,
  /await/i,
  /confirm/i,
];

const PENDING_PATTERNS: RegExp[] = [
  /\bpending\b/i,
  /\bnew\b/i,
  /\breceived\b/i,
  /await/i,
  /confirm/i,
  /draft/i,
];

const CANCELLED_PATTERNS: RegExp[] = [
  /cancel/i,
  /reject/i,
  /refund/i,
];

const safeDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const isBusinessDay = (value: Date) => {
  const day = value.getDay();
  return day !== 0 && day !== 6;
};

export const addBusinessDays = (value: Date, days: number) => {
  const next = new Date(value);
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    if (isBusinessDay(next)) {
      remaining -= 1;
    }
  }
  return next;
};

const countBusinessDaysInclusive = (start: Date, end: Date) => {
  const first = startOfDay(start);
  const last = startOfDay(end);
  if (last.getTime() < first.getTime()) {
    return isBusinessDay(first) ? 1 : 0;
  }

  const current = new Date(first);
  let total = 0;

  while (current.getTime() <= last.getTime()) {
    if (isBusinessDay(current)) {
      total += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return total;
};

const normalizeName = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

const normalizeLocationToken = (value?: string | null) => (
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\b(state|province|region|territory)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const locationsMatch = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeLocationToken(left);
  const normalizedRight = normalizeLocationToken(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return 'Not set';
  const parsed = value instanceof Date ? value : safeDate(value);
  if (!parsed) return 'Not set';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const bucketFulfillmentStatus = (status: string): FulfillmentStageKey | null => {
  const value = (status ?? '').trim().toLowerCase();
  if (!value) return null;

  if (matchesAny(value, [/refund/i, /cancel/i, /reject/i, /\bcomplete(d)?\b/i])) return null;
  if (matchesAny(value, DELIVERED_PATTERNS)) return 'delivered';
  if (matchesAny(value, DISPATCH_PATTERNS)) return 'dispatch';
  if (matchesAny(value, PROCESSING_PATTERNS)) return 'processing';

  // Unknown statuses should stay in early workflow, not dispatch.
  return 'processing';
};

export const getCustomerTrackingCode = (order: Pick<Order, 'customerTrackingCode' | 'orderNumber' | 'id'>) => {
  if (order.customerTrackingCode?.trim()) {
    return order.customerTrackingCode.trim().toUpperCase();
  }

  const base = (order.orderNumber || order.id || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (!base) return 'TRK-UNKNOWN';
  if (base.startsWith('ORD')) return base.replace(/^ORD/, 'TRK');
  return `TRK-${base.slice(-8)}`;
};

export const getOrderFulfillmentStage = (
  order: Pick<Order, 'fulfillmentStage' | 'status' | 'logistics'>,
  orderStatuses?: Pick<OrderStatus, 'name' | 'trackingStage'>[]
): OrderFulfillmentStage => {
  const value = (order.status ?? '').trim().toLowerCase();
  const trackingStage = findOrderTrackingStageByName(order.status, orderStatuses);
  if (!value) return 'pending';

  if (trackingStage === 'cancelled' || matchesAny(value, CANCELLED_PATTERNS)) return 'cancelled';
  if (trackingStage === 'completed' || trackingStage === 'delivered' || matchesAny(value, DELIVERED_PATTERNS)) return 'completed';
  if (trackingStage === 'pending-payment' || trackingStage === 'received' || matchesAny(value, PENDING_PATTERNS)) return 'pending';
  if (trackingStage === 'out-for-delivery') return 'processing';
  if (trackingStage === 'processing') return 'processing';
  if (order.logistics?.dispatchDate || order.logistics?.datePickedUp || matchesAny(value, DISPATCH_PATTERNS)) {
    return 'processing';
  }
  if (matchesAny(value, PROCESSING_PATTERNS)) return 'processing';
  return 'processing';
};

export const resolveOrderTimeline = (
  payload: {
    orderTypeId?: string;
    orderTypeName?: string;
    deliveryState?: unknown;
    deliveryAddress?: unknown;
  },
  settings: OrderTimelineSettings
) => {
  const deliveryState = normalizeDeliveryStateValue(payload.deliveryState, payload.deliveryAddress);
  const shippingZone =
    settings.shippingZones.find((zone) => (
      zone.states.some((state) => locationsMatch(state, deliveryState))
    ))
    ?? settings.shippingZones.find((zone) => zone.states.length === 0)
    ?? null;
  const matchesShippingZone = (shippingZoneId?: string | null) => (
    !!shippingZoneId && shippingZone?.id === shippingZoneId
  );
  const isGlobalTimeline = (shippingZoneId?: string | null) => !shippingZoneId;
  const orderType =
    settings.orderTypes.find((entry) => entry.id === payload.orderTypeId && matchesShippingZone(entry.shippingZoneId))
    ?? settings.orderTypes.find((entry) => entry.id === payload.orderTypeId && isGlobalTimeline(entry.shippingZoneId))
    ?? settings.orderTypes.find((entry) => normalizeName(entry.name) === normalizeName(payload.orderTypeName) && matchesShippingZone(entry.shippingZoneId))
    ?? settings.orderTypes.find((entry) => normalizeName(entry.name) === normalizeName(payload.orderTypeName) && isGlobalTimeline(entry.shippingZoneId))
    ?? settings.orderTypes.find((entry) => matchesShippingZone(entry.shippingZoneId))
    ?? settings.orderTypes.find((entry) => isGlobalTimeline(entry.shippingZoneId))
    ?? settings.orderTypes[0]
    ?? settings.defaultOrderType;
  const processingDays = Math.max(1, Math.round(orderType.maxBusinessDays));
  const deliveryDays = Math.max(0, Math.round(shippingZone?.maxBusinessDays ?? 0));
  const minBusinessDays = Math.max(1, Math.round(orderType.minBusinessDays + (shippingZone?.minBusinessDays ?? 0)));
  const maxBusinessDays = Math.max(minBusinessDays, processingDays + deliveryDays);

  return {
    orderType,
    shippingZone,
    processingDays,
    deliveryDays,
    minBusinessDays,
    maxBusinessDays,
  };
};

export const getFulfillmentTimelineDays = (order: Pick<Order, 'fulfillmentTimelineDays'>) => {
  const raw = Number(order.fulfillmentTimelineDays ?? DEFAULT_FULFILLMENT_TIMELINE_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_FULFILLMENT_TIMELINE_DAYS;
  return Math.max(1, Math.round(raw));
};

export const getFulfillmentStartedAt = (order: Pick<Order, 'fulfillmentStartedAt' | 'createdAt' | 'orderDate'>) => {
  return (
    safeDate(order.fulfillmentStartedAt) ??
    safeDate(order.createdAt) ??
    safeDate(order.orderDate) ??
    new Date()
  );
};

export const getFulfillmentOriginalEta = (
  order: Pick<Order, 'fulfillmentOriginalEta' | 'fulfillmentStartedAt' | 'createdAt' | 'orderDate' | 'fulfillmentTimelineDays'>
) => {
  const explicit = safeDate(order.fulfillmentOriginalEta);
  if (explicit) return explicit;
  return addBusinessDays(getFulfillmentStartedAt(order), getFulfillmentTimelineDays(order));
};

export const getFulfillmentEffectiveEta = (
  order: Pick<
    Order,
    | 'fulfillmentEffectiveEta'
    | 'fulfillmentOriginalEta'
    | 'fulfillmentStartedAt'
    | 'createdAt'
    | 'orderDate'
    | 'fulfillmentTimelineDays'
  >
) => {
  const explicit = safeDate(order.fulfillmentEffectiveEta);
  if (explicit) return explicit;
  return getFulfillmentOriginalEta(order);
};

export const getFulfillmentDayMetrics = (
  order: Pick<Order, 'fulfillmentStartedAt' | 'createdAt' | 'orderDate' | 'fulfillmentTimelineDays'>,
  now = new Date()
) => {
  const startedAt = getFulfillmentStartedAt(order);
  const timelineDays = getFulfillmentTimelineDays(order);
  const elapsedDays = Math.max(1, countBusinessDaysInclusive(startedAt, now));

  return {
    startedAt,
    elapsedDays,
    timelineDays,
    isOverdue: elapsedDays > timelineDays,
  };
};

export const getPublicTrackingStep = (
  order: Pick<
    Order,
    | 'fulfillmentStage'
    | 'status'
    | 'logistics'
  >,
  orderStatuses?: Pick<OrderStatus, 'name' | 'trackingStage'>[]
): PublicTrackingStep => {
  const stage = getOrderFulfillmentStage(order, orderStatuses);
  const value = (order.status ?? '').trim().toLowerCase();
  const trackingStage = findOrderTrackingStageByName(order.status, orderStatuses);

  if (trackingStage === 'completed') return 'completed';
  if (trackingStage === 'delivered' || stage === 'completed' || matchesAny(value, DELIVERED_PATTERNS)) return 'delivered';
  if (trackingStage === 'out-for-delivery' || matchesAny(value, DISPATCH_PATTERNS)) {
    return 'out-for-delivery';
  }
  if (trackingStage === 'processing' || stage === 'processing') return 'processing';
  if (order.logistics?.dispatchDate || order.logistics?.datePickedUp || order.logistics?.trackingNumber) {
    return 'out-for-delivery';
  }
  if (trackingStage === 'pending-payment') return 'pending-payment';
  return 'received';
};

export const getFulfillmentPipelineBucket = (
  order: Pick<Order, 'fulfillmentStage' | 'status' | 'logistics'>,
  orderStatuses?: Pick<OrderStatus, 'name' | 'trackingStage'>[]
): FulfillmentStageKey | null => {
  const stage = getOrderFulfillmentStage(order, orderStatuses);
  if (stage === 'cancelled') return null;
  const publicStep = getPublicTrackingStep(order, orderStatuses);
  if (publicStep === 'delivered' || publicStep === 'completed') return 'delivered';
  if (publicStep === 'out-for-delivery') return 'dispatch';
  return 'processing';
};

export const getFulfillmentStatusMeta = (
  order: Pick<
    Order,
    | 'fulfillmentStage'
    | 'status'
    | 'logistics'
    | 'fulfillmentStartedAt'
    | 'createdAt'
    | 'orderDate'
    | 'fulfillmentTimelineDays'
    | 'fulfillmentOriginalEta'
    | 'fulfillmentEffectiveEta'
    | 'updatedAt'
  >,
  now = new Date(),
  orderStatuses?: Pick<OrderStatus, 'name' | 'trackingStage'>[]
) => {
  const stage = getOrderFulfillmentStage(order, orderStatuses);
  const publicStep = getPublicTrackingStep(order, orderStatuses);
  const { isOverdue } = getFulfillmentDayMetrics(order, now);
  const originalEta = getFulfillmentOriginalEta(order);
  const effectiveEta = getFulfillmentEffectiveEta(order);
  const deliveredAt =
    stage === 'completed'
      ? safeDate(order.updatedAt) ?? effectiveEta
      : null;

  const deliveredOnTime = deliveredAt ? deliveredAt.getTime() <= originalEta.getTime() : effectiveEta.getTime() <= originalEta.getTime();
  const statusLabel = order.status?.trim();
  const deliveredLate = stage === 'completed' && !deliveredOnTime;

  if (stage === 'cancelled') {
    return { label: statusLabel || 'Cancelled', bg: '#FEE2E2', text: '#DC2626', isLate: false };
  }
  if (stage === 'completed') {
    return deliveredOnTime
      ? { label: statusLabel || 'Delivered', bg: '#DCFCE7', text: '#22C55E', isLate: false }
      : { label: 'Exceeded timeline', bg: '#FEE2E2', text: '#DC2626', isLate: true };
  }
  if (publicStep === 'out-for-delivery') {
    return { label: statusLabel || 'On the way', bg: '#DBEAFE', text: '#2563EB', isLate: false };
  }
  if (isOverdue) {
    return { label: statusLabel || 'Delayed', bg: '#FEF3C7', text: '#D97706', isLate: true };
  }
  if (stage === 'processing') {
    return { label: statusLabel || 'Processing', bg: '#30270F', text: '#F5C400', isLate: false };
  }
  return { label: statusLabel || 'Pending', bg: '#F3F4F6', text: '#6B7280', isLate: false };
};

export const getFulfillmentSnapshot = (
  order: Pick<
    Order,
    | 'id'
    | 'orderNumber'
    | 'customerTrackingCode'
    | 'customerEmail'
    | 'fulfillmentStage'
    | 'status'
    | 'logistics'
    | 'fulfillmentStartedAt'
    | 'createdAt'
    | 'orderDate'
    | 'fulfillmentTimelineDays'
    | 'fulfillmentOriginalEta'
    | 'fulfillmentEffectiveEta'
    | 'updatedAt'
  >,
  now = new Date(),
  orderStatuses?: Pick<OrderStatus, 'name' | 'trackingStage'>[]
) => {
  const dayMetrics = getFulfillmentDayMetrics(order, now);
  const originalEta = getFulfillmentOriginalEta(order);
  const effectiveEta = getFulfillmentEffectiveEta(order);
  const statusMeta = getFulfillmentStatusMeta(order, now, orderStatuses);

  return {
    trackingCode: getCustomerTrackingCode(order),
    stage: getOrderFulfillmentStage(order, orderStatuses),
    publicStep: getPublicTrackingStep(order, orderStatuses),
    startedLabel: formatDate(dayMetrics.startedAt),
    dayCountLabel: `Day ${dayMetrics.elapsedDays} / ${dayMetrics.timelineDays}`,
    originalEtaLabel: formatDate(originalEta),
    effectiveEtaLabel: formatDate(effectiveEta),
    customerLookupLabel: order.customerEmail?.trim() ? `Lookup with email: ${order.customerEmail.trim()}` : 'No lookup email set',
    statusMeta,
  };
};
