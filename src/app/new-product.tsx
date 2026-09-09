import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, Switch, Modal, KeyboardAvoidingView, Keyboard, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, X, Plus, Trash2, Hash, Check, ChevronDown, Search, Camera, ImageIcon } from 'lucide-react-native';
import useFyllStore, {
  ProductVariant,
  generateProductId,
  generateVariantBarcode,
  formatCurrency,
} from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useImagePicker } from '@/hooks/useImagePicker';
import { Button, StickyButtonContainer } from '@/components/Button';
import { useThemeColors } from '@/lib/theme';
import { prepareProductMediaForPersistence } from '@/lib/product-media';

// Theme-aware colors

interface VariantFormData {
  id: string;
  variableValues: Record<string, string>;
  stock: string;
  sellingPrice: string;
  imageUrl?: string;
}

export default function NewProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const isWeb = Platform.OS === 'web';
  const useSideBySideVariantSelector = width >= 768;
  const isDark = colors.bg.primary === '#111111';
  const useDesktopCanvas = isWeb && !isDark;
  const canvasBg = useDesktopCanvas ? '#F3F3F5' : colors.bg.primary;
  const panelBg = useDesktopCanvas ? '#FFFFFF' : colors.bg.primary;
  const textPrimaryClass = isDark ? 'text-white' : 'text-gray-900';
  const textMutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardClass = isDark ? 'bg-[#1A1A1A] border-[#333333]' : 'bg-white border-gray-200';
  const softSurfaceClass = isDark ? 'bg-[#151515] border-[#2C2C2C]' : 'bg-gray-50 border-gray-200';
  const sectionTitleClass = 'font-semibold text-[15px]';
  const fieldLabelClass = 'text-xs font-semibold uppercase tracking-wider';
  const productVariables = useFyllStore((s) => s.productVariables);
  const globalCategories = useFyllStore((s) => s.categories);
  const addCategory = useFyllStore((s) => s.addCategory);
  const updateProductVariable = useFyllStore((s) => s.updateProductVariable);
  const addProduct = useFyllStore((s) => s.addProduct);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [variants, setVariants] = useState<VariantFormData[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [activeVariableIds, setActiveVariableIds] = useState<string[]>([]);

  // New Design tracking state
  const [isNewDesign, setIsNewDesign] = useState(false);
  const [designYear, setDesignYear] = useState(new Date().getFullYear().toString());

  // Loading and success state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Use the web-safe image picker hook
  const imagePicker = useImagePicker();

  // Track which variant is currently picking an image (for loading state)
  const [variantImageLoading, setVariantImageLoading] = useState<string | null>(null);
  const [variantImageError, setVariantImageError] = useState<string | null>(null);

  // Variant selection modal state
  const [showVariantSelector, setShowVariantSelector] = useState<{ variantIndex: number; variableId: string } | null>(null);
  const [variantSearchQuery, setVariantSearchQuery] = useState('');
  const [showActiveVariableSelector, setShowActiveVariableSelector] = useState(false);

  // Global pricing state
  const [useGlobalPrice, setUseGlobalPrice] = useState(true);
  const [globalPrice, setGlobalPrice] = useState('');
  const [useGlobalStock, setUseGlobalStock] = useState(false);
  const [globalStock, setGlobalStock] = useState('');

  const formContentStyle = useMemo(() => ({
    paddingHorizontal: 20,
    paddingBottom: 24,
    width: '100%' as const,
    ...(isWeb ? { maxWidth: 1120, alignSelf: 'center' as const } : {}),
  }), [isWeb]);
 

  const handleGlobalPriceToggle = (value: boolean) => {
    setUseGlobalPrice(value);
  };

  const handleGlobalStockToggle = (value: boolean) => {
    setUseGlobalStock(value);
  };

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!categoryInput.trim()) return globalCategories.filter(cat => !categories.includes(cat));
    return globalCategories.filter(cat =>
      !categories.includes(cat) &&
      cat.toLowerCase().includes(categoryInput.toLowerCase())
    );
  }, [globalCategories, categoryInput, categories]);

  const activeVariables = useMemo(
    () => productVariables.filter((variable) => activeVariableIds.includes(variable.id)),
    [activeVariableIds, productVariables],
  );

  const handleToggleVariants = (value: boolean) => {
    setHasVariants(value);
    if (value) {
      setVariants((prev) => {
        if (prev.length === 0) return [createVariant(true)];
        return prev;
      });
    } else {
      setVariants((prev) => {
        if (prev.length === 0) return [createVariant(false)];
        return [{ ...prev[0], variableValues: {}, imageUrl: undefined }];
      });
    }
  };

  const createVariant = useCallback((includeVariables: boolean) => ({
    id: Math.random().toString(36).substring(2, 10),
    variableValues: includeVariables
      ? activeVariables.reduce((acc, v) => {
        acc[v.name] = v.values[0] || '';
        return acc;
      }, {} as Record<string, string>)
      : {},
    stock: '0',
    sellingPrice: '',
  }), [activeVariables]);

  const handleToggleActiveVariable = useCallback((variableId: string) => {
    setActiveVariableIds((prev) => (
      prev.includes(variableId)
        ? prev.filter((id) => id !== variableId)
        : [...prev, variableId]
    ));
  }, []);

  useEffect(() => {
    if (variants.length === 0) {
      setVariants([createVariant(hasVariants)]);
    }
  }, [createVariant, hasVariants, variants.length]);

  useEffect(() => {
    setActiveVariableIds((prev) => prev.filter((id) => productVariables.some((variable) => variable.id === id)));
  }, [productVariables]);

  useEffect(() => {
    if (!hasVariants) return;
    setVariants((prev) => {
      if (prev.length === 0) {
        return [createVariant(true)];
      }
      return prev.map((variant) => ({
        ...variant,
        variableValues: activeVariables.reduce((acc, variable) => {
          acc[variable.name] = variant.variableValues[variable.name] ?? variable.values[0] ?? '';
          return acc;
        }, {} as Record<string, string>),
      }));
    });
  }, [activeVariables, createVariant, hasVariants]);

  const handleAddVariant = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (activeVariables.length === 0) return;
    const newVariant: VariantFormData = createVariant(true);
    setVariants(prev => [newVariant, ...prev]);
  }, [activeVariables.length, createVariant]);

  const handleUpdateVariant = useCallback((index: number, updates: Partial<VariantFormData>) => {
    setVariants(prev => {
      const newVariants = [...prev];
      newVariants[index] = { ...newVariants[index], ...updates };
      return newVariants;
    });
  }, []);

  const handleRemoveVariant = useCallback((index: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVariants(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Category handling
  const handleSelectCategory = useCallback((cat: string) => {
    setCategories(prev => {
      if (!prev.includes(cat)) {
        return [...prev, cat];
      }
      return prev;
    });
    setCategoryInput('');
    setShowCategoryDropdown(false);
  }, []);

  const handleAddNewCategory = useCallback(() => {
    const trimmedCat = categoryInput.trim();
    if (trimmedCat) {
      setCategories(prev => {
        if (!prev.includes(trimmedCat)) {
          addCategory(trimmedCat);
          return [...prev, trimmedCat];
        }
        return prev;
      });
      setCategoryInput('');
      setShowCategoryDropdown(false);
    }
  }, [categoryInput, addCategory]);

  const handleRemoveCategory = useCallback((cat: string) => {
    setCategories(prev => prev.filter(c => c !== cat));
  }, []);

  // Image picker handler using the web-safe hook
  const handlePickImage = async () => {
    setShowImagePicker(false);
    const uri = await imagePicker.pickImage();
    if (uri) {
      setProductImageUrl(uri);
    }
  };

  const handleRemoveImage = () => {
    setProductImageUrl(null);
  };

  // Variant image picker handler
  const handlePickVariantImage = async (variantId: string, variantIndex: number) => {
    setVariantImageLoading(variantId);
    setVariantImageError(null);
    try {
      const uri = await imagePicker.pickImage();
      if (uri) {
        setVariants(prev => {
          const newVariants = [...prev];
          newVariants[variantIndex] = { ...newVariants[variantIndex], imageUrl: uri };
          return newVariants;
        });
      }
    } catch {
      setVariantImageError('Failed to pick image. Please try again.');
    } finally {
      setVariantImageLoading(null);
    }
  };

  const handleRemoveVariantImage = (variantIndex: number) => {
    setVariants(prev => {
      const newVariants = [...prev];
      newVariants[variantIndex] = { ...newVariants[variantIndex], imageUrl: undefined };
      return newVariants;
    });
  };

  // Variant value selection handler
  const handleSelectVariantValue = useCallback((variantIndex: number, variableName: string, value: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setVariants(prev => {
      const newVariants = [...prev];
      newVariants[variantIndex] = {
        ...newVariants[variantIndex],
        variableValues: { ...newVariants[variantIndex].variableValues, [variableName]: value },
      };
      return newVariants;
    });
    setShowVariantSelector(null);
    setVariantSearchQuery('');
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return;
    if (variants.length === 0) return;

    setIsSubmitting(true);

    try {
      // Simulate a small delay for better UX feedback
      await new Promise(resolve => setTimeout(resolve, 300));

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const productId = generateProductId();
      const draftedVariants: ProductVariant[] = variants.map((v, index) => {
        const variantCode = Object.values(v.variableValues).join('-').substring(0, 4).toUpperCase() || `${index + 1}`.padStart(3, '0');
        const sku = `${name.substring(0, 3).toUpperCase()}-${variantCode}`;
        const finalPrice = hasVariants
          ? (useGlobalPrice ? (parseFloat(globalPrice) || 0) : (parseFloat(v.sellingPrice) || 0))
          : (parseFloat(v.sellingPrice) || 0);
        const finalStock = hasVariants
          ? (useGlobalStock ? (parseInt(globalStock, 10) || 0) : (parseInt(v.stock, 10) || 0))
          : (parseInt(v.stock, 10) || 0);
        return {
          id: `${productId}-${index + 1}`,
          sku,
          barcode: generateVariantBarcode(),
          variableValues: v.variableValues,
          stock: finalStock,
          sellingPrice: finalPrice,
          imageUrl: v.imageUrl ?? productImageUrl ?? undefined,
        };
      });
      const preparedMedia = await prepareProductMediaForPersistence({
        businessId,
        productId,
        imageUrl: productImageUrl,
        variants: draftedVariants,
      });

      console.log('🚀 Submitting product:', name);
      console.log('📦 Product ID:', productId);
      console.log('🏢 BusinessId:', businessId);

      // Add timeout to prevent infinite spinner
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Product creation timed out after 15 seconds')), 15000)
      );

      await Promise.race([
        addProduct({
          id: productId,
          name: name.trim(),
          description: description.trim(),
          categories: categories,
          variants: preparedMedia.variants,
          lowStockThreshold: parseInt(lowStockThreshold, 10) || 5,
          createdAt: new Date().toISOString(),
          productType: 'product',
          imageUrl: preparedMedia.imageUrl,
          createdBy: currentUser?.name,
          useGlobalStock: hasVariants ? useGlobalStock : false,
          globalStock: hasVariants && useGlobalStock ? (parseInt(globalStock, 10) || 0) : undefined,
          // New Design fields
          isNewDesign: isNewDesign,
          designYear: isNewDesign ? parseInt(designYear, 10) || new Date().getFullYear() : undefined,
          designLaunchedAt: isNewDesign ? new Date().toISOString() : undefined,
        }, businessId),
        timeoutPromise,
      ]);

      console.log('✅ Product submitted successfully');

      // Show success toast
      setShowSuccessToast(true);

      // Navigate back after brief delay to show toast
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (error) {
      console.error('❌ Failed to create product:', error);
      setIsSubmitting(false);

      // Show error feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      alert('Failed to create product. Please check your internet connection and try again.');
    }
  };

  const primaryVariant = variants[0];
  const singleModeHasCoreValues = Boolean(primaryVariant)
    && (primaryVariant?.stock ?? '').trim() !== ''
    && (primaryVariant?.sellingPrice ?? '').trim() !== '';
  const isValid = name.trim().length > 0
    && variants.length > 0
    && (!hasVariants || activeVariables.length > 0)
    && (hasVariants || singleModeHasCoreValues);

  return (
    <View className="flex-1" style={{ backgroundColor: canvasBg }}>
      <View
        style={[
          { flex: 1, backgroundColor: panelBg },
          useDesktopCanvas
            ? {
                width: '100%',
                maxWidth: 1160,
                alignSelf: 'center',
                borderWidth: 1,
                borderColor: '#E6E6E6',
                borderRadius: 18,
                overflow: 'hidden',
                marginVertical: 12,
              }
            : null,
        ]}
      >
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: panelBg }}>
        {/* Header - Full Screen Style with Back Button (no Create button) */}
        <View className="flex-row items-center justify-between px-5 py-4" style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <View className="items-center">
            <Text className={cn('text-lg font-semibold', textPrimaryClass)}>
              New Product
            </Text>
            <Text className={cn('text-xs', textMutedClass)}>
              Choose single or variable, then fill only what matters
            </Text>
          </View>
          <View className="w-10 h-10" />
        </View>
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={formContentStyle}
          showsVerticalScrollIndicator={false}
          extraScrollHeight={100}
          enableOnAndroid={true}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mt-4">
            <View className={cn('rounded-2xl p-4 border', cardClass)}>
              <Text className={cn(sectionTitleClass, textPrimaryClass)}>Product Type</Text>
              <View
                className="flex-row mt-3 rounded-[26px] p-1.5"
                style={{
                  backgroundColor: isDark ? '#161616' : '#F3F4F6',
                  borderWidth: 1,
                  borderColor: isDark ? '#2C2C2C' : '#E5E7EB',
                }}
              >
                <Pressable
                  onPress={() => handleToggleVariants(false)}
                  className="flex-1 rounded-[22px] active:opacity-80 items-center justify-center"
                  style={{
                    minHeight: 48,
                    backgroundColor: !hasVariants ? '#111111' : 'transparent',
                    shadowColor: !hasVariants ? '#000000' : 'transparent',
                    shadowOpacity: !hasVariants ? 0.12 : 0,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: !hasVariants ? 3 : 0,
                  }}
                >
                  <Text
                    style={{
                      color: !hasVariants ? '#FFFFFF' : colors.text.primary,
                      fontSize: 15,
                      fontWeight: '500',
                      textAlign: 'center',
                    }}
                  >
                    Single Product
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleToggleVariants(true)}
                  className="flex-1 rounded-[22px] active:opacity-80 items-center justify-center"
                  style={{
                    minHeight: 48,
                    backgroundColor: hasVariants ? '#111111' : 'transparent',
                    shadowColor: hasVariants ? '#000000' : 'transparent',
                    shadowOpacity: hasVariants ? 0.12 : 0,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: hasVariants ? 3 : 0,
                  }}
                >
                  <Text
                    style={{
                      color: hasVariants ? '#FFFFFF' : colors.text.primary,
                      fontSize: 15,
                      fontWeight: '500',
                      textAlign: 'center',
                    }}
                  >
                    Variable Product
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="mt-4">
            <View className={cn('rounded-2xl p-4 border', cardClass)}>
              <View className="mb-4">
                <Text className={cn(sectionTitleClass, textPrimaryClass)}>Core Details</Text>
                <Text className={cn('text-xs mt-1', textMutedClass)}>
                  {hasVariants ? 'Shared details for the product before you build variations.' : 'Main product details.'}
                </Text>
              </View>

              {imagePicker.error && (
                <View className="mb-2 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                  <Text className="text-red-500 text-sm text-center">{imagePicker.error}</Text>
                </View>
              )}

              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>
                  Product Image{hasVariants ? '' : ' *'}
                </Text>
                {productImageUrl ? (
                  <View className="flex-row items-start">
                    <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                      <Image source={{ uri: productImageUrl }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Pressable
                        onPress={handlePickImage}
                        disabled={imagePicker.isLoading}
                        className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                        style={{ backgroundColor: colors.bg.secondary, opacity: imagePicker.isLoading ? 0.5 : 1 }}
                      >
                        <Camera size={16} color={colors.text.primary} strokeWidth={2} />
                        <Text style={{ color: colors.text.primary }} className="text-xs font-medium ml-2">Change</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleRemoveImage}
                        className="flex-row items-center px-3 py-2 rounded-lg active:opacity-70"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                      >
                        <Trash2 size={16} color="#EF4444" strokeWidth={2} />
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
                        <View className="w-12 h-12 rounded-full items-center justify-center mb-2" style={{ backgroundColor: colors.bg.card }}>
                          <Text style={{ color: colors.text.muted }} className="text-xs">...</Text>
                        </View>
                        <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">Opening...</Text>
                      </>
                    ) : (
                      <>
                        <View className="w-12 h-12 rounded-full items-center justify-center mb-2" style={{ backgroundColor: colors.bg.card }}>
                          <ImageIcon size={24} color={colors.text.muted} strokeWidth={1.5} />
                        </View>
                        <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">
                          {hasVariants ? 'Add Main Product Image' : 'Add Product Image'}
                        </Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                          {hasVariants ? 'Optional shared image for the product' : 'Optional'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Product Name *</Text>
                <View className={cn('rounded-xl px-4 border', cardClass)} style={{ height: 52, justifyContent: 'center' }}>
                  <TextInput
                    placeholder="e.g. Classic Aviator Sunglasses"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                    className={cn('text-sm', textPrimaryClass)}
                    selectionColor="#111111"
                  />
                </View>
              </View>

              {!hasVariants && primaryVariant ? (
                <View className="mb-4 flex-row" style={{ gap: 12 }}>
                  <View className="flex-1">
                    <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Stock Qty *</Text>
                    <View className={cn('flex-row items-center rounded-xl px-4 border', cardClass)} style={{ height: 52 }}>
                      <View style={{ width: 18, alignItems: 'center' }}>
                        <Hash size={14} color="#9CA3AF" strokeWidth={2} />
                      </View>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        value={primaryVariant.stock}
                        onChangeText={(text) => handleUpdateVariant(0, { stock: text })}
                        keyboardType="number-pad"
                        className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                        selectionColor="#111111"
                      />
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Price Amount *</Text>
                    <View className={cn('flex-row items-center rounded-xl px-4 border', cardClass)} style={{ height: 52 }}>
                      <View style={{ width: 18, alignItems: 'center' }}>
                        <Text className="text-gray-500 text-sm">₦</Text>
                      </View>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        value={primaryVariant.sellingPrice}
                        onChangeText={(text) => handleUpdateVariant(0, { sellingPrice: text })}
                        keyboardType="decimal-pad"
                        className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                        selectionColor="#111111"
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <View className="mb-4" style={{ zIndex: 20 }}>
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Category</Text>
                {categories.length > 0 && (
                  <View className="flex-row flex-wrap mb-2" style={{ gap: 8 }}>
                    {categories.map((cat) => (
                    <View key={cat} className="flex-row items-center px-3 py-1.5 rounded-lg" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                      <Text style={{ color: colors.text.primary }} className="text-xs font-medium mr-1">{cat}</Text>
                      <Pressable onPress={() => handleRemoveCategory(cat)}>
                          <X size={12} color={colors.text.muted} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ))}
                  </View>
                )}
                <View style={{ zIndex: 10 }}>
                  <Pressable
                    onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="rounded-xl px-4 flex-row items-center"
                    style={{ height: 52, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <TextInput
                      placeholder="Search or add category"
                      placeholderTextColor={colors.text.muted}
                      value={categoryInput}
                      onChangeText={(text) => {
                        setCategoryInput(text);
                        setShowCategoryDropdown(true);
                      }}
                      onFocus={() => setShowCategoryDropdown(true)}
                      onSubmitEditing={handleAddNewCategory}
                      style={{ color: colors.text.primary, fontSize: 14, flex: 1 }}
                      selectionColor={colors.text.primary}
                    />
                    <ChevronDown size={18} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                  {showCategoryDropdown && (
                    <View className="rounded-xl mt-2 overflow-hidden absolute left-0 right-0 top-14" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxHeight: 200, zIndex: 30 }}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {filteredCategories.map((cat) => (
                          <Pressable
                            key={cat}
                            onPress={() => handleSelectCategory(cat)}
                            className="px-4 py-3 active:opacity-70"
                            style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.secondary }} className="text-sm">{cat}</Text>
                          </Pressable>
                        ))}
                        {categoryInput.trim() && !globalCategories.includes(categoryInput.trim()) && (
                          <Pressable
                            onPress={handleAddNewCategory}
                            className="px-4 py-3 flex-row items-center active:opacity-70"
                            style={{ backgroundColor: colors.bg.secondary }}
                          >
                            <Plus size={16} color="#10B981" strokeWidth={2} />
                            <Text className="text-emerald-500 text-sm ml-2">Add "{categoryInput.trim()}"</Text>
                          </Pressable>
                        )}
                        {filteredCategories.length === 0 && !categoryInput.trim() && (
                          <View className="px-4 py-3">
                            <Text style={{ color: colors.text.muted }} className="text-sm">No categories. Type to add new.</Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Description</Text>
                <View className={cn('rounded-xl px-4 py-3 border', cardClass)}>
                  <TextInput
                    placeholder="Product description..."
                    placeholderTextColor="#9CA3AF"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    className={cn('text-sm', textPrimaryClass)}
                    style={{ minHeight: 70 }}
                    selectionColor="#111111"
                  />
                </View>
              </View>

              {hasVariants ? (
                <View className="mb-4 border-t pt-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1 pr-3">
                      <Text className={cn(sectionTitleClass, textPrimaryClass)}>Global Stock</Text>
                      <Text className="text-gray-500 text-xs">Set one stock value for all variants.</Text>
                    </View>
                    <Switch
                      value={useGlobalStock}
                      onValueChange={handleGlobalStockToggle}
                      trackColor={{ false: '#767577', true: '#111111' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {useGlobalStock ? (
                    <View>
                      <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Stock Qty (All Variants)</Text>
                      <View className={cn('flex-row items-center rounded-xl px-4 border', cardClass)} style={{ height: 52 }}>
                        <View style={{ width: 18, alignItems: 'center' }}>
                          <Hash size={14} color="#9CA3AF" strokeWidth={2} />
                        </View>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                          value={globalStock}
                          onChangeText={setGlobalStock}
                          keyboardType="number-pad"
                          className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                          selectionColor="#111111"
                        />
                      </View>
                    </View>
                  ) : (
                    <Text className={cn('text-xs mt-2', textMutedClass)}>
                      Individual variant stock will be entered inside each variant card below.
                    </Text>
                  )}
                </View>
              ) : null}

              {hasVariants ? (
                <View className="mb-4 border-t pt-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1 pr-3">
                      <Text className={cn(sectionTitleClass, textPrimaryClass)}>Global Pricing</Text>
                      <Text className="text-gray-500 text-xs">Set one price for all variants or price each variant separately.</Text>
                    </View>
                    <Switch
                      value={useGlobalPrice}
                      onValueChange={handleGlobalPriceToggle}
                      trackColor={{ false: '#767577', true: '#111111' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {useGlobalPrice ? (
                    <View>
                      <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Sale Price (All Variants)</Text>
                      <View className={cn('flex-row items-center rounded-xl px-4 border', cardClass)} style={{ height: 52 }}>
                        <View style={{ width: 18, alignItems: 'center' }}>
                          <Text className="text-gray-500 text-sm">₦</Text>
                        </View>
                        <TextInput
                          placeholder="Enter price for all variants"
                          placeholderTextColor="#9CA3AF"
                          value={globalPrice}
                          onChangeText={setGlobalPrice}
                          keyboardType="decimal-pad"
                          className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                          selectionColor="#111111"
                        />
                      </View>
                    </View>
                  ) : (
                    <Text className={cn('text-xs mt-2', textMutedClass)}>
                      Individual variant prices will be entered inside each variant card below.
                    </Text>
                  )}
                </View>
              ) : null}

              <View className={cn(hasVariants ? 'border-t pt-4' : '', 'mb-3')} style={hasVariants ? { borderTopColor: colors.border.light, borderTopWidth: 1 } : undefined}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className={cn(sectionTitleClass, textPrimaryClass)}>Mark as New Design</Text>
                    <Text className="text-gray-500 text-xs">Track this for yearly reviews</Text>
                  </View>
                  <Switch
                    value={isNewDesign}
                    onValueChange={setIsNewDesign}
                    trackColor={{ false: '#767577', true: '#111111' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {isNewDesign && (
                  <View className="mt-3">
                    <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Design Year</Text>
                    <View className="rounded-xl px-4 flex-row items-center" style={{ height: 52, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                      <TextInput
                        placeholder={new Date().getFullYear().toString()}
                        placeholderTextColor={colors.text.muted}
                        value={designYear}
                        onChangeText={setDesignYear}
                        keyboardType="number-pad"
                        maxLength={4}
                        style={{ color: colors.text.primary, fontSize: 14, flex: 1 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>

          {hasVariants ? (
            <>
              <View className="mt-4" style={{ position: 'relative', zIndex: 10 }}>
                <View className={cn('rounded-2xl p-4 border mb-4', cardClass)} style={{ zIndex: 20 }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1 pr-3">
                      <Text className={cn(sectionTitleClass, textPrimaryClass)}>Variants</Text>
                    </View>
                    <Pressable
                      onPress={handleAddVariant}
                      disabled={activeVariables.length === 0}
                      className="flex-row items-center px-3 rounded-full active:opacity-80"
                      style={{
                        opacity: activeVariables.length === 0 ? 0.4 : 1,
                        backgroundColor: colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        height: 34,
                      }}
                    >
                      <Plus size={14} color={colors.text.primary} strokeWidth={2.2} />
                      <Text
                        style={{ color: colors.text.primary }}
                        className="text-xs font-semibold ml-1.5"
                      >
                        Add Variation
                      </Text>
                    </Pressable>
                  </View>
                  <Text className={cn('text-sm mb-4', textMutedClass)}>
                    Choose active variation types first, then add each product variation below.
                  </Text>

                  <View
                    style={{
                      flexDirection: useSideBySideVariantSelector ? 'row' : 'column',
                      alignItems: useSideBySideVariantSelector ? 'flex-start' : 'stretch',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: useSideBySideVariantSelector ? 0.5 : undefined, width: useSideBySideVariantSelector ? '50%' : '100%', zIndex: 10 }}>
                      <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Active Variations *</Text>
                      <Pressable
                        onPress={() => setShowActiveVariableSelector((prev) => !prev)}
                        className="rounded-xl px-4 flex-row items-center justify-between active:opacity-80"
                        style={{ height: 52, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Text
                          style={{ color: activeVariables.length > 0 ? colors.text.primary : colors.text.muted }}
                          className="text-sm font-medium flex-1 pr-3"
                          numberOfLines={1}
                        >
                          {activeVariables.length > 0
                            ? activeVariables.map((variable) => variable.name).join(', ')
                            : 'Choose variation types'}
                        </Text>
                        <ChevronDown size={18} color={colors.text.muted} strokeWidth={2} />
                      </Pressable>

                      {showActiveVariableSelector && (
                        <View
                          className="rounded-xl mt-2 overflow-hidden absolute left-0 right-0 top-[74px]"
                          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxHeight: 260, zIndex: 30 }}
                        >
                          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {productVariables.map((variable) => {
                              const isSelected = activeVariableIds.includes(variable.id);
                              return (
                                <Pressable
                                  key={variable.id}
                                  onPress={() => handleToggleActiveVariable(variable.id)}
                                  className="px-4 py-3 flex-row items-center justify-between active:opacity-70"
                                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                                >
                                  <View className="flex-1 pr-3">
                                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                                      {variable.name}
                                    </Text>
                                    <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                                      {variable.values.length} option{variable.values.length === 1 ? '' : 's'}
                                    </Text>
                                  </View>
                                  {isSelected ? (
                                    <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: '#111111' }}>
                                      <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                                    </View>
                                  ) : (
                                    <View className="w-6 h-6 rounded-full" style={{ borderWidth: 1, borderColor: colors.border.light }} />
                                  )}
                                </Pressable>
                              );
                            })}
                            {productVariables.length === 0 ? (
                              <View className="px-4 py-3">
                                <Text style={{ color: colors.text.muted }} className="text-sm">
                                  No variation types yet.
                                </Text>
                              </View>
                            ) : null}
                            <Pressable
                              onPress={() => setShowActiveVariableSelector(false)}
                              className="px-4 py-3 items-center active:opacity-70"
                              style={{ backgroundColor: colors.bg.secondary }}
                            >
                              <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Done</Text>
                            </Pressable>
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: useSideBySideVariantSelector ? 0.5 : undefined, width: useSideBySideVariantSelector ? '50%' : '100%' }}>
                      <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Selected</Text>
                      <View
                        className="rounded-xl px-3 py-3"
                        style={{
                          minHeight: 52,
                          backgroundColor: colors.bg.card,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          justifyContent: 'center',
                        }}
                      >
                        {activeVariables.length > 0 ? (
                          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            {activeVariables.map((variable) => (
                              <View
                                key={variable.id}
                                className="px-3 py-1.5 rounded-xl"
                                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                              >
                                <Text className={cn('text-xs font-semibold', textPrimaryClass)}>{variable.name}</Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text className={cn('text-sm', textMutedClass)}>No variations selected yet.</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>

                {variantImageError && (
                  <View className="mb-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                    <Text className="text-red-500 text-sm text-center">{variantImageError}</Text>
                  </View>
                )}

                {variants.map((variant, index) => (
                  <View
                    key={variant.id}
                    className="mb-3"
                    style={{
                      position: 'relative',
                      zIndex: showVariantSelector?.variantIndex === index ? 50 : 1,
                    }}
                  >
                    <View className={cn('rounded-2xl p-4 border', softSurfaceClass)}>
                      <View className="flex-row items-center justify-between mb-4">
                        <View>
                          <Text className={cn('font-semibold', textPrimaryClass)}>
                            {`Variant ${index + 1}`}
                          </Text>
                          <Text className={cn('text-xs mt-1', textMutedClass)}>
                            Set the image, values, stock, and price for this variation.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleRemoveVariant(index)}
                          className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                      </View>

                      <View className="mb-3">
                        <Text className={cn(fieldLabelClass, 'mb-2')} style={{ color: colors.text.secondary }}>Variant Image *</Text>
                        {variant.imageUrl ? (
                          <View className="flex-row items-start">
                            <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                              <Image source={{ uri: variant.imageUrl }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                            </View>
                            <View className="ml-3 flex-1">
                              <Pressable
                                onPress={() => handlePickVariantImage(variant.id, index)}
                                disabled={variantImageLoading === variant.id}
                                className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                                style={{ backgroundColor: colors.bg.secondary, opacity: variantImageLoading === variant.id ? 0.5 : 1 }}
                              >
                                <Camera size={14} color={colors.text.primary} strokeWidth={2} />
                                <Text style={{ color: colors.text.primary }} className="text-xs font-medium ml-2">
                                  {variantImageLoading === variant.id ? 'Loading...' : 'Change'}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleRemoveVariantImage(index)}
                                className="flex-row items-center px-3 py-2 rounded-lg active:opacity-70"
                                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                              >
                                <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                                <Text className="text-red-500 text-xs font-medium ml-2">Remove</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handlePickVariantImage(variant.id, index)}
                            disabled={variantImageLoading === variant.id}
                            className="rounded-xl p-3 items-center active:opacity-70"
                            style={{
                              backgroundColor: colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: '#EF4444',
                              borderStyle: 'dashed',
                              opacity: variantImageLoading === variant.id ? 0.5 : 1,
                            }}
                          >
                            {variantImageLoading === variant.id ? (
                              <Text style={{ color: colors.text.muted }} className="text-sm">Opening...</Text>
                            ) : (
                              <>
                                <View className="w-10 h-10 rounded-full items-center justify-center mb-1" style={{ backgroundColor: colors.bg.card }}>
                                  <ImageIcon size={20} color="#EF4444" strokeWidth={1.5} />
                                </View>
                                <Text style={{ color: '#EF4444' }} className="text-sm font-medium">Add Variant Image</Text>
                                <Text style={{ color: colors.text.muted }} className="text-[10px] mt-0.5">Optional</Text>
                              </>
                            )}
                          </Pressable>
                        )}
                      </View>

                      {activeVariables.map((variable) => {
                        const selectedValue = variant.variableValues[variable.name];
                        const isSelectorOpen = showVariantSelector?.variantIndex === index && showVariantSelector?.variableId === variable.id;
                        const filteredValues = variantSearchQuery.trim()
                          ? variable.values.filter((value) => value.toLowerCase().includes(variantSearchQuery.toLowerCase()))
                          : variable.values;
                        return (
                          <View
                            key={variable.id}
                            className="mb-3"
                            style={{ zIndex: isSelectorOpen ? 20 : 5 }}
                          >
                            <Text className={cn(fieldLabelClass, 'mb-2')} style={{ color: colors.text.secondary }}>{variable.name}</Text>
                            <Pressable
                              onPress={() => {
                                Keyboard.dismiss();
                                if (isSelectorOpen) {
                                  setShowVariantSelector(null);
                                  setVariantSearchQuery('');
                                } else {
                                  setShowVariantSelector({ variantIndex: index, variableId: variable.id });
                                  setVariantSearchQuery('');
                                }
                              }}
                              className="rounded-xl px-4 flex-row items-center justify-between"
                              style={{ height: 52, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                            >
                              <View className="flex-row items-center flex-1">
                                {selectedValue ? <Check size={16} color={colors.text.primary} strokeWidth={2.5} style={{ marginRight: 8 }} /> : null}
                                <Text style={{ color: selectedValue ? colors.text.primary : colors.text.muted }} className="text-sm font-medium">
                                  {selectedValue || `Select ${variable.name}`}
                                </Text>
                              </View>
                              <ChevronDown size={18} color={colors.text.muted} strokeWidth={2} />
                            </Pressable>
                            {isSelectorOpen ? (
                              <View
                                className="rounded-xl overflow-hidden absolute left-0 right-0 top-[74px]"
                                style={{
                                  backgroundColor: colors.bg.card,
                                  borderWidth: 1,
                                  borderColor: colors.border.light,
                                  zIndex: 40,
                                  maxHeight: 280,
                                  shadowColor: '#000000',
                                  shadowOpacity: 0.12,
                                  shadowRadius: 12,
                                  shadowOffset: { width: 0, height: 6 },
                                  elevation: 10,
                                }}
                              >
                                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                                  <View
                                    className="flex-row items-center rounded-xl px-4"
                                    style={{ height: 48, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                                  >
                                    <Search size={16} color={colors.text.muted} strokeWidth={2} />
                                    <TextInput
                                      placeholder={`Search ${variable.name}...`}
                                      placeholderTextColor={colors.text.muted}
                                      value={variantSearchQuery}
                                      onChangeText={setVariantSearchQuery}
                                      style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
                                      selectionColor={colors.text.primary}
                                    />
                                  </View>
                                </View>

                                <ScrollView
                                  nestedScrollEnabled
                                  style={{ maxHeight: 220 }}
                                  showsVerticalScrollIndicator={false}
                                  keyboardShouldPersistTaps="handled"
                                >
                                  {filteredValues.map((value) => {
                                    const isSelected = selectedValue === value;
                                    return (
                                      <Pressable
                                        key={value}
                                        onPress={() => handleSelectVariantValue(index, variable.name, value)}
                                        className="px-4 py-3 flex-row items-center justify-between active:opacity-70"
                                        style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                                      >
                                        <Text style={{ color: colors.text.primary }} className={cn('text-sm', isSelected && 'font-semibold')}>
                                          {value}
                                        </Text>
                                        {isSelected ? (
                                          <Check size={18} color={colors.text.primary} strokeWidth={2.5} />
                                        ) : null}
                                      </Pressable>
                                    );
                                  })}
                                  {filteredValues.length === 0 ? (
                                    <View className="px-4 py-6 items-center">
                                      <Text className={cn('text-sm', textMutedClass)}>No values found</Text>
                                    </View>
                                  ) : null}
                                  {variantSearchQuery.trim() && !variable.values.includes(variantSearchQuery.trim()) ? (
                                    <Pressable
                                      onPress={() => {
                                        updateProductVariable(variable.id, {
                                          values: [...variable.values, variantSearchQuery.trim()],
                                        });
                                        handleSelectVariantValue(index, variable.name, variantSearchQuery.trim());
                                      }}
                                      className="px-4 py-3 flex-row items-center active:opacity-70"
                                      style={{ backgroundColor: colors.bg.secondary }}
                                    >
                                      <Plus size={16} color="#10B981" strokeWidth={2} />
                                      <Text className="text-emerald-500 text-sm ml-2">Add "{variantSearchQuery.trim()}"</Text>
                                    </Pressable>
                                  ) : null}
                                </ScrollView>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}

                      <View className="flex-row gap-3 mt-1">
                        <View className={useGlobalPrice && !useGlobalStock ? 'flex-[0.5]' : 'flex-1'}>
                          <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Stock</Text>
                          {!useGlobalStock ? (
                            <View className={cn('flex-row items-center rounded-xl px-4 border', softSurfaceClass)} style={{ height: 52 }}>
                              <View style={{ width: 18, alignItems: 'center' }}>
                                <Hash size={14} color="#9CA3AF" strokeWidth={2} />
                              </View>
                              <TextInput
                                placeholder="0"
                                placeholderTextColor="#9CA3AF"
                                value={variant.stock}
                                onChangeText={(text) => handleUpdateVariant(index, { stock: text })}
                                keyboardType="number-pad"
                                className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                                selectionColor="#111111"
                              />
                            </View>
                          ) : (
                            <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.bg.secondary }}>
                              <Text className={cn('text-xs', textMutedClass)}>
                                Stock uses global value{globalStock ? ` (${globalStock} units)` : ''}.
                              </Text>
                            </View>
                          )}
                        </View>
                        {!useGlobalPrice ? (
                          <View className={useGlobalStock ? 'flex-1' : 'flex-[0.5]'}>
                            <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Sale Price</Text>
                            <View className={cn('flex-row items-center rounded-xl px-4 border', softSurfaceClass)} style={{ height: 52 }}>
                              <View style={{ width: 18, alignItems: 'center' }}>
                                <Text className="text-gray-500 text-sm">₦</Text>
                              </View>
                              <TextInput
                                placeholder="0"
                                placeholderTextColor="#9CA3AF"
                                value={variant.sellingPrice}
                                onChangeText={(text) => handleUpdateVariant(index, { sellingPrice: text })}
                                keyboardType="decimal-pad"
                                className={cn('flex-1 text-sm ml-3', textPrimaryClass)}
                                selectionColor="#111111"
                              />
                            </View>
                          </View>
                        ) : (
                          <View className={useGlobalStock ? 'flex-1' : 'flex-[0.5]'}>
                            <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Sale Price</Text>
                            <View className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.bg.secondary }}>
                              <Text className={cn('text-xs', textMutedClass)}>
                                Price uses global value{globalPrice ? ` (${formatCurrency(parseFloat(globalPrice) || 0)})` : ''}.
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View className="mb-8 mt-2">
                <View className={cn('rounded-2xl p-4 border', cardClass)} style={{ position: 'relative', zIndex: 0 }}>
                  <Text className={cn(sectionTitleClass, textPrimaryClass, 'mb-3')}>Summary</Text>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-gray-600 text-sm">Total Variants</Text>
                    <Text className={cn('font-semibold', textPrimaryClass)}>{variants.length}</Text>
                  </View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-gray-600 text-sm">Active Variation Types</Text>
                    <Text className={cn('font-semibold', textPrimaryClass)}>{activeVariables.length}</Text>
                  </View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-gray-600 text-sm">Total Starting Stock</Text>
                    <Text className={cn('font-semibold', textPrimaryClass)}>
                      {useGlobalStock
                        ? `${(parseInt(globalStock, 10) || 0) * variants.length} units`
                        : `${variants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0)} units`
                      }
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-gray-600 text-sm">Estimated Value</Text>
                    <Text className={cn('font-bold', textPrimaryClass)}>
                      {formatCurrency(variants.reduce((sum, v) => {
                        const stock = useGlobalStock ? (parseInt(globalStock, 10) || 0) : (parseInt(v.stock, 10) || 0);
                        const price = useGlobalPrice ? (parseFloat(globalPrice) || 0) : (parseFloat(v.sellingPrice) || 0);
                        return sum + (stock * price);
                      }, 0))}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <View className="mb-8 mt-4">
              <View className={cn('rounded-2xl p-4 border', cardClass)}>
                <Text className={cn(sectionTitleClass, textPrimaryClass, 'mb-3')}>Quick Summary</Text>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-600 text-sm">Starting Stock</Text>
                  <Text className={cn('font-semibold', textPrimaryClass)}>
                    {parseInt(primaryVariant?.stock || '0', 10) || 0} units
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-600 text-sm">Price</Text>
                  <Text className={cn('font-bold', textPrimaryClass)}>
                    {formatCurrency(parseFloat(primaryVariant?.sellingPrice || '0') || 0)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View className="h-32" />
        </KeyboardAwareScrollView>

        {/* Image Picker Modal */}
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
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <View className="p-5">
                <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
                <Text className={cn('text-lg font-bold mb-4', textPrimaryClass)}>Add Product Image</Text>

                <Pressable
                  onPress={handlePickImage}
                  className="flex-row items-center p-4 rounded-xl mb-3 active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#111111' }}>
                    <ImageIcon size={20} color="#FFFFFF" strokeWidth={2} />
                  </View>
                  <View>
                    <Text className={cn('font-semibold', textPrimaryClass)}>Choose Image</Text>
                    <Text className="text-gray-500 text-xs">Select from your device</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setShowImagePicker(false)}
                  className="p-4 rounded-xl items-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Text className="text-gray-600 font-semibold">Cancel</Text>
                </Pressable>
              </View>
              <View className="h-8" />
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
      </View>

      {/* Sticky Bottom CTA */}
      <StickyButtonContainer bottomInset={insets.bottom}>
        <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center' }}>
          <Button
            onPress={handleSubmit}
            disabled={!isValid}
            loading={isSubmitting}
            loadingText="Creating..."
          >
            {hasVariants ? 'Create Product' : 'Create Single Product'}
          </Button>
        </View>
      </StickyButtonContainer>

      {/* Success Toast */}
      {showSuccessToast && (
        <View
          className="absolute left-5 right-5 items-center"
          style={{ top: insets.top + 60 }}
        >
          <View
            className="flex-row items-center px-5 py-4 rounded-xl"
            style={{ backgroundColor: '#111111' }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.bg.card }}>
              <Check size={18} color="#111111" strokeWidth={2.5} />
            </View>
            <Text className="text-white font-semibold text-sm">
              Product created successfully!
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
