import { useMemo } from 'react';
import useFyllStore from '@/lib/state/fyll-store';
import {
  TimeRange,
  AnalyticsResult,
  ChartDataPoint,
  getDateRange,
  getPreviousPeriodRange,
  filterOrdersByDateRange,
  groupByDay,
  groupByWeek,
  groupByMonth,
  getHourlyTrend,
  countNewCustomers,
  calculateTotalUnits,
  getLocationBreakdown,
  getPlatformBreakdown,
  getLogisticsBreakdown,
  getTodayStats,
  percentChange,
  countUniqueCustomers,
  // New imports for tab-specific data
  getTopAddOns,
  getRevenueBySource,
  getRevenueByOrderCategory,
  getStatusBreakdown,
  groupOrdersByDay,
  groupOrdersByWeek,
  groupOrdersByMonth,
  getOrderCategoryBreakdown,
  getReturningVsNew,
  getTopCustomers,
  getCustomersByLocation,
  getCustomersByPlatform,
  getServiceMetrics,
  getServiceBreakdown,
  getServiceRevenueByPeriod,
  getAddOnMetrics,
  getAddOnBreakdown,
  getAddOnRevenueByPeriod,
  getServiceVariableBreakdown,
  TabKey,
  // New refund helpers
  getRefundStats,
  filterOrdersByRefundDateRange,
  isSaleOrder,
} from '@/lib/analytics-utils';

/**
 * Hook to compute real analytics from orders data
 */
export function useAnalytics(range: TimeRange, _tab: TabKey): AnalyticsResult {
  const orders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const products = useFyllStore((s) => s.products);

  return useMemo(() => {
    // Get date ranges
    const { start: rangeStart, end: rangeEnd } = getDateRange(range);
    const { start: prevStart, end: prevEnd } = getPreviousPeriodRange(range);

    // Filter orders for current and previous periods
    const currentOrders = filterOrdersByDateRange(orders, rangeStart, rangeEnd, true);
    const previousOrders = filterOrdersByDateRange(orders, prevStart, prevEnd, true);
    const currentSalesOrders = currentOrders.filter(isSaleOrder);
    const previousSalesOrders = previousOrders.filter(isSaleOrder);

    // All orders in range (including refunded) for status breakdown
    const allOrdersInRange = filterOrdersByDateRange(orders, rangeStart, rangeEnd, false);

    // Get refund stats using REFUND DATE (includes partial refunds)
    const currentRefundStats = getRefundStats(
      filterOrdersByRefundDateRange(orders, rangeStart, rangeEnd).filter(isSaleOrder)
    );
    const previousRefundStats = getRefundStats(
      filterOrdersByRefundDateRange(orders, prevStart, prevEnd).filter(isSaleOrder)
    );

    // Core metrics
    const totalSales = currentSalesOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = currentOrders.length;
    const totalUnits = calculateTotalUnits(currentSalesOrders);
    const newCustomers = countNewCustomers(currentOrders, orders, rangeStart);
    const refundsCount = currentRefundStats.count;
    const refundsAmount = currentRefundStats.total;
    const netRevenue = Math.max(0, totalSales - refundsAmount);

    const serviceMetrics = getServiceMetrics(currentSalesOrders, products);
    const previousServiceMetrics = getServiceMetrics(previousSalesOrders, products);
    const serviceRevenueChange = percentChange(serviceMetrics.revenue, previousServiceMetrics.revenue);
    const serviceByPeriod = getServiceRevenueByPeriod(range, currentSalesOrders, rangeStart, rangeEnd, products);
    const serviceBreakdown = getServiceBreakdown(currentSalesOrders, products);
    const serviceVariableBreakdown = getServiceVariableBreakdown(currentSalesOrders, products);

    const addOnMetrics = getAddOnMetrics(currentSalesOrders);
    const previousAddOnMetrics = getAddOnMetrics(previousSalesOrders);
    const addOnRevenueChange = percentChange(addOnMetrics.revenue, previousAddOnMetrics.revenue);
    const addOnByPeriod = getAddOnRevenueByPeriod(range, currentSalesOrders, rangeStart, rangeEnd);
    const addOnBreakdown = getAddOnBreakdown(currentSalesOrders);

    // Previous period metrics
    const previousPeriodSales = previousSalesOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const previousPeriodOrders = previousOrders.length;
    const previousPeriodCustomers = countUniqueCustomers(previousOrders);

    // Sales change
    const salesChange = percentChange(totalSales, previousPeriodSales);

    // Chart data based on range
    let salesByPeriod: ChartDataPoint[];
    let ordersByPeriod: ChartDataPoint[];
    if (range === '7d') {
      salesByPeriod = groupByDay(currentSalesOrders, rangeStart, rangeEnd);
      ordersByPeriod = groupOrdersByDay(allOrdersInRange, rangeStart, rangeEnd);
    } else if (range === 'month' || range === '30d') {
      salesByPeriod = groupByWeek(currentSalesOrders, rangeStart, rangeEnd);
      ordersByPeriod = groupOrdersByWeek(allOrdersInRange, rangeStart, rangeEnd);
    } else {
      salesByPeriod = groupByMonth(currentSalesOrders);
      ordersByPeriod = groupOrdersByMonth(allOrdersInRange);
    }

    // Today's stats
    const todayStats = getTodayStats(orders, products);

    // Hourly trend for sparkline
    const hourlyTrend = getHourlyTrend(orders);

    // Breakdowns
    const locationBreakdown = getLocationBreakdown(currentOrders);
    const platformBreakdown = getPlatformBreakdown(currentOrders);
    const logisticsBreakdown = getLogisticsBreakdown(currentOrders);

    // Current period unique customers
    const currentCustomers = countUniqueCustomers(currentOrders);

    // KPI metrics with comparison
    const kpiMetrics = {
      sales: {
        value: totalSales,
        change: salesChange,
      },
      customers: {
        value: currentCustomers,
        change: percentChange(currentCustomers, previousPeriodCustomers),
      },
      orders: {
        value: totalOrders,
        change: percentChange(totalOrders, previousPeriodOrders),
      },
      refunds: {
        value: refundsCount,
        change: percentChange(refundsCount, previousRefundStats.count),
      },
    };

    // ====== SALES TAB SPECIFIC ======
    const averageOrderValue = currentSalesOrders.length > 0 ? totalSales / currentSalesOrders.length : 0;
    const topAddOns = getTopAddOns(currentSalesOrders);
    const revenueBySource = getRevenueBySource(currentSalesOrders);
    const revenueByCategory = getRevenueByOrderCategory(currentOrders);

    // ====== ORDERS TAB SPECIFIC ======
    const statusBreakdown = getStatusBreakdown(allOrdersInRange, orderStatuses);
    const cancellationsCount = refundsCount;
    const processingOrders = allOrdersInRange.filter(
      (o) => o.status === 'Processing' || o.status === 'Lab Processing' || o.status === 'Quality Check'
    ).length;
    const completedOrders = allOrdersInRange.filter(
      (order) => (order.status ?? '').trim().toLowerCase() === 'completed'
    ).length;
    const deliveredOrders = allOrdersInRange.filter((o) => o.status === 'Delivered').length;
    const ordersByCategory = getOrderCategoryBreakdown(currentOrders);

    // ====== CUSTOMERS TAB SPECIFIC ======
    const returningVsNew = getReturningVsNew(currentOrders, orders, rangeStart);
    const returningCustomers = returningVsNew.returning;
    const topCustomers = getTopCustomers(currentOrders);
    const customersByLocation = getCustomersByLocation(currentOrders);
    const customersByPlatform = getCustomersByPlatform(currentOrders);

    return {
      // Core metrics
      totalSales,
      totalOrders,
      totalUnits,
      newCustomers,
      refundsCount,
      refundsAmount,
      netRevenue,

      // Today's stats
      todaySales: todayStats.sales,
      todayOrders: todayStats.orders,
      todayUnits: todayStats.units,
      todayCustomers: todayStats.customers,
      todayRefunds: todayStats.refunds,
      todayRefundsAmount: todayStats.refundsAmount,
      hourlyTrend,

      serviceMetrics,
      previousServiceMetrics,
      serviceRevenueChange,
      todayServiceMetrics: todayStats.serviceMetrics,
      serviceBreakdown,
      serviceByPeriod,
      serviceVariableBreakdown,

      // Chart data
      salesByPeriod,

      // Comparison
      previousPeriodSales,
      salesChange,

      // Breakdowns
      locationBreakdown,
      platformBreakdown,
      logisticsBreakdown,

      // KPI metrics
      kpiMetrics,

      // Sales tab specific
      averageOrderValue,
      topAddOns,
      revenueBySource,
      revenueByCategory,
      addOnMetrics,
      previousAddOnMetrics,
      addOnRevenueChange,
      todayAddOnMetrics: getAddOnMetrics(currentSalesOrders.filter((order) => {
        const orderDate = new Date(order.orderDate ?? order.createdAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return orderDate >= today;
      })),
      addOnBreakdown,
      addOnByPeriod,

      // Orders tab specific
      statusBreakdown,
      cancellationsCount,
      processingOrders,
      completedOrders,
      deliveredOrders,
      ordersByPeriod,
      ordersByCategory,

      // Customers tab specific
      returningCustomers,
      returningVsNew,
      topCustomers,
      customersByLocation,
      customersByPlatform,
    };
  }, [orders, orderStatuses, products, range]);
}
