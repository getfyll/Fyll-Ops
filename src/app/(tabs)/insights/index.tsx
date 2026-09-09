import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setInlineCloseHandler } from '@/lib/inline-navigation';
import {
  Users,
  ShoppingCart,
  Package,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  MapPin,
  Smartphone,
  Truck,
  BarChart3,
  DollarSign,
  UserPlus,
  UserCheck,
  Clock,
  Star,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  PackageX,
  Boxes,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react-native';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { SparklineChart } from '@/components/stats/SparklineChart';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { type FyllAiMetric } from '@/components/FyllAiAnalyticsCard';
import { FyllAiAssistantDrawer } from '@/components/FyllAiAssistantDrawer';
import { useAnalytics } from '@/hooks/useAnalytics';
import { askFyllAssistant, type FyllAssistantResponse } from '@/lib/fyll-ai-assistant';
import { TimeRange, TabKey } from '@/lib/analytics-utils';
import { computeInventoryAnalytics, calculateNewDesignAnalytics, calculateDiscontinueCandidates, type DiscontinuePeriod } from '@/lib/inventory-analytics';
import { useStatsColors, type StatsColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import SalesInsight from '@/app/insights/sales';
import OrdersInsight from '@/app/insights/orders';
import CustomersInsight from '@/app/insights/customers';
import RefundsInsight from '@/app/insights/refunds';
import TodayInsight from '@/app/insights/today';
import InventoryTodayInsight from '@/app/insights/inventory-today';
import AddonsInsight from '@/app/insights/addons';
import ServicesInsight from '@/app/insights/services';
import PartnerJobsInsight from '@/app/insights/partner-jobs';
import PlatformsInsight from '@/app/insights/platforms';
import LocationsInsight from '@/app/insights/locations';
// Note: some legacy insight routes don't have dedicated screens (low-stock, out-of-stock, best-sellers).
// We intentionally don't import them to avoid module resolution errors.
import TopRevenueInsight from '@/app/insights/top-revenue';
import MostRestockedInsight from '@/app/insights/most-restocked';
import SlowMoversInsight from '@/app/insights/slow-movers';

// KPI Configuration per tab - always 4 KPIs
interface KpiConfig {
  label: string;
  getValue: (analytics: ReturnType<typeof useAnalytics>) => string;
  getChange?: (analytics: ReturnType<typeof useAnalytics>) => number | undefined;
}

const kpiConfigByTab: Record<TabKey, KpiConfig[]> = {
  sales: [
    {
      label: 'Total Revenue',
      getValue: (a) => formatCurrency(a.totalSales),
      getChange: (a) => a.kpiMetrics.sales.change,
    },
    {
      label: 'Net Revenue',
      getValue: (a) => formatCurrency(a.netRevenue),
    },
    {
      label: 'Avg Order Value',
      getValue: (a) => formatCurrency(a.averageOrderValue),
    },
    {
      label: 'Refund Total',
      getValue: (a) => formatCurrency(a.refundsAmount),
      getChange: (a) => a.kpiMetrics.refunds.change,
    },
  ],
  services: [
    {
      label: 'Service Revenue',
      getValue: (a) => formatCurrency(a.serviceMetrics?.revenue ?? 0),
      getChange: (a) => a.serviceRevenueChange,
    },
    {
      label: 'Service Orders',
      getValue: (a) => (a.serviceMetrics?.ordersWithServices ?? 0).toString(),
    },
    {
      label: 'Service Items',
      getValue: (a) => (a.serviceMetrics?.serviceItems ?? 0).toString(),
    },
    {
      label: 'Avg Service Value',
      getValue: (a) => {
        const orders = a.serviceMetrics?.ordersWithServices ?? 0;
        const revenue = a.serviceMetrics?.revenue ?? 0;
        return orders > 0 ? formatCurrency(revenue / orders) : formatCurrency(0);
      },
    },
  ],
  orders: [
    {
      label: 'Total Orders',
      getValue: (a) => a.totalOrders.toString(),
      getChange: (a) => a.kpiMetrics.orders.change,
    },
    {
      label: 'Completed',
      getValue: (a) => a.completedOrders.toString(),
    },
    {
      label: 'Processing',
      getValue: (a) => a.processingOrders.toString(),
    },
    {
      label: 'Refunded',
      getValue: (a) => a.refundsCount.toString(),
      getChange: (a) => a.kpiMetrics.refunds.change,
    },
  ],
  customers: [
    {
      label: 'Unique Customers',
      getValue: (a) => a.kpiMetrics.customers.value.toString(),
      getChange: (a) => a.kpiMetrics.customers.change,
    },
    {
      label: 'New Customers',
      getValue: (a) => a.newCustomers.toString(),
    },
    {
      label: 'Returning',
      getValue: (a) => a.returningCustomers.toString(),
    },
    {
      label: 'Repeat Rate',
      getValue: (a) => `${a.returningVsNew.returningPercentage}%`,
    },
  ],
  // Inventory KPIs are handled separately since they use different data source
  inventory: [
    { label: 'Total Products', getValue: () => '0' },
    { label: 'Total Variants', getValue: () => '0' },
    { label: 'Units In Stock', getValue: () => '0' },
    { label: 'Low Stock', getValue: () => '0' },
  ],
};

// KPI Tile Component (inline for reduced motion)
function KpiTile({
  label,
  value,
  change,
  colors,
}: {
  label: string;
  value: string;
  change?: number;
  colors: StatsColors;
}) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const changeColor = isPositive
    ? colors.success
    : isNegative
      ? colors.danger
      : colors.text.tertiary;

  return (
    <View
      className="flex-1 rounded-2xl p-4"
      style={{
        backgroundColor: colors.bg.card,
        borderWidth: colors.card.borderWidth,
        borderColor: colors.card.borderColor,
      }}
    >
      <Text
        style={{ color: colors.text.tertiary }}
        className="text-xs font-medium mb-1"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{ color: colors.text.primary }}
        className="text-lg font-bold"
        numberOfLines={1}
      >
        {value}
      </Text>
      {change !== undefined && (
        <View className="flex-row items-center mt-1">
          {isPositive && (
            <TrendingUp size={12} color={changeColor} strokeWidth={2.5} />
          )}
          {isNegative && (
            <TrendingDown size={12} color={changeColor} strokeWidth={2.5} />
          )}
          <Text style={{ color: changeColor }} className="text-xs font-medium ml-1">
            {isPositive && '+'}
            {change.toFixed(1)}%
          </Text>
        </View>
      )}
    </View>
  );
}

// 2x2 KPI Grid Component
function KpiGrid({
  analytics,
  activeTab,
  inventoryAnalytics,
  colors,
}: {
  analytics: ReturnType<typeof useAnalytics>;
  activeTab: TabKey;
  inventoryAnalytics?: ReturnType<typeof computeInventoryAnalytics>;
  colors: StatsColors;
}) {
  // For inventory tab, use inventory-specific data
  if (activeTab === 'inventory' && inventoryAnalytics) {
    return (
      <View className="px-5 pt-4">
        <View className="flex-row mb-3" style={{ gap: 12 }}>
          <KpiTile
            label="Total Products"
            value={inventoryAnalytics.overview.totalProducts.toString()}
            colors={colors}
          />
          <KpiTile
            label="Total Variants"
            value={inventoryAnalytics.overview.totalVariants.toString()}
            colors={colors}
          />
        </View>
        <View className="flex-row" style={{ gap: 12 }}>
          <KpiTile
            label="Inventory Value"
            value={formatCurrency(inventoryAnalytics.overview.totalInventoryValue)}
            colors={colors}
          />
          <KpiTile
            label="Low Stock"
            value={inventoryAnalytics.overview.lowStockItems.toString()}
            colors={colors}
          />
        </View>
      </View>
    );
  }

  const kpis = kpiConfigByTab[activeTab];

  return (
    <View className="px-5 pt-4">
      <View className="flex-row mb-3" style={{ gap: 12 }}>
        <KpiTile
          label={kpis[0].label}
          value={kpis[0].getValue(analytics)}
          change={kpis[0].getChange?.(analytics)}
          colors={colors}
        />
        <KpiTile
          label={kpis[1].label}
          value={kpis[1].getValue(analytics)}
          change={kpis[1].getChange?.(analytics)}
          colors={colors}
        />
      </View>
      <View className="flex-row" style={{ gap: 12 }}>
        <KpiTile
          label={kpis[2].label}
          value={kpis[2].getValue(analytics)}
          change={kpis[2].getChange?.(analytics)}
          colors={colors}
        />
        <KpiTile
          label={kpis[3].label}
          value={kpis[3].getValue(analytics)}
          change={kpis[3].getChange?.(analytics)}
          colors={colors}
        />
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const colors = useStatsColors();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const panelStyles = getSettingsWebPanelStyles(isFromSettingsRoute(from), colors.bg.screen, colors.border);
  const webDesktopGutterPad = isWebDesktop ? 8 : 0; // px-5 (20) + 8 = 28 (matches other web screens)
  const [activeTab, setActiveTab] = useState<TabKey>('sales');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [showInsightsAiPanel, setShowInsightsAiPanel] = useState(false);
  const [newDesignYear, setNewDesignYear] = useState(new Date().getFullYear());
  const [discontinuePeriod, setDiscontinuePeriod] = useState<DiscontinuePeriod>('30d');
  const [discontinueStockThreshold, setDiscontinueStockThreshold] = useState(5);

  // Selected sub-insight (for desktop inline panel)
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);

  const handleOpenInsight = (route: string) => {
    if (isWebDesktop) {
      setSelectedInsight(route);
      setInlineCloseHandler(() => setSelectedInsight(null));
      // keep left panel visible and render the sub-insight in a right panel
    } else {
      router.push(route);
    }
  };

  // Clear inline handler when not showing a selected insight
  if (!isWebDesktop) {
    setInlineCloseHandler(null);
  }

  // Use real analytics data
  const analytics = useAnalytics(timeRange, activeTab);

  // Inventory data from store
  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const restockLogs = useFyllStore((s) => s.restockLogs);

  // Global low stock threshold settings
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);

  // Compute inventory analytics
  const inventoryAnalytics = useMemo(() => {
    const threshold = useGlobalLowStockThreshold ? globalLowStockThreshold : undefined;
    return computeInventoryAnalytics(products, orders, restockLogs, timeRange, threshold);
  }, [products, orders, restockLogs, timeRange, useGlobalLowStockThreshold, globalLowStockThreshold]);

  // Compute new design analytics for selected year
  const newDesignAnalytics = useMemo(() => {
    return calculateNewDesignAnalytics(products, orders, restockLogs, newDesignYear);
  }, [products, orders, restockLogs, newDesignYear]);

  // Compute discontinue candidates
  const discontinueCandidates = useMemo(() => {
    return calculateDiscontinueCandidates(
      products,
      orders,
      restockLogs,
      discontinuePeriod,
      discontinueStockThreshold,
      50
    );
  }, [products, orders, restockLogs, discontinuePeriod, discontinueStockThreshold]);

  const serviceRevenueChange = analytics.serviceRevenueChange ?? 0;
  const serviceBreakdown = analytics.serviceBreakdown ?? [];
  const serviceByPeriod = analytics.serviceByPeriod ?? [];
  const totalServiceRevenue = serviceBreakdown.reduce((sum, item) => sum + item.revenue, 0);
  const serviceChartData = serviceBreakdown.map((item) => ({
    label: item.name,
    value: item.revenue,
    percentage: Math.round((item.revenue / (totalServiceRevenue || 1)) * 100),
  }));

  const addOnRevenueChange = analytics.addOnRevenueChange ?? 0;
  const addOnBreakdown = analytics.addOnBreakdown ?? [];
  const addOnByPeriod = analytics.addOnByPeriod ?? [];

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'sales', label: 'Sales' },
    { key: 'services', label: 'Services' },
    { key: 'orders', label: 'Orders' },
    { key: 'customers', label: 'Customers' },
    { key: 'inventory', label: 'Inventory' },
  ];

  const timeRangeOptions = useMemo<{ key: TimeRange; label: string }[]>(
    () => [
      { key: '7d', label: 'Last 7 days' },
      { key: 'month', label: 'This Month' },
      { key: '30d', label: 'Last 30 days' },
      { key: 'year', label: 'This Year' },
    ],
    []
  );

  // Mapping of insight routes to display titles and subtitles
  const insightTitles: Record<string, { title: string; subtitle: string }> = {
    '/insights/sales': { title: 'Sales Analytics', subtitle: 'Revenue breakdown and trends' },
    '/insights/today': { title: 'Today', subtitle: 'Orders and revenue summary' },
    '/insights/inventory-today': { title: 'Inventory Today', subtitle: 'Daily inventory summary' },
    '/insights/addons': { title: 'Add-ons Revenue', subtitle: 'Full add-on performance' },
    '/insights/services': { title: 'Service Revenue', subtitle: 'Service performance analysis' },
    '/insights/partner-jobs': { title: 'Partner Job Reports', subtitle: 'Category, service, and monthly volume' },
    '/insights/platforms': { title: 'Platform Analytics', subtitle: 'Sales channel breakdown' },
    '/insights/locations': { title: 'Customer Locations', subtitle: 'Geographic breakdown' },
    '/insights/orders': { title: 'Orders Analytics', subtitle: 'Order status and performance' },
    '/insights/customers': { title: 'Customers Analytics', subtitle: 'Customer insights and metrics' },
    '/insights/top-revenue': { title: 'Top Revenue Products', subtitle: 'Highest earning products' },
    '/insights/most-restocked': { title: 'Most Restocked', subtitle: 'Most frequently restocked products' },
    '/insights/slow-movers': { title: 'Slow Movers', subtitle: 'Products with low sales' },
    '/insights/refunds': { title: 'Refunds Analytics', subtitle: 'Refund trends and analysis' },
  };

  // Check if we have data
  const hasData = analytics.totalOrders > 0 || analytics.todayOrders > 0 || products.length > 0;

  const insightsAiSummary = useMemo(() => {
    const totalSales = analytics.totalSales;
    const totalOrders = analytics.totalOrders;
    const refundsAmount = analytics.refundsAmount;
    const refundRate = totalSales > 0 ? refundsAmount / totalSales : 0;
    const completedRate = totalOrders > 0 ? analytics.completedOrders / totalOrders : 0;
    const repeatRate = (analytics.returningVsNew?.returningPercentage ?? 0) / 100;

    let score = 50;
    if (totalOrders > 0) score += 10;

    if (analytics.salesChange >= 8) score += 15;
    else if (analytics.salesChange >= 0) score += 8;
    else score -= 10;

    if (refundRate <= 0.03) score += 8;
    else if (refundRate >= 0.08) score -= 12;

    if (completedRate >= 0.6) score += 8;
    else if (completedRate < 0.35 && totalOrders > 0) score -= 6;

    if (repeatRate >= 0.4) score += 8;
    else if (repeatRate < 0.2 && totalOrders > 0) score -= 5;

    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    const statusLabel = normalizedScore >= 75 ? 'Strong' : normalizedScore >= 55 ? 'Stable' : 'Watch';

    let headline = 'No order activity in this period yet. Data will update as new orders land.';
    if (totalOrders > 0 && analytics.salesChange < 0) {
      headline = 'Sales momentum is softer versus the previous period, and conversion quality needs attention.';
    } else if (totalOrders > 0 && refundRate >= 0.07) {
      headline = 'Revenue is active, but refund pressure is high enough to impact net performance.';
    } else if (totalOrders > 0) {
      headline = 'Core performance is stable with healthy completion throughput and manageable refund load.';
    }

    const recommendations: { id: string; text: string }[] = [];

    if (refundRate >= 0.05) {
      recommendations.push({
        id: 'refund-check',
        text: `Refund rate is ${(refundRate * 100).toFixed(1)}%. Review refunded SKUs and delivery issues to cut leakage.`,
      });
    }

    if (analytics.processingOrders > analytics.completedOrders) {
      recommendations.push({
        id: 'ops-throughput',
        text: 'Processing orders are above completed orders. Tighten shipping SLA and prioritize pending fulfillment.',
      });
    }

    if (repeatRate < 0.3 && totalOrders > 0) {
      recommendations.push({
        id: 'retention',
        text: 'Returning customer share is low. Run a repeat-purchase offer for recent buyers this week.',
      });
    }

    if (analytics.averageOrderValue > 0 && analytics.addOnMetrics?.ordersWithAddOns === 0) {
      recommendations.push({
        id: 'addons',
        text: 'No add-ons detected in this period. Enable add-on prompts during order capture to lift average basket.',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'steady',
        text: 'Performance is balanced. Keep daily checks on sales change, refund rate, and completion throughput.',
      });
    }

    const keyMetrics: FyllAiMetric[] = [
      {
        label: 'Revenue Change',
        value: `${analytics.salesChange >= 0 ? '+' : ''}${analytics.salesChange.toFixed(1)}%`,
        tone: analytics.salesChange > 0 ? 'positive' : analytics.salesChange < 0 ? 'negative' : 'neutral',
      },
      {
        label: 'Refund Rate',
        value: `${(refundRate * 100).toFixed(1)}%`,
        tone: refundRate >= 0.05 ? 'negative' : refundRate > 0.02 ? 'neutral' : 'positive',
      },
      {
        label: 'Completed Rate',
        value: `${(completedRate * 100).toFixed(0)}%`,
        tone: completedRate >= 0.6 ? 'positive' : completedRate > 0.35 ? 'neutral' : 'negative',
      },
    ];

    return {
      score: normalizedScore,
      statusLabel,
      headline,
      keyMetrics,
      recommendations,
    };
  }, [analytics]);

  const insightsAiRecommendations = useMemo(
    () => insightsAiSummary.recommendations.map((item) => item.text),
    [insightsAiSummary.recommendations]
  );

  const insightsAiContextBadges = useMemo(() => [
    { label: 'Range', value: timeRangeOptions.find((item) => item.key === timeRange)?.label ?? timeRange },
    { label: 'Health', value: `${insightsAiSummary.score}/100` },
    { label: 'Revenue', value: formatCurrency(analytics.totalSales) },
    { label: 'Orders', value: analytics.totalOrders.toLocaleString() },
  ], [analytics.totalOrders, analytics.totalSales, insightsAiSummary.score, timeRange, timeRangeOptions]);

  const insightsAiOpeningMessage = useMemo(
    () => `${insightsAiSummary.headline} Ask me about growth, refunds, operations, or what to focus on next.`,
    [insightsAiSummary.headline]
  );

  const insightsAiQuickPrompts = useMemo(
    () => ['How is growth?', 'Why are refunds happening?', 'What should we improve first?', 'How do I increase repeat customers?'],
    []
  );

  const handleAskInsightsAi = useCallback(async (
    question: string,
    history: { role: 'assistant' | 'user'; text: string }[]
  ): Promise<FyllAssistantResponse> => {
    const q = question.trim().toLowerCase();
    const isGreeting = /^(hi|hello|hey|yo|sup|what'?s up|whats up|good morning|good afternoon|good evening|how are you)[!.?,\s]*$/.test(q);
    if (isGreeting || q.length <= 2) {
      return {
        text: 'Hi. I can help with insights, finance, ops, and growth. Try asking: "what should we improve first this week?"',
        cards: [],
      };
    }
    const refundRate = analytics.totalSales > 0 ? (analytics.refundsAmount / analytics.totalSales) * 100 : 0;
    const completedRate = analytics.totalOrders > 0 ? (analytics.completedOrders / analytics.totalOrders) * 100 : 0;
    const repeatRate = analytics.returningVsNew?.returningPercentage ?? 0;

    try {
      return await askFyllAssistant({
        scope: 'insights',
        question,
        periodLabel: timeRangeOptions.find((option) => option.key === timeRange)?.label ?? timeRange,
        headline: insightsAiSummary.headline,
        metrics: [
          { label: 'Total Revenue', value: formatCurrency(analytics.totalSales) },
          { label: 'Sales Change', value: `${analytics.salesChange >= 0 ? '+' : ''}${analytics.salesChange.toFixed(1)}%` },
          { label: 'Orders', value: analytics.totalOrders.toLocaleString() },
          { label: 'Refund Amount', value: formatCurrency(analytics.refundsAmount) },
          { label: 'Refund Rate', value: `${refundRate.toFixed(1)}%` },
          { label: 'Completed Rate', value: `${completedRate.toFixed(0)}%` },
          { label: 'Returning Customers', value: `${repeatRate.toFixed(0)}%` },
        ],
        recommendations: insightsAiRecommendations,
        history,
      });
    } catch {
      // Fall back to deterministic local answers when API key/quota/network fails.
    }

    if (q.includes('growth') || q.includes('sales') || q.includes('revenue')) {
      return {
        text: `Revenue is ${formatCurrency(analytics.totalSales)} in this range, with a ${analytics.salesChange >= 0 ? '+' : ''}${analytics.salesChange.toFixed(1)}% change versus the previous period.`,
        cards: [
          {
            title: 'Total Revenue',
            value: formatCurrency(analytics.totalSales),
            hint: 'Selected period',
            tone: analytics.salesChange >= 0 ? 'positive' : 'negative',
          },
          {
            title: 'Revenue Change',
            value: `${analytics.salesChange >= 0 ? '+' : ''}${analytics.salesChange.toFixed(1)}%`,
            hint: 'Vs previous period',
            tone: analytics.salesChange >= 0 ? 'positive' : 'negative',
          },
        ],
      };
    }

    if (q.includes('refund')) {
      return {
        text: `Refund leakage is ${formatCurrency(analytics.refundsAmount)} (${refundRate.toFixed(1)}% of revenue). Prioritize root causes by product and delivery issues first.`,
        cards: [
          {
            title: 'Refund Amount',
            value: formatCurrency(analytics.refundsAmount),
            hint: 'Total refunded value',
            tone: 'negative',
          },
          {
            title: 'Refund Rate',
            value: `${refundRate.toFixed(1)}%`,
            hint: 'Share of revenue refunded',
            tone: refundRate >= 5 ? 'negative' : refundRate > 2 ? 'neutral' : 'positive',
          },
        ],
      };
    }

    if (q.includes('delivery') || q.includes('operations') || q.includes('fulfillment')) {
      return {
        text: `Completed rate is ${completedRate.toFixed(0)}% (${analytics.completedOrders}/${analytics.totalOrders || 0} orders). Processing orders currently at ${analytics.processingOrders}.`,
        cards: [
          {
            title: 'Completed Rate',
            value: `${completedRate.toFixed(0)}%`,
            hint: `${analytics.completedOrders}/${analytics.totalOrders || 0} orders`,
            tone: completedRate >= 60 ? 'positive' : completedRate > 35 ? 'neutral' : 'negative',
          },
          {
            title: 'Processing Orders',
            value: analytics.processingOrders.toLocaleString(),
            hint: 'Current queue size',
            tone: analytics.processingOrders > analytics.completedOrders ? 'negative' : 'neutral',
          },
        ],
      };
    }

    if (q.includes('repeat') || q.includes('retention') || q.includes('customer')) {
      return {
        text: `Returning customer share is ${repeatRate.toFixed(0)}%. New customers: ${analytics.newCustomers}. Returning customers: ${analytics.returningCustomers}.`,
        cards: [
          {
            title: 'Returning Share',
            value: `${repeatRate.toFixed(0)}%`,
            hint: 'Returning vs new customer mix',
            tone: repeatRate >= 40 ? 'positive' : repeatRate >= 25 ? 'neutral' : 'negative',
          },
          {
            title: 'New Customers',
            value: analytics.newCustomers.toLocaleString(),
            hint: 'Acquisition in this period',
            tone: 'neutral',
          },
        ],
      };
    }

    if (q.includes('what should') || q.includes('recommend') || q.includes('next') || q.includes('improve')) {
      const topActions = insightsAiRecommendations.slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join('\n');
      return {
        text: `Top actions to improve performance now:\n${topActions}`,
        cards: insightsAiRecommendations.slice(0, 3).map((item, index) => ({
          title: `Action ${index + 1}`,
          value: item,
          hint: 'High-impact next step',
          tone: 'neutral' as const,
        })),
      };
    }

    if (q.includes('summary') || q.includes('snapshot') || q.includes('overview')) {
      return {
        text: `Current snapshot: ${formatCurrency(analytics.totalSales)} revenue, ${analytics.totalOrders} orders, ${formatCurrency(analytics.refundsAmount)} refunds, ${completedRate.toFixed(0)}% completed rate.`,
        cards: [
          {
            title: 'Revenue',
            value: formatCurrency(analytics.totalSales),
            hint: 'Current selected range',
            tone: analytics.salesChange >= 0 ? 'positive' : 'negative',
          },
          {
            title: 'Refund Rate',
            value: `${refundRate.toFixed(1)}%`,
            hint: `${formatCurrency(analytics.refundsAmount)} refunded`,
            tone: refundRate >= 5 ? 'negative' : refundRate > 2 ? 'neutral' : 'positive',
          },
        ],
      };
    }

    return {
      text: `Current snapshot: ${formatCurrency(analytics.totalSales)} revenue, ${analytics.totalOrders} orders, ${formatCurrency(analytics.refundsAmount)} refunds, ${completedRate.toFixed(0)}% completed rate.`,
      cards: [],
    };
  }, [analytics, insightsAiRecommendations, insightsAiSummary.headline, timeRange, timeRangeOptions]);

  // Empty state component
  const EmptyState = () => (
    <View className="flex-1 items-center justify-center py-20 px-5" style={{ paddingBottom: tabBarHeight + 16 }}>
      <View
        className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
        style={colors.getCardStyle()}
      >
        <BarChart3 size={40} color={colors.text.muted} strokeWidth={1.5} />
      </View>
      <Text
        style={{ color: colors.text.primary }}
        className="text-lg font-semibold mb-2 text-center"
      >
        No Analytics Yet
      </Text>
      <Text
        style={{ color: colors.text.tertiary }}
        className="text-sm text-center"
      >
        Start creating orders to see your analytics and insights here.
      </Text>
    </View>
  );

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View style={isWebDesktop ? { paddingHorizontal: webDesktopGutterPad } : undefined}>
          {isWebDesktop && selectedInsight ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: -webDesktopGutterPad, paddingHorizontal: webDesktopGutterPad }}>
              <View
                className="px-5 pt-5 pb-4 flex-row items-center gap-3"
                style={{
                  maxWidth: 1440,
                  width: '100%',
                  alignSelf: 'flex-start',
                  minHeight: desktopHeaderMinHeight,
                }}
              >
                <Pressable
                  onPress={() => setSelectedInsight(null)}
                  className="active:opacity-70 mr-2"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: colors.bg.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View className="flex-1">
                  <Text
                    style={{ color: colors.text.primary, ...pageHeadingStyle }}
                    numberOfLines={1}
                  >
                    {insightTitles[selectedInsight]?.title || 'Insight'}
                  </Text>
                  {insightTitles[selectedInsight]?.subtitle && (
                    <Text
                      style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 4 }}
                      numberOfLines={1}
                    >
                      {insightTitles[selectedInsight].subtitle}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <View>
              <View style={isWebDesktop ? { borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: -webDesktopGutterPad, paddingHorizontal: webDesktopGutterPad } : undefined}>
                <View
                  className={isWebDesktop ? 'px-5 pt-5 pb-4' : 'px-5 pt-6 pb-2'}
                  style={isWebDesktop ? {
                    maxWidth: 1440,
                    width: '100%',
                    alignSelf: 'flex-start',
                    minHeight: desktopHeaderMinHeight,
                    justifyContent: 'center',
                  } : undefined}
                >
                  <View
                    className={isWebDesktop ? 'flex-row items-center justify-between' : undefined}
                    style={isWebDesktop ? undefined : { gap: 4 }}
                  >
                    <Text
                      style={{ color: colors.text.primary, ...pageHeadingStyle }}
                    >
                      Insights
                    </Text>
                    <Text
                      style={{
                        color: colors.text.tertiary,
                        fontSize: 12,
                        lineHeight: 18,
                        marginTop: isWebDesktop ? 4 : 0,
                      }}
                      numberOfLines={isWebDesktop ? 1 : 2}
                    >
                      Review revenue, orders, inventory, customers, and operations trends.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[
                  { flexGrow: 0 },
                  isWebDesktop ? { maxWidth: 1440, width: '100%', alignSelf: 'flex-start' } : undefined,
                ]}
                contentContainerStyle={isWebDesktop ? { marginTop: 12, paddingHorizontal: 20 } : { marginTop: 16, paddingHorizontal: 20 }}
              >
                {tabs.map((tab) => (
                  <Pressable
                    key={tab.key}
                    onPress={() => { setActiveTab(tab.key); setSelectedInsight(null); }}
                    className="mr-6 pb-3"
                    style={{
                      borderBottomWidth: 2,
                      borderBottomColor:
                        !selectedInsight && activeTab === tab.key
                          ? colors.text.primary
                          : 'transparent',
                      outlineStyle: 'none',
                    } as any}
                  >
                    <Text
                      style={{
                        color:
                          !selectedInsight && activeTab === tab.key
                            ? colors.text.primary
                            : colors.text.tertiary,
                      }}
                      className="text-base font-semibold"
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setSelectedInsight('/insights/partner-jobs')}
                  className="mr-6 pb-3"
                  style={{
                    borderBottomWidth: 2,
                    borderBottomColor:
                      selectedInsight === '/insights/partner-jobs'
                        ? colors.text.primary
                        : 'transparent',
                    outlineStyle: 'none',
                  } as any}
                >
                  <Text
                    style={{
                      color:
                        selectedInsight === '/insights/partner-jobs'
                          ? colors.text.primary
                          : colors.text.tertiary,
                    }}
                    className="text-base font-semibold"
                  >
                    Partners
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>

        {!hasData ? (
          <EmptyState />
        ) : (
          <View style={[{ flex: 1 }, isWebDesktop ? { paddingHorizontal: webDesktopGutterPad, alignItems: 'flex-start' } : undefined]}>
            {(isWebDesktop && selectedInsight) || selectedInsight === '/insights/partner-jobs' ? (
              <View style={{ flex: 1, width: '100%', maxWidth: 1440, alignSelf: 'flex-start' }}>
                {isWebDesktop && selectedInsight === '/insights/sales' && <SalesInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/today' && <TodayInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/inventory-today' && <InventoryTodayInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/addons' && <AddonsInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/services' && <ServicesInsight inline />}
                {selectedInsight === '/insights/partner-jobs' && <PartnerJobsInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/platforms' && <PlatformsInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/locations' && <LocationsInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/orders' && <OrdersInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/customers' && <CustomersInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/top-revenue' && <TopRevenueInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/most-restocked' && <MostRestockedInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/slow-movers' && <SlowMoversInsight inline />}
                {isWebDesktop && selectedInsight === '/insights/refunds' && <RefundsInsight inline />}
              </View>
            ) : (
              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                style={isWebDesktop ? { flex: 1, maxWidth: 1440, width: '100%', alignSelf: 'flex-start' } : undefined}
                contentContainerStyle={{ paddingBottom: Math.max(40, tabBarHeight + 16) }}
              >
                <>
                  {/* Today Summary Card - Shared across tabs */}
                  <Pressable
                    className="px-5 pt-4"
                    onPress={() => {
                      if (activeTab === 'inventory') {
                        handleOpenInsight('/insights/inventory-today');
                      } else {
                        handleOpenInsight('/insights/today');
                      }
                    }}
                  >
                    <View
                      className="rounded-2xl p-5"
                      style={{
                        backgroundColor: colors.bg.card,
                        borderWidth: colors.card.borderWidth,
                        borderColor: colors.card.borderColor,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: colors.card.shadowOpacity,
                        shadowRadius: 8,
                        elevation: colors.card.shadowOpacity > 0 ? 5 : 0,
                      }}
                    >
                      <View className="flex-row items-center justify-between mb-3">
                        <Text
                          style={{ color: colors.text.tertiary }}
                          className="text-sm font-medium"
                        >
                          Today
                        </Text>
                        <ChevronRight
                          size={16}
                          color={colors.text.tertiary}
                          strokeWidth={2}
                        />
                      </View>

                      <View className="flex-row items-start justify-between">
                        {/* Main stat based on tab */}
                        <View className="flex-1">
                          <Text
                            style={{ color: colors.text.primary }}
                            className="text-3xl font-bold"
                          >
                            {activeTab === 'sales' && formatCurrency(analytics.todaySales)}
                            {activeTab === 'orders' && `${analytics.todayOrders} orders`}
                            {activeTab === 'customers' &&
                              `${analytics.todayCustomers} customers`}
                            {activeTab === 'services' &&
                              formatCurrency(analytics.todayServiceMetrics?.revenue ?? 0)}
                            {activeTab === 'inventory' &&
                              `${inventoryAnalytics.overview.totalUnitsInStock.toLocaleString()} units`}
                          </Text>

                          {/* Mini metrics row */}
                          {activeTab === 'services' ? (
                            <View className="flex-row mt-4 flex-wrap">
                              <View className="flex-row items-center mr-4 mb-2">
                                <Package
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayServiceMetrics?.ordersWithServices ?? 0} orders
                                </Text>
                              </View>
                              <View className="flex-row items-center mr-4 mb-2">
                                <Users
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayServiceMetrics?.serviceItems ?? 0} services
                                </Text>
                              </View>
                              <View className="flex-row items-center mb-2">
                                <DollarSign
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {formatCurrency(analytics.todayServiceMetrics?.revenue ?? 0)}
                                </Text>
                              </View>
                            </View>
                          ) : activeTab !== 'inventory' ? (
                            <View className="flex-row mt-4 flex-wrap">
                              <View className="flex-row items-center mr-4 mb-2">
                                <Users
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayCustomers}
                                </Text>
                              </View>
                              <View className="flex-row items-center mr-4 mb-2">
                                <ShoppingCart
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayOrders}
                                </Text>
                              </View>
                              <View className="flex-row items-center mr-4 mb-2">
                                <Package
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayUnits}
                                </Text>
                              </View>
                              <View className="flex-row items-center mb-2">
                                <RefreshCw
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {analytics.todayRefunds}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View className="flex-row mt-4 flex-wrap">
                              <View className="flex-row items-center mr-4 mb-2">
                                <Package
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {inventoryAnalytics.overview.totalProducts} products
                                </Text>
                              </View>
                              <View className="flex-row items-center mr-4 mb-2">
                                <Boxes
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {inventoryAnalytics.overview.totalVariants} variants
                                </Text>
                              </View>
                              <View className="flex-row items-center mr-4 mb-2">
                                <AlertTriangle
                                  size={14}
                                  color="#F59E0B"
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {inventoryAnalytics.overview.lowStockItems} low
                                </Text>
                              </View>
                              <View className="flex-row items-center mb-2">
                                <PackageX
                                  size={14}
                                  color={colors.danger}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-sm ml-1.5"
                                >
                                  {inventoryAnalytics.overview.outOfStockItems} out
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Sparkline */}
                        <View className="ml-4">
                          <SparklineChart
                            data={analytics.hourlyTrend}
                            width={100}
                            height={50}
                            strokeColor={colors.bar}
                            strokeWidth={2}
                          />
                        </View>
                      </View>
                    </View>
                  </Pressable>

                  {/* Time range selector - Shared */}
                  <View className="px-5 pt-4">
                    <View className="flex-row">
                      {timeRangeOptions.map((option) => (
                        <Pressable
                          key={option.key}
                          onPress={() => setTimeRange(option.key)}
                          className="mr-2 px-3 py-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              timeRange === option.key
                                ? colors.bar
                                : colors.bg.input,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                timeRange === option.key
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
                  </View>

                  {/* KPI Grid - 2x2 layout, always 4 cards */}
                  <KpiGrid analytics={analytics} activeTab={activeTab} inventoryAnalytics={inventoryAnalytics} colors={colors} />

                  {/* ===================== SALES TAB CONTENT ===================== */}
                  {activeTab === 'sales' && (
                    <>
                      {/* Revenue Chart Card */}
                      <Pressable
                        className="px-5 pt-4"
                        onPress={() => handleOpenInsight('/insights/sales')}
                      >
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          <View className="flex-row items-center justify-between mb-2">
                            <Text
                              style={{ color: colors.text.primary }}
                              className="text-base font-bold"
                            >
                              Revenue
                            </Text>
                            <ChevronRight
                              size={16}
                              color={colors.text.tertiary}
                              strokeWidth={2}
                            />
                          </View>
                          <Text
                            style={{ color: colors.text.primary }}
                            className="text-2xl font-bold"
                          >
                            {formatCurrency(analytics.totalSales)}
                          </Text>
                          <View className="flex-row items-center mt-1 mb-4">
                            {analytics.salesChange >= 0 ? (
                              <TrendingUp
                                size={14}
                                color={colors.success}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <TrendingDown
                                size={14}
                                color={colors.danger}
                                strokeWidth={2.5}
                              />
                            )}
                            <Text
                              style={{
                                color:
                                  analytics.salesChange >= 0
                                    ? colors.success
                                    : colors.danger,
                              }}
                              className="text-sm font-medium ml-1"
                            >
                              {analytics.salesChange >= 0 ? '+' : ''}
                              {analytics.salesChange.toFixed(1)}% vs last period
                            </Text>
                          </View>
                          <SalesBarChart
                            data={analytics.salesByPeriod}
                            height={180}
                            barColor={colors.bar}
                            gridColor={colors.barBg}
                            textColor={colors.text.tertiary}
                          />
                        </View>
                      </Pressable>

                      {/* Top Add-ons Revenue */}
                      {analytics.topAddOns.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/addons')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <DollarSign
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Top Add-ons Revenue
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {analytics.topAddOns.map((addon, index) => (
                              <View
                                key={addon.name}
                                className="flex-row items-center justify-between py-3"
                                style={{
                                  borderBottomWidth:
                                    index < analytics.topAddOns.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View>
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-medium"
                                  >
                                    {addon.name}
                                  </Text>
                                  <Text
                                    style={{ color: colors.text.tertiary }}
                                    className="text-xs"
                                  >
                                    {addon.count} orders
                                  </Text>
                                </View>
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-sm font-bold"
                                >
                                  {formatCurrency(addon.revenue)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      )}

                      {/* Add-ons Revenue - Graph Card */}
                      {analytics.addOnMetrics?.revenue > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/addons')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-2">
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-base font-bold"
                              >
                                Add-ons Revenue
                              </Text>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <Text
                              style={{ color: colors.text.primary }}
                              className="text-2xl font-bold"
                            >
                              {formatCurrency(analytics.addOnMetrics?.revenue ?? 0)}
                            </Text>
                            <View className="flex-row items-center mt-1 mb-4">
                              {addOnRevenueChange >= 0 ? (
                                <TrendingUp
                                  size={14}
                                  color={colors.success}
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <TrendingDown
                                  size={14}
                                  color={colors.danger}
                                  strokeWidth={2.5}
                                />
                              )}
                              <Text
                                style={{
                                  color: addOnRevenueChange >= 0 ? colors.success : colors.danger,
                                }}
                                className="text-sm font-medium ml-1"
                              >
                                {addOnRevenueChange >= 0 ? '+' : ''}
                                {addOnRevenueChange.toFixed(1)}% vs last period
                              </Text>
                            </View>
                            <SalesBarChart
                              data={addOnByPeriod}
                              height={140}
                              barColor={colors.bar}
                              gridColor={colors.barBg}
                              textColor={colors.text.tertiary}
                            />
                            <View className="flex-row items-center justify-between mt-4 flex-wrap">
                              <View className="flex-row items-center mb-2">
                                <Package
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-xs ml-1.5"
                                >
                                  {analytics.addOnMetrics?.ordersWithAddOns ?? 0} orders
                                </Text>
                              </View>
                              <View className="flex-row items-center mb-2">
                                <Users
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-xs ml-1.5"
                                >
                                  {analytics.addOnMetrics?.addOnItems ?? 0} add-ons
                                </Text>
                              </View>
                              <View className="flex-row items-center mb-2">
                                <DollarSign
                                  size={14}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.secondary }}
                                  className="text-xs ml-1.5"
                                >
                                  Today: {formatCurrency(analytics.todayAddOnMetrics?.revenue ?? 0)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      )}

                      {/* Top Add-ons Breakdown - List Card */}
                      {addOnBreakdown.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/addons')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <DollarSign
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Top Add-ons
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {addOnBreakdown.slice(0, 5).map((item, index) =>
                              item ? (
                                <View
                                  key={item.name}
                                  className="flex-row items-center justify-between py-3"
                                  style={{
                                    borderBottomWidth:
                                      index < Math.min(addOnBreakdown.length, 5) - 1 ? 1 : 0,
                                    borderBottomColor: colors.divider,
                                  }}
                                >
                                  <View>
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                    >
                                      {item.name}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {item.orders} orders
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-bold"
                                  >
                                    {formatCurrency(item.revenue)}
                                  </Text>
                                </View>
                              ) : null
                            )}
                          </View>
                        </Pressable>
                      )}

                      {/* Revenue by Source */}
                      {analytics.revenueBySource.length > 0 && (
                        <Pressable
                          className="px-5 pt-4 pb-6"
                          onPress={() => handleOpenInsight('/insights/platforms')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Smartphone
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Revenue by Source
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <HorizontalBarChart
                              data={analytics.revenueBySource}
                              barColor={colors.bar}
                              backgroundColor={colors.barBg}
                              textColor={colors.text.primary}
                              secondaryTextColor={colors.text.tertiary}
                              formatValue={(v) => formatCurrency(v)}
                            />
                          </View>
                        </Pressable>
                      )}
                    </>
                  )}

                  {/* ===================== SERVICES TAB CONTENT ===================== */}
                  {activeTab === 'services' && (
                    <>
                      {analytics.serviceMetrics?.revenue > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/services')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-2">
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-base font-bold"
                              >
                                Service Revenue
                              </Text>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <Text
                              style={{ color: colors.text.primary }}
                              className="text-2xl font-bold"
                            >
                              {formatCurrency(analytics.serviceMetrics?.revenue ?? 0)}
                            </Text>
                            <View className="flex-row items-center mt-1 mb-4">
                              {serviceRevenueChange >= 0 ? (
                                <TrendingUp
                                  size={14}
                                  color={colors.success}
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <TrendingDown
                                  size={14}
                                  color={colors.danger}
                                  strokeWidth={2.5}
                                />
                              )}
                              <Text
                                style={{
                                  color: serviceRevenueChange >= 0 ? colors.success : colors.danger,
                                }}
                                className="text-sm font-medium ml-1"
                              >
                                {serviceRevenueChange >= 0 ? '+' : ''}
                                {serviceRevenueChange.toFixed(1)}% vs last period
                              </Text>
                            </View>
                            <SalesBarChart
                              data={serviceByPeriod}
                              height={160}
                              barColor={colors.bar}
                              gridColor={colors.barBg}
                              textColor={colors.text.tertiary}
                            />
                          </View>
                        </Pressable>
                      )}

                      {serviceChartData.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/services')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <DollarSign
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Revenue by Service
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <HorizontalBarChart
                              data={serviceChartData}
                              barColor={colors.bar}
                              backgroundColor={colors.barBg}
                              textColor={colors.text.primary}
                              secondaryTextColor={colors.text.tertiary}
                              formatValue={(v) => formatCurrency(v)}
                            />
                          </View>
                        </Pressable>
                      )}

                      {serviceBreakdown.length > 0 && (
                        <Pressable
                          className="px-5 pt-4 pb-6"
                          onPress={() => handleOpenInsight('/insights/services')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Package
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Top Services
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {serviceBreakdown.slice(0, 5).map((item, index) =>
                              item ? (
                                <View
                                  key={item.name}
                                  className="flex-row items-center justify-between py-3"
                                  style={{
                                    borderBottomWidth:
                                      index < Math.min(serviceBreakdown.length, 5) - 1 ? 1 : 0,
                                    borderBottomColor: colors.divider,
                                  }}
                                >
                                  <View>
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                    >
                                      {item.name}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {item.orders} orders · {item.quantity} services
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-bold"
                                  >
                                    {formatCurrency(item.revenue)}
                                  </Text>
                                </View>
                              ) : null
                            )}
                          </View>
                        </Pressable>
                      )}

                    </>
                  )}

                  {/* ===================== ORDERS TAB CONTENT ===================== */}
                  {activeTab === 'orders' && (
                    <>
                      {/* Orders Count Chart */}
                      <Pressable
                        className="px-5 pt-4"
                        onPress={() => handleOpenInsight('/insights/orders')}
                      >
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          <View className="flex-row items-center justify-between mb-2">
                            <Text
                              style={{ color: colors.text.primary }}
                              className="text-base font-bold"
                            >
                              Orders
                            </Text>
                            <ChevronRight
                              size={16}
                              color={colors.text.tertiary}
                              strokeWidth={2}
                            />
                          </View>
                          <Text
                            style={{ color: colors.text.primary }}
                            className="text-2xl font-bold"
                          >
                            {analytics.totalOrders} orders
                          </Text>
                          <View className="flex-row items-center mt-1 mb-4">
                            {analytics.kpiMetrics.orders.change >= 0 ? (
                              <TrendingUp
                                size={14}
                                color={colors.success}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <TrendingDown
                                size={14}
                                color={colors.danger}
                                strokeWidth={2.5}
                              />
                            )}
                            <Text
                              style={{
                                color:
                                  analytics.kpiMetrics.orders.change >= 0
                                    ? colors.success
                                    : colors.danger,
                              }}
                              className="text-sm font-medium ml-1"
                            >
                              {analytics.kpiMetrics.orders.change >= 0 ? '+' : ''}
                              {analytics.kpiMetrics.orders.change.toFixed(1)}% vs last
                              period
                            </Text>
                          </View>
                          <SalesBarChart
                            data={analytics.ordersByPeriod}
                            height={180}
                            barColor={colors.bar}
                            gridColor={colors.barBg}
                            textColor={colors.text.tertiary}
                          />
                        </View>
                      </Pressable>

                      {/* Fulfillment Status Breakdown */}
                      {analytics.statusBreakdown.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/orders')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Clock
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Fulfillment Status
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {analytics.statusBreakdown.map((status, index) => (
                              <View
                                key={status.status}
                                className="flex-row items-center justify-between py-3"
                                style={{
                                  borderBottomWidth:
                                    index < analytics.statusBreakdown.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center">
                                  <View
                                    className="w-3 h-3 rounded-full mr-3"
                                    style={{ backgroundColor: status.color }}
                                  />
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-medium"
                                  >
                                    {status.status}
                                  </Text>
                                </View>
                                <View className="flex-row items-center">
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-bold mr-2"
                                  >
                                    {status.count}
                                  </Text>
                                  <Text
                                    style={{ color: colors.text.tertiary }}
                                    className="text-xs"
                                  >
                                    {status.percentage}%
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      )}

                      {/* Logistics Performance */}
                      {analytics.logisticsBreakdown.length > 0 && (
                        <Pressable
                          className="px-5 pt-4 pb-6"
                          onPress={() => handleOpenInsight('/insights/logistics')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Truck
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Logistics Performance
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {analytics.logisticsBreakdown.map((carrier, index) => (
                              <View
                                key={carrier.label}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < analytics.logisticsBreakdown.length - 1
                                      ? 1
                                      : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-medium"
                                  >
                                    {carrier.label}
                                  </Text>
                                  <View className="flex-row items-center">
                                    <Text
                                      style={{ color: colors.text.secondary }}
                                      className="text-sm"
                                    >
                                      {carrier.ordersShipped} shipped
                                    </Text>
                                    <View
                                      className="ml-3 px-2 py-0.5 rounded"
                                      style={{ backgroundColor: colors.bg.input }}
                                    >
                                      <Text
                                        style={{
                                          color:
                                            carrier.onTimeRate >= 90
                                              ? colors.success
                                              : colors.text.tertiary,
                                        }}
                                        className="text-xs font-medium"
                                      >
                                        {carrier.onTimeRate}% delivered
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      )}
                    </>
                  )}

                  {/* ===================== CUSTOMERS TAB CONTENT ===================== */}
                  {activeTab === 'customers' && (
                    <>
                      {/* New vs Returning */}
                      <Pressable
                        className="px-5 pt-4"
                        onPress={() => handleOpenInsight('/insights/customers')}
                      >
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          <View className="flex-row items-center justify-between mb-4">
                            <Text
                              style={{ color: colors.text.primary }}
                              className="text-base font-bold"
                            >
                              New vs Returning
                            </Text>
                            <ChevronRight
                              size={16}
                              color={colors.text.tertiary}
                              strokeWidth={2}
                            />
                          </View>
                          <View className="flex-row items-center justify-around">
                            <View className="items-center">
                              <View
                                className="w-14 h-14 rounded-full items-center justify-center mb-2"
                                style={{ backgroundColor: colors.bg.input }}
                              >
                                <UserPlus
                                  size={24}
                                  color={colors.success}
                                  strokeWidth={2}
                                />
                              </View>
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-2xl font-bold"
                              >
                                {analytics.returningVsNew.new}
                              </Text>
                              <Text
                                style={{ color: colors.text.tertiary }}
                                className="text-xs"
                              >
                                New
                              </Text>
                            </View>
                            <View
                              className="h-16 w-px"
                              style={{ backgroundColor: colors.divider }}
                            />
                            <View className="items-center">
                              <View
                                className="w-14 h-14 rounded-full items-center justify-center mb-2"
                                style={{ backgroundColor: colors.bg.input }}
                              >
                                <UserCheck
                                  size={24}
                                  color={colors.bar}
                                  strokeWidth={2}
                                />
                              </View>
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-2xl font-bold"
                              >
                                {analytics.returningVsNew.returning}
                              </Text>
                              <Text
                                style={{ color: colors.text.tertiary }}
                                className="text-xs"
                              >
                                Returning ({analytics.returningVsNew.returningPercentage}%)
                              </Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>

                      {/* Top Customers by Spend */}
                      {analytics.topCustomers.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/customers')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Star
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Top Customers
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {analytics.topCustomers.map((customer, index) => (
                              <View
                                key={customer.email || customer.name}
                                className="flex-row items-center justify-between py-3"
                                style={{
                                  borderBottomWidth:
                                    index < analytics.topCustomers.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-1 mr-3">
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-medium"
                                    numberOfLines={1}
                                  >
                                    {customer.name}
                                  </Text>
                                  <Text
                                    style={{ color: colors.text.tertiary }}
                                    className="text-xs"
                                  >
                                    {customer.orderCount} orders
                                  </Text>
                                </View>
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-sm font-bold"
                                >
                                  {formatCurrency(customer.totalSpent)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      )}

                      {/* Customer Locations */}
                      {analytics.customersByLocation.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/locations')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <MapPin
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Customer Locations
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <HorizontalBarChart
                              data={analytics.customersByLocation}
                              barColor={colors.bar}
                              backgroundColor={colors.barBg}
                              textColor={colors.text.primary}
                              secondaryTextColor={colors.text.tertiary}
                              formatValue={(v) => `${v}`}
                            />
                          </View>
                        </Pressable>
                      )}

                      {/* Customer Platforms */}
                      {analytics.customersByPlatform.length > 0 && (
                        <Pressable
                          className="px-5 pt-4 pb-6"
                          onPress={() => handleOpenInsight('/insights/platforms')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Smartphone
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Customer Platforms
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            <HorizontalBarChart
                              data={analytics.customersByPlatform}
                              barColor={colors.bar}
                              backgroundColor={colors.barBg}
                              textColor={colors.text.primary}
                              secondaryTextColor={colors.text.tertiary}
                              formatValue={(v) => `${v}`}
                            />
                          </View>
                        </Pressable>
                      )}
                    </>
                  )}

                  {/* ===================== INVENTORY TAB CONTENT ===================== */}
                  {activeTab === 'inventory' && (
                    <>
                      {/* Restocks Chart */}
                      <View className="px-5 pt-4">
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center">
                              <RotateCcw
                                size={18}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-base font-bold ml-2"
                              >
                                Units Restocked
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{ color: colors.text.primary }}
                            className="text-2xl font-bold"
                          >
                            {inventoryAnalytics.restockInsights.totalUnitsRestocked.toLocaleString()} units
                          </Text>
                          <View className="flex-row items-center mt-1 mb-4">
                            {inventoryAnalytics.kpiMetrics.unitsRestocked.change >= 0 ? (
                              <TrendingUp
                                size={14}
                                color={colors.success}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <TrendingDown
                                size={14}
                                color={colors.danger}
                                strokeWidth={2.5}
                              />
                            )}
                            <Text
                              style={{
                                color:
                                  inventoryAnalytics.kpiMetrics.unitsRestocked.change >= 0
                                    ? colors.success
                                    : colors.danger,
                              }}
                              className="text-sm font-medium ml-1"
                            >
                              {inventoryAnalytics.kpiMetrics.unitsRestocked.change >= 0 ? '+' : ''}
                              {inventoryAnalytics.kpiMetrics.unitsRestocked.change.toFixed(1)}% vs last period
                            </Text>
                          </View>
                          <SalesBarChart
                            data={inventoryAnalytics.restocksOverTime}
                            height={180}
                            barColor={colors.bar}
                            gridColor={colors.barBg}
                            textColor={colors.text.tertiary}
                          />
                        </View>
                      </View>

                      {/* Low Stock Alert */}
                      {inventoryAnalytics.lowStockList.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/low-stock')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <AlertTriangle
                                  size={18}
                                  color="#F59E0B"
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Low Stock Items
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {inventoryAnalytics.lowStockList.slice(0, 5).map((item, index) => (
                              <Pressable
                                key={`${item.productId}-${item.variantName}`}
                                onPress={() => router.push(`/product/${item.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < Math.min(inventoryAnalytics.lowStockList.length, 5) - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                      numberOfLines={1}
                                    >
                                      {item.productName}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {item.variantName}
                                    </Text>
                                  </View>
                                  <View className="items-end">
                                    <Text
                                      style={{ color: '#F59E0B' }}
                                      className="text-sm font-bold"
                                    >
                                      {item.stock} left
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.muted }}
                                      className="text-xs"
                                    >
                                      min: {item.threshold}
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>
                            ))}
                            {inventoryAnalytics.lowStockList.length > 5 && (
                              <Text
                                style={{ color: colors.text.tertiary }}
                                className="text-xs text-center mt-3"
                              >
                                +{inventoryAnalytics.lowStockList.length - 5} more items
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      )}

                      {/* Out of Stock */}
                      {inventoryAnalytics.outOfStockList.length > 0 && (
                        <Pressable
                          className="px-5 pt-4"
                          onPress={() => handleOpenInsight('/insights/out-of-stock')}
                        >
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <PackageX
                                  size={18}
                                  color={colors.danger}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Out of Stock
                                </Text>
                              </View>
                              <ChevronRight
                                size={16}
                                color={colors.text.tertiary}
                                strokeWidth={2}
                              />
                            </View>
                            {inventoryAnalytics.outOfStockList.slice(0, 5).map((item, index) => (
                              <Pressable
                                key={`${item.productId}-${item.variantName}`}
                                onPress={() => router.push(`/product/${item.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < Math.min(inventoryAnalytics.outOfStockList.length, 5) - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                      numberOfLines={1}
                                    >
                                      {item.productName}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {item.variantName}
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ color: colors.danger }}
                                    className="text-sm font-bold"
                                  >
                                    0 units
                                  </Text>
                                </View>
                              </Pressable>
                            ))}
                            {inventoryAnalytics.outOfStockList.length > 5 && (
                              <Text
                                style={{ color: colors.text.tertiary }}
                                className="text-xs text-center mt-3"
                              >
                                +{inventoryAnalytics.outOfStockList.length - 5} more items
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      )}

                      {/* Best Selling Products */}
                      {inventoryAnalytics.bestSellingProducts.length > 0 && (
                        <View className="px-5 pt-4">
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <TrendingUp
                                  size={18}
                                  color={colors.success}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Best Sellers (by units)
                                </Text>
                              </View>
                              <Pressable onPress={() => handleOpenInsight('/insights/best-sellers')}>
                                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                                  View all
                                </Text>
                              </Pressable>
                            </View>
                            {inventoryAnalytics.bestSellingProducts.map((product, index) => (
                              <Pressable
                                key={product.productId}
                                onPress={() => router.push(`/product/${product.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < inventoryAnalytics.bestSellingProducts.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                      numberOfLines={1}
                                    >
                                      {product.productName}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {product.stockRemaining} in stock
                                      {product.stockCoverDays !== undefined && product.stockCoverDays > 0 && (
                                        <Text> • ~{product.stockCoverDays}d cover</Text>
                                      )}
                                    </Text>
                                  </View>
                                  <View className="items-end">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-bold"
                                    >
                                      {product.unitsSold} sold
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {formatCurrency(product.revenue)}
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Top Products by Revenue */}
                      {inventoryAnalytics.topProductsByRevenue.length > 0 && (
                        <View className="px-5 pt-4">
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <DollarSign
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Top Revenue Products
                                </Text>
                              </View>
                              <Pressable onPress={() => handleOpenInsight('/insights/top-revenue')}>
                                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                                  View all
                                </Text>
                              </Pressable>
                            </View>
                            {inventoryAnalytics.topProductsByRevenue.map((product, index) => (
                              <Pressable
                                key={product.productId}
                                onPress={() => router.push(`/product/${product.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < inventoryAnalytics.topProductsByRevenue.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                      numberOfLines={1}
                                    >
                                      {product.productName}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {product.unitsSold} units sold
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-bold"
                                  >
                                    {formatCurrency(product.revenue)}
                                  </Text>
                                </View>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Most Restocked Products */}
                      {inventoryAnalytics.restockInsights.mostRestockedProducts.length > 0 && (
                        <View className="px-5 pt-4">
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <Boxes
                                  size={18}
                                  color={colors.text.tertiary}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Most Restocked
                                </Text>
                              </View>
                              <Pressable onPress={() => handleOpenInsight('/insights/most-restocked')}>
                                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                                  View all
                                </Text>
                              </Pressable>
                            </View>
                            {inventoryAnalytics.restockInsights.mostRestockedProducts.map((product, index) => (
                              <Pressable
                                key={product.productId}
                                onPress={() => router.push(`/product/${product.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < inventoryAnalytics.restockInsights.mostRestockedProducts.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <Text
                                    style={{ color: colors.text.primary }}
                                    className="text-sm font-medium flex-1 mr-3"
                                    numberOfLines={1}
                                  >
                                    {product.productName}
                                  </Text>
                                  <Text
                                    style={{ color: colors.text.secondary }}
                                    className="text-sm"
                                  >
                                    {product.restockCount} restocks
                                  </Text>
                                </View>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Slow Movers / Worst Sellers */}
                      {inventoryAnalytics.slowMovers.length > 0 && (
                        <View className="px-5 pt-4 pb-6">
                          <View
                            className="rounded-2xl p-5"
                            style={colors.getCardStyle()}
                          >
                            <View className="flex-row items-center justify-between mb-4">
                              <View className="flex-row items-center">
                                <TrendingDown
                                  size={18}
                                  color={colors.warning}
                                  strokeWidth={2}
                                />
                                <Text
                                  style={{ color: colors.text.primary }}
                                  className="text-base font-bold ml-2"
                                >
                                  Slow Movers
                                </Text>
                              </View>
                              <Pressable onPress={() => handleOpenInsight('/insights/slow-movers')}>
                                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                                  View all
                                </Text>
                              </Pressable>
                            </View>
                            {inventoryAnalytics.slowMovers.map((product, index) => (
                              <Pressable
                                key={product.productId}
                                onPress={() => router.push(`/product/${product.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < inventoryAnalytics.slowMovers.length - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <Text
                                      style={{ color: colors.text.primary }}
                                      className="text-sm font-medium"
                                      numberOfLines={1}
                                    >
                                      {product.productName}
                                    </Text>
                                    <Text
                                      style={{ color: colors.text.tertiary }}
                                      className="text-xs"
                                    >
                                      {product.stockRemaining} in stock
                                    </Text>
                                  </View>
                                  <Text
                                    style={{
                                      color: product.unitsSold === 0 ? colors.danger : colors.warning,
                                    }}
                                    className="text-sm font-bold"
                                  >
                                    {product.unitsSold === 0 ? 'No sales' : `${product.unitsSold} sold`}
                                  </Text>
                                </View>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* New Designs Section */}
                      <View className="px-5 pt-4 pb-6">
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          {/* Header with Year Selector */}
                          <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center">
                              <Sparkles
                                size={18}
                                color="#3B82F6"
                                strokeWidth={2}
                              />
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-base font-bold ml-2"
                              >
                                New Designs
                              </Text>
                            </View>
                            {/* Year Selector */}
                            <View className="flex-row">
                              {[new Date().getFullYear() - 1, new Date().getFullYear()].map((year) => (
                                <Pressable
                                  key={year}
                                  onPress={() => setNewDesignYear(year)}
                                  className="px-3 py-1 rounded-lg ml-2"
                                  style={{
                                    backgroundColor: newDesignYear === year ? '#3B82F6' : colors.bg.cardAlt,
                                  }}
                                >
                                  <Text
                                    style={{ color: newDesignYear === year ? '#FFFFFF' : colors.text.tertiary }}
                                    className="text-xs font-medium"
                                  >
                                    {year}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>

                          {/* Stats Grid */}
                          <View className="flex-row mb-4" style={{ gap: 12 }}>
                            <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: colors.bg.cardAlt }}>
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                New Designs
                              </Text>
                              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                                {newDesignAnalytics.totalNewDesigns}
                              </Text>
                            </View>
                            <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: colors.bg.cardAlt }}>
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                Restocked
                              </Text>
                              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                                {newDesignAnalytics.newDesignsRestocked}
                              </Text>
                            </View>
                          </View>

                          <View className="flex-row mb-4" style={{ gap: 12 }}>
                            <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: colors.bg.cardAlt }}>
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                Total Restocks
                              </Text>
                              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                                {newDesignAnalytics.totalRestocksForNewDesigns}
                              </Text>
                            </View>
                            <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: colors.bg.cardAlt }}>
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                Units Restocked
                              </Text>
                              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                                {newDesignAnalytics.totalUnitsRestockedForNewDesigns}
                              </Text>
                            </View>
                          </View>

                          {/* Top Restocked New Designs */}
                          {newDesignAnalytics.topRestockedNewDesigns.length > 0 && (
                            <>
                              <View className="flex-row items-center justify-between mt-2 mb-3">
                                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">
                                  Top Restocked
                                </Text>
                                <Pressable onPress={() => router.push(`/insights/new-designs?year=${newDesignYear}`)}>
                                  <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                    View all
                                  </Text>
                                </Pressable>
                              </View>
                              {newDesignAnalytics.topRestockedNewDesigns.slice(0, 5).map((product, index) => (
                                <Pressable
                                  key={product.productId}
                                  onPress={() => router.push(`/product/${product.productId}`)}
                                  className="py-3"
                                  style={{
                                    borderBottomWidth:
                                      index < Math.min(newDesignAnalytics.topRestockedNewDesigns.length, 5) - 1 ? 1 : 0,
                                    borderBottomColor: colors.divider,
                                  }}
                                >
                                  <View className="flex-row items-center justify-between">
                                    <View className="flex-1 mr-3">
                                      <Text
                                        style={{ color: colors.text.primary }}
                                        className="text-sm font-medium"
                                        numberOfLines={1}
                                      >
                                        {product.productName}
                                      </Text>
                                      <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                        {product.stockRemaining} in stock · {product.unitsSold} sold
                                      </Text>
                                    </View>
                                    <Text style={{ color: '#3B82F6' }} className="text-sm font-bold">
                                      {product.restockCount} restocks
                                    </Text>
                                  </View>
                                </Pressable>
                              ))}
                            </>
                          )}

                          {newDesignAnalytics.totalNewDesigns === 0 && (
                            <View className="py-4">
                              <Text style={{ color: colors.text.tertiary }} className="text-sm text-center">
                                No new designs marked for {newDesignYear}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Discontinue Candidates Section */}
                      <View className="px-5 pt-4 pb-6">
                        <View
                          className="rounded-2xl p-5"
                          style={colors.getCardStyle()}
                        >
                          {/* Header with Period Selector */}
                          <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center">
                              <XCircle
                                size={18}
                                color={colors.danger}
                                strokeWidth={2}
                              />
                              <Text
                                style={{ color: colors.text.primary }}
                                className="text-base font-bold ml-2"
                              >
                                Discontinue Candidates
                              </Text>
                            </View>
                            <Pressable onPress={() => router.push(`/insights/discontinue-candidates?period=${discontinuePeriod}&threshold=${discontinueStockThreshold}`)}>
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                View all
                              </Text>
                            </Pressable>
                          </View>

                          {/* Filters */}
                          <View className="mb-4">
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mb-2">
                              No sales in:
                            </Text>
                            <View className="flex-row">
                              {([
                                { key: '30d', label: '30 days' },
                                { key: '90d', label: '90 days' },
                                { key: 'year', label: 'This Year' },
                              ] as { key: DiscontinuePeriod; label: string }[]).map((option) => (
                                <Pressable
                                  key={option.key}
                                  onPress={() => setDiscontinuePeriod(option.key)}
                                  className="mr-2 px-3 py-1 rounded-lg"
                                  style={{
                                    backgroundColor: discontinuePeriod === option.key ? colors.danger : colors.bg.cardAlt,
                                  }}
                                >
                                  <Text
                                    style={{ color: discontinuePeriod === option.key ? '#FFFFFF' : colors.text.tertiary }}
                                    className="text-xs font-medium"
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>

                          {/* Stock Threshold */}
                          <View className="flex-row items-center mb-4">
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mr-2">
                              Min stock:
                            </Text>
                            {[5, 10, 20].map((threshold) => (
                              <Pressable
                                key={threshold}
                                onPress={() => setDiscontinueStockThreshold(threshold)}
                                className="mr-2 px-2 py-1 rounded"
                                style={{
                                  backgroundColor: discontinueStockThreshold === threshold ? colors.bg.cardAlt : 'transparent',
                                  borderWidth: 1,
                                  borderColor: discontinueStockThreshold === threshold ? colors.text.tertiary : colors.divider,
                                }}
                              >
                                <Text
                                  style={{ color: discontinueStockThreshold === threshold ? colors.text.primary : colors.text.tertiary }}
                                  className="text-xs"
                                >
                                  {threshold}+
                                </Text>
                              </Pressable>
                            ))}
                          </View>

                          {/* Summary */}
                          <View className="p-3 rounded-xl mb-4" style={{ backgroundColor: colors.bg.cardAlt }}>
                            <Text style={{ color: colors.text.tertiary }} className="text-xs">
                              Products with {discontinueStockThreshold}+ units and no sales
                            </Text>
                            <Text style={{ color: colors.danger }} className="text-2xl font-bold">
                              {discontinueCandidates.totalCandidates}
                            </Text>
                          </View>

                          {/* Candidates List */}
                          {discontinueCandidates.candidates.length > 0 ? (
                            discontinueCandidates.candidates.slice(0, 5).map((product, index) => (
                              <Pressable
                                key={product.productId}
                                onPress={() => router.push(`/product/${product.productId}`)}
                                className="py-3"
                                style={{
                                  borderBottomWidth:
                                    index < Math.min(discontinueCandidates.candidates.length, 5) - 1 ? 1 : 0,
                                  borderBottomColor: colors.divider,
                                }}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1 mr-3">
                                    <View className="flex-row items-center">
                                      <Text
                                        style={{ color: colors.text.primary }}
                                        className="text-sm font-medium"
                                        numberOfLines={1}
                                      >
                                        {product.productName}
                                      </Text>
                                      {product.isDiscontinued && (
                                        <View className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.danger + '30' }}>
                                          <Text style={{ color: colors.danger }} className="text-[10px] font-bold">
                                            DISCONTINUED
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                                      {product.currentStock} units · {product.restockCountThisYear} restocks this year
                                      {product.lastSoldDate && (
                                        <Text>
                                          {' '}· Last sold {new Date(product.lastSoldDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </Text>
                                      )}
                                    </Text>
                                  </View>
                                  <Text style={{ color: colors.danger }} className="text-sm font-bold">
                                    0 sold
                                  </Text>
                                </View>
                              </Pressable>
                            ))
                          ) : (
                            <View className="py-4">
                              <Text style={{ color: colors.text.tertiary }} className="text-sm text-center">
                                No discontinue candidates found
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </>
                  )}

                  {/* Bottom spacing */}
                  <View className="h-6" />
                </>
              </ScrollView>
            )}
          </View>
        )}

        <FyllAiAssistantDrawer
          visible={showInsightsAiPanel}
          onClose={() => setShowInsightsAiPanel(false)}
          title="Fyll AI Insights"
          subtitle="Discuss growth, operations, and customer performance"
          openingMessage={insightsAiOpeningMessage}
          contextBadges={insightsAiContextBadges}
          quickPrompts={insightsAiQuickPrompts}
          recommendations={insightsAiRecommendations}
          placeholder="Ask about growth, refunds, or retention..."
          colors={colors}
          onAsk={handleAskInsightsAi}
        />
      </SafeAreaView>
      </View>
    </View>
  );
}
