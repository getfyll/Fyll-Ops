import { sanitizeOrderStatuses } from '@/lib/order-status';
import { resolveBusinessAssetUrl } from '@/lib/storage-attachments';
import type {
  Order,
  OrderActivityEntry,
  OrderStatus,
  OrderTimelineSettings,
  OrderTypeTimeline,
  LogisticsInfo,
  Product,
  ShippingZoneTimeline,
} from '@/lib/state/fyll-store';
import { supabase } from '../supabase';

export interface PublicTrackingOrder {
  id: string;
  businessId?: string | null;
  orderNumber: string;
  websiteOrderReference?: string;
  customerTrackingCode?: string;
  customerName: string;
  customerEmail: string;
  deliveryState: string;
  items: Order['items'];
  services: Order['services'];
  orderTypeId?: string;
  orderTypeName?: string;
  status: string;
  totalAmount: number;
  logistics?: LogisticsInfo;
  fulfillmentStage?: Order['fulfillmentStage'];
  fulfillmentStartedAt?: string;
  fulfillmentTimelineDays?: number;
  fulfillmentOriginalEta?: string;
  fulfillmentEffectiveEta?: string;
  deliveryConfirmationStatus?: Order['deliveryConfirmationStatus'];
  deliveryConfirmationRequestedAt?: string;
  deliveryConfirmationConfirmedAt?: string;
  deliveryConfirmationLastResponseAt?: string;
  orderDate: string;
  createdAt: string;
  updatedAt: string;
  activityLog?: Pick<OrderActivityEntry, 'action' | 'date'>[];
}

export interface PublicOrderTrackingLookupResult {
  businessId: string | null;
  businessSlug?: string | null;
  businessName: string;
  businessLogo: string | null;
  businessWebsite: string | null;
  order: PublicTrackingOrder | null;
  products: Pick<Product, 'id' | 'name'>[];
  orderStatuses: OrderStatus[];
  orderTimelineSettings: OrderTimelineSettings | null;
}

export interface PublicTrackingBusinessResult {
  businessId: string | null;
  businessSlug?: string | null;
  businessName: string;
  businessLogo: string | null;
  businessWebsite: string | null;
}

export const normalizePublicTrackingSlug = (value?: string | null) => (
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
);

const DEFAULT_ORDER_TYPE: OrderTypeTimeline = {
  id: 'order-type-standard',
  name: 'Standard order',
  minBusinessDays: 3,
  maxBusinessDays: 7,
  shippingZoneId: null,
  workflowStatusIds: [],
};

const toRoundedPositiveInt = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
};

const normalizeOrderTypeTimeline = (
  value: unknown,
  fallback: OrderTypeTimeline = DEFAULT_ORDER_TYPE,
): OrderTypeTimeline => {
  const next = (value && typeof value === 'object') ? value as Partial<OrderTypeTimeline> : {};
  const minBusinessDays = toRoundedPositiveInt(next.minBusinessDays, fallback.minBusinessDays);
  const maxBusinessDays = Math.max(minBusinessDays, toRoundedPositiveInt(next.maxBusinessDays, fallback.maxBusinessDays));

  return {
    id: typeof next.id === 'string' && next.id.trim() ? next.id.trim() : fallback.id,
    name: typeof next.name === 'string' && next.name.trim() ? next.name.trim() : fallback.name,
    minBusinessDays,
    maxBusinessDays,
    shippingZoneId: typeof next.shippingZoneId === 'string' && next.shippingZoneId.trim()
      ? next.shippingZoneId.trim()
      : null,
    workflowStatusIds: Array.isArray(next.workflowStatusIds)
      ? next.workflowStatusIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.workflowStatusIds ?? [],
  };
};

const normalizeShippingZoneTimeline = (value: unknown): ShippingZoneTimeline | null => {
  const next = (value && typeof value === 'object') ? value as Partial<ShippingZoneTimeline> : null;
  if (!next) return null;

  const id = typeof next.id === 'string' ? next.id.trim() : '';
  const name = typeof next.name === 'string' ? next.name.trim() : '';
  if (!id || !name) return null;

  const minBusinessDays = toRoundedPositiveInt(next.minBusinessDays, 1);
  const maxBusinessDays = Math.max(minBusinessDays, toRoundedPositiveInt(next.maxBusinessDays, minBusinessDays));

  return {
    id,
    name,
    states: Array.isArray(next.states)
      ? next.states.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    shippingFee: Number.isFinite(Number(next.shippingFee)) ? Number(next.shippingFee) : 0,
    minBusinessDays,
    maxBusinessDays,
  };
};

const normalizeOrderTimelineSettings = (value: unknown): OrderTimelineSettings | null => {
  if (!value || typeof value !== 'object') return null;

  const next = value as Partial<OrderTimelineSettings>;
  const warningThresholdPercent = Number.isFinite(Number(next.warningThresholdPercent))
    ? Math.max(50, Math.min(100, Math.round(Number(next.warningThresholdPercent))))
    : 80;

  const defaultOrderType = normalizeOrderTypeTimeline(next.defaultOrderType, DEFAULT_ORDER_TYPE);
  const orderTypes = Array.isArray(next.orderTypes)
    ? next.orderTypes
      .map((item) => normalizeOrderTypeTimeline(item, defaultOrderType))
      .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id && (entry.shippingZoneId ?? null) === (item.shippingZoneId ?? null)) === index)
    : [];
  const shippingZones = Array.isArray(next.shippingZones)
    ? next.shippingZones
      .map((item) => normalizeShippingZoneTimeline(item))
      .filter((item): item is ShippingZoneTimeline => Boolean(item))
    : [];

  return {
    warningThresholdPercent,
    defaultOrderType,
    orderTypes,
    shippingZones,
  };
};

const toTrimmedString = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value.trim() : fallback
);

const toOptionalTrimmedString = (value: unknown) => {
  const next = toTrimmedString(value);
  return next || undefined;
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeLookupOrderPayload = (value: unknown): PublicTrackingOrder | null => {
  if (!value || typeof value !== 'object') return null;

  const next = value as Record<string, unknown>;
  const id = toTrimmedString(next.id);
  const orderNumber = toTrimmedString(next.orderNumber);
  const customerEmail = toTrimmedString(next.customerEmail);
  const customerName = toTrimmedString(next.customerName);
  const status = toTrimmedString(next.status);
  const orderDate = toTrimmedString(next.orderDate);
  const createdAt = toTrimmedString(next.createdAt);
  const updatedAt = toTrimmedString(next.updatedAt);

  if (!id || !orderNumber || !customerEmail || !customerName || !status || !orderDate || !createdAt || !updatedAt) {
    return null;
  }

  const logisticsValue = next.logistics && typeof next.logistics === 'object'
    ? next.logistics as Record<string, unknown>
    : null;
  const trackingNumber = toOptionalTrimmedString(logisticsValue?.trackingNumber);
  const dispatchDate = toOptionalTrimmedString(logisticsValue?.dispatchDate);
  const datePickedUp = toOptionalTrimmedString(logisticsValue?.datePickedUp);
  const logistics = trackingNumber || dispatchDate || datePickedUp
    ? {
        carrierId: toTrimmedString(logisticsValue?.carrierId),
        carrierName: toTrimmedString(logisticsValue?.carrierName),
        trackingNumber: trackingNumber ?? '',
        dispatchDate: dispatchDate ?? '',
        datePickedUp,
      }
    : undefined;

  const activityLog = Array.isArray(next.activityLog)
    ? next.activityLog
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const action = toTrimmedString((entry as Record<string, unknown>).action);
          const date = toTrimmedString((entry as Record<string, unknown>).date);
          if (!action || !date) return null;
          return { action, date };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  return {
    id,
    businessId: toOptionalTrimmedString(next.businessId) ?? null,
    orderNumber,
    websiteOrderReference: toOptionalTrimmedString(next.websiteOrderReference),
    customerTrackingCode: toOptionalTrimmedString(next.customerTrackingCode),
    customerName,
    customerEmail,
    deliveryState: toTrimmedString(next.deliveryState),
    items: Array.isArray(next.items) ? next.items as Order['items'] : [],
    services: Array.isArray(next.services) ? next.services as Order['services'] : [],
    orderTypeId: toOptionalTrimmedString(next.orderTypeId),
    orderTypeName: toOptionalTrimmedString(next.orderTypeName),
    status,
    totalAmount: toFiniteNumber(next.totalAmount, 0),
    logistics,
    fulfillmentStage: ((): Order['fulfillmentStage'] | undefined => {
      const stage = toOptionalTrimmedString(next.fulfillmentStage);
      return (
        stage === 'pending'
        || stage === 'processing'
        || stage === 'completed'
        || stage === 'cancelled'
      ) ? stage : undefined;
    })(),
    fulfillmentStartedAt: toOptionalTrimmedString(next.fulfillmentStartedAt),
    fulfillmentTimelineDays: next.fulfillmentTimelineDays == null ? undefined : toFiniteNumber(next.fulfillmentTimelineDays, 0),
    fulfillmentOriginalEta: toOptionalTrimmedString(next.fulfillmentOriginalEta),
    fulfillmentEffectiveEta: toOptionalTrimmedString(next.fulfillmentEffectiveEta),
    deliveryConfirmationStatus: next.deliveryConfirmationStatus === 'confirmed'
      ? 'confirmed'
      : next.deliveryConfirmationStatus === 'pending'
        ? 'pending'
        : next.deliveryConfirmationStatus === 'requested'
          ? 'requested'
          : undefined,
    deliveryConfirmationRequestedAt: toOptionalTrimmedString(next.deliveryConfirmationRequestedAt),
    deliveryConfirmationConfirmedAt: toOptionalTrimmedString(next.deliveryConfirmationConfirmedAt),
    deliveryConfirmationLastResponseAt: toOptionalTrimmedString(next.deliveryConfirmationLastResponseAt),
    orderDate,
    createdAt,
    updatedAt,
    activityLog,
  };
};

const normalizeLookupPayload = (value: unknown): PublicOrderTrackingLookupResult | null => {
  if (!value || typeof value !== 'object') return null;

  const next = value as Record<string, unknown>;
  const order = normalizeLookupOrderPayload(next.order);
  if (!order) return null;

  const orderStatuses = Array.isArray(next.orderStatuses)
    ? sanitizeOrderStatuses(next.orderStatuses as OrderStatus[])
    : [];

  return {
    businessId: typeof next.businessId === 'string' && next.businessId.trim() ? next.businessId.trim() : null,
    businessSlug: typeof next.businessSlug === 'string' && next.businessSlug.trim() ? next.businessSlug.trim() : null,
    businessName: typeof next.businessName === 'string' ? next.businessName.trim() : '',
    businessLogo: typeof next.businessLogo === 'string' && next.businessLogo.trim() ? next.businessLogo.trim() : null,
    businessWebsite: typeof next.businessWebsite === 'string' && next.businessWebsite.trim() ? next.businessWebsite.trim() : null,
    order,
    products: Array.isArray(next.products) ? next.products as Pick<Product, 'id' | 'name'>[] : [],
    orderStatuses,
    orderTimelineSettings: normalizeOrderTimelineSettings(next.orderTimelineSettings),
  };
};

const normalizeBusinessPayload = (value: unknown): PublicTrackingBusinessResult | null => {
  if (!value || typeof value !== 'object') return null;

  const next = value as Record<string, unknown>;
  const businessName = typeof next.businessName === 'string' ? next.businessName.trim() : '';
  if (!businessName) return null;

  return {
    businessId: typeof next.businessId === 'string' && next.businessId.trim() ? next.businessId.trim() : null,
    businessSlug: typeof next.businessSlug === 'string' && next.businessSlug.trim() ? next.businessSlug.trim() : null,
    businessName,
    businessLogo: typeof next.businessLogo === 'string' && next.businessLogo.trim() ? next.businessLogo.trim() : null,
    businessWebsite: typeof next.businessWebsite === 'string' && next.businessWebsite.trim() ? next.businessWebsite.trim() : null,
  };
};

export const lookupPublicOrderTracking = async ({
  trackingCode,
  email,
  businessSlug,
}: {
  trackingCode: string;
  email: string;
  businessSlug?: string | null;
}) => {
  const normalizedBusinessSlug = normalizePublicTrackingSlug(businessSlug);
  const { data, error } = await supabase.rpc('lookup_public_order_tracking', {
    tracking_code_input: trackingCode,
    email_input: email,
    business_slug_input: normalizedBusinessSlug || null,
  });

  if (error) throw error;
  const normalized = normalizeLookupPayload(data);
  if (!normalized) return null;
  return {
    ...normalized,
    businessLogo: resolveBusinessAssetUrl(normalized.businessLogo),
  };
};

export const fetchPublicTrackingBusiness = async (businessSlug: string) => {
  const normalizedBusinessSlug = normalizePublicTrackingSlug(businessSlug);
  if (!normalizedBusinessSlug) return null;

  const { data, error } = await supabase.rpc('get_public_tracking_business', {
    business_slug_input: normalizedBusinessSlug,
  });

  if (error) throw error;
  const normalized = normalizeBusinessPayload(data);
  if (!normalized) return null;
  return {
    ...normalized,
    businessLogo: resolveBusinessAssetUrl(normalized.businessLogo),
  };
};

export const confirmPublicOrderDelivery = async ({
  trackingCode,
  email,
  businessSlug,
  received,
}: {
  trackingCode: string;
  email: string;
  businessSlug?: string | null;
  received: boolean;
}) => {
  const normalizedBusinessSlug = normalizePublicTrackingSlug(businessSlug);
  const { data, error } = await supabase.rpc('confirm_public_order_delivery', {
    tracking_code_input: trackingCode,
    email_input: email,
    business_slug_input: normalizedBusinessSlug || null,
    received_input: received,
  });

  if (error) throw error;
  return normalizeLookupPayload(data);
};

export const sendDeliveryConfirmationResultEmail = async ({
  trackingCode,
  email,
  businessSlug,
  received,
}: {
  trackingCode: string;
  email: string;
  businessSlug?: string | null;
  received: boolean;
}) => {
  const normalizedBusinessSlug = normalizePublicTrackingSlug(businessSlug);
  const { error } = await supabase.functions.invoke('send-delivery-followup', {
    body: {
      type: 'delivery_confirmation_result',
      trackingCode: trackingCode.trim(),
      email: email.trim().toLowerCase(),
      businessSlug: normalizedBusinessSlug || null,
      received,
    },
  });

  if (error) throw error;
};
