import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, Plus, X, Tag, Check, Edit2, Trash2, List, TrendingUp, Camera, Image as ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, {
  ServiceField,
  ServiceFieldType,
  ServiceVariable,
  ServiceVariableOption,
  ServiceVariableType,
  formatCurrency,
} from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { normalizeProductType } from '@/lib/product-utils';
import useAuthStore from '@/lib/state/auth-store';
import { useImagePicker } from '@/hooks/useImagePicker';
import { prepareProductMediaForPersistence } from '@/lib/product-media';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';

const VARIABLE_TYPES: ServiceVariableType[] = ['Select', 'Number', 'Toggle', 'Text'];
const FIELD_TYPES: ServiceFieldType[] = ['Text', 'Date', 'Time', 'Number', 'Price', 'Select'];
const CONTROL_HEIGHT = 50;

const normalizeVariableOption = (option: string | ServiceVariableOption): ServiceVariableOption => (
  typeof option === 'string'
    ? { value: option }
    : { value: option.value, amount: option.amount }
);

const formatOptionAmount = (amount?: number) => (
  typeof amount === 'number' && Number.isFinite(amount) ? ` (+${formatCurrency(amount)})` : ''
);

export default function ServiceDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { isMobile, isDesktop, width } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const isMobileWeb = Platform.OS === 'web' && isMobile;
  const isTabletSizedWebPanel = isWebDesktop && width < 1366;
  const horizontalInset = isMobile ? 18 : 28;
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const deleteProduct = useFyllStore((s) => s.deleteProduct);

  const service = useMemo(
    () => products.find((product) => product.id === id),
    [products, id]
  );
  const serviceId = service?.id ?? '';
  const serviceDiscontinuedAt = service?.discontinuedAt;

  const isService = normalizeProductType(service?.productType) === 'service';

  const imagePicker = useImagePicker();
  const [serviceImageUrl, setServiceImageUrl] = useState<string | null>(service?.imageUrl ?? null);
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(String(service?.variants?.[0]?.sellingPrice ?? ''));
  const [serviceUsesGlobalPricing, setServiceUsesGlobalPricing] = useState(service?.serviceUsesGlobalPricing ?? true);
  const [tags, setTags] = useState<string[]>(service?.serviceTags ?? []);
  const [newTag, setNewTag] = useState('');
  const [variables, setVariables] = useState<ServiceVariable[]>(service?.serviceVariables ?? []);
  const [fields, setFields] = useState<ServiceField[]>(service?.serviceFields ?? []);
  const [variableOptionInputs, setVariableOptionInputs] = useState<Record<string, { value: string; amount: string }>>({});
  const [fieldOptionInputs, setFieldOptionInputs] = useState<Record<string, { value: string; amount: string }>>({});
  const [openVariableTypeId, setOpenVariableTypeId] = useState<string | null>(null);
  const [openFieldTypeId, setOpenFieldTypeId] = useState<string | null>(null);
  const [serviceActive, setServiceActive] = useState(!(service?.isDiscontinued ?? false));
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalServices = useMemo(
    () => products.filter((product) => normalizeProductType(product.productType) === 'service').length,
    [products]
  );

  const serviceStats = useMemo(() => {
    const optionCounts = new Map<string, number>();
    let totalBookings = 0;
    let totalRevenue = 0;

    orders.forEach((order) => {
      const status = (order.status ?? '').toLowerCase();
      if (status.includes('cancel') || status.includes('refund')) return;

      (order.services ?? []).forEach((serviceLine) => {
        if (serviceLine.serviceId !== serviceId) return;
        totalBookings += 1;
        totalRevenue += Number(serviceLine.price) || 0;
      });

      (order.items ?? []).forEach((item) => {
        if (item.serviceId !== serviceId) return;
        const quantity = item.quantity > 0 ? item.quantity : 1;
        totalBookings += quantity;
        totalRevenue += (Number(item.unitPrice) || 0) * quantity;
        (item.serviceVariables ?? []).forEach((variable) => {
          const optionValue = variable.value?.trim();
          if (!optionValue) return;
          optionCounts.set(optionValue, (optionCounts.get(optionValue) ?? 0) + quantity);
        });
      });
    });

    const topOptions = Array.from(optionCounts.entries())
      .map(([option, count]) => ({ option, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 2);

    return { totalBookings, totalRevenue, topOptions };
  }, [orders, serviceId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setServiceActive(!(service?.isDiscontinued ?? false));
  }, [service?.isDiscontinued]);

  if (!service || !isService) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.tertiary }} className="text-lg">Service not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-50">
          <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleAddTag = () => {
    const value = newTag.trim();
    if (!value || tags.includes(value)) return;
    setTags((prev) => [...prev, value]);
    setNewTag('');
  };

  const handleRemoveTag = (value: string) => {
    setTags((prev) => prev.filter((tag) => tag !== value));
  };

  const handleAddVariable = () => {
    setVariables((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}`,
        name: '',
        type: 'Select',
        options: [],
        required: false,
        defaultValue: '',
      },
    ]);
  };

  const handleUpdateVariable = (idToUpdate: string, updates: Partial<ServiceVariable>) => {
    setVariables((prev) => prev.map((variable) => (
      variable.id === idToUpdate ? { ...variable, ...updates } : variable
    )));
  };

  const handleRemoveVariable = (idToRemove: string) => {
    setVariables((prev) => prev.filter((variable) => variable.id !== idToRemove));
  };

  const handleAddVariableOption = (idToUpdate: string) => {
    const draft = variableOptionInputs[idToUpdate] ?? { value: '', amount: '' };
    const value = draft.value.trim();
    if (!value) return;

    const parsedAmount = Number.parseFloat(draft.amount.trim());
    const amount = !serviceUsesGlobalPricing && Number.isFinite(parsedAmount) ? parsedAmount : undefined;

    setVariables((prev) => prev.map((variable) => (
      variable.id === idToUpdate
        ? {
          ...variable,
          options: [
            ...(variable.options ?? []).map(normalizeVariableOption),
            { value, amount },
          ],
        }
        : variable
    )));
    setVariableOptionInputs((prev) => ({ ...prev, [idToUpdate]: { value: '', amount: '' } }));
  };

  const handleRemoveVariableOption = (idToUpdate: string, optionValue: string) => {
    setVariables((prev) => prev.map((variable) => (
      variable.id === idToUpdate
        ? {
          ...variable,
          options: (variable.options ?? [])
            .map(normalizeVariableOption)
            .filter((item) => item.value !== optionValue),
        }
        : variable
    )));
  };

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `field-${Date.now()}`,
        label: '',
        type: 'Text',
        options: [],
        required: false,
        defaultValue: '',
      },
    ]);
  };

  const handleUpdateField = (idToUpdate: string, updates: Partial<ServiceField>) => {
    setFields((prev) => prev.map((field) => (
      field.id === idToUpdate ? { ...field, ...updates } : field
    )));
  };

  const handleRemoveField = (idToRemove: string) => {
    setFields((prev) => prev.filter((field) => field.id !== idToRemove));
  };

  const handleAddFieldOption = (idToUpdate: string) => {
    const draft = fieldOptionInputs[idToUpdate] ?? { value: '', amount: '' };
    const optionValue = draft.value.trim();
    if (!optionValue) return;
    const parsedAmount = Number.parseFloat(draft.amount.trim());
    const nextOption: ServiceVariableOption = {
      value: optionValue,
      amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
    };

    setFields((prev) => prev.map((field) => {
      if (field.id !== idToUpdate) return field;
      const existingOptions = (field.options ?? []).map(normalizeVariableOption);
      const nextOptions = [
        ...existingOptions.filter((option) => option.value !== optionValue),
        nextOption,
      ];
      return { ...field, options: nextOptions };
    }));
    setFieldOptionInputs((prev) => ({ ...prev, [idToUpdate]: { value: '', amount: '' } }));
  };

  const handleRemoveFieldOption = (idToUpdate: string, optionValue: string) => {
    setFields((prev) => prev.map((field) => {
      if (field.id !== idToUpdate) return field;
      const nextOptions = (field.options ?? [])
        .map(normalizeVariableOption)
        .filter((option) => option.value !== optionValue);
      const nextDefault = field.defaultValue === optionValue ? '' : field.defaultValue;
      return { ...field, options: nextOptions, defaultValue: nextDefault, value: nextDefault };
    }));
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const handleToggleServiceActive = async (nextActive: boolean) => {
    if (!serviceId) return;
    if (isStatusSaving) return;
    const previous = serviceActive;
    setServiceActive(nextActive);
    setIsStatusSaving(true);
    try {
      await updateProduct(serviceId, {
        isDiscontinued: !nextActive,
        discontinuedAt: nextActive ? undefined : (serviceDiscontinuedAt ?? new Date().toISOString()),
      }, businessId);
      showToast('success', nextActive ? 'Service marked active.' : 'Service marked inactive.');
    } catch (error) {
      console.warn('Service status update failed:', error);
      setServiceActive(previous);
      showToast('error', 'Could not update service status.');
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handlePickServiceImage = async () => {
    const uri = await imagePicker.pickImage();
    if (uri) setServiceImageUrl(uri);
  };

  const handleRemoveServiceImage = () => {
    setServiceImageUrl(null);
  };

  const handleSave = async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const nextPrice = serviceUsesGlobalPricing ? (Number.parseFloat(price) || 0) : 0;
    const nextCategories: string[] = [];
    const baseVariants = service.variants.length
      ? service.variants.map((variant, index) => (
        index === 0 ? { ...variant, sellingPrice: nextPrice } : variant
      ))
      : [{
        id: `${service.id}-1`,
        sku: `${service.name.substring(0, 3).toUpperCase()}-SRV`,
        barcode: Math.random().toString(36).slice(2, 12),
        variableValues: {},
        stock: 0,
        sellingPrice: nextPrice,
        imageUrl: serviceImageUrl ?? undefined,
      }];

    try {
      const preparedMedia = await prepareProductMediaForPersistence({
        businessId,
        productId: service.id,
        imageUrl: serviceImageUrl,
        variants: baseVariants,
      });

      await updateProduct(service.id, {
        name: name.trim(),
        description: description.trim(),
        categories: nextCategories,
        variants: preparedMedia.variants,
        imageUrl: preparedMedia.imageUrl,
        serviceUsesGlobalPricing,
        serviceTags: tags,
        serviceVariables: variables,
        serviceFields: fields,
      }, businessId);
      setServiceImageUrl(preparedMedia.imageUrl ?? null);
      showToast('success', businessId ? 'Service updated.' : 'Saved locally.');
    } catch (error) {
      console.warn('Service save failed:', error);
      showToast('error', 'Could not save. Please try again.');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Service',
      `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProduct(service.id, businessId);
            router.back();
          },
        },
      ]
    );
  };

  const rightRailWidth = isTabletSizedWebPanel ? 262 : 304;
  const rightRailGap = isTabletSizedWebPanel ? 10 : 14;
  const rightRailCardPadding = isTabletSizedWebPanel ? 14 : 18;
  const rightRailTitleSize = isTabletSizedWebPanel ? 9 : 11;
  const rightRailMutedSize = isTabletSizedWebPanel ? 9 : 10;
  const rightRailTitleLetterSpacing = isTabletSizedWebPanel ? 0.2 : 0.5;
  const rightRailMutedLetterSpacing = isTabletSizedWebPanel ? 0.2 : 0.5;
  const rightRailStatusSize = isTabletSizedWebPanel ? 9 : 11;
  const rightRailCountSize = isTabletSizedWebPanel ? 24 : 34;
  const rightRailCountLineHeight = isTabletSizedWebPanel ? 28 : 38;
  const rightRailRevenueSize = isTabletSizedWebPanel ? 21 : 30;
  const rightRailRevenueLineHeight = isTabletSizedWebPanel ? 25 : 34;
  const rightRailOptionLabelSize = isTabletSizedWebPanel ? 9 : 10;
  const rightRailOptionValueSize = isTabletSizedWebPanel ? 10 : 11;
  const rightRailIconWrapSize = isTabletSizedWebPanel ? 38 : 48;
  const rightRailIconSize = isTabletSizedWebPanel ? 14 : 18;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: isMobile ? colors.bg.secondary : colors.bg.primary }} edges={['top']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: horizontalInset,
          paddingTop: 24,
          paddingBottom: 40,
          width: '100%',
          maxWidth: isWebDesktop ? 1360 : 960,
          alignSelf: 'flex-start',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 12 }}>
            <Pressable
              onPress={() => {
                if (from === 'inventory') {
                  router.replace('/inventory');
                } else {
                  router.back();
                }
              }}
              className="active:opacity-70"
            >
              <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg" numberOfLines={1}>
                {service.name}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
                {service.serviceTags?.[0] ?? 'General'}
              </Text>
            </View>
          </View>
          {isMobile ? (
            <Pressable
              onPress={handleSave}
              className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Edit2 size={18} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
                className="flex-row items-center px-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, height: 40, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className="flex-row items-center px-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.text.primary, height: 40 }}
              >
                <Text style={{ color: colors.bg.primary }} className="font-semibold text-sm">Save</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: isWebDesktop ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: isWebDesktop ? 18 : 0,
          }}
        >
          <View style={{ flex: 1, width: '100%', minWidth: 0, maxWidth: isWebDesktop ? 980 : undefined }}>
        {/* Service Details */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, padding: 16 }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
            Service Details
          </Text>
          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ color: colors.text.muted }} className="text-xs font-semibold mb-1">Service Image</Text>
              {imagePicker.error ? (
                <View className="mb-2 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                  <Text className="text-red-500 text-sm text-center">{imagePicker.error}</Text>
                </View>
              ) : null}
              {serviceImageUrl ? (
                <View className="flex-row items-start">
                  <View className="rounded-xl overflow-hidden" style={{ width: 80, height: 80, borderWidth: 1, borderColor: colors.border.light }}>
                    <ResolvedAttachmentImage imageUrl={serviceImageUrl} style={{ width: 80, height: 80 }} resizeMode="cover" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Pressable
                      onPress={handlePickServiceImage}
                      disabled={imagePicker.isLoading}
                      className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                      style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, opacity: imagePicker.isLoading ? 0.5 : 1 }}
                    >
                      <Camera size={16} color={colors.text.primary} strokeWidth={2} />
                      <Text style={{ color: colors.text.primary }} className="text-xs font-medium ml-2">Change</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRemoveServiceImage}
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
                  onPress={handlePickServiceImage}
                  disabled={imagePicker.isLoading}
                  className="rounded-xl p-4 items-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, borderStyle: 'dashed', opacity: imagePicker.isLoading ? 0.5 : 1 }}
                >
                  <View className="w-12 h-12 rounded-full items-center justify-center mb-2" style={{ backgroundColor: colors.bg.card }}>
                    <ImageIcon size={24} color={colors.text.muted} strokeWidth={1.5} />
                  </View>
                  <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">
                    {imagePicker.isLoading ? 'Opening...' : 'Add Service Image'}
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">Optional thumbnail shown in your services list</Text>
                </Pressable>
              )}
            </View>
            <View>
              <Text style={{ color: colors.text.muted }} className="text-xs font-semibold mb-1">Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Service name"
                placeholderTextColor={colors.text.muted}
                style={{
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text.primary,
                }}
              />
            </View>
            <View>
              <Text style={{ color: colors.text.muted }} className="text-xs font-semibold mb-1">Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Service description"
                placeholderTextColor={colors.text.muted}
                multiline
                style={{
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text.primary,
                  minHeight: 90,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                backgroundColor: colors.bg.primary,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                  Global pricing
                </Text>
                <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                  One fixed service price for all variable selections.
                </Text>
              </View>
              <Switch value={serviceUsesGlobalPricing} onValueChange={setServiceUsesGlobalPricing} />
            </View>

            {serviceUsesGlobalPricing && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold mb-1">Price</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    placeholder="₦0"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      color: colors.text.primary,
                      height: CONTROL_HEIGHT,
                    }}
                  />
                </View>
              </View>
            )}
            {!serviceUsesGlobalPricing && (
              <Text style={{ color: colors.text.muted }} className="text-xs">
                Per-variable amounts will determine service price in new orders.
              </Text>
            )}
          </View>
        </View>

        {/* Tags */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, padding: 16, marginTop: 16 }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
            Tags
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <View
                key={tag}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <Tag size={12} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-2">
                  {tag}
                </Text>
                <Pressable onPress={() => handleRemoveTag(tag)} className="ml-2 active:opacity-70">
                  <X size={12} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={newTag}
                onChangeText={setNewTag}
                placeholder="Add tag"
                placeholderTextColor={colors.text.muted}
                style={{
                  backgroundColor: colors.bg.primary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  color: colors.text.primary,
                  minWidth: 120,
                }}
              />
              <Pressable
                onPress={handleAddTag}
                className="active:opacity-70"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.text.primary,
                }}
              >
                <Plus size={14} color={colors.bg.primary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Variables */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, padding: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
              Variables
            </Text>
            <Pressable
              onPress={handleAddVariable}
              className="flex-row items-center px-3 rounded-full active:opacity-80"
              style={{ backgroundColor: colors.bg.secondary, height: 32 }}
            >
              <Plus size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-1.5">
                Add Variable
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: 12 }}>
            {variables.map((variable) => {
              const normalizedOptions = (variable.options ?? []).map(normalizeVariableOption);
              const optionDraft = variableOptionInputs[variable.id] ?? { value: '', amount: '' };
              return (
                <View
                  key={variable.id}
                  style={{
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: colors.bg.secondary,
                  }}
                >
                  <View style={{ width: '100%', gap: 8 }}>
                    {isMobileWeb ? (
                      <>
                        <TextInput
                          value={variable.name}
                          onChangeText={(value) => handleUpdateVariable(variable.id, { name: value })}
                          placeholder="Variable name"
                          placeholderTextColor={colors.text.muted}
                          style={{
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.text.primary,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                        <Pressable
                          onPress={() => setOpenVariableTypeId((current) => (current === variable.id ? null : variable.id))}
                          className="active:opacity-80"
                          style={{
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            height: CONTROL_HEIGHT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold uppercase tracking-wide">
                            Type
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                              {variable.type}
                            </Text>
                            <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                          </View>
                        </Pressable>
                      </>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <TextInput
                            value={variable.name}
                            onChangeText={(value) => handleUpdateVariable(variable.id, { name: value })}
                            placeholder="Variable name"
                            placeholderTextColor={colors.text.muted}
                            style={{
                              backgroundColor: colors.bg.primary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              color: colors.text.primary,
                              height: CONTROL_HEIGHT,
                            }}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Pressable
                            onPress={() => setOpenVariableTypeId((current) => (current === variable.id ? null : variable.id))}
                            className="active:opacity-80"
                            style={{
                              backgroundColor: colors.bg.primary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              height: CONTROL_HEIGHT,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">
                              {variable.type}
                            </Text>
                            <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                          </Pressable>
                        </View>
                        <Pressable onPress={() => handleRemoveVariable(variable.id)} className="active:opacity-70" style={{ paddingHorizontal: 2 }}>
                          <X size={16} color={colors.text.tertiary} strokeWidth={2} />
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {openVariableTypeId === variable.id && (
                    <View
                      style={{
                        marginTop: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        backgroundColor: colors.bg.card,
                        overflow: 'hidden',
                      }}
                    >
                      {VARIABLE_TYPES.map((type, typeIndex) => (
                        <Pressable
                          key={type}
                          onPress={() => {
                            handleUpdateVariable(variable.id, { type });
                            setOpenVariableTypeId(null);
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderBottomWidth: typeIndex === VARIABLE_TYPES.length - 1 ? 0 : 1,
                            borderBottomColor: colors.border.light,
                            backgroundColor: variable.type === type ? colors.bg.primary : colors.bg.card,
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{type}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {variable.type === 'Select' && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: colors.text.muted }} className="text-xs font-medium mb-2">
                        Values
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {normalizedOptions.map((option) => (
                          <View
                            key={`${option.value}-${option.amount ?? 'na'}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: colors.bg.primary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, marginRight: 6 }}>
                              {option.value}{serviceUsesGlobalPricing ? '' : formatOptionAmount(option.amount)}
                            </Text>
                            <Pressable onPress={() => handleRemoveVariableOption(variable.id, option.value)} className="active:opacity-70">
                              <X size={12} color={colors.text.tertiary} strokeWidth={2} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                      <View
                        style={{
                          flexDirection: isMobile && !serviceUsesGlobalPricing ? 'column' : 'row',
                          alignItems: 'stretch',
                          gap: 8,
                          marginTop: 10,
                          width: '100%',
                        }}
                      >
                        <TextInput
                          value={optionDraft.value}
                          onChangeText={(value) => setVariableOptionInputs((prev) => ({
                            ...prev,
                            [variable.id]: { ...(prev[variable.id] ?? { value: '', amount: '' }), value },
                          }))}
                          onSubmitEditing={() => handleAddVariableOption(variable.id)}
                          placeholder="Value (e.g., Lekki)"
                          placeholderTextColor={colors.text.muted}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.text.primary,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                        {!serviceUsesGlobalPricing && (
                          <TextInput
                            value={optionDraft.amount}
                            onChangeText={(amount) => setVariableOptionInputs((prev) => ({
                              ...prev,
                              [variable.id]: { ...(prev[variable.id] ?? { value: '', amount: '' }), amount },
                            }))}
                            onSubmitEditing={() => handleAddVariableOption(variable.id)}
                            placeholder="Amount"
                            placeholderTextColor={colors.text.muted}
                            keyboardType="numeric"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              backgroundColor: colors.bg.primary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              color: colors.text.primary,
                              height: CONTROL_HEIGHT,
                            }}
                          />
                        )}
                      </View>
                    </View>
                  )}
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View
                      style={{
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        height: CONTROL_HEIGHT,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                        Required
                      </Text>
                      <Switch
                        value={Boolean(variable.required)}
                        onValueChange={(value) => handleUpdateVariable(variable.id, { required: value })}
                      />
                    </View>
                    <TextInput
                      value={variable.defaultValue ?? ''}
                      onChangeText={(value) => handleUpdateVariable(variable.id, { defaultValue: value })}
                      placeholder="Default value"
                      placeholderTextColor={colors.text.muted}
                      style={{
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        color: colors.text.primary,
                        height: CONTROL_HEIGHT,
                      }}
                    />
                  </View>
                  {isMobileWeb && (
                    <Pressable onPress={() => handleRemoveVariable(variable.id)} className="active:opacity-70" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Delete Variable</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {variables.length === 0 && (
              <Text style={{ color: colors.text.muted }} className="text-sm">
                No variables yet. Add one to capture service requirements.
              </Text>
            )}
          </View>
        </View>

        {/* Additional Fields */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, padding: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
              Additional Fields
            </Text>
            <Pressable
              onPress={handleAddField}
              className="flex-row items-center px-3 rounded-full active:opacity-80"
              style={{ backgroundColor: colors.bg.secondary, height: 32 }}
            >
              <Plus size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-1.5">
                Add Field
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: 12 }}>
            {fields.map((field) => {
              const normalizedFieldOptions = (field.options ?? []).map(normalizeVariableOption);
              const fieldOptionDraft = fieldOptionInputs[field.id] ?? { value: '', amount: '' };
              const fieldType = field.type ?? 'Text';
              return (
              <View
                key={field.id}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <View style={{ width: '100%', gap: 8 }}>
                  {isMobileWeb ? (
                    <>
                      <TextInput
                        value={field.label}
                        onChangeText={(value) => handleUpdateField(field.id, { label: value })}
                        placeholder="Field label (e.g., Test Date)"
                        placeholderTextColor={colors.text.muted}
                        style={{
                          backgroundColor: colors.bg.primary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          color: colors.text.primary,
                          height: CONTROL_HEIGHT,
                        }}
                      />
                      <Pressable
                        onPress={() => setOpenFieldTypeId((current) => (current === field.id ? null : field.id))}
                        className="active:opacity-80"
                        style={{
                          backgroundColor: colors.bg.primary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          height: CONTROL_HEIGHT,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold uppercase tracking-wide">
                          Field Type
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                            {fieldType}
                          </Text>
                          <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                        </View>
                      </Pressable>
                    </>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          value={field.label}
                          onChangeText={(value) => handleUpdateField(field.id, { label: value })}
                          placeholder="Field label (e.g., Test Date)"
                          placeholderTextColor={colors.text.muted}
                          style={{
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.text.primary,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Pressable
                          onPress={() => setOpenFieldTypeId((current) => (current === field.id ? null : field.id))}
                          className="active:opacity-80"
                          style={{
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            height: CONTROL_HEIGHT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">
                            {fieldType}
                          </Text>
                          <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                        </Pressable>
                      </View>
                      <Pressable onPress={() => handleRemoveField(field.id)} className="active:opacity-70" style={{ paddingHorizontal: 2 }}>
                        <X size={16} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  )}
                </View>

                {openFieldTypeId === field.id && (
                  <View
                    style={{
                      marginTop: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      overflow: 'hidden',
                    }}
                  >
                    {FIELD_TYPES.map((type, typeIndex) => (
                      <Pressable
                        key={type}
                        onPress={() => {
                          handleUpdateField(field.id, { type });
                          setOpenFieldTypeId(null);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderBottomWidth: typeIndex === FIELD_TYPES.length - 1 ? 0 : 1,
                          borderBottomColor: colors.border.light,
                          backgroundColor: fieldType === type ? colors.bg.primary : colors.bg.card,
                        }}
                      >
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{type}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {fieldType === 'Select' && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.text.muted }} className="text-xs font-medium mb-2">
                      Options
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {normalizedFieldOptions.map((option) => (
                        <View
                          key={`${field.id}-${option.value}-${option.amount ?? 'na'}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 12, marginRight: 6 }}>
                            {option.value}{formatOptionAmount(option.amount)}
                          </Text>
                          <Pressable onPress={() => handleRemoveFieldOption(field.id, option.value)} className="active:opacity-70">
                            <X size={12} color={colors.text.tertiary} strokeWidth={2} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                    <View style={{ marginTop: 12, width: '100%', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                      <TextInput
                        value={fieldOptionDraft.value}
                        onChangeText={(value) => setFieldOptionInputs((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] ?? { value: '', amount: '' }), value },
                        }))}
                        onSubmitEditing={() => handleAddFieldOption(field.id)}
                        placeholder="Add option value"
                        placeholderTextColor={colors.text.muted}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          backgroundColor: colors.bg.primary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          color: colors.text.primary,
                          height: CONTROL_HEIGHT,
                        }}
                      />
                      <TextInput
                        value={fieldOptionDraft.amount}
                        onChangeText={(amount) => setFieldOptionInputs((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] ?? { value: '', amount: '' }), amount },
                        }))}
                        onSubmitEditing={() => handleAddFieldOption(field.id)}
                        placeholder="Amount (optional)"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="numeric"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          backgroundColor: colors.bg.primary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          color: colors.text.primary,
                          height: CONTROL_HEIGHT,
                        }}
                      />
                    </View>
                  </View>
                )}

                <View style={{ marginTop: 10, gap: 10 }}>
                  <View
                    style={{
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: CONTROL_HEIGHT,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                      Required
                    </Text>
                    <Switch
                      value={Boolean(field.required)}
                      onValueChange={(value) => handleUpdateField(field.id, { required: value })}
                    />
                  </View>
                  <TextInput
                    value={field.defaultValue ?? field.value ?? ''}
                    onChangeText={(value) => handleUpdateField(field.id, { defaultValue: value, value })}
                    placeholder={
                      fieldType === 'Time'
                        ? 'Default value (HH:mm)'
                        : fieldType === 'Price'
                          ? 'Default price (optional)'
                          : 'Default value (optional)'
                    }
                    placeholderTextColor={colors.text.muted}
                    keyboardType={fieldType === 'Price' ? 'numeric' : 'default'}
                    style={{
                      backgroundColor: colors.bg.primary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      color: colors.text.primary,
                      height: CONTROL_HEIGHT,
                    }}
                  />
                </View>
                {isMobileWeb && (
                  <Pressable onPress={() => handleRemoveField(field.id)} className="active:opacity-70" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Delete Field</Text>
                  </Pressable>
                )}
              </View>
              );
            })}
            {fields.length === 0 && (
              <Text style={{ color: colors.text.muted }} className="text-sm">
                Add typed fields like Text, Number, Date, Time, Price, or Select for order-time capture.
              </Text>
            )}
          </View>
        </View>
        {isMobile && (
          <>
            <View style={{ marginTop: 16 }}>
              <Pressable
                onPress={() => handleToggleServiceActive(!serviceActive)}
                disabled={isStatusSaving}
                className="rounded-full p-4 items-center justify-center active:opacity-80"
                style={{
                  backgroundColor: serviceActive ? 'rgba(156, 163, 175, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                  opacity: isStatusSaving ? 0.65 : 1,
                }}
              >
                <Text
                  style={{
                    color: serviceActive ? '#9CA3AF' : '#10B981',
                    fontWeight: '700',
                    fontSize: 15,
                  }}
                >
                  {isStatusSaving
                    ? 'Saving...'
                    : serviceActive
                      ? 'Deactivate Service'
                      : 'Activate Service'}
                </Text>
              </Pressable>
            </View>
            <View style={{ marginTop: 16 }}>
              <Pressable
                onPress={handleSave}
                className="rounded-full p-4 items-center justify-center active:opacity-80"
                style={{ backgroundColor: colors.text.primary }}
              >
                <Text style={{ color: colors.bg.primary }} className="font-semibold text-base">Save Service</Text>
              </Pressable>
            </View>
            <View style={{ marginTop: 12 }}>
              <Pressable
                onPress={handleDelete}
                className="rounded-full p-4 flex-row items-center justify-center active:opacity-70"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
              >
                <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                <Text className="text-red-500 font-semibold ml-2">Delete Service</Text>
              </Pressable>
            </View>
          </>
        )}
          </View>

          {isWebDesktop && (
            <View style={{ width: rightRailWidth, alignSelf: 'stretch', gap: rightRailGap }}>
              <View
                style={{
                  backgroundColor: colors.bg.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  padding: rightRailCardPadding,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                      <Text style={{ color: colors.text.tertiary, fontSize: rightRailTitleSize, fontWeight: '700', letterSpacing: rightRailTitleLetterSpacing }}>
                        STATUS
                      </Text>
                    <View
                      style={{
                        marginTop: 10,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        alignSelf: 'flex-start',
                        backgroundColor: serviceActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.14)',
                      }}
                    >
                      <Text
                        style={{
                          color: serviceActive ? '#059669' : '#EF4444',
                          fontSize: rightRailStatusSize,
                          fontWeight: '700',
                        }}
                      >
                        {serviceActive ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={serviceActive}
                    onValueChange={handleToggleServiceActive}
                    disabled={isStatusSaving}
                  />
                </View>
              </View>

              <View
                style={{
                  backgroundColor: colors.bg.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  padding: rightRailCardPadding,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: rightRailTitleSize, fontWeight: '700', letterSpacing: rightRailTitleLetterSpacing }}>
                      TOTAL SERVICES
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: rightRailCountSize, lineHeight: rightRailCountLineHeight, fontWeight: '800', marginTop: 10 }}>
                      {totalServices}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: rightRailIconWrapSize,
                      height: rightRailIconWrapSize,
                      borderRadius: 14,
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <List size={rightRailIconSize} color="#F97316" strokeWidth={2.2} />
                  </View>
                </View>

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border.light,
                    marginTop: 14,
                    paddingTop: 14,
                    gap: 8,
                  }}
                >
                    <Text style={{ color: colors.text.tertiary, fontSize: rightRailMutedSize, fontWeight: '700', letterSpacing: rightRailMutedLetterSpacing }}>
                      MOST BOOKED OPTIONS:
                    </Text>
                  {serviceStats.topOptions.length > 0 ? (
                    serviceStats.topOptions.map((entry) => (
                      <View
                        key={entry.option}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Text style={{ color: colors.text.secondary, fontSize: rightRailOptionLabelSize, fontWeight: '600' }} numberOfLines={1}>
                          {entry.option}
                        </Text>
                        <Text style={{ color: colors.text.primary, fontSize: rightRailOptionValueSize, fontWeight: '700' }}>{entry.count}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: colors.text.muted, fontSize: rightRailMutedSize }}>
                      No booking options yet.
                    </Text>
                  )}
                </View>
              </View>

              <View
                style={{
                  backgroundColor: colors.bg.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  padding: rightRailCardPadding,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: rightRailTitleSize, fontWeight: '700', letterSpacing: rightRailTitleLetterSpacing }}>
                      REVENUE GENERATED
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: rightRailRevenueSize, lineHeight: rightRailRevenueLineHeight, fontWeight: '800', marginTop: 10 }}>
                      {formatCurrency(serviceStats.totalRevenue)}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: rightRailMutedSize, marginTop: 6 }}>
                      {serviceStats.totalBookings} booking{serviceStats.totalBookings === 1 ? '' : 's'} all time
                    </Text>
                  </View>
                  <View
                    style={{
                      width: rightRailIconWrapSize,
                      height: rightRailIconWrapSize,
                      borderRadius: 14,
                      backgroundColor: 'rgba(37, 99, 235, 0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <TrendingUp size={rightRailIconSize} color="#2563EB" strokeWidth={2.2} />
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      {toast && (
        <View className="absolute left-6 right-6 items-center" style={{ top: 90 }}>
          <View
            className="flex-row items-center px-4 py-3 rounded-full"
            style={{ backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444' }}
          >
            <View
              className="w-7 h-7 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <Check size={16} color={toast.type === 'success' ? '#111111' : '#EF4444'} strokeWidth={2.5} />
            </View>
            <Text className="text-white text-sm font-semibold">{toast.message}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
