import React, { useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { formatAddressValue } from '@/lib/format-address';
import { generateQrMatrix, generateQrSvg } from '@/lib/qrcode';
import { FYLL_WORDMARK_DATA_URI } from '@/lib/fyll-wordmark';

export interface OrderLabelData {
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
}

interface OrderLabel80x90Props {
  data: OrderLabelData;
  widthMm?: number;
  heightMm?: number;
}

/**
 * Preview component for shipping labels (supports dynamic label sizes)
 * Used for visual preview in the app
 *
 * Order Number Hierarchy:
 * - If websiteOrderRef exists: Show it as primary (ORDER #56844), FYLL ref as secondary
 * - If no websiteOrderRef: Show FYLL order number as primary with "INTERNAL ORDER" label
 */
const micro = { fontSize: 8, fontWeight: '600' as const, color: '#666666', textTransform: 'uppercase' as const, letterSpacing: 0.4 };

/**
 * Preview component for shipping labels. Mirrors generateOrderLabelHTML section-for-section
 * (same rows, same fallbacks) so what the user sees here matches what actually prints —
 * flexGrow ratios match the HTML template's grid-template-rows fr values.
 */
export function OrderLabel80x90Preview({
  data,
  widthMm = 100,
  heightMm = 150,
}: OrderLabel80x90Props) {
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const deliveryAddressText = formatAddressValue(data.deliveryAddress);
  const qrMatrix = useMemo(() => generateQrMatrix(data.trackingUrl || data.orderNumber), [data.orderNumber, data.trackingUrl]);
  const provider = data.logisticsProvider || 'Fyll Dispatch';
  const returnAddress = data.returnAddress || 'Return address not set';
  const printDate = useMemo(() => new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase(), []);
  const { state, stateCode } = useMemo(() => {
    const parts = data.deliveryAddress.split(',').map((part) => part.trim()).filter(Boolean);
    const lastPart = parts[parts.length - 1] || 'NG';
    return { state: lastPart, stateCode: lastPart.slice(0, 3).toUpperCase() };
  }, [data.deliveryAddress]);

  return (
    <View
      style={{
        width: '100%',
        maxWidth: 340,
        aspectRatio: widthMm / heightMm,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.4,
        borderColor: '#000000',
        borderRadius: 10,
        overflow: 'hidden',
        alignSelf: 'center',
      }}
    >
      {/* Carrier */}
      <View style={{ flexGrow: 7.5, flexBasis: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomWidth: 1, borderColor: '#000000' }}>
        <Text style={micro}>DELIVERED BY</Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#000000' }} numberOfLines={1}>{provider}</Text>
      </View>

      {/* Meta: FROM | DATE/WEIGHT | PARCEL */}
      <View style={{ flexGrow: 13.5, flexBasis: 0, flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000000' }}>
        <View style={{ flex: 1.55, justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderColor: '#000000' }}>
          <Text style={micro}>FROM</Text>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#000000', marginTop: 1 }} numberOfLines={1}>{data.businessName}</Text>
          <Text style={{ fontSize: 7.5, color: '#555555', marginTop: 1 }} numberOfLines={2}>{returnAddress}</Text>
        </View>
        <View style={{ flex: 0.9, justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderColor: '#000000' }}>
          <Text style={micro}>DATE</Text>
          <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#000000' }}>{printDate}</Text>
          <Text style={[micro, { marginTop: 4 }]}>WEIGHT</Text>
          <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#000000' }}>{'< 2 KG'}</Text>
        </View>
        <View style={{ flex: 0.75, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ borderWidth: 1, borderColor: '#000000', minWidth: 34 }}>
            <View style={{ backgroundColor: '#000000', paddingVertical: 1.5 }}>
              <Text style={{ fontSize: 6, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>PARCEL</Text>
            </View>
            <Text style={{ fontSize: 8, fontWeight: '800', color: '#000000', textAlign: 'center', paddingVertical: 2 }}>1 OF 1</Text>
          </View>
        </View>
      </View>

      {/* Route / state */}
      <View style={{ flexGrow: 7.5, flexBasis: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, borderBottomWidth: 1, borderColor: '#000000' }}>
        <View style={{ backgroundColor: '#000000', paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>{stateCode || 'FYL'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#000000' }} numberOfLines={1}>{state.toUpperCase()}</Text>
          <Text style={{ fontSize: 7.5, color: '#555555', marginTop: 1 }}>NG</Text>
        </View>
      </View>

      {/* Recipient + QR */}
      <View style={{ flexGrow: 22.5, flexBasis: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10, borderBottomWidth: 1, borderColor: '#000000' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={micro}>SHIP TO</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#000000', marginTop: 2 }} numberOfLines={1}>{data.customerName}</Text>
          <Text style={{ fontSize: 9, color: '#222222', marginTop: 1 }} numberOfLines={1}>{data.customerPhone}</Text>
          <Text style={{ fontSize: 8, color: '#444444', marginTop: 3, lineHeight: 11 }} numberOfLines={3}>{deliveryAddressText}</Text>
        </View>
        <View style={{ alignItems: 'center', flexShrink: 0 }}>
          <View style={{ width: 46, height: 46, borderWidth: 1, borderColor: '#000000', padding: 2, backgroundColor: '#FFFFFF' }}>
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
          <Text style={{ fontSize: 6, fontWeight: '800', color: '#000000', marginTop: 3, textAlign: 'center', maxWidth: 50 }}>
            SCAN TO CONFIRM DELIVERY
          </Text>
        </View>
      </View>

      {/* Order details */}
      <View style={{ flexGrow: 9.5, flexBasis: 0, justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderColor: '#000000' }}>
        <Text style={[micro, { textAlign: 'center', marginBottom: 3 }]}>ORDER DETAILS</Text>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={micro}>ORDER NUMBER</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#000000' }} numberOfLines={1}>{primaryOrderNumber}</Text>
            {hasWebsiteOrder && (
              <Text style={{ fontSize: 6.5, color: '#999999', marginTop: 1 }} numberOfLines={1}>REF: {data.orderNumber}</Text>
            )}
          </View>
          <View style={{ flex: 1, borderLeftWidth: 1, borderColor: '#000000', paddingLeft: 8 }}>
            <Text style={micro}>TYPE</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#000000' }}>DISPATCH NIGERIA</Text>
          </View>
        </View>
      </View>

      {/* Return to */}
      <View style={{ flexGrow: 18, flexBasis: 0, flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000000' }}>
        <View style={{ flex: 1.14, justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderColor: '#000000' }}>
          <Text style={micro}>RETURN TO</Text>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#000000', marginTop: 1 }} numberOfLines={1}>{data.businessName}</Text>
          <Text style={{ fontSize: 7.5, color: '#444444', marginTop: 1 }} numberOfLines={2}>{returnAddress}</Text>
          {data.businessPhone ? (
            <Text style={{ fontSize: 7.5, color: '#444444' }} numberOfLines={1}>{data.businessPhone}</Text>
          ) : null}
        </View>
        <View style={{ flex: 0.86, justifyContent: 'center', paddingHorizontal: 8, borderLeftWidth: 1, borderColor: '#000000', borderStyle: 'dashed' }}>
          <Text style={{ fontSize: 7, color: '#000000' }}>If undelivered, please return to sender.</Text>
          <Text style={{ fontSize: 8, fontWeight: '800', color: '#000000', marginTop: 4 }} numberOfLines={1}>{state}, Nigeria</Text>
          <Text style={{ fontSize: 7, color: '#000000' }}>100001</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={{ flexGrow: 4, flexBasis: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 6.5, color: '#000000', flexShrink: 1 }} numberOfLines={1}>
          THANK YOU FOR SHOPPING WITH {data.businessName.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Text style={{ fontSize: 6.5, color: '#000000' }}>POWERED BY</Text>
          <Image source={{ uri: FYLL_WORDMARK_DATA_URI }} style={{ width: 22, height: 12 }} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
}

/**
 * Generate HTML for printing shipping labels.
 * Defaults to 100x150mm (4x6in) — the standard shipping label size — when no size is provided.
 */
export function generateOrderLabelHTML(
  data: OrderLabelData,
  size: { widthMm: number; heightMm: number } = { widthMm: 100, heightMm: 150 },
): string {
  const widthMm = Number.isFinite(size.widthMm) && size.widthMm > 0 ? size.widthMm : 100;
  const heightMm = Number.isFinite(size.heightMm) && size.heightMm > 0 ? size.heightMm : 150;
  const qrSvg = generateQrSvg(data.trackingUrl || data.orderNumber, 60);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const addressParts = data.deliveryAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const state = addressParts[addressParts.length - 1] || 'NG';
  const stateCode = state.slice(0, 3).toUpperCase();
  const provider = data.logisticsProvider || 'Delivery Partner';
  const returnAddress = data.returnAddress || 'Return address not set';
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();

  // Row heights are computed here (not via CSS Grid/Flexbox row-sizing) and baked in as
  // literal mm heights, and multi-column rows use plain HTML tables. iOS's native print/PDF
  // export pipeline (used when saving to Files or sharing a PDF from the system print sheet)
  // has proven unreliable with both Grid and Flexbox for this layout — tables + fixed block
  // heights are the one layout technique with truly universal support across PDF renderers.
  const rowFractions = [7.5, 13.5, 7.5, 22.5, 9.5, 18, 4];
  const rowTotal = rowFractions.reduce((sum, value) => sum + value, 0);
  const usableHeightMm = Math.max(heightMm - 4, 20);
  const [hCarrier, hMeta, hRoute, hRecipient, hOrder, hReturn, hFooter] = rowFractions.map(
    (fraction) => (fraction / rowTotal) * usableHeightMm
  );

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shipping Label - ${escapeHtml(data.orderNumber)}</title>
        <style>
          *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
          @media screen {
            html, body { width: ${widthMm}mm; height: ${heightMm}mm; margin: 0 auto; padding: 0; background: #f5f5f5; }
            body { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            html, body { width: ${widthMm}mm !important; height: ${heightMm}mm !important; margin: 0 !important; padding: 0 !important; background: white !important; overflow: hidden !important; }
            body { padding: 2mm !important; }
            body > *:not(.label) { display: none !important; visibility: hidden !important; }
            .label { visibility: visible !important; page-break-before: avoid !important; page-break-after: avoid !important; page-break-inside: avoid !important; }
          }
          body { font-family: Arial, Helvetica, sans-serif; width: ${widthMm}mm; height: ${heightMm}mm; padding: 2mm; background: white; color: black; }
          .label { width: 100%; height: 100%; border: 0.55mm solid #000; border-radius: 2.8mm; overflow: hidden; }
          .section { overflow: hidden; border-bottom: 0.35mm solid #000; }
          .row-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
          .row-table td { vertical-align: middle; padding: 0; }
          .micro { display: block; font-size: 7pt; line-height: 1; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.6mm; font-weight: 600; }
          .carrier-section { padding: 0 3.2mm; }
          .carrier-section .micro { margin-bottom: 0; }
          .carrier-name { font-size: 12pt; line-height: 1; font-weight: 700; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .meta-cell { padding: 0 2.4mm; overflow: hidden; }
          .meta-cell-border { border-left: 0.35mm solid #000; }
          .business-name { font-size: 9.5pt; font-weight: 700; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .muted-line { font-size: 7pt; line-height: 1.15; margin-top: 0.5mm; max-height: 6.5mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .date-value, .weight-value { font-size: 8pt; line-height: 1; font-weight: 700; white-space: nowrap; }
          .weight-label { margin-top: 1.1mm; }
          .parcel-box { width: 18mm; height: 12mm; border: 0.35mm solid #000; text-align: center; margin: 0 auto; }
          .parcel-title { height: 4.5mm; line-height: 4.5mm; background: #000; color: #fff; font-size: 6.5pt; font-weight: 700; }
          .parcel-count { height: 7.5mm; line-height: 7.5mm; font-size: 9.5pt; font-weight: 700; }
          .state-code { background: #000; color: #fff; font-size: 15pt; font-weight: 700; line-height: 6.5mm; height: 6.5mm; text-align: center; white-space: nowrap; overflow: hidden; }
          .state-name-cell { padding-left: 1.35mm; }
          .state-name strong { display: block; font-size: 10.5pt; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .state-name span { display: block; font-size: 8pt; margin-top: 0.4mm; }
          .recipient-copy-cell { padding: 0 3mm 0 3mm; }
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
          .order-number, .type-value { font-size: 11pt; font-weight: 700; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
      <body>
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
      </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
