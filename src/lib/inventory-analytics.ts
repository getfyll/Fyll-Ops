// Inventory analytics utilities for computing stats from products, variants, orders, and restock logs

import type { Product, Order, RestockLog } from './state/fyll-store';
import { getDateRange, getPreviousPeriodRange, percentChange, type TimeRange, type ChartDataPoint } from './analytics-utils';

const isServiceProduct = (product: Product): boolean => {
  if (product.productType === 'service') return true;
  return Boolean(
    (product.serviceTags?.length ?? 0) > 0
    || (product.serviceVariables?.length ?? 0) > 0
    || (product.serviceFields?.length ?? 0) > 0
  );
};

const isInventoryCountableProduct = (product: Product): boolean => {
  if (isServiceProduct(product)) return false;
  if (product.isArchived || product.isDiscontinued) return false;
  if (product.catalogSource === 'woocommerce-plugin') return false;
  if (product.createdBy === 'WooCommerce Sync') return false;
  if (product.wooCommerceProductId || product.sourceProductId || product.websiteProductId) return false;
  if (product.variants.some((variant) => variant.wooCommerceProductId || variant.sourceProductId)) return false;
  return true;
};

export interface InventoryOverview {
  totalProducts: number;
  totalVariants: number;
  totalUnitsInStock: number;
  totalInventoryValue: number;
  lowStockItems: number;
  outOfStockItems: number;
}

export interface RestockInsights {
  totalRestocks: number;
  totalUnitsRestocked: number;
  mostRestockedProducts: { productId: string; productName: string; restockCount: number }[];
  mostRestockedByUnits: { productId: string; productName: string; totalUnits: number }[];
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  variantName?: string;
  unitsSold: number;
  revenue: number;
  stockRemaining: number;
  stockCoverDays?: number; // Days of stock remaining based on recent sales rate
}

export interface InventoryAnalyticsResult {
  // Overview
  overview: InventoryOverview;

  // Restock insights
  restockInsights: RestockInsights;

  // Sales-linked performance
  bestSellingProducts: ProductPerformance[];
  topProductsByRevenue: ProductPerformance[];
  slowMovers: ProductPerformance[]; // Worst sellers / slow moving products

  // Chart data
  restocksOverTime: ChartDataPoint[];

  // KPIs with change
  kpiMetrics: {
    restocks: { value: number; change: number };
    unitsRestocked: { value: number; change: number };
  };

  // Lists for drill-down
  lowStockList: { productId: string; productName: string; variantName: string; stock: number; threshold: number }[];
  outOfStockList: { productId: string; productName: string; variantName: string }[];

  // New Designs analytics
  newDesigns: NewDesignAnalytics;
}

export interface NewDesignAnalytics {
  totalNewDesigns: number; // Products where isNewDesign = true and designYear = selected year
  newDesignsRestocked: number; // Count of new design products with >= 1 restock event
  totalRestocksForNewDesigns: number; // Total restock events for new designs
  totalUnitsRestockedForNewDesigns: number; // Total units restocked for new designs
  topRestockedNewDesigns: NewDesignPerformance[];
  allNewDesigns: NewDesignPerformance[];
}

export interface NewDesignPerformance {
  productId: string;
  productName: string;
  designYear: number;
  stockRemaining: number;
  unitsSold: number;
  restockCount: number;
  unitsRestocked: number;
}

export interface DiscontinueCandidatePerformance {
  productId: string;
  productName: string;
  currentStock: number;
  unitsSoldInPeriod: number;
  lastSoldDate: string | null;
  restockCountThisYear: number;
  daysInStock: number; // Days since product was created
  isDiscontinued: boolean;
}

export interface DiscontinueCandidatesResult {
  candidates: DiscontinueCandidatePerformance[];
  totalCandidates: number;
}

export type DiscontinuePeriod = '30d' | '90d' | 'year';

/**
 * Calculate inventory overview metrics
 * @param products - List of products
 * @param globalThreshold - Optional global low stock threshold (overrides per-product thresholds)
 */
export function calculateInventoryOverview(products: Product[], globalThreshold?: number): InventoryOverview {
  let totalVariants = 0;
  let totalUnitsInStock = 0;
  let totalInventoryValue = 0;
  let lowStockItems = 0;
  let outOfStockItems = 0;
  let totalProducts = 0;

  products.forEach((product) => {
    if (!isInventoryCountableProduct(product)) return;
    totalProducts++;
    const threshold = globalThreshold ?? product.lowStockThreshold ?? 5;

    product.variants.forEach((variant) => {
      totalVariants++;
      totalUnitsInStock += variant.stock;
      totalInventoryValue += variant.stock * variant.sellingPrice;

      if (variant.stock === 0) {
        outOfStockItems++;
      } else if (variant.stock <= threshold) {
        lowStockItems++;
      }
    });
  });

  return {
    totalProducts,
    totalVariants,
    totalUnitsInStock,
    totalInventoryValue,
    lowStockItems,
    outOfStockItems,
  };
}

/**
 * Get low stock items list
 * @param products - List of products
 * @param globalThreshold - Optional global low stock threshold (overrides per-product thresholds)
 */
export function getLowStockItems(products: Product[], globalThreshold?: number): { productId: string; productName: string; variantName: string; stock: number; threshold: number }[] {
  const items: { productId: string; productName: string; variantName: string; stock: number; threshold: number }[] = [];

  products.forEach((product) => {
    if (isServiceProduct(product)) return;
    const threshold = globalThreshold ?? product.lowStockThreshold ?? 5;

    product.variants.forEach((variant) => {
      if (variant.stock > 0 && variant.stock <= threshold) {
        const variantName = Object.values(variant.variableValues).join(' / ') || 'Default';
        items.push({
          productId: product.id,
          productName: product.name,
          variantName,
          stock: variant.stock,
          threshold,
        });
      }
    });
  });

  return items.sort((a, b) => a.stock - b.stock);
}

/**
 * Get out of stock items list
 */
export function getOutOfStockItems(products: Product[]): { productId: string; productName: string; variantName: string }[] {
  const items: { productId: string; productName: string; variantName: string }[] = [];

  products.forEach((product) => {
    if (isServiceProduct(product)) return;
    product.variants.forEach((variant) => {
      if (variant.stock === 0) {
        const variantName = Object.values(variant.variableValues).join(' / ') || 'Default';
        items.push({
          productId: product.id,
          productName: product.name,
          variantName,
        });
      }
    });
  });

  return items;
}

/**
 * Filter restock logs by date range
 */
export function filterRestockLogsByDateRange(
  restockLogs: RestockLog[],
  start: Date,
  end: Date
): RestockLog[] {
  return restockLogs.filter((log) => {
    const logDate = new Date(log.timestamp);
    return logDate >= start && logDate <= end;
  });
}

/**
 * Calculate restock insights for a given period
 */
export function calculateRestockInsights(
  restockLogs: RestockLog[],
  products: Product[]
): RestockInsights {
  const productMap = new Map<string, { restockCount: number; totalUnits: number }>();
  const productNames = new Map<string, string>();

  // Build product name map
  products.forEach((product) => {
    productNames.set(product.id, product.name);
  });

  // Aggregate restock data by product
  restockLogs.forEach((log) => {
    const existing = productMap.get(log.productId) || { restockCount: 0, totalUnits: 0 };
    existing.restockCount++;
    existing.totalUnits += log.quantityAdded;
    productMap.set(log.productId, existing);
  });

  // Sort for most restocked
  const sortedByCount = Array.from(productMap.entries())
    .sort((a, b) => b[1].restockCount - a[1].restockCount)
    .slice(0, 5)
    .map(([productId, data]) => ({
      productId,
      productName: productNames.get(productId) || 'Unknown Product',
      restockCount: data.restockCount,
    }));

  const sortedByUnits = Array.from(productMap.entries())
    .sort((a, b) => b[1].totalUnits - a[1].totalUnits)
    .slice(0, 5)
    .map(([productId, data]) => ({
      productId,
      productName: productNames.get(productId) || 'Unknown Product',
      totalUnits: data.totalUnits,
    }));

  return {
    totalRestocks: restockLogs.length,
    totalUnitsRestocked: restockLogs.reduce((sum, log) => sum + log.quantityAdded, 0),
    mostRestockedProducts: sortedByCount,
    mostRestockedByUnits: sortedByUnits,
  };
}

/**
 * Group restocks by day/week/month for chart
 */
export function groupRestocksByPeriod(
  restockLogs: RestockLog[],
  timeRange: TimeRange
): ChartDataPoint[] {
  const { start, end } = getDateRange(timeRange);

  if (timeRange === '7d') {
    return groupRestocksByDay(restockLogs, start, end);
  } else if (timeRange === 'month' || timeRange === '30d') {
    return groupRestocksByWeek(restockLogs, start, end);
  } else {
    return groupRestocksByMonth(restockLogs);
  }
}

function groupRestocksByDay(restockLogs: RestockLog[], start: Date, end: Date): ChartDataPoint[] {
  const dayMap = new Map<string, number>();
  const dayLabels: string[] = [];

  const current = new Date(start);
  while (current <= end) {
    const dateKey = current.toISOString().split('T')[0];
    const label = current.toLocaleDateString('en-US', { weekday: 'short' });
    dayMap.set(dateKey, 0);
    dayLabels.push(label);
    current.setDate(current.getDate() + 1);
  }

  restockLogs.forEach((log) => {
    const dateKey = new Date(log.timestamp).toISOString().split('T')[0];
    if (dayMap.has(dateKey)) {
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + log.quantityAdded);
    }
  });

  const result: ChartDataPoint[] = [];
  let i = 0;
  dayMap.forEach((value) => {
    result.push({ label: dayLabels[i] || '', value });
    i++;
  });

  return result;
}

function groupRestocksByWeek(restockLogs: RestockLog[], start: Date, end: Date): ChartDataPoint[] {
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const numWeeks = Math.ceil(totalDays / 7);
  const weekMap = new Map<number, number>();

  for (let i = 1; i <= numWeeks; i++) {
    weekMap.set(i, 0);
  }

  restockLogs.forEach((log) => {
    const logDate = new Date(log.timestamp);
    const daysSinceStart = Math.floor(
      (logDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const weekNum = Math.min(Math.floor(daysSinceStart / 7) + 1, numWeeks);
    weekMap.set(weekNum, (weekMap.get(weekNum) || 0) + log.quantityAdded);
  });

  return Array.from(weekMap.entries()).map(([week, value]) => ({
    label: `W${week}`,
    value,
  }));
}

function groupRestocksByMonth(restockLogs: RestockLog[]): ChartDataPoint[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthData = new Array(12).fill(0);

  restockLogs.forEach((log) => {
    const logDate = new Date(log.timestamp);
    const month = logDate.getMonth();
    monthData[month] += log.quantityAdded;
  });

  return months.map((label, index) => ({
    label,
    value: monthData[index],
  }));
}

/**
 * Calculate best-selling products from order line items
 */
export function calculateBestSellingProducts(
  orders: Order[],
  products: Product[],
  limit: number = 5
): ProductPerformance[] {
  const productSales = new Map<string, { unitsSold: number; revenue: number }>();
  const productInfo = new Map<string, { name: string; stock: number }>();

  // Build product info map
  products.forEach((product) => {
    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    productInfo.set(product.id, { name: product.name, stock: totalStock });
  });

  // Aggregate sales from order items
  orders
    .filter((order) => order.status !== 'Refunded')
    .forEach((order) => {
      order.items.forEach((item) => {
        const existing = productSales.get(item.productId) || { unitsSold: 0, revenue: 0 };
        existing.unitsSold += item.quantity;
        existing.revenue += item.quantity * item.unitPrice;
        productSales.set(item.productId, existing);
      });
    });

  // Convert to sorted list
  return Array.from(productSales.entries())
    .map(([productId, data]) => ({
      productId,
      productName: productInfo.get(productId)?.name || 'Unknown Product',
      unitsSold: data.unitsSold,
      revenue: data.revenue,
      stockRemaining: productInfo.get(productId)?.stock || 0,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);
}

/**
 * Calculate top products by revenue
 */
export function calculateTopProductsByRevenue(
  orders: Order[],
  products: Product[],
  limit: number = 5
): ProductPerformance[] {
  const productSales = new Map<string, { unitsSold: number; revenue: number }>();
  const productInfo = new Map<string, { name: string; stock: number }>();

  // Build product info map
  products.forEach((product) => {
    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    productInfo.set(product.id, { name: product.name, stock: totalStock });
  });

  // Aggregate sales from order items
  orders
    .filter((order) => order.status !== 'Refunded')
    .forEach((order) => {
      order.items.forEach((item) => {
        const existing = productSales.get(item.productId) || { unitsSold: 0, revenue: 0 };
        existing.unitsSold += item.quantity;
        existing.revenue += item.quantity * item.unitPrice;
        productSales.set(item.productId, existing);
      });
    });

  // Convert to sorted list by revenue
  return Array.from(productSales.entries())
    .map(([productId, data]) => ({
      productId,
      productName: productInfo.get(productId)?.name || 'Unknown Product',
      unitsSold: data.unitsSold,
      revenue: data.revenue,
      stockRemaining: productInfo.get(productId)?.stock || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/**
 * Calculate stock cover days (how many days of stock remaining based on recent sales rate)
 */
export function calculateStockCoverDays(
  productId: string,
  products: Product[],
  orders: Order[],
  daysForAverage: number = 30
): number | undefined {
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;

  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  if (totalStock === 0) return 0;

  // Calculate average daily sales in the past N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysForAverage);

  const recentOrders = orders.filter((order) => {
    const orderDate = new Date(order.orderDate ?? order.createdAt);
    return orderDate >= cutoffDate && order.status !== 'Refunded';
  });

  let totalUnitsSold = 0;
  recentOrders.forEach((order) => {
    order.items.forEach((item) => {
      if (item.productId === productId) {
        totalUnitsSold += item.quantity;
      }
    });
  });

  if (totalUnitsSold === 0) return undefined; // No sales = infinite stock cover

  const avgDailySales = totalUnitsSold / daysForAverage;
  return Math.round(totalStock / avgDailySales);
}

/**
 * Calculate slow movers / worst selling products
 * Products with stock but low/zero sales in the period
 */
export function calculateSlowMovers(
  orders: Order[],
  products: Product[],
  limit: number = 5
): ProductPerformance[] {
  const productSales = new Map<string, { unitsSold: number; revenue: number }>();
  const productInfo = new Map<string, { name: string; stock: number }>();

  // Build product info map - only include products with stock
  products.forEach((product) => {
    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    if (totalStock > 0) {
      productInfo.set(product.id, { name: product.name, stock: totalStock });
      // Initialize with zero sales
      productSales.set(product.id, { unitsSold: 0, revenue: 0 });
    }
  });

  // Aggregate sales from order items
  orders
    .filter((order) => order.status !== 'Refunded')
    .forEach((order) => {
      order.items.forEach((item) => {
        if (productSales.has(item.productId)) {
          const existing = productSales.get(item.productId)!;
          existing.unitsSold += item.quantity;
          existing.revenue += item.quantity * item.unitPrice;
        }
      });
    });

  // Convert to sorted list by units sold (ascending = worst sellers first)
  return Array.from(productSales.entries())
    .map(([productId, data]) => ({
      productId,
      productName: productInfo.get(productId)?.name || 'Unknown Product',
      unitsSold: data.unitsSold,
      revenue: data.revenue,
      stockRemaining: productInfo.get(productId)?.stock || 0,
    }))
    .sort((a, b) => a.unitsSold - b.unitsSold) // Ascending - lowest sales first
    .slice(0, limit);
}

/**
 * Calculate new design analytics for a given year
 */
export function calculateNewDesignAnalytics(
  products: Product[],
  orders: Order[],
  restockLogs: RestockLog[],
  designYear: number
): NewDesignAnalytics {
  // Filter products that are new designs for the selected year
  const newDesignProducts = products.filter(
    (p) => p.isNewDesign && p.designYear === designYear
  );

  // Build maps for product info
  const productSales = new Map<string, number>();
  const productRestockCount = new Map<string, number>();
  const productUnitsRestocked = new Map<string, number>();

  // Initialize maps for all new design products
  newDesignProducts.forEach((p) => {
    productSales.set(p.id, 0);
    productRestockCount.set(p.id, 0);
    productUnitsRestocked.set(p.id, 0);
  });

  // Calculate units sold for new design products
  orders
    .filter((order) => order.status !== 'Refunded')
    .forEach((order) => {
      order.items.forEach((item) => {
        if (productSales.has(item.productId)) {
          productSales.set(
            item.productId,
            (productSales.get(item.productId) || 0) + item.quantity
          );
        }
      });
    });

  // Calculate restock stats for new design products
  restockLogs.forEach((log) => {
    if (productRestockCount.has(log.productId)) {
      productRestockCount.set(
        log.productId,
        (productRestockCount.get(log.productId) || 0) + 1
      );
      productUnitsRestocked.set(
        log.productId,
        (productUnitsRestocked.get(log.productId) || 0) + log.quantityAdded
      );
    }
  });

  // Build performance array
  const allNewDesigns: NewDesignPerformance[] = newDesignProducts.map((p) => {
    const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
    return {
      productId: p.id,
      productName: p.name,
      designYear: p.designYear || designYear,
      stockRemaining: totalStock,
      unitsSold: productSales.get(p.id) || 0,
      restockCount: productRestockCount.get(p.id) || 0,
      unitsRestocked: productUnitsRestocked.get(p.id) || 0,
    };
  });

  // Count products that have been restocked at least once
  const newDesignsRestocked = allNewDesigns.filter((p) => p.restockCount > 0).length;

  // Total restocks and units for new designs
  const totalRestocksForNewDesigns = allNewDesigns.reduce(
    (sum, p) => sum + p.restockCount,
    0
  );
  const totalUnitsRestockedForNewDesigns = allNewDesigns.reduce(
    (sum, p) => sum + p.unitsRestocked,
    0
  );

  // Top restocked new designs (sorted by restock count, then by units)
  const topRestockedNewDesigns = [...allNewDesigns]
    .sort((a, b) => {
      if (b.restockCount !== a.restockCount) {
        return b.restockCount - a.restockCount;
      }
      return b.unitsRestocked - a.unitsRestocked;
    })
    .slice(0, 5);

  return {
    totalNewDesigns: newDesignProducts.length,
    newDesignsRestocked,
    totalRestocksForNewDesigns,
    totalUnitsRestockedForNewDesigns,
    topRestockedNewDesigns,
    allNewDesigns,
  };
}

/**
 * Get date range for discontinue candidates period
 */
function getDiscontinuePeriodRange(period: DiscontinuePeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
}

/**
 * Calculate discontinue candidates - products with stock but no sales
 */
export function calculateDiscontinueCandidates(
  products: Product[],
  orders: Order[],
  restockLogs: RestockLog[],
  period: DiscontinuePeriod,
  minStockThreshold: number = 5,
  limit: number = 50
): DiscontinueCandidatesResult {
  const { start, end } = getDiscontinuePeriodRange(period);
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  // Build maps for product sales and last sold dates
  const productSalesInPeriod = new Map<string, number>();
  const productLastSold = new Map<string, string>();

  // Initialize maps for all products
  products.forEach((p) => {
    productSalesInPeriod.set(p.id, 0);
  });

  // Calculate sales in period and track last sold date
  orders
    .filter((order) => order.status !== 'Refunded')
    .forEach((order) => {
      const orderDate = new Date(order.orderDate ?? order.createdAt);
      order.items.forEach((item) => {
        const orderDateSource = order.orderDate ?? order.createdAt;
        // Track last sold date (all time)
        const currentLastSold = productLastSold.get(item.productId);
        if (!currentLastSold || orderDateSource > currentLastSold) {
          productLastSold.set(item.productId, orderDateSource);
        }

        // Count sales in period
        if (orderDate >= start && orderDate <= end) {
          productSalesInPeriod.set(
            item.productId,
            (productSalesInPeriod.get(item.productId) || 0) + item.quantity
          );
        }
      });
    });

  // Calculate restock count this year
  const productRestockCountThisYear = new Map<string, number>();
  restockLogs.forEach((log) => {
    const logDate = new Date(log.timestamp);
    if (logDate >= yearStart) {
      productRestockCountThisYear.set(
        log.productId,
        (productRestockCountThisYear.get(log.productId) || 0) + 1
      );
    }
  });

  // Find candidates: products with stock >= threshold and 0 sales in period
  const candidates: DiscontinueCandidatePerformance[] = [];

  products.forEach((product) => {
    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    const salesInPeriod = productSalesInPeriod.get(product.id) || 0;

    // Check if qualifies as discontinue candidate
    if (totalStock >= minStockThreshold && salesInPeriod === 0) {
      const createdDate = new Date(product.createdAt);
      const now = new Date();
      const daysInStock = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      candidates.push({
        productId: product.id,
        productName: product.name,
        currentStock: totalStock,
        unitsSoldInPeriod: salesInPeriod,
        lastSoldDate: productLastSold.get(product.id) || null,
        restockCountThisYear: productRestockCountThisYear.get(product.id) || 0,
        daysInStock,
        isDiscontinued: product.isDiscontinued || false,
      });
    }
  });

  // Sort by current stock (highest first) then by days in stock (longest first)
  candidates.sort((a, b) => {
    if (b.currentStock !== a.currentStock) {
      return b.currentStock - a.currentStock;
    }
    return b.daysInStock - a.daysInStock;
  });

  return {
    candidates: candidates.slice(0, limit),
    totalCandidates: candidates.length,
  };
}

/**
 * Main function to compute all inventory analytics
 * @param products - List of products
 * @param orders - List of orders
 * @param restockLogs - List of restock logs
 * @param timeRange - Time range filter
 * @param globalLowStockThreshold - Optional global low stock threshold (overrides per-product thresholds)
 */
export function computeInventoryAnalytics(
  products: Product[],
  orders: Order[],
  restockLogs: RestockLog[],
  timeRange: TimeRange,
  globalLowStockThreshold?: number
): InventoryAnalyticsResult {
  const { start, end } = getDateRange(timeRange);
  const { start: prevStart, end: prevEnd } = getPreviousPeriodRange(timeRange);

  // Filter data by time range
  const ordersInRange = orders.filter((order) => {
    const orderDate = new Date(order.orderDate ?? order.createdAt);
    return orderDate >= start && orderDate <= end && order.status !== 'Refunded';
  });

  const restocksInRange = filterRestockLogsByDateRange(restockLogs, start, end);
  const restocksInPrevPeriod = filterRestockLogsByDateRange(restockLogs, prevStart, prevEnd);

  // Calculate overview (current state, not time-filtered)
  const overview = calculateInventoryOverview(products, globalLowStockThreshold);

  // Calculate restock insights for the period
  const restockInsights = calculateRestockInsights(restocksInRange, products);

  // Calculate previous period restock metrics for comparison
  const prevRestockInsights = calculateRestockInsights(restocksInPrevPeriod, products);

  // Calculate sales-linked performance
  const bestSellingProducts = calculateBestSellingProducts(ordersInRange, products, 5);
  const topProductsByRevenue = calculateTopProductsByRevenue(ordersInRange, products, 5);
  const slowMovers = calculateSlowMovers(ordersInRange, products, 5);

  // Calculate stock cover days for best sellers
  bestSellingProducts.forEach((product) => {
    product.stockCoverDays = calculateStockCoverDays(product.productId, products, orders);
  });

  // Chart data
  const restocksOverTime = groupRestocksByPeriod(restocksInRange, timeRange);

  // KPI metrics with change
  const kpiMetrics = {
    restocks: {
      value: restockInsights.totalRestocks,
      change: percentChange(restockInsights.totalRestocks, prevRestockInsights.totalRestocks),
    },
    unitsRestocked: {
      value: restockInsights.totalUnitsRestocked,
      change: percentChange(restockInsights.totalUnitsRestocked, prevRestockInsights.totalUnitsRestocked),
    },
  };

  // Lists for drill-down (use global threshold if provided)
  const lowStockList = getLowStockItems(products, globalLowStockThreshold);
  const outOfStockList = getOutOfStockItems(products);

  // Calculate new designs analytics (default to current year)
  const currentYear = new Date().getFullYear();
  const newDesigns = calculateNewDesignAnalytics(products, orders, restockLogs, currentYear);

  return {
    overview,
    restockInsights,
    bestSellingProducts,
    topProductsByRevenue,
    slowMovers,
    restocksOverTime,
    kpiMetrics,
    lowStockList,
    outOfStockList,
    newDesigns,
  };
}
