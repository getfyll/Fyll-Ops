import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, Switch, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, Plus, X, Check, Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import useFyllStore, {
  generateProductId,
  generateVariantBarcode,
  ProductVariant,
  ServiceFieldType,
  ServiceVariable,
  ServiceVariableOption,
  ServiceField,
  ServiceVariableType,
  formatCurrency,
} from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useImagePicker } from '@/hooks/useImagePicker';
import { prepareProductMediaForPersistence } from '@/lib/product-media';
import { Button, StickyButtonContainer } from '@/components/Button';

const SERVICE_VARIABLE_TYPES: ServiceVariableType[] = ['Select', 'Number', 'Toggle', 'Text'];
const SERVICE_FIELD_TYPES: ServiceFieldType[] = ['Text', 'Date', 'Time', 'Number', 'Price', 'Select'];
const CONTROL_HEIGHT = 50;

const normalizeVariableOption = (option: string | ServiceVariableOption): ServiceVariableOption => (
  typeof option === 'string'
    ? { value: option }
    : { value: option.value, amount: option.amount }
);

const formatOptionAmount = (amount?: number) => (
  typeof amount === 'number' && Number.isFinite(amount) ? ` (+${formatCurrency(amount)})` : ''
);

export default function NewServiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  const isWeb = Platform.OS === 'web';
  const isCompactLayout = width < 768;
  const isMobileWeb = isWeb && isCompactLayout;
  const shouldCenterForm = isWeb && !isCompactLayout;
  const useDesktopCanvas = shouldCenterForm && !isDark;
  const canvasBg = useDesktopCanvas ? '#F3F3F5' : colors.bg.primary;
  const panelBg = useDesktopCanvas ? '#FFFFFF' : colors.bg.primary;
  const cardClass = cn('rounded-2xl p-4 border', isDark ? 'bg-[#1A1A1A] border-[#333333]' : 'bg-white border-gray-200');
  const softSurfaceClass = cn('rounded-2xl p-4 border', isDark ? 'bg-[#151515] border-[#2C2C2C]' : 'bg-gray-50 border-gray-200');
  const sectionTitleClass = 'font-semibold text-[15px]';
  const fieldLabelClass = 'text-xs font-semibold uppercase tracking-wider';
  const addProduct = useFyllStore((s) => s.addProduct);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId);

  const imagePicker = useImagePicker();
  const [serviceImageUrl, setServiceImageUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [serviceUsesGlobalPricing, setServiceUsesGlobalPricing] = useState(true);
  const [serviceTags, setServiceTags] = useState<string[]>([]);
  const [serviceTagInput, setServiceTagInput] = useState('');
  const [serviceVariables, setServiceVariables] = useState<ServiceVariable[]>([]);
  const [serviceFields, setServiceFields] = useState<ServiceField[]>([]);
  const [serviceActive, setServiceActive] = useState(true);
  const [variableOptionInputs, setVariableOptionInputs] = useState<Record<string, { value: string; amount: string }>>({});
  const [fieldOptionInputs, setFieldOptionInputs] = useState<Record<string, { value: string; amount: string }>>({});
  const [openVariableTypeId, setOpenVariableTypeId] = useState<string | null>(null);
  const [openFieldTypeId, setOpenFieldTypeId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handlePickServiceImage = async () => {
    const uri = await imagePicker.pickImage();
    if (uri) setServiceImageUrl(uri);
  };

  const handleRemoveServiceImage = () => {
    setServiceImageUrl(null);
  };

  const handleAddServiceTag = () => {
    const value = serviceTagInput.trim();
    if (!value || serviceTags.includes(value)) return;
    setServiceTags((prev) => [...prev, value]);
    setServiceTagInput('');
  };

  const handleRemoveServiceTag = (value: string) => {
    setServiceTags((prev) => prev.filter((tag) => tag !== value));
  };

  const handleAddServiceVariable = () => {
    setServiceVariables((prev) => [
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

  const handleUpdateServiceVariable = (idToUpdate: string, updates: Partial<ServiceVariable>) => {
    setServiceVariables((prev) => prev.map((variable) => (
      variable.id === idToUpdate ? { ...variable, ...updates } : variable
    )));
  };

  const handleRemoveServiceVariable = (idToRemove: string) => {
    setServiceVariables((prev) => prev.filter((variable) => variable.id !== idToRemove));
  };

  const handleAddServiceVariableOption = (idToUpdate: string) => {
    const draft = variableOptionInputs[idToUpdate] ?? { value: '', amount: '' };
    const value = draft.value.trim();
    if (!value) return;

    const parsedAmount = Number.parseFloat(draft.amount.trim());
    const amount = !serviceUsesGlobalPricing && Number.isFinite(parsedAmount) ? parsedAmount : undefined;

    setServiceVariables((prev) => prev.map((variable) => (
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

  const handleRemoveServiceVariableOption = (idToUpdate: string, optionValue: string) => {
    setServiceVariables((prev) => prev.map((variable) => (
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

  const handleAddServiceField = () => {
    setServiceFields((prev) => [
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

  const handleUpdateServiceField = (idToUpdate: string, updates: Partial<ServiceField>) => {
    setServiceFields((prev) => prev.map((field) => (
      field.id === idToUpdate ? { ...field, ...updates } : field
    )));
  };

  const handleRemoveServiceField = (idToRemove: string) => {
    setServiceFields((prev) => prev.filter((field) => field.id !== idToRemove));
  };

  const handleAddServiceFieldOption = (idToUpdate: string) => {
    const draft = fieldOptionInputs[idToUpdate] ?? { value: '', amount: '' };
    const optionValue = draft.value.trim();
    if (!optionValue) return;
    const parsedAmount = Number.parseFloat(draft.amount.trim());
    const nextOption: ServiceVariableOption = {
      value: optionValue,
      amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
    };

    setServiceFields((prev) => prev.map((field) => {
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

  const handleRemoveServiceFieldOption = (idToUpdate: string, optionValue: string) => {
    setServiceFields((prev) => prev.map((field) => {
      if (field.id !== idToUpdate) return field;
      const nextOptions = (field.options ?? [])
        .map(normalizeVariableOption)
        .filter((option) => option.value !== optionValue);
      const nextDefault = field.defaultValue === optionValue ? '' : field.defaultValue;
      return { ...field, options: nextOptions, defaultValue: nextDefault, value: nextDefault };
    }));
  };

  const mergedServiceFields = useMemo(() => {
    const trimmedDuration = duration.trim();
    const durationField = trimmedDuration
      ? [{ id: 'duration', label: 'Duration', type: 'Text' as ServiceFieldType, defaultValue: trimmedDuration }]
      : [];
    return [...durationField, ...serviceFields];
  }, [duration, serviceFields]);

  const isValid = name.trim().length > 0 && (serviceUsesGlobalPricing ? price.trim().length > 0 : true);

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const serviceId = generateProductId();
      const baseServicePrice = serviceUsesGlobalPricing ? (parseFloat(price) || 0) : 0;
      const productVariants: ProductVariant[] = [{
        id: `${serviceId}-1`,
        sku: `${name.substring(0, 3).toUpperCase()}-SRV`,
        barcode: generateVariantBarcode(),
        variableValues: {},
        stock: 0,
        sellingPrice: baseServicePrice,
      }];

      const preparedMedia = await prepareProductMediaForPersistence({
        businessId,
        productId: serviceId,
        imageUrl: serviceImageUrl,
        variants: productVariants,
      });

      await addProduct({
        id: serviceId,
        name: name.trim(),
        description: description.trim(),
        categories: [],
        variants: preparedMedia.variants,
        lowStockThreshold: 0,
        createdAt: new Date().toISOString(),
        productType: 'service',
        imageUrl: preparedMedia.imageUrl,
        createdBy: currentUser?.name,
        serviceTags,
        serviceUsesGlobalPricing,
        serviceVariables,
        serviceFields: mergedServiceFields,
        isDiscontinued: !serviceActive,
      }, businessId);

      setShowSuccessToast(true);
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (error) {
      console.error('❌ Failed to create service:', error);
      setIsSubmitting(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      alert('Failed to create service. Please check your internet connection and try again.');
    }
  };

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
        <View
          className="flex-row items-center justify-between px-5 py-4 border-b"
          style={{ backgroundColor: colors.bg.primary, borderBottomColor: colors.border.light }}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <View className="items-center">
            <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">
              New Service
            </Text>
          </View>
          <View className="w-10 h-10" />
        </View>

        <KeyboardAwareScrollView
          className="flex-1 pb-6"
          showsVerticalScrollIndicator={false}
          extraScrollHeight={100}
          enableOnAndroid={true}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 24,
            width: '100%',
            maxWidth: isWeb ? 1120 : undefined,
            alignSelf: isWeb ? 'center' : 'stretch',
          }}
        >
          {/* Service Details */}
          <View className="mt-4">
            <View className={cardClass}>
              <View className="mb-4">
                <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>Core Details</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">Main service details and pricing.</Text>
              </View>

              <View className="gap-4">
                <View>
                  <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Service Image</Text>
                  {imagePicker.error ? (
                    <View className="mb-2 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                      <Text className="text-red-500 text-sm text-center">{imagePicker.error}</Text>
                    </View>
                  ) : null}
                  {serviceImageUrl ? (
                    <View className="flex-row items-start">
                      <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                        <Image source={{ uri: serviceImageUrl }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                      </View>
                      <View className="ml-3 flex-1">
                        <Pressable
                          onPress={handlePickServiceImage}
                          disabled={imagePicker.isLoading}
                          className="flex-row items-center px-3 py-2 rounded-lg mb-2 active:opacity-70"
                          style={{ backgroundColor: colors.bg.secondary, opacity: imagePicker.isLoading ? 0.5 : 1 }}
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
                      style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, borderStyle: 'dashed', opacity: imagePicker.isLoading ? 0.5 : 1 }}
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
                  <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Service Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Installation Service"
                    placeholderTextColor={colors.input.placeholder}
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: colors.input.text,
                    }}
                  />
                </View>

                <View>
                  <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Description</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="On-site installation and setup of equipment and systems"
                    placeholderTextColor={colors.input.placeholder}
                    multiline
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      minHeight: 90,
                      color: colors.input.text,
                    }}
                  />
                </View>

                <View className="border-t pt-4" style={{ borderTopColor: colors.border.light, borderTopWidth: 1 }}>
                  <View
                    style={{
                      flexDirection: isCompactLayout ? 'column' : 'row',
                      alignItems: isCompactLayout ? 'stretch' : 'center',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>
                        Global Pricing
                      </Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                        One fixed service price for all variable selections.
                      </Text>
                    </View>
                    <Switch
                      value={serviceUsesGlobalPricing}
                      onValueChange={setServiceUsesGlobalPricing}
                      trackColor={{ false: '#767577', true: '#D1D5DB' }}
                      thumbColor={serviceUsesGlobalPricing ? '#374151' : '#FFFFFF'}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 12 }}>
                  {serviceUsesGlobalPricing && (
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Price</Text>
                      <TextInput
                        value={price}
                        onChangeText={setPrice}
                        placeholder="₦150/hr"
                        placeholderTextColor={colors.input.placeholder}
                        keyboardType="numeric"
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 14,
                          paddingHorizontal: 14,
                          color: colors.input.text,
                          height: CONTROL_HEIGHT,
                        }}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Duration</Text>
                    <TextInput
                      value={duration}
                      onChangeText={setDuration}
                      placeholder="2-4 hours"
                      placeholderTextColor={colors.input.placeholder}
                      style={{
                        backgroundColor: colors.input.bg,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        color: colors.input.text,
                        height: CONTROL_HEIGHT,
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Tags */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>Tags</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {serviceTags.map((tag) => (
                <View
                  key={tag}
                  className={cn('flex-row items-center px-3 py-1.5 rounded-full', isDark ? 'bg-[#222222]' : 'bg-gray-100')}
                >
                  <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">{tag}</Text>
                  <Pressable onPress={() => handleRemoveServiceTag(tag)} className="ml-2 active:opacity-70">
                    <X size={12} color="#9CA3AF" strokeWidth={2} />
                  </Pressable>
                </View>
              ))}
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={serviceTagInput}
                  onChangeText={setServiceTagInput}
                  placeholder="Add tag"
                  placeholderTextColor={colors.input.placeholder}
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    color: colors.input.text,
                    minWidth: 120,
                  }}
                />
                <Pressable
                  onPress={handleAddServiceTag}
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
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>Variables</Text>
              <Pressable
                onPress={handleAddServiceVariable}
                className="flex-row items-center px-3 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 34 }}
              >
                <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-1.5">Add Variable</Text>
              </Pressable>
            </View>

            <View className="gap-3">
              {serviceVariables.map((variable) => {
                const normalizedOptions = (variable.options ?? []).map(normalizeVariableOption);
                const optionDraft = variableOptionInputs[variable.id] ?? { value: '', amount: '' };

                return (
                  <View
                    key={variable.id}
                    className={cn('rounded-2xl p-3 border', softSurfaceClass)}
                  >
                    <View style={{ width: '100%', gap: 8 }}>
                    {isMobileWeb ? (
                      <>
                        <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Variable Name</Text>
                        <TextInput
                          value={variable.name}
                          onChangeText={(value) => handleUpdateServiceVariable(variable.id, { name: value })}
                            placeholder="Variable name"
                            placeholderTextColor={colors.input.placeholder}
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              color: colors.input.text,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                        <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Variable Type</Text>
                        <Pressable
                          onPress={() => setOpenVariableTypeId((current) => (current === variable.id ? null : variable.id))}
                            className="active:opacity-80"
                            style={{
                              backgroundColor: colors.input.bg,
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
                              onChangeText={(value) => handleUpdateServiceVariable(variable.id, { name: value })}
                              placeholder="Variable name"
                              placeholderTextColor={colors.input.placeholder}
                              style={{
                                backgroundColor: colors.input.bg,
                                borderWidth: 1,
                                borderColor: colors.border.light,
                                borderRadius: 12,
                                paddingHorizontal: 12,
                                color: colors.input.text,
                                height: CONTROL_HEIGHT,
                              }}
                            />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Pressable
                              onPress={() => setOpenVariableTypeId((current) => (current === variable.id ? null : variable.id))}
                              className="active:opacity-80"
                              style={{
                                backgroundColor: colors.input.bg,
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
                          <Pressable onPress={() => handleRemoveServiceVariable(variable.id)} className="active:opacity-70" style={{ paddingHorizontal: 2 }}>
                            <X size={16} color="#9CA3AF" strokeWidth={2} />
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
                        {SERVICE_VARIABLE_TYPES.map((type, typeIndex) => (
                          <Pressable
                            key={type}
                            onPress={() => {
                              handleUpdateServiceVariable(variable.id, { type });
                              setOpenVariableTypeId(null);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderBottomWidth: typeIndex === SERVICE_VARIABLE_TYPES.length - 1 ? 0 : 1,
                              borderBottomColor: colors.border.light,
                              backgroundColor: variable.type === type ? colors.input.bg : colors.bg.card,
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{type}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {variable.type === 'Select' && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-2')}>Values</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {normalizedOptions.map((option) => (
                            <View
                              key={`${option.value}-${option.amount ?? 'na'}`}
                              className="flex-row items-center px-3 py-1.5 rounded-full"
                              style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                            >
                              <Text style={{ color: colors.text.primary }} className="text-xs mr-1">
                                {option.value}{serviceUsesGlobalPricing ? '' : formatOptionAmount(option.amount)}
                              </Text>
                              <Pressable
                                onPress={() => handleRemoveServiceVariableOption(variable.id, option.value)}
                                className="active:opacity-70"
                              >
                                <X size={12} color="#9CA3AF" strokeWidth={2} />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                        <View
                          style={{
                            marginTop: 12,
                            width: '100%',
                            flexDirection: isCompactLayout && !serviceUsesGlobalPricing ? 'column' : 'row',
                            alignItems: 'stretch',
                            gap: 8,
                          }}
                        >
                          <TextInput
                            value={optionDraft.value}
                            onChangeText={(value) => setVariableOptionInputs((prev) => ({
                              ...prev,
                              [variable.id]: { ...(prev[variable.id] ?? { value: '', amount: '' }), value },
                            }))}
                            onSubmitEditing={() => handleAddServiceVariableOption(variable.id)}
                            placeholder="Value (e.g., Lekki)"
                            placeholderTextColor={colors.input.placeholder}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              color: colors.input.text,
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
                              onSubmitEditing={() => handleAddServiceVariableOption(variable.id)}
                              placeholder="Amount"
                              placeholderTextColor={colors.input.placeholder}
                              keyboardType="numeric"
                              style={{
                                flex: 1,
                                minWidth: 0,
                                backgroundColor: colors.input.bg,
                                borderWidth: 1,
                                borderColor: colors.border.light,
                                borderRadius: 12,
                                paddingHorizontal: 12,
                                color: colors.input.text,
                                height: CONTROL_HEIGHT,
                              }}
                            />
                          )}
                        </View>
                      </View>
                    )}
                    <View style={{ marginTop: 12, gap: 10 }}>
                      <View
                        style={{
                          backgroundColor: colors.input.bg,
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
                        <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Required</Text>
                        <Switch
                          value={Boolean(variable.required)}
                          onValueChange={(value) => handleUpdateServiceVariable(variable.id, { required: value })}
                        />
                      </View>
                      <TextInput
                        value={variable.defaultValue ?? ''}
                        onChangeText={(value) => handleUpdateServiceVariable(variable.id, { defaultValue: value })}
                        placeholder="Default value"
                        placeholderTextColor={colors.input.placeholder}
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          color: colors.input.text,
                          height: CONTROL_HEIGHT,
                        }}
                      />
                    </View>
                    {isMobileWeb && (
                      <Pressable onPress={() => handleRemoveServiceVariable(variable.id)} className="active:opacity-70" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Delete Variable</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {serviceVariables.length === 0 && (
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Add variables only when this service needs options.</Text>
              )}
            </View>
          </View>

          {/* Additional Fields */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>Additional Fields</Text>
              <Pressable
                onPress={handleAddServiceField}
                className="flex-row items-center px-3 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 34 }}
              >
                <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-1.5">Add Field</Text>
              </Pressable>
            </View>
            <View className="gap-3">
              {serviceFields.map((field) => {
                const normalizedFieldOptions = (field.options ?? []).map(normalizeVariableOption);
                const fieldOptionDraft = fieldOptionInputs[field.id] ?? { value: '', amount: '' };
                const fieldType = field.type ?? 'Text';
                return (
                <View key={field.id} className={cn('rounded-2xl p-3 border', softSurfaceClass)}>
                  <View style={{ width: '100%', gap: 8 }}>
                    {isMobileWeb ? (
                      <>
                        <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Field Label</Text>
                        <TextInput
                          value={field.label}
                          onChangeText={(value) => handleUpdateServiceField(field.id, { label: value })}
                          placeholder="Field label (e.g., Test Date)"
                          placeholderTextColor={colors.input.placeholder}
                          style={{
                            backgroundColor: colors.input.bg,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.input.text,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                        <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Field Type</Text>
                        <Pressable
                          onPress={() => setOpenFieldTypeId((current) => (current === field.id ? null : field.id))}
                          className="active:opacity-80"
                          style={{
                            backgroundColor: colors.input.bg,
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
                            onChangeText={(value) => handleUpdateServiceField(field.id, { label: value })}
                            placeholder="Field label (e.g., Test Date)"
                            placeholderTextColor={colors.input.placeholder}
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              color: colors.input.text,
                              height: CONTROL_HEIGHT,
                            }}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Pressable
                            onPress={() => setOpenFieldTypeId((current) => (current === field.id ? null : field.id))}
                            className="active:opacity-80"
                            style={{
                              backgroundColor: colors.input.bg,
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
                        <Pressable onPress={() => handleRemoveServiceField(field.id)} className="active:opacity-70" style={{ paddingHorizontal: 2 }}>
                          <X size={16} color="#EF4444" strokeWidth={2} />
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
                      {SERVICE_FIELD_TYPES.map((type, typeIndex) => (
                        <Pressable
                          key={type}
                          onPress={() => {
                            handleUpdateServiceField(field.id, { type });
                            setOpenFieldTypeId(null);
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderBottomWidth: typeIndex === SERVICE_FIELD_TYPES.length - 1 ? 0 : 1,
                            borderBottomColor: colors.border.light,
                            backgroundColor: fieldType === type ? colors.input.bg : colors.bg.card,
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{type}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {fieldType === 'Select' && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-2')}>Options</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {normalizedFieldOptions.map((option) => (
                          <View
                            key={`${field.id}-${option.value}-${option.amount ?? 'na'}`}
                            className="flex-row items-center px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.primary }} className="text-xs mr-1">
                              {option.value}{formatOptionAmount(option.amount)}
                            </Text>
                            <Pressable
                              onPress={() => handleRemoveServiceFieldOption(field.id, option.value)}
                              className="active:opacity-70"
                            >
                              <X size={12} color="#9CA3AF" strokeWidth={2} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                      <View style={{ marginTop: 12, width: '100%', flexDirection: isCompactLayout ? 'column' : 'row', gap: 8 }}>
                        <TextInput
                          value={fieldOptionDraft.value}
                          onChangeText={(value) => setFieldOptionInputs((prev) => ({
                            ...prev,
                            [field.id]: { ...(prev[field.id] ?? { value: '', amount: '' }), value },
                          }))}
                          onSubmitEditing={() => handleAddServiceFieldOption(field.id)}
                          placeholder="Add option value"
                          placeholderTextColor={colors.input.placeholder}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            backgroundColor: colors.input.bg,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.input.text,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                        <TextInput
                          value={fieldOptionDraft.amount}
                          onChangeText={(amount) => setFieldOptionInputs((prev) => ({
                            ...prev,
                            [field.id]: { ...(prev[field.id] ?? { value: '', amount: '' }), amount },
                          }))}
                          onSubmitEditing={() => handleAddServiceFieldOption(field.id)}
                          placeholder="Amount (optional)"
                          placeholderTextColor={colors.input.placeholder}
                          keyboardType="numeric"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            backgroundColor: colors.input.bg,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            color: colors.input.text,
                            height: CONTROL_HEIGHT,
                          }}
                        />
                      </View>
                    </View>
                  )}

                  <View style={{ marginTop: 12, gap: 10 }}>
                    <View
                      style={{
                        backgroundColor: colors.input.bg,
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
                      <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Required</Text>
                      <Switch
                        value={Boolean(field.required)}
                        onValueChange={(value) => handleUpdateServiceField(field.id, { required: value })}
                      />
                    </View>
                      <TextInput
                        value={field.defaultValue ?? field.value ?? ''}
                        onChangeText={(value) => handleUpdateServiceField(field.id, { defaultValue: value, value })}
                        placeholder={
                          fieldType === 'Time'
                            ? 'Default value (HH:mm)'
                            : fieldType === 'Price'
                              ? 'Default price (optional)'
                              : 'Default value (optional)'
                        }
                        placeholderTextColor={colors.input.placeholder}
                        keyboardType={fieldType === 'Price' ? 'numeric' : 'default'}
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                        borderColor: colors.border.light,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        color: colors.input.text,
                        height: CONTROL_HEIGHT,
                      }}
                    />
                  </View>
                  {isMobileWeb && (
                    <Pressable onPress={() => handleRemoveServiceField(field.id)} className="active:opacity-70" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Delete Field</Text>
                    </Pressable>
                  )}
                </View>
                );
              })}
              {serviceFields.length === 0 && (
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Add extra fields only when the service needs order-time details.</Text>
              )}
            </View>
          </View>

          {/* Status */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text style={{ color: colors.text.primary }} className={sectionTitleClass}>Mark as Inactive</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                  Hide this service from new order pickers.
                </Text>
              </View>
              <Switch
                value={!serviceActive}
                onValueChange={(value) => setServiceActive(!value)}
                trackColor={{ false: '#767577', true: '#9CA3AF' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View className="h-28" />
        </KeyboardAwareScrollView>
      </SafeAreaView>
      </View>

      <StickyButtonContainer bottomInset={insets.bottom}>
        <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center' }}>
          <Button
            onPress={handleSubmit}
            disabled={!isValid}
            loading={isSubmitting}
            loadingText="Creating..."
          >
            Create Service
          </Button>
        </View>
      </StickyButtonContainer>

      {showSuccessToast && (
        <View
          className="absolute left-5 right-5 items-center"
          style={{ top: insets.top + 60 }}
        >
          <View
            className="flex-row items-center px-5 py-4 rounded-xl"
            style={{ backgroundColor: colors.text.primary }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.bg.primary }}>
              <Check size={18} color={colors.text.primary} strokeWidth={2.5} />
            </View>
            <Text style={{ color: colors.bg.primary }} className="font-semibold text-sm">
              Service created successfully!
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
