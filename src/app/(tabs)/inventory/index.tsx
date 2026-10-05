import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Search, Package, ChevronRight, ChevronDown, ChevronUp, Tag, Boxes, ClipboardCheck, Check, X, ArrowDownAZ, ArrowUpAZ, Clock, TrendingUp, TrendingDown, AlertTriangle, Briefcase, Trash2, Archive, Power } from 'lucide-react-native';
import useFyllStore, { Product, ProductVariant, type Procurement, formatCurrency } from '@/lib/state/fyll-store';
import { normalizeProductType } from '@/lib/product-utils';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { MOBILE_FILTER_SHEET } from '@/lib/mobile-filter-sheet';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { getActiveSplitCardStyle } from '@/lib/selection-style';
import { SplitViewLayout } from '@/components/SplitViewLayout';
import { ProductDetailPanel } from '@/components/ProductDetailPanel';
import { ServiceDetailPanel } from '@/components/ServiceDetailPanel';
import { ProductCardSkeleton } from '@/components/SkeletonLoader';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { InventoryMobileFab } from '@/components/InventoryMobileFab';
import { capitalizeDisplayLabel } from '@/lib/display-format';
import { SearchClearButton } from '@/components/SearchClearButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { FilterPill, InventoryCheckbox, MenuPill, ProductListRow, ProductTableRow, TABLE_COLUMNS, formatCompactNaira, getStockStatus, type StockStatus } from '@/components/inventory/inventory-ui';

// Hairline separator colors
const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
const INVENTORY_PAGE_SIZE = 24;
const NO_CATEGORY = '__none__';

type InventoryFilter = 'all' | 'low-stock' | 'in-stock' | 'out-of-stock' | 'inactive';
type InventorySort = 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'stock-low' | 'stock-high';

const FILTER_FOR_STATUS: Record<StockStatus, Exclude<InventoryFilter, 'all'>> = {
  in: 'in-stock',
  low: 'low-stock',
  out: 'out-of-stock',
  inactive: 'inactive',
};

const getTotalStock = (product: Product) => product.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0);
const getDisplayPrice = (product: Product) => product.variants.find((variant) => variant.sellingPrice > 0)?.sellingPrice ?? 0;

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

export default function InventoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;
  const isWeb = Platform.OS === 'web';
  const isWebDesktop = isWeb && isDesktop;
  const showSplitView = !isMobile && !isWebDesktop;

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const palette = usePaymentsPalette();
  const procurements = useFyllStore((s) => s.procurements);
  const lastDataSyncAt = useFyllStore((s) => s.lastDataSyncAt);
  const hasVerifiedProductsData = useFyllStore((s) => s.hasVerifiedProductsData);
  const verifiedCollectionsBusinessId = useFyllStore((s) => s.verifiedCollectionsBusinessId);
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

  // A persisted web preview is intentionally incomplete. Only render the list
  // after a business-scoped full snapshot has been restored or fetched.
  const isInitialLoading = isAuthenticated && !isOfflineMode && (
    !hasVerifiedProductsData || verifiedCollectionsBusinessId !== businessId
  );
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

  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryTab, setInventoryTab] = useState<'products' | 'services'>('products');
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortBy, setSortBy] = useState<InventorySort>('name-asc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visibleProductsCount, setVisibleProductsCount] = useState(INVENTORY_PAGE_SIZE);
  const [visibleServicesCount, setVisibleServicesCount] = useState(INVENTORY_PAGE_SIZE);
  // Products synced in from a connected WooCommerce store are hidden from
  // the main inventory view, so a store's already-audited manual inventory
  // isn't diluted by an incoming catalog.
  // Archived products (see Product.isArchived) are hidden from the main
  // inventory view too — same session-only reveal pattern as synced ones.
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const activeFilterCount = (inventoryFilter !== 'all' ? 1 : 0) + (sortBy !== 'name-asc' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0);
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
  const [isBulkDeactivating, setIsBulkDeactivating] = useState<boolean>(false);
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
  const isSyncedProduct = (product: Product) => product.catalogSource === 'woocommerce-plugin';
  const isArchivedProduct = (product: Product) => Boolean(product.isArchived);
  const archivedHiddenCount = useMemo(
    () => (showArchivedProducts ? 0 : products.filter((product) => !isServiceProduct(product) && isArchivedProduct(product)).length),
    [products, showArchivedProducts]
  );

  // Physical products shown in the main list: no services, no WooCommerce-synced
  // catalog copies, and archived ones only when revealed.
  const productsBase = useMemo(
    () => products.filter((p) => !isServiceProduct(p) && !isSyncedProduct(p) && (showArchivedProducts || !isArchivedProduct(p))),
    [products, showArchivedProducts]
  );

  const productCategories = useMemo(() => {
    const names = new Set<string>();
    productsBase.forEach((product) => product.categories?.forEach((category) => {
      const trimmed = category.trim();
      if (trimmed) names.add(trimmed);
    }));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [productsBase]);

  // Search + category narrow the list; the status pills then split it (their
  // counts reflect the current search and category).
  const searchedProducts = useMemo(() => {
    let result = productsBase;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(query))
      );
    }
    if (categoryFilter === NO_CATEGORY) {
      result = result.filter((p) => !p.categories?.some((category) => category.trim()));
    } else if (categoryFilter !== 'all') {
      result = result.filter((p) => p.categories?.some((category) => category.trim() === categoryFilter));
    }
    return result;
  }, [productsBase, searchQuery, categoryFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<InventoryFilter, number> = { all: searchedProducts.length, 'low-stock': 0, 'in-stock': 0, 'out-of-stock': 0, inactive: 0 };
    searchedProducts.forEach((product) => {
      counts[FILTER_FOR_STATUS[getStockStatus(product, getEffectiveThreshold(product))]] += 1;
    });
    return counts;
  }, [searchedProducts, useGlobalLowStockThreshold, globalLowStockThreshold]);

  const filteredProducts = useMemo(() => {
    let result = searchedProducts;
    if (inventoryFilter !== 'all') {
      result = result.filter((p) => FILTER_FOR_STATUS[getStockStatus(p, getEffectiveThreshold(p))] === inventoryFilter);
    }

    return [...result].sort((a, b) => {
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
          return getTotalStock(a) - getTotalStock(b);
        case 'stock-high':
          return getTotalStock(b) - getTotalStock(a);
        default:
          return 0;
      }
    });
  }, [searchedProducts, inventoryFilter, sortBy, useGlobalLowStockThreshold, globalLowStockThreshold]);

  // Products with an order this calendar month (cancelled/failed orders ignored),
  // used to flag sold-out products worth restocking first.
  const productIdsOrderedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const ids = new Set<string>();
    orders.forEach((order) => {
      const placedAt = new Date(order.orderDate || order.createdAt).getTime();
      if (!Number.isFinite(placedAt) || placedAt < monthStart) return;
      const status = (order.status || '').toLowerCase();
      if (status.includes('cancel') || status.includes('refund') || status.includes('failed')) return;
      order.items?.forEach((item) => {
        if (item.productId) ids.add(item.productId);
      });
    });
    return ids;
  }, [orders]);

  // Page summary: whole catalogue, not the current search.
  const inventoryStats = useMemo(() => {
    let units = 0;
    let value = 0;
    let low = 0;
    let out = 0;
    let tidy = 0;
    const outWithOrders: Product[] = [];
    productsBase.forEach((product) => {
      const status = getStockStatus(product, getEffectiveThreshold(product));
      product.variants.forEach((variant) => {
        const stock = Math.max(0, variant.stock);
        units += stock;
        value += stock * (variant.sellingPrice || 0);
      });
      if (status === 'low') low += 1;
      if (status === 'out') {
        out += 1;
        if (productIdsOrderedThisMonth.has(product.id)) outWithOrders.push(product);
      }
      const hasCategory = Boolean(product.categories?.some((category) => category.trim()));
      const hasPrice = product.variants.some((variant) => variant.sellingPrice > 0);
      if (status !== 'inactive' && (!hasCategory || (isOwner && !hasPrice))) tidy += 1;
    });
    return { products: productsBase.length, units, value, low, out, tidy, outWithOrders };
  }, [productsBase, productIdsOrderedThisMonth, isOwner, useGlobalLowStockThreshold, globalLowStockThreshold]);

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
  useEffect(() => {
    setVisibleProductsCount(INVENTORY_PAGE_SIZE);
  }, [searchQuery, inventoryFilter, sortBy, categoryFilter, products.length]);

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

  const confirmBulkMarkInactive = async () => {
    if (isBulkDeactivating || selectedProductIds.length === 0) return;
    setIsBulkDeactivating(true);
    const discontinuedAt = new Date().toISOString();
    try {
      for (const productId of selectedProductIds) {
        const product = products.find((item) => item.id === productId);
        if (!product || product.isDiscontinued) continue;
        await updateProduct(productId, { isDiscontinued: true, discontinuedAt: product.discontinuedAt ?? discontinuedAt }, businessId);
      }
      const count = selectedProductIds.length;
      setSelectedProductIds([]);
      showToast('success', count === 1 ? '1 product marked inactive.' : `${count} products marked inactive.`);
    } catch (error) {
      console.warn('Bulk mark inactive failed:', error);
      showToast('error', 'Could not mark selected products inactive.');
    } finally {
      setIsBulkDeactivating(false);
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

  // Master pane content
  const horizontalPadding = isMobile ? 16 : isWebDesktop ? 28 : 20;
  const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
  const tableHeadStyle = { color: palette.faint, fontSize: 11.5, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const filterPills: { key: InventoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'low-stock', label: 'Low stock' },
    { key: 'out-of-stock', label: 'Out of stock' },
    { key: 'in-stock', label: 'In stock' },
    { key: 'inactive', label: 'Inactive' },
  ];
  const sortOptions: { key: InventorySort; label: string }[] = [
    { key: 'name-asc', label: 'Name A–Z' },
    { key: 'name-desc', label: 'Name Z–A' },
    { key: 'stock-low', label: 'Lowest stock' },
    { key: 'stock-high', label: 'Highest stock' },
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
  ];
  const categoryOptions: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    ...productCategories.map((category) => ({ key: category, label: category })),
    { key: NO_CATEGORY, label: 'No category' },
  ];
  const restockNames = inventoryStats.outWithOrders.map((product) => product.name);
  const restockNamesLabel = restockNames.length > 3
    ? `${restockNames.slice(0, 3).join(', ')} and ${restockNames.length - 3} more`
    : restockNames.join(', ');
  const statTiles: { key: string; label: string; value: string; sub: string; dot?: string; filter?: InventoryFilter }[] = [
    {
      key: 'value',
      label: isOwner ? 'Stock value' : 'Units in stock',
      value: isOwner ? formatCompactNaira(inventoryStats.value) : inventoryStats.units.toLocaleString('en-NG'),
      sub: isOwner
        ? `${inventoryStats.units.toLocaleString('en-NG')} units · ${inventoryStats.products} products`
        : `${inventoryStats.products} products`,
    },
    {
      key: 'low',
      label: 'Low stock',
      value: String(inventoryStats.low),
      sub: useGlobalLowStockThreshold ? `${globalLowStockThreshold} or fewer per variant` : 'At or below each threshold',
      dot: palette.tones.awaiting.dot,
      filter: 'low-stock',
    },
    {
      key: 'out',
      label: 'Out of stock',
      value: String(inventoryStats.out),
      sub: inventoryStats.outWithOrders.length > 0 ? `${inventoryStats.outWithOrders.length} had orders this month` : 'None ordered this month',
      dot: palette.danger,
      filter: 'out-of-stock',
    },
    {
      key: 'tidy',
      label: 'Needs tidying',
      value: String(inventoryStats.tidy),
      sub: isOwner ? 'No category or no price' : 'No category',
      dot: palette.faint,
    },
  ];
  const pickFilter = (key: InventoryFilter) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setInventoryFilter(key);
  };

  const searchField = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: isWebDesktop ? 44 : 48,
        width: isWebDesktop ? 340 : undefined,
        flexShrink: 0,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 999,
        backgroundColor: palette.inputBg,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Search size={17} color={palette.faint} strokeWidth={2} />
      <TextInput
        placeholder={inventoryTab === 'services' ? 'Search services' : 'Search products or SKUs'}
        placeholderTextColor={palette.faint}
        value={searchQuery}
        onChangeText={setSearchQuery}
        accessibilityLabel="Search products"
        style={[{ flex: 1, height: '100%', paddingVertical: 0, color: palette.text, fontSize: 14.5 }, webNoOutline]}
        selectionColor={palette.text}
      />
      <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
    </View>
  );

  const filterPillRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 1, ...(isWebDesktop ? { flex: 1 } : { marginRight: -horizontalPadding }) }}
      contentContainerStyle={{ gap: 8, paddingRight: isWebDesktop ? 0 : horizontalPadding, alignItems: 'center' }}
    >
      {filterPills.map((pill) => (
        <FilterPill
          key={pill.key}
          label={pill.label}
          count={statusCounts[pill.key]}
          active={inventoryFilter === pill.key}
          onPress={() => pickFilter(pill.key)}
          palette={palette}
        />
      ))}
      {!isWebDesktop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort and category"
          onPress={() => setShowFilterMenu(true)}
          style={(state) => ({
            flexShrink: 0,
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: activeFilterCount > 0 ? palette.inverseBg : palette.outline,
            opacity: state.pressed ? 0.7 : 1,
          })}
        >
          <ArrowDownAZ size={14} color={palette.textSoft} strokeWidth={2.2} />
          <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>Sort</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  const emptyProducts = (
    <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: palette.softFill }}>
        <Package size={28} color={palette.faint} strokeWidth={1.6} />
      </View>
      <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
        {productsBase.length === 0 ? 'No products yet' : 'No products match'}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
        {productsBase.length === 0 ? 'Add your first product to get started.' : 'Try another search or filter.'}
      </Text>
      {productsBase.length === 0 ? (
        <Pressable
          onPress={handleAddProduct}
          style={(state) => ({ height: 40, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}
        >
          <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Add product</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const listFooter = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: isWebDesktop ? 'space-between' : 'center',
        gap: 12,
        paddingHorizontal: isWebDesktop ? 22 : 0,
        paddingVertical: 14,
        borderTopWidth: isWebDesktop ? 1 : 0,
        borderTopColor: palette.hairline,
      }}
    >
      <Text style={{ color: palette.faint, fontSize: 13 }}>
        Showing {visibleProducts.length} of {filteredProducts.length} products
      </Text>
      {hasMoreProducts ? (
        <Pressable
          onPress={loadMoreInventoryItems}
          style={(state) => ({ height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
        >
          <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>Load more</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const masterContent = (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.page }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: isWebDesktop ? 1456 : showSplitView ? undefined : 760,
        alignSelf: isWebDesktop ? 'flex-start' : 'center',
        paddingHorizontal: horizontalPadding,
        paddingBottom: tabBarHeight + (selectedProductIds.length > 0 ? 110 : 32),
        gap: isWebDesktop ? 18 : 14,
      }}
      showsVerticalScrollIndicator={false}
      onScroll={handleInventoryScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={!isWebDesktop && inventoryTab === 'products' ? [2] : undefined}
    >
      <View
        style={{
          paddingTop: isWebDesktop ? 36 : 14,
          paddingBottom: isWebDesktop ? 6 : 0,
          flexDirection: 'row',
          alignItems: isWebDesktop ? 'flex-end' : 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ color: palette.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 }} numberOfLines={1}>
            {inventoryTab === 'services' ? 'Services' : 'Inventory'}
          </Text>
          {isWebDesktop ? (
            <Text style={{ color: palette.faint, fontSize: 14 }}>Products, variants and stock across your store.</Text>
          ) : null}
          {isOfflineMode || archivedHiddenCount > 0 || showArchivedProducts ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {isOfflineMode ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                  <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '600' }}>Offline · Last synced {lastSyncLabel}</Text>
                </View>
              ) : null}
              {inventoryTab === 'products' && archivedHiddenCount > 0 ? (
                <Pressable
                  onPress={() => setShowArchivedProducts(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: palette.outline }}
                >
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>{archivedHiddenCount} archived hidden</Text>
                  <ChevronDown size={12} color={palette.muted} strokeWidth={2.4} />
                </Pressable>
              ) : null}
              {inventoryTab === 'products' && showArchivedProducts ? (
                <Pressable
                  onPress={() => setShowArchivedProducts(false)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}
                >
                  <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>Showing archived products</Text>
                  <ChevronUp size={12} color={palette.limeOnSurface} strokeWidth={2.4} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: isWebDesktop ? 10 : 8, alignItems: 'center' }}>
          {inventoryTab === 'products' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stock audit"
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.replace('/inventory-audit');
              }}
              style={(state) => ({
                height: 40,
                width: isWebDesktop ? undefined : 40,
                paddingHorizontal: isWebDesktop ? 16 : 0,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                borderWidth: 1,
                borderColor: palette.outline,
                backgroundColor: isHovered(state) ? palette.softFill : 'transparent',
              })}
            >
              <ClipboardCheck size={15} color={palette.text} strokeWidth={2} />
              {isWebDesktop ? <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Stock audit</Text> : null}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={inventoryTab === 'services' ? handleAddService : handleAddProduct}
            style={(state) => ({
              height: 40,
              paddingHorizontal: 16,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
              opacity: state.pressed ? 0.85 : 1,
            })}
          >
            <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
            <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>
              {inventoryTab === 'services' ? 'Add service' : isWebDesktop ? 'Add product' : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>

      {inventoryTab === 'services' ? (
        <View style={{ gap: 14 }}>
          {searchField}
          {isInitialLoading ? (
            <View>
              <ProductCardSkeleton />
              <ProductCardSkeleton />
              <ProductCardSkeleton />
            </View>
          ) : (
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
          )}
        </View>
      ) : (
        <View style={{ gap: isWebDesktop ? 18 : 14 }}>
          {isWebDesktop ? (
            <View style={{ flexDirection: 'row', borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
              {statTiles.map((tile, index) => {
                const filterKey = tile.filter;
                const content = (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {tile.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} /> : null}
                      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{tile.label}</Text>
                    </View>
                    {index === 0 ? (
                      <MoneyText style={{ color: palette.text, fontSize: 28, letterSpacing: -0.5 }} numberOfLines={1}>{tile.value}</MoneyText>
                    ) : (
                      <Text style={{ color: palette.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                    )}
                    <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{tile.sub}</Text>
                  </>
                );
                const tileStyle = { flex: index === 0 ? 1.3 : 1, minWidth: 0, gap: 4, paddingVertical: 18, paddingHorizontal: 22, borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: palette.hairline, justifyContent: 'center' as const };
                return filterKey ? (
                  <Pressable
                    key={tile.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${tile.label.toLowerCase()}`}
                    onPress={() => pickFilter(filterKey)}
                    style={(state) => ({ ...tileStyle, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={tile.key} style={tileStyle}>{content}</View>
                );
              })}
            </View>
          ) : (
            <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{statTiles[0].label}</Text>
                <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -0.8 }} numberOfLines={1}>{statTiles[0].value}</MoneyText>
                <Text style={{ color: palette.faint, fontSize: 13 }}>
                  {isOwner
                    ? `${inventoryStats.units.toLocaleString('en-NG')} units across ${inventoryStats.products} products`
                    : `Across ${inventoryStats.products} products`}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: palette.hairline }} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {statTiles.slice(1, 3).map((tile) => (
                  <Pressable key={tile.key} onPress={() => tile.filter && pickFilter(tile.filter)} style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} />
                      <Text style={{ color: palette.muted, fontSize: 12 }}>{tile.label}</Text>
                    </View>
                    <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {inventoryStats.outWithOrders.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => pickFilter('out-of-stock')}
              style={(state) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: isWebDesktop ? 16 : 14,
                borderRadius: 16,
                backgroundColor: palette.nudgeBg,
                borderWidth: 1,
                borderColor: palette.nudgeBorder,
                opacity: state.pressed ? 0.8 : 1,
              })}
            >
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
                <Package size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
              </View>
              <Text style={{ flex: 1, color: palette.text, fontSize: isMobile ? 12 : 14, fontWeight: isMobile ? '500' : '600' }} numberOfLines={isWebDesktop ? 1 : 2}>
                Restock first: {inventoryStats.outWithOrders.length} sold-out {inventoryStats.outWithOrders.length === 1 ? 'product' : 'products'} had orders this month
                <Text style={{ color: palette.nudgeSub, fontWeight: '400' }}> · {restockNamesLabel}</Text>
              </Text>
              <ChevronRight size={16} color={palette.limeOnSurface} strokeWidth={2.2} />
            </Pressable>
          ) : null}

        </View>
      )}
      {inventoryTab === 'products' ? (
        <View style={{ gap: 14, zIndex: 30, backgroundColor: palette.page, marginHorizontal: isWebDesktop ? 0 : -horizontalPadding, paddingHorizontal: isWebDesktop ? 0 : horizontalPadding, paddingVertical: isWebDesktop ? 0 : 8 }}>
          {isWebDesktop ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 30 }}>
              {searchField}
              {filterPillRow}
              <MenuPill prefix="Category" value={categoryFilter} options={categoryOptions} onSelect={setCategoryFilter} palette={palette} />
              <MenuPill prefix="Sort" value={sortBy} options={sortOptions} onSelect={setSortBy} palette={palette} />
            </View>
          ) : (
            <>
              {searchField}
              {filterPillRow}
            </>
          )}

        </View>
      ) : null}
      {inventoryTab === 'products' ? (
        <View style={{ gap: 14 }}>
          {isInitialLoading ? (
            <View>
              <ProductCardSkeleton />
              <ProductCardSkeleton />
              <ProductCardSkeleton />
              <ProductCardSkeleton />
            </View>
          ) : isWebDesktop ? (
            <View style={{ borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: TABLE_COLUMNS.gap, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                <InventoryCheckbox checked={allVisibleProductsSelected} onPress={toggleVisibleProductSelection} palette={palette} label="Select all products" />
                <Text style={[tableHeadStyle, { flex: 2.4 }]}>Product</Text>
                <Text style={[tableHeadStyle, { flex: 1 }]}>Category</Text>
                <Text style={[tableHeadStyle, { width: TABLE_COLUMNS.stock, textAlign: 'right' }]}>Stock</Text>
                {isOwner ? <Text style={[tableHeadStyle, { width: TABLE_COLUMNS.price, textAlign: 'right' }]}>Price</Text> : null}
                <Text style={[tableHeadStyle, { width: TABLE_COLUMNS.status }]}>Status</Text>
                <View style={{ width: TABLE_COLUMNS.trail }} />
              </View>
              {filteredProducts.length === 0 ? emptyProducts : visibleProducts.map((product, index) => {
                const threshold = getEffectiveThreshold(product);
                return (
                  <ProductTableRow
                    key={product.id}
                    product={product}
                    status={getStockStatus(product, threshold)}
                    threshold={threshold}
                    totalStock={getTotalStock(product)}
                    displayPrice={getDisplayPrice(product)}
                    isOwner={isOwner}
                    selected={selectedProductIds.includes(product.id)}
                    expanded={Boolean(expandedByProductId[product.id])}
                    isLast={index === visibleProducts.length - 1}
                    palette={palette}
                    onToggleSelect={() => toggleProductSelection(product.id)}
                    onToggleExpand={() => toggleExpanded(product.id)}
                    onOpen={() => handleProductSelect(product.id)}
                    onAdjustStock={(variantId, delta) => handleAdjustStock(product.id, variantId, delta)}
                    onRestock={(variantId) => router.push({ pathname: '/restock', params: { productId: product.id, variantId } })}
                    onPrintLabel={(variantId) => router.push({ pathname: '/label-print', params: { productId: product.id, variantId } })}
                  />
                );
              })}
              {filteredProducts.length > 0 ? listFooter : null}
            </View>
          ) : (
            <>
              <View style={{ borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
                {filteredProducts.length === 0 ? emptyProducts : visibleProducts.map((product, index) => (
                  <ProductListRow
                    key={product.id}
                    product={product}
                    status={getStockStatus(product, getEffectiveThreshold(product))}
                    totalStock={getTotalStock(product)}
                    displayPrice={getDisplayPrice(product)}
                    isOwner={isOwner}
                    isFirst={index === 0}
                    active={showSplitView && selectedProductId === product.id}
                    palette={palette}
                    onPress={() => handleProductSelect(product.id)}
                  />
                ))}
              </View>
              {filteredProducts.length > 0 ? listFooter : null}
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
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
          animationType={isMobile ? 'fade' : 'none'}
          transparent
          onRequestClose={() => setShowFilterMenu(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              flexDirection: isWebDesktop ? 'row' : 'column',
              justifyContent: 'flex-end',
              paddingHorizontal: isWebDesktop ? 0 : MOBILE_FILTER_SHEET.horizontalInset,
              paddingBottom: isWebDesktop ? 0 : MOBILE_FILTER_SHEET.bottomInset,
            }}
            onPress={() => setShowFilterMenu(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className={isWebDesktop ? undefined : 'overflow-hidden'}
              style={
                isWebDesktop
                  ? {
                      backgroundColor: colors.bg.primary,
                      width: 400,
                      maxWidth: '100%',
                      borderTopLeftRadius: 24,
                      borderBottomLeftRadius: 24,
                      overflow: 'hidden',
                      borderWidth: isDark ? 1 : 0,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                    }
                  : {
                      backgroundColor: colors.bg.primary,
                      width: '100%',
                      maxHeight: MOBILE_FILTER_SHEET.maxHeight,
                      borderTopLeftRadius: MOBILE_FILTER_SHEET.borderRadius,
                      borderTopRightRadius: MOBILE_FILTER_SHEET.borderRadius,
                      borderBottomLeftRadius: 0,
                      borderBottomRightRadius: 0,
                      borderWidth: 0,
                      paddingTop: 8,
                      overflow: 'hidden',
                    }
              }
            >
              {/* Handle */}
              {!isWebDesktop && (
                <View className="items-center py-3">
                  <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
                </View>
              )}

              {/* Header */}
              <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor, paddingTop: isWebDesktop ? 20 : 0 }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter & Sort</Text>
                <Pressable
                  onPress={() => setShowFilterMenu(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={isWebDesktop ? { flex: 1 } : undefined}>
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
                      description: 'Every variant is sold out',
                      icon: AlertTriangle,
                      helperColor: '#EF4444',
                    },
                    {
                      key: 'inactive',
                      label: 'Inactive',
                      description: 'Products marked inactive',
                      icon: Power,
                      helperColor: '#9CA3AF',
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
                      setCategoryFilter('all');
                    }}
                    className="mt-3 items-center justify-center active:opacity-80"
                    style={{
                      height: MOBILE_FILTER_SHEET.actionHeight,
                      borderRadius: MOBILE_FILTER_SHEET.actionRadius,
                      backgroundColor: colors.bg.secondary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Clear filters</Text>
                  </Pressable>
                </View>

{productCategories.length > 0 ? (
                  <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                    <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Category</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {[{ key: 'all', label: 'All' }, ...productCategories.map((category) => ({ key: category, label: category })), { key: NO_CATEGORY, label: 'No category' }].map((option) => (
                        <FilterPill
                          key={option.key}
                          label={option.label}
                          active={categoryFilter === option.key}
                          onPress={() => setCategoryFilter(option.key)}
                          palette={palette}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

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
                    className="items-center justify-center active:opacity-80"
                    style={{
                      height: MOBILE_FILTER_SHEET.actionHeight,
                      borderRadius: MOBILE_FILTER_SHEET.actionRadius,
                      backgroundColor: colors.accent.primary,
                    }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold">Apply</Text>
                  </Pressable>
                </View>

                <View className="h-8" />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
        {isWebDesktop && inventoryTab === 'products' && selectedProductIds.length > 0 ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 32, alignItems: 'center' }}>
            <View
              accessibilityRole="toolbar"
              accessibilityLabel="Bulk actions"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 8,
                paddingRight: 8,
                paddingLeft: 18,
                borderRadius: 999,
                backgroundColor: palette.inverseBg,
                shadowColor: '#000',
                shadowOpacity: 0.45,
                shadowRadius: 40,
                shadowOffset: { width: 0, height: 18 },
              }}
            >
              <Text style={{ color: palette.inverseText, fontSize: 14, fontWeight: '600', paddingRight: 10 }}>
                {selectedProductIds.length} selected
              </Text>
              {[
                { key: 'archive', label: isBulkArchiving ? 'Archiving…' : 'Archive', icon: Archive, onPress: confirmBulkArchiveProducts, busy: isBulkArchiving, filled: true },
                { key: 'inactive', label: isBulkDeactivating ? 'Updating…' : 'Mark inactive', icon: Power, onPress: confirmBulkMarkInactive, busy: isBulkDeactivating, filled: false },
                { key: 'delete', label: 'Move to Recycle Bin', icon: Trash2, onPress: () => setPendingBulkDelete(true), busy: false, filled: false },
              ].map((action) => {
                const Icon = action.icon;
                const ink = action.filled ? palette.inverseBg : palette.inverseText;
                return (
                  <Pressable
                    key={action.key}
                    onPress={() => { void action.onPress(); }}
                    disabled={action.busy}
                    style={(state) => ({
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: action.filled ? palette.inverseText : isHovered(state) ? (palette.isDark ? 'rgba(20,20,20,0.06)' : 'rgba(255,255,255,0.08)') : 'transparent',
                      borderWidth: action.filled ? 0 : 1,
                      borderColor: palette.isDark ? 'rgba(20,20,20,0.18)' : 'rgba(255,255,255,0.22)',
                      opacity: action.busy ? 0.6 : state.pressed ? 0.8 : 1,
                    })}
                  >
                    <Icon size={14} color={ink} strokeWidth={2.2} />
                    <Text style={{ color: ink, fontSize: 13.5, fontWeight: '600' }}>{action.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
                onPress={() => setSelectedProductIds([])}
                style={(state) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: state.pressed ? 0.6 : 1 })}
              >
                <X size={16} color={palette.inverseText} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        ) : null}
        {toast ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: isWebDesktop && selectedProductIds.length > 0 ? 100 : 24,
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
