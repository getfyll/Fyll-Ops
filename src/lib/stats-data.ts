// Stats screen mock data types and generator

export interface TodaySummary {
  sales: number;
  customers: number;
  orders: number;
  units: number;
  refunds: number;
  hourlyTrend: number[];
}

export interface SalesByPeriod {
  label: string;
  value: number;
}

export interface LocationBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export interface PlatformBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export interface LogisticsBreakdown {
  label: string;
  ordersShipped: number;
  onTimeRate: number;
}

export interface AddOnBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export interface ServiceTypeBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export type TimeRange = '7d' | 'month' | '30d' | 'year';

// Generate mock data based on time range
export function generateMockStatsData(timeRange: TimeRange) {
  // Today's summary
  const todaySummary: TodaySummary = {
    sales: 120000 + Math.floor(Math.random() * 30000),
    customers: 8 + Math.floor(Math.random() * 5),
    orders: 12 + Math.floor(Math.random() * 8),
    units: 18 + Math.floor(Math.random() * 10),
    refunds: Math.floor(Math.random() * 2),
    hourlyTrend: Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 15000) + 5000
    ),
  };

  // Sales by period
  let salesByPeriod: SalesByPeriod[] = [];
  let totalSales = 0;
  let previousPeriodSales = 0;

  if (timeRange === '7d') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    salesByPeriod = days.map((day) => {
      const value = Math.floor(Math.random() * 180000) + 80000;
      totalSales += value;
      return { label: day, value };
    });
    previousPeriodSales = totalSales * (0.6 + Math.random() * 0.3);
  } else if (timeRange === 'month' || timeRange === '30d') {
    // Show 4 weeks
    salesByPeriod = ['W1', 'W2', 'W3', 'W4'].map((week) => {
      const value = Math.floor(Math.random() * 400000) + 200000;
      totalSales += value;
      return { label: week, value };
    });
    previousPeriodSales = totalSales * (0.6 + Math.random() * 0.3);
  } else {
    // Show 12 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    salesByPeriod = months.map((month) => {
      const value = Math.floor(Math.random() * 300000) + 100000;
      totalSales += value;
      return { label: month, value };
    });
    previousPeriodSales = totalSales * (0.5 + Math.random() * 0.4);
  }

  const salesChange = ((totalSales - previousPeriodSales) / previousPeriodSales) * 100;

  // Location breakdown
  const locations: LocationBreakdown[] = [
    { label: 'Lagos', value: 42, percentage: 42 },
    { label: 'Abuja', value: 28, percentage: 28 },
    { label: 'Port Harcourt', value: 12, percentage: 12 },
    { label: 'Ibadan', value: 10, percentage: 10 },
    { label: 'Others', value: 8, percentage: 8 },
  ];

  // Platform breakdown
  const platforms: PlatformBreakdown[] = [
    { label: 'Instagram', value: 38, percentage: 38 },
    { label: 'WhatsApp', value: 32, percentage: 32 },
    { label: 'Website', value: 18, percentage: 18 },
    { label: 'Walk-in', value: 12, percentage: 12 },
  ];

  // Logistics breakdown
  const logistics: LogisticsBreakdown[] = [
    { label: 'GIG Logistics', ordersShipped: 45, onTimeRate: 94 },
    { label: 'DHL', ordersShipped: 28, onTimeRate: 98 },
    { label: 'Kwik Delivery', ordersShipped: 18, onTimeRate: 88 },
    { label: 'Local Dispatch', ordersShipped: 9, onTimeRate: 92 },
  ];

  // Add-ons breakdown
  const addOns: AddOnBreakdown[] = [
    { label: 'Blue Light Filter', value: 156, percentage: 35 },
    { label: 'Anti-Reflective', value: 124, percentage: 28 },
    { label: 'Photochromic', value: 89, percentage: 20 },
    { label: 'UV Protection', value: 45, percentage: 10 },
    { label: 'Tint', value: 31, percentage: 7 },
  ];

  // Service types breakdown
  const serviceTypes: ServiceTypeBreakdown[] = [
    { label: 'LensCraft', value: 85, percentage: 40 },
    { label: 'Clearance Add-on', value: 64, percentage: 30 },
    { label: 'SunSwitch', value: 43, percentage: 20 },
    { label: 'Reglaze', value: 21, percentage: 10 },
  ];

  // KPI metrics with changes
  const kpiMetrics = {
    sales: {
      value: totalSales,
      change: salesChange,
    },
    customers: {
      value: 156 + Math.floor(Math.random() * 50),
      change: 12.5 + (Math.random() * 10 - 5),
    },
    orders: {
      value: 89 + Math.floor(Math.random() * 30),
      change: 8.3 + (Math.random() * 10 - 5),
    },
    refunds: {
      value: 3 + Math.floor(Math.random() * 5),
      change: -(5 + Math.random() * 10),
    },
  };

  return {
    todaySummary,
    salesByPeriod,
    totalSales,
    salesChange,
    locations,
    platforms,
    logistics,
    addOns,
    serviceTypes,
    kpiMetrics,
    totalAddOnsSold: addOns.reduce((sum, a) => sum + a.value, 0),
    bestSellingAddOn: addOns[0].label,
  };
}

// Format large numbers
export function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}k`;
  }
  return num.toString();
}
