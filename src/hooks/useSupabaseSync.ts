import { workspaceGeneration, isWorkspaceTransitioning } from '@/lib/workspace-transition';
import { useBusinessSwitcherStore } from '@/lib/state/business-switcher-store';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { DEFAULT_EXPENSE_CATEGORY_NAMES } from '@/lib/state/fyll-store';
import { supabase } from '@/lib/supabase';
import { supabaseData } from '@/lib/supabase/data';
import { supabaseSettings } from '@/lib/supabase/settings';
import { normalizeProductType } from '@/lib/product-utils';
import type {
  Product,
  Order,
  Customer,
  DeletedItem,
  RestockLog,
  Procurement,
  Expense,
  OtherIncome,
  ExpenseRequest,
  RefundRequest,
  Case,
  ReturnRequest,
  AuditLog,
  Partner,
  PartnerJob,
  PartnerJobIssue,
  OrderStatus,
  SaleSource,
  CustomService,
  PaymentMethod,
  LogisticsCarrier,
  ProductVariable,
  ProductOption,
  ExpenseCategory,
  CaseStatusOption,
  OrderAutomationRule,
  FinanceSupplier,
  ProcurementStatusOption,
  FixedCostSetting,
  SalaryTemplate,
  FinanceRules,
  WarehouseItem,
  WarehouseCategoryOption,
  WarehouseUnitOption,
  OrderTimelineSettings,
} from '@/lib/state/fyll-store';
import {
  DEFAULT_ORDER_QC_REQUIREMENTS,
  sanitizeOrderQcRequirements,
  type OrderQcRequirement,
} from '@/lib/order-qc';

const TABLES = {
  products: 'products',
  orders: 'orders',
  customers: 'customers',
  restockLogs: 'restock_logs',
  procurements: 'procurements',
  expenses: 'expenses',
  otherIncomes: 'other_incomes',
  expenseRequests: 'expense_requests',
  refundRequests: 'refund_requests',
  cases: 'cases',
  returns: 'returns',
  auditLogs: 'audit_logs',
  partners: 'partners',
  partnerJobs: 'partner_jobs',
  partnerJobIssues: 'partner_job_issues',
  deletedItems: 'deleted_items',
};

const SYNC_FINANCE_TABLES = true;
const ACTIVE_DATA_TABLES = Object.values(TABLES).filter((table) => {
  if (!SYNC_FINANCE_TABLES && (
    table === TABLES.procurements
    || table === TABLES.expenses
    || table === TABLES.otherIncomes
    || table === TABLES.expenseRequests
    || table === TABLES.refundRequests
  )) {
    return false;
  }
  return true;
});

const WAVE1_ORDERS_LIMIT = 50;
const WAVE1_PRODUCTS_LIMIT = 50;
const WAVE1_CUSTOMERS_LIMIT = 50;
const WAVE1_CASES_LIMIT = 15;
const STARTUP_UNBLOCK_TIMEOUT_MS = 3000;
const STARTUP_QUERY_TIMEOUT_MS = 2500;
const STARTUP_PRODUCTS_QUERY_TIMEOUT_MS = 8000;
const FULL_SYNC_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

const DATA_TABLE_TO_STORE_KEY = {
  [TABLES.products]: 'products',
  [TABLES.orders]: 'orders',
  [TABLES.customers]: 'customers',
  [TABLES.restockLogs]: 'restockLogs',
  [TABLES.procurements]: 'procurements',
  [TABLES.expenses]: 'expenses',
  [TABLES.otherIncomes]: 'otherIncomes',
  [TABLES.expenseRequests]: 'expenseRequests',
  [TABLES.refundRequests]: 'refundRequests',
  [TABLES.cases]: 'cases',
  [TABLES.returns]: 'returns',
  [TABLES.auditLogs]: 'auditLogs',
  [TABLES.partners]: 'partners',
  [TABLES.partnerJobs]: 'partnerJobs',
  [TABLES.partnerJobIssues]: 'partnerJobIssues',
  [TABLES.deletedItems]: 'recycleBin',
} as const;

const IS_WEB = Platform.OS === 'web';

type DataStoreKey = (typeof DATA_TABLE_TO_STORE_KEY)[keyof typeof DATA_TABLE_TO_STORE_KEY];

type GlobalSettingsPayload = {
  categories: string[];
  productVariables: ProductVariable[];
  productOptions: ProductOption[];
  orderStatuses: OrderStatus[];
  qcChecklistRequirements: OrderQcRequirement[];
  saleSources: SaleSource[];
  customServices: CustomService[];
  orderTimelineSettings: OrderTimelineSettings;
  paymentMethods: PaymentMethod[];
  logisticsCarriers: LogisticsCarrier[];
  expenseCategories: ExpenseCategory[];
  caseStatuses: CaseStatusOption[];
  useGlobalLowStockThreshold: boolean;
  globalLowStockThreshold: number;
  autoCompleteOrders: boolean;
  autoCompleteAfterDays: number;
  autoCompleteFromStatus: string;
  autoCompleteToStatus: string;
  orderAutomations: OrderAutomationRule[];
  deliveryFollowUpEnabled: boolean;
  deliveryFollowUpDelayDays: number;
  deliveryFollowUpResendDays: number;
  deliveryFollowUpFromName: string;
  orderStatusEmailEnabled: boolean;
  financeSuppliers: FinanceSupplier[];
  procurementStatusOptions: ProcurementStatusOption[];
  fixedCosts: FixedCostSetting[];
  salaryTemplates: SalaryTemplate[];
  warehouseItems: WarehouseItem[];
  warehouseCategories: WarehouseCategoryOption[];
  warehouseUnits: WarehouseUnitOption[];
  financeRules: FinanceRules;
};

type BusinessSettingsData = {
  id: string;
  useGlobalLowStockThreshold?: boolean;
  globalLowStockThreshold?: number;
  autoCompleteOrders?: boolean;
  autoCompleteAfterDays?: number;
  autoCompleteFromStatus?: string;
  autoCompleteToStatus?: string;
  orderAutomations?: OrderAutomationRule[];
  deliveryFollowUpEnabled?: boolean;
  deliveryFollowUpDelayDays?: number;
  deliveryFollowUpResendDays?: number;
  deliveryFollowUpFromName?: string;
  orderStatusEmailEnabled?: boolean;
  orderTimelineSettings?: OrderTimelineSettings;
  qcChecklistRequirements?: OrderQcRequirement[];
  financeSuppliers?: FinanceSupplier[];
  procurementStatusOptions?: ProcurementStatusOption[];
  fixedCosts?: FixedCostSetting[];
  salaryTemplates?: SalaryTemplate[];
  warehouseItems?: WarehouseItem[];
  warehouseCategories?: WarehouseCategoryOption[];
  warehouseUnits?: WarehouseUnitOption[];
  financeRules?: FinanceRules;
};

const getGlobalBusinessSettingsData = (
  rows: Array<{ id: string; data: BusinessSettingsData; updated_at?: string | null; created_at?: string | null }>
) => {
  const getRowScore = (row: { data: BusinessSettingsData }) => {
    const settings = row.data?.orderTimelineSettings;
    const orderTypes = settings?.orderTypes ?? [];
    const shippingZones = settings?.shippingZones ?? [];
    const workflowSteps = orderTypes.reduce((total, item) => (
      total + (Array.isArray(item.workflowStatusIds) ? item.workflowStatusIds.length : 0)
    ), 0);
    return (orderTypes.length * 100) + (shippingZones.length * 10) + workflowSteps;
  };
  const getRowTime = (row: { updated_at?: string | null; created_at?: string | null }) => (
    new Date(row.updated_at ?? row.created_at ?? 0).getTime() || 0
  );
  const candidates = rows.filter((row) => row.id === 'global' || row.data?.id === 'global');
  const usableRows = candidates.length > 0 ? candidates : rows;
  const bestRow = usableRows.reduce<typeof usableRows[number] | null>((best, row) => {
    if (!best) return row;
    const scoreDelta = getRowScore(row) - getRowScore(best);
    if (scoreDelta > 0) return row;
    if (scoreDelta === 0) {
      const timeDelta = getRowTime(row) - getRowTime(best);
      if (timeDelta > 0) return row;
    }
    return best;
  }, null);
  return bestRow?.data;
};

const DEFAULT_PROCUREMENT_STATUS_OPTIONS: ProcurementStatusOption[] = [
  { id: 'proc-status-draft', name: 'Draft', order: 1 },
  { id: 'proc-status-sent', name: 'Sent', order: 2 },
  { id: 'proc-status-confirmed', name: 'Confirmed', order: 3 },
  { id: 'proc-status-received', name: 'Received', order: 4 },
  { id: 'proc-status-cancelled', name: 'Cancelled', order: 5 },
];

const toIdSet = (items: { id: string }[]) => new Set(items.map((item) => item.id));
const mapData = <T>(rows: { data: T }[]) => rows.map((row) => row.data);
const sortById = <T extends { id: string }>(items: T[]) => (
  [...items].sort((a, b) => a.id.localeCompare(b.id))
);
const sortByKey = <T extends { key: string }>(items: T[]) => (
  [...items].sort((a, b) => a.key.localeCompare(b.key))
);

const SETTINGS_TABLES = {
  orderStatuses: 'order_statuses',
  saleSources: 'sale_sources',
  customServices: 'custom_services',
  paymentMethods: 'payment_methods',
  logisticsCarriers: 'logistics_carriers',
  productCategories: 'product_categories',
  productVariables: 'product_variables',
  productOptions: 'product_options',
  expenseCategories: 'expense_categories',
  caseStatuses: 'case_statuses',
  businessSettings: 'business_settings',
} as const;

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

const buildCategoryItems = (categories: string[]) => {
  const items = new Map<string, { id: string; name: string }>();
  categories.forEach((category, index) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    const id = slug || `category-${index + 1}`;
    if (!items.has(id)) {
      items.set(id, { id, name: trimmed });
    }
  });
  return Array.from(items.values());
};

const uniqueNonEmpty = (values: (string | undefined | null)[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = value?.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

const inferOrderStatuses = (orders: Order[]): OrderStatus[] => {
  const names = uniqueNonEmpty(orders.map((order) => order.status));
  return names.map((name, index) => ({
    id: `order-status-${slugify(name) || index + 1}`,
    name,
    color: '#6B7280',
    order: index + 1,
  }));
};

const inferSaleSources = (orders: Order[]): SaleSource[] => {
  const names = uniqueNonEmpty(orders.map((order) => order.source));
  return names.map((name, index) => ({
    id: `sale-source-${slugify(name) || index + 1}`,
    name,
    icon: 'circle',
  }));
};

const inferPaymentMethods = (orders: Order[]): PaymentMethod[] => {
  const names = uniqueNonEmpty(orders.map((order) => order.paymentMethod));
  return names.map((name, index) => ({
    id: `payment-method-${slugify(name) || index + 1}`,
    name,
  }));
};

const inferLogisticsCarriers = (orders: Order[]): LogisticsCarrier[] => {
  const names = uniqueNonEmpty(orders.map((order) => order.logistics?.carrierName));
  return names.map((name, index) => ({
    id: `logistics-carrier-${slugify(name) || index + 1}`,
    name,
  }));
};

const inferCustomServices = (orders: Order[]): CustomService[] => {
  const serviceMap = new Map<string, number>();

  orders.forEach((order) => {
    (order.services ?? []).forEach((service) => {
      const normalizedName = service.name?.trim();
      if (!normalizedName || serviceMap.has(normalizedName.toLowerCase())) return;
      serviceMap.set(normalizedName.toLowerCase(), Number.isFinite(service.price) ? service.price : 0);
    });
  });

  return Array.from(serviceMap.entries()).map(([normalizedName, defaultPrice], index) => ({
    id: `custom-service-${slugify(normalizedName) || index + 1}`,
    name: normalizedName.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    defaultPrice,
  }));
};

const buildExpenseCategoryItems = (names: string[]): ExpenseCategory[] => uniqueNonEmpty(names).map((name, index) => ({
  id: `expense-category-${slugify(name) || index + 1}`,
  name,
}));

const inferExpenseCategories = (expenses: Expense[], fixedCosts: FixedCostSetting[]): ExpenseCategory[] => {
  return buildExpenseCategoryItems([
    ...expenses.map((expense) => expense.category),
    ...fixedCosts.map((cost) => cost.category),
  ]);
};

const inferCategories = (products: Product[]): string[] => uniqueNonEmpty(
  products.flatMap((product) => product.categories ?? [])
);

const inferProductVariables = (products: Product[]): ProductVariable[] => {
  const variableMap = new Map<string, Set<string>>();

  products.forEach((product) => {
    product.variants?.forEach((variant) => {
      Object.entries(variant.variableValues ?? {}).forEach(([variableName, variableValue]) => {
        const normalizedName = variableName?.trim();
        const normalizedValue = variableValue?.trim();
        if (!normalizedName || !normalizedValue) return;
        if (!variableMap.has(normalizedName)) {
          variableMap.set(normalizedName, new Set<string>());
        }
        variableMap.get(normalizedName)?.add(normalizedValue);
      });
    });
  });

  return Array.from(variableMap.entries()).map(([name, values], index) => ({
    id: `product-variable-${slugify(name) || index + 1}`,
    name,
    values: Array.from(values),
  }));
};

const inferProductOptions = (products: Product[]): ProductOption[] => {
  const optionMap = new Map<string, { values: Set<string>; required?: boolean }>();

  products.forEach((product) => {
    (product.orderOptions ?? []).forEach((option) => {
      const normalizedName = option.name?.trim();
      if (!normalizedName) return;
      const key = normalizedName.toLowerCase();
      if (!optionMap.has(key)) {
        optionMap.set(key, { values: new Set<string>(), required: option.required });
      }
      const current = optionMap.get(key);
      (option.values ?? []).forEach((value) => {
        const normalizedValue = value?.trim();
        if (normalizedValue) current?.values.add(normalizedValue);
      });
      if (option.required) {
        current!.required = true;
      }
    });
  });

  return Array.from(optionMap.entries()).map(([name, option], index) => ({
    id: `product-option-${slugify(name) || index + 1}`,
    name: name.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    values: Array.from(option.values),
    required: option.required,
  })).filter((option) => option.values.length > 0);
};

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutRef) clearTimeout(timeoutRef);
  }
};

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
  if (incoming.length === 0) return existing;
  const merged = new Map<string, T>();
  existing.forEach((item) => merged.set(item.id, item));
  incoming.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
};

const preferExistingOnEmpty = <T extends { id: string }>(
  incoming: T[],
  existing: T[],
  label: string
) => {
  if (incoming.length === 0 && existing.length > 0) {
    console.warn(`🛡️ Ignored empty ${label} payload to preserve local data`);
    return existing;
  }
  return incoming;
};

const resolveOrderAgeTimestampMs = (order: Order): number | null => {
  const candidates = [order.updatedAt, order.orderDate, order.createdAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = new Date(candidate).getTime();
    if (Number.isFinite(value)) return value;
  }
  return null;
};

type OrderAutomationConfig = Pick<
  GlobalSettingsPayload,
  | 'autoCompleteOrders'
  | 'autoCompleteAfterDays'
  | 'autoCompleteFromStatus'
  | 'autoCompleteToStatus'
  | 'orderAutomations'
>;

const normalizeAfterDays = (value: number | undefined) => {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value as number) : 10;
};

const normalizeOrderAutomations = (
  rules: (Partial<OrderAutomationRule> | null | undefined)[],
  fallback?: Pick<OrderAutomationConfig, 'autoCompleteAfterDays' | 'autoCompleteFromStatus' | 'autoCompleteToStatus'>
): OrderAutomationRule[] => {
  const seen = new Set<string>();
  const normalizedRules: OrderAutomationRule[] = [];

  rules.forEach((rule, index) => {
    if (!rule) return;
    const id = String(rule.id ?? `automation-${index + 1}`).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalizedRules.push({
      id,
      enabled: rule.enabled ?? true,
      fromStatus: (rule.fromStatus ?? '').trim(),
      toStatus: (rule.toStatus ?? '').trim(),
      afterDays: normalizeAfterDays(rule.afterDays),
    });
  });

  if (normalizedRules.length > 0) return normalizedRules;

  const fallbackFromStatus = fallback?.autoCompleteFromStatus?.trim() ?? '';
  const fallbackToStatus = fallback?.autoCompleteToStatus?.trim() ?? '';
  if (!fallbackFromStatus && !fallbackToStatus) {
    return [];
  }

  return [{
    id: 'automation-legacy',
    enabled: true,
    fromStatus: fallbackFromStatus,
    toStatus: fallbackToStatus,
    afterDays: normalizeAfterDays(fallback?.autoCompleteAfterDays),
  }];
};

const resolveLegacyAutomationFields = (rules: OrderAutomationRule[]) => {
  const firstRule = rules[0];
  return {
    autoCompleteAfterDays: firstRule?.afterDays ?? 10,
    autoCompleteFromStatus: firstRule?.fromStatus ?? '',
    autoCompleteToStatus: firstRule?.toStatus ?? '',
  };
};

const autoCompleteEligibleOrders = (
  orders: Order[],
  config: OrderAutomationConfig
): { orders: Order[]; changedOrders: Order[] } => {
  if (!config.autoCompleteOrders) {
    return { orders, changedOrders: [] };
  }

  const normalizedRules = normalizeOrderAutomations(config.orderAutomations ?? [], {
    autoCompleteAfterDays: config.autoCompleteAfterDays,
    autoCompleteFromStatus: config.autoCompleteFromStatus,
    autoCompleteToStatus: config.autoCompleteToStatus,
  })
    .filter((rule) => rule.enabled)
    .map((rule) => ({
      ...rule,
      fromStatusLower: rule.fromStatus.trim().toLowerCase(),
      toStatusTrimmed: rule.toStatus.trim(),
    }))
    .filter((rule) => rule.fromStatusLower && rule.toStatusTrimmed);

  if (normalizedRules.length === 0) {
    return { orders, changedOrders: [] };
  }

  const nowMs = Date.now();
  const changedOrders: Order[] = [];

  const nextOrders = orders.map((order) => {
    const status = order.status?.trim().toLowerCase();
    if (!status) return order;
    const ageMs = resolveOrderAgeTimestampMs(order);
    if (ageMs === null) return order;

    const matchedRule = normalizedRules.find((rule) => {
      if (status !== rule.fromStatusLower) return false;
      const cutoffMs = nowMs - rule.afterDays * 24 * 60 * 60 * 1000;
      return ageMs < cutoffMs;
    });
    if (!matchedRule) return order;
    if (order.status === matchedRule.toStatusTrimmed) return order;

    const nowIso = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      status: matchedRule.toStatusTrimmed,
      updatedAt: nowIso,
      activityLog: [
        ...(order.activityLog || []),
        {
          staffName: 'System',
          action: `Auto-moved ${matchedRule.fromStatus} to ${matchedRule.toStatusTrimmed} after ${matchedRule.afterDays} days`,
          date: nowIso,
        },
      ],
    };
    changedOrders.push(updatedOrder);
    return updatedOrder;
  });

  return { orders: nextOrders, changedOrders };
};

const resolveSettled = <T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string
): T => {
  if (result.status === 'fulfilled') return result.value;
  console.warn(`Wave 2 ${label} failed:`, result.reason);
  return fallback;
};

export function useSupabaseSync() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const applyingRemote = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncingRef = useRef(false);
  const lastRealtimeAt = useRef(0);
  const lastAutomationSweepAt = useRef(0);
  const pendingRealtimeTablesRef = useRef<Set<string>>(new Set());
  const pendingFullSyncRef = useRef(false);
  const drainRunningRef = useRef(false);

  const isSwitchingBusiness = useBusinessSwitcherStore((s) => s.isSwitching);
  const activeBusinessId = useAuthStore((s) => s.businessId);
  const businessId = isSwitchingBusiness ? null : activeBusinessId;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const customers = useFyllStore((s) => s.customers);
  const restockLogs = useFyllStore((s) => s.restockLogs);
  const procurements = useFyllStore((s) => s.procurements);
  const expenses = useFyllStore((s) => s.expenses);
  const otherIncomes = useFyllStore((s) => s.otherIncomes);
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const refundRequests = useFyllStore((s) => s.refundRequests);
  const cases = useFyllStore((s) => s.cases);
  const returns = useFyllStore((s) => s.returns);
  const auditLogs = useFyllStore((s) => s.auditLogs);
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const partnerJobIssues = useFyllStore((s) => s.partnerJobIssues);
  const recycleBin = useFyllStore((s) => s.recycleBin);
  const categories = useFyllStore((s) => s.categories);
  const productVariables = useFyllStore((s) => s.productVariables);
  const productOptions = useFyllStore((s) => s.productOptions);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const qcChecklistRequirements = useFyllStore((s) => s.qcChecklistRequirements);
  const saleSources = useFyllStore((s) => s.saleSources);
  const customServices = useFyllStore((s) => s.customServices);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const logisticsCarriers = useFyllStore((s) => s.logisticsCarriers);
  const expenseCategories = useFyllStore((s) => s.expenseCategories);
  const financeSuppliers = useFyllStore((s) => s.financeSuppliers);
  const procurementStatusOptions = useFyllStore((s) => s.procurementStatusOptions);
  const fixedCosts = useFyllStore((s) => s.fixedCosts);
  const salaryTemplates = useFyllStore((s) => s.salaryTemplates);
  const warehouseItems = useFyllStore((s) => s.warehouseItems);
  const warehouseCategories = useFyllStore((s) => s.warehouseCategories);
  const warehouseUnits = useFyllStore((s) => s.warehouseUnits);
  const financeRules = useFyllStore((s) => s.financeRules);
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);
  const autoCompleteOrders = useFyllStore((s) => s.autoCompleteOrders);
  const autoCompleteAfterDays = useFyllStore((s) => s.autoCompleteAfterDays);
  const autoCompleteFromStatus = useFyllStore((s) => s.autoCompleteFromStatus);
  const autoCompleteToStatus = useFyllStore((s) => s.autoCompleteToStatus);
  const orderAutomations = useFyllStore((s) => s.orderAutomations);
  const deliveryFollowUpEnabled = useFyllStore((s) => s.deliveryFollowUpEnabled);
  const deliveryFollowUpDelayDays = useFyllStore((s) => s.deliveryFollowUpDelayDays);
  const deliveryFollowUpResendDays = useFyllStore((s) => s.deliveryFollowUpResendDays);
  const deliveryFollowUpFromName = useFyllStore((s) => s.deliveryFollowUpFromName);
  const orderStatusEmailEnabled = useFyllStore((s) => s.orderStatusEmailEnabled);
  const isBackgroundSyncing = useFyllStore((s) => s.isBackgroundSyncing);

  const prevProductIds = useRef<Set<string>>(new Set());
  const prevOrderIds = useRef<Set<string>>(new Set());
  const prevCustomerIds = useRef<Set<string>>(new Set());
  const prevRestockIds = useRef<Set<string>>(new Set());
  const prevProcurementIds = useRef<Set<string>>(new Set());
  const prevExpenseIds = useRef<Set<string>>(new Set());
  const prevOtherIncomeIds = useRef<Set<string>>(new Set());
  const prevExpenseRequestIds = useRef<Set<string>>(new Set());
  const prevRefundRequestIds = useRef<Set<string>>(new Set());
  const prevCaseIds = useRef<Set<string>>(new Set());
  const prevReturnIds = useRef<Set<string>>(new Set());
  const prevAuditLogIds = useRef<Set<string>>(new Set());
  const prevPartnerIds = useRef<Set<string>>(new Set());
  const prevPartnerJobIds = useRef<Set<string>>(new Set());
  const prevPartnerJobIssueIds = useRef<Set<string>>(new Set());
  const prevRecycleBinIds = useRef<Set<string>>(new Set());
  const prevOrderStatusIds = useRef<Set<string>>(new Set());
  const prevSaleSourceIds = useRef<Set<string>>(new Set());
  const prevCustomServiceIds = useRef<Set<string>>(new Set());
  const prevPaymentMethodIds = useRef<Set<string>>(new Set());
  const prevLogisticsCarrierIds = useRef<Set<string>>(new Set());
  const prevProductVariableIds = useRef<Set<string>>(new Set());
  const prevProductOptionIds = useRef<Set<string>>(new Set());
  const prevExpenseCategoryIds = useRef<Set<string>>(new Set());
  const prevCategoryIds = useRef<Set<string>>(new Set());
  const prevCaseStatusIds = useRef<Set<string>>(new Set());
  const lastSettingsSyncSignatureRef = useRef<string>('');
  const pendingSettingsSyncSignatureRef = useRef<string | null>(null);
  const hasHydratedBusinessSettingsRef = useRef(false);
  const hasLoadedRemoteBusinessSettingsRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !businessId || isOfflineMode) {
      setIsInitialized(false);
      hasHydratedBusinessSettingsRef.current = false;
      hasLoadedRemoteBusinessSettingsRef.current = false;
      return;
    }

    let cancelled = false;
    const syncGeneration = workspaceGeneration();
    const isCurrentWorkspace = () => !cancelled && !isWorkspaceTransitioning()
      && workspaceGeneration() === syncGeneration
      && useAuthStore.getState().businessId === businessId;

    setIsInitialized(false);
    hasHydratedBusinessSettingsRef.current = false;
    hasLoadedRemoteBusinessSettingsRef.current = false;

    const seedPrevIdsFromStore = () => {
      const seeded = useFyllStore.getState();
      prevProductIds.current = toIdSet(seeded.products);
      prevOrderIds.current = toIdSet(seeded.orders);
      prevCustomerIds.current = toIdSet(seeded.customers);
      prevRestockIds.current = toIdSet(seeded.restockLogs);
      prevProcurementIds.current = toIdSet(seeded.procurements);
      prevExpenseIds.current = toIdSet(seeded.expenses);
      prevOtherIncomeIds.current = toIdSet(seeded.otherIncomes);
      prevExpenseRequestIds.current = toIdSet(seeded.expenseRequests);
      prevRefundRequestIds.current = toIdSet(seeded.refundRequests);
      prevCaseIds.current = toIdSet(seeded.cases);
      prevReturnIds.current = toIdSet(seeded.returns);
      prevAuditLogIds.current = toIdSet(seeded.auditLogs);
      prevPartnerIds.current = toIdSet(seeded.partners);
      prevPartnerJobIds.current = toIdSet(seeded.partnerJobs);
      prevPartnerJobIssueIds.current = toIdSet(seeded.partnerJobIssues);
      prevRecycleBinIds.current = toIdSet(seeded.recycleBin);
      prevOrderStatusIds.current = toIdSet(seeded.orderStatuses);
      prevSaleSourceIds.current = toIdSet(seeded.saleSources);
      prevCustomServiceIds.current = toIdSet(seeded.customServices);
      prevPaymentMethodIds.current = toIdSet(seeded.paymentMethods);
      prevLogisticsCarrierIds.current = toIdSet(seeded.logisticsCarriers);
      prevProductVariableIds.current = toIdSet(seeded.productVariables);
      prevProductOptionIds.current = toIdSet(seeded.productOptions);
      prevExpenseCategoryIds.current = toIdSet(seeded.expenseCategories);
      prevCategoryIds.current = toIdSet(buildCategoryItems(seeded.categories));
      prevCaseStatusIds.current = toIdSet(seeded.caseStatuses);
    };

    seedPrevIdsFromStore();

    const applyRemoteState = (next: {
      products: Product[];
      orders: Order[];
      customers: Customer[];
      restockLogs: RestockLog[];
      procurements: Procurement[];
      expenses: Expense[];
      otherIncomes: OtherIncome[];
      expenseRequests: ExpenseRequest[];
      refundRequests: RefundRequest[];
      cases: Case[];
      returns: ReturnRequest[];
      auditLogs: AuditLog[];
      partners: Partner[];
      partnerJobs: PartnerJob[];
      partnerJobIssues: PartnerJobIssue[];
      recycleBin: DeletedItem[];
      settings?: GlobalSettingsPayload | null;
    }) => {
      if (!isCurrentWorkspace()) return;
      const normalizedProducts: Product[] = next.products.map((product): Product => {
        if (normalizeProductType(product.productType) === 'service') {
          return product;
        }
        const looksLikeService = Boolean(
          product.serviceTags?.length ||
          product.serviceVariables?.length ||
          product.serviceFields?.length
        );
        return looksLikeService ? { ...product, productType: 'service' as const } : product;
      });
      applyingRemote.current = true;
      if (next.settings) {
        useFyllStore.setState({
          products: normalizedProducts,
          orders: next.orders,
          customers: next.customers,
          restockLogs: next.restockLogs,
          procurements: next.procurements,
          expenses: next.expenses,
          otherIncomes: next.otherIncomes,
          expenseRequests: next.expenseRequests,
          refundRequests: next.refundRequests,
          cases: next.cases,
          returns: next.returns,
          auditLogs: next.auditLogs,
          partners: next.partners,
          partnerJobs: next.partnerJobs,
          partnerJobIssues: next.partnerJobIssues,
          recycleBin: next.recycleBin,
          categories: next.settings.categories,
          productVariables: next.settings.productVariables,
          productOptions: next.settings.productOptions,
          orderStatuses: next.settings.orderStatuses,
          saleSources: next.settings.saleSources,
          customServices: next.settings.customServices,
          paymentMethods: next.settings.paymentMethods,
          logisticsCarriers: next.settings.logisticsCarriers,
          expenseCategories: next.settings.expenseCategories,
          financeSuppliers: next.settings.financeSuppliers,
          procurementStatusOptions: next.settings.procurementStatusOptions,
          fixedCosts: next.settings.fixedCosts,
          salaryTemplates: next.settings.salaryTemplates,
          warehouseItems: next.settings.warehouseItems,
          warehouseCategories: next.settings.warehouseCategories,
          warehouseUnits: next.settings.warehouseUnits,
          qcChecklistRequirements: sanitizeOrderQcRequirements(next.settings.qcChecklistRequirements, false),
          caseStatuses: next.settings.caseStatuses,
          financeRules: next.settings.financeRules,
          orderTimelineSettings: next.settings.orderTimelineSettings,
          useGlobalLowStockThreshold: next.settings.useGlobalLowStockThreshold,
          globalLowStockThreshold: next.settings.globalLowStockThreshold,
          autoCompleteOrders: next.settings.autoCompleteOrders,
          autoCompleteAfterDays: next.settings.autoCompleteAfterDays,
          autoCompleteFromStatus: next.settings.autoCompleteFromStatus,
          autoCompleteToStatus: next.settings.autoCompleteToStatus,
          orderAutomations: next.settings.orderAutomations,
          deliveryFollowUpEnabled: next.settings.deliveryFollowUpEnabled,
          deliveryFollowUpDelayDays: next.settings.deliveryFollowUpDelayDays,
          deliveryFollowUpResendDays: next.settings.deliveryFollowUpResendDays,
          deliveryFollowUpFromName: next.settings.deliveryFollowUpFromName,
          orderStatusEmailEnabled: next.settings.orderStatusEmailEnabled,
        });
      } else {
        useFyllStore.setState({
          products: normalizedProducts,
          orders: next.orders,
          customers: next.customers,
          restockLogs: next.restockLogs,
          procurements: next.procurements,
          expenses: next.expenses,
          otherIncomes: next.otherIncomes,
          expenseRequests: next.expenseRequests,
          refundRequests: next.refundRequests,
          cases: next.cases,
          returns: next.returns,
          auditLogs: next.auditLogs,
          partners: next.partners,
          partnerJobs: next.partnerJobs,
          partnerJobIssues: next.partnerJobIssues,
          recycleBin: next.recycleBin,
        });
      }
      prevProductIds.current = toIdSet(normalizedProducts);
      prevOrderIds.current = toIdSet(next.orders);
      prevCustomerIds.current = toIdSet(next.customers);
      prevRestockIds.current = toIdSet(next.restockLogs);
      prevProcurementIds.current = toIdSet(next.procurements);
      prevExpenseIds.current = toIdSet(next.expenses);
      prevOtherIncomeIds.current = toIdSet(next.otherIncomes);
      prevExpenseRequestIds.current = toIdSet(next.expenseRequests);
      prevRefundRequestIds.current = toIdSet(next.refundRequests);
      prevCaseIds.current = toIdSet(next.cases);
      prevReturnIds.current = toIdSet(next.returns);
      prevAuditLogIds.current = toIdSet(next.auditLogs);
      prevPartnerIds.current = toIdSet(next.partners);
      prevPartnerJobIds.current = toIdSet(next.partnerJobs);
      prevPartnerJobIssueIds.current = toIdSet(next.partnerJobIssues);
      prevRecycleBinIds.current = toIdSet(next.recycleBin);
      if (next.settings) {
        prevOrderStatusIds.current = toIdSet(next.settings.orderStatuses);
        prevSaleSourceIds.current = toIdSet(next.settings.saleSources);
        prevCustomServiceIds.current = toIdSet(next.settings.customServices);
        prevPaymentMethodIds.current = toIdSet(next.settings.paymentMethods);
        prevLogisticsCarrierIds.current = toIdSet(next.settings.logisticsCarriers);
        prevProductVariableIds.current = toIdSet(next.settings.productVariables);
        prevProductOptionIds.current = toIdSet(next.settings.productOptions);
        prevExpenseCategoryIds.current = toIdSet(next.settings.expenseCategories);
        prevCategoryIds.current = toIdSet(buildCategoryItems(next.settings.categories));
        prevCaseStatusIds.current = toIdSet(next.settings.caseStatuses);
      }
      applyingRemote.current = false;
    };

    const applyDataSlice = <T extends { id: string }>(
      key: 'products' | 'orders' | 'customers' | 'restockLogs' | 'procurements' | 'expenses' | 'otherIncomes' | 'expenseRequests' | 'refundRequests' | 'cases' | 'returns' | 'auditLogs' | 'partners' | 'partnerJobs' | 'partnerJobIssues' | 'recycleBin',
      rows: { data: T }[],
    ) => {
      if (!isCurrentWorkspace()) return;
      const items = rows.map((row) => row.data);
      const storeState = useFyllStore.getState();
      const nextItems = (
        key === 'products'
          ? preferExistingOnEmpty(items, storeState.products as unknown as T[], 'products')
          : key === 'orders'
            ? preferExistingOnEmpty(items, storeState.orders as unknown as T[], 'orders')
            : key === 'customers'
              ? preferExistingOnEmpty(items, storeState.customers as unknown as T[], 'customers')
              : key === 'cases'
                ? preferExistingOnEmpty(items, storeState.cases as unknown as T[], 'cases')
                : items
      );
      useFyllStore.setState({ [key]: nextItems } as Partial<ReturnType<typeof useFyllStore.getState>>);
      if (key === 'products') prevProductIds.current = toIdSet(nextItems);
      if (key === 'orders') prevOrderIds.current = toIdSet(nextItems);
      if (key === 'customers') prevCustomerIds.current = toIdSet(nextItems);
      if (key === 'restockLogs') prevRestockIds.current = toIdSet(nextItems);
      if (key === 'procurements') prevProcurementIds.current = toIdSet(nextItems);
      if (key === 'expenses') prevExpenseIds.current = toIdSet(nextItems);
      if (key === 'otherIncomes') prevOtherIncomeIds.current = toIdSet(nextItems);
      if (key === 'expenseRequests') prevExpenseRequestIds.current = toIdSet(nextItems);
      if (key === 'refundRequests') prevRefundRequestIds.current = toIdSet(nextItems);
      if (key === 'cases') prevCaseIds.current = toIdSet(nextItems);
      if (key === 'returns') prevReturnIds.current = toIdSet(nextItems);
      if (key === 'auditLogs') prevAuditLogIds.current = toIdSet(nextItems);
      if (key === 'partners') prevPartnerIds.current = toIdSet(nextItems);
      if (key === 'partnerJobs') prevPartnerJobIds.current = toIdSet(nextItems);
      if (key === 'partnerJobIssues') prevPartnerJobIssueIds.current = toIdSet(nextItems);
      if (key === 'recycleBin') prevRecycleBinIds.current = toIdSet(nextItems);
    };

    const runOrderAutomationAndPersist = async (
      ordersToCheck: Order[],
      config: OrderAutomationConfig,
      reason: string,
    ): Promise<Order[]> => {
      if (!isCurrentWorkspace()) return ordersToCheck;
      const { orders: automatedOrders, changedOrders } = autoCompleteEligibleOrders(ordersToCheck, config);
      if (changedOrders.length === 0) return automatedOrders;

      // Auto-complete only updates the order's status. It intentionally does
      // not email the customer or notify the business — those notifications
      // caused a burst of confusing "delivered" emails when a backlog of
      // stale orders crossed the automation's day threshold all at once.
      console.log(`✅ Auto-completed ${changedOrders.length} orders (${reason})`);
      try {
        await supabaseData.upsertCollection(TABLES.orders, businessId, changedOrders);
      } catch (error) {
        console.warn('Auto-complete orders sync failed:', error);
      }

      return automatedOrders;
    };

    const setPrevIdsForStoreKey = (key: DataStoreKey, items: { id: string }[]) => {
      if (key === 'products') prevProductIds.current = toIdSet(items);
      if (key === 'orders') prevOrderIds.current = toIdSet(items);
      if (key === 'customers') prevCustomerIds.current = toIdSet(items);
      if (key === 'restockLogs') prevRestockIds.current = toIdSet(items);
      if (key === 'procurements') prevProcurementIds.current = toIdSet(items);
      if (key === 'expenses') prevExpenseIds.current = toIdSet(items);
      if (key === 'otherIncomes') prevOtherIncomeIds.current = toIdSet(items);
      if (key === 'expenseRequests') prevExpenseRequestIds.current = toIdSet(items);
      if (key === 'refundRequests') prevRefundRequestIds.current = toIdSet(items);
      if (key === 'cases') prevCaseIds.current = toIdSet(items);
      if (key === 'auditLogs') prevAuditLogIds.current = toIdSet(items);
      if (key === 'partners') prevPartnerIds.current = toIdSet(items);
      if (key === 'partnerJobs') prevPartnerJobIds.current = toIdSet(items);
      if (key === 'partnerJobIssues') prevPartnerJobIssueIds.current = toIdSet(items);
      if (key === 'recycleBin') prevRecycleBinIds.current = toIdSet(items);
    };

    const applyRealtimeDataPayload = (table: string, payload: any): boolean => {
      const storeKey = (DATA_TABLE_TO_STORE_KEY as Record<string, DataStoreKey | undefined>)[table];
      if (!storeKey) return false;

      const eventType = String(payload?.eventType ?? '').toUpperCase();
      if (!eventType) return false;

      const newRow = payload?.new as { id?: string; data?: any } | undefined;
      const oldRow = payload?.old as { id?: string; data?: any } | undefined;

      const isDelete = eventType === 'DELETE';
      const rowId = (isDelete ? oldRow?.id : newRow?.id) ?? (isDelete ? oldRow?.data?.id : newRow?.data?.id);
      const item = isDelete ? null : newRow?.data;

      if (!rowId || (!isDelete && !item)) {
        return false;
      }

      if (!isCurrentWorkspace()) return false;
      applyingRemote.current = true;
      useFyllStore.setState((state: any) => {
        const current = Array.isArray(state[storeKey]) ? state[storeKey] : [];

        if (isDelete) {
          return {
            [storeKey]: current.filter((row: any) => row?.id !== rowId),
          } as Partial<ReturnType<typeof useFyllStore.getState>>;
        }

        const index = current.findIndex((row: any) => row?.id === rowId);
        if (index === -1) {
          return {
            [storeKey]: [item, ...current],
          } as Partial<ReturnType<typeof useFyllStore.getState>>;
        }

        const next = [...current];
        next[index] = item;
        return {
          [storeKey]: next,
        } as Partial<ReturnType<typeof useFyllStore.getState>>;
      });

      const latestItems = (useFyllStore.getState() as any)[storeKey] as { id: string }[] | undefined;
      setPrevIdsForStoreKey(storeKey, latestItems ?? []);
      applyingRemote.current = false;
      lastRealtimeAt.current = Date.now();
      return true;
    };

    const applySettingsSlice = (table: string, rows: { data: any }[]) => {
      if (!isCurrentWorkspace()) return;
      const items = mapData(rows);
      const storeState = useFyllStore.getState();
      switch (table) {
        case SETTINGS_TABLES.orderStatuses:
          if (items.length === 0 && storeState.orderStatuses.length > 0) {
            console.warn('🛡️ Ignored empty realtime order statuses payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ orderStatuses: items });
          prevOrderStatusIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.saleSources:
          if (items.length === 0 && storeState.saleSources.length > 0) {
            console.warn('🛡️ Ignored empty realtime sale sources payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ saleSources: items });
          prevSaleSourceIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.customServices:
          if (items.length === 0 && storeState.customServices.length > 0) {
            console.warn('🛡️ Ignored empty realtime custom services payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ customServices: items });
          prevCustomServiceIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.paymentMethods:
          if (items.length === 0 && storeState.paymentMethods.length > 0) {
            console.warn('🛡️ Ignored empty realtime payment methods payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ paymentMethods: items });
          prevPaymentMethodIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.logisticsCarriers:
          if (items.length === 0 && storeState.logisticsCarriers.length > 0) {
            console.warn('🛡️ Ignored empty realtime logistics carriers payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ logisticsCarriers: items });
          prevLogisticsCarrierIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.productVariables:
          if (items.length === 0 && storeState.productVariables.length > 0) {
            console.warn('🛡️ Ignored empty realtime product variables payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ productVariables: items });
          prevProductVariableIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.productOptions:
          if (items.length === 0 && storeState.productOptions.length > 0) {
            console.warn('🛡️ Ignored empty realtime product options payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ productOptions: items });
          prevProductOptionIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.expenseCategories:
          if (items.length === 0 && storeState.expenseCategories.length > 0) {
            console.warn('🛡️ Ignored empty realtime expense categories payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ expenseCategories: items });
          prevExpenseCategoryIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.productCategories: {
          const names = rows
            .map((row) => row.data?.name)
            .filter((name): name is string => typeof name === 'string');
          if (names.length === 0 && storeState.categories.length > 0) {
            console.warn('🛡️ Ignored empty realtime product categories payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ categories: names });
          prevCategoryIds.current = toIdSet(buildCategoryItems(names));
          break;
        }
        case SETTINGS_TABLES.caseStatuses:
          if (items.length === 0 && storeState.caseStatuses.length > 0) {
            console.warn('🛡️ Ignored empty realtime case statuses payload to preserve local settings');
            break;
          }
          useFyllStore.setState({ caseStatuses: items });
          prevCaseStatusIds.current = toIdSet(items);
          break;
        case SETTINGS_TABLES.businessSettings: {
          const businessSettings = getGlobalBusinessSettingsData(
            rows as Array<{ id: string; data: BusinessSettingsData }>
          );
          const fallbackFromStore = useFyllStore.getState();
          const normalizedOrderAutomations = normalizeOrderAutomations(
            businessSettings?.orderAutomations ?? [],
            {
              autoCompleteAfterDays: businessSettings?.autoCompleteAfterDays
                ?? fallbackFromStore.autoCompleteAfterDays
                ?? 10,
              autoCompleteFromStatus: businessSettings?.autoCompleteFromStatus
                ?? fallbackFromStore.autoCompleteFromStatus
                ?? '',
              autoCompleteToStatus: businessSettings?.autoCompleteToStatus
                ?? fallbackFromStore.autoCompleteToStatus
                ?? '',
            }
          );
          const legacyAutomation = resolveLegacyAutomationFields(normalizedOrderAutomations);
          useFyllStore.setState({
            useGlobalLowStockThreshold: businessSettings?.useGlobalLowStockThreshold
              ?? useFyllStore.getState().useGlobalLowStockThreshold
              ?? false,
            globalLowStockThreshold: businessSettings?.globalLowStockThreshold
              ?? useFyllStore.getState().globalLowStockThreshold
              ?? 0,
            autoCompleteOrders: businessSettings?.autoCompleteOrders
              ?? useFyllStore.getState().autoCompleteOrders
              ?? false,
            autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
            autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
            autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
            orderAutomations: normalizedOrderAutomations,
            deliveryFollowUpEnabled: businessSettings?.deliveryFollowUpEnabled
              ?? useFyllStore.getState().deliveryFollowUpEnabled
              ?? false,
            deliveryFollowUpDelayDays: businessSettings?.deliveryFollowUpDelayDays
              ?? useFyllStore.getState().deliveryFollowUpDelayDays
              ?? 7,
            deliveryFollowUpResendDays: businessSettings?.deliveryFollowUpResendDays
              ?? useFyllStore.getState().deliveryFollowUpResendDays
              ?? 7,
            deliveryFollowUpFromName: typeof businessSettings?.deliveryFollowUpFromName === 'string'
              ? businessSettings.deliveryFollowUpFromName
              : useFyllStore.getState().deliveryFollowUpFromName,
            orderStatusEmailEnabled: businessSettings?.orderStatusEmailEnabled
              ?? useFyllStore.getState().orderStatusEmailEnabled
              ?? false,
            orderTimelineSettings: businessSettings?.orderTimelineSettings
              ?? fallbackFromStore.orderTimelineSettings,
            qcChecklistRequirements: sanitizeOrderQcRequirements(
              businessSettings?.qcChecklistRequirements
                ?? fallbackFromStore.qcChecklistRequirements
                ?? DEFAULT_ORDER_QC_REQUIREMENTS,
              false
            ),
            financeSuppliers: businessSettings?.financeSuppliers
              ?? fallbackFromStore.financeSuppliers
              ?? [],
            procurementStatusOptions: (
              businessSettings?.procurementStatusOptions
              ?? fallbackFromStore.procurementStatusOptions
              ?? DEFAULT_PROCUREMENT_STATUS_OPTIONS
            ).slice().sort((a, b) => a.order - b.order),
            fixedCosts: businessSettings?.fixedCosts
              ?? fallbackFromStore.fixedCosts
              ?? [],
            salaryTemplates: businessSettings?.salaryTemplates
              ?? fallbackFromStore.salaryTemplates
              ?? [],
            warehouseItems: businessSettings?.warehouseItems
              ?? fallbackFromStore.warehouseItems
              ?? [],
            warehouseCategories: businessSettings?.warehouseCategories
              ?? fallbackFromStore.warehouseCategories
              ?? [],
            warehouseUnits: businessSettings?.warehouseUnits
              ?? fallbackFromStore.warehouseUnits
              ?? [],
            financeRules: businessSettings?.financeRules
              ?? fallbackFromStore.financeRules,
          });
          hasLoadedRemoteBusinessSettingsRef.current = true;
          hasHydratedBusinessSettingsRef.current = true;
          break;
        }
        default:
          break;
      }
    };

    const syncTable = async (table: string) => {
      if (!isCurrentWorkspace()) return;
      syncingRef.current = true;
      try {
        if (ACTIVE_DATA_TABLES.includes(table as (typeof TABLES)[keyof typeof TABLES])) {
          switch (table) {
            case TABLES.products:
              applyDataSlice('products', await supabaseData.fetchCollection<Product>(TABLES.products, businessId));
              break;
            case TABLES.orders: {
              const orderRows = await supabaseData.fetchCollection<Order>(TABLES.orders, businessId);
              const orderItems = mapData(orderRows);
              const storeState = useFyllStore.getState();
              const automatedOrders = await runOrderAutomationAndPersist(orderItems, {
                autoCompleteOrders: storeState.autoCompleteOrders,
                autoCompleteAfterDays: storeState.autoCompleteAfterDays,
                autoCompleteFromStatus: storeState.autoCompleteFromStatus,
                autoCompleteToStatus: storeState.autoCompleteToStatus,
                orderAutomations: storeState.orderAutomations,
              }, 'orders sync');
              applyDataSlice('orders', automatedOrders.map((order) => ({ data: order })));
              break;
            }
            case TABLES.customers:
              applyDataSlice('customers', await supabaseData.fetchCollection<Customer>(TABLES.customers, businessId));
              break;
            case TABLES.restockLogs:
              applyDataSlice('restockLogs', await supabaseData.fetchCollection<RestockLog>(TABLES.restockLogs, businessId));
              break;
            case TABLES.procurements:
              applyDataSlice('procurements', await supabaseData.fetchCollection<Procurement>(TABLES.procurements, businessId));
              break;
            case TABLES.expenses:
              applyDataSlice('expenses', await supabaseData.fetchCollection<Expense>(TABLES.expenses, businessId));
              break;
            case TABLES.otherIncomes:
              applyDataSlice('otherIncomes', await supabaseData.fetchCollection<OtherIncome>(TABLES.otherIncomes, businessId));
              break;
            case TABLES.expenseRequests:
              applyDataSlice('expenseRequests', await supabaseData.fetchCollection<ExpenseRequest>(TABLES.expenseRequests, businessId));
              break;
            case TABLES.refundRequests:
              applyDataSlice('refundRequests', await supabaseData.fetchCollection<RefundRequest>(TABLES.refundRequests, businessId));
              break;
            case TABLES.cases:
              applyDataSlice('cases', await supabaseData.fetchCollection<Case>(TABLES.cases, businessId));
              break;
            case TABLES.returns:
              applyDataSlice('returns', await supabaseData.fetchCollection<ReturnRequest>(TABLES.returns, businessId));
              break;
            case TABLES.auditLogs:
              applyDataSlice(
                'auditLogs',
                await supabaseData.fetchCollection<AuditLog>(TABLES.auditLogs, businessId, { orderBy: 'updated_at', limit: 500 })
              );
              break;
            case TABLES.deletedItems:
              applyDataSlice(
                'recycleBin',
                await supabaseData.fetchCollection<DeletedItem>(TABLES.deletedItems, businessId, { orderBy: 'updated_at', limit: 500 })
              );
              break;
            case TABLES.partners:
              applyDataSlice('partners', await supabaseData.fetchCollection<Partner>(TABLES.partners, businessId));
              break;
            case TABLES.partnerJobs:
              applyDataSlice('partnerJobs', await supabaseData.fetchCollection<PartnerJob>(TABLES.partnerJobs, businessId));
              break;
            case TABLES.partnerJobIssues:
              applyDataSlice('partnerJobIssues', await supabaseData.fetchCollection<PartnerJobIssue>(TABLES.partnerJobIssues, businessId));
              break;
            default:
              break;
          }
          return;
        }

        if (Object.values(SETTINGS_TABLES).includes(table as (typeof SETTINGS_TABLES)[keyof typeof SETTINGS_TABLES])) {
          const rows = await supabaseSettings.fetchSettings<any>(table, businessId);
          applySettingsSlice(table, rows);
          if (table === SETTINGS_TABLES.businessSettings) {
            const storeState = useFyllStore.getState();
            const automatedOrders = await runOrderAutomationAndPersist(storeState.orders, {
              autoCompleteOrders: storeState.autoCompleteOrders,
              autoCompleteAfterDays: storeState.autoCompleteAfterDays,
              autoCompleteFromStatus: storeState.autoCompleteFromStatus,
              autoCompleteToStatus: storeState.autoCompleteToStatus,
              orderAutomations: storeState.orderAutomations,
            }, 'settings sync');
            if (automatedOrders !== storeState.orders) {
              applyDataSlice('orders', automatedOrders.map((order) => ({ data: order })));
            }
          }
        }
      } catch (error) {
        console.warn('Supabase table sync failed:', error);
      } finally {
        syncingRef.current = false;
        lastRealtimeAt.current = Date.now();
      }
    };

    const syncAll = async () => {
      let fullSyncSucceeded = false;
      let unblockTimeout: ReturnType<typeof setTimeout> | null = null;
      syncingRef.current = true;
      if (isCurrentWorkspace()) {
        setIsSyncing(true);
        // Safety valve: never keep the app blocked behind startup sync for too long.
        if (!isInitialized) {
          unblockTimeout = setTimeout(() => {
            if (!isCurrentWorkspace()) return;
            setIsInitialized(true);
            setIsSyncing(false);
          }, STARTUP_UNBLOCK_TIMEOUT_MS);
        }
      }
      try {
        const localState = useFyllStore.getState();
        const localProducts = localState.products;
        const localOrders = localState.orders;
        const localCustomers = localState.customers;
        const localCases = localState.cases;
        const localReturns = localState.returns;
        const localRestockLogs = localState.restockLogs;
        const localProcurements = localState.procurements;
        const localExpenses = localState.expenses;
        const localOtherIncomes = localState.otherIncomes;
        const localExpenseRequests = localState.expenseRequests;
        const localRefundRequests = localState.refundRequests;
        const localAuditLogs = localState.auditLogs;
        const localPartners = localState.partners;
        const localPartnerJobs = localState.partnerJobs;
        const localPartnerJobIssues = localState.partnerJobIssues;
        const localRecycleBin = localState.recycleBin;
        // ── Wave 1: Minimal startup data (recent products/orders/customers/cases only) ──
        // Keep first paint fast; load settings and full datasets in Wave 2.
        const [
          productRowsResult,
          orderRowsResult,
          customerRowsResult,
          caseRowsResult,
          returnRowsResult,
        ] = await Promise.allSettled([
          withTimeout(
            supabaseData.fetchCollection<Product>(TABLES.products, businessId, {
              orderBy: 'updated_at',
              limit: IS_WEB ? undefined : WAVE1_PRODUCTS_LIMIT,
            }),
            STARTUP_PRODUCTS_QUERY_TIMEOUT_MS,
            'Startup products query'
          ),
          withTimeout(
            supabaseData.fetchCollection<Order>(TABLES.orders, businessId, {
              orderBy: 'updated_at',
              limit: IS_WEB ? undefined : WAVE1_ORDERS_LIMIT,
            }),
            STARTUP_QUERY_TIMEOUT_MS,
            'Startup orders query'
          ),
          withTimeout(
            supabaseData.fetchCollection<Customer>(TABLES.customers, businessId, {
              orderBy: 'updated_at',
              limit: IS_WEB ? undefined : WAVE1_CUSTOMERS_LIMIT,
            }),
            STARTUP_QUERY_TIMEOUT_MS,
            'Startup customers query'
          ),
          withTimeout(
            supabaseData.fetchCollection<Case>(TABLES.cases, businessId, {
              orderBy: 'updated_at',
              limit: IS_WEB ? undefined : WAVE1_CASES_LIMIT,
            }),
            STARTUP_QUERY_TIMEOUT_MS,
            'Startup cases query'
          ),
          withTimeout(
            supabaseData.fetchCollection<ReturnRequest>(TABLES.returns, businessId, {
              orderBy: 'updated_at',
              limit: IS_WEB ? undefined : WAVE1_CASES_LIMIT,
            }),
            STARTUP_QUERY_TIMEOUT_MS,
            'Startup returns query'
          ),
        ]);

        const productRows = productRowsResult.status === 'fulfilled' ? productRowsResult.value : [];
        const orderRows = orderRowsResult.status === 'fulfilled' ? orderRowsResult.value : [];
        const customerPreviewRows = customerRowsResult.status === 'fulfilled' ? customerRowsResult.value : [];
        const casePreviewRows = caseRowsResult.status === 'fulfilled' ? caseRowsResult.value : [];
        const returnPreviewRows = returnRowsResult.status === 'fulfilled' ? returnRowsResult.value : [];

        if (productRowsResult.status === 'rejected') {
          console.warn('Wave 1 products preview failed:', productRowsResult.reason);
        }
        if (orderRowsResult.status === 'rejected') {
          console.warn('Wave 1 orders preview failed:', orderRowsResult.reason);
        }
        if (customerRowsResult.status === 'rejected') {
          console.warn('Wave 1 customers preview failed:', customerRowsResult.reason);
        }
        if (caseRowsResult.status === 'rejected') {
          console.warn('Wave 1 cases preview failed:', caseRowsResult.reason);
        }
        if (returnRowsResult.status === 'rejected') {
          console.warn('Wave 1 returns preview failed:', returnRowsResult.reason);
        }

        const remoteProducts = productRows.map((row) => row.data);
        const remoteOrdersPreview = orderRows.map((row) => row.data);
        const remoteCustomersPreview = customerPreviewRows.map((row) => row.data);
        const remoteCasesPreview = casePreviewRows.map((row) => row.data);
        const remoteReturnsPreview = returnPreviewRows.map((row) => row.data);

        // Apply Wave 1 data immediately so the app can show recent items without flicker.
        if (isCurrentWorkspace()) {
          const wave1Products = remoteProducts.length > 0 ? mergeById(localProducts, remoteProducts) : localProducts;
          const wave1Orders = remoteOrdersPreview.length > 0 ? mergeById(localOrders, remoteOrdersPreview) : localOrders;
          const wave1Customers = remoteCustomersPreview.length > 0 ? mergeById(localCustomers, remoteCustomersPreview) : localCustomers;
          const wave1Cases = remoteCasesPreview.length > 0 ? mergeById(localCases, remoteCasesPreview) : localCases;
          const wave1Returns = remoteReturnsPreview.length > 0 ? mergeById(localReturns, remoteReturnsPreview) : localReturns;
          const shouldRestoreProductsFromLocal = (
            productRowsResult.status === 'fulfilled'
            && remoteProducts.length === 0
            && localProducts.length > 0
          );

          if (shouldRestoreProductsFromLocal) {
            void supabaseData.upsertCollection(TABLES.products, businessId, localProducts);
          }

          applyRemoteState({
            products: wave1Products,
            orders: wave1Orders,
            customers: wave1Customers,
            restockLogs: localRestockLogs,
            procurements: localProcurements,
            expenses: localExpenses,
            otherIncomes: localOtherIncomes,
            expenseRequests: localExpenseRequests,
            refundRequests: localRefundRequests,
            cases: wave1Cases,
            returns: wave1Returns,
            auditLogs: localAuditLogs,
            partners: localPartners,
            partnerJobs: localPartnerJobs,
            partnerJobIssues: localPartnerJobIssues,
            recycleBin: localRecycleBin,
          });

          // Mark as initialized — the app UI can now show
          setIsInitialized(true);
          setIsSyncing(false);
        }

        // ── Wave 2: Background data (full orders, customers, cases, restock, etc.) ──
        // These load silently without blocking the UI.
        if (isCurrentWorkspace()) {
          useFyllStore.getState().setIsBackgroundSyncing(true);
          try {
            const nowMs = Date.now();
            const lastFullSyncMs = localState.lastFullDataSyncAt ? new Date(localState.lastFullDataSyncAt).getTime() : 0;
            const fullSyncDue = !lastFullSyncMs
              || Number.isNaN(lastFullSyncMs)
              || (nowMs - lastFullSyncMs) > FULL_SYNC_RECONCILE_INTERVAL_MS;
            const hasCoreCache = localProducts.length > 0 && localOrders.length > 0 && localCustomers.length > 0;
            const canUseIncrementalDataSync = Platform.OS !== 'web';
            const useIncrementalDataSync = Boolean(
              canUseIncrementalDataSync
              && localState.lastDataSyncAt
              && hasCoreCache
              && !fullSyncDue
            );
            const deltaSince = useIncrementalDataSync ? localState.lastDataSyncAt ?? undefined : undefined;
            const shouldBackfillAllOrders = orderRows.length === 0 || orderRows.length >= WAVE1_ORDERS_LIMIT;
            const shouldBackfillAllProducts = productRows.length === 0 || productRows.length >= WAVE1_PRODUCTS_LIMIT;
            const asRows = <T extends { id: string }>(items: T[]) => (
              items.map((item) => ({ id: item.id, business_id: businessId, data: item }))
            );
            const asCategoryRows = (names: string[]) => (
              buildCategoryItems(names).map((item) => ({ id: item.id, business_id: businessId, data: item }))
            );
            const wave2Results = await Promise.allSettled([
              useIncrementalDataSync
                ? supabaseData.fetchCollection<Product>(TABLES.products, businessId, { orderBy: 'updated_at', updatedAfter: deltaSince })
                : (
                    shouldBackfillAllProducts
                      ? supabaseData.fetchCollection<Product>(TABLES.products, businessId, { orderBy: 'updated_at' })
                      : Promise.resolve(productRows)
                  ),
              useIncrementalDataSync
                ? supabaseData.fetchCollection<Order>(TABLES.orders, businessId, { orderBy: 'updated_at', updatedAfter: deltaSince })
                : (
                    shouldBackfillAllOrders
                      ? supabaseData.fetchCollection<Order>(TABLES.orders, businessId, { orderBy: 'updated_at' })
                      : Promise.resolve(orderRows)
                  ),
              supabaseData.fetchCollection<Customer>(
                TABLES.customers,
                businessId,
                useIncrementalDataSync ? { orderBy: 'updated_at', updatedAfter: deltaSince } : { orderBy: 'updated_at' }
              ),
              supabaseData.fetchCollection<Case>(
                TABLES.cases,
                businessId,
                useIncrementalDataSync ? { orderBy: 'updated_at', updatedAfter: deltaSince } : { orderBy: 'updated_at' }
              ),
              supabaseData.fetchCollection<ReturnRequest>(
                TABLES.returns,
                businessId,
                useIncrementalDataSync ? { orderBy: 'updated_at', updatedAfter: deltaSince } : { orderBy: 'updated_at' }
              ),
              supabaseData.fetchCollection<RestockLog>(
                TABLES.restockLogs,
                businessId,
                useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
              ),
              SYNC_FINANCE_TABLES
                ? supabaseData.fetchCollection<Procurement>(
                    TABLES.procurements,
                    businessId,
                    useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
                  )
                : Promise.resolve(asRows(localProcurements)),
              SYNC_FINANCE_TABLES
                ? supabaseData.fetchCollection<Expense>(
                    TABLES.expenses,
                    businessId,
                    useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
                  )
                : Promise.resolve(asRows(localExpenses)),
              SYNC_FINANCE_TABLES
                ? supabaseData.fetchCollection<OtherIncome>(
                    TABLES.otherIncomes,
                    businessId,
                    useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
                  )
                : Promise.resolve(asRows(localOtherIncomes)),
              SYNC_FINANCE_TABLES
                ? supabaseData.fetchCollection<ExpenseRequest>(
                    TABLES.expenseRequests,
                    businessId,
                    useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
                  )
                : Promise.resolve(asRows(localExpenseRequests)),
              SYNC_FINANCE_TABLES
                ? supabaseData.fetchCollection<RefundRequest>(
                    TABLES.refundRequests,
                    businessId,
                    useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
                  )
                : Promise.resolve(asRows(localRefundRequests)),
              supabaseData.fetchCollection<AuditLog>(
                TABLES.auditLogs,
                businessId,
                useIncrementalDataSync
                  ? { orderBy: 'updated_at', updatedAfter: deltaSince }
                  : { orderBy: 'updated_at', limit: 500 }
              ),
              supabaseData.fetchCollection<DeletedItem>(
                TABLES.deletedItems,
                businessId,
                useIncrementalDataSync
                  ? { orderBy: 'updated_at', updatedAfter: deltaSince }
                  : { orderBy: 'updated_at', limit: 500 }
              ),
              supabaseData.fetchCollection<Partner>(
                TABLES.partners,
                businessId,
                useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
              ),
              supabaseData.fetchCollection<PartnerJob>(
                TABLES.partnerJobs,
                businessId,
                useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
              ),
              supabaseData.fetchCollection<PartnerJobIssue>(
                TABLES.partnerJobIssues,
                businessId,
                useIncrementalDataSync ? { updatedAfter: deltaSince } : undefined
              ),
              supabaseSettings.fetchSettings<OrderStatus>(SETTINGS_TABLES.orderStatuses, businessId),
              supabaseSettings.fetchSettings<SaleSource>(SETTINGS_TABLES.saleSources, businessId),
              supabaseSettings.fetchSettings<CustomService>(SETTINGS_TABLES.customServices, businessId),
              supabaseSettings.fetchSettings<PaymentMethod>(SETTINGS_TABLES.paymentMethods, businessId),
              supabaseSettings.fetchSettings<LogisticsCarrier>(SETTINGS_TABLES.logisticsCarriers, businessId),
              supabaseSettings.fetchSettings<ProductVariable>(SETTINGS_TABLES.productVariables, businessId),
              supabaseSettings.fetchSettings<ProductOption>(SETTINGS_TABLES.productOptions, businessId),
              supabaseSettings.fetchSettings<ExpenseCategory>(SETTINGS_TABLES.expenseCategories, businessId),
              supabaseSettings.fetchSettings<CaseStatusOption>(SETTINGS_TABLES.caseStatuses, businessId),
              supabaseSettings.fetchSettings<{ id: string; name: string }>(SETTINGS_TABLES.productCategories, businessId),
              supabaseSettings.fetchSettings<BusinessSettingsData>(
                SETTINGS_TABLES.businessSettings,
                businessId
              ),
            ]);

            const [
              productDataRowsResult,
              orderDataRowsResult,
              customerRowsResult,
              caseRowsResult,
              returnRowsResult,
              restockRowsResult,
              procurementRowsResult,
              expenseRowsResult,
              otherIncomeRowsResult,
              expenseRequestRowsResult,
              refundRequestRowsResult,
              auditLogRowsResult,
              recycleBinRowsResult,
              partnerRowsResult,
              partnerJobRowsResult,
              partnerJobIssueRowsResult,
              orderStatusRowsResult,
              saleSourceRowsResult,
              customServiceRowsResult,
              paymentMethodRowsResult,
              logisticsCarrierRowsResult,
              productVariableRowsResult,
              productOptionRowsResult,
              expenseCategoryRowsResult,
              caseStatusRowsResult,
              categoryRowsResult,
              businessSettingsRowsResult,
            ] = wave2Results;

            const productDataRows = resolveSettled(productDataRowsResult, asRows(localProducts), 'products');
            const orderDataRows = resolveSettled(orderDataRowsResult, asRows(localOrders), 'orders');
            const customerRows = resolveSettled(customerRowsResult, asRows(localCustomers), 'customers');
            const caseRows = resolveSettled(caseRowsResult, asRows(localCases), 'cases');
            const returnRows = resolveSettled(returnRowsResult, asRows(localReturns), 'returns');
            const restockRows = resolveSettled(restockRowsResult, asRows(localRestockLogs), 'restock logs');
            const procurementRows = resolveSettled(procurementRowsResult, asRows(localProcurements), 'procurements');
            const expenseRows = resolveSettled(expenseRowsResult, asRows(localExpenses), 'expenses');
            const otherIncomeRows = resolveSettled(otherIncomeRowsResult, asRows(localOtherIncomes), 'other income');
            const expenseRequestRows = resolveSettled(expenseRequestRowsResult, asRows(localExpenseRequests), 'expense requests');
            const refundRequestRows = resolveSettled(refundRequestRowsResult, asRows(localRefundRequests), 'refund requests');
            const auditLogRows = resolveSettled(auditLogRowsResult, asRows(localAuditLogs), 'audit logs');
            const recycleBinRows = resolveSettled(recycleBinRowsResult, asRows(localRecycleBin), 'recycle bin');
            const partnerRows = resolveSettled(partnerRowsResult, asRows(localPartners), 'partners');
            const partnerJobRows = resolveSettled(partnerJobRowsResult, asRows(localPartnerJobs), 'partner jobs');
            const partnerJobIssueRows = resolveSettled(partnerJobIssueRowsResult, asRows(localPartnerJobIssues), 'partner job issues');
            const orderStatusRows = resolveSettled(orderStatusRowsResult, asRows(localState.orderStatuses), 'order statuses');
            const saleSourceRows = resolveSettled(saleSourceRowsResult, asRows(localState.saleSources), 'sale sources');
            const customServiceRows = resolveSettled(customServiceRowsResult, asRows(localState.customServices), 'custom services');
            const paymentMethodRows = resolveSettled(paymentMethodRowsResult, asRows(localState.paymentMethods), 'payment methods');
            const logisticsCarrierRows = resolveSettled(logisticsCarrierRowsResult, asRows(localState.logisticsCarriers), 'logistics carriers');
            const productVariableRows = resolveSettled(productVariableRowsResult, asRows(localState.productVariables), 'product variables');
            const productOptionRows = resolveSettled(productOptionRowsResult, asRows(localState.productOptions), 'product options');
            const expenseCategoryRows = resolveSettled(expenseCategoryRowsResult, asRows(localState.expenseCategories), 'expense categories');
            const caseStatusRows = resolveSettled(caseStatusRowsResult, asRows(localState.caseStatuses), 'case statuses');
            const categoryRows = resolveSettled(categoryRowsResult, asCategoryRows(localState.categories), 'product categories');
            const businessSettingsRows = resolveSettled(
              businessSettingsRowsResult,
              [{
                id: 'global',
                business_id: businessId,
                data: {
                  id: 'global',
                  useGlobalLowStockThreshold: localState.useGlobalLowStockThreshold,
                  globalLowStockThreshold: localState.globalLowStockThreshold,
                  autoCompleteOrders: localState.autoCompleteOrders,
                  autoCompleteAfterDays: localState.autoCompleteAfterDays,
                  autoCompleteFromStatus: localState.autoCompleteFromStatus,
                  autoCompleteToStatus: localState.autoCompleteToStatus,
                  orderAutomations: localState.orderAutomations,
                  deliveryFollowUpEnabled: localState.deliveryFollowUpEnabled,
                  deliveryFollowUpDelayDays: localState.deliveryFollowUpDelayDays,
                  deliveryFollowUpResendDays: localState.deliveryFollowUpResendDays,
                  deliveryFollowUpFromName: localState.deliveryFollowUpFromName,
                  orderStatusEmailEnabled: localState.orderStatusEmailEnabled,
                  orderTimelineSettings: localState.orderTimelineSettings,
                  qcChecklistRequirements: localState.qcChecklistRequirements,
                  financeSuppliers: localState.financeSuppliers,
                  procurementStatusOptions: localState.procurementStatusOptions,
                  fixedCosts: localState.fixedCosts,
                  salaryTemplates: localState.salaryTemplates,
                  warehouseItems: localState.warehouseItems,
                  warehouseCategories: localState.warehouseCategories,
                  warehouseUnits: localState.warehouseUnits,
                  financeRules: localState.financeRules,
                },
              }],
              'business settings'
            );
            const didLoadRemoteBusinessSettings = businessSettingsRowsResult.status === 'fulfilled';

            if (isCurrentWorkspace()) {
              applyingRemote.current = true;
              const incomingProducts = productDataRows.map((row) => row.data);
              const incomingOrders = orderDataRows.map((row) => row.data);
              const incomingCustomers = customerRows.map((row) => row.data);
              const incomingCases = caseRows.map((row) => row.data);
              const incomingReturns = returnRows.map((row) => row.data);
              const incomingRestockLogs = restockRows.map((row) => row.data);
              const incomingProcurements = procurementRows.map((row) => row.data);
              const incomingExpenses = expenseRows.map((row) => row.data);
              const incomingOtherIncomes = otherIncomeRows.map((row) => row.data);
              const incomingExpenseRequests = expenseRequestRows.map((row) => row.data);
              const incomingRefundRequests = refundRequestRows.map((row) => row.data);
              const incomingAuditLogs = auditLogRows.map((row) => row.data);
              const incomingRecycleBin = recycleBinRows.map((row) => row.data);
              const incomingPartners = partnerRows.map((row) => row.data);
              const incomingPartnerJobs = partnerJobRows.map((row) => row.data);
              const incomingPartnerJobIssues = partnerJobIssueRows.map((row) => row.data);

              const fullProducts = useIncrementalDataSync
                ? mergeById(localProducts, incomingProducts)
                : preferExistingOnEmpty(incomingProducts, localProducts, 'products full sync');
              const fullOrders = useIncrementalDataSync
                ? mergeById(localOrders, incomingOrders)
                : preferExistingOnEmpty(incomingOrders, localOrders, 'orders full sync');
              const fullCustomers = useIncrementalDataSync
                ? mergeById(localCustomers, incomingCustomers)
                : preferExistingOnEmpty(incomingCustomers, localCustomers, 'customers full sync');
              const fullCases = useIncrementalDataSync
                ? mergeById(localCases, incomingCases)
                : preferExistingOnEmpty(incomingCases, localCases, 'cases full sync');
              const fullReturns = useIncrementalDataSync
                ? mergeById(localReturns, incomingReturns)
                : preferExistingOnEmpty(incomingReturns, localReturns, 'returns full sync');
              const fullRestockLogs = useIncrementalDataSync ? mergeById(localRestockLogs, incomingRestockLogs) : incomingRestockLogs;
              // Procurements are edited heavily from the web workspace. Keep local optimistic
              // rows during full sync so freshly duplicated/created orders do not disappear
              // before the remote snapshot catches up. But never resurrect a procurement that
              // was explicitly deleted (i.e. moved to the recycle bin) by a stale local cache.
              const deletedProcurementIds = new Set(
                [...localRecycleBin, ...incomingRecycleBin]
                  .filter((item) => item.entityType === 'procurement')
                  .map((item) => item.entityId)
              );
              const fullProcurements = mergeById(localProcurements, incomingProcurements)
                .filter((procurement) => !deletedProcurementIds.has(procurement.id));
              const fullExpenses = useIncrementalDataSync ? mergeById(localExpenses, incomingExpenses) : incomingExpenses;
              const fullOtherIncomes = useIncrementalDataSync
                ? mergeById(localOtherIncomes, incomingOtherIncomes)
                : preferExistingOnEmpty(incomingOtherIncomes, localOtherIncomes, 'other income full sync');
              if (
                !useIncrementalDataSync
                && otherIncomeRowsResult.status === 'fulfilled'
                && incomingOtherIncomes.length === 0
                && localOtherIncomes.length > 0
              ) {
                try {
                  await supabaseData.upsertCollection(TABLES.otherIncomes, businessId, localOtherIncomes);
                } catch (restoreError) {
                  console.warn('Other income restore to Supabase failed:', restoreError);
                }
              }
              const fullExpenseRequests = useIncrementalDataSync
                ? mergeById(localExpenseRequests, incomingExpenseRequests)
                : incomingExpenseRequests;
              const fullRefundRequests = useIncrementalDataSync
                ? mergeById(localRefundRequests, incomingRefundRequests)
                : incomingRefundRequests;
              const fullAuditLogs = (
                useIncrementalDataSync ? mergeById(localAuditLogs, incomingAuditLogs) : incomingAuditLogs
              )
                .sort((a, b) => {
                  const aTime = new Date(a.completedAt ?? 0).getTime();
                  const bTime = new Date(b.completedAt ?? 0).getTime();
                  return bTime - aTime;
                })
                .slice(0, 500);
              const fullRecycleBin = useIncrementalDataSync
                ? mergeById(localRecycleBin, incomingRecycleBin)
                : incomingRecycleBin;
              const fullPartners = useIncrementalDataSync
                ? mergeById(localPartners, incomingPartners)
                : incomingPartners;
              const fullPartnerJobs = useIncrementalDataSync
                ? mergeById(localPartnerJobs, incomingPartnerJobs)
                : incomingPartnerJobs;
              const fullPartnerJobIssues = useIncrementalDataSync
                ? mergeById(localPartnerJobIssues, incomingPartnerJobIssues)
                : incomingPartnerJobIssues;

              const businessSettings = getGlobalBusinessSettingsData(
                businessSettingsRows as Array<{ id: string; data: BusinessSettingsData }>
              );
              const normalizedOrderAutomations = normalizeOrderAutomations(
                businessSettings?.orderAutomations ?? [],
                {
                  autoCompleteAfterDays: businessSettings?.autoCompleteAfterDays
                    ?? useFyllStore.getState().autoCompleteAfterDays
                    ?? 10,
                  autoCompleteFromStatus: businessSettings?.autoCompleteFromStatus
                    ?? useFyllStore.getState().autoCompleteFromStatus
                    ?? '',
                  autoCompleteToStatus: businessSettings?.autoCompleteToStatus
                    ?? useFyllStore.getState().autoCompleteToStatus
                    ?? '',
                }
              );
              const legacyAutomation = resolveLegacyAutomationFields(normalizedOrderAutomations);
              const localSettingsState = useFyllStore.getState();
              const remoteCategoryNames = categoryRows
                .map((row) => row.data?.name)
                .filter((name): name is string => typeof name === 'string');
              const remoteProductVariables = mapData(productVariableRows);
              const remoteProductOptions = mapData(productOptionRows);
              const remoteOrderStatuses = mapData(orderStatusRows).sort((a, b) => {
                const aOrder = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
                const bOrder = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return (a.name ?? '').localeCompare(b.name ?? '');
              });
              const remoteSaleSources = mapData(saleSourceRows);
              const remoteCustomServices = mapData(customServiceRows);
              const remotePaymentMethods = mapData(paymentMethodRows);
              const remoteLogisticsCarriers = mapData(logisticsCarrierRows);
              const remoteExpenseCategories = mapData(expenseCategoryRows);
              const remoteCaseStatuses = mapData(caseStatusRows);
              const remoteSettings: GlobalSettingsPayload = {
                categories: remoteCategoryNames.length > 0 ? remoteCategoryNames : (localSettingsState.categories ?? []),
                productVariables: remoteProductVariables.length > 0 ? remoteProductVariables : (localSettingsState.productVariables ?? []),
                productOptions: remoteProductOptions.length > 0 ? remoteProductOptions : (localSettingsState.productOptions ?? []),
                orderStatuses: remoteOrderStatuses.length > 0 ? remoteOrderStatuses : (localSettingsState.orderStatuses ?? []),
                saleSources: remoteSaleSources.length > 0 ? remoteSaleSources : (localSettingsState.saleSources ?? []),
                customServices: remoteCustomServices.length > 0 ? remoteCustomServices : (localSettingsState.customServices ?? []),
                paymentMethods: remotePaymentMethods.length > 0 ? remotePaymentMethods : (localSettingsState.paymentMethods ?? []),
                logisticsCarriers: remoteLogisticsCarriers.length > 0 ? remoteLogisticsCarriers : (localSettingsState.logisticsCarriers ?? []),
                expenseCategories: remoteExpenseCategories.length > 0 ? remoteExpenseCategories : (localSettingsState.expenseCategories ?? []),
                caseStatuses: remoteCaseStatuses.length > 0 ? remoteCaseStatuses : (localSettingsState.caseStatuses ?? []),
                useGlobalLowStockThreshold: businessSettings?.useGlobalLowStockThreshold
                  ?? localSettingsState.useGlobalLowStockThreshold
                  ?? false,
                globalLowStockThreshold: businessSettings?.globalLowStockThreshold
                  ?? localSettingsState.globalLowStockThreshold
                  ?? 0,
                autoCompleteOrders: businessSettings?.autoCompleteOrders
                  ?? localSettingsState.autoCompleteOrders
                  ?? false,
                autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
                autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
                autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
                orderAutomations: normalizedOrderAutomations,
                deliveryFollowUpEnabled: businessSettings?.deliveryFollowUpEnabled
                  ?? localSettingsState.deliveryFollowUpEnabled
                  ?? false,
                deliveryFollowUpDelayDays: businessSettings?.deliveryFollowUpDelayDays
                  ?? localSettingsState.deliveryFollowUpDelayDays
                  ?? 7,
                deliveryFollowUpResendDays: businessSettings?.deliveryFollowUpResendDays
                  ?? localSettingsState.deliveryFollowUpResendDays
                  ?? 7,
                deliveryFollowUpFromName: typeof businessSettings?.deliveryFollowUpFromName === 'string'
                  ? businessSettings.deliveryFollowUpFromName
                  : localSettingsState.deliveryFollowUpFromName,
                orderStatusEmailEnabled: businessSettings?.orderStatusEmailEnabled
                  ?? localSettingsState.orderStatusEmailEnabled
                  ?? false,
                orderTimelineSettings: businessSettings?.orderTimelineSettings
                  ?? localSettingsState.orderTimelineSettings,
                qcChecklistRequirements: sanitizeOrderQcRequirements(
                  businessSettings?.qcChecklistRequirements
                    ?? localSettingsState.qcChecklistRequirements
                    ?? DEFAULT_ORDER_QC_REQUIREMENTS,
                  false
                ),
                financeSuppliers: businessSettings?.financeSuppliers
                  ?? localSettingsState.financeSuppliers
                  ?? [],
                procurementStatusOptions: (
                  businessSettings?.procurementStatusOptions
                  ?? localSettingsState.procurementStatusOptions
                  ?? DEFAULT_PROCUREMENT_STATUS_OPTIONS
                ).slice().sort((a, b) => a.order - b.order),
                fixedCosts: businessSettings?.fixedCosts
                  ?? localSettingsState.fixedCosts
                  ?? [],
                salaryTemplates: businessSettings?.salaryTemplates
                  ?? localSettingsState.salaryTemplates
                  ?? [],
                warehouseItems: businessSettings?.warehouseItems
                  ?? localSettingsState.warehouseItems
                  ?? [],
                warehouseCategories: businessSettings?.warehouseCategories
                  ?? localSettingsState.warehouseCategories
                  ?? [],
                warehouseUnits: businessSettings?.warehouseUnits
                  ?? localSettingsState.warehouseUnits
                  ?? [],
                financeRules: businessSettings?.financeRules
                  ?? localSettingsState.financeRules,
              };
              hasLoadedRemoteBusinessSettingsRef.current = didLoadRemoteBusinessSettings;
              hasHydratedBusinessSettingsRef.current = didLoadRemoteBusinessSettings;

              const restoreOps: Promise<unknown>[] = [];
              if (remoteOrderStatuses.length === 0 && remoteSettings.orderStatuses.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.orderStatuses, businessId, remoteSettings.orderStatuses)
                );
              }
              const inferredOrderStatuses = inferOrderStatuses(fullOrders);
              if (remoteSettings.orderStatuses.length === 0 && inferredOrderStatuses.length > 0) {
                remoteSettings.orderStatuses = inferredOrderStatuses;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.orderStatuses, businessId, inferredOrderStatuses)
                );
              }

              if (remoteSaleSources.length === 0 && remoteSettings.saleSources.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.saleSources, businessId, remoteSettings.saleSources)
                );
              }
              const inferredSaleSources = inferSaleSources(fullOrders);
              if (remoteSettings.saleSources.length === 0 && inferredSaleSources.length > 0) {
                remoteSettings.saleSources = inferredSaleSources;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.saleSources, businessId, inferredSaleSources)
                );
              }

              if (remotePaymentMethods.length === 0 && remoteSettings.paymentMethods.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.paymentMethods, businessId, remoteSettings.paymentMethods)
                );
              }
              const inferredPaymentMethods = inferPaymentMethods(fullOrders);
              if (remoteSettings.paymentMethods.length === 0 && inferredPaymentMethods.length > 0) {
                remoteSettings.paymentMethods = inferredPaymentMethods;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.paymentMethods, businessId, inferredPaymentMethods)
                );
              }

              if (remoteCategoryNames.length === 0 && remoteSettings.categories.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(
                    SETTINGS_TABLES.productCategories,
                    businessId,
                    buildCategoryItems(remoteSettings.categories)
                  )
                );
              }
              const inferredCategories = inferCategories(fullProducts);
              if (remoteSettings.categories.length === 0 && inferredCategories.length > 0) {
                remoteSettings.categories = inferredCategories;
                restoreOps.push(
                  supabaseSettings.upsertSettings(
                    SETTINGS_TABLES.productCategories,
                    businessId,
                    buildCategoryItems(inferredCategories)
                  )
                );
              }

              if (remoteProductVariables.length === 0 && remoteSettings.productVariables.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.productVariables, businessId, remoteSettings.productVariables)
                );
              }
              const inferredProductVariables = inferProductVariables(fullProducts);
              if (remoteSettings.productVariables.length === 0 && inferredProductVariables.length > 0) {
                remoteSettings.productVariables = inferredProductVariables;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.productVariables, businessId, inferredProductVariables)
                );
              }

              if (remoteProductOptions.length === 0 && remoteSettings.productOptions.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.productOptions, businessId, remoteSettings.productOptions)
                );
              }
              const inferredProductOptions = inferProductOptions(fullProducts);
              if (remoteSettings.productOptions.length === 0 && inferredProductOptions.length > 0) {
                remoteSettings.productOptions = inferredProductOptions;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.productOptions, businessId, inferredProductOptions)
                );
              }

              if (remoteCustomServices.length === 0 && remoteSettings.customServices.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.customServices, businessId, remoteSettings.customServices)
                );
              }
              const inferredCustomServices = inferCustomServices(fullOrders);
              if (remoteSettings.customServices.length === 0 && inferredCustomServices.length > 0) {
                remoteSettings.customServices = inferredCustomServices;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.customServices, businessId, inferredCustomServices)
                );
              }

              if (remoteLogisticsCarriers.length === 0 && remoteSettings.logisticsCarriers.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.logisticsCarriers, businessId, remoteSettings.logisticsCarriers)
                );
              }
              const inferredLogisticsCarrierRows = inferLogisticsCarriers(fullOrders);
              if (remoteSettings.logisticsCarriers.length === 0 && inferredLogisticsCarrierRows.length > 0) {
                remoteSettings.logisticsCarriers = inferredLogisticsCarrierRows;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.logisticsCarriers, businessId, inferredLogisticsCarrierRows)
                );
              }

              if (remoteExpenseCategories.length === 0 && remoteSettings.expenseCategories.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.expenseCategories, businessId, remoteSettings.expenseCategories)
                );
              }
              const inferredExpenseCategories = inferExpenseCategories(fullExpenses, remoteSettings.fixedCosts);
              if (remoteSettings.expenseCategories.length === 0) {
                const fallbackExpenseCategories = buildExpenseCategoryItems(DEFAULT_EXPENSE_CATEGORY_NAMES);
                const nextExpenseCategories = inferredExpenseCategories.length > 0
                  ? inferredExpenseCategories
                  : fallbackExpenseCategories;
                remoteSettings.expenseCategories = nextExpenseCategories;
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.expenseCategories, businessId, nextExpenseCategories)
                );
              }

              if (remoteCaseStatuses.length === 0 && remoteSettings.caseStatuses.length > 0) {
                restoreOps.push(
                  supabaseSettings.upsertSettings(SETTINGS_TABLES.caseStatuses, businessId, remoteSettings.caseStatuses)
                );
              }

              if (restoreOps.length > 0) {
                await Promise.all(restoreOps);
                console.log(`✅ Restored ${restoreOps.length} missing settings tables from existing business data`);
              }

              if (!isCurrentWorkspace()) return;
              const autoCompletedOrders = await runOrderAutomationAndPersist(fullOrders, {
                autoCompleteOrders: remoteSettings.autoCompleteOrders,
                autoCompleteAfterDays: remoteSettings.autoCompleteAfterDays,
                autoCompleteFromStatus: remoteSettings.autoCompleteFromStatus,
                autoCompleteToStatus: remoteSettings.autoCompleteToStatus,
                orderAutomations: remoteSettings.orderAutomations,
              }, 'full sync');

              if (!isCurrentWorkspace()) return;
              const syncTimestamp = new Date().toISOString();
              useFyllStore.setState({
                products: fullProducts,
                orders: autoCompletedOrders,
                customers: fullCustomers,
                cases: fullCases,
                returns: fullReturns,
                restockLogs: fullRestockLogs,
                procurements: fullProcurements,
                expenses: fullExpenses,
                otherIncomes: fullOtherIncomes,
                expenseRequests: fullExpenseRequests,
                refundRequests: fullRefundRequests,
                auditLogs: fullAuditLogs,
                partners: fullPartners,
                partnerJobs: fullPartnerJobs,
                partnerJobIssues: fullPartnerJobIssues,
                recycleBin: fullRecycleBin,
                categories: remoteSettings.categories,
                productVariables: remoteSettings.productVariables,
                productOptions: remoteSettings.productOptions,
                orderStatuses: remoteSettings.orderStatuses,
                saleSources: remoteSettings.saleSources,
                customServices: remoteSettings.customServices,
                paymentMethods: remoteSettings.paymentMethods,
                logisticsCarriers: remoteSettings.logisticsCarriers,
                expenseCategories: remoteSettings.expenseCategories,
                financeSuppliers: remoteSettings.financeSuppliers,
                procurementStatusOptions: remoteSettings.procurementStatusOptions,
                fixedCosts: remoteSettings.fixedCosts,
                salaryTemplates: remoteSettings.salaryTemplates,
                warehouseItems: remoteSettings.warehouseItems,
                warehouseCategories: remoteSettings.warehouseCategories,
                warehouseUnits: remoteSettings.warehouseUnits,
                qcChecklistRequirements: remoteSettings.qcChecklistRequirements,
                caseStatuses: remoteSettings.caseStatuses,
                financeRules: remoteSettings.financeRules,
                orderTimelineSettings: remoteSettings.orderTimelineSettings,
                useGlobalLowStockThreshold: remoteSettings.useGlobalLowStockThreshold,
                globalLowStockThreshold: remoteSettings.globalLowStockThreshold,
                autoCompleteOrders: remoteSettings.autoCompleteOrders,
                autoCompleteAfterDays: remoteSettings.autoCompleteAfterDays,
                autoCompleteFromStatus: remoteSettings.autoCompleteFromStatus,
                autoCompleteToStatus: remoteSettings.autoCompleteToStatus,
                orderAutomations: remoteSettings.orderAutomations,
                deliveryFollowUpEnabled: remoteSettings.deliveryFollowUpEnabled,
                deliveryFollowUpDelayDays: remoteSettings.deliveryFollowUpDelayDays,
                deliveryFollowUpResendDays: remoteSettings.deliveryFollowUpResendDays,
                deliveryFollowUpFromName: remoteSettings.deliveryFollowUpFromName,
                orderStatusEmailEnabled: remoteSettings.orderStatusEmailEnabled,
                lastDataSyncAt: syncTimestamp,
                lastFullDataSyncAt: useIncrementalDataSync ? localState.lastFullDataSyncAt : syncTimestamp,
              });
              prevProductIds.current = toIdSet(fullProducts);
              prevOrderIds.current = toIdSet(autoCompletedOrders);
              prevCustomerIds.current = toIdSet(fullCustomers);
              prevCaseIds.current = toIdSet(fullCases);
              prevReturnIds.current = toIdSet(fullReturns);
              prevRestockIds.current = toIdSet(fullRestockLogs);
              prevProcurementIds.current = toIdSet(fullProcurements);
              prevExpenseIds.current = toIdSet(fullExpenses);
              prevOtherIncomeIds.current = toIdSet(fullOtherIncomes);
              prevExpenseRequestIds.current = toIdSet(fullExpenseRequests);
              prevRefundRequestIds.current = toIdSet(fullRefundRequests);
              prevAuditLogIds.current = toIdSet(fullAuditLogs);
              prevPartnerIds.current = toIdSet(fullPartners);
              prevPartnerJobIds.current = toIdSet(fullPartnerJobs);
              prevPartnerJobIssueIds.current = toIdSet(fullPartnerJobIssues);
              prevRecycleBinIds.current = toIdSet(fullRecycleBin);
              prevOrderStatusIds.current = toIdSet(remoteSettings.orderStatuses);
              prevSaleSourceIds.current = toIdSet(remoteSettings.saleSources);
              prevCustomServiceIds.current = toIdSet(remoteSettings.customServices);
              prevPaymentMethodIds.current = toIdSet(remoteSettings.paymentMethods);
              prevLogisticsCarrierIds.current = toIdSet(remoteSettings.logisticsCarriers);
              prevProductVariableIds.current = toIdSet(remoteSettings.productVariables);
              prevProductOptionIds.current = toIdSet(remoteSettings.productOptions);
              prevExpenseCategoryIds.current = toIdSet(remoteSettings.expenseCategories);
              prevCategoryIds.current = toIdSet(buildCategoryItems(remoteSettings.categories));
              prevCaseStatusIds.current = toIdSet(remoteSettings.caseStatuses);
              applyingRemote.current = false;
            }
          } catch (wave2Error) {
            console.warn('Wave 2 background sync failed (non-fatal):', wave2Error);
          } finally {
            if (isCurrentWorkspace()) useFyllStore.getState().setIsBackgroundSyncing(false);
          }
        }

        fullSyncSucceeded = true;
      } catch (error) {
        console.warn('Supabase sync failed:', error);
      } finally {
        if (unblockTimeout) {
          clearTimeout(unblockTimeout);
        }
        syncingRef.current = false;
        lastRealtimeAt.current = Date.now();
        if (isCurrentWorkspace()) {
          if (fullSyncSucceeded) {
            setIsInitialized(true);
          }
          setIsSyncing(false);
        }
      }
    };

    const drainQueue = async () => {
      if (drainRunningRef.current) return;
      drainRunningRef.current = true;
      try {
        // Drain until no pending work; avoids missing realtime updates when events arrive mid-sync.
        while (isCurrentWorkspace()) {
          if (syncingRef.current) break;

          if (pendingFullSyncRef.current) {
            pendingFullSyncRef.current = false;
            await syncAll();
            continue;
          }

          const next = pendingRealtimeTablesRef.current.values().next();
          if (next.done) break;
          pendingRealtimeTablesRef.current.delete(next.value);
          await syncTable(next.value);
        }
      } finally {
        drainRunningRef.current = false;
      }
    };

    const requestTableSync = (table: string) => {
      pendingRealtimeTablesRef.current.add(table);
      void drainQueue();
    };

    const requestFullSync = () => {
      pendingFullSyncRef.current = true;
      void drainQueue();
    };

    requestFullSync();

    // Fallback sync (only if realtime is quiet) to reduce egress.
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      // Keep order automation progressing even on busy teams by periodically
      // refreshing orders, independent of full-sync quiet windows.
      if (now - lastAutomationSweepAt.current >= 15 * 60 * 1000) {
        lastAutomationSweepAt.current = now;
        requestTableSync(TABLES.orders);
      }
      if (now - lastRealtimeAt.current < 10 * 60 * 1000) return;
      requestFullSync();
    }, 5 * 60 * 1000);

    const dataChannel = supabase.channel(`data-${businessId}`);
    ACTIVE_DATA_TABLES.forEach((table) => {
      dataChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          if (!applyRealtimeDataPayload(table, payload)) {
            requestTableSync(table);
          }
        }
      );
    });
    dataChannel.subscribe();

    const settingsChannel = supabase.channel(`settings-${businessId}`);
    Object.values(SETTINGS_TABLES).forEach((table) => {
      settingsChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `business_id=eq.${businessId}`,
        },
        (_payload) => {
          requestTableSync(table);
        }
      );
    });
    settingsChannel.subscribe();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      supabase.removeChannel(dataChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [businessId, isAuthenticated, isOfflineMode]);

  // Pause/resume sync based on app state to reduce egress
  useEffect(() => {
    if (!isAuthenticated || !businessId || isOfflineMode) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background - clear the fallback interval to stop polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        console.log('🛑 Sync paused: app in background');
      } else if (nextAppState === 'active') {
        // App coming to foreground - realtime channels stay active, just note it
        console.log('✅ App active: realtime channels still active, fallback sync not needed');
        // Note: We don't need to restart the interval here because:
        // 1. Realtime channels remain active and will trigger syncs
        // 2. The main useEffect will handle setting up intervals
        // 3. This prevents duplicate intervals
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [businessId, isAuthenticated, isOfflineMode]);

  // SAFETY: Never bulk-delete ALL items from Supabase. If the local list goes
  // from N items to 0 that is always a store reset / logout, never a legitimate
  // user action. Skipping prevents accidental data wipe.
  const safeSyncDeletions = useCallback((
    table: string,
    nextIds: Set<string>,
    prevIds: RefObject<Set<string>>,
    label: string,
  ) => {
    const removed = [...prevIds.current].filter((id) => !nextIds.has(id));
    prevIds.current = nextIds;

    // If EVERYTHING was removed (going to 0) and there were items before,
    // this is a store reset — NOT legitimate deletions. Block it.
    if (nextIds.size === 0 && removed.length > 0) {
      console.warn(`🛡️ Blocked bulk deletion of ALL ${removed.length} ${label} — likely a store reset`);
      return;
    }

    // Critical safety rule:
    // Never auto-delete data rows from passive/background sync diffs.
    // Explicit delete actions already remove rows remotely.
    if (removed.length > 0) {
      console.warn(`🛡️ Skipped auto-delete of ${removed.length} ${label} (${table}) from background sync`);
    }
  }, []);

  const safeSyncSettingsDeletion = useCallback((
    table: string,
    ids: string[],
    label: string,
    remainingCount: number,
  ) => {
    if (!businessId || ids.length === 0) return;
    if (remainingCount === 0) {
      console.warn(`🛡️ Blocked bulk deletion of ALL ${label} — likely a store reset`);
      return;
    }

    // Critical safety rule:
    // Never delete settings rows from passive/background sync. If local cache is
    // partial (e.g. hydration/race conditions), auto-delete can remove valid
    // business configuration from Supabase. Settings cleanup should only happen
    // from explicit user actions (Settings screens / save flows).
    console.warn(`🛡️ Skipped auto-delete of ${ids.length} ${label} (${table}) from background sync`);
  }, [businessId]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.products, toIdSet(products), prevProductIds, 'products');
  }, [products, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.orders, toIdSet(orders), prevOrderIds, 'orders');
  }, [orders, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.customers, toIdSet(customers), prevCustomerIds, 'customers');
  }, [customers, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.restockLogs, toIdSet(restockLogs), prevRestockIds, 'restock logs');
  }, [restockLogs, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!SYNC_FINANCE_TABLES) return;
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.procurements, toIdSet(procurements), prevProcurementIds, 'procurements');
  }, [procurements, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!SYNC_FINANCE_TABLES) return;
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.expenses, toIdSet(expenses), prevExpenseIds, 'expenses');
  }, [expenses, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!SYNC_FINANCE_TABLES) return;
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.otherIncomes, toIdSet(otherIncomes), prevOtherIncomeIds, 'other income');
  }, [otherIncomes, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!SYNC_FINANCE_TABLES) return;
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.expenseRequests, toIdSet(expenseRequests), prevExpenseRequestIds, 'expense requests');
  }, [expenseRequests, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!SYNC_FINANCE_TABLES) return;
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.refundRequests, toIdSet(refundRequests), prevRefundRequestIds, 'refund requests');
  }, [refundRequests, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.cases, toIdSet(cases), prevCaseIds, 'cases');
  }, [cases, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.returns, toIdSet(returns), prevReturnIds, 'returns');
  }, [returns, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.partners, toIdSet(partners), prevPartnerIds, 'partners');
  }, [partners, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.partnerJobs, toIdSet(partnerJobs), prevPartnerJobIds, 'partner jobs');
  }, [partnerJobs, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.partnerJobIssues, toIdSet(partnerJobIssues), prevPartnerJobIssueIds, 'partner job issues');
  }, [partnerJobIssues, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;

    const nextIds = toIdSet(auditLogs);
    const removed = [...prevAuditLogIds.current].filter((id) => !nextIds.has(id));
    const added = auditLogs.filter((log) => !prevAuditLogIds.current.has(log.id));

    // Block bulk wipe (same safety as above)
    if (nextIds.size === 0 && removed.length > 0) {
      console.warn(`🛡️ Blocked bulk deletion of ALL ${removed.length} audit logs — likely a store reset`);
      prevAuditLogIds.current = nextIds;
      return;
    }
    prevAuditLogIds.current = nextIds;

    if (added.length > 0) {
      supabaseData
        .upsertCollection(TABLES.auditLogs, businessId, added)
        .catch((error) => console.warn('Supabase audit log upsert error:', error));
    }

    if (removed.length > 0) {
      supabaseData
        .deleteByIds(TABLES.auditLogs, businessId, removed)
        .catch((error) => console.warn('Supabase audit log delete error:', error));
    }
  }, [auditLogs, businessId, isInitialized, isOfflineMode, isBackgroundSyncing]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    safeSyncDeletions(TABLES.deletedItems, toIdSet(recycleBin), prevRecycleBinIds, 'recycle bin items');
  }, [recycleBin, businessId, isInitialized, isOfflineMode, isBackgroundSyncing, safeSyncDeletions]);

  useEffect(() => {
    if (!isInitialized || !businessId || isOfflineMode || applyingRemote.current || isBackgroundSyncing) return;
    if (!hasHydratedBusinessSettingsRef.current) return;
    if (!hasLoadedRemoteBusinessSettingsRef.current) return;

    const nextOrderStatusIds = toIdSet(orderStatuses);
    const removedOrderStatuses = [...prevOrderStatusIds.current].filter((id) => !nextOrderStatusIds.has(id));
    prevOrderStatusIds.current = nextOrderStatusIds;

    const nextSaleSourceIds = toIdSet(saleSources);
    const removedSaleSources = [...prevSaleSourceIds.current].filter((id) => !nextSaleSourceIds.has(id));
    prevSaleSourceIds.current = nextSaleSourceIds;

    const nextCustomServiceIds = toIdSet(customServices);
    const removedCustomServices = [...prevCustomServiceIds.current].filter((id) => !nextCustomServiceIds.has(id));
    prevCustomServiceIds.current = nextCustomServiceIds;

    const nextPaymentMethodIds = toIdSet(paymentMethods);
    const removedPaymentMethods = [...prevPaymentMethodIds.current].filter((id) => !nextPaymentMethodIds.has(id));
    prevPaymentMethodIds.current = nextPaymentMethodIds;

    const nextLogisticsCarrierIds = toIdSet(logisticsCarriers);
    const removedLogisticsCarriers = [...prevLogisticsCarrierIds.current].filter((id) => !nextLogisticsCarrierIds.has(id));
    prevLogisticsCarrierIds.current = nextLogisticsCarrierIds;

    const nextProductVariableIds = toIdSet(productVariables);
    const removedProductVariables = [...prevProductVariableIds.current].filter((id) => !nextProductVariableIds.has(id));
    prevProductVariableIds.current = nextProductVariableIds;

    const nextProductOptionIds = toIdSet(productOptions);
    const removedProductOptions = [...prevProductOptionIds.current].filter((id) => !nextProductOptionIds.has(id));
    prevProductOptionIds.current = nextProductOptionIds;

    const nextExpenseCategoryIds = toIdSet(expenseCategories);
    const removedExpenseCategories = [...prevExpenseCategoryIds.current].filter((id) => !nextExpenseCategoryIds.has(id));
    prevExpenseCategoryIds.current = nextExpenseCategoryIds;

    const nextCaseStatusIds = toIdSet(caseStatuses);
    const removedCaseStatuses = [...prevCaseStatusIds.current].filter((id) => !nextCaseStatusIds.has(id));
    prevCaseStatusIds.current = nextCaseStatusIds;

    const categoryItems = buildCategoryItems(categories);
    const nextCategoryIds = toIdSet(categoryItems);
    const removedCategories = [...prevCategoryIds.current].filter((id) => !nextCategoryIds.has(id));
    prevCategoryIds.current = nextCategoryIds;
    const normalizedOrderAutomations = normalizeOrderAutomations(orderAutomations ?? [], {
      autoCompleteAfterDays,
      autoCompleteFromStatus,
      autoCompleteToStatus,
    });
    const legacyAutomation = resolveLegacyAutomationFields(normalizedOrderAutomations);

    const businessSettings = {
      id: 'global',
      useGlobalLowStockThreshold,
      globalLowStockThreshold,
      autoCompleteOrders,
      autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
      autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
      autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
      orderAutomations: normalizedOrderAutomations,
      deliveryFollowUpEnabled,
      deliveryFollowUpDelayDays,
      deliveryFollowUpResendDays,
      deliveryFollowUpFromName,
      orderStatusEmailEnabled,
      orderTimelineSettings,
      financeSuppliers,
      procurementStatusOptions,
      fixedCosts,
      salaryTemplates,
      warehouseItems,
      warehouseCategories,
      warehouseUnits,
      qcChecklistRequirements: sanitizeOrderQcRequirements(qcChecklistRequirements, false),
      financeRules,
    };

    const settingsSignature = JSON.stringify({
      businessId,
      categories: sortById(categoryItems),
      productVariables: sortById(productVariables),
      productOptions: sortById(productOptions),
      orderStatuses: sortById(orderStatuses),
      saleSources: sortById(saleSources),
      customServices: sortById(customServices),
      paymentMethods: sortById(paymentMethods),
      logisticsCarriers: sortById(logisticsCarriers),
      expenseCategories: sortById(expenseCategories),
      caseStatuses: sortById(caseStatuses),
      useGlobalLowStockThreshold,
      globalLowStockThreshold,
      autoCompleteOrders,
      autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
      autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
      autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
      orderAutomations: normalizedOrderAutomations,
      deliveryFollowUpEnabled,
      deliveryFollowUpDelayDays,
      deliveryFollowUpResendDays,
      deliveryFollowUpFromName,
      orderStatusEmailEnabled,
      orderTimelineSettings,
      financeSuppliers: sortById(financeSuppliers),
      procurementStatusOptions: sortById(procurementStatusOptions),
      fixedCosts: sortById(fixedCosts),
      salaryTemplates: sortById(salaryTemplates),
      warehouseItems: sortById(warehouseItems),
      warehouseCategories: sortById(warehouseCategories),
      warehouseUnits: sortById(warehouseUnits),
      qcChecklistRequirements: sortByKey(sanitizeOrderQcRequirements(qcChecklistRequirements, false)),
      financeRules,
    });

    if (
      settingsSignature === lastSettingsSyncSignatureRef.current
      || settingsSignature === pendingSettingsSyncSignatureRef.current
    ) {
      return;
    }

    pendingSettingsSyncSignatureRef.current = settingsSignature;

    Promise.all([
      supabaseSettings.upsertSettings(SETTINGS_TABLES.orderStatuses, businessId, orderStatuses),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.saleSources, businessId, saleSources),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.customServices, businessId, customServices),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.paymentMethods, businessId, paymentMethods),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.logisticsCarriers, businessId, logisticsCarriers),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.productVariables, businessId, productVariables),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.productOptions, businessId, productOptions),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.expenseCategories, businessId, expenseCategories),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.caseStatuses, businessId, caseStatuses),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.productCategories, businessId, categoryItems),
      supabaseSettings.upsertSettings(SETTINGS_TABLES.businessSettings, businessId, [businessSettings]),
    ])
      .then(() => {
        lastSettingsSyncSignatureRef.current = settingsSignature;
      })
      .catch((error) => {
        console.warn('Supabase settings sync error:', error);
      })
      .finally(() => {
        if (pendingSettingsSyncSignatureRef.current === settingsSignature) {
          pendingSettingsSyncSignatureRef.current = null;
        }
      });

    safeSyncSettingsDeletion(SETTINGS_TABLES.orderStatuses, removedOrderStatuses, 'order statuses', orderStatuses.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.saleSources, removedSaleSources, 'sale sources', saleSources.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.customServices, removedCustomServices, 'custom services', customServices.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.paymentMethods, removedPaymentMethods, 'payment methods', paymentMethods.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.logisticsCarriers, removedLogisticsCarriers, 'logistics carriers', logisticsCarriers.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.productVariables, removedProductVariables, 'product variables', productVariables.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.productOptions, removedProductOptions, 'product options', productOptions.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.expenseCategories, removedExpenseCategories, 'expense categories', expenseCategories.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.caseStatuses, removedCaseStatuses, 'case statuses', caseStatuses.length);
    safeSyncSettingsDeletion(SETTINGS_TABLES.productCategories, removedCategories, 'categories', categoryItems.length);
  }, [
    categories,
    productVariables,
    productOptions,
    orderStatuses,
    saleSources,
    customServices,
    orderTimelineSettings,
    paymentMethods,
    logisticsCarriers,
    expenseCategories,
    caseStatuses,
    useGlobalLowStockThreshold,
    globalLowStockThreshold,
    autoCompleteOrders,
    autoCompleteAfterDays,
    autoCompleteFromStatus,
    autoCompleteToStatus,
    orderAutomations,
    financeSuppliers,
    procurementStatusOptions,
    fixedCosts,
    salaryTemplates,
    warehouseItems,
    warehouseCategories,
    warehouseUnits,
    qcChecklistRequirements,
    financeRules,
    businessId,
    isInitialized,
    isOfflineMode,
    isBackgroundSyncing,
    safeSyncSettingsDeletion,
  ]);

  return { isInitialized, isSyncing };
}
