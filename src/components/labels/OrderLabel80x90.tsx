import React, { useMemo } from 'react';
import { View, Text, Image, Platform } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { formatAddressValue } from '@/lib/format-address';
import { generateQrMatrix, generateQrSvg } from '@/lib/qrcode';
import { FYLL_WORDMARK_DATA_URI } from '@/lib/fyll-wordmark';
import { expandParcels, getLabelFlags, getRowHeightsMm, getShippingLabelFileBase, getStateInfo, getWeightText, type ShippingLabelOptionFields } from '@/lib/shipping-label-options';

export interface OrderLabelData extends ShippingLabelOptionFields {
  // Business/Sender Info
  businessName: string;
  businessLogo: string | null;
  businessPhone: string;
  businessWebsite: string;
  returnAddress: string;
  trackingUrl?: string;
  // Order Info
  orderNumber: string; // Internal FYLL order number
  websiteOrderRef?: string; // Customer-facing order number (WooCommerce)
  // Customer/Recipient Info
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  // Logistics
  logisticsProvider?: string;
  // Total quantity of items in the order, shown as "Items" on the label.
  itemCount?: number;
}

interface OrderLabel80x90Props {
  data: OrderLabelData;
  widthMm?: number;
  heightMm?: number;
}

// Day and month only ('03 Nov'), so it fits beside the carrier name.
const formatLabelDate = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/**
 * On-screen preview of the shipping label. It follows the printed layout row for row (zone block + carrier + parcel at
 * the top, recipient with the delivery QR, order number and item count, return address, footer), sized for a
 * 340px-wide preview. The row sizes use the same shares as the printed label, so what you see is what prints.
 */
export function OrderLabel80x90Preview({
  data,
  widthMm = 100,
  heightMm = 150,
}: OrderLabel80x90Props) {
  const flags = getLabelFlags(data);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const deliveryAddressText = formatAddressValue(data.deliveryAddress);
  const qrMatrix = useMemo(() => generateQrMatrix(data.trackingUrl || data.orderNumber), [data.orderNumber, data.trackingUrl]);
  const provider = data.logisticsProvider || 'Fyll Dispatch';
  const returnAddress = data.returnAddress || 'Return address not set';
  const printDate = useMemo(() => formatLabelDate(), []);
  const { name: stateName, code: stateCode } = useMemo(() => getStateInfo(data.deliveryAddress), [data.deliveryAddress]);
  const rows = getRowHeightsMm(heightMm, flags);
  const grow = (value: number) => ({ flexGrow: value, flexBasis: 0 });
  const lk = { fontSize: 6.8, fontWeight: '700' as const, color: '#555555', letterSpacing: 1, textTransform: 'uppercase' as const };
  const rule = { borderBottomWidth: 1.7, borderColor: '#111111' };

  return (
    <View
      style={{
        width: '100%',
        maxWidth: 340,
        aspectRatio: widthMm / heightMm,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.7,
        borderColor: '#111111',
        borderRadius: 8.5,
        overflow: 'hidden',
        alignSelf: 'center',
      }}
    >
      {/* Zone, carrier, parcel */}
      <View style={[grow(rows.header), rule, { flexDirection: 'row', alignItems: 'stretch' }]}>
        <View style={{ width: 102, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 36 }}>{stateCode}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 7.6, fontWeight: '700', letterSpacing: 1.3, marginTop: 3 }} numberOfLines={1}>ZONE · {stateName.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 12, gap: 3 }}>
          <Text style={lk}>Delivered by</Text>
          <Text style={{ fontSize: 15.3, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{provider}</Text>
          <Text style={{ fontSize: 9.4, fontWeight: '600', color: '#444444' }} numberOfLines={1}>Dispatch Nigeria · {printDate}</Text>
        </View>
        <View style={{ width: 63, borderLeftWidth: 1.7, borderColor: '#111111', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Text style={lk}>Parcel</Text>
          <Text style={{ fontSize: 18.7, fontWeight: '900', color: '#111111' }}>{flags.parcelText.replace(' OF ', '/')}</Text>
          <Text style={{ fontSize: 7.6, fontWeight: '700', color: '#444444' }}>{getWeightText(data)}</Text>
        </View>
      </View>

      {/* Recipient + delivery QR */}
      <View style={[grow(rows.recipient), rule, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={lk}>Ship to</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: -0.4, lineHeight: 23, color: '#111111' }} numberOfLines={2}>{data.customerName}</Text>
          {flags.phone ? <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{data.customerPhone}</Text> : null}
          <Text style={{ fontSize: 12, fontWeight: '600', lineHeight: 16, color: '#111111', marginTop: 2 }} numberOfLines={4}>{deliveryAddressText}</Text>
        </View>
        {flags.qr ? (
          <View style={{ alignItems: 'center', flexShrink: 0, gap: 5 }}>
            <View style={{ width: 82, height: 82, backgroundColor: '#FFFFFF' }}>
              <Svg width="100%" height="100%" viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}>
                {qrMatrix.map((row, rowIndex) =>
                  row.map((filled, colIndex) =>
                    filled ? (
                      <Rect key={`${rowIndex}-${colIndex}`} x={colIndex} y={rowIndex} width={1} height={1} fill="#000000" />
                    ) : null
                  )
                )}
              </Svg>
            </View>
            <Text style={{ fontSize: 6.8, fontWeight: '800', color: '#111111', textAlign: 'center', letterSpacing: 0.5, lineHeight: 9 }}>
              {'SCAN TO CONFIRM\nDELIVERY'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Order number + items */}
      <View style={[grow(rows.order), rule, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 12 }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={lk}>Order</Text>
          <Text style={{ fontSize: 18.7, fontWeight: '900', color: '#111111', fontFamily: Platform.OS === 'web' ? 'Courier New, Courier, monospace' : Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: -0.5 }} numberOfLines={1}>{primaryOrderNumber}</Text>
          {hasWebsiteOrder ? <Text style={{ fontSize: 6.8, color: '#666666' }} numberOfLines={1}>REF: {data.orderNumber}</Text> : null}
        </View>
        {typeof data.itemCount === 'number' ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={lk}>Items</Text>
            <Text style={{ fontSize: 12.8, fontWeight: '800', color: '#111111' }}>{data.itemCount}</Text>
          </View>
        ) : null}
      </View>

      {/* From / return to */}
      {flags.ret ? (
        <View style={[grow(rows.ret), rule, { justifyContent: 'center', paddingHorizontal: 14, gap: 3 }]}>
          <Text style={lk}>From / return to</Text>
          <Text style={{ fontSize: 10.2, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
            {data.businessName}{data.businessPhone ? ` · ${data.businessPhone}` : ''}
          </Text>
          <Text style={{ fontSize: 8.9, color: '#333333', lineHeight: 12 }} numberOfLines={3}>
            {returnAddress}. If undelivered, please return to sender.
          </Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={[grow(rows.footer), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 8 }]}>
        <Text style={{ fontSize: 7.6, fontWeight: '700', letterSpacing: 0.5, color: '#111111', flexShrink: 1 }} numberOfLines={1}>
          {flags.thanks ? `THANK YOU FOR SHOPPING WITH ${data.businessName.toUpperCase()}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Text style={{ fontSize: 7.6, fontWeight: '700', color: '#111111' }}>POWERED BY</Text>
          <Image source={{ uri: FYLL_WORDMARK_DATA_URI }} style={{ width: 24, height: 13 }} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
}

/**
 * Styles for the printed label. Shared by the print dialog and the Fyll Print queue so they never drift apart. Row
 * layout uses plain tables and literal mm heights, because iOS's print/PDF export is unreliable with Flexbox and Grid.
 */
export const ORDER_LABEL_CSS = `
  .label { width: 100%; height: 100%; border: 0.5mm solid #000; border-radius: 2.5mm; overflow: hidden; background: #fff; color: #000; }
  .section { overflow: hidden; border-bottom: 0.5mm solid #000; }
  .section.last { border-bottom: 0; }
  .row-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
  .row-table td { vertical-align: middle; padding: 0; }
  .lk { display: block; font-size: 5.6pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #555; line-height: 1; margin-bottom: 0.8mm; }
  .row-table td.zone-cell { width: 30mm; background: #000; color: #fff; text-align: center; }
  .zone-code { font-size: 28pt; font-weight: 900; letter-spacing: -0.04em; line-height: 1; color: #fff; }
  .zone-name { font-size: 6.3pt; font-weight: 700; letter-spacing: 0.16em; margin-top: 1mm; text-transform: uppercase; white-space: nowrap; overflow: hidden; color: #fff; }
  .row-table td.carrier-cell { padding: 0 3.5mm; overflow: hidden; }
  .carrier-name { font-size: 12.6pt; font-weight: 800; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .carrier-sub { font-size: 7.8pt; font-weight: 600; color: #444; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-table td.parcel-cell { width: 18.5mm; border-left: 0.5mm solid #000; text-align: center; }
  .parcel-count { font-size: 15.5pt; font-weight: 900; line-height: 1; }
  .parcel-weight { font-size: 6.3pt; font-weight: 700; color: #444; margin-top: 0.8mm; }
  .row-table td.ship-cell { padding: 0 4mm; overflow: hidden; }
  .ship-name { font-size: 18pt; font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; overflow-wrap: anywhere; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ship-phone { font-size: 12pt; font-weight: 800; line-height: 1.1; margin-top: 1.6mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ship-address { font-size: 9.9pt; font-weight: 600; line-height: 1.3; margin-top: 1.6mm; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
  .row-table td.qr-cell { width: 30mm; text-align: center; padding-right: 4mm; }
  .qr-box { width: 24mm; height: 24mm; display: inline-block; }
  .qr-box svg { width: 100%; height: 100%; display: block; }
  .scan-text { font-size: 5.6pt; font-weight: 800; letter-spacing: 0.04em; line-height: 1.3; margin-top: 1.5mm; text-transform: uppercase; }
  .row-table td.order-cell { padding: 0 4mm; overflow: hidden; }
  .order-number { font-family: 'Courier New', Courier, monospace; font-size: 15.5pt; font-weight: 900; letter-spacing: -0.03em; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fyll-ref { font-size: 5.6pt; color: #666; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; }
  .row-table td.items-cell { width: 24mm; text-align: right; padding-right: 4mm; }
  .items-value { font-size: 10.5pt; font-weight: 800; line-height: 1; }
  .row-table td.return-cell { padding: 0 4mm; overflow: hidden; }
  .return-line { font-size: 8.4pt; font-weight: 800; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .return-address { font-size: 7.4pt; color: #333; line-height: 1.35; margin-top: 0.8mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .footer-section { padding: 0 4mm; font-size: 6.3pt; font-weight: 700; letter-spacing: 0.04em; }
  .footer-section td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .powered-by-logo { height: 3.2mm; width: auto; vertical-align: middle; }
`;

/** One shipping label's markup, with literal mm row heights computed from the page height. */
export const renderOrderLabelMarkup = (data: OrderLabelData, heightMm: number): string => {
  const flags = getLabelFlags(data);
  const qrSvg = generateQrSvg(data.trackingUrl || data.orderNumber, 60);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const { name: stateName, code: stateCode } = getStateInfo(data.deliveryAddress);
  const provider = data.logisticsProvider || 'Delivery Partner';
  const returnAddress = data.returnAddress || 'Return address not set';
  const rows = getRowHeightsMm(heightMm, flags);
  const parcelText = flags.parcelText.replace(' OF ', '/');
  const itemsCell = typeof data.itemCount === 'number'
    ? `<td class="items-cell"><span class="lk">Items</span><div class="items-value">${data.itemCount}</div></td>`
    : '';

  return `
    <div class="label">
      <div class="section" style="height: ${rows.header}mm;">
        <table class="row-table"><tr>
          <td class="zone-cell"><div class="zone-code">${escapeHtml(stateCode)}</div><div class="zone-name">ZONE · ${escapeHtml(stateName.toUpperCase())}</div></td>
          <td class="carrier-cell">
            <span class="lk">Delivered by</span>
            <div class="carrier-name">${escapeHtml(provider)}</div>
            <div class="carrier-sub">Dispatch Nigeria · ${formatLabelDate()}</div>
          </td>
          <td class="parcel-cell"><span class="lk">Parcel</span><div class="parcel-count">${escapeHtml(parcelText)}</div><div class="parcel-weight">${escapeHtml(getWeightText(data))}</div></td>
        </tr></table>
      </div>

      <div class="section" style="height: ${rows.recipient}mm;">
        <table class="row-table"><tr>
          <td class="ship-cell">
            <span class="lk">Ship to</span>
            <div class="ship-name">${escapeHtml(data.customerName)}</div>
            ${flags.phone ? `<div class="ship-phone">${escapeHtml(data.customerPhone)}</div>` : ''}
            <div class="ship-address">${escapeHtml(formatAddressValue(data.deliveryAddress)).replace(/\n/g, '<br>')}</div>
          </td>
          ${flags.qr ? `<td class="qr-cell"><div class="qr-box">${qrSvg}</div><div class="scan-text">Scan to confirm<br>delivery</div></td>` : ''}
        </tr></table>
      </div>

      <div class="section" style="height: ${rows.order}mm;">
        <table class="row-table"><tr>
          <td class="order-cell">
            <span class="lk">Order</span>
            <div class="order-number">${escapeHtml(primaryOrderNumber)}</div>
            ${hasWebsiteOrder ? `<div class="fyll-ref">REF: ${escapeHtml(data.orderNumber)}</div>` : ''}
          </td>
          ${itemsCell}
        </tr></table>
      </div>

      ${flags.ret ? `<div class="section" style="height: ${rows.ret}mm;">
        <table class="row-table"><tr>
          <td class="return-cell">
            <span class="lk">From / return to</span>
            <div class="return-line">${escapeHtml(data.businessName)}${data.businessPhone ? ` · ${escapeHtml(data.businessPhone)}` : ''}</div>
            <div class="return-address">${escapeHtml(returnAddress).replace(/\n/g, ', ')}. If undelivered, please return to sender.</div>
          </td>
        </tr></table>
      </div>` : ''}

      <div class="section last footer-section" style="height: ${rows.footer}mm;">
        <table class="row-table"><tr>
          <td style="width: 70%; text-align: left;">${flags.thanks ? `THANK YOU FOR SHOPPING WITH ${escapeHtml(data.businessName.toUpperCase())}` : ''}</td>
          <td style="width: 30%; text-align: right;">POWERED BY <img class="powered-by-logo" src="${FYLL_WORDMARK_DATA_URI}" alt="FYLL" /></td>
        </tr></table>
      </div>
    </div>
  `;
};

/**
 * Generate HTML for printing shipping labels, one page per label.
 * Defaults to 100x150mm (4x6in) — the standard shipping label size — when no size is provided.
 */
export function generateOrderLabelsHTML(
  labels: OrderLabelData[],
  size: { widthMm: number; heightMm: number } = { widthMm: 100, heightMm: 150 },
): string {
  const widthMm = Number.isFinite(size.widthMm) && size.widthMm > 0 ? size.widthMm : 100;
  const heightMm = Number.isFinite(size.heightMm) && size.heightMm > 0 ? size.heightMm : 150;
  const pages = labels
    .map((data) => `<div class="page">${renderOrderLabelMarkup(data, heightMm)}</div>`)
    .join('');
  const title = labels[0] ? escapeHtml(getShippingLabelFileBase(labels[0])) : 'Shipping Label';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
          body { font-family: Arial, Helvetica, sans-serif; background: white; color: black; }
          .page { width: ${widthMm}mm; height: ${heightMm}mm; padding: 2mm; background: white; overflow: hidden; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          @media screen {
            html, body { background: #f5f5f5; }
            .page { margin: 0 auto 6mm; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          }
          ${ORDER_LABEL_CSS}
        </style>
      </head>
      <body>${pages}</body>
    </html>
  `;
}

export function generateOrderLabelHTML(
  data: OrderLabelData,
  size: { widthMm: number; heightMm: number } = { widthMm: 100, heightMm: 150 },
): string {
  return generateOrderLabelsHTML(expandParcels(data), size);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
