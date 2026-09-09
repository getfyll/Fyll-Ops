import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Search, Package, ChevronRight, ChevronDown, ChevronUp, Minus, Tag, Boxes, ClipboardList, Printer, Filter, Check, X, PackagePlus, ArrowDownAZ, ArrowUpAZ, Clock, TrendingUp, TrendingDown, AlertTriangle, Briefcase, Trash2, Archive } from 'lucide-react-native';
import useFyllStore, { Product, ProductVariant, type Procurement, formatCurrency } from '@/lib/state/fyll-store';
import { normalizeProductType } from '@/lib/product-utils';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { getActiveSplitCardStyle } from '@/lib/selection-style';
import { SplitViewLayout } from '@/components/SplitViewLayout';
import { ProductDetailPanel } from '@/components/ProductDetailPanel';
import { ServiceDetailPanel } from '@/components/ServiceDetailPanel';
import { ProductCardSkeleton } from '@/components/SkeletonLoader';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { InventoryMobileFab } from '@/components/InventoryMobileFab';
import { capitalizeDisplayLabel } from '@/lib/display-format';

// Hairline separator colors
const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const INVENTORY_PAGE_SIZE = 24;
const NEW_PRODUCT_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

const isRecentlyAddedProduct = (product: Product) => {
  const createdAtMs = new Date(product.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs <= NEW_PRODUCT_WINDOW_MS;
};

const buildProcurementVariantImageMap = (procurements: Procurement[]) => {
  const imageByProductVariant = new Map<string, string>();
  procurements.forEach((procurement) => {
    procurement.items.forEach((item) => {
      const productId = item.inventoryProductId || item.productId;
      const variantId = item.variantId;
      const imageUrl = item.imageUrl?.trim();
      if (!productId || !variantId || !imageUrl || variantId.startsWith('charge-')) return;
      imageByProductVariant.set(`${productId}:${variantId}`, imageUrl);
    });
  });
  return imageByProductVariant;
};

interface VariantRowProps {
  product: Product;
  variant: ProductVariant;
  isOwner: boolean;
  onAdjustStock: (delta: number) => void;
  onPrintLabel: () => void;
  onRestock: () => void;
  separatorColor: string;
  isLast?: boolean;
  effectiveThreshold: number;
}

function VariantRow({ product, variant, isOwner, onAdjustStock, onPrintLabel, onRestock, separatorColor, isLast = false, effectiveThreshold }: VariantRowProps) {
  const colors = useThemeColors();
  const isService = normalizeProductType(product.productType) === 'service';
  const isLowStock = !isService && variant.stock > 0 && variant.stock <= effectiveThreshold;
  const isOutOfStock = !isService && variant.stock === 0;
  const variantName = Object.values(variant.variableValues).join(' / ');
  const statusColor = isService ? '#10B981' : isOutOfStock ? '#EF4444' : isLowStock ? '#F59E0B' : '#10B981';
  const statusText = isService
    ? 'Service'
    : isOutOfStock
      ? 'Out of stock'
      : `${variant.stock} units`;

  const handleAdjust = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdjustStock(delta);
  };

  const handlePrint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPrintLabel();
  };

  const handleRestock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRestock();
  };

  return (
    <View
      className="flex-row items-center py-3"
      style={isLast ? undefined : { borderBottomWidth: 0.5, borderBottomColor: separatorColor }}
    >
      <View className="flex-1">
        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{variantName}</Text>
        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">SKU: {variant.sku.toUpperCase()}</Text>
      </View>

      {!isService && (
        <Pressable
          onPress={handleRestock}
          className="p-2 mr-1 active:opacity-50"
        >
          <PackagePlus size={16} color="#10B981" strokeWidth={2} />
        </Pressable>
      )}

      <Pressable
        onPress={handlePrint}
        className="p-2 mr-1 active:opacity-50"
      >
        <Printer size={16} color={colors.text.tertiary} strokeWidth={2} />
      </Pressable>

      <View className="items-end mr-3">
        <View
          className="px-2 py-0.5 rounded-md"
          style={{ backgroundColor: `${statusColor}15` }}
        >
          <Text style={{ color: statusColor }} className="text-xs font-semibold">
            {statusText}
          </Text>
        </View>
        {isOwner && (
          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
            {formatCurrency(variant.sellingPrice)}
          </Text>
        )}
      </View>

      {!isService && (
        <View
          className="flex-row items-center rounded-xl overflow-hidden"
          style={{ backgroundColor: colors.border.light }}
        >
        <Pressable
          onPress={() => handleAdjust(-1)}
          className="p-2.5 active:opacity-50"
          disabled={variant.stock === 0}
        >
          <Minus size={16} color={variant.stock === 0 ? colors.text.muted : colors.text.primary} strokeWidth={2} />
        </Pressable>
        <View className="w-8 items-center">
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{variant.stock}</Text>
        </View>
        <Pressable
          onPress={() => handleAdjust(1)}
          className="p-2.5 active:opacity-50"
        >
          <Plus size={16} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>
      )}
    </View>
  );
}

interface ProductCardProps {
  product: Product;
  isOwner: boolean;
  onPress: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  onAdjustStock: (variantId: string, delta: number) => void;
  onPrintLabel: (variantId: string) => void;
  onRestock: (variantId: string) => void;
  effectiveThreshold: number;
  showSplitView?: boolean;
}

function ProductCard({ product, isOwner, onPress, onSelect, isSelected, onAdjustStock, onPrintLabel, onRestock, effectiveThreshold, showSplitView }: ProductCardProps) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;

  const [expanded, setExpanded] = useState(false);
  const isService = normalizeProductType(product.productType) === 'service';
  const totalStock = isService ? 0 : product.variants.reduce((sum, v) => sum + v.stock, 0);
  const totalValue = product.variants.reduce((sum, v) => sum + v.stock * v.sellingPrice, 0);
  const isOutOfStock = !isService && product.variants.every((v) => v.stock === 0);
  const isInactive = Boolean(product.isDiscontinued);
  const stockText = isService
    ? (isInactive ? 'Inactive' : 'Service')
    : isInactive
      ? 'Inactive'
    : isOutOfStock
      ? 'Out of stock'
      : `${totalStock} in stock`;
  const stockTextColor = isInactive ? '#9CA3AF' : isService ? '#10B981' : (isOutOfStock ? '#EF4444' : '#10B981');
  const chipColor = isInactive ? '#9CA3AF' : isService ? '#10B981' : isOutOfStock ? '#EF4444' : '#10B981';
  const servicePrice = product.variants[0]?.sellingPrice ?? 0;
  const isNewProduct = !isService && isRecentlyAddedProduct(product);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // In split view mode, select the product instead of expanding
    if (showSplitView && onSelect) {
      onSelect();
      return;
    }
    if (!showSplitView && onPress) {
      onPress();
      return;
    }
    setExpanded(!expanded);
  };

  return (
    <View className="mb-3">
          <View
            style={{
              backgroundColor: colors.bg.card,
              borderWidth: 0.5,
              borderColor: separatorColor,
              borderLeftWidth: 0.5,
              borderLeftColor: separatorColor,
              ...getActiveSplitCardStyle({ isSelected, showSplitView, isDark, colors }),
            }}
            className="rounded-2xl overflow-hidden"
          >
            <Pressable
              onPress={handlePress}
              className="p-3 flex-row items-center active:opacity-70"
            >
              <View className="flex-row items-center flex-1">
                {product.imageUrl ? (
                  <View className="w-12 h-12 rounded-lg overflow-hidden" style={{ borderWidth: 0.5, borderColor: separatorColor }}>
                    <ResolvedAttachmentImage
                      imageUrl={product.imageUrl}
                      style={{ width: 48, height: 48 }}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                  >
                    <Package size={24} color="#10B981" strokeWidth={1.5} />
                  </View>
                )}
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '500', flexShrink: 1 }} className="text-base" numberOfLines={1}>
                      {capitalizeDisplayLabel(product.name)}
                    </Text>
                    {isNewProduct ? (
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: 'rgba(96, 165, 250, 0.16)' }}
                      >
                        <Text style={{ color: '#60A5FA', fontSize: 10, fontWeight: '700' }}>
                          new
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: stockTextColor }} className="text-xs mt-0.5">
                    {stockText}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View
                  className="rounded-full px-3 py-1 flex-row items-center mr-2"
                  style={{ backgroundColor: `${chipColor}20` }}
                >
                  <Text style={{ color: chipColor }} className="text-xs font-semibold">
                    {isInactive ? 'Inactive' : isOutOfStock ? 'Out of stock' : isService ? 'Service' : `${totalStock} in stock`}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.text.tertiary} strokeWidth={2} />
              </View>
            </Pressable>

            {expanded && (
          <View className="px-4 pb-4" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor }}>
            {product.variants.map((variant, index) => (
              <VariantRow
                key={variant.id}
                product={product}
                variant={variant}
                isOwner={isOwner}
                onAdjustStock={(delta) => onAdjustStock(variant.id, delta)}
                onPrintLabel={() => onPrintLabel(variant.id)}
                onRestock={() => onRestock(variant.id)}
                separatorColor={separatorColor}
                isLast={index === product.variants.length - 1}
                effectiveThreshold={effectiveThreshold}
              />
            ))}

            {isOwner && (
              <View className="flex-row items-center justify-between mt-3 py-3" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor }}>
                <View>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm">
                    {isService ? 'Service Price' : 'Total Inventory Value'}
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-xs">
                    {isService ? 'default charge' : 'at retail price'}
                  </Text>
                </View>
                <Text className="text-emerald-500 font-bold text-lg">
                  {formatCurrency(isService ? servicePrice : totalValue)}
                </Text>
              </View>
            )}

            <View className="flex-row gap-2 mt-3">
              <Pressable
                onPress={onPress}
                className="flex-1 rounded-xl items-center active:opacity-80"
                style={{ height: 50, justifyContent: 'center', backgroundColor: colors.accent.primary }}
              >
                <Text style={{ color: colors.bg.primary === '#111111' ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm">Edit Product</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const showSplitView = !isMobile && !isWebDesktop;
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const mobileSectionHeadingStyle = isMobile
    ? { ...pageHeadingStyle, fontWeight: '600' as const }
    : pageHeadingStyle;
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;

  const products = useFyllStore((s) => s.products);
  const procurements = useFyllStore((s) => s.procurements);
  const lastDataSyncAt = useFyllStore((s) => s.lastDataSyncAt);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const deleteProduct = useFyllStore((s) => s.deleteProduct);
  const userRole = useFyllStore((s) => s.userRole);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);

  // Global low stock threshold settings
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);

  const isOwner = userRole === 'owner';

  // Show skeleton loader on first load when authenticated but no products yet
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isInitialLoading = isAuthenticated && products.length === 0 && !hasLoadedOnce;
  const procurementVariantImageRepairSignatureRef = useRef('');

  useEffect(() => {
    if (!products.length || !procurements.length) return;
    const imageByProductVariant = buildProcurementVariantImageMap(procurements);
    if (imageByProductVariant.size === 0) return;

    const repairs = products
      .map((product) => {
        let changed = false;
        const nextVariants = product.variants.map((variant) => {
          if (variant.imageUrl) return variant;
          const imageUrl = imageByProductVariant.get(`${product.id}:${variant.id}`);
          if (!imageUrl) return variant;
          changed = true;
          return { ...variant, imageUrl };
        });
        return changed ? { product, nextVariants } : null;
      })
      .filter((repair): repair is { product: Product; nextVariants: ProductVariant[] } => Boolean(repair));

    if (repairs.length === 0) return;
    const signature = repairs
      .map(({ product, nextVariants }) => `${product.id}:${nextVariants.map((variant) => `${variant.id}:${variant.imageUrl ?? ''}`).join(',')}`)
      .join('|');
    if (signature === procurementVariantImageRepairSignatureRef.current) return;
    procurementVariantImageRepairSignatureRef.current = signature;

    repairs.forEach(({ product, nextVariants }) => {
      void updateProduct(product.id, { variants: nextVariants }, businessId);
    });
  }, [businessId, procurements, products, updateProduct]);

  useEffect(() => {
    if (products.length > 0) {
      setHasLoadedOnce(true);
    }
  }, [products.length]);

  // Fallback: stop showing skeletons after 4s even if no products loaded (new account)
  useEffect(() => {
    if (hasLoadedOnce) return;
    const timer = setTimeout(() => setHasLoadedOnce(true), 4000);
    return () => clearTimeout(timer);
  }, [hasLoadedOnce]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryTab, setInventoryTab] = useState<'products' | 'services'>('products');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low-stock' | 'in-stock' | 'out-of-stock'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'stock-low' | 'stock-high'>('name-asc');
  const [visibleProductsCount, setVisibleProductsCount] = useState(INVENTORY_PAGE_SIZE);
  const [visibleServicesCount, setVisibleServicesCount] = useState(INVENTORY_PAGE_SIZE);
  // Products synced in from a connected WooCommerce store are hidden from
  // the main inventory view, so a store's already-audited manual inventory
  // isn't diluted by an incoming catalog.
  // Archived products (see Product.isArchived) are hidden from the main
  // inventory view too — same session-only reveal pattern as synced ones.
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const mobileInventoryTitle = inventoryTab === 'services' ? 'Services' : 'Products';
  const activeFilterCount = (inventoryFilter !== 'all' ? 1 : 0) + (sortBy !== 'name-asc' ? 1 : 0);
  const isPaginatingRef = useRef(false);
  const lastSyncLabel = useMemo(() => {
    if (!lastDataSyncAt) return 'Not synced yet';
    try {
      return new Date(lastDataSyncAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Recently';
    }
  }, [lastDataSyncAt]);

  // Split view state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [expandedByProductId, setExpandedByProductId] = useState<Record<string, boolean>>({});
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to get effective threshold for a product
  const getEffectiveThreshold = (product: typeof products[0]) => {
    return useGlobalLowStockThreshold ? globalLowStockThreshold : product.lowStockThreshold;
  };

  // Get selected product
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const isServiceProduct = (product: Product) => {
    if (normalizeProductType(product.productType) === 'service') return true;
    return Boolean(
      product.serviceTags?.length ||
      product.serviceVariables?.length ||
      product.serviceFields?.length
    );
  };
  const serviceCount = useMemo(
    () => products.filter((product) => isServiceProduct(product)).length,
    [products]
  );
  const isSyncedProduct = (product: Product) => product.catalogSource === 'woocommerce-plugin';
  const isArchivedProduct = (product: Product) => Boolean(product.isArchived);
  const archivedHiddenCount = useMemo(
    () => (showArchivedProducts ? 0 : products.filter((product) => !isServiceProduct(product) && isArchivedProduct(product)).length),
    [products, showArchivedProducts]
  );

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => !isServiceProduct(p));
    if (!showArchivedProducts) {
      result = result.filter((p) => !isArchivedProduct(p));
    }
    result = result.filter((p) => !isSyncedProduct(p));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(query))
      );
    }

    if (inventoryFilter === 'low-stock') {
      result = result.filter((p) => {
        const threshold = useGlobalLowStockThreshold ? globalLowStockThreshold : p.lowStockThreshold;
        return p.variants.some((v) => v.stock <= threshold);
      });
    } else if (inventoryFilter === 'in-stock') {
      result = result.filter((p) => p.variants.some((v) => v.stock > 0));
    } else if (inventoryFilter === 'out-of-stock') {
      result = result.filter((p) => p.variants.every((v) => v.stock === 0));
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'stock-low':
          const aStock = a.variants.reduce((sum, v) => sum + v.stock, 0);
          const bStock = b.variants.reduce((sum, v) => sum + v.stock, 0);
          return aStock - bStock;
        case 'stock-high':
          const aStockH = a.variants.reduce((sum, v) => sum + v.stock, 0);
          const bStockH = b.variants.reduce((sum, v) => sum + v.stock, 0);
          return bStockH - aStockH;
        default:
          return 0;
      }
    });

    return result;
  }, [products, searchQuery, inventoryFilter, useGlobalLowStockThreshold, globalLowStockThreshold, sortBy, showArchivedProducts]);

  const filteredServices = useMemo(() => {
    let result = products.filter((p) => isServiceProduct(p));
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((service) =>
        service.name.toLowerCase().includes(query) ||
        (service.serviceTags ?? []).some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, searchQuery]);

  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;
    return filteredServices.find((service) => service.id === selectedServiceId) ?? null;
  }, [filteredServices, selectedServiceId]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductsCount),
    [filteredProducts, visibleProductsCount]
  );
  const selectedVisibleProductIds = useMemo(
    () => visibleProducts.filter((product) => selectedProductIds.includes(product.id)).map((product) => product.id),
    [visibleProducts, selectedProductIds]
  );
  const allVisibleProductsSelected = visibleProducts.length > 0 && selectedVisibleProductIds.length === visibleProducts.length;
  const visibleServices = useMemo(
    () => filteredServices.slice(0, visibleServicesCount),
    [filteredServices, visibleServicesCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;
  const hasMoreServices = visibleServices.length < filteredServices.length;
  const hasMoreForCurrentTab = inventoryTab === 'services' ? hasMoreServices : hasMoreProducts;
  const mobileInventoryStats = useMemo(() => {
    const inventoryProducts = filteredProducts;
    const totalStock = inventoryProducts.reduce(
      (sum, product) => sum + product.variants.reduce((variantSum, variant) => variantSum + variant.stock, 0),
      0
    );
    const lowStock = inventoryProducts.filter((product) => {
      const threshold = useGlobalLowStockThreshold ? globalLowStockThreshold : product.lowStockThreshold;
      const hasLowStockVariant = product.variants.some((variant) => variant.stock > 0 && variant.stock <= threshold);
      const isOutOfStock = product.variants.length > 0 && product.variants.every((variant) => variant.stock === 0);
      return !product.isDiscontinued && !isOutOfStock && hasLowStockVariant;
    }).length;

    return {
      total: inventoryProducts.length,
      totalStock,
      lowStock,
    };
  }, [filteredProducts, useGlobalLowStockThreshold, globalLowStockThreshold]);

  useEffect(() => {
    setVisibleProductsCount(INVENTORY_PAGE_SIZE);
  }, [searchQuery, inventoryFilter, sortBy, products.length]);

  useEffect(() => {
    setVisibleServicesCount(INVENTORY_PAGE_SIZE);
  }, [searchQuery, products.length]);

  useEffect(() => {
    setSelectedProductIds((previous) => previous.filter((id) => filteredProducts.some((product) => product.id === id)));
  }, [filteredProducts]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const loadMoreInventoryItems = () => {
    if (isPaginatingRef.current) return;
    if (!hasMoreForCurrentTab) return;
    isPaginatingRef.current = true;
    if (inventoryTab === 'services') {
      setVisibleServicesCount((prev) => Math.min(prev + INVENTORY_PAGE_SIZE, filteredServices.length));
    } else {
      setVisibleProductsCount((prev) => Math.min(prev + INVENTORY_PAGE_SIZE, filteredProducts.length));
    }
    setTimeout(() => {
      isPaginatingRef.current = false;
    }, 150);
  };

  const handleInventoryScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 220;
    if (isNearBottom) {
      loadMoreInventoryItems();
    }
  };

  useEffect(() => {
    if (!showSplitView) return;
    if (inventoryTab !== 'products') return;
    if (selectedProductId && filteredProducts.some((product) => product.id === selectedProductId)) return;
    if (filteredProducts.length > 0) {
      setSelectedProductId(filteredProducts[0].id);
      return;
    }
    setSelectedProductId(null);
  }, [showSplitView, inventoryTab, filteredProducts, selectedProductId]);

  useEffect(() => {
    if (!showSplitView) return;
    if (inventoryTab !== 'services') return;
    if (selectedServiceId && filteredServices.some((service) => service.id === selectedServiceId)) return;
    if (filteredServices.length > 0) {
      setSelectedServiceId(filteredServices[0].id);
      return;
    }
    setSelectedServiceId(null);
  }, [showSplitView, inventoryTab, filteredServices, selectedServiceId]);

  const handleAdjustStock = (productId: string, variantId: string, delta: number) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const nextVariants = product.variants.map((variant) => (
      variant.id === variantId
        ? { ...variant, stock: Math.max(0, variant.stock + delta) }
        : variant
    ));
    void updateProduct(productId, { variants: nextVariants }, businessId);
  };

  const handleAddProduct = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/new-product');
  };

  const handleAddService = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/new-service');
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((previous) => (
      previous.includes(productId)
        ? previous.filter((id) => id !== productId)
        : [...previous, productId]
    ));
  };

  const toggleVisibleProductSelection = () => {
    if (allVisibleProductsSelected) {
      setSelectedProductIds((previous) => previous.filter((id) => !visibleProducts.some((product) => product.id === id)));
      return;
    }
    setSelectedProductIds((previous) => {
      const next = new Set(previous);
      visibleProducts.forEach((product) => next.add(product.id));
      return Array.from(next);
    });
  };

  const confirmBulkDeleteProducts = async () => {
    if (isBulkDeleting || selectedProductIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      for (const productId of selectedProductIds) {
        await deleteProduct(productId, businessId);
      }
      setPendingBulkDelete(false);
      setSelectedProductIds([]);
      showToast('success', selectedProductIds.length === 1 ? '1 product moved to Recycle Bin.' : `${selectedProductIds.length} products moved to Recycle Bin.`);
    } catch (error) {
      console.warn('Bulk product recycle bin move failed:', error);
      showToast('error', 'Could not move selected products to Recycle Bin.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const confirmBulkArchiveProducts = async () => {
    if (isBulkArchiving || selectedProductIds.length === 0) return;
    setIsBulkArchiving(true);
    const archivedAt = new Date().toISOString();
    try {
      for (const productId of selectedProductIds) {
        await updateProduct(productId, { isArchived: true, archivedAt }, businessId);
      }
      const count = selectedProductIds.length;
      setSelectedProductIds([]);
      showToast('success', count === 1 ? '1 product archived.' : `${count} products archived.`);
    } catch (error) {
      console.warn('Bulk product archive failed:', error);
      showToast('error', 'Could not archive selected products.');
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    const selected = products.find((p) => p.id === productId);
    const isService = normalizeProductType(selected?.productType) === 'service';
    if (isWebDesktop) {
      router.push(isService ? `/services/${productId}?from=inventory` : `/inventory/${productId}`);
      return;
    }
    if (showSplitView) {
      if (isService) {
        setSelectedServiceId(productId);
      } else {
        setSelectedProductId(productId);
      }
    } else {
      router.push(isService ? `/services/${productId}?from=inventory` : `/product/${productId}`);
    }
  };

  const serviceDetailContent = showSplitView && inventoryTab === 'services' && selectedServiceId
    ? <ServiceDetailPanel serviceId={selectedServiceId} from="inventory" />
    : null;

  const toggleExpanded = (productId: string) => {
    setExpandedByProductId((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  const getProductSummary = (product: Product) => {
    const isService = normalizeProductType(product.productType) === 'service';
    const totalStock = isService ? 0 : product.variants.reduce((sum, v) => sum + v.stock, 0);
    const effectiveThreshold = useGlobalLowStockThreshold ? globalLowStockThreshold : product.lowStockThreshold;
    const lowStockCount = isService
      ? 0
      : product.variants.filter((v) => v.stock > 0 && v.stock <= effectiveThreshold).length;
    const isOutOfStock = !isService && product.variants.every((v) => v.stock === 0);

    const status = product.isDiscontinued
      ? { label: 'Inactive', color: '#9CA3AF' }
      : isService
        ? { label: 'Service', color: '#10B981' }
      : isOutOfStock
        ? { label: 'Out of stock', color: '#EF4444' }
        : lowStockCount > 0
          ? { label: 'Low stock', color: '#F59E0B' }
          : { label: 'In stock', color: '#10B981' };

    const primarySku = product.variants[0]?.sku?.toUpperCase() ?? '—';
    const category = product.categories?.[0] ?? '—';
    const displayPrice = product.variants[0]?.sellingPrice ?? 0;

    return {
      isService,
      totalStock,
      effectiveThreshold,
      primarySku,
      category,
      displayPrice,
      status,
    };
  };

  // Master pane content
  const masterContent = (
    <>
      {/* Header - positioned at very top with proper spacing */}
      <View
        style={[
          {
            paddingHorizontal: isWebDesktop ? 0 : 20,
            paddingTop: isWebDesktop ? 0 : 16,
            paddingBottom: isWebDesktop ? 0 : 8,
            backgroundColor: isWebDesktop ? colors.bg.card : colors.bg.primary,
            borderBottomWidth: isWebDesktop ? 1 : 0.5,
            borderBottomColor: separatorColor,
          },
          isWebDesktop ? { width: '100%' } : undefined,
        ]}
      >
          <View
            className={isWebDesktop ? 'flex-row items-center justify-between' : undefined}
            style={isWebDesktop ? {
              width: '100%',
              maxWidth: 1400,
              alignSelf: 'flex-start',
              minHeight: desktopHeaderMinHeight,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 20,
              paddingBottom: 16,
            } : {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={isWebDesktop ? undefined : { flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text.primary, ...mobileSectionHeadingStyle }}>
                {isWebDesktop ? 'Inventory' : mobileInventoryTitle}
              </Text>
              {isWebDesktop ? (
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                  Manage products, services, stock counts, and warehouse items.
                </Text>
              ) : (
                inventoryTab === 'services' ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
                    {serviceCount} service{serviceCount !== 1 ? 's' : ''}
                  </Text>
                ) : (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>Inventory</Text>
                )
              )}
              {isOfflineMode ? (
                <View
                  style={{
                    marginTop: !isWebDesktop ? 8 : 6,
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(248,113,113,0.16)' : 'rgba(239,68,68,0.12)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(248,113,113,0.35)' : 'rgba(239,68,68,0.28)',
                  }}
                >
                  <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, fontWeight: '600' }}>
                    Offline · Last synced {lastSyncLabel}
                  </Text>
                </View>
              ) : null}
              {inventoryTab === 'products' && archivedHiddenCount > 0 ? (
                <Pressable
                  onPress={() => setShowArchivedProducts(true)}
                  style={{
                    marginTop: !isWebDesktop ? 8 : 6,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
                    {archivedHiddenCount} archived hidden
                  </Text>
                  <ChevronDown size={12} color={colors.text.tertiary} strokeWidth={2.4} />
                </Pressable>
              ) : null}
              {inventoryTab === 'products' && showArchivedProducts ? (
                <Pressable
                  onPress={() => setShowArchivedProducts(false)}
                  style={{
                    marginTop: !isWebDesktop ? 8 : 6,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.accent.primary + '1A',
                    borderWidth: 1,
                    borderColor: colors.accent.primary,
                  }}
                >
                  <Text style={{ color: colors.accent.primary, fontSize: 12, fontWeight: '600' }}>
                    Showing archived products
                  </Text>
                  <ChevronUp size={12} color={colors.accent.primary} strokeWidth={2.4} />
                </Pressable>
              ) : null}
            </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {isWebDesktop || inventoryTab !== 'services' ? (
	            <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  router.replace('/inventory-audit');
	                }}
	                className="rounded-full overflow-hidden active:opacity-80"
	                style={{ paddingHorizontal: 14, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(168, 85, 247, 0.08)' }}
	              >
	                <ClipboardList size={16} color="#A856F6" strokeWidth={2} />
	                <Text style={{ color: '#A856F6', marginLeft: 6, fontWeight: '600', fontSize: 12 }}>Audit</Text>
	              </Pressable>
            ) : null}
            <Pressable
              onPress={isMobile && inventoryTab === 'services' ? handleAddService : handleAddProduct}
              className="rounded-full overflow-hidden active:opacity-80"
              style={{
                paddingHorizontal: 16,
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent.primary,
                borderRadius: 999,
              }}
            >
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 8, fontWeight: '600', fontSize: 12 }}>
                {isMobile && inventoryTab === 'services' ? 'Add Service' : 'Add Product'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View
        style={{
          width: '100%',
          paddingHorizontal: isWebDesktop ? 0 : 20,
          paddingTop: isWebDesktop ? 0 : 8,
        }}
      >
        {isWebDesktop && inventoryTab === 'products' ? (
          <View style={{ width: '100%', maxWidth: 1400, alignSelf: 'flex-start', paddingLeft: 20, paddingRight: 20, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 14,
                backgroundColor: colors.bg.card,
              }}
            >
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>ITEMS</Text>
              <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', marginTop: 2 }}>
                {mobileInventoryStats.total}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 14,
                backgroundColor: colors.bg.card,
              }}
            >
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>TOTAL STOCK</Text>
              <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', marginTop: 2 }}>
                {mobileInventoryStats.totalStock}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 14,
                backgroundColor: colors.bg.card,
              }}
            >
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>LOW STOCK</Text>
              <Text style={{ color: '#F59E0B', fontSize: 28, fontWeight: '700', marginTop: 2 }}>
                {mobileInventoryStats.lowStock}
              </Text>
            </View>
          </View>
          </View>
        ) : null}

	        {/* Search + Filter Row */}
	        {isWebDesktop ? (
	          <View style={{ width: '100%', maxWidth: 1400, alignSelf: 'flex-start', paddingLeft: 20, paddingRight: 20, paddingTop: inventoryTab === 'products' ? 0 : 18 }}>
	          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
		            <View
		              className="flex-row items-center rounded-full px-4"
		              style={{
		                height: 44,
		                width: '30%',
		                maxWidth: 420,
		                minWidth: 320,
		                backgroundColor: colors.input.bg,
	                borderWidth: 1,
	                borderColor: colors.border.light,
	              }}
	            >
	              <Search size={18} color={colors.text.muted} strokeWidth={2} />
	              <TextInput
	                placeholder="Search products or SKUs..."
	                placeholderTextColor={colors.input.placeholder}
	                value={searchQuery}
	                onChangeText={setSearchQuery}
	                style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
	                selectionColor={colors.text.primary}
	              />
	            </View>

	            <ScrollView
	              horizontal
	              showsHorizontalScrollIndicator={false}
	              style={{ flex: 1 }}
	              contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
	            >
		              <Pressable
		                onPress={() => setInventoryFilter('all')}
		                className="rounded-full active:opacity-70"
		                style={{
		                  height: 44,
		                  paddingHorizontal: 16,
		                  alignItems: 'center',
		                  justifyContent: 'center',
		                  backgroundColor: inventoryFilter === 'all' ? colors.accent.primary : colors.bg.card,
		                  borderWidth: inventoryFilter === 'all' ? 0 : 1,
	                  borderColor: separatorColor,
	                }}
	              >
	                <Text
	                  className="text-sm font-semibold"
	                  style={{
	                    color: inventoryFilter === 'all' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
	                  }}
	                >
	                  All
	                </Text>
	              </Pressable>
		              <Pressable
		                onPress={() => setInventoryFilter('low-stock')}
		                className="rounded-full active:opacity-70"
		                style={{
		                  height: 44,
		                  paddingHorizontal: 16,
		                  alignItems: 'center',
		                  justifyContent: 'center',
		                  backgroundColor: inventoryFilter === 'low-stock' ? colors.accent.primary : colors.bg.card,
		                  borderWidth: inventoryFilter === 'low-stock' ? 0 : 1,
	                  borderColor: separatorColor,
	                }}
	              >
	                <Text
	                  className="text-sm font-semibold"
	                  style={{
	                    color: inventoryFilter === 'low-stock' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
	                  }}
	                >
	                  Low Stock
	                </Text>
	              </Pressable>
		              <Pressable
		                onPress={() => setInventoryFilter('in-stock')}
		                className="rounded-full active:opacity-70"
		                style={{
		                  height: 44,
		                  paddingHorizontal: 16,
		                  alignItems: 'center',
		                  justifyContent: 'center',
		                  backgroundColor: inventoryFilter === 'in-stock' ? colors.accent.primary : colors.bg.card,
		                  borderWidth: inventoryFilter === 'in-stock' ? 0 : 1,
	                  borderColor: separatorColor,
	                }}
	              >
	                <Text
	                  className="text-sm font-semibold"
	                  style={{
	                    color: inventoryFilter === 'in-stock' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
	                  }}
	                >
	                  In Stock
	                </Text>
	              </Pressable>
		              <Pressable
		                onPress={() => setInventoryFilter('out-of-stock')}
		                className="rounded-full active:opacity-70"
		                style={{
		                  height: 44,
		                  paddingHorizontal: 16,
		                  alignItems: 'center',
		                  justifyContent: 'center',
		                  backgroundColor: inventoryFilter === 'out-of-stock' ? colors.accent.primary : colors.bg.card,
		                  borderWidth: inventoryFilter === 'out-of-stock' ? 0 : 1,
	                  borderColor: separatorColor,
	                }}
	              >
	                <Text
	                  className="text-sm font-semibold"
	                  style={{
	                    color: inventoryFilter === 'out-of-stock' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
	                  }}
	                >
	                  Out of Stock
	                </Text>
	              </Pressable>
	            </ScrollView>

		            <Pressable
		              onPress={() => {
		                if (Platform.OS !== 'web') {
		                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		                }
		                setShowFilterMenu(true);
		              }}
		              className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
		              style={{
		                height: 44,
		                backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.card,
		                borderWidth: activeFilterCount > 0 ? 0 : 1,
		                borderColor: separatorColor,
		              }}
	            >
	              <Filter
	                size={18}
	                color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary}
	                strokeWidth={2}
	              />
		              {activeFilterCount > 0 && (
	                <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
	                  {activeFilterCount}
	                </Text>
		              )}
		            </Pressable>
	          </View>
            {inventoryTab === 'products' ? (
              <View
                style={{
                  marginTop: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  height: 52,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.card,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={toggleVisibleProductSelection}
                    className="active:opacity-70"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: allVisibleProductsSelected ? colors.accent.primary : colors.border.light,
                      backgroundColor: allVisibleProductsSelected ? colors.accent.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {allVisibleProductsSelected ? (
                      <Check size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                    {selectedProductIds.length > 0
                      ? `${selectedProductIds.length} selected`
                      : 'Select products to bulk move'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {selectedProductIds.length > 0 ? (
                    <>
                      <Pressable
                        onPress={() => setSelectedProductIds([])}
                        className="active:opacity-70"
                        style={{
                          height: 38,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.bg.primary,
                        }}
                      >
                        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>
                          Clear
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={confirmBulkArchiveProducts}
                        disabled={isBulkArchiving}
                        className="active:opacity-70"
                        style={{
                          height: 38,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.bg.card,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          flexDirection: 'row',
                          gap: 8,
                          opacity: isBulkArchiving ? 0.6 : 1,
                        }}
                      >
                        <Archive size={15} color={colors.text.primary} strokeWidth={2} />
                        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                          {isBulkArchiving ? 'Archiving...' : 'Archive'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPendingBulkDelete(true)}
                        className="active:opacity-70"
                        style={{
                          height: 38,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(239, 68, 68, 0.14)',
                          flexDirection: 'row',
                          gap: 8,
                        }}
                      >
                        <Trash2 size={15} color="#EF4444" strokeWidth={2} />
                        <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                          Move to Recycle Bin
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                      Applies to checked products on this list
                    </Text>
                  )}
                </View>
              </View>
            ) : null}
            </View>
        ) : inventoryTab === 'services' ? (
          <View className="flex-row gap-2">
            <View
              className="flex-1 flex-row items-center rounded-full px-4"
              style={{ height: 46, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Search size={18} color={colors.text.muted} strokeWidth={2} />
              <TextInput
                placeholder={inventoryTab === 'services' ? 'Search services...' : 'Search products or SKUs...'}
                placeholderTextColor={colors.input.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{
          flex: 1,
          paddingHorizontal: isWebDesktop ? 0 : 20,
          paddingTop: isWebDesktop ? 0 : 16,
          backgroundColor: showSplitView ? colors.bg.primary : colors.bg.primary,
          maxWidth: isWebDesktop ? undefined : showSplitView ? undefined : 600,
        }}
	        contentContainerStyle={{
	          maxWidth: isWebDesktop ? 1400 : isDesktop ? 600 : undefined,
	          alignSelf: isWebDesktop ? 'flex-start' : isDesktop && !selectedProductId ? 'center' : undefined,
	          width: '100%',
            paddingLeft: isWebDesktop ? 20 : 0,
            paddingRight: isWebDesktop ? 20 : 0,
            paddingTop: isWebDesktop ? 24 : 0,
	          paddingBottom: tabBarHeight + 16,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleInventoryScroll}
        scrollEventThrottle={16}
      >
        {!isWebDesktop && inventoryTab === 'products' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  backgroundColor: colors.bg.card,
                }}
              >
                <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>ITEMS</Text>
                <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '600', marginTop: 4 }}>
                  {mobileInventoryStats.total}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  backgroundColor: colors.bg.card,
                }}
              >
                <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>TOTAL STOCK</Text>
                <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '600', marginTop: 4 }}>
                  {mobileInventoryStats.totalStock}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  backgroundColor: colors.bg.card,
                }}
              >
                <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>LOW STOCK</Text>
                <Text style={{ color: '#F59E0B', fontSize: 22, fontWeight: '600', marginTop: 4 }}>
                  {mobileInventoryStats.lowStock}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2" style={{ marginBottom: 14 }}>
              <View
                className="flex-1 flex-row items-center rounded-full px-4"
                style={{ height: 46, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  placeholder="Search products or SKUs..."
                  placeholderTextColor={colors.input.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowFilterMenu(true);
                }}
                className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
                style={{
                  width: 46,
                  height: 46,
                  paddingHorizontal: 0,
                  backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.secondary,
                  borderWidth: activeFilterCount > 0 ? 0 : 0.5,
                  borderColor: separatorColor,
                }}
              >
                <Filter
                  size={18}
                  color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary}
                  strokeWidth={2}
                />
                {activeFilterCount > 0 && (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
                    {activeFilterCount}
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : null}

        {isInitialLoading ? (
          // Show skeleton loaders while data is syncing on first load
          <View>
            <ProductCardSkeleton />
            <ProductCardSkeleton />
            <ProductCardSkeleton />
            <ProductCardSkeleton />
            <ProductCardSkeleton />
          </View>
        ) : inventoryTab === 'services' ? (
          filteredServices.length === 0 ? (
            <View className="items-center justify-center py-20">
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: colors.border.light }}
              >
                <Briefcase size={36} color={colors.text.muted} strokeWidth={1.5} />
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No services found</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Add your first service to get started</Text>
              <Pressable
                onPress={handleAddService}
                className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center"
                style={{ backgroundColor: colors.accent.primary }}
              >
                <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Create First Service</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {visibleServices.map((service) => {
                const tag = service.serviceTags?.[0] ?? 'General';
                const price = service.variants[0]?.sellingPrice ?? 0;
                const isSelectedService = showSplitView && inventoryTab === 'services' && selectedServiceId === service.id;
                const statusLabel = service.isDiscontinued ? 'Inactive' : 'Active';
                const statusColor = service.isDiscontinued ? '#9CA3AF' : '#10B981';
                return (
                  <Pressable
                    key={service.id}
                    onPress={() => handleProductSelect(service.id)}
                    className="active:opacity-70"
                    style={{
                      backgroundColor: colors.bg.card,
                      borderRadius: 16,
                      overflow: 'hidden',
                      marginBottom: 12,
                      borderWidth: 0.5,
                      borderColor: separatorColor,
                      borderLeftWidth: 0.5,
                      borderLeftColor: separatorColor,
                      ...getActiveSplitCardStyle({
                        isSelected: isSelectedService,
                        showSplitView,
                        isDark,
                        colors,
                      }),
                    }}
                  >
                    <View className="p-3 flex-row items-center">
                      <View className="flex-row items-center flex-1">
                        {service.imageUrl ? (
                          <View className="w-12 h-12 rounded-lg overflow-hidden" style={{ borderWidth: 0.5, borderColor: separatorColor }}>
                            <ResolvedAttachmentImage
                              imageUrl={service.imageUrl}
                              style={{ width: 48, height: 48 }}
                              resizeMode="cover"
                            />
                          </View>
                        ) : (
                          <View
                            className="w-12 h-12 rounded-xl items-center justify-center"
                            style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                          >
                            <Briefcase size={22} color="#10B981" strokeWidth={1.6} />
                          </View>
                        )}
                        <View className="ml-3 flex-1">
                          <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                            {capitalizeDisplayLabel(service.name)}
                          </Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                            {tag} · {formatCurrency(price)}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center">
                        <View
                          className="rounded-full px-3 py-1 flex-row items-center mr-2"
                          style={{ backgroundColor: `${statusColor}20` }}
                        >
                          <Text style={{ color: statusColor }} className="text-xs font-semibold">
                            {statusLabel}
                          </Text>
                        </View>
                        <ChevronRight size={20} color={colors.text.tertiary} strokeWidth={2} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              <View className="items-center py-3">
                {hasMoreServices ? (
                  <Pressable
                    onPress={loadMoreInventoryItems}
                    className="rounded-full active:opacity-80 px-4"
                    style={{
                      height: 38,
                      justifyContent: 'center',
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: separatorColor,
                    }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                      Load more
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={{ color: colors.text.muted }} className="text-xs">
                    Showing {visibleServices.length} of {filteredServices.length}
                  </Text>
                )}
              </View>
              <View className="h-24" />
            </View>
          )
        ) : (
          <>
            {isWebDesktop ? (
              <View
                style={{
                  width: '100%',
                  borderWidth: 1,
                  borderColor: separatorColor,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: colors.bg.card,
                }}
                >
                <View style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                  <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 12 }}>
                    <View style={{ width: 42, alignItems: 'center', justifyContent: 'center' }}>
                      <Pressable
                        onPress={toggleVisibleProductSelection}
                        className="active:opacity-70"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor: allVisibleProductsSelected ? colors.accent.primary : colors.border.light,
                          backgroundColor: allVisibleProductsSelected ? colors.accent.primary : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {allVisibleProductsSelected ? (
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                        ) : null}
                      </Pressable>
                    </View>
                    <Text style={{ color: colors.text.muted, flex: 2.2 }} className="text-xs font-semibold">
                      PRODUCT
                    </Text>
                    <Text style={{ color: colors.text.muted, flex: 1 }} className="text-xs font-semibold">
                      SKU
                    </Text>
                    <Text style={{ color: colors.text.muted, flex: 1 }} className="text-xs font-semibold">
                      CATEGORY
                    </Text>
                    <Text style={{ color: colors.text.muted, width: 80, textAlign: 'center' }} className="text-xs font-semibold">
                      STOCK
                    </Text>
                    {isOwner ? (
                      <Text style={{ color: colors.text.muted, width: 120, textAlign: 'right' }} className="text-xs font-semibold">
                        PRICE
                      </Text>
                    ) : (
                      <View style={{ width: 0 }} />
                    )}
                    <View style={{ width: 170, paddingLeft: 24 }}>
                      <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">
                        STATUS
                      </Text>
                    </View>
                    <View style={{ width: 34 }} />
                  </View>
                </View>

                {filteredProducts.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <View style={{ width: 80, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: colors.border.light }}>
                      <Package size={36} color={colors.text.muted} strokeWidth={1.5} />
                    </View>
                    <Text style={{ color: colors.text.tertiary, fontSize: 16, marginBottom: 4 }}>No products found</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginBottom: 16 }}>Add your first product to get started</Text>
                    <Pressable
                      onPress={handleAddProduct}
                      style={{ backgroundColor: colors.accent.primary, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                      <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>Create First Product</Text>
                    </Pressable>
                  </View>
                ) : visibleProducts.map((product, index) => {
                  const summary = getProductSummary(product);
                  const expanded = !!expandedByProductId[product.id];
                  const isSelected = selectedProductId === product.id && showSplitView;
                  const rowBg = isSelected ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : colors.bg.card;
                  const isNewProduct = isRecentlyAddedProduct(product);

                  return (
                    <View
                      key={product.id}
                      style={{
                        backgroundColor: rowBg,
                        borderBottomWidth: index === visibleProducts.length - 1 ? 0 : 1,
                        borderBottomColor: separatorColor,
                      }}
                    >
                      <Pressable
                        onPress={() => handleProductSelect(product.id)}
                        className="active:opacity-70"
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 14 }}
                      >
                        <View style={{ width: 42, alignItems: 'center', justifyContent: 'center' }}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              toggleProductSelection(product.id);
                            }}
                            className="active:opacity-70"
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 6,
                              borderWidth: 1.5,
                              borderColor: selectedProductIds.includes(product.id) ? colors.accent.primary : colors.border.light,
                              backgroundColor: selectedProductIds.includes(product.id) ? colors.accent.primary : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {selectedProductIds.includes(product.id) ? (
                              <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                            ) : null}
                          </Pressable>
                        </View>
                        <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              toggleExpanded(product.id);
                            }}
                            className="active:opacity-70"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                            }}
                          >
                            {expanded ? (
                              <ChevronUp size={16} color={colors.text.tertiary} strokeWidth={2} />
                            ) : (
                              <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
                            )}
                          </Pressable>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ color: colors.text.primary, flexShrink: 1 }} className="text-sm font-semibold" numberOfLines={1}>
                                {capitalizeDisplayLabel(product.name)}
                              </Text>
                              {isNewProduct ? (
                                <View
                                  className="rounded-full px-2 py-0.5"
                                  style={{ backgroundColor: 'rgba(96, 165, 250, 0.16)' }}
                                >
                                  <Text style={{ color: '#60A5FA', fontSize: 9.5, fontWeight: '700' }}>
                                    new
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                              {product.variants.length} {product.variants.length === 1 ? 'variant' : 'variants'}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm" numberOfLines={1}>
                          {summary.primarySku}
                        </Text>
                        <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm" numberOfLines={1}>
                          {summary.category}
                        </Text>

                        <Text style={{ color: colors.text.primary, width: 80, textAlign: 'center' }} className="text-sm font-semibold">
                          {summary.isService ? '—' : String(summary.totalStock)}
                        </Text>

                        {isOwner ? (
                          <Text style={{ color: colors.text.primary, width: 120, textAlign: 'right' }} className="text-sm font-semibold" numberOfLines={1}>
                            {formatCurrency(summary.displayPrice)}
                          </Text>
                        ) : (
                          <View style={{ width: 0 }} />
                        )}

                        <View style={{ width: 170, paddingLeft: 24, flexDirection: 'row' }}>
                          <View className="px-2 py-1 rounded-md" style={{ backgroundColor: `${summary.status.color}15` }}>
                            <Text style={{ color: summary.status.color }} className="text-xs font-semibold" numberOfLines={1}>
                              {summary.status.label}
                            </Text>
                          </View>
                        </View>

                        <View style={{ width: 34, alignItems: 'flex-end' }}>
                          <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
                        </View>
                      </Pressable>

                      {expanded && (
                        <View style={{ backgroundColor: colors.bg.card, borderTopWidth: 1, borderTopColor: separatorColor }}>
                          {product.variants.map((variant, vIndex) => {
                            const variantName = Object.values(variant.variableValues).join(' / ') || 'Default';
                            const isService = normalizeProductType(product.productType) === 'service';
                            const isLow = !isService && variant.stock > 0 && variant.stock <= summary.effectiveThreshold;
                            const isOut = !isService && variant.stock === 0;
                            const vColor = isService ? '#10B981' : isOut ? '#EF4444' : isLow ? '#F59E0B' : '#10B981';
                            const vText = isService ? 'Service' : isOut ? 'Out' : isLow ? 'Low' : 'OK';

                            return (
                              <View
                                key={variant.id}
                                style={{
                                  backgroundColor: colors.bg.card,
                                  borderBottomWidth: vIndex === product.variants.length - 1 ? 0 : 1,
                                  borderBottomColor: separatorColor,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 }}>
                                  <View style={{ flex: 2.2, paddingLeft: 40, minWidth: 0 }}>
                                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>
                                      {variantName}
                                    </Text>
                                  </View>
                                  <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm" numberOfLines={1}>
                                    {variant.sku.toUpperCase()}
                                  </Text>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
                                      —
                                    </Text>
                                  </View>

                                  <View style={{ width: 80, alignItems: 'center' }}>
                                    {isService ? (
                                      <Text style={{ color: colors.text.muted }} className="text-sm">
                                        —
                                      </Text>
                                    ) : (
                                      <View
                                        className="flex-row items-center rounded-xl overflow-hidden"
                                        style={{ backgroundColor: colors.border.light }}
                                      >
                                        <Pressable
                                          onPress={() => handleAdjustStock(product.id, variant.id, -1)}
                                          className="p-2 active:opacity-50"
                                          disabled={variant.stock === 0}
                                        >
                                          <Minus size={14} color={variant.stock === 0 ? colors.text.muted : colors.text.primary} strokeWidth={2} />
                                        </Pressable>
                                        <View style={{ width: 28, alignItems: 'center' }}>
                                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                                            {variant.stock}
                                          </Text>
                                        </View>
                                        <Pressable
                                          onPress={() => handleAdjustStock(product.id, variant.id, 1)}
                                          className="p-2 active:opacity-50"
                                        >
                                          <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                                        </Pressable>
                                      </View>
                                    )}
                                  </View>

                                  {isOwner ? (
                                    <Text style={{ color: colors.text.primary, width: 120, textAlign: 'right' }} className="text-sm font-semibold" numberOfLines={1}>
                                      {formatCurrency(variant.sellingPrice)}
                                    </Text>
                                  ) : (
                                    <View style={{ width: 0 }} />
                                  )}

                                  <View style={{ width: 170, paddingLeft: 16, flexDirection: 'row', alignItems: 'center' }}>
                                    <View className="px-2 py-1 rounded-md" style={{ backgroundColor: `${vColor}15` }}>
                                      <Text style={{ color: vColor }} className="text-xs font-semibold">
                                        {vText}
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={{ width: 64, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                                    {!isService && (
                                      <Pressable
                                        onPress={() =>
                                          router.push({
                                            pathname: '/restock',
                                            params: { productId: product.id, variantId: variant.id },
                                          })
                                        }
                                        className="active:opacity-60"
                                      >
                                        <PackagePlus size={16} color="#10B981" strokeWidth={2} />
                                      </Pressable>
                                    )}
                                    <Pressable
                                      onPress={() =>
                                        router.push({
                                          pathname: '/label-print',
                                          params: { productId: product.id, variantId: variant.id },
                                        })
                                      }
                                      className="active:opacity-60"
                                    >
                                      <Printer size={16} color={colors.text.tertiary} strokeWidth={2} />
                                    </Pressable>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-20">
                <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
                  <Package size={40} color={colors.text.muted} strokeWidth={1.5} />
                </View>
                <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No products found</Text>
                <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Add your first product to get started</Text>
                <Pressable
                  onPress={handleAddProduct}
                  className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center"
                  style={{ backgroundColor: colors.accent.primary }}
                >
                  <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Create First Product</Text>
                </Pressable>
              </View>
            ) : (
              visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isOwner={isOwner}
                  isSelected={selectedProductId === product.id}
                  showSplitView={showSplitView}
                  onSelect={() => handleProductSelect(product.id)}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onAdjustStock={(variantId, delta) => handleAdjustStock(product.id, variantId, delta)}
                  onPrintLabel={(variantId) =>
                    router.push({
                      pathname: '/label-print',
                      params: { productId: product.id, variantId },
                    })
                  }
                  onRestock={(variantId) =>
                    router.push({
                      pathname: '/restock',
                      params: { productId: product.id, variantId },
                    })
                  }
                  effectiveThreshold={getEffectiveThreshold(product)}
                />
              ))
            )}
            <View className="items-center py-3">
              {hasMoreForCurrentTab ? (
                <Pressable
                  onPress={loadMoreInventoryItems}
                  className="rounded-full active:opacity-80 px-4"
                  style={{
                    height: 38,
                    justifyContent: 'center',
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: separatorColor,
                  }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    Load more
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.text.muted }} className="text-xs">
                  Showing {visibleProducts.length} of {filteredProducts.length}
                </Text>
              )}
            </View>
            <View className="h-24" />
          </>
        )}
      </ScrollView>

    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        <SplitViewLayout
          detailContent={
            inventoryTab === 'services'
              ? serviceDetailContent
              : showSplitView && selectedProductId
                ? <ProductDetailPanel productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
                : null
          }
          detailTitle={
            showSplitView
              ? inventoryTab === 'services'
                ? (selectedService?.name || 'Service Details')
                : (selectedProduct?.name || 'Product Details')
              : undefined
          }
          onCloseDetail={
            showSplitView
              ? inventoryTab === 'services'
                ? () => setSelectedServiceId(null)
                : () => setSelectedProductId(null)
              : undefined
          }
        >
          {masterContent}
        </SplitViewLayout>

        <Modal
          visible={pendingBulkDelete}
          animationType="fade"
          transparent
          onRequestClose={() => {
            if (!isBulkDeleting) {
              setPendingBulkDelete(false);
            }
          }}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => {
              if (!isBulkDeleting) {
                setPendingBulkDelete(false);
              }
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxWidth: 380 }}
            >
              <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Move to Recycle Bin</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                  {selectedProductIds.length === 1
                    ? 'Move this product out of active inventory and keep it recoverable from Recycle Bin?'
                    : `Move ${selectedProductIds.length} products out of active inventory and keep them recoverable from Recycle Bin?`}
                </Text>
              </View>
              <View className="px-5 py-4 flex-row gap-3">
                <Pressable
                  onPress={() => {
                    if (!isBulkDeleting) {
                      setPendingBulkDelete(false);
                    }
                  }}
                  className="flex-1 rounded-full items-center"
                  style={{
                    backgroundColor: colors.bg.secondary,
                    height: 48,
                    justifyContent: 'center',
                    opacity: isBulkDeleting ? 0.5 : 1,
                  }}
                  disabled={isBulkDeleting}
                >
                  <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmBulkDeleteProducts}
                  className="flex-1 rounded-full items-center"
                  style={{
                    backgroundColor: '#EF4444',
                    height: 48,
                    justifyContent: 'center',
                    opacity: isBulkDeleting ? 0.7 : 1,
                  }}
                  disabled={isBulkDeleting}
                >
                  <Text className="text-white font-semibold">
                    {isBulkDeleting ? 'Moving...' : 'Move'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Filter Menu Modal */}
        <Modal
          visible={showFilterMenu}
          animationType="fade"
          transparent
          onRequestClose={() => setShowFilterMenu(false)}
        >
          <Pressable
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onPress={() => setShowFilterMenu(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="rounded-t-3xl"
              style={{ backgroundColor: colors.bg.primary, maxHeight: '70%' }}
            >
              {/* Handle */}
              <View className="items-center py-3">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
              </View>

              {/* Header */}
              <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter & Sort</Text>
                <Pressable
                  onPress={() => setShowFilterMenu(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Filter Section */}
                <View className="px-5 pt-4">
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Filter</Text>

                  {[
                    {
                      key: 'all',
                      label: 'All products',
                      description: 'Every item in your catalog',
                      icon: Boxes,
                      helperColor: '#10B981',
                    },
                    {
                      key: 'low-stock',
                      label: 'Low stock only',
                      description: 'Variants at or below threshold',
                      icon: Tag,
                      helperColor: '#F59E0B',
                    },
                    {
                      key: 'in-stock',
                      label: 'In stock',
                      description: 'Variants that are available',
                      icon: Check,
                      helperColor: '#10B981',
                    },
                    {
                      key: 'out-of-stock',
                      label: 'Out of stock',
                      description: 'Variants with zero stock',
                      icon: AlertTriangle,
                      helperColor: '#EF4444',
                    },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setInventoryFilter(option.key as typeof inventoryFilter);
                        }}
                        className="flex-row items-center py-3 active:opacity-70"
                      >
                        <Icon size={18} color={inventoryFilter === option.key ? option.helperColor : colors.text.muted} strokeWidth={2} />
                        <View className="flex-1 ml-3">
                          <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">{option.description}</Text>
                        </View>
                        {inventoryFilter === option.key && (
                          <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                            <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}

                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setInventoryFilter('all');
                      setSortBy('name-asc');
                    }}
                    className="mt-3 rounded-xl items-center justify-center"
                    style={{ height: 42, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Clear filters</Text>
                  </Pressable>
                </View>

                {/* Sort Section */}
                <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort By</Text>

                  {/* Name A-Z */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('name-asc');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <ArrowDownAZ size={18} color={sortBy === 'name-asc' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Name (A-Z)</Text>
                    </View>
                    {sortBy === 'name-asc' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Name Z-A */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('name-desc');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <ArrowUpAZ size={18} color={sortBy === 'name-desc' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Name (Z-A)</Text>
                    </View>
                    {sortBy === 'name-desc' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Newest First */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('newest');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <Clock size={18} color={sortBy === 'newest' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Newest First</Text>
                    </View>
                    {sortBy === 'newest' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Oldest First */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('oldest');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <Clock size={18} color={sortBy === 'oldest' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Oldest First</Text>
                    </View>
                    {sortBy === 'oldest' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Stock: Low to High */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('stock-low');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <TrendingDown size={18} color={sortBy === 'stock-low' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Stock: Low to High</Text>
                    </View>
                    {sortBy === 'stock-low' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>

                  {/* Stock: High to Low */}
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSortBy('stock-high');
                    }}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <TrendingUp size={18} color={sortBy === 'stock-high' ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                    <View className="flex-1 ml-3">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">Stock: High to Low</Text>
                    </View>
                    {sortBy === 'stock-high' && (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                        <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                </View>

                {/* Apply Button */}
                <View className="px-5 py-4">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowFilterMenu(false);
                    }}
                    className="rounded-xl items-center justify-center active:opacity-80"
                    style={{ height: 50, backgroundColor: colors.accent.primary }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold">Apply</Text>
                  </Pressable>
                </View>

                <View className="h-8" />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
        {toast ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: 24,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: toast.type === 'success' ? '#111111' : '#7F1D1D',
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: 12,
                minHeight: 44,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                {toast.message}
              </Text>
            </View>
          </View>
        ) : null}
        {!isWebDesktop ? (
          <InventoryMobileFab
            currentSection="products"
            onSelectProducts={() => setInventoryTab('products')}
            onSelectWarehouse={() => router.push('/inventory/warehouse')}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}
