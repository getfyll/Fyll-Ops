import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Dimensions, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { X, Zap, ZapOff, Package, ShoppingCart, AlertCircle, Plus } from 'lucide-react-native';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const SCAN_AREA_SIZE = width * 0.7;

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

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const products = useFyllStore((s) => s.products);
  const updateVariantStock = useFyllStore((s) => s.updateVariantStock);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('sell');
  const [scanned, setScanned] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [notFound, setNotFound] = useState(false);

  const resetScanState = () => {
    setScanned(false);
    setScannedProduct(null);
    setNotFound(false);
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
    // Refresh the product info
    const updated = findProductByBarcode(scannedProduct.barcode);
    if (updated) setScannedProduct(updated);
  };

  const handleSell = () => {
    if (!scannedProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to new order with this product pre-filled
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

  const handleCompleteAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetScanState();
  };

  const handleFinishAddStock = () => {
    handleCompleteAdd();
    router.back();
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetScanState();
    router.back();
  };

  if (!permission) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-500 text-lg">Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-8">
        <View className="w-20 h-20 rounded-full items-center justify-center mb-6 bg-gray-100">
          <AlertCircle size={40} color="#F59E0B" strokeWidth={1.5} />
        </View>
        <Text className="text-gray-900 text-xl font-bold text-center">Camera Access Required</Text>
        <Text className="text-gray-500 text-sm text-center mt-2 mb-6">
          We need camera access to scan barcodes and QR codes for your inventory
        </Text>
        <Pressable
          onPress={requestPermission}
          className="bg-[#111111] px-8 py-4 rounded-2xl active:opacity-80"
        >
          <Text className="text-white font-bold">Grant Permission</Text>
        </Pressable>
        <Pressable onPress={handleClose} className="mt-4 px-6 py-3 active:opacity-50">
          <Text className="text-gray-500 font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />

      {/* Header - Fixed at top with safe area + 60px for Dynamic Island */}
      <View
        className="absolute top-0 left-0 right-0 z-50"
        style={{
          paddingTop: Math.max(insets.top, 60) + 8,
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
      >
        <View className="flex-row items-center justify-between px-5 pb-4">
          <Pressable
            onPress={handleClose}
            className="w-12 h-12 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <X size={24} color="#FFFFFF" strokeWidth={2} />
          </Pressable>

          <Text className="text-white font-bold text-lg">Scan Barcode</Text>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTorch(!torch);
            }}
            className="w-12 h-12 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: torch ? '#FFFFFF' : 'rgba(255,255,255,0.2)' }}
          >
            {torch ? (
              <Zap size={24} color="#111111" strokeWidth={2} />
            ) : (
              <ZapOff size={24} color="#FFFFFF" strokeWidth={2} />
            )}
          </Pressable>
        </View>

        {/* Mode Selector */}
        <View className="px-5 pb-4">
          <View className="flex-row bg-white/20 rounded-xl p-1">
            <Pressable
              onPress={() => setScanMode('sell')}
              className={cn(
                'flex-1 py-3 rounded-lg items-center',
                scanMode === 'sell' ? 'bg-white' : ''
              )}
            >
              <Text
                className={cn(
                  'font-semibold text-sm',
                  scanMode === 'sell' ? 'text-gray-900' : 'text-white/80'
                )}
              >
                Sell Item
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setScanMode('add-stock')}
              className={cn(
                'flex-1 py-3 rounded-lg items-center',
                scanMode === 'add-stock' ? 'bg-white' : ''
              )}
            >
              <Text
                className={cn(
                  'font-semibold text-sm',
                  scanMode === 'add-stock' ? 'text-gray-900' : 'text-white/80'
                )}
              >
                Add Stock
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Camera View - Full screen behind header */}
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        {/* Scan Area Indicator */}
        {!scanned && (
          <View className="flex-1 items-center justify-center">
            <View
              style={{
                width: SCAN_AREA_SIZE,
                height: SCAN_AREA_SIZE,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.3)',
                borderRadius: 24,
              }}
            >
              {/* Corner accents */}
              <View className="absolute -top-0.5 -left-0.5 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-3xl" />
              <View className="absolute -top-0.5 -right-0.5 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-3xl" />
              <View className="absolute -bottom-0.5 -left-0.5 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-3xl" />
              <View className="absolute -bottom-0.5 -right-0.5 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-3xl" />
            </View>
            <Text className="text-white/70 text-sm mt-6">
              Position barcode within the frame
            </Text>
          </View>
        )}
      </CameraView>

      {/* Scanned Result Modal */}
      {scanned && (
        <View          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="w-12 h-1.5 bg-gray-300 rounded-full self-center mt-3 mb-4" />

          {scannedProduct ? (
            <View className="px-5">
              <View className="flex-row items-center mb-4">
                <View className="w-14 h-14 bg-gray-100 rounded-2xl items-center justify-center mr-4">
                  <Package size={28} color="#111111" strokeWidth={1.5} />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 font-bold text-lg">{scannedProduct.productName}</Text>
                  <Text className="text-gray-500 text-sm">{scannedProduct.variantName}</Text>
                </View>
              </View>

              <View className="flex-row justify-between py-4 border-y border-gray-100 mb-4">
                <View>
                  <Text className="text-gray-500 text-xs">Stock</Text>
                  <Text className="text-gray-900 font-bold text-lg">{scannedProduct.stock}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-gray-500 text-xs">Price</Text>
                  <Text className="text-gray-900 font-bold text-lg">
                    {formatCurrency(scannedProduct.sellingPrice)}
                  </Text>
                </View>
              </View>

              {scanMode === 'add-stock' ? (
                <>
                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={handleAddStock}
                      className="flex-1 bg-[#111111] py-4 rounded-2xl items-center flex-row justify-center active:opacity-80"
                    >
                      <Plus size={20} color="#FFFFFF" strokeWidth={2} />
                      <Text className="text-white font-bold text-base ml-2">Add 1 to Stock</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleScanAgain}
                      className="bg-gray-100 px-5 py-4 rounded-2xl items-center active:opacity-70"
                    >
                      <Text className="text-gray-700 font-semibold">Scan Again</Text>
                    </Pressable>
                  </View>
                  <View className="mt-4">
                    <Pressable
                      onPress={handleFinishAddStock}
                      className="rounded-2xl border border-gray-200 py-4 px-6 items-center active:opacity-80"
                      style={{ backgroundColor: '#F9FAFB' }}
                    >
                      <Text className="text-gray-900 font-semibold text-base">Complete</Text>
                      <Text className="text-xs text-gray-500 mt-1">Close scanner</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={handleSell}
                    disabled={scannedProduct.stock === 0}
                    className={cn(
                      'flex-1 py-4 rounded-2xl items-center flex-row justify-center',
                      scannedProduct.stock > 0 ? 'bg-[#111111] active:opacity-80' : 'bg-gray-200'
                    )}
                  >
                    <ShoppingCart
                      size={20}
                      color={scannedProduct.stock > 0 ? '#FFFFFF' : '#9CA3AF'}
                      strokeWidth={2}
                    />
                    <Text
                      className={cn(
                        'font-bold text-base ml-2',
                        scannedProduct.stock > 0 ? 'text-white' : 'text-gray-400'
                      )}
                    >
                      {scannedProduct.stock > 0 ? 'Create Order' : 'Out of Stock'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleScanAgain}
                    className="bg-gray-100 px-5 py-4 rounded-2xl items-center active:opacity-70"
                  >
                    <Text className="text-gray-700 font-semibold">Scan Again</Text>
                  </Pressable>
                </View>
              )}
          </View>
        ) : notFound ? (
            <View className="px-5 items-center">
              <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center mb-4">
                <AlertCircle size={32} color="#EF4444" strokeWidth={2} />
              </View>
              <Text className="text-gray-900 font-bold text-lg mb-1">Product Not Found</Text>
              <Text className="text-gray-500 text-sm text-center mb-4">
                This barcode is not linked to any product in your inventory
              </Text>
              <Pressable
                onPress={handleScanAgain}
                className="bg-[#111111] px-8 py-4 rounded-2xl active:opacity-80"
              >
                <Text className="text-white font-semibold">Scan Again</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
