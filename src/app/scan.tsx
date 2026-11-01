import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { X, Zap, ZapOff, Package, ShoppingCart, ScanLine, Plus, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

type ScanMode = 'add-stock' | 'sell';

interface ScannedProduct {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  stock: number;
  barcode: string;
  sellingPrice: number;
}

const MODES: { key: ScanMode; label: string }[] = [
  { key: 'sell', label: 'Sell item' },
  { key: 'add-stock', label: 'Add stock' },
];

const GLASS = 'rgba(20,20,20,0.62)';
const CORNER = 36;

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const [fontLoaded] = useFonts({ BricolageGrotesque_600SemiBold });
  const semiBold = fontLoaded ? ({ fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' } as const) : ({ fontWeight: '600' } as const);
  const products = useFyllStore((s) => s.products);
  const updateVariantStock = useFyllStore((s) => s.updateVariantStock);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<ScanMode>('sell');
  const [scanned, setScanned] = useState<boolean>(false);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [addedCount, setAddedCount] = useState<number>(0);

  const frameSize = Math.min(width * 0.72, 320);

  const resetScanState = () => {
    setScanned(false);
    setScannedProduct(null);
    setNotFound(false);
    setAddedCount(0);
  };

  const findProductByBarcode = useCallback(
    (barcode: string): ScannedProduct | null => {
      for (const product of products) {
        for (const variant of product.variants) {
          if (variant.barcode === barcode || variant.sku === barcode) {
            const variantName = Object.values(variant.variableValues).join(' / ');
            return {
              productId: product.id,
              variantId: variant.id,
              productName: product.name,
              variantName,
              stock: variant.stock,
              barcode: variant.barcode,
              sellingPrice: variant.sellingPrice,
            };
          }
        }
      }
      return null;
    },
    [products]
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (scanned) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanned(true);
      const found = findProductByBarcode(result.data);
      if (found) {
        setScannedProduct(found);
        setNotFound(false);
      } else {
        setScannedProduct(null);
        setNotFound(true);
      }
    },
    [scanned, findProductByBarcode]
  );

  const handleAddStock = () => {
    if (!scannedProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void updateVariantStock(scannedProduct.productId, scannedProduct.variantId, 1, businessId);
    setAddedCount((count) => count + 1);
    const updated = findProductByBarcode(scannedProduct.barcode);
    if (updated) setScannedProduct(updated);
  };

  const handleSell = () => {
    if (!scannedProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace({
      pathname: '/new-order',
      params: {
        prefillProductId: scannedProduct.productId,
        prefillVariantId: scannedProduct.variantId,
      },
    });
  };

  const handleScanAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetScanState();
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetScanState();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const primaryButton = (disabled: boolean) => (state: PressableStateCallbackType) => ({
    flex: 1,
    height: 52,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: disabled ? palette.softFill : isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME,
  });

  const secondaryButton = (state: PressableStateCallbackType) => ({
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: isHovered(state) || state.pressed ? palette.softFill : palette.inset,
  });

  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.muted, fontSize: 15 }}>Opening camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }}>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? palette.softFill : palette.card, borderWidth: 1, borderColor: palette.border })}
        >
          <X size={20} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
            <ScanLine size={36} color={palette.limeOnSurface} strokeWidth={1.8} />
          </View>
          <MoneyText style={{ color: palette.text, fontSize: 24, letterSpacing: -0.5, textAlign: 'center', marginTop: 22 }}>Allow camera access</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 300 }}>
            Fyll uses your camera to read barcodes and QR codes, so you can sell or restock in a tap.
          </Text>
        </View>
        <Pressable
          onPress={requestPermission}
          accessibilityRole="button"
          style={(state) => ({ height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
        >
          <Text style={[{ color: FYLL_LIME_INK, fontSize: 16 }, semiBold]}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  const outOfStock = scannedProduct ? scannedProduct.stock <= 0 : false;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar barStyle="light-content" />

      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Top bar: close, title, torch. Floats over the camera on glass circles. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? 'rgba(60,60,60,0.8)' : GLASS })}
          >
            <X size={20} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>

          <MoneyText style={{ color: '#FFFFFF', fontSize: 18, letterSpacing: -0.3 }}>Scan</MoneyText>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTorch((current) => !current);
            }}
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: torch ? FYLL_LIME : GLASS }}
          >
            {torch ? <Zap size={20} color={FYLL_LIME_INK} strokeWidth={2.2} /> : <ZapOff size={20} color="#FFFFFF" strokeWidth={2.2} />}
          </Pressable>
        </View>

        {/* Mode switcher: same lime pill as the other switchers in the app. */}
        <View style={{ alignSelf: 'center', flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: GLASS }}>
          {MODES.map((mode) => {
            const active = scanMode === mode.key;
            return (
              <Pressable
                key={mode.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setScanMode(mode.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ height: 38, minWidth: 108, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : 'transparent' }}
              >
                <Text style={[{ fontSize: 14, color: active ? FYLL_LIME_INK : 'rgba(255,255,255,0.8)' }, semiBold]}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Viewfinder */}
      {scanned ? null : (
        <Animated.View
          entering={FadeIn.duration(220)}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: frameSize, height: frameSize }}>
            <View style={{ position: 'absolute', top: 0, left: 0, width: CORNER, height: CORNER, borderTopWidth: 4, borderLeftWidth: 4, borderColor: FYLL_LIME, borderTopLeftRadius: 24 }} />
            <View style={{ position: 'absolute', top: 0, right: 0, width: CORNER, height: CORNER, borderTopWidth: 4, borderRightWidth: 4, borderColor: FYLL_LIME, borderTopRightRadius: 24 }} />
            <View style={{ position: 'absolute', bottom: 0, left: 0, width: CORNER, height: CORNER, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: FYLL_LIME, borderBottomLeftRadius: 24 }} />
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: CORNER, height: CORNER, borderBottomWidth: 4, borderRightWidth: 4, borderColor: FYLL_LIME, borderBottomRightRadius: 24 }} />
          </View>
          <View style={{ marginTop: 28, height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: GLASS }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '500' }}>
              {scanMode === 'sell' ? 'Point at a barcode to sell it' : 'Point at a barcode to add stock'}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Result sheet */}
      {scanned ? (
        <Animated.View
          entering={FadeInDown.duration(260)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: insets.bottom + 20,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: palette.border,
          }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline, marginBottom: 16 }} />

          {scannedProduct ? (
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                  <Package size={24} color={palette.limeOnSurface} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <MoneyText style={{ color: palette.text, fontSize: 18, letterSpacing: -0.3 }} numberOfLines={2}>{scannedProduct.productName}</MoneyText>
                  {scannedProduct.variantName ? (
                    <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{scannedProduct.variantName}</Text>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, padding: 14, borderRadius: 20, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border, gap: 4 }}>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>In stock</Text>
                  <MoneyText style={{ color: outOfStock ? '#F87171' : palette.text, fontSize: 22, letterSpacing: -0.4 }}>{scannedProduct.stock}</MoneyText>
                </View>
                <View style={{ flex: 1, padding: 14, borderRadius: 20, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border, gap: 4 }}>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Price</Text>
                  <MoneyText style={{ color: palette.text, fontSize: 22, letterSpacing: -0.4 }} numberOfLines={1}>{formatCurrency(scannedProduct.sellingPrice)}</MoneyText>
                </View>
              </View>

              {scanMode === 'add-stock' ? (
                <View style={{ gap: 10 }}>
                  {addedCount > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Check size={15} color={palette.limeOnSurface} strokeWidth={2.8} />
                      <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '700' }}>Added {addedCount} so far</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={handleAddStock} accessibilityRole="button" style={primaryButton(false)}>
                      <Plus size={19} color={FYLL_LIME_INK} strokeWidth={2.6} />
                      <Text style={[{ color: FYLL_LIME_INK, fontSize: 16 }, semiBold]}>Add 1 to stock</Text>
                    </Pressable>
                    <Pressable onPress={handleScanAgain} accessibilityRole="button" style={secondaryButton}>
                      <Text style={[{ color: palette.text, fontSize: 15 }, semiBold]}>Scan next</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={handleClose} accessibilityRole="button" style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[{ color: palette.muted, fontSize: 14 }, semiBold]}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={handleSell} disabled={outOfStock} accessibilityRole="button" style={primaryButton(outOfStock)}>
                    <ShoppingCart size={19} color={outOfStock ? palette.faint : FYLL_LIME_INK} strokeWidth={2.4} />
                    <Text style={[{ color: outOfStock ? palette.faint : FYLL_LIME_INK, fontSize: 16 }, semiBold]}>{outOfStock ? 'Out of stock' : 'Create order'}</Text>
                  </Pressable>
                  <Pressable onPress={handleScanAgain} accessibilityRole="button" style={secondaryButton}>
                    <Text style={[{ color: palette.text, fontSize: 15 }, semiBold]}>Scan again</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : notFound ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, marginBottom: 8 }}>
                <ScanLine size={28} color={palette.muted} strokeWidth={1.8} />
              </View>
              <MoneyText style={{ color: palette.text, fontSize: 20, letterSpacing: -0.4 }}>Product not found</MoneyText>
              <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 }}>
                This barcode isn't linked to anything in your inventory yet.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
                <Pressable onPress={handleScanAgain} accessibilityRole="button" style={primaryButton(false)}>
                  <Text style={[{ color: FYLL_LIME_INK, fontSize: 16 }, semiBold]}>Scan again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
