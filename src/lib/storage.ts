import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cross-platform storage adapter for web and mobile
const isServer = typeof window === 'undefined' || typeof localStorage === 'undefined';
const FYLL_STORAGE_KEY = 'fyll-storage';
const MAX_SAFE_WEB_STORAGE_SIZE = 4_500_000;
const WEB_PREVIEW_LIMIT = 50;
const FYLL_COLLECTION_LIMITS: Record<string, number> = {
  products: 50,
  orders: 50,
  customers: 50,
  cases: 25,
  restockLogs: 10,
  procurements: 10,
  expenses: 10,
  otherIncomes: 10,
  expenseRequests: 10,
  refundRequests: 10,
  warehouseItems: 25,
  auditLogs: 25,
  recycleBin: 25,
};

const toPreviewArray = <T>(value: unknown, limit: number): T[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit) as T[];
};

const isDataUri = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().startsWith('data:')
);

const stripDataUris = (value: unknown): unknown => {
  if (isDataUri(value)) return undefined;
  if (Array.isArray(value)) return value.map((item) => stripDataUris(item));
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    const sanitized = stripDataUris(nested);
    if (sanitized !== undefined) {
      next[key] = sanitized;
    }
  });
  return next;
};

const compactFyllStoragePayload = (rawValue: string): string | null => {
  try {
    const parsed = JSON.parse(rawValue) as { state?: Record<string, unknown>; version?: number };
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return null;
    }

    const compactState = stripDataUris(parsed.state) as Record<string, unknown>;
    Object.entries(FYLL_COLLECTION_LIMITS).forEach(([key, limit]) => {
      compactState[key] = toPreviewArray(parsed.state?.[key], limit)
        .map((item) => stripDataUris(item));
    });

    return JSON.stringify({ ...parsed, state: compactState });
  } catch {
    return null;
  }
};

const createMinimalFyllStoragePayload = (rawValue: string): string | null => {
  try {
    const parsed = JSON.parse(rawValue) as { state?: Record<string, unknown>; version?: number };
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return null;
    }

    const state = parsed.state;
    const minimalState = {
      themeMode: state.themeMode,
      userRole: state.userRole,
      lastDataSyncAt: state.lastDataSyncAt,
      lastFullDataSyncAt: state.lastFullDataSyncAt,
      useGlobalLowStockThreshold: state.useGlobalLowStockThreshold,
      globalLowStockThreshold: state.globalLowStockThreshold,
      autoCompleteOrders: state.autoCompleteOrders,
      autoCompleteAfterDays: state.autoCompleteAfterDays,
      autoCompleteFromStatus: state.autoCompleteFromStatus,
      autoCompleteToStatus: state.autoCompleteToStatus,
      orderAutomations: state.orderAutomations,
      categories: state.categories,
      productVariables: state.productVariables,
      orderStatuses: state.orderStatuses,
      saleSources: state.saleSources,
      customServices: state.customServices,
      paymentMethods: state.paymentMethods,
      logisticsCarriers: state.logisticsCarriers,
      expenseCategories: state.expenseCategories,
      financeSuppliers: state.financeSuppliers,
      procurementStatusOptions: state.procurementStatusOptions,
      fixedCosts: state.fixedCosts,
      salaryTemplates: state.salaryTemplates,
      warehouseCategories: state.warehouseCategories,
      warehouseUnits: state.warehouseUnits,
      financeRules: state.financeRules,
      caseStatuses: state.caseStatuses,
    };

    return JSON.stringify({ ...parsed, state: stripDataUris(minimalState) });
  } catch {
    return null;
  }
};

const setFyllStorageWithFallback = (value: string): boolean => {
  const attempts = [value, compactFyllStoragePayload(value), createMinimalFyllStoragePayload(value)]
    .filter((entry): entry is string => Boolean(entry));

  for (const attempt of attempts) {
    try {
      localStorage.removeItem(FYLL_STORAGE_KEY);
      localStorage.setItem(FYLL_STORAGE_KEY, attempt);
      return true;
    } catch {
      // Try the next, smaller payload.
    }
  }

  try {
    localStorage.removeItem(FYLL_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

export const storage = Platform.OS === 'web'
  ? {
      getItem: async (key: string) => {
        try {
          if (isServer) return null;
          const value = localStorage.getItem(key);
          if (key === FYLL_STORAGE_KEY && value && value.length > MAX_SAFE_WEB_STORAGE_SIZE) {
            const compact = compactFyllStoragePayload(value);
            if (compact) {
              setFyllStorageWithFallback(compact);
              return compact;
            }
            return value;
          }
          return value;
        } catch (e) {
          console.error('localStorage getItem error:', e);
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          if (isServer) return;
          localStorage.setItem(key, value);
        } catch (e) {
          if (!isServer && key === FYLL_STORAGE_KEY) {
            const recovered = setFyllStorageWithFallback(value);
            if (recovered) return;
          }
          console.error('localStorage setItem error:', e);
        }
      },
      removeItem: async (key: string) => {
        try {
          if (isServer) return;
          localStorage.removeItem(key);
        } catch (e) {
          console.error('localStorage removeItem error:', e);
        }
      },
    }
  : AsyncStorage;
