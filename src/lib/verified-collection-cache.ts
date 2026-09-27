import { Platform } from 'react-native';
import { storage } from '@/lib/storage';
import type { Order, Product } from '@/lib/state/fyll-store';

const CACHE_SCHEMA_VERSION = 1;
const DATABASE_NAME = 'fyll-verified-data';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const NATIVE_KEY_PREFIX = 'fyll:verified-data:';

export interface VerifiedCoreCollectionsSnapshot {
  schemaVersion: number;
  businessId: string;
  updatedAt: string;
  products: Product[];
  orders: Order[];
}

export interface VerifiedThreadListItem {
  threadId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  orderStatus: string;
  isClosed: boolean;
}

interface VerifiedThreadSnapshot {
  schemaVersion: number;
  businessId: string;
  updatedAt: string;
  items: VerifiedThreadListItem[];
}

const coreKey = (businessId: string) => `core:${businessId}`;
const threadsKey = (businessId: string) => `threads:${businessId}`;

const stripDataUris = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim().startsWith('data:')) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripDataUris(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;

  const sanitized: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    const next = stripDataUris(nested);
    if (next !== undefined) sanitized[key] = next;
  });
  return sanitized;
};

const isValidBaseRecord = (value: unknown, businessId: string): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === CACHE_SCHEMA_VERSION
    && record.businessId === businessId
    && typeof record.updatedAt === 'string';
};

const openDatabase = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
  if (typeof indexedDB === 'undefined') {
    resolve(null);
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
  request.onblocked = () => resolve(null);
});

const readRaw = async (key: string): Promise<unknown> => {
  if (Platform.OS !== 'web') {
    const raw = await storage.getItem(`${NATIVE_KEY_PREFIX}${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  }).finally(() => database.close());
};

const writeRaw = async (key: string, value: unknown): Promise<void> => {
  const sanitized = stripDataUris(value);
  if (Platform.OS !== 'web') {
    await storage.setItem(`${NATIVE_KEY_PREFIX}${key}`, JSON.stringify(sanitized));
    return;
  }

  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(sanitized, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
  database.close();
};

export const readVerifiedCoreCollections = async (
  businessId: string
): Promise<VerifiedCoreCollectionsSnapshot | null> => {
  const value = await readRaw(coreKey(businessId));
  if (!isValidBaseRecord(value, businessId)) return null;
  if (!Array.isArray(value.products) || !Array.isArray(value.orders)) return null;
  return value as unknown as VerifiedCoreCollectionsSnapshot;
};

export const writeVerifiedCoreCollections = async (input: {
  businessId: string;
  products: Product[];
  orders: Order[];
  updatedAt?: string;
}): Promise<void> => writeRaw(coreKey(input.businessId), {
  schemaVersion: CACHE_SCHEMA_VERSION,
  businessId: input.businessId,
  updatedAt: input.updatedAt ?? new Date().toISOString(),
  products: input.products,
  orders: input.orders,
} satisfies VerifiedCoreCollectionsSnapshot);

export const readVerifiedThreadItems = async (
  businessId: string
): Promise<VerifiedThreadListItem[] | null> => {
  const value = await readRaw(threadsKey(businessId));
  if (!isValidBaseRecord(value, businessId) || !Array.isArray(value.items)) return null;
  return (value as unknown as VerifiedThreadSnapshot).items;
};

export const writeVerifiedThreadItems = async (
  businessId: string,
  items: VerifiedThreadListItem[]
): Promise<void> => writeRaw(threadsKey(businessId), {
  schemaVersion: CACHE_SCHEMA_VERSION,
  businessId,
  updatedAt: new Date().toISOString(),
  items,
} satisfies VerifiedThreadSnapshot);
