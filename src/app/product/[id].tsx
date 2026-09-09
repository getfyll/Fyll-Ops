import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Modal, Switch, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Package, Plus, Minus, Trash2, Edit2, X, ChevronDown, Search, Printer, PackagePlus, Clock, Camera, ImageIcon, Save, DollarSign, TrendingUp, MoreVertical, ClipboardCheck } from 'lucide-react-native';
import useFyllStore, { type Procurement, ProductVariant, formatCurrency } from '@/lib/state/fyll-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import { useImagePicker } from '@/hooks/useImagePicker';
import { Button } from '@/components/Button';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { openAttachmentPath } from '@/lib/storage-attachments';
import { prepareProductMediaForPersistence, uploadProductMediaIfNeeded } from '@/lib/product-media';

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
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
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

  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  const retailValue = product.variants.reduce((sum, v) => sum + v.stock * v.sellingPrice, 0);
  const lowStockCount = product.variants.filter((v) => v.stock <= product.lowStockThreshold).length;

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

  const handleSaveProduct = async () => {
    if (isSavingProduct) return;
    setIsSavingProduct(true);
    const latestProduct = useFyllStore.getState().products.find((p) => p.id === product.id);
    if (latestProduct) {
      await updateProduct(product.id, latestProduct, businessId);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveNotice('Saved for all devices.');
    setTimeout(() => setSaveNotice(''), 2000);
    setIsSavingProduct(false);
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

  const handleAdjustStock = async (variantId: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextVariants = product.variants.map((variant) => (
      variant.id === variantId
        ? { ...variant, stock: Math.max(0, variant.stock + delta) }
        : variant
    ));
    await updateProduct(product.id, { variants: nextVariants }, businessId);
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

  const statsSection = (
    <View className={cn('mt-4 gap-3', !isWebDesktop && 'flex-row mx-5')}>
      <View className="flex-1 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">Total Stock</Text>
        <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-1">{totalStock}</Text>
        {lowStockCount > 0 && (
          <View className="px-2 py-0.5 rounded-full self-start mt-1" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
            <Text className="text-amber-500 text-xs font-semibold">{lowStockCount} low</Text>
          </View>
        )}
      </View>
      {isOwner && (
        <View className="flex-1 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">Stock Value</Text>
          <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-1">{formatCurrency(retailValue)}</Text>
          <Text style={{ color: colors.text.muted }} className="text-xs mt-1">at retail price</Text>
        </View>
      )}
    </View>
  );

  const mobileSoldHighlights = (
    <View className={cn('mt-3', !isWebDesktop && 'mx-5')}>
      <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium">Total Sold</Text>
            <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-1">{soldStats.totalSold}</Text>
            {soldStats.bestVariantId ? (
              <Text style={{ color: colors.text.muted }} className="text-xs mt-1" numberOfLines={1}>
                Best-selling:{' '}
                <Text style={{ color: colors.text.primary }} className="font-semibold">
                  {Object.values(product.variants.find((v) => v.id === soldStats.bestVariantId)?.variableValues ?? {}).join(' / ') || '—'}
                </Text>
              </Text>
            ) : (
              <Text style={{ color: colors.text.muted }} className="text-xs mt-1">No sales yet.</Text>
            )}
          </View>
          <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: colors.bg.secondary }}>
            <TrendingUp size={18} color={colors.text.primary} strokeWidth={2} />
          </View>
        </View>
      </View>
    </View>
  );

  const descriptionSection = product.description ? (
    <View className={cn('mt-4 rounded-2xl p-4', !isWebDesktop && 'mx-5')} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium mb-1">Description</Text>
      <Text style={{ color: colors.text.secondary }} className="text-sm">{product.description}</Text>
    </View>
  ) : null;

  const variantsHeaderSection = (
    <View className={cn('mt-4 flex-row items-center justify-between', !isWebDesktop && 'mx-5')}>
      <Text style={{ color: colors.text.primary }} className="font-bold text-base">Variants ({product.variants.length})</Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            router.push({
              pathname: '/label-print',
              params: { productId: product.id, bulk: '1' },
            });
          }}
          className="flex-row items-center px-3 py-2 rounded-full active:opacity-80"
          style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
        >
          <Printer size={14} color={colors.text.primary} strokeWidth={2.2} />
          <Text style={{ color: colors.text.primary }} className="font-semibold text-xs ml-1">Bulk Print</Text>
        </Pressable>
        {canManageVariants ? (
          <Pressable
            onPress={handleOpenAddVariant}
            className="flex-row items-center px-3 py-2 rounded-full active:opacity-80"
            style={{ backgroundColor: '#111111' }}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text className="text-white font-semibold text-sm ml-1">Add Variant</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const variantsListSection = (
    <View className={cn('mt-3', !isWebDesktop && 'mx-5')}>
      {product.variants.map((variant, index) => {
        const rawVariantValues = Object.entries(variant.variableValues ?? {})
          .filter(([key, value]) => key.toLowerCase() !== 'source' && value.toLowerCase() !== 'woocommerce')
          .map(([, value]) => value);
        const variantName = rawVariantValues.join(' / ');
        const displayVariantName = (variantName || product.name || variant.sku || 'Variant').toUpperCase();
        const displaySku = variant.sku.toUpperCase();
        const isLowStock = variant.stock <= product.lowStockThreshold;
        // Use variant image if set, otherwise fallback to product image
        const displayImage = variant.imageUrl ?? product.imageUrl;

        return (
          <View
            key={variant.id}
            className="rounded-xl p-3 mb-2"
            style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
          >
            {/* Main Row - Image, Name, Stock Badge, Actions */}
            <View className="flex-row items-center">
              {/* Image thumbnail */}
              {displayImage && (
                <Pressable
                  onPress={() => handleOpenGallery(displayImage)}
                  className="mr-3 overflow-hidden active:opacity-80"
                  style={{ borderWidth: 1, borderColor: colors.border.light, borderRadius: 10 }}
                >
                  <ResolvedAttachmentImage
                    imageUrl={displayImage}
                    style={{ width: 40, height: 40 }}
                    resizeMode="cover"
                  />
                  {variant.imageUrl && (
                    <View className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                  )}
                </Pressable>
              )}
              <View className="flex-1">
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{displayVariantName}</Text>
                <Text style={{ color: colors.text.muted }} className="text-xs">SKU: {displaySku}</Text>
              </View>
              {/* Stock Badge */}
              <View
                className="px-2 py-1 rounded-full mr-2"
                style={{
                  backgroundColor: isLowStock
                    ? variant.stock === 0
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)'
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{
                    color: isLowStock
                      ? variant.stock === 0
                        ? '#EF4444'
                        : '#F59E0B'
                      : '#10B981'
                  }}
                >
                  {variant.stock}
                </Text>
              </View>
              {/* Action buttons */}
              {canManageVariants && (
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: '/label-print',
                        params: { productId: product.id, variantId: variant.id },
                      });
                    }}
                    className="p-1.5 active:opacity-50"
                  >
                    <Printer size={14} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleOpenEditVariant(variant)}
                    className="p-1.5 active:opacity-50"
                  >
                    <Edit2 size={14} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteVariant(variant.id, variantName)}
                    className="p-1.5 active:opacity-50"
                  >
                    <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Bottom Row - Price, Restock, Stock Adjustment */}
            <View className="flex-row items-center justify-between mt-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
              {/* Price */}
              {canManageVariants && (
                <Text style={{ color: colors.text.primary }} className="font-bold text-sm">{formatCurrency(variant.sellingPrice)}</Text>
              )}

              {/* Actions Row */}
              <View className="flex-row items-center gap-2">
                {/* Restock Button - Compact */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push({
                      pathname: '/restock',
                      params: { productId: product.id, variantId: variant.id },
                    });
                  }}
                  className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-80"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                >
                  <PackagePlus size={14} color="#10B981" strokeWidth={2} />
                  <Text className="text-emerald-500 font-medium text-xs ml-1">Restock</Text>
                </Pressable>

                {/* Stock Adjustment */}
                <View className="flex-row items-center rounded-lg" style={{ backgroundColor: colors.border.light }}>
                  <Pressable
                    onPress={() => handleAdjustStock(variant.id, -1)}
                    disabled={variant.stock === 0}
                    className="p-2 active:opacity-50"
                  >
                    <Minus
                      size={14}
                      color={variant.stock === 0 ? colors.text.muted : colors.text.primary}
                      strokeWidth={2}
                    />
                  </Pressable>
                  <View className="w-8 items-center">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-sm">{variant.stock}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleAdjustStock(variant.id, 1)}
                    className="p-2 active:opacity-50"
                  >
                    <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );

  const inventoryActivitySection = (
    <View className={cn('mt-4', !isWebDesktop && 'mx-5')}>
      <Text style={{ color: colors.text.primary }} className="font-bold text-base mb-3">Inventory Activity</Text>
      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
        {inventoryActivity.length === 0 ? (
          <View className="p-4">
            <Text style={{ color: colors.text.muted }} className="text-sm">
              No stock movement yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: isWebDesktop ? 320 : 260 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {inventoryActivity.map((entry, index) => {
              const date = new Date(entry.at);
              const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const isRestock = entry.type === 'restock';
              const isAuditAdjustment = entry.type === 'audit_adjustment';
              const isPositiveDelta = entry.delta >= 0;
              const isProcurementReceipt = isRestock && 'sourceType' in entry && entry.sourceType === 'procurement_receipt';
              const accentColor = isAuditAdjustment
                ? (isPositiveDelta ? '#10B981' : '#EF4444')
                : (isRestock ? (isPositiveDelta ? '#10B981' : '#EF4444') : '#EF4444');
              const activityLabel = isAuditAdjustment
                ? `${isPositiveDelta ? '+' : '-'}${entry.quantity} unit${entry.quantity === 1 ? '' : 's'} adjusted`
                : isRestock
                  ? `${isPositiveDelta ? '+' : '-'}${entry.quantity} unit${entry.quantity === 1 ? '' : 's'} ${isProcurementReceipt && isPositiveDelta ? 'received' : isPositiveDelta ? 'restocked' : 'adjusted'}`
                  : `-${entry.quantity} unit${entry.quantity === 1 ? '' : 's'} sold`;

              return (
                <View
                  key={entry.id}
                  className="flex-row items-center p-4"
                  style={{ borderBottomWidth: index < inventoryActivity.length - 1 ? 1 : 0, borderBottomColor: colors.border.light }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{
                      backgroundColor: isAuditAdjustment
                        ? (isPositiveDelta ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                        : (isRestock
                          ? (isPositiveDelta ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                          : 'rgba(239, 68, 68, 0.15)'),
                    }}
                  >
                    {isAuditAdjustment ? (
                      <ClipboardCheck size={16} color={accentColor} strokeWidth={2} />
                    ) : isRestock ? (
                      isPositiveDelta
                        ? <PackagePlus size={18} color={accentColor} strokeWidth={2} />
                        : <Minus size={16} color={accentColor} strokeWidth={2.4} />
                    ) : (
                      <Minus size={16} color={accentColor} strokeWidth={2.4} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                      {activityLabel}
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      {entry.variantName} · {entry.subtitle}
                    </Text>
                    {entry.actor ? (
                      <Text style={{ color: colors.text.muted }} className="text-[11px] mt-0.5">
                        by {entry.actor}
                      </Text>
                    ) : null}
                  </View>
                  <View className="items-end">
                    <View className="flex-row items-center">
                      <Clock size={12} color={colors.text.muted} strokeWidth={2} />
                      <Text style={{ color: colors.text.muted }} className="text-xs ml-1">{formattedDate}</Text>
                    </View>
                    <Text style={{ color: colors.text.muted }} className="text-xs">{formattedTime}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const recentRestocksSection = recentRestocks.length > 0 ? (
    <View className={cn('mt-4', !isWebDesktop && 'mx-5')}>
      <Text style={{ color: colors.text.primary }} className="font-bold text-base mb-3">Recent Restocks</Text>
      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
        {recentRestocks.map((log, index) => {
          const variant = product.variants.find((v) => v.id === log.variantId);
          const variantName = variant ? Object.values(variant.variableValues).join(' / ') : 'Unknown';
          const date = new Date(log.timestamp);
          const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const isPositiveRestock = log.quantityAdded >= 0;
          const restockAccentColor = isPositiveRestock ? '#10B981' : '#EF4444';

          return (
            <View
              key={log.id}
              className="flex-row items-center p-4"
              style={{ borderBottomWidth: index < recentRestocks.length - 1 ? 1 : 0, borderBottomColor: colors.border.light }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isPositiveRestock ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}
              >
                {isPositiveRestock ? (
                  <PackagePlus size={18} color={restockAccentColor} strokeWidth={2} />
                ) : (
                  <Minus size={16} color={restockAccentColor} strokeWidth={2.4} />
                )}
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                  {log.quantityAdded >= 0 ? '+' : '-'}{Math.abs(log.quantityAdded)} units
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs">
                  {variantName} · {log.note?.trim() ? `${log.note.trim()} · ` : ''}{log.previousStock} → {log.newStock}
                </Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-center">
                  <Clock size={12} color={colors.text.muted} strokeWidth={2} />
                  <Text style={{ color: colors.text.muted }} className="text-xs ml-1">{formattedDate}</Text>
                </View>
                <Text style={{ color: colors.text.muted }} className="text-xs">{formattedTime}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  const productStatusLabel = product.isDiscontinued ? 'Inactive' : 'Active';
  const productStatusBg = product.isDiscontinued ? 'rgba(156, 163, 175, 0.18)' : 'rgba(34, 197, 94, 0.15)';
  const productStatusText = product.isDiscontinued ? '#9CA3AF' : '#22C55E';

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

  const handleDownloadMedia = () => {
    const urls = [
      product.imageUrl,
      ...product.variants.map((v) => v.imageUrl).filter(Boolean),
    ].filter(Boolean) as string[];

    if (!urls.length) return;
    void openAttachmentPath(urls[0]).catch((error) => {
      console.warn('Media open failed:', error);
    });
  };

  const hasMedia = !!primaryDisplayImage || product.variants.some((v) => !!v.imageUrl);

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

  const webMediaCard = (
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: 18,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.border.light,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700' }}>Media</Text>
        <Pressable
          onPress={handleDownloadMedia}
          disabled={!hasMedia}
          className="active:opacity-80"
        >
          <Text
            style={{
              color: hasMedia ? '#2563EB' : colors.text.muted,
              fontSize: 14,
              fontWeight: '600',
            }}
          >
            Download All
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
        <Pressable
          onPress={handlePickProductImageInline}
          className="active:opacity-80"
          style={{
            width: 156,
            aspectRatio: 1,
            borderRadius: 16,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.border.light,
            backgroundColor: colors.bg.secondary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ImageIcon size={26} color={colors.text.muted} strokeWidth={2} />
          <Text style={{ color: colors.text.muted, fontSize: 13, fontWeight: '600', marginTop: 10 }}>
            {product.imageUrl ? 'Change Image' : 'Add Image'}
          </Text>
        </Pressable>

        <Pressable
          disabled={!primaryDisplayImage}
          onPress={() => handleOpenGallery(primaryDisplayImage)}
          className="active:opacity-80"
          style={{
            width: 156,
            aspectRatio: 1,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.secondary,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {primaryDisplayImage ? (
            <ResolvedAttachmentImage imageUrl={primaryDisplayImage} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Package size={34} color={colors.text.muted} strokeWidth={1.8} />
          )}
        </Pressable>
      </View>
    </View>
  );

  const webStockCards = (
    <View style={{ gap: 14 }}>
      <View
        style={{
          backgroundColor: colors.bg.card,
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Total Stock</Text>
            <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', marginTop: 6 }}>
              {totalStock}
            </Text>
            {lowStockCount > 0 ? (
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600', marginTop: 6 }}>
                {lowStockCount} variant{lowStockCount === 1 ? '' : 's'} low
              </Text>
            ) : null}
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Package size={18} color="#F59E0B" strokeWidth={2} />
          </View>
        </View>
      </View>

      {isOwner ? (
        <View
          style={{
            backgroundColor: colors.bg.card,
            borderRadius: 18,
            padding: 18,
            borderWidth: 1,
            borderColor: colors.border.light,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Stock Value</Text>
              <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', marginTop: 6 }}>
                {formatCurrency(retailValue)}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>At retail price</Text>
            </View>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: colors.bg.secondary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DollarSign size={18} color={colors.text.primary} strokeWidth={2} />
            </View>
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: colors.bg.card,
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Total Sold</Text>
            <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '700', marginTop: 6 }}>
              {soldStats.totalSold}
            </Text>
            {soldStats.bestVariantId ? (
              <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
                Best-selling variant:{' '}
                <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
                  {Object.values(product.variants.find((v) => v.id === soldStats.bestVariantId)?.variableValues ?? {}).join(' / ') || '—'}
                </Text>
                {soldStats.bestVariantSold ? ` (${soldStats.bestVariantSold} sold)` : ''}
              </Text>
            ) : (
              <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>
                No sales yet.
              </Text>
            )}
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TrendingUp size={18} color={colors.text.primary} strokeWidth={2} />
          </View>
        </View>

        <View
          style={{
            marginTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border.light,
            paddingTop: 12,
            gap: 8,
            marginHorizontal: -18,
            paddingHorizontal: 18,
          }}
        >
          {soldStats.variantSales.map((variant) => (
            <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>
                {variant.name}
              </Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                {variant.quantity}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          backgroundColor: colors.bg.card,
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Bulk Labels</Text>
        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>
          Print one label for each variant in this product.
        </Text>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            router.push({
              pathname: '/label-print',
              params: { productId: product.id, bulk: '1' },
            });
          }}
          className="active:opacity-80"
          style={{
            marginTop: 12,
            height: 44,
            borderRadius: 999,
            backgroundColor: '#111111',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Printer size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Bulk Print Labels</Text>
        </Pressable>
      </View>
    </View>
  );

  const webMetaCards = (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
      <View
        style={{
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.card,
          padding: 12,
        }}
      >
        <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600' }}>
          Low stock
        </Text>
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 8 }}>
          {product.lowStockThreshold}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.card,
          padding: 12,
        }}
      >
        <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600' }}>
          Status
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 12 }}>
          <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: productStatusBg }}>
            <Text style={{ color: productStatusText, fontSize: 12, fontWeight: '700' }}>{productStatusLabel}</Text>
          </View>
          {canManageStatus ? (
            <Switch
              value={!product.isDiscontinued}
              onValueChange={handleToggleProductActive}
              disabled={isStatusSaving}
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  const webOrganizationCard = (
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: 18,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.border.light,
        marginTop: 14,
      }}
    >
      <View
        style={{
          padding: 0,
        }}
      >
        <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>
          Categories
        </Text>

        {selectedCategories.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {selectedCategories.map((cat) => (
                <View
                  key={cat}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    gap: 6,
                  }}
                >
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  {cat}
                </Text>
                <Pressable onPress={() => handleRemoveCategoryChip(cat)} className="active:opacity-70">
                  <X size={14} color={colors.text.muted} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 10 }}>
            No categories yet.
          </Text>
        )}

        <View
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 12,
            alignItems: 'center',
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <Search size={16} color={colors.text.muted} strokeWidth={2.5} />
          <TextInput
            value={webCategoryQuery}
            onChangeText={setWebCategoryQuery}
            placeholder="Add category..."
            placeholderTextColor={colors.text.muted}
            style={{ color: colors.text.primary, fontSize: 14, flex: 1 }}
            onSubmitEditing={handleCreateCategoryChip}
            returnKeyType="done"
          />
          <Pressable
            onPress={handleCreateCategoryChip}
            disabled={!webCategoryQuery.trim()}
            className="active:opacity-80"
            style={{ opacity: webCategoryQuery.trim() ? 1 : 0.35 }}
          >
            <Plus size={16} color={colors.text.primary} strokeWidth={2.5} />
          </Pressable>
        </View>

        {(webCategoryQuery.trim() || webCategorySuggestions.length > 0) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {webCategoryQuery.trim() && !globalCategories.some((c) => c.toLowerCase() === webCategoryQuery.trim().toLowerCase()) ? (
            <Pressable
              onPress={handleCreateCategoryChip}
              className="active:opacity-80"
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  Add “{webCategoryQuery.trim()}”
                </Text>
              </Pressable>
            ) : null}

            {webCategorySuggestions.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => handleAddCategoryChip(cat)}
                className="active:opacity-80"
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

    </View>
  );

  const webVariantsCard = (
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border.light,
        overflow: 'hidden',
        marginTop: 16,
      }}
    >
      <View style={{ paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
          <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700' }}>Variants</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4 }}>
            Manage stock levels and pricing for each option.
          </Text>
        </View>
        {canManageVariants ? (
          <Pressable
            onPress={handleOpenAddVariant}
            className="active:opacity-80"
            style={{
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: isDark ? '#FFFFFF' : colors.bg.primary,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Plus size={16} color={isDark ? '#111111' : colors.text.primary} strokeWidth={2.5} />
            <Text style={{ color: isDark ? '#111111' : colors.text.primary, fontSize: 14, fontWeight: '700' }}>Add Variant</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
        {product.variants.map((variant, index) => {
          const rawVariantValues = Object.entries(variant.variableValues ?? {})
            .filter(([key, value]) => key.toLowerCase() !== 'source' && value.toLowerCase() !== 'woocommerce')
            .map(([, value]) => value);
          const variantName = rawVariantValues.join(' / ');
          const displayVariantName = (variantName || product.name || variant.sku || 'Variant').toUpperCase();
          const displaySku = variant.sku.toUpperCase();
          const displayImage = variant.imageUrl ?? product.imageUrl;
          const isLowStock = variant.stock <= product.lowStockThreshold;
          const stockText = isLowStock ? (variant.stock === 0 ? '#EF4444' : '#F59E0B') : colors.text.primary;

          return (
            <View
              key={variant.id}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: isCompactWeb ? 'wrap' : 'nowrap',
                gap: isCompactWeb ? 10 : 16,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border.light,
              }}
            >
              <View style={{ flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  disabled={!displayImage}
                  onPress={() => handleOpenGallery(displayImage)}
                  className="active:opacity-80"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {displayImage ? (
                    <ResolvedAttachmentImage imageUrl={displayImage} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Package size={20} color={colors.text.muted} strokeWidth={1.8} />
                  )}
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                    {displayVariantName}
                  </Text>
                  {canManageVariants ? (
                    <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
                      {formatCurrency(variant.sellingPrice)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {isCompactWeb ? (
                <>
                  <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                    <View
                      style={{
                        borderRadius: 12,
                        height: 40,
                        paddingHorizontal: 16,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                        {displaySku}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      width: '100%',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        borderRadius: 14,
                        backgroundColor: colors.bg.primary,
                        overflow: 'hidden',
                        height: 40,
                      }}
                    >
                      <Pressable
                        onPress={() => handleAdjustStock(variant.id, -1)}
                        disabled={variant.stock === 0}
                        className="active:opacity-60"
                        style={{ width: 38, height: 40, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Minus size={16} color={variant.stock === 0 ? colors.text.muted : colors.text.primary} strokeWidth={2} />
                      </Pressable>
                      <View style={{ width: 44, alignItems: 'center' }}>
                        <Text style={{ color: stockText, fontSize: 14, fontWeight: '700' }}>{variant.stock}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleAdjustStock(variant.id, 1)}
                        className="active:opacity-60"
                        style={{ width: 38, height: 40, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Plus size={16} color={colors.text.primary} strokeWidth={2} />
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          router.push({
                            pathname: '/restock',
                            params: { productId: product.id, variantId: variant.id },
                          });
                        }}
                        className="active:opacity-70"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PackagePlus size={16} color="#10B981" strokeWidth={2} />
                      </Pressable>

                      {canManageVariants ? (
                        <>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push({
                                pathname: '/label-print',
                                params: { productId: product.id, variantId: variant.id },
                              });
                            }}
                            className="active:opacity-70"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              backgroundColor: colors.bg.primary,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Printer size={16} color={colors.text.primary} strokeWidth={2} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleOpenEditVariant(variant)}
                            className="active:opacity-70"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              backgroundColor: colors.bg.primary,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteVariant(variant.id, variantName)}
                            className="active:opacity-70"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              backgroundColor: colors.bg.primary,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      borderRadius: 12,
                      height: 40,
                      paddingHorizontal: 16,
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                      {displaySku}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 14,
                      backgroundColor: colors.bg.primary,
                      overflow: 'hidden',
                      height: 40,
                    }}
                  >
                    <Pressable
                      onPress={() => handleAdjustStock(variant.id, -1)}
                      disabled={variant.stock === 0}
                      className="active:opacity-60"
                      style={{ width: 38, height: 40, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Minus size={16} color={variant.stock === 0 ? colors.text.muted : colors.text.primary} strokeWidth={2} />
                    </Pressable>
                    <View style={{ width: 44, alignItems: 'center' }}>
                      <Text style={{ color: stockText, fontSize: 14, fontWeight: '700' }}>{variant.stock}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleAdjustStock(variant.id, 1)}
                      className="active:opacity-60"
                      style={{ width: 38, height: 40, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Plus size={16} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push({
                        pathname: '/restock',
                        params: { productId: product.id, variantId: variant.id },
                      });
                    }}
                    className="active:opacity-70"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PackagePlus size={16} color="#10B981" strokeWidth={2} />
                  </Pressable>

                  {canManageVariants ? (
                    <>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push({
                            pathname: '/label-print',
                            params: { productId: product.id, variantId: variant.id },
                          });
                        }}
                        className="active:opacity-70"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Printer size={16} color={colors.text.primary} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenEditVariant(variant)}
                        className="active:opacity-70"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteVariant(variant.id, variantName)}
                        className="active:opacity-70"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: isWebDesktop ? colors.bg.primary : colors.bg.secondary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        {isWebDesktop ? (
          <View style={{ backgroundColor: colors.bg.primary }}>
            <View
              style={{
                paddingHorizontal: 28,
                paddingTop: 32,
                paddingBottom: 18,
                width: '100%',
                maxWidth: webMaxWidth,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <Pressable
                    onPress={() => router.back()}
                    className="active:opacity-70"
                    style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
                  >
                    <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }} numberOfLines={1}>
                        {product.name}
                      </Text>
                    </View>
                    {saveNotice ? (
                      <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>
                        {saveNotice}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={handleDelete} className="active:opacity-80" style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}>
                    <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>Delete Product</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleOpenEdit}
                    className="active:opacity-80"
                    style={{
                      height: 44,
                      paddingHorizontal: 16,
                      borderRadius: 999,
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Edit</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleSaveProduct}
                    disabled={isSavingProduct}
                    className="active:opacity-80"
                    style={{
                      height: 44,
                      paddingHorizontal: 16,
                      borderRadius: 999,
                      backgroundColor: isDark ? '#FFFFFF' : '#111111',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: isSavingProduct ? 0.7 : 1,
                    }}
                  >
                    <Save size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                      {isSavingProduct ? 'Saving...' : 'Save Changes'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
              backgroundColor: colors.bg.primary,
              position: 'relative',
              zIndex: 80,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
                position: 'relative',
                zIndex: 81,
              }}
            >
              <Pressable onPress={() => router.back()} className="mr-4 active:opacity-50">
                <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text style={{ color: colors.text.primary }} className="font-bold text-lg" numberOfLines={1}>
                    {product.name}
                  </Text>
                  {product.isDiscontinued && (
                    <View className="ml-2 px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(156, 163, 175, 0.18)' }}>
                      <Text style={{ color: '#9CA3AF' }} className="text-[10px] font-bold">INACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.text.tertiary }} className="text-xs">{product.categories?.join(', ') || 'Uncategorized'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={handleOpenEdit}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Edit2 size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View style={{ position: 'relative', zIndex: 90 }}>
                  <Pressable
                    onPress={() => setShowMobileHeaderMenu((prev) => !prev)}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <MoreVertical size={18} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                  {showMobileHeaderMenu ? (
                    <>
                      <Pressable
                        className="absolute"
                        style={{ top: -100, right: -20, width: 220, height: 180, zIndex: 59 }}
                        onPress={() => setShowMobileHeaderMenu(false)}
                      />
                      <View
                        className="absolute rounded-2xl overflow-hidden"
                        style={{
                          top: 48,
                          right: 0,
                          width: 180,
                          backgroundColor: colors.bg.card,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          zIndex: 120,
                          elevation: 20,
                          shadowColor: '#000000',
                          shadowOpacity: 0.2,
                          shadowRadius: 16,
                          shadowOffset: { width: 0, height: 8 },
                        }}
                      >
                        <Pressable
                          onPress={() => {
                            setShowMobileHeaderMenu(false);
                            handleDelete();
                          }}
                          className="px-4 py-3 flex-row items-center active:opacity-70"
                        >
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                          <Text className="text-red-500 font-semibold ml-2">Delete Product</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1, backgroundColor: isWebDesktop ? colors.bg.primary : colors.bg.secondary }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 40,
            width: '100%',
            maxWidth: isWebDesktop ? webMaxWidth : undefined,
            alignSelf: isWebDesktop ? 'flex-start' : undefined,
            paddingHorizontal: isWebDesktop ? 28 : 0,
          }}
        >
          {isWebDesktop ? (
            <View style={{ flexDirection: 'row', gap: 24, paddingTop: 6 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
              {webMediaCard}
              {descriptionSection}
              {webVariantsCard}
              {inventoryActivitySection}
              </View>
              <View style={{ width: rightColumnWidth ?? 420 }}>
                {webMetaCards}
                {webStockCards}
                {webOrganizationCard}
                {recentRestocksSection}
              </View>
            </View>
          ) : (
            <>
              {statsSection}
              {mobileSoldHighlights}
              {descriptionSection}
              {variantsHeaderSection}
              {variantsListSection}
              {recentRestocksSection}
              {inventoryActivitySection}

              {canManageStatus ? (
                <View className="mx-5 mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text style={{ color: colors.text.primary }} className="font-semibold text-[15px]">
                        {product.isDiscontinued ? 'Mark as Active' : 'Mark as Inactive'}
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                        {product.isDiscontinued ? 'Restore this product to new order pickers.' : 'Hide this product from new order pickers.'}
                      </Text>
                    </View>
                    <Switch
                      value={!product.isDiscontinued}
                      disabled={isStatusSaving}
                      onValueChange={(nextActive) => handleToggleProductActive(nextActive)}
                      trackColor={{ false: '#9CA3AF', true: '#D1D5DB' }}
                      thumbColor={!product.isDiscontinued ? '#374151' : '#FFFFFF'}
                    />
                  </View>
                </View>
              ) : null}

              {/* Save Product */}
              <View className={cn('mt-4', !isWebDesktop && 'mx-5')}>
                <Button
                  onPress={handleSaveProduct}
                  loading={isSavingProduct}
                  loadingText="Saving..."
                  variant={isDark ? 'secondary' : 'primary'}
                >
                  Save Product
                </Button>
                {saveNotice ? (
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2 text-center">
                    {saveNotice}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

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
      </SafeAreaView>
    </View>
  );
}
