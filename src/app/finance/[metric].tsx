import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import useFyllStore, {
  type Expense,
  type FixedCostSetting,
  type Order,
  type Procurement,
  formatCurrency,
} from '@/lib/state/fyll-store';
import { useStatsColors } from '@/lib/theme';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { InteractiveLineChart, type LineChartDatum } from '@/components/stats/InteractiveLineChart';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { getRefundDate, getRefundedAmount } from '@/lib/analytics-utils';

type FinanceMetricKey = 'revenue' | 'expenses' | 'procurement' | 'net-profit';
type TimeRange = '7d' | 'month' | '30d' | 'year';
type ThirtyDayGranularity = 'daily' | 'weekly';

type Bucket = {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
};

type WindowTotals = {
  revenue: number;
  gatewayFees: number;
  stampDuty: number;
  refunds: number;
  netRevenue: number;
  expenses: number;
  procurement: number;
  net: number;
};

const STAMP_DUTY_THRESHOLD = 10000;

const isBankTransferPaymentMethod = (value?: string) => {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return (
    normalized.includes('bank transfer')
    || normalized === 'transfer'
    || normalized.includes('bank deposit')
  );
};

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This Year' },
];

const METRIC_CONFIG: Record<FinanceMetricKey, { title: string; subtitle: string; inverse?: boolean; chartTitle: string }> = {
  revenue: {
    title: 'Revenue details',
    subtitle: 'Track sales inflow by period and source',
    chartTitle: 'Revenue over time',
  },
  expenses: {
    title: 'Expenses details',
    subtitle: 'Understand spending trends and categories',
    inverse: true,
    chartTitle: 'Expenses over time',
  },
  procurement: {
    title: 'Procurement details',
    subtitle: 'Monitor supplier purchase spend',
    inverse: true,
    chartTitle: 'Procurement over time',
  },
  'net-profit': {
    title: 'Net profit details',
    subtitle: 'See profit performance and component drivers',
    chartTitle: 'Net profit over time',
  },
};

const parseTimestamp = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getOrderTimestamp = (order: Order): number | null => {
  const candidates = [order.orderDate, order.createdAt, order.updatedAt];
  for (const candidate of candidates) {
    const timestamp = parseTimestamp(candidate);
    if (timestamp !== null) return timestamp;
  }
  return null;
};

const getExpenseTimestamp = (expense: Expense): number | null => {
  const candidates = [expense.date, expense.createdAt];
  for (const candidate of candidates) {
    const timestamp = parseTimestamp(candidate);
    if (timestamp !== null) return timestamp;
  }
  return null;
};

const extractMetadataValue = (source: string | undefined, key: string): string | null => {
  if (!source) return null;
  const metadataPattern = /\[([a-z_]+):([^\]]+)\]/gi;
  const keyLower = key.toLowerCase();
  let match = metadataPattern.exec(source);
  while (match) {
    if (match[1]?.toLowerCase() === keyLower) {
      return match[2]?.trim() ?? null;
    }
    match = metadataPattern.exec(source);
  }
  return null;
};

const stripMetadata = (source: string | undefined): string => {
  if (!source) return '';
  const metadataPattern = /\[([a-z_]+):([^\]]+)\]/gi;
  return source.replace(metadataPattern, '').replace(/\s+/g, ' ').trim();
};

const parseFlexibleDateToTimestamp = (value?: string | null): number | null => {
  const normalized = value?.trim();
  if (!normalized) return null;

  const dayFirstMatch = normalized.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const monthIndex = Number(dayFirstMatch[2]) - 1;
    const year = Number(dayFirstMatch[3]);
    if (
      Number.isInteger(day)
      && Number.isInteger(monthIndex)
      && Number.isInteger(year)
      && monthIndex >= 0
      && monthIndex <= 11
      && day >= 1
      && day <= 31
    ) {
      const candidate = new Date(year, monthIndex, day);
      if (
        candidate.getFullYear() === year
        && candidate.getMonth() === monthIndex
        && candidate.getDate() === day
      ) {
        return candidate.getTime();
      }
    }
  }

  return parseTimestamp(normalized);
};

const resolveProcurementMode = (procurement: Procurement): 'procurement' | 'costing' => {
  const metadataMode = extractMetadataValue(procurement.notes, 'mode')?.trim().toLowerCase();
  if (metadataMode === 'costing') return 'costing';

  const hasCostingFields = procurement.items.some((item) => (
    (item.serviceFee ?? 0) > 0
    || (item.deliveryFee ?? 0) > 0
    || (item.shippingClearanceFee ?? 0) > 0
    || (item.additionalFee ?? 0) > 0
    || (item.targetMarginPercent ?? 0) > 0
    || (item.currentSellingPrice ?? 0) > 0
  ));

  if (hasCostingFields) return 'costing';
  return 'procurement';
};

const isProcurementRecord = (procurement: Procurement): boolean => (
  resolveProcurementMode(procurement) === 'procurement'
);

const resolveProcurementPaidDate = (procurement: Procurement, createdAtMs: number): string => {
  const metadataPaidDate = extractMetadataValue(procurement.notes, 'paid_date');
  if (metadataPaidDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(metadataPaidDate)) return metadataPaidDate;
    const parsed = parseFlexibleDateToTimestamp(metadataPaidDate);
    if (parsed !== null) return new Date(parsed).toISOString().split('T')[0];
  }

  return new Date(createdAtMs).toISOString().split('T')[0];
};

const getProcurementTimestamp = (procurement: Procurement): number | null => {
  const createdAtMs = parseTimestamp(procurement.createdAt);
  if (createdAtMs === null) return null;
  const paidDate = resolveProcurementPaidDate(procurement, createdAtMs);
  return parseFlexibleDateToTimestamp(paidDate) ?? createdAtMs;
};

const estimateFixedCostInWindow = (cost: FixedCostSetting, startMs: number, endMs: number): number => {
  const durationMs = Math.max(0, endMs - startMs);
  const durationDays = durationMs / (24 * 60 * 60 * 1000);
  if (durationDays <= 0) return 0;
  if (cost.frequency === 'Quarterly') return (cost.amount / 90) * durationDays;
  if (cost.frequency === 'Yearly') return (cost.amount / 365) * durationDays;
  return (cost.amount / 30) * durationDays;
};

const calcPercentChange = (current: number, previous: number): number | null => {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const resolveTrendTone = (
  change: number | null,
  inverse?: boolean
): 'positive' | 'negative' | 'neutral' => {
  if (change === null || Math.abs(change) < 0.01) return 'neutral';
  const increased = change > 0;
  const positive = inverse ? !increased : increased;
  return positive ? 'positive' : 'negative';
};

const formatSignedCurrency = (amount: number) => {
  const absolute = Math.abs(amount);
  return `${amount < 0 ? '-' : ''}${formatCurrency(absolute)}`;
};

const formatAxisCurrency = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
};

const toWeeklyLabel = (startLabel: string, endLabel: string) => {
  const [startMonth = '', startDay = ''] = startLabel.split(' ');
  const [endMonth = '', endDay = ''] = endLabel.split(' ');
  if (!startLabel || !endLabel) return startLabel || endLabel;
  if (startLabel === endLabel) return startLabel;
  if (startMonth === endMonth) return `${startMonth} ${startDay}-${endDay}`;
  return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
};

const buildBuckets = (range: TimeRange, nowMs: number): Bucket[] => {
  const now = new Date(nowMs);
  if (range === 'year') {
    const year = now.getFullYear();
    return Array.from({ length: 12 }).map((_, monthIndex) => {
      const start = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
      const end = monthIndex === 11
        ? new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime()
        : new Date(year, monthIndex + 1, 1, 0, 0, 0, 0).getTime();
      const label = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' });
      return {
        key: `${year}-${monthIndex + 1}`,
        label,
        startMs: start,
        endMs: end,
      };
    });
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const dayCount = range === '7d'
    ? 7
    : range === 'month'
      ? Math.floor((todayStart - monthStart) / (24 * 60 * 60 * 1000)) + 1
      : 30;
  const rangeStart = range === 'month'
    ? monthStart
    : todayStart - (dayCount - 1) * 24 * 60 * 60 * 1000;

  return Array.from({ length: dayCount }).map((_, index) => {
    const start = rangeStart + index * 24 * 60 * 60 * 1000;
    const end = start + 24 * 60 * 60 * 1000;
    const date = new Date(start);
    const label = range === '7d'
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      key: new Date(start).toISOString().split('T')[0],
      label,
      startMs: start,
      endMs: end,
    };
  });
};

const resolveMetricKey = (rawMetric?: string | string[]): FinanceMetricKey => {
  const metric = (Array.isArray(rawMetric) ? rawMetric[0] : rawMetric)?.toLowerCase();
  if (metric === 'revenue') return 'revenue';
  if (metric === 'expenses') return 'expenses';
  if (metric === 'procurement') return 'procurement';
  return 'net-profit';
};

export default function FinanceMetricDetailScreen() {
  const { metric } = useLocalSearchParams<{ metric?: string | string[] }>();
  const activeMetric = resolveMetricKey(metric);
  const metricConfig = METRIC_CONFIG[activeMetric];
  const colors = useStatsColors();

  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [thirtyDayGranularity, setThirtyDayGranularity] = useState<ThirtyDayGranularity>('daily');

  const orders = useFyllStore((s) => s.orders);
  const expenses = useFyllStore((s) => s.expenses);
  const procurements = useFyllStore((s) => s.procurements);
  const fixedCosts = useFyllStore((s) => s.fixedCosts);
  const financeRules = useFyllStore((s) => s.financeRules);

  const nonFixedExpenses = useMemo(
    () => expenses.filter((expense) => extractMetadataValue(expense.description, 'source') !== 'fixed-cost'),
    [expenses]
  );

  const nowMs = Date.now();
  const buckets = useMemo(() => buildBuckets(timeRange, nowMs), [timeRange, nowMs]);
  const rangeStart = buckets[0]?.startMs ?? nowMs;
  const rangeEnd = buckets[buckets.length - 1]?.endMs ?? nowMs;

  const calculateTotalsForWindow = useCallback((
    startMs: number,
    endMs: number
  ): WindowTotals => {
    const revenue = orders.reduce((sum, order) => {
      const timestamp = getOrderTimestamp(order);
      if (timestamp === null || timestamp < startMs || timestamp >= endMs) return sum;
      return sum + Math.max(0, Number(order.totalAmount) || 0);
    }, 0);

    const stampDutyPerOrder = financeRules.incomingStampDuty ?? 50;
    const activeRules = (financeRules.revenueRules ?? []).filter((rule) => rule.enabled);

    const gatewayFees = orders.reduce((sum, order) => {
      const timestamp = getOrderTimestamp(order);
      if (timestamp === null || timestamp < startMs || timestamp >= endMs) return sum;
      const orderPaymentMethod = (order.paymentMethod ?? '').toLowerCase().trim();
      return sum + activeRules.reduce((ruleSum, rule) => {
        const ruleChannel = rule.channel.toLowerCase().trim();
        const appliesToAllPaymentMethods = (
          ruleChannel === 'all payment methods'
          || ruleChannel === 'all methods'
          || ruleChannel === 'all channels'
        );
        if (!appliesToAllPaymentMethods && (!orderPaymentMethod || ruleChannel !== orderPaymentMethod)) {
          return ruleSum;
        }
        return ruleSum + ((order.totalAmount * rule.percentFee) / 100) + rule.flatFee;
      }, 0);
    }, 0);

    const stampDuty = orders.reduce((sum, order) => {
      const timestamp = getOrderTimestamp(order);
      if (timestamp === null || timestamp < startMs || timestamp >= endMs) return sum;
      if (order.totalAmount < STAMP_DUTY_THRESHOLD || !isBankTransferPaymentMethod(order.paymentMethod)) {
        return sum;
      }
      return sum + stampDutyPerOrder;
    }, 0);

    const refunds = orders.reduce((sum, order) => {
      const refundTimestamp = getRefundDate(order)?.getTime() ?? null;
      if (refundTimestamp === null || refundTimestamp < startMs || refundTimestamp >= endMs) return sum;
      return sum + Math.max(0, getRefundedAmount(order));
    }, 0);

    const variableExpenses = nonFixedExpenses.reduce((sum, expense) => {
      const timestamp = getExpenseTimestamp(expense);
      if (timestamp === null || timestamp < startMs || timestamp >= endMs) return sum;
      return sum + Math.max(0, Number(expense.amount) || 0);
    }, 0);

    const fixedExpenses = fixedCosts.reduce(
      (sum, cost) => sum + estimateFixedCostInWindow(cost, startMs, endMs),
      0
    );

    const procurement = procurements.reduce((sum, item) => {
      if (!isProcurementRecord(item)) return sum;
      const timestamp = getProcurementTimestamp(item);
      if (timestamp === null || timestamp < startMs || timestamp >= endMs) return sum;
      return sum + Math.max(0, Number(item.totalCost) || 0);
    }, 0);

    const expensesTotal = variableExpenses + fixedExpenses;
    const netRevenue = revenue - gatewayFees - stampDuty - refunds;
    return {
      revenue,
      gatewayFees,
      stampDuty,
      refunds,
      netRevenue,
      expenses: expensesTotal,
      procurement,
      net: netRevenue - expensesTotal - procurement,
    };
  }, [financeRules, fixedCosts, nonFixedExpenses, orders, procurements]);

  const currentTotals = useMemo(
    () => calculateTotalsForWindow(rangeStart, rangeEnd),
    [calculateTotalsForWindow, rangeEnd, rangeStart]
  );

  const previousTotals = useMemo(() => {
    const duration = Math.max(1, rangeEnd - rangeStart);
    const previousStart = rangeStart - duration;
    const previousEnd = rangeStart;
    return calculateTotalsForWindow(previousStart, previousEnd);
  }, [calculateTotalsForWindow, rangeEnd, rangeStart]);

  const selectedCurrentValue = activeMetric === 'revenue'
    ? currentTotals.revenue
    : activeMetric === 'expenses'
      ? currentTotals.expenses
      : activeMetric === 'procurement'
        ? currentTotals.procurement
        : currentTotals.net;

  const selectedPreviousValue = activeMetric === 'revenue'
    ? previousTotals.revenue
    : activeMetric === 'expenses'
      ? previousTotals.expenses
      : activeMetric === 'procurement'
        ? previousTotals.procurement
        : previousTotals.net;

  const change = calcPercentChange(selectedCurrentValue, selectedPreviousValue);
  const trendTone = resolveTrendTone(change, metricConfig.inverse);
  const trendColor = trendTone === 'positive'
    ? colors.success
    : trendTone === 'negative'
      ? colors.danger
      : colors.text.tertiary;
  const trendLabel = change === null
    ? 'No prior data'
    : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs previous period`;

  const periodRows = useMemo(() => {
    return buckets.map((bucket) => {
      const totals = calculateTotalsForWindow(bucket.startMs, bucket.endMs);
      const value = activeMetric === 'revenue'
        ? totals.revenue
        : activeMetric === 'expenses'
          ? totals.expenses
          : activeMetric === 'procurement'
            ? totals.procurement
            : totals.net;
      return {
        label: bucket.label,
        value,
      };
    });
  }, [activeMetric, buckets, calculateTotalsForWindow]);

  const displayPeriodRows = useMemo(() => {
    if ((timeRange !== 'month' && timeRange !== '30d') || thirtyDayGranularity === 'daily') return periodRows;

    const chunkSize = 7;
    const weeklyRows: { label: string; value: number }[] = [];
    for (let i = 0; i < periodRows.length; i += chunkSize) {
      const chunk = periodRows.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const total = chunk.reduce((sum, item) => sum + item.value, 0);
      const label = toWeeklyLabel(chunk[0].label, chunk[chunk.length - 1].label);
      weeklyRows.push({ label, value: total });
    }

    return weeklyRows;
  }, [periodRows, timeRange, thirtyDayGranularity]);

  const chartData = displayPeriodRows.map((item) => ({
    label: item.label,
    value: activeMetric === 'net-profit' ? Math.max(0, item.value) : Math.max(0, item.value),
  }));

  const lineChartData = useMemo<LineChartDatum[]>(
    () => chartData.map((item, index) => ({ key: `${index}-${item.label}`, label: item.label, value: item.value })),
    [chartData]
  );
  const useLineChart = timeRange === '7d' || timeRange === 'month' || timeRange === '30d';
  const lineChartMaxLabels = timeRange === 'month' || timeRange === '30d'
    ? (thirtyDayGranularity === 'weekly' ? 6 : 8)
    : 7;

  const periodBreakdownRows = displayPeriodRows.map((item) => ({
    label: item.label,
    value: activeMetric === 'net-profit' ? formatSignedCurrency(item.value) : formatCurrency(item.value),
  }));

  const contributorRows = useMemo(() => {
    if (activeMetric === 'revenue') {
      const sourceMap = new Map<string, number>();
      orders.forEach((order) => {
        const timestamp = getOrderTimestamp(order);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const source = order.source?.trim() || 'Unspecified';
        sourceMap.set(source, (sourceMap.get(source) ?? 0) + Math.max(0, Number(order.totalAmount) || 0));
      });
      const total = Array.from(sourceMap.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(sourceMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({
          label,
          value: formatCurrency(value),
          percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : undefined,
        }));
    }

    if (activeMetric === 'expenses') {
      const categoryMap = new Map<string, number>();
      nonFixedExpenses.forEach((expense) => {
        const timestamp = getExpenseTimestamp(expense);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const category = expense.category?.trim() || 'Uncategorized';
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + Math.max(0, Number(expense.amount) || 0));
      });
      fixedCosts.forEach((cost) => {
        const amount = estimateFixedCostInWindow(cost, rangeStart, rangeEnd);
        if (amount <= 0) return;
        const category = cost.category?.trim() || 'Uncategorized';
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
      });
      const total = Array.from(categoryMap.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(categoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({
          label,
          value: formatCurrency(value),
          percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : undefined,
        }));
    }

    if (activeMetric === 'procurement') {
      const supplierMap = new Map<string, number>();
      procurements.forEach((procurement) => {
        if (!isProcurementRecord(procurement)) return;
        const timestamp = getProcurementTimestamp(procurement);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const supplier = procurement.supplierName?.trim() || 'Unknown supplier';
        supplierMap.set(supplier, (supplierMap.get(supplier) ?? 0) + Math.max(0, Number(procurement.totalCost) || 0));
      });
      const total = Array.from(supplierMap.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(supplierMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({
          label,
          value: formatCurrency(value),
          percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : undefined,
        }));
    }

    return [
      { label: 'Gross Revenue', value: formatCurrency(currentTotals.revenue) },
      { label: 'Gateway Fees', value: formatSignedCurrency(-currentTotals.gatewayFees) },
      { label: 'Stamp Duty', value: formatSignedCurrency(-currentTotals.stampDuty) },
      { label: 'Refunds', value: formatSignedCurrency(-currentTotals.refunds) },
      { label: 'Net Revenue', value: formatCurrency(currentTotals.netRevenue) },
      { label: 'Expenses (incl fixed)', value: formatCurrency(currentTotals.expenses) },
      { label: 'Procurement', value: formatCurrency(currentTotals.procurement) },
      { label: 'Net Profit', value: formatSignedCurrency(currentTotals.net) },
    ];
  }, [activeMetric, orders, nonFixedExpenses, fixedCosts, procurements, rangeStart, rangeEnd, currentTotals]);

  const adjustmentRows = useMemo(() => {
    if (activeMetric === 'revenue') {
      return [
        { label: 'Gross Revenue', value: formatCurrency(currentTotals.revenue) },
        { label: 'Gateway Fees', value: formatSignedCurrency(-currentTotals.gatewayFees), subValue: 'Processor deductions' },
        { label: 'Stamp Duty', value: formatSignedCurrency(-currentTotals.stampDuty), subValue: `${formatCurrency(financeRules.incomingStampDuty ?? 50)} per qualifying transfer` },
        { label: 'Refunds', value: formatSignedCurrency(-currentTotals.refunds), subValue: 'Amounts paid back to customers' },
        { label: 'Net Revenue', value: formatCurrency(currentTotals.netRevenue), subValue: 'After fees, stamp duty, and refunds' },
      ];
    }

    if (activeMetric === 'net-profit') {
      return [
        { label: 'Gross Revenue', value: formatCurrency(currentTotals.revenue) },
        { label: 'Gateway Fees', value: formatSignedCurrency(-currentTotals.gatewayFees) },
        { label: 'Stamp Duty', value: formatSignedCurrency(-currentTotals.stampDuty) },
        { label: 'Refunds', value: formatSignedCurrency(-currentTotals.refunds) },
        { label: 'Net Revenue', value: formatCurrency(currentTotals.netRevenue) },
        { label: 'Expenses (incl fixed)', value: formatSignedCurrency(-currentTotals.expenses) },
        { label: 'Procurement', value: formatSignedCurrency(-currentTotals.procurement) },
        { label: 'Net Profit', value: formatSignedCurrency(currentTotals.net) },
      ];
    }

    return [];
  }, [activeMetric, currentTotals, financeRules.incomingStampDuty]);

  const secondaryRows = useMemo(() => {
    if (activeMetric === 'revenue') {
      const customerMap = new Map<string, number>();
      orders.forEach((order) => {
        const timestamp = getOrderTimestamp(order);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const customer = order.customerName?.trim() || 'Unknown customer';
        customerMap.set(customer, (customerMap.get(customer) ?? 0) + Math.max(0, Number(order.totalAmount) || 0));
      });
      return Array.from(customerMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value: formatCurrency(value) }));
    }

    if (activeMetric === 'expenses') {
      const merchantMap = new Map<string, number>();
      nonFixedExpenses.forEach((expense) => {
        const timestamp = getExpenseTimestamp(expense);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const merchant = extractMetadataValue(expense.description, 'merchant')
          || stripMetadata(expense.description)
          || 'Unknown merchant';
        merchantMap.set(merchant, (merchantMap.get(merchant) ?? 0) + Math.max(0, Number(expense.amount) || 0));
      });
      return Array.from(merchantMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value: formatCurrency(value) }));
    }

    if (activeMetric === 'procurement') {
      const statusMap = new Map<string, number>();
      procurements.forEach((procurement) => {
        if (!isProcurementRecord(procurement)) return;
        const timestamp = getProcurementTimestamp(procurement);
        if (timestamp === null || timestamp < rangeStart || timestamp >= rangeEnd) return;
        const statusRaw = extractMetadataValue(procurement.notes, 'status') || 'Draft';
        const normalized = statusRaw
          .trim()
          .toLowerCase()
          .replace(/[_-]+/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        const status = normalized || 'Draft';
        statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
      });
      const total = Array.from(statusMap.values()).reduce((sum, count) => sum + count, 0);
      return Array.from(statusMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({
          label,
          value,
          percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : undefined,
        }));
    }

    return periodBreakdownRows.slice(-6);
  }, [activeMetric, orders, nonFixedExpenses, procurements, periodBreakdownRows, rangeStart, rangeEnd]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <DetailHeader title={metricConfig.title} subtitle={metricConfig.subtitle} showExport={false} />

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          <View className="flex-row mt-4">
            {RANGE_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setTimeRange(option.key)}
                className="mr-2 px-4 py-2 rounded-full"
                style={{ backgroundColor: timeRange === option.key ? colors.bar : colors.bg.input }}
              >
                <Text
                  style={{ color: timeRange === option.key ? colors.bg.screen : colors.text.tertiary }}
                  className="text-sm font-semibold"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
            <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium mb-2">
              {metricConfig.title}
            </Text>
            <Text style={{ color: colors.text.primary }} className="text-4xl font-bold">
              {activeMetric === 'net-profit' ? formatSignedCurrency(selectedCurrentValue) : formatCurrency(selectedCurrentValue)}
            </Text>
            <View className="flex-row items-center mt-2">
              {trendTone === 'positive' ? (
                <TrendingUp size={16} color={trendColor} strokeWidth={2.5} />
              ) : trendTone === 'negative' ? (
                <TrendingDown size={16} color={trendColor} strokeWidth={2.5} />
              ) : null}
              <Text style={{ color: trendColor }} className="text-sm font-medium ml-1">
                {trendLabel}
              </Text>
            </View>
          </View>

          <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold mb-4">
              {metricConfig.chartTitle}
            </Text>
            {timeRange === 'month' || timeRange === '30d' ? (
              <View className="flex-row mb-4">
                {([
                  { key: 'daily', label: 'Daily' },
                  { key: 'weekly', label: 'Weekly' },
                ] as { key: ThirtyDayGranularity; label: string }[]).map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => setThirtyDayGranularity(option.key)}
                    className="mr-2 px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        thirtyDayGranularity === option.key ? colors.bar : colors.bg.input,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          thirtyDayGranularity === option.key
                            ? colors.bg.screen
                            : colors.text.tertiary,
                      }}
                      className="text-xs font-semibold"
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {useLineChart ? (
              <InteractiveLineChart
                data={lineChartData}
                height={220}
                lineColor={colors.bar}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
                formatYLabel={formatAxisCurrency}
                maxXLabels={lineChartMaxLabels}
              />
            ) : (
              <SalesBarChart
                data={chartData}
                height={220}
                barColor={colors.bar}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
                showTopValue
              />
            )}
            {activeMetric === 'net-profit' ? (
              <Text style={{ color: colors.text.muted }} className="text-xs mt-3">
                Net-profit chart clips negative bars to zero for readability. Use the breakdown tables for exact signed values.
              </Text>
            ) : null}
          </View>

          <View className="mt-4">
            <BreakdownTable
              title="Period breakdown"
              data={periodBreakdownRows}
              columns={{ label: 'Period', value: 'Value' }}
              emptyMessage="No period data available"
            />
          </View>

          {adjustmentRows.length > 0 ? (
            <View className="mt-4">
              <BreakdownTable
                title={activeMetric === 'revenue' ? 'Revenue adjustments' : 'Profit components'}
                data={adjustmentRows}
                columns={{ label: 'Metric', value: 'Amount' }}
                emptyMessage="No adjustment data available"
              />
            </View>
          ) : null}

          <View className="mt-4">
            <BreakdownTable
              title={
                activeMetric === 'revenue'
                  ? 'Revenue by source'
                  : activeMetric === 'expenses'
                    ? 'Expenses by category'
                    : activeMetric === 'procurement'
                      ? 'Spend by supplier'
                      : 'Profit & loss components'
              }
              data={contributorRows}
              columns={{
                label: activeMetric === 'revenue'
                  ? 'Source'
                  : activeMetric === 'expenses'
                    ? 'Category'
                    : activeMetric === 'procurement'
                      ? 'Supplier'
                      : 'Metric',
                value: activeMetric === 'procurement' ? 'Spend' : 'Amount',
                percentage: activeMetric === 'net-profit' ? undefined : 'Share',
              }}
              emptyMessage="No breakdown data available"
            />
          </View>

          <View className="mt-4">
            <BreakdownTable
              title={
                activeMetric === 'revenue'
                  ? 'Top customers by revenue'
                  : activeMetric === 'expenses'
                    ? 'Top merchants'
                    : activeMetric === 'procurement'
                      ? 'Status mix'
                      : 'Recent period values'
              }
              data={secondaryRows}
              columns={{
                label: activeMetric === 'revenue'
                  ? 'Customer'
                  : activeMetric === 'expenses'
                    ? 'Merchant'
                    : activeMetric === 'procurement'
                      ? 'Status'
                      : 'Period',
                value: activeMetric === 'procurement' ? 'Count' : 'Value',
                percentage: activeMetric === 'procurement' ? 'Share' : undefined,
              }}
              showIndex={activeMetric !== 'procurement' && activeMetric !== 'net-profit'}
              emptyMessage="No supporting data available"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
