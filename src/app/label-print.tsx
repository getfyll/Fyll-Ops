import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ListPlus, Printer, Check } from 'lucide-react-native';
import useFyllStore, { ProductVariant } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { addFyllPrintQueueItem, createInventoryPrintQueueItems } from '@/lib/fyll-print-queue';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import Svg, { Rect } from 'react-native-svg';
import { generateQrMatrix, generateQrSvg } from '@/lib/qrcode';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRODUCT_LABEL_SIZE_PRESETS: {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}[] = [
  { id: '50x30', label: '50x30mm · Standard', widthMm: 50, heightMm: 30 },
  { id: '40x30', label: '40x30mm', widthMm: 40, heightMm: 30 },
];

export default function LabelPrintScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { productId, variantId, bulk } = useLocalSearchParams<{ productId: string; variantId?: string; bulk?: string }>();
  const isBulk = bulk === '1';
  const [selectedLabelSizeId, setSelectedLabelSizeId] = useState<string>('50x30');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [queueNotice, setQueueNotice] = useState(false);

  const products = useFyllStore((s) => s.products);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const selectedLabelSize = useMemo(
    () => PRODUCT_LABEL_SIZE_PRESETS.find((preset) => preset.id === selectedLabelSizeId) ?? PRODUCT_LABEL_SIZE_PRESETS[0],
    [selectedLabelSizeId]
  );

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const variantsToPrint = useMemo(() => {
    if (!product) return [] as ProductVariant[];
    if (isBulk) return product.variants;
    const selected = product.variants.find((v) => v.id === variantId);
    return selected ? [selected] : [];
  }, [product, isBulk, variantId]);

  const getVariantName = (variant: ProductVariant) => Object.values(variant.variableValues).join(' — ');
  const getFullName = (variant: ProductVariant) => `${product?.name ?? ''} — ${getVariantName(variant)}`;
  const getProductCode = (variant: ProductVariant) => variant.barcode || variant.sku || 'fyll';

  if (!product || variantsToPrint.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.tertiary }} className="text-lg">Product not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-50">
          <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const buildLabelHtml = (
    targets: ProductVariant[],
    size: { widthMm: number; heightMm: number },
  ) => {
    const targetWidthMm = Number.isFinite(size.widthMm) && size.widthMm > 0 ? size.widthMm : 50;
    const targetHeightMm = Number.isFinite(size.heightMm) && size.heightMm > 0 ? size.heightMm : 30;
    const isLandscape = targetWidthMm >= targetHeightMm;
    const qrSizeMm = isLandscape
      ? Math.max(14, Math.min(targetHeightMm - 8, 22))
      : Math.max(14, Math.min(targetWidthMm - 8, 24));

    const labels = targets
      .map((item, index) => {
        const productCode = getProductCode(item);
        const qrSvg = productCode ? generateQrSvg(productCode, Math.round(qrSizeMm * 1.8)) : '';
        const safeSku = escapeHtml(item.sku || productCode);
        const safeName = escapeHtml(getFullName(item));
        const pageBreak = index < targets.length - 1 ? 'page-break-after: always;' : '';
        const qrCell = `
          <td class="qr-cell">
            <div class="qr-wrap">${qrSvg.replace('<svg ', '<svg class="qr" ')}</div>
            <div class="code-text">${escapeHtml(productCode)}</div>
          </td>
        `;
        const textCell = `
          <td class="text-cell">
            <div class="sku">${safeSku}</div>
            <div class="product-name">${safeName}</div>
          </td>
        `;
        // Landscape uses a single row (QR beside text); portrait stacks them as two rows.
        // Either way this is a plain HTML table, not Flexbox/Grid — see note in the <style> block.
        const rowTable = isLandscape
          ? `<table class="row-table"><tr>${qrCell}${textCell}</tr></table>`
          : `<table class="row-table"><tr>${qrCell}</tr><tr>${textCell}</tr></table>`;

        return `
          <div class="label-page" style="${pageBreak}">
            <div class="label">${rowTable}</div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @page {
              size: ${targetWidthMm}mm ${targetHeightMm}mm;
              margin: 0;
            }
            *, *::before, *::after {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              width: ${targetWidthMm}mm;
              height: ${targetHeightMm}mm;
              padding: 0;
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
              width: ${targetWidthMm}mm;
              height: ${targetHeightMm}mm;
              padding: 1.3mm;
              overflow: hidden;
            }
            .label-page:last-child {
              page-break-after: auto;
            }
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
            .qr-cell { width: ${isLandscape ? `${qrSizeMm + 4}mm` : '100%'}; text-align: center; ${isLandscape ? '' : `height: ${qrSizeMm + 6}mm;`} }
            .qr-wrap { width: ${qrSizeMm}mm; height: ${qrSizeMm}mm; margin: 0 auto; }
            .qr { width: 100%; height: 100%; display: block; }
            .code-text { font-size: 5.5pt; font-weight: 600; letter-spacing: 0.3px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.6mm; }
            .text-cell { text-align: ${isLandscape ? 'left' : 'center'}; padding-${isLandscape ? 'left' : 'top'}: 2.2mm; overflow: hidden; }
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
        <body>
          ${labels}
        </body>
      </html>
    `;
  };

  const labelSizePoints = {
    width: Math.round(selectedLabelSize.widthMm * 2.83465),
    height: Math.round(selectedLabelSize.heightMm * 2.83465),
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrinting(true);

    try {
      await Print.printAsync({
        html: buildLabelHtml(variantsToPrint, selectedLabelSize),
        width: labelSizePoints.width,
        height: labelSizePoints.height,
      });
    } catch (error) {
      console.log('Print error:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleAddToQueue = async () => {
    if (!product || variantsToPrint.length === 0 || isQueueing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsQueueing(true);
    const queueItems = createInventoryPrintQueueItems(product, variantsToPrint);
    for (const item of queueItems) {
      await addFyllPrintQueueItem(item, businessId);
    }
    setIsQueueing(false);
    setQueueNotice(true);
    setTimeout(() => setQueueNotice(false), 2500);
  };

  const previewAspectRatio = selectedLabelSize.widthMm / selectedLabelSize.heightMm;
  const previewWidth = previewAspectRatio >= 1 ? 260 : 180;
  const isLandscape = selectedLabelSize.widthMm >= selectedLabelSize.heightMm;
  const qrBoxSize = isLandscape ? 78 : 96;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.primary }}>
          <Pressable onPress={() => router.back()} className="mr-4 active:opacity-50">
            <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <View className="flex-1">
            <Text style={{ color: colors.text.primary }} className="font-bold text-lg">
              {isBulk ? 'Bulk Labels' : 'Print Label'}
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs">
              {isBulk ? `${variantsToPrint.length} label${variantsToPrint.length === 1 ? '' : 's'} · ${selectedLabelSize.widthMm}x${selectedLabelSize.heightMm}mm` : `${selectedLabelSize.widthMm}x${selectedLabelSize.heightMm}mm`}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 16 }}>
          {PRODUCT_LABEL_SIZE_PRESETS.map((preset) => {
            const active = preset.id === selectedLabelSize.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => setSelectedLabelSizeId(preset.id)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? '#111111' : colors.border.light,
                  backgroundColor: active ? '#111111' : colors.bg.secondary,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: active ? '#FFFFFF' : colors.text.primary, fontSize: 12, fontWeight: '700' }}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg.secondary }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1, justifyContent: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4">
            {variantsToPrint.map((item) => {
              const productCode = getProductCode(item);
              const qrMatrix = generateQrMatrix(productCode);
              return (
                <View
                  key={item.id}
                  className="overflow-hidden"
                  style={{
                    alignSelf: 'center',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: '#111111',
                    width: previewWidth,
                    aspectRatio: previewAspectRatio,
                    padding: 10,
                    flexDirection: isLandscape ? 'row' : 'column',
                    alignItems: 'center',
                    justifyContent: isLandscape ? 'flex-start' : 'center',
                    gap: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 5,
                  }}
                >
                  <View style={{ alignItems: 'center', flexShrink: 0 }}>
                    <Svg
                      width={qrBoxSize}
                      height={qrBoxSize}
                      viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                    >
                      {qrMatrix.map((row, rowIndex) =>
                        row.map((filled, colIndex) =>
                          filled ? (
                            <Rect
                              key={`${rowIndex}-${colIndex}`}
                              x={colIndex}
                              y={rowIndex}
                              width={1}
                              height={1}
                              fill="#000000"
                            />
                          ) : null
                        )
                      )}
                    </Svg>
                    <Text style={{ color: '#555555', fontSize: 8, fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
                      {productCode}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: isLandscape ? 'flex-start' : 'center', justifyContent: 'center', minWidth: 0 }}>
                    <Text
                      style={{ color: '#000000', fontSize: 11, fontWeight: '800', letterSpacing: 0.2, textAlign: isLandscape ? 'left' : 'center' }}
                      numberOfLines={2}
                    >
                      {item.sku || productCode}
                    </Text>
                    <Text
                      style={{ color: '#111111', fontSize: 9.5, fontWeight: '600', marginTop: 4, textAlign: isLandscape ? 'left' : 'center' }}
                      numberOfLines={3}
                    >
                      {getFullName(item)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 14, backgroundColor: colors.bg.primary, borderTopWidth: 1, borderTopColor: colors.border.light }}>
          {queueNotice ? (
            <View className="flex-row items-center justify-center mb-3">
              <Check size={14} color="#16A34A" strokeWidth={2.5} />
              <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                Added to FYLL Print queue
              </Text>
            </View>
          ) : null}
          <View className="flex-row gap-3">
            <Pressable
              onPress={handleAddToQueue}
              disabled={isQueueing}
              className="flex-1 rounded-full items-center justify-center flex-row active:opacity-80"
              style={{ height: 56, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
            >
              {isQueueing ? (
                <ActivityIndicator color={colors.text.primary} size="small" />
              ) : (
                <>
                  <ListPlus size={18} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold ml-2">
                    Send to Queue
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handlePrint}
              disabled={isPrinting}
              className="flex-1 rounded-full items-center justify-center flex-row active:opacity-80"
              style={{ height: 56, backgroundColor: '#111111', opacity: isPrinting ? 0.7 : 1 }}
            >
              {isPrinting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={18} color="#FFFFFF" strokeWidth={2} />
                  <Text className="text-white font-semibold text-sm ml-2">
                    {isBulk ? 'Print All' : 'Print Now'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
