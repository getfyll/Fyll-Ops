export type OrderTrackingStage =
  | 'pending-payment'
  | 'received'
  | 'processing'
  | 'out-for-delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export const ORDER_TRACKING_STAGE_OPTIONS: { value: OrderTrackingStage; label: string }[] = [
  { value: 'pending-payment', label: 'Pending Payment' },
  { value: 'received', label: 'Order Received' },
  { value: 'processing', label: 'Processing' },
  { value: 'out-for-delivery', label: 'Out For Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

type OrderStatusLike = {
  id?: string;
  name: string;
  color?: string;
  order?: number;
  trackingStage?: OrderTrackingStage;
  wooCommerceStatusSlug?: string;
};

const normalizeWooStatusSlug = (value?: string | null) => (
  value
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '')
    ?? ''
);

const matchesAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

const CANCELLED_PATTERNS: RegExp[] = [
  /cancel/i,
  /reject/i,
  /refund/i,
];

const PENDING_DELIVERY_PATTERNS: RegExp[] = [
  /pending[\s-]?delivery/i,
  /delivery[\s-]?pending/i,
  /awaiting[\s-]?delivery/i,
  /still[\s-]?expect/i,
];

const DELIVERED_PATTERNS: RegExp[] = [
  /deliver/i,
  /fulfilled?/i,
  /collection/i,
  /\bcollected?\b/i,
];

const COMPLETED_PATTERNS: RegExp[] = [
  /\bclosed\b/i,
  /\bcomplete(d)?\b/i,
];

const OUT_FOR_DELIVERY_PATTERNS: RegExp[] = [
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
  /\bpending\b/i,
  /\bnew\b/i,
  /await/i,
  /confirm/i,
  /lens/i,
  /fit/i,
];

const PENDING_PAYMENT_PATTERNS: RegExp[] = [
  /pending[\s-]?payment/i,
  /awaiting[\s-]?payment/i,
  /unpaid/i,
  /payment[\s-]?pending/i,
];

const normalizeName = (value?: string | null) => value?.trim().toLowerCase() ?? '';

export const inferOrderTrackingStage = (name?: string | null): OrderTrackingStage => {
  const value = normalizeName(name);
  if (!value) return 'received';
  if (matchesAny(value, CANCELLED_PATTERNS)) return 'cancelled';
  if (matchesAny(value, PENDING_PAYMENT_PATTERNS)) return 'pending-payment';
  if (matchesAny(value, PENDING_DELIVERY_PATTERNS)) return 'out-for-delivery';
  if (matchesAny(value, COMPLETED_PATTERNS)) return 'completed';
  if (matchesAny(value, DELIVERED_PATTERNS)) return 'delivered';
  if (matchesAny(value, OUT_FOR_DELIVERY_PATTERNS)) return 'out-for-delivery';
  if (matchesAny(value, PROCESSING_PATTERNS)) return 'processing';
  return 'received';
};

export const resolveOrderTrackingStage = (
  status?: Pick<OrderStatusLike, 'name' | 'trackingStage'> | null
): OrderTrackingStage => status?.trackingStage ?? inferOrderTrackingStage(status?.name);

export const findOrderTrackingStageByName = (
  statusName: string | undefined | null,
  statuses?: readonly OrderStatusLike[] | null
): OrderTrackingStage => {
  const normalizedStatusName = normalizeName(statusName);
  const matchedStatus = statuses?.find((status) => normalizeName(status.name) === normalizedStatusName);
  return resolveOrderTrackingStage(matchedStatus ?? (statusName ? { name: statusName } : null));
};

export const isOrderStatusException = (
  status?: Pick<OrderStatusLike, 'name' | 'trackingStage'> | null
) => resolveOrderTrackingStage(status) === 'cancelled';

export const sortOrderStatusesForFulfillment = <T extends OrderStatusLike>(statuses: readonly T[]) => (
  [...statuses].sort((a, b) => {
    const aException = isOrderStatusException(a);
    const bException = isOrderStatusException(b);
    if (aException !== bException) return aException ? 1 : -1;
    const aOrder = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  })
);

export const sanitizeOrderStatus = <T extends OrderStatusLike>(status: T, index = 0): T => ({
  ...status,
  name: status.name.trim(),
  color: status.color ?? '#6B7280',
  order: typeof status.order === 'number' ? status.order : index + 1,
  trackingStage: resolveOrderTrackingStage(status),
  wooCommerceStatusSlug: normalizeWooStatusSlug(status.wooCommerceStatusSlug) || undefined,
});

export const sanitizeOrderStatuses = <T extends OrderStatusLike>(statuses: readonly T[]): T[] => (
  statuses
    .filter((status) => status?.name?.trim())
    .map((status, index) => sanitizeOrderStatus(status, index))
);
