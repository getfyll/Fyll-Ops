import { getFulfillmentPipelineBucket, type FulfillmentStageKey } from '@/lib/fulfillment';
import type {
  AuditLog,
  Case,
  Customer,
  ExpenseRequest,
  Order,
  OrderStatus,
  Partner,
  PartnerJob,
  Product,
} from '@/lib/state/fyll-store';

export interface DashboardTrendDay {
  key: string;
  label: string;
  value: number;
  orders: number;
}

export interface DashboardRevenueTrend {
  days: DashboardTrendDay[];
  total: number;
  ordersTotal: number;
  change: number | null;
  ordersChange: number | null;
}

export interface DashboardMostSoldProduct {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
}

export interface DashboardPlatformBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export interface DashboardRecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  status: string;
  orderDate: string;
  createdAt: string;
  createdBy?: string;
  itemName: string;
  itemDetail: string;
}

export interface DashboardRecentPartnerJob {
  id: string;
  partnerId: string;
  partnerName: string;
  customerName: string;
  jobType?: string;
  itemLabel?: string;
  status: string;
  dispatchedAt?: string;
  createdAt: string;
}

export interface DashboardSnapshot {
  schemaVersion: 2;
  businessId: string;
  periodKey: string;
  updatedAt: string;
  totalRevenue: number;
  revenueChange: number;
  productSales: number;
  deliveryFees: number;
  servicesRevenue: number;
  pendingOrders: number;
  totalOrders: number;
  productCount: number;
  inventoryVariantCount: number;
  customerCount: number;
  openCasesCount: number;
  activePartnerJobsCount: number;
  fulfillment: Record<FulfillmentStageKey, number>;
  revenueTrend7d: DashboardRevenueTrend;
  mostSoldProducts: DashboardMostSoldProduct[];
  platformBreakdown: DashboardPlatformBreakdown[];
  recentOrders: DashboardRecentOrder[];
  recentPartnerJobs: DashboardRecentPartnerJob[];
  newOrdersLast24Hours: number;
  newOrderCreatedAtLast24Hours: string[];
  submittedExpenseRequestCount: number;
  submittedExpenseRequestCountByUser: Record<string, number>;
  hasAuditForPeriod: boolean;
}

export const getDashboardPeriodKey = (date = new Date()) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

export const buildDashboardSnapshot = ({
  businessId,
  products,
  orders,
  customers,
  cases,
  partnerJobs,
  partners = [],
  expenseRequests = [],
  auditLogs = [],
  orderStatuses,
  updatedAt = new Date().toISOString(),
  asOf,
}: {
  businessId: string;
  products: Product[];
  orders: Order[];
  customers: Customer[];
  cases: Case[];
  partnerJobs: PartnerJob[];
  partners?: Partner[];
  expenseRequests?: ExpenseRequest[];
  auditLogs?: AuditLog[];
  orderStatuses?: OrderStatus[];
  updatedAt?: string;
  asOf?: Date;
}): DashboardSnapshot => {
  const now = asOf ?? new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  let totalRevenue = 0;
  let lastMonthRevenue = 0;
  let productSales = 0;
  let deliveryFees = 0;
  let servicesRevenue = 0;
  let pendingOrders = 0;
  const fulfillment: Record<FulfillmentStageKey, number> = {
    processing: 0,
    dispatch: 0,
    delivered: 0,
  };
  const trendDays = 7;
  const toDayId = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const trendStart = new Date(now);
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - (trendDays - 1));
  const previousTrendStart = new Date(trendStart);
  previousTrendStart.setDate(previousTrendStart.getDate() - trendDays);
  const revenueByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();
  const quantityByProductId = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  let previousTrendRevenue = 0;
  let previousTrendOrders = 0;
  let newOrdersLast24Hours = 0;
  const newOrderCreatedAtLast24Hours: string[] = [];

  orders.forEach((order) => {
    const status = order.status.trim().toLowerCase();
    if (status !== 'delivered' && status !== 'completed' && status !== 'refunded') {
      pendingOrders += 1;
    }

    const fulfillmentBucket = getFulfillmentPipelineBucket(order, orderStatuses);
    if (fulfillmentBucket) fulfillment[fulfillmentBucket] += 1;
    const createdAtMs = new Date(order.createdAt).getTime();
    const createdAgeMs = now.getTime() - createdAtMs;
    if (Number.isFinite(createdAtMs) && createdAgeMs >= 0 && createdAgeMs < 24 * 60 * 60 * 1000) {
      newOrdersLast24Hours += 1;
      newOrderCreatedAtLast24Hours.push(order.createdAt);
    }
    const platform = order.source || 'Unknown';
    platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    if (status === 'refunded') return;

    const orderDate = new Date(order.orderDate ?? order.createdAt);
    order.items?.forEach((item) => {
      if (!item.productId) return;
      quantityByProductId.set(
        item.productId,
        (quantityByProductId.get(item.productId) ?? 0) + (item.quantity ?? 0)
      );
    });
    if (orderDate >= previousTrendStart && orderDate <= end) {
      if (orderDate < trendStart) {
        previousTrendRevenue += order.totalAmount;
        previousTrendOrders += 1;
      } else {
        const dayKey = toDayId(orderDate);
        revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + order.totalAmount);
        ordersByDay.set(dayKey, (ordersByDay.get(dayKey) ?? 0) + 1);
      }
    }
    const month = orderDate.getMonth();
    const year = orderDate.getFullYear();
    if (month === currentMonth && year === currentYear) {
      totalRevenue += order.totalAmount;
      productSales += order.subtotal || order.totalAmount;
      deliveryFees += order.deliveryFee || 0;
      servicesRevenue += order.services?.reduce((sum, service) => sum + service.price, 0) || 0;
    } else if (month === lastMonth && year === lastMonthYear) {
      lastMonthRevenue += order.totalAmount;
    }
  });

  const trendDayRows = Array.from({ length: trendDays }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);
    const key = toDayId(date);
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      value: revenueByDay.get(key) ?? 0,
      orders: ordersByDay.get(key) ?? 0,
    };
  });
  const trendTotal = trendDayRows.reduce((sum, day) => sum + day.value, 0);
  const trendOrdersTotal = trendDayRows.reduce((sum, day) => sum + day.orders, 0);
  const productById = new Map(products.map((product) => [product.id, product]));
  const mostSoldProducts = Array.from(quantityByProductId.entries())
    .map(([productId, quantity]) => {
      const product = productById.get(productId);
      return {
        productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.variants?.[0]?.sku ?? '—',
        quantity,
      };
    })
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 8);
  const platformBreakdown = Array.from(platformCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / Math.max(orders.length, 1)) * 100),
    }));
  const recentOrders = [...orders]
    .sort((left, right) => (
      new Date(right.orderDate ?? right.createdAt).getTime()
      - new Date(left.orderDate ?? left.createdAt).getTime()
    ))
    .slice(0, 10)
    .map((order) => {
      const firstItem = order.items?.[0];
      const product = firstItem?.productId ? productById.get(firstItem.productId) : undefined;
      const variant = product?.variants?.find((candidate) => candidate.id === firstItem?.variantId);
      const selectedOptions = Object.entries(firstItem?.selectedOptions ?? {})
        .filter(([name, value]) => name.trim() && String(value).trim())
        .map(([name, value]) => `${name}: ${value}`)
        .join(' / ');
      const variantName = variant ? Object.values(variant.variableValues ?? {}).join(' / ') : '';
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        status: order.status,
        orderDate: order.orderDate,
        createdAt: order.createdAt,
        createdBy: order.createdBy,
        itemName: product?.name ?? 'Unknown Product',
        itemDetail: [variantName, selectedOptions].filter(Boolean).join(' / ') || (variant?.sku ?? 'N/A'),
      };
    });
  const partnerNameById = new Map(partners.map((partner) => [partner.id, partner.name]));
  const recentPartnerJobs = [...partnerJobs]
    .sort((left, right) => (
      new Date(right.dispatchedAt ?? right.createdAt).getTime()
      - new Date(left.dispatchedAt ?? left.createdAt).getTime()
    ))
    .slice(0, 5)
    .map((job) => ({
      id: job.id,
      partnerId: job.partnerId,
      partnerName: partnerNameById.get(job.partnerId) ?? '',
      customerName: job.customerName,
      jobType: job.jobType,
      itemLabel: job.itemLabel,
      status: job.status,
      dispatchedAt: job.dispatchedAt,
      createdAt: job.createdAt,
    }));
  const submittedExpenseRequests = expenseRequests.filter((request) => request.status === 'submitted');
  const submittedExpenseRequestCountByUser = submittedExpenseRequests.reduce<Record<string, number>>(
    (counts, request) => {
      counts[request.submittedByUserId] = (counts[request.submittedByUserId] ?? 0) + 1;
      return counts;
    },
    {}
  );

  return {
    schemaVersion: 2,
    businessId,
    periodKey: getDashboardPeriodKey(now),
    updatedAt,
    totalRevenue,
    revenueChange: lastMonthRevenue > 0
      ? Math.round(((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0,
    productSales,
    deliveryFees,
    servicesRevenue,
    pendingOrders,
    totalOrders: orders.length,
    productCount: products.length,
    inventoryVariantCount: products.reduce((sum, product) => sum + (product.variants?.length ?? 0), 0),
    customerCount: customers.length,
    openCasesCount: cases.filter((caseItem) => caseItem.status !== 'Closed' && caseItem.status !== 'Resolved').length,
    activePartnerJobsCount: partnerJobs.filter((job) => !['collected', 'billed', 'cancelled'].includes(job.status)).length,
    fulfillment,
    revenueTrend7d: {
      days: trendDayRows,
      total: trendTotal,
      ordersTotal: trendOrdersTotal,
      change: previousTrendRevenue > 0
        ? Math.round(((trendTotal - previousTrendRevenue) / previousTrendRevenue) * 100)
        : null,
      ordersChange: previousTrendOrders > 0
        ? Math.round(((trendOrdersTotal - previousTrendOrders) / previousTrendOrders) * 100)
        : null,
    },
    mostSoldProducts,
    platformBreakdown,
    recentOrders,
    recentPartnerJobs,
    newOrdersLast24Hours,
    newOrderCreatedAtLast24Hours,
    submittedExpenseRequestCount: submittedExpenseRequests.length,
    submittedExpenseRequestCountByUser,
    hasAuditForPeriod: auditLogs.some((audit) => audit.month === currentMonth && audit.year === currentYear),
  };
};

export const isCompleteDashboardSnapshot = (
  snapshot: DashboardSnapshot | null | undefined
): snapshot is DashboardSnapshot => snapshot?.schemaVersion === 2;
