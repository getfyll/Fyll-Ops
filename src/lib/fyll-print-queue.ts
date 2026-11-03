import { storage } from '@/lib/storage';
import { generateQrSvg } from '@/lib/qrcode';
import type { Product, ProductVariant } from '@/lib/state/fyll-store';
import type { OrderLabelData } from '@/components/labels/OrderLabel80x90';
import { FYLL_WORDMARK_DATA_URI } from '@/lib/fyll-wordmark';
import { expandParcels } from '@/lib/shipping-label-options';
import { ORDER_LABEL_CSS, renderOrderLabelMarkup } from '@/components/labels/OrderLabel80x90';

export type FyllPrintCategory = 'inventory' | 'shipping';

export type FyllPrintLabelSize = {
  widthMm: number;
  heightMm: number;
  label: string;
};

export type FyllPrintInventoryItem = {
  id: string;
  category: 'inventory';
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string;
  // How many copies of this label to print. Missing means 1 (items queued before copies existed).
  copies?: number;
  labelSize: FyllPrintLabelSize;
  createdAt: string;
};

export type FyllPrintShippingItem = {
  id: string;
  category: 'shipping';
  orderId: string;
  orderNumber: string;
  customerName: string;
  destination: string;
  carrierName: string;
  labelData: OrderLabelData;
  labelSize: FyllPrintLabelSize;
  createdAt: string;
};

export type FyllPrintQueueItem = FyllPrintInventoryItem | FyllPrintShippingItem;

export type FyllPrintHistoryItem = {
  id: string;
  category: FyllPrintCategory;
  action: 'print' | 'download';
  itemCount: number;
  createdAt: string;
};

export type FyllPrintQueueState = {
  inventory: FyllPrintInventoryItem[];
  shipping: FyllPrintShippingItem[];
  history: Record<FyllPrintCategory, FyllPrintHistoryItem[]>;
};

export const FYLL_PRINT_QUEUE_STORAGE_KEY = 'fyll_print_queue_v1';
export const getFyllPrintQueueStorageKey = (businessId?: string | null) => (
  businessId ? `${FYLL_PRINT_QUEUE_STORAGE_KEY}:${businessId}` : FYLL_PRINT_QUEUE_STORAGE_KEY
);

export const FYLL_PRINT_CATEGORY_META: Record<FyllPrintCategory, {
  label: string;
  shortLabel: string;
  dimensions: string;
  reminder: string;
  paperLabel: string;
}> = {
  inventory: {
    label: 'Inventory/Product Labels',
    shortLabel: 'Inventory',
    dimensions: '50x30mm',
    paperLabel: '50x30mm barcode label roll',
    reminder: 'Reminder: Please ensure the 50x30mm barcode label roll is loaded.',
  },
  shipping: {
    label: 'Shipping/Delivery Labels',
    shortLabel: 'Shipping',
    dimensions: '100x150mm',
    paperLabel: '100x150mm (4x6") shipping label roll',
    reminder: 'Reminder: Please ensure the 100x150mm (4x6") label roll is loaded.',
  },
};

export const INVENTORY_QUEUE_LABEL_SIZE: FyllPrintLabelSize = {
  widthMm: 50,
  heightMm: 30,
  label: FYLL_PRINT_CATEGORY_META.inventory.dimensions,
};

export const SHIPPING_QUEUE_LABEL_SIZE: FyllPrintLabelSize = {
  widthMm: 100,
  heightMm: 150,
  label: FYLL_PRINT_CATEGORY_META.shipping.dimensions,
};

const EMPTY_PRINT_QUEUE: FyllPrintQueueState = {
  inventory: [],
  shipping: [],
  history: {
    inventory: [],
    shipping: [],
  },
};

const printQueueCache = new Map<string, FyllPrintQueueState>();

export const getCachedFyllPrintQueue = (businessId?: string | null): FyllPrintQueueState | undefined => (
  printQueueCache.get(getFyllPrintQueueStorageKey(businessId))
);

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeQueue = (value: unknown): FyllPrintQueueState => {
  if (!value || typeof value !== 'object') return EMPTY_PRINT_QUEUE;
  const queue = value as Partial<FyllPrintQueueState>;
  return {
    // Force stored items onto the current standard label sizes — older queued items
    // (saved before the shipping label size changed) would otherwise keep printing
    // at whatever size was active when they were added to the queue.
    inventory: Array.isArray(queue.inventory)
      ? queue.inventory.map((item) => ({ ...item, labelSize: INVENTORY_QUEUE_LABEL_SIZE }))
      : [],
    shipping: Array.isArray(queue.shipping)
      ? queue.shipping.map((item) => ({ ...item, labelSize: SHIPPING_QUEUE_LABEL_SIZE }))
      : [],
    history: {
      inventory: Array.isArray(queue.history?.inventory) ? queue.history.inventory : [],
      shipping: Array.isArray(queue.history?.shipping) ? queue.history.shipping : [],
    },
  };
};

export const getFyllPrintQueue = async (businessId?: string | null): Promise<FyllPrintQueueState> => {
  const storageKey = getFyllPrintQueueStorageKey(businessId);
  const cached = printQueueCache.get(storageKey);
  if (cached) return cached;

  const raw = await storage.getItem(storageKey);
  if (!raw) {
    printQueueCache.set(storageKey, EMPTY_PRINT_QUEUE);
    return EMPTY_PRINT_QUEUE;
  }

  try {
    const queue = normalizeQueue(JSON.parse(raw));
    printQueueCache.set(storageKey, queue);
    return queue;
  } catch {
    printQueueCache.set(storageKey, EMPTY_PRINT_QUEUE);
    return EMPTY_PRINT_QUEUE;
  }
};

export const saveFyllPrintQueue = async (queue: FyllPrintQueueState, businessId?: string | null) => {
  const storageKey = getFyllPrintQueueStorageKey(businessId);
  await storage.setItem(storageKey, JSON.stringify(queue));
  printQueueCache.set(storageKey, queue);
};

export const addFyllPrintQueueItem = async (item: FyllPrintQueueItem, businessId?: string | null): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue(businessId);
  const current = queue[item.category] as FyllPrintQueueItem[];
  const nextItems = [item, ...current.filter((queued) => queued.id !== item.id)];
  const nextQueue = {
    ...queue,
    [item.category]: nextItems,
  } as FyllPrintQueueState;
  await saveFyllPrintQueue(nextQueue, businessId);
  return nextQueue;
};

export const removeFyllPrintQueueItem = async (
  category: FyllPrintCategory,
  itemId: string,
  businessId?: string | null,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue(businessId);
  const nextQueue = {
    ...queue,
    [category]: queue[category].filter((item) => item.id !== itemId),
  };
  await saveFyllPrintQueue(nextQueue, businessId);
  return nextQueue;
};

export const setFyllPrintQueueItemCopies = async (
  itemId: string,
  copies: number,
  businessId?: string | null,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue(businessId);
  const nextCopies = Math.max(1, Math.min(MAX_INVENTORY_COPIES, Math.floor(copies)));
  const nextQueue = {
    ...queue,
    inventory: queue.inventory.map((item) => (item.id === itemId ? { ...item, copies: nextCopies } : item)),
  };
  await saveFyllPrintQueue(nextQueue, businessId);
  return nextQueue;
};

export const clearFyllPrintQueueCategory = async (
  category: FyllPrintCategory,
  businessId?: string | null,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue(businessId);
  const nextQueue = {
    ...queue,
    [category]: [],
  };
  await saveFyllPrintQueue(nextQueue, businessId);
  return nextQueue;
};

export const recordFyllPrintHistory = async (
  category: FyllPrintCategory,
  action: FyllPrintHistoryItem['action'],
  itemCount: number,
  businessId?: string | null,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue(businessId);
  const nextHistoryItem: FyllPrintHistoryItem = {
    id: `${category}:${action}:${Date.now()}`,
    category,
    action,
    itemCount,
    createdAt: new Date().toISOString(),
  };
  const nextQueue: FyllPrintQueueState = {
    ...queue,
    history: {
      ...queue.history,
      [category]: [nextHistoryItem, ...queue.history[category]].slice(0, 25),
    },
  };
  await saveFyllPrintQueue(nextQueue, businessId);
  return nextQueue;
};

const getVariantName = (variant: ProductVariant) => Object.values(variant.variableValues).filter(Boolean).join(' - ');

export const getShippingItemParcels = (item: FyllPrintShippingItem): number => (
  Math.max(1, Math.min(9, Math.floor(item.labelData.parcelCount ?? 1)))
);

export const MAX_INVENTORY_COPIES = 99;
export const getInventoryItemCopies = (item: FyllPrintInventoryItem): number => (
  Math.max(1, Math.min(MAX_INVENTORY_COPIES, Math.floor(item.copies ?? 1)))
);
// One entry per copy, in queue order, for printing.
export const expandInventoryCopies = (items: FyllPrintInventoryItem[]): FyllPrintInventoryItem[] => (
  items.flatMap((item) => Array.from({ length: getInventoryItemCopies(item) }, () => item))
);

export const createInventoryPrintQueueItems = (
  product: Product,
  variants: ProductVariant[],
  copiesByVariantId?: Record<string, number>,
): FyllPrintInventoryItem[] => variants.map((variant) => {
  const variantName = getVariantName(variant);
  return {
    id: `inventory:${product.id}:${variant.id}`,
    category: 'inventory',
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    variantName,
    sku: variant.sku || '',
    barcode: variant.barcode || variant.sku || '',
    copies: Math.max(1, Math.min(MAX_INVENTORY_COPIES, Math.floor(copiesByVariantId?.[variant.id] ?? 1))),
    labelSize: INVENTORY_QUEUE_LABEL_SIZE,
    createdAt: new Date().toISOString(),
  };
});

export const createShippingPrintQueueItem = (input: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  destination: string;
  carrierName: string;
  labelData: OrderLabelData;
}): FyllPrintShippingItem => ({
  id: `shipping:${input.orderId}`,
  category: 'shipping',
  orderId: input.orderId,
  orderNumber: input.orderNumber,
  customerName: input.customerName,
  destination: input.destination,
  carrierName: input.carrierName,
  labelData: input.labelData,
  labelSize: SHIPPING_QUEUE_LABEL_SIZE,
  createdAt: new Date().toISOString(),
});

export const mmToPrintPoints = (mm: number) => Math.round(mm * 2.83465);

export const buildInventoryQueueHtml = (queuedItems: FyllPrintInventoryItem[]): string => {
  const size = INVENTORY_QUEUE_LABEL_SIZE;
  const qrSizeMm = 20;
  const items = expandInventoryCopies(queuedItems);
  const labels = items.map((item, index) => {
    const qrSvg = item.barcode ? generateQrSvg(item.barcode, Math.round(qrSizeMm * 1.8)) : '';
    const pageBreak = index < items.length - 1 ? 'page-break-after: always;' : '';
    const codeText = item.barcode || item.sku;
    const codeLine = item.sku && item.barcode && item.sku !== item.barcode ? `${item.sku} · ${item.barcode}` : codeText;
    return `
      <div class="label-page" style="${pageBreak}">
        <div class="label">
          <table class="row-table"><tr>
            <td class="qr-cell">
              <div class="qr-wrap">${qrSvg.replace('<svg ', '<svg class="qr" ')}</div>
            </td>
            <td class="text-cell">
              <div class="title">${escapeHtml(item.productName)}</div>
              ${item.variantName ? `<div class="variant">${escapeHtml(item.variantName)}</div>` : ''}
              ${codeLine ? `<div class="code-line">${escapeHtml(codeLine)}</div>` : ''}
            </td>
          </tr></table>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            width: ${size.widthMm}mm;
            height: ${size.heightMm}mm;
            background: #fff;
            color: #000;
          }
          /*
            Layout uses a plain HTML table, not Flexbox or CSS Grid — iOS's native print/PDF
            export pipeline (used when saving to Files or sharing a PDF from the system print
            sheet) has proven unreliable with both. Tables are the one technique with truly
            universal support across PDF renderers.
          */
          .label-page {
            width: ${size.widthMm}mm;
            height: ${size.heightMm}mm;
            padding: 1.3mm;
            overflow: hidden;
          }
          .label-page:last-child { page-break-after: auto; }
          .label {
            width: 100%;
            height: 100%;
            border: 0.4mm solid #000;
            border-radius: 1.5mm;
            padding: 1.5mm 2mm;
            overflow: hidden;
          }
          .row-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
          .row-table td { vertical-align: middle; padding: 0; }
          .qr-cell { width: ${qrSizeMm + 4}mm; text-align: center; }
          .qr-wrap { width: ${qrSizeMm}mm; height: ${qrSizeMm}mm; margin: 0 auto; }
          .qr { width: 100%; height: 100%; display: block; }
          .text-cell { padding-left: 2.2mm; overflow: hidden; }
          .title {
            font-size: 10pt;
            font-weight: 800;
            letter-spacing: -0.1px;
            color: #000;
            line-height: 1.1;
            overflow-wrap: anywhere;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .variant {
            font-size: 7.5pt;
            font-weight: 700;
            color: #444;
            line-height: 1.2;
            margin-top: 0.8mm;
            overflow: hidden;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .code-line {
            font-family: 'Courier New', Courier, monospace;
            font-size: 5.5pt;
            font-weight: 600;
            letter-spacing: 0.2px;
            color: #555;
            line-height: 1.25;
            margin-top: 1mm;
            overflow-wrap: anywhere;
            overflow: hidden;
          }
        </style>
      </head>
      <body>${labels}</body>
    </html>
  `;
};

// The shipping label markup and styles are shared with the single-label print (OrderLabel80x90.tsx), so a label printed
// from the queue is identical to one printed from the order.
const renderShippingLabelMarkup = (data: OrderLabelData): string => (
  renderOrderLabelMarkup(data, SHIPPING_QUEUE_LABEL_SIZE.heightMm)
);

export const buildShippingQueueHtml = (items: FyllPrintShippingItem[]): string => {
  // One page per parcel: an order set to 3 parcels prints 1 of 3, 2 of 3 and 3 of 3.
  const pages = items.flatMap((item) => expandParcels(item.labelData));
  const body = pages.map((labelData, index) => {
    const content = renderShippingLabelMarkup(labelData);
    return `<section class="shipping-label-page" style="${index < pages.length - 1 ? 'page-break-after: always;' : ''}">${content}</section>`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @page { size: ${SHIPPING_QUEUE_LABEL_SIZE.widthMm}mm ${SHIPPING_QUEUE_LABEL_SIZE.heightMm}mm; margin: 0; }
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: ${SHIPPING_QUEUE_LABEL_SIZE.widthMm}mm;
            background: white;
            color: black;
            font-family: Arial, Helvetica, sans-serif;
          }
          .shipping-label-page {
            width: ${SHIPPING_QUEUE_LABEL_SIZE.widthMm}mm;
            height: ${SHIPPING_QUEUE_LABEL_SIZE.heightMm}mm;
            padding: 2mm;
            overflow: hidden;
            background: #fff;
          }
          /*
            Layout uses plain HTML tables + fixed block heights, not CSS Grid or Flexbox —
            iOS's native print/PDF export pipeline (used when saving to Files or sharing a
            PDF from the system print sheet) has proven unreliable with both Grid and
            Flexbox for this layout. Tables are the one technique with truly universal
            support across PDF renderers.
          */
          ${ORDER_LABEL_CSS}
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
};
