import { formatCurrency, type Order, type OrderStatus, type Partner, type PartnerJob, type Product } from '@/lib/state/fyll-store';
import { getFulfillmentEffectiveEta, getFulfillmentPipelineBucket, getOrderFulfillmentStage, getPublicTrackingStep } from '@/lib/fulfillment';

// "Needs you today" on the home page: a short, ranked list of things that are
// about to go wrong or are waiting on a person. Everything here is derived from
// data the app already holds; nothing is stored.

export type HomeNeedIcon = 'clock' | 'card' | 'box' | 'lens' | 'qc' | 'case' | 'verify';
export type HomeNeedTone = 'urgent' | 'warn' | 'info';

export interface HomeNeed {
  id: string;
  tone: HomeNeedTone;
  icon: HomeNeedIcon;
  title: string;
  body: string;
  cta: string;
  route: string;
}

export interface HomePaymentRecord {
  id: string;
  status?: string;
  customerName?: string;
  amount?: number;
  sourceOrderId?: string;
  linkedOrderId?: string | null;
  unlinkedOrderId?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TONE_RANK: Record<HomeNeedTone, number> = { urgent: 0, warn: 1, info: 2 };

const normalizeLabel = (value?: string | null) => (
  String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
);

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const joinNames = (names: string[]) => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
};

const getVariantLabel = (product: Product, variantIndex: number) => {
  const variant = product.variants[variantIndex];
  const parts = variant?.variableValues ? Object.values(variant.variableValues).filter(Boolean) : [];
  return [product.name, parts.join(' ')].filter(Boolean).join(' ').trim() || product.name;
};

const buildDueOrdersNeed = (orders: Order[], orderStatuses: OrderStatus[], now: Date): HomeNeed | null => {
  const endOfTomorrow = startOfDay(now).getTime() + 2 * DAY_MS - 1;
  const todayStart = startOfDay(now).getTime();
  const due = orders.filter((order) => {
    if (getFulfillmentPipelineBucket(order, orderStatuses) !== 'processing') return false;
    if (getPublicTrackingStep(order, orderStatuses) === 'pending-payment') return false;
    const eta = getFulfillmentEffectiveEta(order).getTime();
    return Number.isFinite(eta) && eta <= endOfTomorrow;
  });
  if (due.length === 0) return null;

  const overdueCount = due.filter((order) => getFulfillmentEffectiveEta(order).getTime() < todayStart).length;
  const dueToday = due.filter((order) => {
    const eta = getFulfillmentEffectiveEta(order).getTime();
    return eta >= todayStart && eta < todayStart + DAY_MS;
  }).length;
  const when = overdueCount > 0 ? 'past their ETA' : dueToday > 0 ? 'due today' : 'due tomorrow';
  const title = overdueCount > 0
    ? `${due.length} ${plural(due.length, 'order is', 'orders are')} past ${plural(due.length, 'its', 'their')} ETA and still in Processing`
    : `${due.length} ${plural(due.length, 'order', 'orders')} ${when} ${plural(due.length, 'is', 'are')} still in Processing`;
  const names = due
    .slice()
    .sort((a, b) => getFulfillmentEffectiveEta(a).getTime() - getFulfillmentEffectiveEta(b).getTime())
    .map((order) => order.orderNumber);

  return {
    id: 'due-orders',
    tone: 'urgent',
    icon: 'clock',
    title,
    body: `${joinNames(names)}. Start QC today to keep ${plural(due.length, 'it', 'them')} on time.`,
    cta: 'View orders',
    route: '/(tabs)/orders',
  };
};

const buildUnlinkedPaymentsNeed = (payments: HomePaymentRecord[], orders: Order[]): HomeNeed | null => {
  const unlinked = payments.filter((payment) => {
    const status = normalizeLabel(payment.status);
    if (!['verified', 'confirmed', 'payment confirmed', 'paid'].includes(status)) return false;
    if (payment.linkedOrderId) return false;
    return !orders.some((order) => (
      order.id === payment.sourceOrderId
      || order.orderNumber === payment.sourceOrderId
      || order.id === payment.unlinkedOrderId
    ));
  });
  if (unlinked.length === 0) return null;

  const first = unlinked[0];
  const who = first.customerName?.trim() || 'A customer';
  return {
    id: 'unlinked-payments',
    tone: 'warn',
    icon: 'card',
    title: unlinked.length === 1 ? 'A paid payment has no order' : `${unlinked.length} paid payments have no order`,
    body: unlinked.length === 1
      ? `${who} paid ${formatCurrency(first.amount ?? 0)}. Create the order so fulfilment can start.`
      : `${who} paid ${formatCurrency(first.amount ?? 0)}, plus ${unlinked.length - 1} more. Create the orders so fulfilment can start.`,
    cta: 'Create order',
    route: `/storefront-payment/${first.id}`,
  };
};

const buildLowStockNeed = (
  products: Product[],
  orders: Order[],
  globalThreshold: { enabled: boolean; value: number },
  now: Date
): HomeNeed | null => {
  const windowStart = now.getTime() - 30 * DAY_MS;
  const sold = new Map<string, number>();
  orders.forEach((order) => {
    const placedAt = toTime(order.orderDate ?? order.createdAt);
    if (placedAt === null || placedAt < windowStart) return;
    if (/cancel/i.test(order.status ?? '')) return;
    order.items.forEach((item) => {
      if (!item.variantId) return;
      sold.set(item.variantId, (sold.get(item.variantId) ?? 0) + item.quantity);
    });
  });

  type Candidate = { productId: string; label: string; stock: number; sold30: number; daysLeft: number };
  const candidates: Candidate[] = [];
  products.forEach((product) => {
    if (product.isArchived || product.isDiscontinued || product.productType === 'service') return;
    const threshold = globalThreshold.enabled ? globalThreshold.value : product.lowStockThreshold;
    product.variants.forEach((variant, index) => {
      const sold30 = sold.get(variant.id) ?? 0;
      if (sold30 < 3) return;
      const stock = Math.max(0, variant.stock ?? 0);
      const perDay = sold30 / 30;
      const daysLeft = stock / perDay;
      if (stock <= 0 || stock <= threshold || daysLeft <= 3) {
        candidates.push({ productId: product.id, label: getVariantLabel(product, index), stock, sold30, daysLeft });
      }
    });
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.daysLeft - b.daysLeft);
  const worst = candidates[0];
  const more = candidates.length - 1;
  const lasts = worst.daysLeft <= 1 ? 'about a day' : `about ${Math.round(worst.daysLeft)} days`;
  const base = worst.stock <= 0
    ? `Sold out. You sold ${worst.sold30} in 30 days.`
    : `${worst.stock} left. You sold ${worst.sold30} in 30 days, so this lasts ${lasts}.`;

  return {
    id: 'low-stock',
    tone: 'warn',
    icon: 'box',
    title: worst.stock <= 0 ? `${worst.label} is sold out` : `${worst.label} is almost sold out`,
    body: more > 0 ? `${base} ${more} more ${plural(more, 'item is', 'items are')} running low.` : base,
    cta: 'Restock',
    route: `/product/${worst.productId}`,
  };
};

const buildPartnerDelayNeed = (partnerJobs: PartnerJob[], partners: Partner[], now: Date): HomeNeed | null => {
  const days = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY_MS));

  const usualByPartner = new Map<string, number>();
  const durations = new Map<string, number[]>();
  partnerJobs.forEach((job) => {
    const start = toTime(job.dispatchedAt);
    const end = toTime(job.collectedAt);
    if (start === null || end === null || end < start) return;
    durations.set(job.partnerId, [...(durations.get(job.partnerId) ?? []), days(start, end)]);
  });
  durations.forEach((list, partnerId) => {
    if (list.length >= 2) usualByPartner.set(partnerId, Math.max(1, Math.round(list.reduce((sum, value) => sum + value, 0) / list.length)));
  });

  type Late = { job: PartnerJob; elapsed: number; usual: number };
  const late: Late[] = [];
  partnerJobs.forEach((job) => {
    if (job.collectedAt || job.billedAt) return;
    if (/cancel|reject|declin|sent to business|returned|ready|bill|paid|complet|collect/i.test(normalizeLabel(job.status))) return;
    const start = toTime(job.dispatchedAt);
    if (start === null) return;
    const elapsed = days(start, now.getTime());
    const usual = usualByPartner.get(job.partnerId) ?? 3;
    // Jobs older than three weeks are almost always forgotten records, not live delays.
    if (elapsed >= 3 && elapsed <= 21 && elapsed > usual + 1) late.push({ job, elapsed, usual });
  });
  if (late.length === 0) return null;

  late.sort((a, b) => (b.elapsed - b.usual) - (a.elapsed - a.usual));
  const worst = late[0];
  const partnerName = partners.find((partner) => partner.id === worst.job.partnerId)?.name ?? 'the partner';
  const customer = worst.job.customerName?.trim();
  const title = late.length === 1
    ? `${customer ? `${customer}’s job` : 'A partner job'} is taking longer than usual`
    : `${late.length} partner jobs are taking longer than usual`;

  return {
    id: 'partner-delay',
    tone: 'warn',
    icon: 'lens',
    title,
    body: `At ${partnerName} for ${worst.elapsed} days. They usually take ${worst.usual}.`,
    cta: 'Message partner',
    route: '/partners?partnerSection=jobs',
  };
};

const buildQcQueueNeed = (orders: Order[], orderStatuses: OrderStatus[], now: Date): HomeNeed | null => {
  const waiting = orders.filter((order) => {
    if (!/quality|\bqc\b/i.test(order.status ?? '')) return false;
    const stage = getOrderFulfillmentStage(order, orderStatuses);
    return stage !== 'completed' && stage !== 'cancelled';
  });
  if (waiting.length === 0) return null;

  const oldest = waiting
    .slice()
    .sort((a, b) => (toTime(a.updatedAt ?? a.createdAt) ?? 0) - (toTime(b.updatedAt ?? b.createdAt) ?? 0))[0];
  const since = toTime(oldest.updatedAt ?? oldest.createdAt);
  const ageDays = since === null ? 0 : Math.round((startOfDay(now).getTime() - startOfDay(new Date(since)).getTime()) / DAY_MS);
  const sinceLabel = ageDays <= 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;

  return {
    id: 'qc-queue',
    tone: 'info',
    icon: 'qc',
    title: `${waiting.length} ${plural(waiting.length, 'order is', 'orders are')} ready for quality control`,
    body: waiting.length === 1 ? `${oldest.orderNumber} has been waiting since ${sinceLabel}.` : `Oldest has been waiting since ${sinceLabel}.`,
    cta: 'Start QC',
    route: waiting.length === 1 ? `/order/${oldest.id}` : '/(tabs)/orders',
  };
};

export const buildHomeNeeds = ({
  orders,
  products,
  partnerJobs,
  partners,
  orderStatuses,
  payments,
  openCasesCount,
  pendingVerificationCount,
  globalLowStock,
  now = new Date(),
}: {
  orders: Order[];
  products: Product[];
  partnerJobs: PartnerJob[];
  partners: Partner[];
  orderStatuses: OrderStatus[];
  // null = this person can't act on payments (or they aren't loaded), so skip those items.
  payments: HomePaymentRecord[] | null;
  openCasesCount: number;
  pendingVerificationCount: number;
  globalLowStock: { enabled: boolean; value: number };
  now?: Date;
}): HomeNeed[] => {
  const needs: (HomeNeed | null)[] = [
    buildDueOrdersNeed(orders, orderStatuses, now),
    payments ? buildUnlinkedPaymentsNeed(payments, orders) : null,
    pendingVerificationCount > 0 ? {
      id: 'verify-payments',
      tone: 'warn',
      icon: 'verify',
      title: `${pendingVerificationCount} ${plural(pendingVerificationCount, 'payment is', 'payments are')} waiting for you to verify`,
      body: 'Customers have submitted proof of payment.',
      cta: 'Review',
      route: '/payments',
    } : null,
    buildLowStockNeed(products, orders, globalLowStock, now),
    buildPartnerDelayNeed(partnerJobs, partners, now),
    buildQcQueueNeed(orders, orderStatuses, now),
    openCasesCount > 0 ? {
      id: 'open-cases',
      tone: 'info',
      icon: 'case',
      title: `${openCasesCount} open ${plural(openCasesCount, 'case needs', 'cases need')} attention`,
      body: 'Customers are waiting on a reply.',
      cta: 'View cases',
      route: '/cases',
    } : null,
  ];

  return needs
    .filter((need): need is HomeNeed => need !== null)
    .map((need, index) => ({ need, index }))
    .sort((a, b) => (TONE_RANK[a.need.tone] - TONE_RANK[b.need.tone]) || (a.index - b.index))
    .map(({ need }) => need);
};
