import { storage } from '@/lib/storage';
import { generateQrSvg } from '@/lib/qrcode';
import type { Product, ProductVariant } from '@/lib/state/fyll-store';
import type { OrderLabelData } from '@/components/labels/OrderLabel80x90';
import { FYLL_WORDMARK_DATA_URI } from '@/lib/fyll-wordmark';

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

export const getFyllPrintQueue = async (): Promise<FyllPrintQueueState> => {
  const raw = await storage.getItem(FYLL_PRINT_QUEUE_STORAGE_KEY);
  if (!raw) return EMPTY_PRINT_QUEUE;

  try {
    return normalizeQueue(JSON.parse(raw));
  } catch {
    return EMPTY_PRINT_QUEUE;
  }
};

export const saveFyllPrintQueue = async (queue: FyllPrintQueueState) => {
  await storage.setItem(FYLL_PRINT_QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

export const addFyllPrintQueueItem = async (item: FyllPrintQueueItem): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue();
  const current = queue[item.category] as FyllPrintQueueItem[];
  const nextItems = [item, ...current.filter((queued) => queued.id !== item.id)];
  const nextQueue = {
    ...queue,
    [item.category]: nextItems,
  } as FyllPrintQueueState;
  await saveFyllPrintQueue(nextQueue);
  return nextQueue;
};

export const removeFyllPrintQueueItem = async (
  category: FyllPrintCategory,
  itemId: string,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue();
  const nextQueue = {
    ...queue,
    [category]: queue[category].filter((item) => item.id !== itemId),
  };
  await saveFyllPrintQueue(nextQueue);
  return nextQueue;
};

export const clearFyllPrintQueueCategory = async (
  category: FyllPrintCategory,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue();
  const nextQueue = {
    ...queue,
    [category]: [],
  };
  await saveFyllPrintQueue(nextQueue);
  return nextQueue;
};

export const recordFyllPrintHistory = async (
  category: FyllPrintCategory,
  action: FyllPrintHistoryItem['action'],
  itemCount: number,
): Promise<FyllPrintQueueState> => {
  const queue = await getFyllPrintQueue();
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
  await saveFyllPrintQueue(nextQueue);
  return nextQueue;
};

const getVariantName = (variant: ProductVariant) => Object.values(variant.variableValues).filter(Boolean).join(' - ');

export const createInventoryPrintQueueItems = (
  product: Product,
  variants: ProductVariant[],
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

export const buildInventoryQueueHtml = (items: FyllPrintInventoryItem[]): string => {
  const size = INVENTORY_QUEUE_LABEL_SIZE;
  const qrSizeMm = 20;
  const labels = items.map((item, index) => {
    const qrSvg = item.barcode ? generateQrSvg(item.barcode, Math.round(qrSizeMm * 1.8)) : '';
    const pageBreak = index < items.length - 1 ? 'page-break-after: always;' : '';
    const safeName = [item.productName, item.variantName].filter(Boolean).map(escapeHtml).join(' — ');
    const codeText = item.barcode || item.sku;
    return `
      <div class="label-page" style="${pageBreak}">
        <div class="label">
          <table class="row-table"><tr>
            <td class="qr-cell">
              <div class="qr-wrap">${qrSvg.replace('<svg ', '<svg class="qr" ')}</div>
              ${codeText ? `<div class="code-text">${escapeHtml(codeText)}</div>` : ''}
            </td>
            <td class="text-cell">
              <div class="sku">${escapeHtml(item.sku || codeText)}</div>
              <div class="product-name">${safeName}</div>
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
          .code-text { font-size: 5.5pt; font-weight: 600; letter-spacing: 0.3px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.6mm; }
          .text-cell { padding-left: 2.2mm; overflow: hidden; }
          .sku {
            font-size: 8.5pt;
            font-weight: 800;
            letter-spacing: 0.2px;
            color: #000;
            line-height: 1.15;
            overflow-wrap: anywhere;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .product-name {
            font-size: 7.5pt;
            font-weight: 600;
            color: #111;
            line-height: 1.25;
            max-height: 9.5mm;
            margin-top: 1mm;
            overflow: hidden;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
          }
        </style>
      </head>
      <body>${labels}</body>
    </html>
  `;
};

// Row heights are computed here (not via CSS Grid/Flexbox row-sizing) and baked in as
// literal mm heights, and multi-column rows use plain HTML tables. iOS's native print/PDF
// export pipeline (used when saving to Files or sharing a PDF from the system print sheet)
// has proven unreliable with both Grid and Flexbox for this layout — tables + fixed block
// heights are the one layout technique with truly universal support across PDF renderers.
const SHIPPING_ROW_FRACTIONS = [7, 13, 7, 21.5, 8.8, 19, 3.7];
const SHIPPING_ROW_TOTAL = SHIPPING_ROW_FRACTIONS.reduce((sum, value) => sum + value, 0);

const renderShippingLabelMarkup = (data: OrderLabelData): string => {
  const qrSvg = generateQrSvg(data.trackingUrl || data.orderNumber, 60);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const addressParts = data.deliveryAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const state = addressParts[addressParts.length - 1] || 'NG';
  const stateCode = state.slice(0, 3).toUpperCase();
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();
  const provider = data.logisticsProvider || 'Fyll Dispatch';
  const returnAddress = data.returnAddress || 'Return address not set';
  const usableHeightMm = Math.max(SHIPPING_QUEUE_LABEL_SIZE.heightMm - 4, 20);
  const [hCarrier, hMeta, hRoute, hRecipient, hOrder, hReturn, hFooter] = SHIPPING_ROW_FRACTIONS.map(
    (fraction) => (fraction / SHIPPING_ROW_TOTAL) * usableHeightMm
  );

  return `
    <div class="label">
      <div class="section carrier-section" style="height: ${hCarrier}mm;">
        <table class="row-table"><tr>
          <td style="width: 50%; text-align: left;"><span class="micro">DELIVERED BY</span></td>
          <td style="width: 50%; text-align: right;"><div class="carrier-name">${escapeHtml(provider)}</div></td>
        </tr></table>
      </div>

      <div class="section" style="height: ${hMeta}mm;">
        <table class="row-table">
          <colgroup><col style="width: 48%;"><col style="width: 29%;"><col style="width: 23%;"></colgroup>
          <tr>
            <td class="meta-cell">
              <span class="micro">FROM</span>
              <div class="business-name">${escapeHtml(data.businessName)}</div>
              <div class="muted-line">${escapeHtml(returnAddress).replace(/\n/g, ', ')}</div>
            </td>
            <td class="meta-cell meta-cell-border">
              <span class="micro">DATE</span>
              <div class="date-value">${printDate}</div>
              <span class="micro weight-label">WEIGHT</span>
              <div class="weight-value">&lt; 2 KG</div>
            </td>
            <td class="meta-cell meta-cell-border" style="text-align: center;">
              <div class="parcel-box">
                <div class="parcel-title">PARCEL</div>
                <div class="parcel-count">1 OF 1</div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div class="section" style="height: ${hRoute}mm;">
        <table class="row-table">
          <colgroup><col style="width: 15mm;"><col></colgroup>
          <tr>
            <td style="padding-left: 3mm;"><div class="state-code">${escapeHtml(stateCode || 'FYL')}</div></td>
            <td class="state-name-cell">
              <div class="state-name">
                <strong>${escapeHtml(state.toUpperCase())}</strong>
                <span>NG</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div class="section" style="height: ${hRecipient}mm;">
        <table class="row-table">
          <colgroup><col><col style="width: 22mm;"></colgroup>
          <tr>
            <td class="recipient-copy-cell">
              <span class="micro">TO</span>
              <div class="recipient-name">${escapeHtml(data.customerName)}</div>
              <div class="recipient-phone">${escapeHtml(data.customerPhone)}</div>
              <div class="recipient-address">${escapeHtml(data.deliveryAddress).replace(/\n/g, '<br>')}</div>
            </td>
            <td class="tracking-cell">
              <div class="qr-box">${qrSvg}</div>
              <div class="scan-text">SCAN TO CONFIRM DELIVERY</div>
            </td>
          </tr>
        </table>
      </div>

      <div class="section order-section" style="height: ${hOrder}mm;">
        <div class="order-heading">ORDER DETAILS</div>
        <table class="row-table" style="height: auto;">
          <colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>
          <tr>
            <td>
              <span class="micro">ORDER NUMBER</span>
              <div class="order-number">${escapeHtml(primaryOrderNumber)}</div>
              ${hasWebsiteOrder ? `<div class="fyll-ref">REF: ${escapeHtml(data.orderNumber)}</div>` : ''}
            </td>
            <td class="order-cell-right">
              <span class="micro">TYPE</span>
              <div class="type-value">DISPATCH NIGERIA</div>
            </td>
          </tr>
        </table>
      </div>

      <div class="section" style="height: ${hReturn}mm;">
        <table class="row-table">
          <colgroup><col style="width: 57%;"><col style="width: 43%;"></colgroup>
          <tr>
            <td class="return-block">
              <span class="micro">RETURN TO</span>
              <div class="return-name">${escapeHtml(data.businessName)}</div>
              <div class="return-address">${escapeHtml(returnAddress).replace(/\n/g, '<br>')}</div>
              ${data.businessPhone ? `<div class="return-address">${escapeHtml(data.businessPhone)}</div>` : ''}
            </td>
            <td class="undelivered-block">
              <div>If undelivered, please return to sender.</div>
              <strong>${escapeHtml(state)}, Nigeria</strong>
              <span>100001</span>
            </td>
          </tr>
        </table>
      </div>

      <div class="section footer-section" style="height: ${hFooter}mm;">
        <table class="row-table"><tr>
          <td style="width: 62%; text-align: left;">THANK YOU FOR SHOPPING WITH ${escapeHtml(data.businessName.toUpperCase())}</td>
          <td style="width: 38%; text-align: right;">POWERED BY <img class="powered-by-logo" src="${FYLL_WORDMARK_DATA_URI}" alt="FYLL" /></td>
        </tr></table>
      </div>
    </div>
  `;
};

export const buildShippingQueueHtml = (items: FyllPrintShippingItem[]): string => {
  const body = items.map((item, index) => {
    const content = renderShippingLabelMarkup(item.labelData);
    return `<section class="shipping-label-page" style="${index < items.length - 1 ? 'page-break-after: always;' : ''}">${content}</section>`;
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
          .label { width: 100%; height: 100%; border: 0.55mm solid #000; border-radius: 2.8mm; overflow: hidden; }
          .section { overflow: hidden; border-bottom: 0.35mm solid #000; }
          .row-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
          .row-table td { vertical-align: middle; padding: 0; }
          .micro {
            display: block;
            font-size: 7pt;
            line-height: 1;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            margin-bottom: 0.6mm;
            font-weight: 600;
            color: #000;
          }
          .carrier-section { padding: 0 3.2mm; }
          .carrier-section .micro { margin-bottom: 0; }
          .carrier-name { font-size: 12pt; line-height: 1; font-weight: 700; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .meta-cell { padding: 0 2.4mm; overflow: hidden; }
          .meta-cell-border { border-left: 0.35mm solid #000; }
          .business-name { font-size: 9.5pt; font-weight: 700; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .muted-line { font-size: 7pt; line-height: 1.15; margin-top: 0.5mm; max-height: 6.5mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .date-value,
          .weight-value { font-size: 8pt; line-height: 1; font-weight: 700; white-space: nowrap; }
          .weight-label { margin-top: 1.1mm; }
          .parcel-box { width: 18mm; height: 12mm; border: 0.35mm solid #000; text-align: center; margin: 0 auto; }
          .parcel-title { height: 4.5mm; line-height: 4.5mm; background: #000; color: #fff; font-size: 6.5pt; font-weight: 700; }
          .parcel-count { height: 7.5mm; line-height: 7.5mm; font-size: 9.5pt; font-weight: 700; }
          .state-code { background: #000; color: #fff; font-size: 15pt; font-weight: 700; line-height: 6.5mm; height: 6.5mm; text-align: center; white-space: nowrap; overflow: hidden; }
          .state-name-cell { padding-left: 1.35mm; }
          .state-name strong { display: block; font-size: 10.5pt; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .state-name span { display: block; font-size: 8pt; margin-top: 0.4mm; }
          .recipient-copy-cell { padding: 0 3mm; }
          .tracking-cell { padding-right: 3mm; text-align: center; }
          .recipient-name { font-size: 14pt; font-weight: 700; line-height: 1.05; margin: 0.6mm 0 0.6mm; overflow-wrap: anywhere; max-height: 9mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .recipient-phone { font-size: 9pt; line-height: 1.1; margin-bottom: 0.7mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .recipient-address { font-size: 8.5pt; line-height: 1.15; max-height: 11mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
          .qr-box { width: 19mm; height: 19mm; border: 0.3mm solid #000; padding: 0.9mm; margin: 0 auto; display: inline-block; }
          .qr-box svg { width: 100%; height: 100%; display: block; }
          .scan-text { font-size: 6pt; line-height: 1.2; margin-top: 0.6mm; text-align: center; text-transform: uppercase; font-weight: 700; }
          .order-section { padding: 1.3mm 3mm; }
          .order-heading { font-size: 7pt; text-align: center; margin-bottom: 0.8mm; text-transform: uppercase; font-weight: 600; }
          .order-cell-right { border-left: 0.3mm solid #000; padding-left: 4mm; }
          .order-number,
          .type-value { font-size: 11pt; font-weight: 700; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .type-value { font-size: 9pt; }
          .fyll-ref { font-size: 6pt; margin-top: 0.5mm; white-space: nowrap; overflow: hidden; }
          .return-block { padding: 0 2.35mm; overflow: hidden; }
          .return-name { font-size: 9pt; font-weight: 700; margin-bottom: 0.4mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .return-address { font-size: 7pt; line-height: 1.15; max-height: 9.5mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .undelivered-block { border-left: 0.3mm dashed #000; padding: 0 2.05mm; font-size: 7pt; line-height: 1.15; overflow: hidden; }
          .undelivered-block strong { display: block; margin-top: 0.9mm; font-size: 7.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .undelivered-block span { display: block; margin-top: 0.5mm; }
          .footer-section { border-bottom: 0; padding: 0 3mm; font-size: 6pt; letter-spacing: 0.1px; }
          .footer-section td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .powered-by-logo { height: 2.8mm; width: auto; vertical-align: middle; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
};
