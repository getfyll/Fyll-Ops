import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ListPlus, Printer, Check, Minus, Plus } from 'lucide-react-native';
import useFyllStore, { ProductVariant, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { addFyllPrintQueueItem, createInventoryPrintQueueItems } from '@/lib/fyll-print-queue';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import Svg, { Rect } from 'react-native-svg';
import { generateQrMatrix, generateQrSvg } from '@/lib/qrcode';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getNameInitials } from '@/lib/day-group';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

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
  { id: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: '40x30', label: '40 × 30 mm', widthMm: 40, heightMm: 30 },
];

const MAX_COPIES = 99;

// One on/off switch in the "On the label" card.
function OptionSwitch({ label, value, onChange, last, palette, compact = false }: { label: string; value: boolean; onChange: (next: boolean) => void; last: boolean; palette: ReturnType<typeof usePaymentsPalette>; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline }}
    >
      <Text style={{ color: palette.text, fontSize: compact ? 12 : 14.5 }}>{label}</Text>
      <View style={{ width: 40, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center', alignItems: value ? 'flex-end' : 'flex-start', backgroundColor: value ? FYLL_LIME : palette.outline }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: value ? FYLL_LIME_INK : palette.card }} />
      </View>
    </Pressable>
  );
}

export default function LabelPrintScreen() {
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { productId, variantId, bulk } = useLocalSearchParams<{ productId: string; variantId?: string; bulk?: string }>();
  const isBulk = bulk === '1';
  const [selectedLabelSizeId, setSelectedLabelSizeId] = useState<string>('50x30');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [queueNotice, setQueueNotice] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  // What goes on the label. The defaults match the labels as they were before: name and SKU, no price.
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [showSku, setShowSku] = useState(true);
  const [copies, setCopies] = useState<Record<string, number>>({});

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
  const copiesFor = (variant: ProductVariant) => copies[variant.id] ?? 1;
  const setCopiesFor = (variant: ProductVariant, next: number) => setCopies((current) => ({ ...current, [variant.id]: Math.max(0, Math.min(MAX_COPIES, next)) }));

  // Variants that will print, each repeated by its number of copies.
  const printTargets = useMemo(
    () => variantsToPrint.flatMap((variant) => Array.from({ length: copies[variant.id] ?? 1 }, () => variant)),
    [variantsToPrint, copies]
  );
  const totalLabels = printTargets.length;
  const variantsWithCopies = variantsToPrint.filter((variant) => (copies[variant.id] ?? 1) > 0);
  const stockTotal = variantsToPrint.reduce((sum, variant) => sum + Math.max(0, variant.stock ?? 0), 0);

  if (!product || variantsToPrint.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: palette.page }}>
        <Text style={{ color: palette.muted, fontSize: 17 }}>Product not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-50">
          <Text style={{ color: palette.text, fontWeight: '600' }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const buildLabelHtml = (
    targets: ProductVariant[],
    size: { widthMm: number; heightMm: number },
    show: { name: boolean; price: boolean; sku: boolean },
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
        const safeProduct = escapeHtml(product?.name ?? '');
        const safeVariant = escapeHtml(getVariantName(item));
        // The title is the product name (or the SKU when the name is switched off); the code sits on the right in mono.
        const safeTitle = show.name ? safeProduct : safeSku;
        const safeCodeLine = escapeHtml(show.sku && item.sku ? `${item.sku} · ${productCode}` : productCode);
        const pageBreak = index < targets.length - 1 ? 'page-break-after: always;' : '';
        const qrCell = `
          <td class="qr-cell">
            <div class="qr-wrap">${qrSvg.replace('<svg ', '<svg class="qr" ')}</div>
          </td>
        `;
        const textCell = `
          <td class="text-cell">
            <div class="title">${safeTitle}</div>
            ${safeVariant ? `<div class="variant">${safeVariant}</div>` : ''}
            ${show.price ? `<div class="price">${escapeHtml(formatCurrency(item.sellingPrice))}</div>` : ''}
            <div class="code-line">${safeCodeLine}</div>
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
            .title {
              font-size: ${targetWidthMm >= 50 ? '10pt' : '8.5pt'};
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
            .price {
              font-size: 8.5pt;
              font-weight: 800;
              color: #000;
              margin-top: 0.8mm;
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
    if (isPrinting || totalLabels === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrinting(true);

    try {
      await Print.printAsync({
        html: buildLabelHtml(printTargets, selectedLabelSize, { name: showName, price: showPrice, sku: showSku }),
        width: labelSizePoints.width,
        height: labelSizePoints.height,
      });
    } catch (error) {
      console.log('Print error:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  // The print queue keeps one entry per variant, with its number of copies.
  const handleAddToQueue = async () => {
    if (!product || variantsWithCopies.length === 0 || isQueueing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsQueueing(true);
    const queueItems = createInventoryPrintQueueItems(product, variantsWithCopies, Object.fromEntries(variantsWithCopies.map((variant) => [variant.id, copiesFor(variant)])));
    for (const item of queueItems) {
      await addFyllPrintQueueItem(item, businessId);
    }
    setIsQueueing(false);
    setQueuedCount(queueItems.length);
    setQueueNotice(true);
    setTimeout(() => setQueueNotice(false), 2600);
  };

  const previewAspectRatio = selectedLabelSize.widthMm / selectedLabelSize.heightMm;
  const previewWidth = isWebDesktop ? (previewAspectRatio >= 1 ? 300 : 200) : (previewAspectRatio >= 1 ? 260 : 180);
  const isLandscape = selectedLabelSize.widthMm >= selectedLabelSize.heightMm;
  const qrBoxSize = isWebDesktop ? (isLandscape ? 104 : 110) : (isLandscape ? 78 : 96);
  const sizeText = `${selectedLabelSize.widthMm} × ${selectedLabelSize.heightMm} mm`;
  const canPrint = totalLabels > 0 && !isPrinting;
  const subtitle = `${product.name} · ${variantsToPrint.length} variant${variantsToPrint.length === 1 ? '' : 's'}`;

  const capLabel = (text: string) => (
    <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{text}</Text>
  );
  const cardStyle = { borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;

  const queueButton = (
    <Pressable
      onPress={handleAddToQueue}
      disabled={isQueueing || variantsWithCopies.length === 0}
      accessibilityRole="button"
      style={(state) => ({ height: isWebDesktop ? 42 : 52, paddingHorizontal: 18, flex: isWebDesktop ? undefined : 1, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: variantsWithCopies.length === 0 ? 0.45 : 1 })}
    >
      {isQueueing ? <ActivityIndicator color={palette.text} size="small" /> : <ListPlus size={16} color={palette.text} strokeWidth={2} />}
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Add to print queue</Text>
    </Pressable>
  );
  const printButton = (
    <Pressable
      onPress={handlePrint}
      disabled={!canPrint}
      accessibilityRole="button"
      style={(state) => ({ height: isWebDesktop ? 42 : 52, paddingHorizontal: 22, flex: isWebDesktop ? undefined : 1, borderRadius: 999, backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canPrint ? 1 : 0.45 })}
    >
      {isPrinting ? <ActivityIndicator color={FYLL_LIME_INK} size="small" /> : <Printer size={16} color={FYLL_LIME_INK} strokeWidth={2.2} />}
      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{`Print ${totalLabels} label${totalLabels === 1 ? '' : 's'}`}</Text>
    </Pressable>
  );

  const variantsCard = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {capLabel('Variants')}
        <Pressable onPress={() => setCopies({})} accessibilityRole="button">
          <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>Reset to 1 each</Text>
        </Pressable>
      </View>
      <View style={{ ...cardStyle, paddingHorizontal: 16 }}>
        {variantsToPrint.map((variant, index) => {
          const count = copiesFor(variant);
          return (
            <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, opacity: count > 0 ? 1 : 0.45 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 11, fontWeight: '700' }}>{getNameInitials(getVariantName(variant) || variant.sku)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12, fontWeight: '500' }} numberOfLines={1}>{getVariantName(variant) || variant.sku || 'Variant'}</Text>
                <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 12 : 10 }} numberOfLines={1}>{variant.sku || getProductCode(variant)} · {variant.stock ?? 0} in stock</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fewer labels" onPress={() => setCopiesFor(variant, count - 1)} style={(state) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent' })}>
                <Minus size={15} color={palette.text} strokeWidth={2.2} />
              </Pressable>
              <Text style={{ width: 24, textAlign: 'center', color: palette.text, fontSize: isWebDesktop ? 15 : 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{count}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="More labels" onPress={() => setCopiesFor(variant, count + 1)} style={(state) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent' })}>
                <Plus size={15} color={palette.text} strokeWidth={2.2} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <Pressable
        onPress={() => setCopies(Object.fromEntries(variantsToPrint.map((variant) => [variant.id, Math.max(0, Math.min(MAX_COPIES, variant.stock ?? 0))])))}
        accessibilityRole="button"
        style={(state) => ({ height: 46, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
      >
        <Text style={{ color: palette.textSoft, fontSize: 13.5, fontWeight: '600' }}>Match quantities to stock ({stockTotal})</Text>
      </Pressable>
    </View>
  );

  const previewCards = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 22, paddingTop: 12 }}>
      {variantsWithCopies.map((item) => {
        const productCode = getProductCode(item);
        const qrMatrix = generateQrMatrix(productCode);
        return (
          <View key={item.id} style={{ width: previewWidth, aspectRatio: previewAspectRatio }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                padding: 12,
                flexDirection: isLandscape ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: isLandscape ? 'flex-start' : 'center',
                gap: 12,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.35,
                shadowRadius: 18,
                elevation: 6,
              }}
            >
              <View style={{ alignItems: 'center', flexShrink: 0 }}>
                <Svg width={qrBoxSize} height={qrBoxSize} viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}>
                  {qrMatrix.map((row, rowIndex) =>
                    row.map((filled, colIndex) =>
                      filled ? <Rect key={`${rowIndex}-${colIndex}`} x={colIndex} y={rowIndex} width={1} height={1} fill="#000000" /> : null
                    )
                  )}
                </Svg>
              </View>
              <View style={{ flex: 1, alignItems: isLandscape ? 'flex-start' : 'center', justifyContent: 'center', minWidth: 0, gap: 2 }}>
                <Text style={{ color: '#000000', fontSize: isWebDesktop ? 20 : 15, fontWeight: '800', letterSpacing: -0.3, lineHeight: isWebDesktop ? 22 : 17, textAlign: isLandscape ? 'left' : 'center' }} numberOfLines={2}>
                  {showName ? (product.name) : (item.sku || productCode)}
                </Text>
                {getVariantName(item) ? (
                  <Text style={{ color: '#444444', fontSize: isWebDesktop ? 13 : 11, fontWeight: '700', textAlign: isLandscape ? 'left' : 'center' }} numberOfLines={2}>{getVariantName(item)}</Text>
                ) : null}
                {showPrice ? (
                  <Text style={{ color: '#000000', fontSize: isWebDesktop ? 15 : 12, fontWeight: '800', textAlign: isLandscape ? 'left' : 'center' }} numberOfLines={1}>{formatCurrency(item.sellingPrice)}</Text>
                ) : null}
                <Text style={{ color: '#666666', fontSize: isWebDesktop ? 10 : 8.5, fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.3, marginTop: 2, textAlign: isLandscape ? 'left' : 'center' }} numberOfLines={2}>
                  {showSku && item.sku ? `${item.sku} · ${productCode}` : productCode}
                </Text>
              </View>
            </View>
            <View style={{ position: 'absolute', top: -9, right: -9, minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '800' }}>×{copiesFor(item)}</Text>
            </View>
          </View>
        );
      })}
      {variantsWithCopies.length === 0 ? (
        <Text style={{ color: palette.faint, fontSize: 14, paddingVertical: 40 }}>Add at least one label to see the preview.</Text>
      ) : null}
    </View>
  );

  const sizePicker = (
    <View style={{ gap: 10 }}>
      {capLabel('Label size')}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border }}>
        {PRODUCT_LABEL_SIZE_PRESETS.map((preset) => {
          const active = preset.id === selectedLabelSize.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedLabelSizeId(preset.id);
              }}
              style={{ flex: 1, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : 'transparent' }}
            >
              <Text style={{ color: active ? FYLL_LIME_INK : palette.muted, fontSize: 13.5, fontWeight: '600' }}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const optionsCard = (
    <View style={{ gap: 10 }}>
      {capLabel('On the label')}
      <View style={{ ...cardStyle, paddingHorizontal: 16, paddingVertical: 2 }}>
        <OptionSwitch label="Product name" value={showName} onChange={setShowName} last={false} palette={palette} compact={!isWebDesktop} />
        <OptionSwitch label="Price" value={showPrice} onChange={setShowPrice} last={false} palette={palette} compact={!isWebDesktop} />
        <OptionSwitch label="SKU code" value={showSku} onChange={setShowSku} last palette={palette} compact={!isWebDesktop} />
      </View>
    </View>
  );

  // The printer is chosen in your device's print dialog, so this says so rather than naming one.
  const printerCard = (
    <View style={{ gap: 10 }}>
      {capLabel('Printer')}
      <View style={{ ...cardStyle, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
          <Printer size={16} color={palette.limeOnSurface} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: isWebDesktop ? 14.5 : 12, fontWeight: '500' }}>Choose when you print</Text>
          <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 12.5 : 10 }}>Your device's print dialog opens. Pick the label printer there.</Text>
        </View>
      </View>
    </View>
  );

  const readyCard = (
    <View style={{ ...cardStyle, padding: 16, gap: 6 }}>
      {capLabel('Ready to print')}
      <MoneyText style={{ color: palette.text, fontSize: 30, letterSpacing: -0.6 }}>{totalLabels} label{totalLabels === 1 ? '' : 's'}</MoneyText>
      <Text style={{ color: palette.faint, fontSize: 13 }}>{variantsWithCopies.length} variant{variantsWithCopies.length === 1 ? '' : 's'} · {sizeText}</Text>
    </View>
  );

  const backButton = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={(state) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
    >
      <ArrowLeft size={18} color={palette.text} strokeWidth={2.2} />
    </Pressable>
  );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: isWebDesktop ? 28 : 16, paddingVertical: isWebDesktop ? 18 : 12 }}>
      {backButton}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <MoneyText style={{ color: palette.text, fontSize: isWebDesktop ? 26 : 22, letterSpacing: -0.6 }} numberOfLines={1}>{isBulk ? 'Print labels' : 'Print label'}</MoneyText>
        <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{subtitle}</Text>
      </View>
      {isWebDesktop ? (
        <>
          {queueButton}
          {printButton}
        </>
      ) : null}
    </View>
  );

  // A toast at the top of the screen when something has been added to the print queue.
  const queueToast = queueNotice ? (
    <Animated.View
      pointerEvents="none"
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(200)}
      style={{ position: 'absolute', top: Math.max(insets.top, 12) + 8, left: 16, right: 16, alignItems: 'center', zIndex: 100 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 48,
          paddingLeft: 10,
          paddingRight: 18,
          borderRadius: 999,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.nudgeBorder,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 18,
          elevation: 10,
          ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 32px rgba(0,0,0,0.35)' } as object) : null),
        }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
          <Check size={15} color={FYLL_LIME_INK} strokeWidth={3} />
        </View>
        <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>
          {queuedCount === 1 ? 'Added to the print queue' : `${queuedCount} variants added to the print queue`}
        </Text>
      </View>
    </Animated.View>
  ) : null;

  if (isWebDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page }}>
        <SafeAreaView className="flex-1" edges={['top']}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: palette.hairline }}>{header}</View>
          <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
            <ScrollView style={{ width: 360, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: palette.hairline }} contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
              {variantsCard}
            </ScrollView>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                {capLabel(`Preview · ${sizeText}`)}
                <Text style={{ color: palette.faint, fontSize: 13 }}>{totalLabels} label{totalLabels === 1 ? '' : 's'} in total</Text>
              </View>
              {previewCards}
            </ScrollView>
            <ScrollView style={{ width: 320, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: palette.hairline }} contentContainerStyle={{ padding: 24, gap: 22 }} showsVerticalScrollIndicator={false}>
              {sizePicker}
              {optionsCard}
              {printerCard}
              {readyCard}
            </ScrollView>
          </View>
        </SafeAreaView>
        {queueToast}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {header}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24, gap: 22 }} showsVerticalScrollIndicator={false}>
          {sizePicker}
          <View style={{ gap: 10 }}>
            {capLabel(`Preview · ${sizeText}`)}
            {previewCards}
          </View>
          {variantsCard}
          {optionsCard}
          {printerCard}
          {readyCard}
        </ScrollView>

        {/* Bottom actions */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 12, backgroundColor: palette.page, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {queueButton}
            {printButton}
          </View>
        </View>
      </SafeAreaView>
      {queueToast}
    </View>
  );
}
