import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Modal, Switch, KeyboardAvoidingView, Platform, Dimensions, type PressableStateCallbackType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Package, Plus, Minus, Trash2, X, ChevronDown, Printer, Camera, ImageIcon, MoreHorizontal, AlertTriangle } from 'lucide-react-native';
import useFyllStore, { type Procurement, ProductVariant } from '@/lib/state/fyll-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import { useImagePicker } from '@/hooks/useImagePicker';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { prepareProductMediaForPersistence, uploadProductMediaIfNeeded } from '@/lib/product-media';
import { SearchClearButton } from '@/components/SearchClearButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette, BackButton } from '@/components/payments/payments-ui';
import { StockStatusLabel, formatNaira, getVariantStatus } from '@/components/inventory/inventory-ui';

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

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const themeColors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  const colors = themeColors;
  const modalFieldBorder = isDark ? '#343434' : '#E5E7EB';
  const modalFieldBg = isDark ? '#181818' : '#FAFAFA';
  const modalDropdownBg = isDark ? '#1C1C1C' : '#FFFFFF';
  const modalSectionTitleClass = 'font-semibold text-[15px]';
  const modalFieldLabelClass = 'text-xs font-semibold uppercase tracking-wider';
  const { isDesktop, width } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const useFullscreenEditModal = Platform.OS !== 'web' || width < 768;
  const isNarrowWeb = Platform.OS === 'web' && width < 1280;
  const isCompactWeb = Platform.OS === 'web' && width < 1100;
  const webMaxWidth = 1456;
  const rightColumnWidth = isWebDesktop ? (isNarrowWeb ? Math.max(320, Math.round(width * 0.3)) : 420) : undefined;
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const products = useFyllStore((s) => s.products);
  const procurements = useFyllStore((s) => s.procurements);
  const productVariables = useFyllStore((s) => s.productVariables);
  const globalCategories = useFyllStore((s) => s.categories);
  const addCategory = useFyllStore((s) => s.addCategory);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const deleteProduct = useFyllStore((s) => s.deleteProduct);
  const userRole = useFyllStore((s) => s.userRole);
  const restockLogs = useFyllStore((s) => s.restockLogs);
  const auditLogs = useFyllStore((s) => s.auditLogs);
  const orders = useFyllStore((s) => s.orders);
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);
  const palette = usePaymentsPalette();
  const businessId = useAuthStore((s) => s.businessId);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? null);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);
  const isOwner = userRole === 'owner';
  const canManageStatus = userRole === 'owner' || currentUserRole === 'admin' || currentUserRole === 'manager';
  const canManageVariants = userRole === 'owner' || currentUserRole === 'admin' || currentUserRole === 'manager';

  useEffect(() => {
    if (!product || !procurements.length) return;
    const imageByProductVariant = buildProcurementVariantImageMap(procurements);
    let changed = false;
    const nextVariants = product.variants.map((variant) => {
      if (variant.imageUrl) return variant;
      const imageUrl = imageByProductVariant.get(`${product.id}:${variant.id}`);
      if (!imageUrl) return variant;
      changed = true;
      return { ...variant, imageUrl };
    });
    if (!changed) return;
    void updateProduct(product.id, { variants: nextVariants }, businessId);
  }, [businessId, procurements, product, updateProduct]);

  // Get recent restock logs for this product (last 3)
  const recentRestocks = useMemo(() => {
    if (!id) return [];
    return restockLogs
      .filter((log) => log.productId === id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3);
  }, [restockLogs, id]);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(product?.name || '');
  const [editDescription, setEditDescription] = useState(product?.description || '');
  const [editThreshold, setEditThreshold] = useState(String(product?.lowStockThreshold || 5));
  const [editCategories, setEditCategories] = useState<string[]>(product?.categories || []);
  const [newCategory, setNewCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string | undefined>(product?.imageUrl);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [webCategoryQuery, setWebCategoryQuery] = useState('');
  const [showMobileHeaderMenu, setShowMobileHeaderMenu] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const galleryScrollRef = useRef<ScrollView>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const urls = [
      product.imageUrl,
      ...product.variants.map((variant) => variant.imageUrl),
    ].filter((value): value is string => Boolean(value));
    return Array.from(new Set(urls));
  }, [product]);

  const primaryDisplayImage = useMemo(() => {
    if (!product) return undefined;
    return product.imageUrl ?? product.variants.find((variant) => variant.imageUrl?.trim())?.imageUrl;
  }, [product]);

  const handleOpenGallery = (targetUrl?: string) => {
    if (!galleryImages.length) return;
    const nextIndex = targetUrl ? Math.max(0, galleryImages.indexOf(targetUrl)) : 0;
    setGalleryIndex(nextIndex === -1 ? 0 : nextIndex);
    setIsGalleryOpen(true);
  };

  useEffect(() => {
    if (!isGalleryOpen) return;
    requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({ x: galleryIndex * screenWidth, animated: false });
    });
  }, [galleryIndex, isGalleryOpen, screenWidth]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  // New Design edit state
  const [editIsNewDesign, setEditIsNewDesign] = useState(product?.isNewDesign || false);
  const [editDesignYear, setEditDesignYear] = useState(String(product?.designYear || new Date().getFullYear()));

  // Discontinued edit state
  const [editIsDiscontinued, setEditIsDiscontinued] = useState(product?.isDiscontinued || false);

  // Global pricing state
  const [useGlobalPrice, setUseGlobalPrice] = useState(true);
  const [globalPrice, setGlobalPrice] = useState('');
  const [useGlobalStock, setUseGlobalStock] = useState(false);
  const [globalStock, setGlobalStock] = useState('');

  // Add variant modal state
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [selectedVariableId, setSelectedVariableId] = useState<string>('');
  const [newVariantValue, setNewVariantValue] = useState('');
  const [newVariantSku, setNewVariantSku] = useState('');
  const [newVariantStock, setNewVariantStock] = useState('0');
  const [newVariantPrice, setNewVariantPrice] = useState('');
  const [overrideVariantStock, setOverrideVariantStock] = useState(true);
  const [overrideVariantPrice, setOverrideVariantPrice] = useState(true);
  const [showVariableTypeDropdown, setShowVariableTypeDropdown] = useState(false);

  // Edit variant modal state
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [editVariantSku, setEditVariantSku] = useState('');
  const [editVariantPrice, setEditVariantPrice] = useState('');
  const [editVariantName, setEditVariantName] = useState('');
  const [editVariantImageUrl, setEditVariantImageUrl] = useState<string | undefined>(undefined);
  const [editVariantStock, setEditVariantStock] = useState('');
  const [editOverrideVariantPrice, setEditOverrideVariantPrice] = useState(false);
  const [editOverrideVariantStock, setEditOverrideVariantStock] = useState(false);

  // Stock steppers stage changes until Save (see the floating save bar).
  const [pendingStock, setPendingStock] = useState<Record<string, number>>({});
  const [isSavingStock, setIsSavingStock] = useState<boolean>(false);
  const [activityTab, setActivityTab] = useState<'all' | 'sale' | 'adj' | 'restock'>('all');
  const [openVariantMenuId, setOpenVariantMenuId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [mobileVariantActions, setMobileVariantActions] = useState<ProductVariant | null>(null);

  // Use the web-safe image picker hook
  const imagePicker = useImagePicker();

  const soldStats = useMemo(() => {
    if (!product) {
      return { totalSold: 0, bestVariantId: null, bestVariantSold: 0, variantSales: [] as { id: string; name: string; quantity: number }[] };
    }
    const salesByVariantId = new Map<string, number>();
    let totalSold = 0;

    orders.forEach((order) => {
      const status = (order.status ?? '').toLowerCase();
      const isCancelled = status.includes('cancel');
      const isRefunded = status.includes('refund');
      if (isCancelled || isRefunded) return;

      order.items.forEach((item) => {
        if (item.productId !== product.id) return;
        totalSold += item.quantity;
        salesByVariantId.set(item.variantId, (salesByVariantId.get(item.variantId) ?? 0) + item.quantity);
      });
    });

    let bestVariantId: string | null = null;
    let bestVariantSold = 0;
    salesByVariantId.forEach((qty, variantId) => {
      if (qty > bestVariantSold) {
        bestVariantSold = qty;
        bestVariantId = variantId;
      }
    });

    const variantSales = product.variants.map((variant) => {
      const name = Object.values(variant.variableValues ?? {}).join(' / ') || variant.sku || 'Variant';
      return {
        id: variant.id,
        name,
        quantity: salesByVariantId.get(variant.id) ?? 0,
      };
    }).sort((a, b) => b.quantity - a.quantity);

    return { totalSold, bestVariantId, bestVariantSold, variantSales };
  }, [orders, product]);

  const inventoryActivity = useMemo(() => {
    if (!product) return [] as Array<{
      id: string;
      type: 'sold' | 'restock' | 'audit_adjustment';
      variantName: string;
      quantity: number;
      delta: number;
      at: string;
      subtitle: string;
      actor?: string;
    }>;

    const variantNameById = new Map(
      product.variants.map((variant) => [
        variant.id,
        Object.values(variant.variableValues ?? {}).join(' / ') || variant.sku || 'Variant',
      ])
    );

    const saleEvents = orders.flatMap((order) => {
      const status = (order.status ?? '').toLowerCase();
      const isCancelled = status.includes('cancel');
      const isRefunded = status.includes('refund');
      if (isCancelled || isRefunded) return [];

      return (order.items ?? [])
        .filter((item) => item.productId === product.id && item.quantity > 0)
        .map((item, index) => {
          const orderRef = order.orderNumber ? `ORD-${order.orderNumber.replace(/^ORD[-\s]*/i, '')}` : 'Order';
          return {
            id: `sale-${order.id}-${item.variantId}-${index}`,
            type: 'sold' as const,
            variantName: variantNameById.get(item.variantId) ?? 'Unknown variant',
            quantity: item.quantity,
            delta: -Math.abs(item.quantity),
            at: order.orderDate ?? order.createdAt ?? order.updatedAt ?? new Date().toISOString(),
            subtitle: `${orderRef} · ${order.customerName || 'Unknown customer'}`,
            actor: order.createdBy,
          };
        });
    });

    const restockEvents = restockLogs
      .filter((log) => log.productId === product.id)
      .map((log) => ({
        id: `restock-${log.id}`,
        type: 'restock' as const,
        variantName: variantNameById.get(log.variantId) ?? 'Unknown variant',
        quantity: Math.abs(log.quantityAdded),
        delta: log.quantityAdded,
        at: log.timestamp,
        sourceType: log.sourceType,
        subtitle: log.note?.trim()
          ? `${log.note.trim()} · ${log.previousStock} → ${log.newStock}`
          : `${log.previousStock} → ${log.newStock}`,
        actor: log.performedBy,
      }));

    const auditAdjustmentEvents = auditLogs.flatMap((audit) => (
      (audit.items ?? [])
        .filter((item) => item.productId === product.id && item.discrepancy !== 0)
        .map((item, index) => ({
          id: `audit-${audit.id}-${item.variantId}-${index}`,
          type: 'audit_adjustment' as const,
          variantName: variantNameById.get(item.variantId) ?? item.variantName ?? 'Unknown variant',
          quantity: Math.abs(item.discrepancy),
          delta: item.discrepancy,
          at: audit.completedAt ?? new Date().toISOString(),
          subtitle: `Audit count · ${item.expectedStock} → ${item.actualStock}`,
          actor: audit.performedBy,
        }))
    ));

    return [...saleEvents, ...restockEvents, ...auditAdjustmentEvents]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30);
  }, [orders, product, restockLogs, auditLogs]);

  const selectedCategories = useMemo(() => product?.categories ?? [], [product?.categories]);
  const webCategorySuggestions = useMemo(() => {
    const query = webCategoryQuery.trim().toLowerCase();
    return globalCategories
      .filter((cat) => !selectedCategories.includes(cat))
      .filter((cat) => (query ? cat.toLowerCase().includes(query) : true))
      .slice(0, 8);
  }, [globalCategories, selectedCategories, webCategoryQuery]);

  const effectiveGlobalPrice = useMemo(() => {
    if (globalPrice.trim() !== '') {
      return parseFloat(globalPrice) || 0;
    }
    const fallback = product?.variants[0]?.sellingPrice ?? 0;
    return Number.isFinite(fallback) ? fallback : 0;
  }, [globalPrice, product?.variants]);

  const effectiveGlobalStock = useMemo(() => {
    if (globalStock.trim() !== '') {
      return parseInt(globalStock, 10) || 0;
    }
    const fallback = product?.globalStock ?? product?.variants[0]?.stock ?? 0;
    return Number.isFinite(fallback) ? fallback : 0;
  }, [globalStock, product?.globalStock, product?.variants]);

  if (!product) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.tertiary }} className="text-lg">Product not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-50">
          <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleOpenEdit = () => {
    setEditName(product.name);
    setEditDescription(product.description);
    setEditThreshold(String(product.lowStockThreshold));
    setEditCategories(product.categories || []);
    setNewCategory('');
    setEditImageUrl(product.imageUrl);
    // Load new design values
    setEditIsNewDesign(product.isNewDesign || false);
    setEditDesignYear(String(product.designYear || new Date().getFullYear()));
    // Load discontinued value
    setEditIsDiscontinued(product.isDiscontinued || false);
    // Check if all variants have same price
    const prices = product.variants.map(v => v.sellingPrice);
    const allSamePrice = prices.every(p => p === prices[0]);
    setUseGlobalPrice(allSamePrice);
    setGlobalPrice(allSamePrice ? String(prices[0]) : '');
    const stocks = product.variants.map((v) => v.stock);
    const allSameStock = stocks.every((s) => s === stocks[0]);
    const storedUseGlobalStock = product.useGlobalStock ?? false;
    setUseGlobalStock(storedUseGlobalStock);
    setGlobalStock(storedUseGlobalStock ? String(product.globalStock ?? (allSameStock ? stocks[0] : 0)) : '');
    setIsEditing(true);
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !editCategories.includes(newCategory.trim())) {
      const trimmedCat = newCategory.trim();
      setEditCategories([...editCategories, trimmedCat]);
      // Also save to global categories database
      addCategory(trimmedCat);
      setNewCategory('');
      setShowCategoryDropdown(false);
    }
  };

  const handleSelectCategory = (cat: string) => {
    if (!editCategories.includes(cat)) {
      setEditCategories([...editCategories, cat]);
    }
    setShowCategoryDropdown(false);
    setNewCategory('');
  };

  const handleRemoveCategory = (cat: string) => {
    setEditCategories(editCategories.filter(c => c !== cat));
  };

  // Image picker handler using the web-safe hook
  const handlePickImage = async () => {
    setShowImagePicker(false);
    const uri = await imagePicker.pickImage();
    if (uri) {
      setEditImageUrl(uri);
    }
  };

  const handleRemoveImage = () => {
    setEditImageUrl(undefined);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;

    // Determine if this is the first time marking as new design
    const wasNewDesign = product.isNewDesign || false;
    const nowNewDesign = editIsNewDesign;
    const firstTimeNewDesign = !wasNewDesign && nowNewDesign;

    // Determine if this is the first time marking as discontinued
    const wasDiscontinued = product.isDiscontinued || false;
    const nowDiscontinued = editIsDiscontinued;
    const firstTimeDiscontinued = !wasDiscontinued && nowDiscontinued;

    let nextVariants = product.variants;
    if (useGlobalPrice && globalPrice) {
      const newPrice = parseFloat(globalPrice) || 0;
      nextVariants = product.variants.map((variant) => ({
        ...variant,
        sellingPrice: newPrice,
      }));
    }
    if (useGlobalStock) {
      const newStock = parseInt(globalStock, 10) || 0;
      nextVariants = nextVariants.map((variant) => ({
        ...variant,
        stock: newStock,
      }));
    }

    const nextProductName = editName.trim();

    const preparedMedia = await prepareProductMediaForPersistence({
      businessId,
      productId: product.id,
      imageUrl: editImageUrl,
      variants: nextVariants,
    });

    const renamedVariants = preparedMedia.variants.map((variant) => {
      const variantValue = Object.values(variant.variableValues ?? {})
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' / ');

      return {
        ...variant,
        sku: variantValue ? `${nextProductName || 'Product'} - ${variantValue}` : variant.sku,
      };
    });

    await updateProduct(product.id, {
      name: nextProductName,
      description: editDescription.trim(),
      lowStockThreshold: parseInt(editThreshold, 10) || 5,
      categories: editCategories,
      imageUrl: preparedMedia.imageUrl,
      variants: renamedVariants,
      useGlobalStock: useGlobalStock,
      globalStock: useGlobalStock ? (parseInt(globalStock, 10) || 0) : undefined,
      // New Design fields
      isNewDesign: editIsNewDesign,
      designYear: editIsNewDesign ? parseInt(editDesignYear, 10) || new Date().getFullYear() : undefined,
      designLaunchedAt: firstTimeNewDesign
        ? new Date().toISOString()
        : (editIsNewDesign ? product.designLaunchedAt : undefined),
      // Discontinued fields
      isDiscontinued: editIsDiscontinued,
      discontinuedAt: firstTimeDiscontinued
        ? new Date().toISOString()
        : (editIsDiscontinued ? product.discontinuedAt : undefined),
    }, businessId);

    setEditImageUrl(preparedMedia.imageUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditing(false);
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const handleDelete = () => {
    setPendingDeleteProduct(true);
  };

  const confirmDeleteProduct = async () => {
    if (isDeletingProduct) return;
    setIsDeletingProduct(true);
    try {
      await deleteProduct(product.id, businessId);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast('success', 'Product moved to Recycle Bin.');
      setPendingDeleteProduct(false);
      router.back();
    } catch (error) {
      console.warn('Product delete failed:', error);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      showToast('error', 'Could not move product to Recycle Bin.');
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleToggleProductActive = async (nextActive: boolean) => {
    if (!product || isStatusSaving) return;
    setIsStatusSaving(true);
    try {
      await updateProduct(product.id, {
        isDiscontinued: !nextActive,
        discontinuedAt: nextActive
          ? undefined
          : (product.discontinuedAt ?? new Date().toISOString()),
      }, businessId);
    } catch (error) {
      console.warn('Product status update failed:', error);
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleOpenAddVariant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Initialize with first variable type if available
    const firstVar = productVariables[0];
    setSelectedVariableId(firstVar?.id || '');
    setNewVariantValue('');
    setNewVariantSku('');
    setNewVariantStock('0');
    setNewVariantPrice('');
    setOverrideVariantStock(!useGlobalStock);
    setOverrideVariantPrice(!useGlobalPrice);
    setShowVariableTypeDropdown(false);
    setShowAddVariant(true);
  };

  const generateBarcode = () => {
    return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  };

  const buildVariantSku = (productName: string, variantValue: string, fallback = 'Variant') => {
    const productPart = productName.trim() || 'Product';
    const valuePart = variantValue.trim() || fallback;
    return `${productPart} - ${valuePart}`;
  };

  // Auto-generate SKU when product name or variant value changes
  const getAutoSku = () => {
    if (!product || !newVariantValue.trim()) return '';
    return buildVariantSku(product.name, newVariantValue);
  };

  const handleAddVariant = async () => {
    const selectedVariable = productVariables.find(v => v.id === selectedVariableId);

    if (!selectedVariable) {
      Alert.alert('Missing Variable Type', 'Please select a variable type (e.g., Color, Size).');
      return;
    }

    if (!newVariantValue.trim()) {
      Alert.alert('Missing Value', 'Please enter a value for the variant.');
      return;
    }

    if (useGlobalPrice && !overrideVariantPrice && effectiveGlobalPrice <= 0) {
      Alert.alert('Missing Price', 'Set a global price first or turn off global pricing.');
      return;
    }
    if (!useGlobalPrice && !newVariantPrice) {
      Alert.alert('Missing Price', 'Please enter a selling price.');
      return;
    }
    if (!useGlobalStock && !newVariantStock) {
      Alert.alert('Missing Stock', 'Please enter a stock value.');
      return;
    }
    if (useGlobalPrice && overrideVariantPrice && !newVariantPrice) {
      Alert.alert('Missing Price', 'Please enter a selling price.');
      return;
    }
    if (useGlobalStock && overrideVariantStock && !newVariantStock) {
      Alert.alert('Missing Stock', 'Please enter a stock value.');
      return;
    }

    const variantId = Math.random().toString(36).substring(2, 15);
    // Use user-entered SKU or auto-generate
    const sku = newVariantSku.trim() || getAutoSku();

    const newVariant: ProductVariant = {
      id: variantId,
      sku,
      barcode: generateBarcode(),
      variableValues: { [selectedVariable.name]: newVariantValue.trim() },
      stock: (useGlobalStock && !overrideVariantStock)
        ? effectiveGlobalStock
        : (parseInt(newVariantStock, 10) || 0),
      sellingPrice: (useGlobalPrice && !overrideVariantPrice)
        ? effectiveGlobalPrice
        : (parseFloat(newVariantPrice) || 0),
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateProduct(product.id, {
      variants: [...product.variants, newVariant],
    }, businessId);
    setShowAddVariant(false);
  };

  const handleOpenEditVariant = (variant: ProductVariant) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const variantName = Object.values(variant.variableValues).join(' / ');
    setEditingVariant(variant);
    setEditVariantSku((variant.sku?.trim() || buildVariantSku(product.name, variantName)).toUpperCase());
    setEditVariantPrice(variant.sellingPrice.toString());
    setEditVariantStock(variant.stock.toString());
    setEditVariantName(variantName.toUpperCase());
    setEditVariantImageUrl(variant.imageUrl);
    setEditOverrideVariantPrice(useGlobalPrice ? variant.sellingPrice !== effectiveGlobalPrice : true);
    setEditOverrideVariantStock(useGlobalStock ? variant.stock !== effectiveGlobalStock : true);
  };

  const handleSaveVariant = async () => {
    if (!editingVariant) return;

    if (useGlobalPrice && editOverrideVariantPrice && !editVariantPrice) {
      Alert.alert('Missing Price', 'Please enter a selling price.');
      return;
    }
    if (useGlobalStock && editOverrideVariantStock && !editVariantStock) {
      Alert.alert('Missing Stock', 'Please enter a stock value.');
      return;
    }

    // Update variant name/value
    const variableKey = Object.keys(editingVariant.variableValues)[0];
    const nextVariantName = (editVariantName.trim() || Object.values(editingVariant.variableValues)[0] || 'Variant').toUpperCase();
    const nextSku = (editVariantSku.trim() || buildVariantSku(product.name, nextVariantName)).toUpperCase();
    const newVariableValues = variableKey
      ? { [variableKey]: nextVariantName }
      : editingVariant.variableValues;

    const nextVariantImageUrl = await uploadProductMediaIfNeeded({
      businessId,
      productId: product.id,
      uri: editVariantImageUrl,
      fileName: `variant-${editingVariant.id}.jpg`,
    });

    const nextVariants = product.variants.map((variant) => (
      variant.id === editingVariant.id
        ? {
          ...variant,
          sku: nextSku,
          sellingPrice: useGlobalPrice
            ? (editOverrideVariantPrice ? (parseFloat(editVariantPrice) || editingVariant.sellingPrice) : effectiveGlobalPrice)
            : (parseFloat(editVariantPrice) || editingVariant.sellingPrice),
          stock: useGlobalStock
            ? (editOverrideVariantStock ? (parseInt(editVariantStock, 10) || editingVariant.stock) : effectiveGlobalStock)
            : (parseInt(editVariantStock, 10) || editingVariant.stock),
          variableValues: newVariableValues,
          imageUrl: nextVariantImageUrl,
        }
        : variant
    ));

    await updateProduct(product.id, { variants: nextVariants }, businessId);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditVariantImageUrl(nextVariantImageUrl);
    setEditingVariant(null);
  };

  const handleDeleteVariant = (variantId: string, variantName: string) => {
    if (product.variants.length <= 1) {
      Alert.alert('Cannot Delete', 'A product must have at least one variant.');
      return;
    }

    // Alert.alert is a no-op on web, so confirm with the browser dialog there.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete "${variantName}"?`)) {
        void updateProduct(product.id, { variants: product.variants.filter((variant) => variant.id !== variantId) }, businessId);
      }
      return;
    }

    Alert.alert(
      'Delete Variant',
      `Are you sure you want to delete "${variantName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void updateProduct(product.id, {
              variants: product.variants.filter((variant) => variant.id !== variantId),
            }, businessId);
          },
        },
      ]
    );
  };

  const handlePickProductImageInline = async () => {
    const uri = await imagePicker.pickImage();
    if (!uri) return;
    const nextImageUrl = await uploadProductMediaIfNeeded({
      businessId,
      productId: product.id,
      uri,
      fileName: 'main.jpg',
    });
    setEditImageUrl(nextImageUrl);
    await updateProduct(product.id, { imageUrl: nextImageUrl }, businessId);
  };

  const handleAddCategoryChip = (category: string) => {
    const next = [...new Set([...(product.categories ?? []), category])];
    void updateProduct(product.id, { categories: next }, businessId);
    setWebCategoryQuery('');
  };

  const handleRemoveCategoryChip = (category: string) => {
    const next = (product.categories ?? []).filter((c) => c !== category);
    void updateProduct(product.id, { categories: next }, businessId);
  };

  const handleCreateCategoryChip = () => {
    const trimmed = webCategoryQuery.trim();
    if (!trimmed) return;
    const existing = globalCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      handleAddCategoryChip(existing);
      return;
    }
    addCategory(trimmed);
    handleAddCategoryChip(trimmed);
  };

  // ── Redesigned layout (Fyll Ops product page) ───────────────────────────────
  // Phones: body text snaps to 14 / 12 / 10px; headings stay larger. Desktop unchanged.
  const mfs = (size: number) => (isWebDesktop ? size : size >= 14 ? 14 : size >= 12 ? 12 : 10);
  const threshold = useGlobalLowStockThreshold ? globalLowStockThreshold : product.lowStockThreshold;
  const draftStockFor = (variantId: string, stock: number) => pendingStock[variantId] ?? stock;
  const draftVariants = product.variants.map((variant) => ({ variant, stock: draftStockFor(variant.id, variant.stock) }));
  const draftTotal = draftVariants.reduce((sum, entry) => sum + Math.max(0, entry.stock), 0);
  const draftValue = draftVariants.reduce((sum, entry) => sum + Math.max(0, entry.stock) * (entry.variant.sellingPrice || 0), 0);
  const changedCount = product.variants.filter((variant) => pendingStock[variant.id] !== undefined && pendingStock[variant.id] !== variant.stock).length;
  const variantStatuses = draftVariants.map((entry) => getVariantStatus({ ...entry.variant, stock: entry.stock }, threshold));
  const outCount = variantStatuses.filter((status) => status === 'out').length;
  const lowCount = variantStatuses.filter((status) => status === 'low').length;
  const inCount = variantStatuses.length - outCount - lowCount;
  const variantCount = product.variants.length;
  const healthText = variantCount > 0 && outCount === variantCount
    ? 'Every variant is sold out'
    : outCount + lowCount > 0
      ? `${[outCount ? `${outCount} out of stock` : '', lowCount ? `${lowCount} low` : ''].filter(Boolean).join(' · ')} of ${variantCount} variants`
      : 'All variants in stock';
  const healthInk = outCount ? palette.danger : lowCount ? palette.warn : palette.tones.verified.ink;
  const variantSummary = outCount + lowCount > 0
    ? `${inCount} in stock · ${lowCount ? `${lowCount} low · ` : ''}${outCount} out`
    : 'All in stock';
  const unitsLabel = `${draftTotal} ${draftTotal === 1 ? 'unit' : 'units'}`;
  const prices = product.variants.map((variant) => variant.sellingPrice || 0).filter((price) => price > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const priceLabel = !prices.length ? 'Set price' : minPrice === maxPrice ? formatNaira(minPrice) : `${formatNaira(minPrice)}–${formatNaira(maxPrice)}`;
  const priceNote = !prices.length ? 'No price on any variant' : minPrice === maxPrice && prices.length === variantCount ? 'Same for all variants' : 'Varies by variant';
  const primaryCategory = product.categories?.[0];
  const headerSub = [primaryCategory, `${variantCount} ${variantCount === 1 ? 'variant' : 'variants'}`, canManageVariants && prices.length ? priceLabel : null].filter(Boolean).join(' · ');
  const variantDisplayName = (variant: ProductVariant) => {
    const values = Object.entries(variant.variableValues ?? {})
      .filter(([key, value]) => key.toLowerCase() !== 'source' && value.toLowerCase() !== 'woocommerce')
      .map(([, value]) => value);
    return values.join(' / ') || product.name || variant.sku || 'Variant';
  };
  const soldByVariant = new Map(soldStats.variantSales.map((entry) => [entry.id, entry.quantity]));
  const bestSeller = soldStats.variantSales[0];
  const maxSold = Math.max(1, ...soldStats.variantSales.map((entry) => entry.quantity));

  // SKU hygiene: duplicate codes, a code naming another variant, mixed prefixes.
  const skuIssues = (() => {
    const flagged = new Set<string>();
    const notes: string[] = [];
    const names = product.variants.map((variant) => ({ id: variant.id, name: variantDisplayName(variant), tokens: variantDisplayName(variant).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2) }));
    const seen = new Map<string, string>();
    product.variants.forEach((variant) => {
      const sku = variant.sku?.trim().toUpperCase();
      if (!sku) return;
      const previous = seen.get(sku);
      if (previous) {
        flagged.add(variant.id);
        flagged.add(previous);
        notes.push(`${variantDisplayName(variant)} shares ${sku} with ${variantDisplayName(product.variants.find((v) => v.id === previous) ?? variant)}`);
      } else {
        seen.set(sku, variant.id);
      }
      const skuTokens = sku.toLowerCase().split(/[^a-z0-9]+/);
      const own = names.find((entry) => entry.id === variant.id);
      const other = names.find((entry) => entry.id !== variant.id && entry.tokens.some((token) => skuTokens.includes(token)) && !own?.tokens.some((token) => skuTokens.includes(token)));
      if (other && own) {
        flagged.add(variant.id);
        notes.push(`${own.name} uses ${sku}`);
      }
    });
    const prefixes = Array.from(new Set(product.variants.map((variant) => variant.sku?.trim().toUpperCase().split('-')[0]).filter((prefix): prefix is string => Boolean(prefix))));
    if (prefixes.length > 1 && variantCount > 1) {
      notes.push(`the codes mix ${prefixes.slice(0, 3).map((prefix) => `${prefix}-`).join(' and ')}`);
    }
    return { flagged, message: notes.length ? `${notes.slice(0, 3).join(', and ').replace(/^./, (c) => c.toUpperCase())}. Matching codes keep labels and audits clean.` : '' };
  })();

  const activityKinds = { sold: 'sale', restock: 'restock', audit_adjustment: 'adj' } as const;
  const activityCounts = {
    all: inventoryActivity.length,
    sale: inventoryActivity.filter((entry) => entry.type === 'sold').length,
    adj: inventoryActivity.filter((entry) => entry.type === 'audit_adjustment').length,
    restock: inventoryActivity.filter((entry) => entry.type === 'restock').length,
  };
  const visibleActivity = inventoryActivity.filter((entry) => activityTab === 'all' || activityKinds[entry.type] === activityTab);
  const formatShortDate = (value: string, withTime: boolean) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return withTime ? `${day}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : day;
  };

  // On web the screen being left gets aria-hidden while the tapped button still
  // has focus, which makes the browser log a warning. Drop focus first.
  const releaseWebFocus = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const goRestock = (variantId?: string) => {
    releaseWebFocus();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/restock', params: variantId ? { productId: product.id, variantId } : { productId: product.id } });
  };
  const goPrintLabels = () => {
    releaseWebFocus();
    router.push({ pathname: '/label-print', params: { productId: product.id, bulk: '1' } });
  };
  const stepDraft = (variantId: string, stock: number, delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingStock((previous) => ({ ...previous, [variantId]: Math.max(0, (previous[variantId] ?? stock) + delta) }));
  };
  const saveDraftStock = async () => {
    if (isSavingStock || changedCount === 0) return;
    setIsSavingStock(true);
    try {
      const latest = useFyllStore.getState().products.find((p) => p.id === product.id) ?? product;
      const nextVariants = latest.variants.map((variant) => (
        pendingStock[variant.id] !== undefined ? { ...variant, stock: Math.max(0, pendingStock[variant.id]) } : variant
      ));
      await updateProduct(product.id, { variants: nextVariants }, businessId);
      setPendingStock({});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('success', changedCount === 1 ? 'Stock updated.' : `${changedCount} stock changes saved.`);
    } catch (error) {
      console.warn('Stock save failed:', error);
      showToast('error', 'Could not save stock changes.');
    } finally {
      setIsSavingStock(false);
    }
  };
  const stepThreshold = (delta: number) => {
    const next = Math.max(0, product.lowStockThreshold + delta);
    if (next === product.lowStockThreshold) return;
    void updateProduct(product.id, { lowStockThreshold: next }, businessId);
  };

  const cardStyle = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const labelStyle = { color: palette.muted, fontSize: mfs(12), fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const thStyle = { color: palette.faint, fontSize: mfs(11.5), fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const h2Style = { color: palette.text, fontSize: 16, fontWeight: '600' as const };
  const ghostButton = (state: PressableStateCallbackType, height = 40) => ({
    height,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: isHovered(state) ? palette.softFill : 'transparent',
    opacity: state.pressed ? 0.75 : 1,
  });
  const limeButton = (state: PressableStateCallbackType, height = 40) => ({
    height,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
    opacity: state.pressed ? 0.85 : 1,
  });

  const renderStepper = (value: number, onDown: () => void, onUp: () => void, opts: { dirty?: boolean; height?: number; ink?: string; minWidth?: number; disabled?: boolean } = {}) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: opts.height ?? 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: opts.dirty ? 'rgba(213,224,87,0.6)' : palette.outline,
        backgroundColor: opts.dirty ? 'rgba(213,224,87,0.06)' : 'transparent',
        opacity: opts.disabled ? 0.5 : 1,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Remove one" disabled={opts.disabled || value <= 0} onPress={onDown} style={(state) => ({ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent', opacity: value <= 0 ? 0.4 : 1 })}>
        <Minus size={14} color={palette.textSoft} strokeWidth={2.2} />
      </Pressable>
      <Text style={{ minWidth: opts.minWidth ?? 30, textAlign: 'center', color: opts.ink ?? palette.text, fontSize: mfs(15), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add one" disabled={opts.disabled} onPress={onUp} style={(state) => ({ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
        <Plus size={14} color={palette.textSoft} strokeWidth={2.2} />
      </Pressable>
    </View>
  );

  const renderActiveToggle = () => {
    const active = !product.isDiscontinued;
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: active }}
        accessibilityLabel="Product active"
        disabled={!canManageStatus || isStatusSaving}
        onPress={() => handleToggleProductActive(!active)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, paddingLeft: 11, paddingRight: 4, borderRadius: 999, borderWidth: 1, borderColor: palette.border, opacity: isStatusSaving ? 0.6 : 1 }}
      >
        <Text style={{ color: active ? palette.tones.verified.ink : palette.faint, fontSize: mfs(12.5), fontWeight: '600' }}>{active ? 'Active' : 'Inactive'}</Text>
        <View style={{ width: 34, height: 20, borderRadius: 999, backgroundColor: active ? palette.tones.verified.dot : palette.outline }}>
          <View style={{ position: 'absolute', top: 2, left: active ? 16 : 2, width: 16, height: 16, borderRadius: 8, backgroundColor: palette.page }} />
        </View>
      </Pressable>
    );
  };

  const renderMenu = (items: { key: string; label: string; danger?: boolean; onPress: () => void }[], close: () => void, top: number) => (
    <>
      <Pressable onPress={close} style={{ position: 'absolute', top: -3000, left: -3000, width: 8000, height: 8000 }} />
      <View style={{ position: 'absolute', top, right: 0, minWidth: 200, paddingVertical: 6, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 }}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => {
              close();
              item.onPress();
            }}
            style={(state) => ({ height: 40, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <Text style={{ color: item.danger ? palette.danger : palette.text, fontSize: mfs(14), fontWeight: '500' }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const productMenuItems = [
    { key: 'edit', label: 'Edit details', onPress: handleOpenEdit },
    ...(!isWebDesktop ? [{ key: 'labels', label: 'Print labels', onPress: goPrintLabels }] : []),
    { key: 'delete', label: 'Move to Recycle Bin', danger: true, onPress: handleDelete },
  ];
  const variantMenuItems = (variant: ProductVariant) => [
    { key: 'restock', label: 'Restock', onPress: () => goRestock(variant.id) },
    { key: 'label', label: 'Print label', onPress: () => router.push({ pathname: '/label-print', params: { productId: product.id, variantId: variant.id } }) },
    ...(canManageVariants ? [
      { key: 'edit', label: 'Edit variant', onPress: () => handleOpenEditVariant(variant) },
      { key: 'delete', label: 'Delete variant', danger: true, onPress: () => handleDeleteVariant(variant.id, variantDisplayName(variant)) },
    ] : []),
  ];

  const renderVariantImage = (variant: ProductVariant, size: number) => {
    const image = variant.imageUrl ?? primaryDisplayImage;
    return (
      <Pressable onPress={() => image && handleOpenGallery(image)} disabled={!image} style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: image ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
        {image ? <ResolvedAttachmentImage imageUrl={image} style={{ width: size, height: size }} resizeMode="cover" /> : <Package size={size * 0.42} color={palette.faint} strokeWidth={1.6} />}
      </Pressable>
    );
  };

  const skuWarning = skuIssues.message ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: isWebDesktop ? 10 : 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: isWebDesktop ? 6 : 4, borderRadius: 12, backgroundColor: palette.warnBg, borderWidth: 1, borderColor: palette.warnBorder }}>
      <AlertTriangle size={15} color={palette.warn} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, color: palette.isDark ? '#E8D3A8' : '#6B4A12', fontSize: isWebDesktop ? 13 : 12.5, lineHeight: 19 }}>
        <Text style={{ color: palette.text, fontWeight: '600' }}>Check SKUs: </Text>
        {skuIssues.message}
      </Text>
    </View>
  ) : null;

  const activityTabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'sale' as const, label: 'Sales' },
    { key: 'adj' as const, label: 'Adjustments' },
    { key: 'restock' as const, label: 'Restocks' },
  ];
  // Web: activity rows are 12px and one weight lighter.
  const isWeb = Platform.OS === 'web';
  const actFs = (size: number) => (isWeb ? 12 : mfs(size));
  const activityCard = (
    <View style={{ ...cardStyle, paddingHorizontal: isWebDesktop ? 20 : 14, paddingTop: 4, paddingBottom: 6 }}>
      <View style={{ flexDirection: isWebDesktop ? 'row' : 'column', alignItems: isWebDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 10, paddingTop: isWebDesktop ? 14 : 12, paddingBottom: isWebDesktop ? 12 : 10 }}>
        <Text style={h2Style}>Activity</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, alignSelf: isWebDesktop ? 'auto' : 'stretch' }} contentContainerStyle={{ gap: 6 }}>
          {activityTabs.map((tab) => {
            const on = activityTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActivityTab(tab.key)}
                style={(state) => ({ height: 32, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: on ? palette.inverseBg : palette.outline, backgroundColor: on ? palette.inverseBg : isHovered(state) ? palette.softFill : 'transparent' })}
              >
                <Text style={{ color: on ? palette.inverseText : palette.textSoft, fontSize: mfs(12.5), fontWeight: '600' }}>{tab.label}</Text>
                <Text style={{ color: on ? palette.inverseText : palette.textSoft, opacity: 0.55, fontSize: mfs(12.5), fontWeight: '600' }}>{activityCounts[tab.key]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {visibleActivity.length === 0 ? (
        <Text style={{ color: palette.faint, fontSize: mfs(13.5), paddingVertical: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>No stock movement yet.</Text>
      ) : (
        <ScrollView style={{ maxHeight: isWebDesktop ? 420 : 380 }} nestedScrollEnabled showsVerticalScrollIndicator>
        {visibleActivity.map((entry) => {
        const isSale = entry.type === 'sold';
        const isAdj = entry.type === 'audit_adjustment';
        const positive = entry.delta >= 0;
        const kind = isSale ? 'Sold' : isAdj ? 'Audit adjustment' : positive ? ('sourceType' in entry && entry.sourceType === 'procurement_receipt' ? 'Received' : 'Restocked') : 'Adjusted';
        const iconBg = isSale ? palette.softFill : isAdj ? palette.warnBg : positive ? palette.tones.verified.bg : palette.dangerBg;
        const iconInk = isSale ? palette.textSoft : isAdj ? palette.warn : positive ? palette.tones.verified.ink : palette.danger;
        const amtInk = isSale ? palette.text : iconInk;
        const amount = `${positive ? '+' : '−'}${Math.abs(entry.delta)}`;
        return (
          <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: iconInk, fontSize: actFs(13), fontWeight: isWeb ? '600' : '700' }}>{isSale ? '−' : isAdj ? '±' : positive ? '+' : '−'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: actFs(14), fontWeight: isWeb ? '400' : '500' }} numberOfLines={1}>
                <Text style={{ color: amtInk, fontWeight: isWeb ? '500' : '600' }}>{amount}</Text> {kind} · {entry.variantName}
              </Text>
              <Text style={{ color: palette.faint, fontSize: actFs(12.5) }} numberOfLines={1}>{entry.subtitle} · by {entry.actor || 'System'}</Text>
            </View>
            <Text style={{ color: palette.faint, fontSize: actFs(12.5) }}>{formatShortDate(entry.at, true)}</Text>
          </View>
        );
      })}
        </ScrollView>
      )}
    </View>
  );

  const categoryChips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {(product.categories ?? []).map((category) => (
        <View key={category} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 12, paddingRight: canManageVariants ? 6 : 12, borderRadius: 999, backgroundColor: palette.softFill }}>
          <Text style={{ color: palette.text, fontSize: mfs(13), fontWeight: '600' }}>{category}</Text>
          {canManageVariants ? (
            <Pressable accessibilityLabel={`Remove ${category}`} hitSlop={6} onPress={() => handleRemoveCategoryChip(category)} style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
              <X size={12} color={palette.faint} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {canManageVariants ? (
        isAddingCategory ? (
          <View style={{ position: 'relative', zIndex: 40 }}>
            <TextInput
              autoFocus
              value={webCategoryQuery}
              onChangeText={setWebCategoryQuery}
              onSubmitEditing={() => {
                handleCreateCategoryChip();
                setIsAddingCategory(false);
              }}
              onBlur={() => setTimeout(() => setIsAddingCategory(false), 180)}
              placeholder="Category"
              placeholderTextColor={palette.faint}
              style={[{ height: 30, minWidth: 130, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, color: palette.text, fontSize: mfs(13) }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            {webCategorySuggestions.length > 0 ? (
              <View style={{ position: 'absolute', top: 36, left: 0, minWidth: 180, paddingVertical: 6, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 16 }}>
                {webCategorySuggestions.map((category) => (
                  <Pressable key={category} onPress={() => { handleAddCategoryChip(category); setIsAddingCategory(false); }} style={(state) => ({ height: 36, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                    <Text style={{ color: palette.text, fontSize: mfs(13.5) }}>{category}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable onPress={() => setIsAddingCategory(true)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, justifyContent: 'center' }}>
            <Text style={{ color: palette.muted, fontSize: mfs(13) }}>+ Add</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );

  const thresholdControl = useGlobalLowStockThreshold ? (
    <Text style={{ color: palette.faint, fontSize: mfs(13) }}>{globalLowStockThreshold} or fewer per variant · store-wide setting</Text>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {renderStepper(product.lowStockThreshold, () => stepThreshold(-1), () => stepThreshold(1), { height: isWebDesktop ? 34 : 32, minWidth: 24, disabled: !canManageVariants })}
      {isWebDesktop ? <Text style={{ color: palette.faint, fontSize: mfs(13) }}>or fewer per variant</Text> : null}
    </View>
  );

  const saveBar = changedCount > 0 ? (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: isWebDesktop ? 32 : 28, alignItems: 'center' }}>
      <View accessibilityRole="toolbar" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 8, paddingLeft: 18, borderRadius: 999, backgroundColor: palette.inverseBg, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 24 }}>
        <Text style={{ color: palette.inverseText, fontSize: mfs(14), fontWeight: '600', paddingRight: 6 }}>
          {changedCount} unsaved stock {changedCount === 1 ? 'change' : 'changes'}
        </Text>
        <Pressable onPress={() => setPendingStock({})} disabled={isSavingStock} style={(state) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.isDark ? 'rgba(20,20,20,0.18)' : 'rgba(255,255,255,0.22)', justifyContent: 'center', opacity: state.pressed ? 0.7 : 1 })}>
          <Text style={{ color: palette.inverseText, fontSize: mfs(13.5), fontWeight: '600' }}>Discard</Text>
        </Pressable>
        <Pressable onPress={() => { void saveDraftStock(); }} disabled={isSavingStock} style={(state) => ({ height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: palette.inverseText, justifyContent: 'center', opacity: isSavingStock ? 0.6 : state.pressed ? 0.8 : 1 })}>
          <Text style={{ color: palette.inverseBg, fontSize: mfs(13.5), fontWeight: '600' }}>{isSavingStock ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const toastView = toast ? (
    <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: changedCount > 0 ? 100 : 24, alignItems: 'center' }}>
      <View style={{ backgroundColor: toast.type === 'success' ? '#111111' : '#7F1D1D', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: mfs(13), fontWeight: '600' }}>{toast.message}</Text>
      </View>
    </View>
  ) : null;

  const desktopLayout = (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.page }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ width: '100%', maxWidth: webMaxWidth, alignSelf: 'flex-start', paddingHorizontal: 28, paddingTop: 32, paddingBottom: changedCount > 0 ? 120 : 60, gap: 20 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 50 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/inventory' as never))} palette={palette} label="Back to inventory" />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: palette.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6, flexShrink: 1 }} numberOfLines={1}>{product.name}</Text>
            {renderActiveToggle()}
          </View>
          <Text style={{ color: palette.faint, fontSize: 14 }} numberOfLines={1}>{headerSub}</Text>
        </View>
        <Pressable onPress={goPrintLabels} style={(state) => ghostButton(state)}>
          <Printer size={15} color={palette.text} strokeWidth={2} />
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Print labels</Text>
        </Pressable>
        <Pressable onPress={() => goRestock()} style={(state) => limeButton(state)}>
          <Package size={15} color={FYLL_LIME_INK} strokeWidth={2.2} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Restock</Text>
        </Pressable>
        <View style={{ position: 'relative', zIndex: 60 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setShowMobileHeaderMenu((previous) => !previous)} style={(state) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
            <MoreHorizontal size={17} color={palette.faint} strokeWidth={2.4} />
          </Pressable>
          {showMobileHeaderMenu ? renderMenu(productMenuItems, () => setShowMobileHeaderMenu(false), 46) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
          <View style={{ ...cardStyle, padding: 20, flexDirection: isCompactWeb ? 'column' : 'row', gap: 22, zIndex: 20 }}>
            <View style={{ width: 220, gap: 8 }}>
              <Pressable onPress={() => (primaryDisplayImage ? handleOpenGallery(primaryDisplayImage) : canManageVariants ? void handlePickProductImageInline() : undefined)} style={{ width: 220, height: 170, borderRadius: 14, overflow: 'hidden', backgroundColor: primaryDisplayImage ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                {primaryDisplayImage ? (
                  <ResolvedAttachmentImage imageUrl={primaryDisplayImage} style={{ width: 220, height: 170 }} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Camera size={22} color={palette.faint} strokeWidth={1.8} />
                    <Text style={{ color: palette.faint, fontSize: 12.5 }}>Add a photo</Text>
                  </View>
                )}
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {galleryImages.filter((url) => url !== primaryDisplayImage).slice(0, 3).map((url) => (
                  <Pressable key={url} onPress={() => handleOpenGallery(url)} style={{ width: 50.5, height: 50.5, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F4F4EF', opacity: 0.85 }}>
                    <ResolvedAttachmentImage imageUrl={url} style={{ width: 50.5, height: 50.5 }} resizeMode="cover" />
                  </Pressable>
                ))}
                {canManageVariants ? (
                  <Pressable accessibilityLabel="Add image" onPress={() => { void handlePickProductImageInline(); }} style={(state) => ({ width: 50.5, height: 50.5, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                    <Plus size={16} color={palette.faint} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, columnGap: 24, alignContent: 'flex-start' }}>
              {canManageVariants ? (
                <View style={{ width: '45%', flexGrow: 1, gap: 5 }}>
                  <Text style={labelStyle}>Price</Text>
                  <MoneyText style={{ color: prices.length ? palette.text : palette.warn, fontSize: 22 }} numberOfLines={1}>{priceLabel}</MoneyText>
                  <Text style={{ color: palette.faint, fontSize: 12.5 }}>{priceNote}</Text>
                </View>
              ) : null}
              <View style={{ width: '45%', flexGrow: 1, gap: 5 }}>
                <Text style={labelStyle}>{isOwner ? 'Stock value' : 'In stock'}</Text>
                <MoneyText style={{ color: palette.text, fontSize: 22 }} numberOfLines={1}>{isOwner ? formatNaira(draftValue) : unitsLabel}</MoneyText>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>{isOwner ? `${unitsLabel} at retail price` : healthText}</Text>
              </View>
              <View style={{ width: '45%', flexGrow: 1, gap: 8, zIndex: 30 }}>
                <Text style={labelStyle}>Category</Text>
                {categoryChips}
              </View>
              <View style={{ width: '45%', flexGrow: 1, gap: 8 }}>
                <Text style={labelStyle}>Low stock alert</Text>
                {thresholdControl}
              </View>
              {product.description?.trim() ? (
                <View style={{ width: '100%', gap: 5 }}>
                  <Text style={labelStyle}>Description</Text>
                  <Text style={{ color: palette.textSoft, fontSize: 14, lineHeight: 20 }}>{product.description.trim()}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ ...cardStyle, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, zIndex: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={h2Style}>Variants</Text>
                <Text style={{ color: palette.faint, fontSize: 13 }}>{variantSummary}</Text>
              </View>
              {canManageVariants ? (
                <Pressable onPress={handleOpenAddVariant} style={(state) => ghostButton(state, 36)}>
                  <Plus size={14} color={palette.text} strokeWidth={2.4} />
                  <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>Add variant</Text>
                </Pressable>
              ) : null}
            </View>
            {skuWarning}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 10, paddingBottom: 8 }}>
              <Text style={[thStyle, { flex: 1.4 }]}>Variant</Text>
              <Text style={[thStyle, { width: 130 }]}>SKU</Text>
              <Text style={[thStyle, { width: 90, textAlign: 'right' }]}>Sold</Text>
              <Text style={[thStyle, { width: 128, textAlign: 'center' }]}>In stock</Text>
              <Text style={[thStyle, { width: 130 }]}>Status</Text>
              <View style={{ width: 32 }} />
            </View>
            {draftVariants.map(({ variant, stock }, index) => {
              const dirty = pendingStock[variant.id] !== undefined && pendingStock[variant.id] !== variant.stock;
              const flagged = skuIssues.flagged.has(variant.id);
              return (
                <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 64, borderTopWidth: 1, borderTopColor: palette.hairline, zIndex: openVariantMenuId === variant.id ? 30 : 1 }}>
                  <View style={{ flex: 1.4, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {renderVariantImage(variant, 44)}
                    <Text style={{ flex: 1, color: palette.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{variantDisplayName(variant)}</Text>
                  </View>
                  <View style={{ width: 130, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: flagged ? palette.warn : palette.muted, fontSize: 13, letterSpacing: 0.2, flexShrink: 1 }} numberOfLines={1}>{variant.sku?.toUpperCase() || '—'}</Text>
                    {flagged ? <AlertTriangle size={15} color={palette.warn} strokeWidth={2.2} /> : null}
                  </View>
                  <Text style={{ width: 90, textAlign: 'right', color: palette.muted, fontSize: 14, fontVariant: ['tabular-nums'] }}>{soldByVariant.get(variant.id) ?? 0}</Text>
                  <View style={{ width: 128, alignItems: 'center' }}>
                    {renderStepper(stock, () => stepDraft(variant.id, variant.stock, -1), () => stepDraft(variant.id, variant.stock, 1), { dirty, ink: stock <= 0 ? palette.danger : palette.text })}
                  </View>
                  <View style={{ width: 130 }}>
                    <StockStatusLabel status={variantStatuses[index]} palette={palette} />
                  </View>
                  <View style={{ width: 32, position: 'relative' }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Variant actions" onPress={() => setOpenVariantMenuId((previous) => (previous === variant.id ? null : variant.id))} style={(state) => ({ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                      <MoreHorizontal size={17} color={palette.faint} strokeWidth={2.4} />
                    </Pressable>
                    {openVariantMenuId === variant.id ? renderMenu(variantMenuItems(variant), () => setOpenVariantMenuId(null), 38) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {activityCard}
        </View>

        <View style={{ width: rightColumnWidth ?? 400, gap: 16 }}>
          <View style={{ ...cardStyle, padding: 20, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>In stock</Text>
              <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -0.8 }}>{unitsLabel}</MoneyText>
              <Text style={{ color: healthInk, fontSize: 13, fontWeight: '600' }}>{healthText}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={labelStyle}>Sold</Text>
              <Text style={{ color: palette.faint, fontSize: 13 }}>{soldStats.totalSold} all time</Text>
            </View>
            {soldStats.variantSales.map((entry, index) => (
              <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 72, color: palette.textSoft, fontSize: 13.5 }} numberOfLines={1}>{entry.name}</Text>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: palette.softFill, overflow: 'hidden' }}>
                  <View style={{ width: `${(entry.quantity / maxSold) * 100}%`, height: 6, borderRadius: 3, backgroundColor: index === 0 && entry.quantity > 0 ? palette.text : palette.isDark ? '#6B6C63' : '#BDBDB4' }} />
                </View>
                <Text style={{ width: 28, textAlign: 'right', color: palette.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{entry.quantity}</Text>
              </View>
            ))}
            <Text style={{ color: palette.faint, fontSize: 12.5, lineHeight: 19 }}>
              {bestSeller && bestSeller.quantity > 0 && soldStats.totalSold > 0
                ? `${bestSeller.name} is your best seller: ${Math.round((bestSeller.quantity / soldStats.totalSold) * 100)}% of all ${product.name} sales.`
                : 'No sales yet.'}
            </Text>
          </View>

          <View style={{ ...cardStyle, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={h2Style}>Restocks</Text>
              {recentRestocks[0] ? <Text style={{ color: palette.faint, fontSize: 13 }}>Last: {formatShortDate(recentRestocks[0].timestamp, false)}</Text> : null}
            </View>
            {recentRestocks.length === 0 ? (
              <Text style={{ color: palette.faint, fontSize: 13.5 }}>No restocks yet.</Text>
            ) : recentRestocks.map((log) => {
              const variant = product.variants.find((v) => v.id === log.variantId);
              const positive = log.quantityAdded >= 0;
              return (
                <View key={log.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ color: palette.text, fontSize: 13.5 }} numberOfLines={1}>
                      <Text style={{ color: positive ? palette.tones.verified.ink : palette.danger, fontWeight: '600' }}>{positive ? '+' : '−'}{Math.abs(log.quantityAdded)}</Text> {variant ? variantDisplayName(variant) : 'Unknown variant'}
                    </Text>
                    <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{log.note?.trim() ? `${log.note.trim()} · ` : ''}{log.previousStock} → {log.newStock}</Text>
                  </View>
                  <Text style={{ color: palette.faint, fontSize: 12.5 }}>{formatShortDate(log.timestamp, false)}</Text>
                </View>
              );
            })}
            <Pressable onPress={() => goRestock()} style={(state) => ({ ...ghostButton(state), marginTop: 4 })}>
              <Package size={15} color={palette.text} strokeWidth={2.2} />
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Restock variants</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const mobileLayout = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: palette.page, zIndex: 50 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/inventory' as never))} palette={palette} label="Back" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{product.name}</Text>
          <Text style={{ color: palette.faint, fontSize: mfs(12.5) }} numberOfLines={1}>{[primaryCategory, `${variantCount} ${variantCount === 1 ? 'variant' : 'variants'}`].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ position: 'relative', zIndex: 60 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setShowMobileHeaderMenu((previous) => !previous)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={18} color={palette.text} strokeWidth={2.4} />
          </Pressable>
          {showMobileHeaderMenu ? renderMenu(productMenuItems, () => setShowMobileHeaderMenu(false), 48) : null}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.page }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: changedCount > 0 ? 130 : 60, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (primaryDisplayImage ? handleOpenGallery(primaryDisplayImage) : canManageVariants ? void handlePickProductImageInline() : undefined)} style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: primaryDisplayImage ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
            {primaryDisplayImage ? <ResolvedAttachmentImage imageUrl={primaryDisplayImage} style={{ width: 96, height: 96 }} resizeMode="cover" /> : <Camera size={22} color={palette.faint} strokeWidth={1.8} />}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <MoneyText style={{ color: palette.text, fontSize: 30, letterSpacing: -0.6 }} numberOfLines={1}>{unitsLabel}</MoneyText>
            <Text style={{ color: healthInk, fontSize: mfs(13), fontWeight: '600' }}>{healthText}</Text>
            <Text style={{ color: palette.faint, fontSize: mfs(13) }} numberOfLines={1}>
              {[canManageVariants ? priceLabel : null, isOwner ? `${formatNaira(draftValue)} in stock` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={goPrintLabels} style={(state) => ({ ...ghostButton(state, 44), flex: 1 })}>
            <Printer size={15} color={palette.text} strokeWidth={2} />
            <Text style={{ color: palette.text, fontSize: mfs(14), fontWeight: '600' }}>Labels</Text>
          </Pressable>
          <Pressable onPress={() => goRestock()} style={(state) => ({ ...limeButton(state, 44), flex: 1 })}>
            <Package size={15} color={FYLL_LIME_INK} strokeWidth={2.2} />
            <Text style={{ color: FYLL_LIME_INK, fontSize: mfs(14), fontWeight: '600' }}>Restock</Text>
          </Pressable>
        </View>

        <View style={{ ...cardStyle, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 10 }}>
            <Text style={h2Style}>Variants</Text>
            <Text style={{ color: palette.faint, fontSize: mfs(13) }}>{variantSummary}</Text>
          </View>
          {skuWarning}
          {draftVariants.map(({ variant, stock }, index) => {
            const dirty = pendingStock[variant.id] !== undefined && pendingStock[variant.id] !== variant.stock;
            const flagged = skuIssues.flagged.has(variant.id);
            return (
              <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                {renderVariantImage(variant, 44)}
                <Pressable onPress={() => setMobileVariantActions(variant)} style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: mfs(12), fontWeight: '500' }} numberOfLines={1}>{variantDisplayName(variant)}</Text>
                  <Text style={{ color: flagged ? palette.warn : palette.muted, fontSize: mfs(12) }} numberOfLines={1}>{variant.sku?.toUpperCase() || '—'} · {soldByVariant.get(variant.id) ?? 0} sold</Text>
                  <StockStatusLabel status={variantStatuses[index]} palette={palette} size={12} />
                </Pressable>
                {renderStepper(stock, () => stepDraft(variant.id, variant.stock, -1), () => stepDraft(variant.id, variant.stock, 1), { dirty, height: 38, minWidth: 26, ink: stock <= 0 ? palette.danger : palette.text })}
              </View>
            );
          })}
          {canManageVariants ? (
            <Pressable onPress={handleOpenAddVariant} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Plus size={14} color={palette.textSoft} strokeWidth={2.4} />
              <Text style={{ color: palette.textSoft, fontSize: mfs(14), fontWeight: '600' }}>Add variant</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ ...cardStyle, paddingHorizontal: 14, paddingVertical: 16, gap: 12, zIndex: 20 }}>
          <Text style={h2Style}>Settings</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: palette.text, fontSize: mfs(14) }}>Status</Text>
            {renderActiveToggle()}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: palette.text, fontSize: mfs(14) }}>Low stock alert</Text>
            {useGlobalLowStockThreshold ? (
              <Text style={{ color: palette.faint, fontSize: mfs(13) }}>{globalLowStockThreshold} · store-wide</Text>
            ) : thresholdControl}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, zIndex: 30 }}>
            <Text style={{ color: palette.text, fontSize: mfs(14), paddingTop: 6 }}>Category</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>{categoryChips}</View>
          </View>
        </View>

        {activityCard}
      </ScrollView>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {isWebDesktop ? desktopLayout : mobileLayout}
        {saveBar}

        <Modal visible={mobileVariantActions !== null} animationType="fade" transparent onRequestClose={() => setMobileVariantActions(null)}>
          <Pressable onPress={() => setMobileVariantActions(null)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', padding: 12 }}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ borderRadius: 22, backgroundColor: palette.card, paddingVertical: 8, overflow: 'hidden' }}>
              {mobileVariantActions ? (
                <>
                  <Text style={{ color: palette.faint, fontSize: 13, fontWeight: '600', paddingHorizontal: 18, paddingVertical: 10 }}>{variantDisplayName(mobileVariantActions)}</Text>
                  {variantMenuItems(mobileVariantActions).map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        setMobileVariantActions(null);
                        item.onPress();
                      }}
                      style={(state) => ({ height: 50, paddingHorizontal: 18, justifyContent: 'center', borderTopWidth: 1, borderTopColor: palette.hairline, opacity: state.pressed ? 0.6 : 1 })}
                    >
                      <Text style={{ color: item.danger ? palette.danger : palette.text, fontSize: 15, fontWeight: '500' }}>{item.label}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Edit Product Modal - Centered */}
        <Modal
          visible={isEditing}
          animationType="fade"
          transparent
          onRequestClose={() => setIsEditing(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <View
              className={cn('flex-1', useFullscreenEditModal ? 'items-stretch justify-start' : 'items-center justify-center')}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            >
              <Pressable
                className="absolute inset-0"
                onPress={() => setIsEditing(false)}
              />
              <View
                className={cn('overflow-hidden', useFullscreenEditModal ? 'flex-1 w-full self-stretch' : 'w-[92%] rounded-2xl')}
                style={{
                  backgroundColor: colors.bg.card,
                  height: useFullscreenEditModal ? '100%' : undefined,
                  maxHeight: useFullscreenEditModal ? undefined : '90%',
                  maxWidth: useFullscreenEditModal ? undefined : 720,
                  borderRadius: useFullscreenEditModal ? 0 : 16,
                }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Edit Product</Text>
                  <Pressable
                    onPress={() => setIsEditing(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView
                  className="px-5 py-4"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                  overScrollMode="always"
                >
                  {/* Error Toast */}
                  {imagePicker.error && (
                    <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)' }}>
                      <Text className="text-red-500 text-sm text-center">{imagePicker.error}</Text>
                    </View>
                  )}

                  <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                    <View className="mb-4">
                      <Text style={{ color: colors.text.primary }} className={modalSectionTitleClass}>Core Details</Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                        Update the shared product information here.
                      </Text>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Product Image</Text>
                      {editImageUrl ? (
                        <View className="flex-row items-start">
                          <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                            <ResolvedAttachmentImage
                              imageUrl={editImageUrl}
                              style={{ width: 72, height: 72 }}
                              resizeMode="cover"
                            />
                          </View>
                          <View className="ml-3 flex-1">
                            <Pressable
                              onPress={handlePickImage}
                              disabled={imagePicker.isLoading}
                              className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                              style={{ backgroundColor: colors.bg.secondary, opacity: imagePicker.isLoading ? 0.5 : 1 }}
                            >
                              <Camera size={14} color={colors.text.primary} strokeWidth={2} />
                              <Text style={{ color: colors.text.primary }} className="text-xs font-medium ml-2">Change</Text>
                            </Pressable>
                            <Pressable
                              onPress={handleRemoveImage}
                              className="flex-row items-center px-3 py-2 rounded-lg active:opacity-70"
                              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)' }}
                            >
                              <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                              <Text className="text-red-500 text-xs font-medium ml-2">Remove</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <Pressable
                          onPress={handlePickImage}
                          disabled={imagePicker.isLoading}
                          className="rounded-xl p-4 items-center active:opacity-70"
                          style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, borderStyle: 'dashed', opacity: imagePicker.isLoading ? 0.5 : 1 }}
                        >
                          {imagePicker.isLoading ? (
                            <>
                              <View className="w-6 h-6 items-center justify-center">
                                <Text style={{ color: colors.text.muted }} className="text-xs">...</Text>
                              </View>
                              <Text style={{ color: colors.text.muted }} className="text-sm font-medium mt-2">Opening...</Text>
                            </>
                          ) : (
                            <>
                              <ImageIcon size={24} color={colors.text.muted} strokeWidth={1.5} />
                              <Text style={{ color: colors.text.muted }} className="text-sm font-medium mt-2">Add Image</Text>
                            </>
                          )}
                        </Pressable>
                      )}
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Product Name</Text>
                      <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                        <TextInput
                          placeholder="Product Name"
                          placeholderTextColor={colors.input.placeholder}
                          value={editName}
                          onChangeText={setEditName}
                          style={{ color: colors.input.text, fontSize: 14 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="mb-4" style={{ zIndex: 40 }}>
                      <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Categories</Text>
                      {editCategories.length > 0 && (
                        <View className="flex-row flex-wrap gap-2 mb-3">
                          {editCategories.map((cat) => (
                            <View key={cat} className="flex-row items-center px-3 py-1.5 rounded-xl" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                              <Text style={{ color: colors.text.primary }} className="text-xs font-medium mr-2">{cat}</Text>
                              <Pressable onPress={() => handleRemoveCategory(cat)}>
                                <X size={14} color={colors.text.muted} strokeWidth={2} />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={{ zIndex: 10 }}>
                        <View style={{ zIndex: 20, position: 'relative' }}>
                          <Pressable
                            onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                            className="rounded-xl px-4 flex-row items-center"
                            style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}
                          >
                            <TextInput
                              placeholder="Search or add category"
                              placeholderTextColor={colors.input.placeholder}
                              value={newCategory}
                              onChangeText={(text) => {
                                setNewCategory(text);
                                setShowCategoryDropdown(true);
                              }}
                              onFocus={() => setShowCategoryDropdown(true)}
                              onSubmitEditing={handleAddCategory}
                              style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                              selectionColor={colors.text.primary}
                            />
                            <SearchClearButton
                              visible={Boolean(newCategory.trim())}
                              onPress={() => {
                                setNewCategory('');
                                setShowCategoryDropdown(true);
                              }}
                            />
                            <ChevronDown size={18} color={colors.text.muted} strokeWidth={2} />
                          </Pressable>
                          {showCategoryDropdown && (
                            <View className="rounded-xl mt-2 overflow-hidden absolute left-0 right-0 top-14" style={{ backgroundColor: modalDropdownBg, borderWidth: 1, borderColor: colors.border.light, maxHeight: 200 }}>
                              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {globalCategories
                                  .filter(cat =>
                                    !editCategories.includes(cat) &&
                                    cat.toLowerCase().includes(newCategory.toLowerCase())
                                  )
                                  .map((cat) => (
                                    <Pressable
                                      key={cat}
                                      onPress={() => handleSelectCategory(cat)}
                                      className="px-4 py-3 active:opacity-70"
                                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                                    >
                                      <Text style={{ color: colors.text.secondary }} className="text-sm">{cat}</Text>
                                    </Pressable>
                                  ))}
                                {newCategory.trim() && !globalCategories.includes(newCategory.trim()) && (
                                  <Pressable
                                    onPress={handleAddCategory}
                                    className="px-4 py-3 flex-row items-center active:opacity-70"
                                    style={{ backgroundColor: colors.bg.secondary }}
                                  >
                                    <Plus size={16} color="#10B981" strokeWidth={2} />
                                    <Text className="text-emerald-500 text-sm ml-2">Add "{newCategory.trim()}"</Text>
                                  </Pressable>
                                )}
                                {globalCategories.filter(cat => !editCategories.includes(cat) && cat.toLowerCase().includes(newCategory.toLowerCase())).length === 0 && !newCategory.trim() && (
                                  <View className="px-4 py-3">
                                    <Text style={{ color: colors.text.muted }} className="text-sm">No categories available. Type to add new.</Text>
                                  </View>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Description</Text>
                      <View className="rounded-xl px-4 py-3" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, minHeight: 80 }}>
                        <TextInput
                          placeholder="Description"
                          placeholderTextColor={colors.input.placeholder}
                          value={editDescription}
                          onChangeText={setEditDescription}
                          multiline
                          numberOfLines={3}
                          style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Low Stock Alert Threshold</Text>
                      <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                        <TextInput
                          placeholder="5"
                          placeholderTextColor={colors.input.placeholder}
                          value={editThreshold}
                          onChangeText={setEditThreshold}
                          keyboardType="number-pad"
                          style={{ color: colors.input.text, fontSize: 14 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="border-t pt-4 mb-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                      <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-1">
                          <Text style={{ color: colors.text.primary }} className={modalSectionTitleClass}>Global Stock</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Update all variant stock at once.</Text>
                        </View>
                        <Switch
                          value={useGlobalStock}
                          onValueChange={setUseGlobalStock}
                          trackColor={{ false: '#767577', true: '#D1D5DB' }}
                          thumbColor={useGlobalStock ? '#374151' : '#FFFFFF'}
                        />
                      </View>
                      {useGlobalStock ? (
                        <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}>
                          <Text style={{ color: colors.text.muted, fontSize: 14, marginRight: 8 }}>#</Text>
                          <TextInput
                            placeholder="0"
                            placeholderTextColor={colors.input.placeholder}
                            value={globalStock}
                            onChangeText={setGlobalStock}
                            keyboardType="number-pad"
                            style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                            selectionColor={colors.text.primary}
                          />
                        </View>
                      ) : (
                        <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.bg.secondary }}>
                          <Text style={{ color: colors.text.muted }} className="text-xs">
                            Edit individual variant stock from the variant list below.
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="border-t pt-4 mb-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                      <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-1">
                          <Text style={{ color: colors.text.primary }} className={modalSectionTitleClass}>Global Pricing</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Update all variant prices at once.</Text>
                        </View>
                        <Switch
                          value={useGlobalPrice}
                          onValueChange={setUseGlobalPrice}
                          trackColor={{ false: '#767577', true: '#D1D5DB' }}
                          thumbColor={useGlobalPrice ? '#374151' : '#FFFFFF'}
                        />
                      </View>
                      {useGlobalPrice ? (
                        <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}>
                          <Text style={{ color: colors.text.muted, fontSize: 14, marginRight: 8 }}>₦</Text>
                          <TextInput
                            placeholder="Enter price for all variants"
                            placeholderTextColor={colors.input.placeholder}
                            value={globalPrice}
                            onChangeText={setGlobalPrice}
                            keyboardType="numeric"
                            style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                            selectionColor={colors.text.primary}
                          />
                        </View>
                      ) : (
                        <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.bg.secondary }}>
                          <Text style={{ color: colors.text.muted }} className="text-xs">
                            Edit individual variant prices from the variant list below.
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="border-t pt-4 mb-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <Text style={{ color: colors.text.primary }} className={modalSectionTitleClass}>Mark as New Design</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Track this for yearly reviews.</Text>
                        </View>
                        <Switch
                          value={editIsNewDesign}
                          onValueChange={setEditIsNewDesign}
                          trackColor={{ false: '#767577', true: '#D1D5DB' }}
                          thumbColor={editIsNewDesign ? '#374151' : '#FFFFFF'}
                        />
                      </View>
                      {editIsNewDesign && (
                        <View className="mt-3">
                          <Text style={{ color: colors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-1.5')}>Design Year</Text>
                          <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 48, justifyContent: 'center' }}>
                            <TextInput
                              placeholder={new Date().getFullYear().toString()}
                              placeholderTextColor={colors.input.placeholder}
                              value={editDesignYear}
                              onChangeText={setEditDesignYear}
                              keyboardType="number-pad"
                              maxLength={4}
                              style={{ color: colors.input.text, fontSize: 14 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>
                      )}
                    </View>

                    <View className="border-t pt-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                          <Text style={{ color: colors.text.primary }} className={modalSectionTitleClass}>Mark as Inactive</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Hide from new order product picker.</Text>
                        </View>
                        <Switch
                          value={editIsDiscontinued}
                          onValueChange={setEditIsDiscontinued}
                          trackColor={{ false: '#767577', true: '#9CA3AF' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                      {editIsDiscontinued && (
                        <View className="mt-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(248, 113, 113, 0.12)' }}>
                          <Text className="text-red-500 text-xs">
                            This product will not appear in the picker for new orders. Existing orders are not affected.
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Save Button */}
                  <Pressable
                    onPress={handleSaveEdit}
                    className="rounded-full items-center active:opacity-80 mb-3"
                    style={{ height: 52, justifyContent: 'center', backgroundColor: colors.text.primary }}
                  >
                    <Text style={{ color: colors.bg.primary }} className="font-semibold text-base">Save Changes</Text>
                  </Pressable>

                  {/* Cancel Button */}
                  <Pressable
                    onPress={() => setIsEditing(false)}
                    className="rounded-full items-center active:opacity-80 mb-4"
                    style={{ height: 52, justifyContent: 'center', backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.tertiary }} className="font-semibold text-base">Cancel</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Add Variant Modal - Centered - Dynamic theme */}
        <Modal
          visible={showAddVariant}
          animationType="fade"
          transparent
          onRequestClose={() => setShowAddVariant(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <View
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            >
              <Pressable
                className="absolute inset-0"
                onPress={() => setShowAddVariant(false)}
              />
              <View
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: themeColors.bg.card, maxHeight: '85%', maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: themeColors.border.light }}>
                  <Text style={{ color: themeColors.text.primary }} className="font-bold text-lg">Add New Variant</Text>
                  <Pressable
                    onPress={() => setShowAddVariant(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: themeColors.bg.secondary }}
                  >
                    <X size={18} color={themeColors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView
                  className="px-5 py-4"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                  overScrollMode="always"
                >
                  {/* Variable Type Selector */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Variable Type</Text>
                    <Pressable
                      onPress={() => setShowVariableTypeDropdown(!showVariableTypeDropdown)}
                      className="rounded-xl px-4 flex-row items-center justify-between"
                      style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}
                    >
                      <Text style={{ color: selectedVariableId ? themeColors.text.primary : themeColors.text.muted }}>
                        {productVariables.find(v => v.id === selectedVariableId)?.name || 'Select Variable Type'}
                      </Text>
                      <ChevronDown size={18} color={themeColors.text.muted} strokeWidth={2} />
                    </Pressable>
                    {showVariableTypeDropdown && (
                      <View className="rounded-xl mt-2 overflow-hidden" style={{ backgroundColor: modalDropdownBg, borderWidth: 1, borderColor: themeColors.border.light }}>
                        {productVariables.map((variable) => (
                          <Pressable
                            key={variable.id}
                            onPress={() => {
                              setSelectedVariableId(variable.id);
                              setShowVariableTypeDropdown(false);
                            }}
                            className="px-4 py-3 border-b active:opacity-70"
                            style={{ borderBottomColor: themeColors.border.light }}
                          >
                            <Text style={{ color: selectedVariableId === variable.id ? themeColors.text.primary : themeColors.text.tertiary }} className={cn(
                              'text-sm',
                              selectedVariableId === variable.id && 'font-semibold'
                            )}>
                              {variable.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {productVariables.length === 0 && (
                      <Text className="text-orange-400 text-xs mt-2">No variable types defined. Go to Settings to add them.</Text>
                    )}
                  </View>

                  {/* Variant Value - Editable Text Input */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Value</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder={selectedVariableId ? `Enter ${productVariables.find(v => v.id === selectedVariableId)?.name || 'value'} (e.g., Pink, Large)` : 'Select a variable type first'}
                        placeholderTextColor={themeColors.input.placeholder}
                        value={newVariantValue}
                        onChangeText={setNewVariantValue}
                        editable={!!selectedVariableId}
                        style={{ color: themeColors.input.text, fontSize: 14 }}
                        selectionColor={themeColors.text.primary}
                      />
                    </View>
                  </View>

                  {/* SKU - Auto-generated but editable */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>SKU</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder={getAutoSku() || 'Auto-generated from Product-Value'}
                        placeholderTextColor={themeColors.text.muted}
                        value={newVariantSku}
                        onChangeText={setNewVariantSku}
                        autoCapitalize="characters"
                        style={{ color: themeColors.input.text, fontSize: 14 }}
                        selectionColor={themeColors.text.primary}
                      />
                    </View>
                    <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">
                      {newVariantSku ? 'Custom SKU' : `Will be: ${getAutoSku() || '[PRODUCT]-[VALUE]'}`}
                    </Text>
                  </View>

                  {/* Stock */}
                  {useGlobalStock ? (
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text style={{ color: themeColors.text.primary }} className="text-sm font-semibold">Custom Stock</Text>
                        <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">Use a different stock for this variant.</Text>
                        {!overrideVariantStock ? (
                          <Text style={{ color: themeColors.text.muted }} className="text-xs mt-2">
                            Stock uses the global value ({effectiveGlobalStock} units).
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={overrideVariantStock}
                        onValueChange={setOverrideVariantStock}
                        trackColor={{ false: '#767577', true: '#D1D5DB' }}
                        thumbColor={overrideVariantStock ? '#374151' : '#FFFFFF'}
                      />
                    </View>
                  ) : null}
                  {(!useGlobalStock || overrideVariantStock) ? (
                    <View className="mb-4">
                      <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Initial Stock</Text>
                      <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={themeColors.input.placeholder}
                          value={newVariantStock}
                          onChangeText={setNewVariantStock}
                          keyboardType="number-pad"
                          style={{ color: themeColors.input.text, fontSize: 14 }}
                          selectionColor={themeColors.text.primary}
                        />
                      </View>
                    </View>
                  ) : null}

                  {/* Sale Price */}
                  {useGlobalPrice ? (
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text style={{ color: themeColors.text.primary }} className="text-sm font-semibold">Custom Price</Text>
                        <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">Use a different price for this variant.</Text>
                        {!overrideVariantPrice ? (
                          <Text style={{ color: themeColors.text.muted }} className="text-xs mt-2">
                            Price uses the global value ({effectiveGlobalPrice}).
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={overrideVariantPrice}
                        onValueChange={setOverrideVariantPrice}
                        trackColor={{ false: '#767577', true: '#D1D5DB' }}
                        thumbColor={overrideVariantPrice ? '#374151' : '#FFFFFF'}
                      />
                    </View>
                  ) : null}
                  {(!useGlobalPrice || overrideVariantPrice) ? (
                    <View className="mb-4">
                      <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Sale Price</Text>
                      <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}>
                        <Text style={{ color: themeColors.text.muted, fontSize: 14, marginRight: 4 }}>₦</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={themeColors.input.placeholder}
                          value={newVariantPrice}
                          onChangeText={setNewVariantPrice}
                          keyboardType="numeric"
                          style={{ color: themeColors.input.text, fontSize: 14, flex: 1 }}
                          selectionColor={themeColors.text.primary}
                        />
                      </View>
                    </View>
                  ) : null}

                  {/* Add Button */}
                  <Pressable
                    onPress={handleAddVariant}
                    className="rounded-full items-center active:opacity-80 mb-4"
                    style={{ height: 52, justifyContent: 'center', backgroundColor: isDark ? '#FFFFFF' : '#111111' }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-base">Add Variant</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Edit Variant Modal - Centered - Dynamic Theme */}
        <Modal
          visible={!!editingVariant}
          animationType="fade"
          transparent
          onRequestClose={() => setEditingVariant(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <View
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            >
              <Pressable
                className="absolute inset-0"
                onPress={() => setEditingVariant(null)}
              />
              <View
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: themeColors.bg.card, maxHeight: '85%', maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: themeColors.border.light }}>
                  <Text style={{ color: themeColors.text.primary }} className="font-bold text-lg">Edit Variant</Text>
                  <Pressable
                    onPress={() => setEditingVariant(null)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: themeColors.bg.secondary }}
                  >
                    <X size={18} color={themeColors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <ScrollView
                  className="px-5 py-4"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                  overScrollMode="always"
                >
                  {/* Error Toast for image picker */}
                  {imagePicker.error && (
                    <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
                      <Text className="text-red-400 text-sm text-center">{imagePicker.error}</Text>
                    </View>
                  )}

                  {/* Variant Image */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Variant Image</Text>
                    <Text style={{ color: themeColors.text.muted }} className="text-xs mb-3">
                      Optional. If not set, will use the main product image.
                    </Text>
                    {editVariantImageUrl ? (
                      <View className="flex-row items-start">
                        <View className="overflow-hidden" style={{ borderWidth: 1, borderColor: themeColors.border.light, borderRadius: 10 }}>
                          <ResolvedAttachmentImage
                            imageUrl={editVariantImageUrl}
                            style={{ width: 72, height: 72 }}
                            resizeMode="cover"
                          />
                        </View>
                        <View className="ml-3 flex-1">
                          <Pressable
                            onPress={async () => {
                              try {
                                const uri = await imagePicker.pickImage();
                                if (uri) {
                                  setEditVariantImageUrl(uri);
                                }
                              } catch (err) {
                                console.error('Variant image pick error:', err);
                              }
                            }}
                            disabled={imagePicker.isLoading}
                            className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                            style={{ backgroundColor: themeColors.bg.secondary, opacity: imagePicker.isLoading ? 0.5 : 1 }}
                          >
                            <Camera size={14} color={themeColors.text.primary} strokeWidth={2} />
                            <Text style={{ color: themeColors.text.primary }} className="text-xs font-medium ml-2">Change</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setEditVariantImageUrl(undefined)}
                            className="flex-row items-center px-3 py-2 rounded-full active:opacity-70"
                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                          >
                            <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                            <Text className="text-red-400 text-xs font-medium ml-2">Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        onPress={async () => {
                          try {
                            const uri = await imagePicker.pickImage();
                            if (uri) {
                              setEditVariantImageUrl(uri);
                            }
                          } catch (err) {
                            console.error('Variant image pick error:', err);
                          }
                        }}
                        disabled={imagePicker.isLoading}
                        className="rounded-xl p-4 items-center active:opacity-70"
                        style={{ backgroundColor: themeColors.bg.secondary, borderWidth: 1, borderColor: themeColors.border.light, borderStyle: 'dashed', opacity: imagePicker.isLoading ? 0.5 : 1 }}
                      >
                        {imagePicker.isLoading ? (
                          <>
                            <View className="w-6 h-6 items-center justify-center">
                              <Text style={{ color: themeColors.text.muted }} className="text-xs">...</Text>
                            </View>
                            <Text style={{ color: themeColors.text.muted }} className="text-sm font-medium mt-2">Opening...</Text>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={24} color={themeColors.text.muted} strokeWidth={1.5} />
                            <Text style={{ color: themeColors.text.muted }} className="text-sm font-medium mt-2">Add Variant Image</Text>
                            <Text style={{ color: themeColors.text.tertiary }} className="text-xs mt-1">Uses product image if empty</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>

                  {/* Variant Name/Value - Editable */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Variant Name/Value</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder="e.g., Pink, Soft Pink"
                        placeholderTextColor={themeColors.input.placeholder}
                        value={editVariantName}
                        onChangeText={(text) => {
                          const nextText = text.toUpperCase();
                          setEditVariantName(nextText);
                          setEditVariantSku(buildVariantSku(product.name, nextText).toUpperCase());
                        }}
                        style={{ color: themeColors.input.text, fontSize: 14 }}
                        selectionColor={themeColors.text.primary}
                      />
                    </View>
                    <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">Change the variant name (e.g., "Pink" to "Soft Pink")</Text>
                  </View>

                  {/* SKU */}
                  <View className="mb-4">
                    <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>SKU</Text>
                    <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                      <TextInput
                        placeholder={buildVariantSku(product.name, editVariantName).toUpperCase()}
                        placeholderTextColor={themeColors.input.placeholder}
                        value={editVariantSku || buildVariantSku(product.name, editVariantName).toUpperCase()}
                        onChangeText={(text) => setEditVariantSku(text.toUpperCase())}
                        style={{ color: themeColors.input.text, fontSize: 14 }}
                        selectionColor={themeColors.text.primary}
                      />
                    </View>
                    <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">
                      Auto-updates from product name and variant value.
                    </Text>
                  </View>

                  {/* Stock */}
                  {useGlobalStock ? (
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text style={{ color: themeColors.text.primary }} className="text-sm font-semibold">Custom Stock</Text>
                        <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">Use a different stock for this variant.</Text>
                        {!editOverrideVariantStock ? (
                          <Text style={{ color: themeColors.text.muted }} className="text-xs mt-2">
                            Stock uses the global value ({effectiveGlobalStock} units).
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={editOverrideVariantStock}
                        onValueChange={setEditOverrideVariantStock}
                        trackColor={{ false: '#767577', true: '#D1D5DB' }}
                        thumbColor={editOverrideVariantStock ? '#374151' : '#FFFFFF'}
                      />
                    </View>
                  ) : null}
                  {(!useGlobalStock || editOverrideVariantStock) ? (
                    <View className="mb-4">
                      <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Stock</Text>
                      <View className="rounded-xl px-4" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52, justifyContent: 'center' }}>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={themeColors.input.placeholder}
                          value={editVariantStock}
                          onChangeText={setEditVariantStock}
                          keyboardType="number-pad"
                          style={{ color: themeColors.input.text, fontSize: 14 }}
                          selectionColor={themeColors.text.primary}
                        />
                      </View>
                    </View>
                  ) : null}

                  {/* Sale Price */}
                  {useGlobalPrice ? (
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text style={{ color: themeColors.text.primary }} className="text-sm font-semibold">Custom Price</Text>
                        <Text style={{ color: themeColors.text.muted }} className="text-xs mt-1">Use a different price for this variant.</Text>
                        {!editOverrideVariantPrice ? (
                          <Text style={{ color: themeColors.text.muted }} className="text-xs mt-2">
                            Price uses the global value ({effectiveGlobalPrice}).
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={editOverrideVariantPrice}
                        onValueChange={setEditOverrideVariantPrice}
                        trackColor={{ false: '#767577', true: '#D1D5DB' }}
                        thumbColor={editOverrideVariantPrice ? '#374151' : '#FFFFFF'}
                      />
                    </View>
                  ) : null}
                  {(!useGlobalPrice || editOverrideVariantPrice) ? (
                    <View className="mb-4">
                      <Text style={{ color: themeColors.text.secondary }} className={cn(modalFieldLabelClass, 'mb-2')}>Sale Price</Text>
                      <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: modalFieldBg, borderWidth: 1, borderColor: modalFieldBorder, height: 52 }}>
                        <Text style={{ color: themeColors.text.muted, fontSize: 14, marginRight: 4 }}>₦</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={themeColors.input.placeholder}
                          value={editVariantPrice}
                          onChangeText={setEditVariantPrice}
                          keyboardType="numeric"
                          style={{ color: themeColors.input.text, fontSize: 14, flex: 1 }}
                          selectionColor={themeColors.text.primary}
                        />
                      </View>
                    </View>
                  ) : null}

                  {/* Save Button */}
                  <Pressable
                    onPress={handleSaveVariant}
                    className="rounded-full items-center active:opacity-80 mb-4"
                    style={{ height: 52, justifyContent: 'center', backgroundColor: isDark ? '#FFFFFF' : '#111111' }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-base">Save Changes</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={pendingDeleteProduct}
          animationType="fade"
          transparent
          onRequestClose={() => {
            if (!isDeletingProduct) {
              setPendingDeleteProduct(false);
            }
          }}
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => {
              if (!isDeletingProduct) {
                setPendingDeleteProduct(false);
              }
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxWidth: 360 }}
            >
              <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Move to Recycle Bin</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                  {product.name
                    ? `Move ${product.name} out of active inventory and keep it recoverable from Recycle Bin?`
                    : 'Move this product out of active inventory and keep it recoverable from Recycle Bin?'}
                </Text>
              </View>
              <View className="px-5 py-4 flex-row gap-3">
                <Pressable
                  onPress={() => {
                    if (!isDeletingProduct) {
                      setPendingDeleteProduct(false);
                    }
                  }}
                  className="flex-1 rounded-full items-center"
                  style={{
                    backgroundColor: colors.bg.secondary,
                    height: 48,
                    justifyContent: 'center',
                    opacity: isDeletingProduct ? 0.5 : 1,
                  }}
                  disabled={isDeletingProduct}
                >
                  <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDeleteProduct}
                  className="flex-1 rounded-full items-center"
                  style={{
                    backgroundColor: '#EF4444',
                    height: 48,
                    justifyContent: 'center',
                    opacity: isDeletingProduct ? 0.7 : 1,
                  }}
                  disabled={isDeletingProduct}
                >
                  <Text className="text-white font-semibold">
                    {isDeletingProduct ? 'Moving...' : 'Move'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Image Picker Modal - Simplified for web compatibility */}
        <Modal
          visible={showImagePicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowImagePicker(false)}
        >
          <Pressable
            className="flex-1 items-center justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={() => setShowImagePicker(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full rounded-t-3xl overflow-hidden"
              style={{ backgroundColor: '#111111' }}
            >
              <View className="p-5">
                <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: '#333333' }} />
                <Text className="text-white text-lg font-bold mb-4">Change Product Image</Text>

                <Pressable
                  onPress={handlePickImage}
                  className="flex-row items-center p-4 rounded-full mb-3 active:opacity-70"
                  style={{ backgroundColor: '#1A1A1A' }}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#FFFFFF' }}>
                    <ImageIcon size={20} color="#111111" strokeWidth={2} />
                  </View>
                  <View>
                    <Text className="text-white font-semibold">Choose Image</Text>
                    <Text className="text-gray-500 text-xs">Select from your device</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setShowImagePicker(false)}
                  className="p-4 rounded-full items-center active:opacity-70"
                  style={{ backgroundColor: '#1A1A1A' }}
                >
                  <Text className="text-gray-400 font-semibold">Cancel</Text>
                </Pressable>
              </View>
              <View className="h-8" />
            </Pressable>
          </Pressable>
        </Modal>

        {/* Product Gallery Preview */}
        <Modal
          visible={isGalleryOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setIsGalleryOpen(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)' }}>
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text className="text-white text-sm font-semibold">
                {galleryImages.length > 0 ? `${galleryIndex + 1} of ${galleryImages.length}` : 'Preview'}
              </Text>
              <Pressable
                onPress={() => setIsGalleryOpen(false)}
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <X size={18} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
            <ScrollView
              ref={galleryScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                setGalleryIndex(nextIndex);
              }}
              contentOffset={{ x: galleryIndex * screenWidth, y: 0 }}
            >
              {galleryImages.map((imageUrl) => (
                <View
                  key={imageUrl}
                  style={{
                    width: screenWidth,
                    height: screenHeight - 88,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ResolvedAttachmentImage
                    imageUrl={imageUrl}
                    style={{ width: screenWidth, height: screenHeight - 140 }}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {toastView}
      </SafeAreaView>
    </View>
  );
}
