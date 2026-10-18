import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, Plus, X, Check, Camera, Trash2 } from 'lucide-react-native';
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
import { StickyButtonContainer } from '@/components/Button';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { BackButton, FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useFonts, BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque';

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
  const [bricolageMediumLoaded] = useFonts({ BricolageGrotesque_500Medium });
  const router = useRouter();
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = useResolvedThemeMode() === 'dark';
  const isWeb = Platform.OS === 'web';
  const isCompactLayout = width < 768;
  const isMobileWeb = isWeb && isCompactLayout;
  const isDesktopWeb = isWeb && isDesktop;
  const canvasBg = palette.page;
  const panelBg = palette.page;
  const cardClass = cn('rounded-[18px] p-4 border', isDark ? 'bg-[#1C1C1C] border-white/[0.07]' : 'bg-white border-[#ECECEC]');
  const sectionTitleStyle = { color: palette.text, fontSize: 16, fontWeight: '500' as const, fontFamily: bricolageMediumLoaded ? 'BricolageGrotesque_500Medium' : undefined };
  const configPanelStyle = { borderRadius: 18, padding: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border } as const;
  const configControlStyle = { height: CONTROL_HEIGHT, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.outline, borderRadius: 14, paddingHorizontal: 14, color: palette.text, fontSize: 14 } as const;
  const configLabelStyle = { color: palette.textSoft, fontSize: 12, fontWeight: '600' as const, marginBottom: 7 };
  const fieldLabelClass = 'text-xs font-semibold uppercase tracking-wider';
  const addProduct = useFyllStore((s) => s.addProduct);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const products = useFyllStore((s) => s.products);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId);
  const editingService = useMemo(
    () => serviceId ? products.find((product) => product.id === serviceId) : undefined,
    [products, serviceId]
  );
  const isEditing = Boolean(editingService);
  const editingDurationField = editingService?.serviceFields?.find((field) => field.id === 'duration' || field.label.trim().toLowerCase() === 'duration');

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
  const [expandedVariableId, setExpandedVariableId] = useState<string | null>(null);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [openFieldTypeId, setOpenFieldTypeId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  useEffect(() => {
    if (!editingService) return;
    setServiceImageUrl(editingService.imageUrl ?? null);
    setName(editingService.name ?? '');
    setDescription(editingService.description ?? '');
    setPrice(String(editingService.variants[0]?.sellingPrice ?? ''));
    setDuration(editingDurationField?.defaultValue ?? '');
    setServiceUsesGlobalPricing(editingService.serviceUsesGlobalPricing ?? true);
    setServiceTags(editingService.serviceTags ?? []);
    setServiceVariables(editingService.serviceVariables ?? []);
    setServiceFields((editingService.serviceFields ?? []).filter((field) => field.id !== 'duration' && field.label.trim().toLowerCase() !== 'duration'));
    setServiceActive(!(editingService.isDiscontinued ?? false));
    setExpandedVariableId(editingService.serviceVariables?.[0]?.id ?? null);
    const editableFields = (editingService.serviceFields ?? []).filter((field) => field.id !== 'duration' && field.label.trim().toLowerCase() !== 'duration');
    setExpandedFieldId(editableFields[0]?.id ?? null);
  }, [editingService?.id]);

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
    const variableId = `var-${Date.now()}`;
    setServiceVariables((prev) => [
      ...prev,
      {
        id: variableId,
        name: '',
        type: 'Select',
        options: [],
        required: false,
        defaultValue: '',
      },
    ]);
    setExpandedVariableId(variableId);
  };

  const handleUpdateServiceVariable = (idToUpdate: string, updates: Partial<ServiceVariable>) => {
    setServiceVariables((prev) => prev.map((variable) => (
      variable.id === idToUpdate ? { ...variable, ...updates } : variable
    )));
  };

  const handleRemoveServiceVariable = (idToRemove: string) => {
    setServiceVariables((prev) => {
      const nextVariables = prev.filter((variable) => variable.id !== idToRemove);
      if (expandedVariableId === idToRemove) {
        setExpandedVariableId(nextVariables.at(-1)?.id ?? null);
      }
      return nextVariables;
    });
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
    const fieldId = `field-${Date.now()}`;
    setServiceFields((prev) => [
      ...prev,
      {
        id: fieldId,
        label: '',
        type: 'Text',
        options: [],
        required: false,
        defaultValue: '',
      },
    ]);
    setExpandedFieldId(fieldId);
  };

  const handleUpdateServiceField = (idToUpdate: string, updates: Partial<ServiceField>) => {
    setServiceFields((prev) => prev.map((field) => (
      field.id === idToUpdate ? { ...field, ...updates } : field
    )));
  };

  const handleRemoveServiceField = (idToRemove: string) => {
    setServiceFields((prev) => {
      const nextFields = prev.filter((field) => field.id !== idToRemove);
      if (expandedFieldId === idToRemove) setExpandedFieldId(nextFields.at(-1)?.id ?? null);
      return nextFields;
    });
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

      const targetServiceId = editingService?.id ?? generateProductId();
      const baseServicePrice = serviceUsesGlobalPricing ? (parseFloat(price) || 0) : 0;
      const productVariants: ProductVariant[] = editingService?.variants.length
        ? editingService.variants.map((variant, index) => index === 0 ? { ...variant, sellingPrice: baseServicePrice } : variant)
        : [{
          id: `${targetServiceId}-1`,
          sku: `${name.substring(0, 3).toUpperCase()}-SRV`,
          barcode: generateVariantBarcode(),
          variableValues: {},
          stock: 0,
          sellingPrice: baseServicePrice,
        }];

      const preparedMedia = await prepareProductMediaForPersistence({
        businessId,
        productId: targetServiceId,
        imageUrl: serviceImageUrl,
        variants: productVariants,
      });

      const servicePayload = {
        name: name.trim(),
        description: description.trim(),
        categories: [] as string[],
        variants: preparedMedia.variants,
        lowStockThreshold: 0,
        productType: 'service' as const,
        imageUrl: preparedMedia.imageUrl,
        serviceTags,
        serviceUsesGlobalPricing,
        serviceVariables,
        serviceFields: mergedServiceFields,
        isDiscontinued: !serviceActive,
        discontinuedAt: serviceActive ? undefined : (editingService?.discontinuedAt ?? new Date().toISOString()),
      };

      if (editingService) {
        await updateProduct(editingService.id, servicePayload, businessId);
      } else {
        await addProduct({
          ...servicePayload,
          id: targetServiceId,
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.name,
        }, businessId);
      }

      setShowSuccessToast(true);
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (error) {
      console.error(`❌ Failed to ${isEditing ? 'update' : 'create'} service:`, error);
      setIsSubmitting(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      alert(`Failed to ${isEditing ? 'update' : 'create'} service. Please check your internet connection and try again.`);
    }
  };

  const createButton = (height: number) => (
    <Pressable
      onPress={handleSubmit}
      disabled={!isValid || isSubmitting}
      className="rounded-full items-center justify-center active:opacity-80"
      style={{ height, backgroundColor: FYLL_LIME, opacity: isValid && !isSubmitting ? 1 : 0.45 }}
    >
      <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '600' }}>
        {isSubmitting ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save changes' : 'Create service')}
      </Text>
    </Pressable>
  );

  const renderThemeToggle = (on: boolean, onPress: () => void, label: string) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      className="active:opacity-80"
      style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: on ? palette.tones.verified.dot : palette.outline, flexShrink: 0 }}
    >
      <View style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.page }} />
    </Pressable>
  );

  const renderStepTitle = (step: number, title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
        <Text style={{ color: palette.limeOnSurface, fontSize: 12.5, fontWeight: '700' }}>{step}</Text>
      </View>
      <Text style={[sectionTitleStyle, { flex: 1 }]}>{title}</Text>
    </View>
  );

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: canvasBg }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <View style={{ flex: 1, backgroundColor: panelBg }}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: panelBg }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: isDesktopWeb ? 28 : 16, paddingTop: isDesktopWeb ? 20 : 12, paddingBottom: 12, backgroundColor: palette.page }}
        >
          <BackButton onPress={() => router.back()} palette={palette} label="Back to services" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <MoneyText style={{ color: palette.text, fontSize: isDesktopWeb ? 28 : 22, letterSpacing: -0.8 }} numberOfLines={1}>
              {isEditing ? 'Edit service' : 'New service'}
            </MoneyText>
            <Text style={{ color: palette.faint, fontSize: isMobile ? 12 : 13 }}>Details, pricing and customer options.</Text>
          </View>
        </View>

        <KeyboardAwareScrollView
          className="flex-1 pb-6"
          showsVerticalScrollIndicator={false}
          extraScrollHeight={100}
          enableOnAndroid={true}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: isDesktopWeb ? 28 : 16,
            paddingTop: isDesktopWeb ? 8 : 4,
            paddingBottom: 32,
            width: '100%',
            maxWidth: isDesktopWeb ? 1456 : 760,
            alignSelf: isDesktopWeb ? 'flex-start' : 'center',
          }}
        >
          <View style={{ flexDirection: isDesktopWeb ? 'row' : 'column', gap: isDesktopWeb ? 20 : 0, alignItems: isDesktopWeb ? 'flex-start' : 'stretch' }}>
          <View style={{ flex: isDesktopWeb ? 1 : undefined, minWidth: 0 }}>
          {/* Service Details */}
          <View className="mt-4">
            <View className={cardClass}>
              <View className="mb-4">
                {renderStepTitle(1, 'Core details')}
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">Main service details and pricing.</Text>
              </View>

              <View className="gap-4">
                <View style={{ width: isDesktopWeb ? 180 : '100%' }}>
                  <Text style={{ color: colors.text.secondary }} className={cn(fieldLabelClass, 'mb-1.5')}>Service image</Text>
                  {imagePicker.error ? (
                    <View className="mb-2 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                      <Text className="text-red-500 text-sm text-center">{imagePicker.error}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={handlePickServiceImage}
                    disabled={imagePicker.isLoading}
                    className="active:opacity-80"
                    style={{ width: '100%', height: isDesktopWeb ? 150 : 220, borderRadius: 14, overflow: 'hidden', backgroundColor: serviceImageUrl ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center', borderWidth: serviceImageUrl ? 0 : 1, borderStyle: 'dashed', borderColor: palette.outline, opacity: imagePicker.isLoading ? 0.55 : 1 }}
                  >
                    {serviceImageUrl ? (
                      <>
                        <Image source={{ uri: serviceImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        <View style={{ position: 'absolute', left: 8, top: 8, height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.7)', justifyContent: 'center' }}>
                          <Text style={{ color: '#F4F4EF', fontSize: 11, fontWeight: '600' }}>Cover</Text>
                        </View>
                      </>
                    ) : (
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Camera size={22} color={palette.faint} strokeWidth={1.8} />
                        <Text style={{ color: palette.faint, fontSize: 12.5 }}>{imagePicker.isLoading ? 'Opening…' : 'Add a service photo'}</Text>
                      </View>
                    )}
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Pressable onPress={handlePickServiceImage} disabled={imagePicker.isLoading} className="active:opacity-70" style={{ height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Camera size={14} color={palette.textSoft} strokeWidth={2} />
                      <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '600' }}>{serviceImageUrl ? 'Change photo' : 'Choose photo'}</Text>
                    </Pressable>
                    {serviceImageUrl ? (
                      <Pressable onPress={handleRemoveServiceImage} className="active:opacity-70" style={{ height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: palette.dangerBorder, backgroundColor: palette.dangerBg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Trash2 size={14} color={palette.danger} strokeWidth={2} />
                        <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '600' }}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12, lineHeight: 17, marginTop: 7 }}>Optional thumbnail shown in your services list.</Text>
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

                <View style={{ minWidth: 0 }}>
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

          {/* Pricing */}
          <View className={cn('mt-4', cardClass)}>
            <View className="mb-4">
              {renderStepTitle(2, 'Pricing method')}
              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 5 }}>Choose one price or set amounts against customer options.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border }}>
              {[
                { label: 'One fixed price', value: true },
                { label: 'Varies by option', value: false },
              ].map((option) => {
                const selected = serviceUsesGlobalPricing === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setServiceUsesGlobalPricing(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className="active:opacity-80"
                    style={{ flex: 1, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? FYLL_LIME : 'transparent' }}
                  >
                    <Text style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: 12, fontWeight: '600' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {serviceUsesGlobalPricing ? (
              <View style={{ marginTop: 14 }}>
                <Text style={configLabelStyle}>Service price</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="₦150/hr"
                  placeholderTextColor={colors.input.placeholder}
                  keyboardType="numeric"
                  style={configControlStyle}
                />
              </View>
            ) : (
              <View style={{ marginTop: 14, borderRadius: 14, padding: 13, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>Set prices inside Variables</Text>
                <Text style={{ color: palette.nudgeSub, fontSize: 12, lineHeight: 17, marginTop: 3 }}>Each Select option can have its own amount.</Text>
              </View>
            )}
          </View>

          {/* Variables */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              {renderStepTitle(3, 'Variables')}
              <Pressable
                onPress={handleAddServiceVariable}
                className="flex-row items-center px-3 rounded-full active:opacity-80"
                style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.outline, height: 34, gap: 5 }}
              >
                <Plus size={14} color={palette.text} strokeWidth={2} />
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Add variable</Text>
              </Pressable>
            </View>

            <View className="gap-3">
              {serviceVariables.map((variable) => {
                const normalizedOptions = (variable.options ?? []).map(normalizeVariableOption);
                const optionDraft = variableOptionInputs[variable.id] ?? { value: '', amount: '' };
                const isCollapsed = serviceVariables.length > 1 && expandedVariableId !== variable.id;

                return (
                  <View
                    key={variable.id}
                    style={configPanelStyle}
                  >
                    {isCollapsed ? (
                      <Pressable
                        onPress={() => setExpandedVariableId(variable.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Expand ${variable.name.trim() || 'variable'}`}
                        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                            {variable.name.trim() || 'Untitled variable'}
                          </Text>
                          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 3 }}>{variable.type}</Text>
                        </View>
                        <ChevronDown size={16} color={palette.muted} strokeWidth={2} />
                      </Pressable>
                    ) : (
                    <>
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
                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                              {variable.type}
                            </Text>
                            <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                          </Pressable>
                        </>
                      ) : (
                        <View style={{ gap: 12, width: '100%' }}>
                          <View style={{ minWidth: 0 }}>
                            <Text style={configLabelStyle}>Variable name</Text>
                            <TextInput
                              value={variable.name}
                              onChangeText={(value) => handleUpdateServiceVariable(variable.id, { name: value })}
                              placeholder="Variable name"
                              placeholderTextColor={colors.input.placeholder}
                              style={configControlStyle}
                            />
                          </View>
                          <View style={{ minWidth: 0 }}>
                            <Text style={configLabelStyle}>Variable type</Text>
                            <Pressable
                              onPress={() => setOpenVariableTypeId((current) => (current === variable.id ? null : variable.id))}
                              className="active:opacity-80"
                              style={{
                                ...configControlStyle,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                                {variable.type}
                              </Text>
                              <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                            </Pressable>
                          </View>
                          <Pressable onPress={() => handleRemoveServiceVariable(variable.id)} className="active:opacity-70" style={{ height: 36, paddingHorizontal: 13, borderRadius: 999, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                            <Trash2 size={14} color={palette.danger} strokeWidth={2} />
                            <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '600' }}>Remove variable</Text>
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
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{type}</Text>
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
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Required</Text>
                        {renderThemeToggle(Boolean(variable.required), () => handleUpdateServiceVariable(variable.id, { required: !variable.required }), 'Required variable')}
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
                    </>
                    )}
                  </View>
                );
              })}
              {serviceVariables.length === 0 && (
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Add variables only when this service needs options.</Text>
              )}
            </View>
          </View>

          </View>
          <View
            style={isDesktopWeb
              ? { flex: 1, minWidth: 0, alignSelf: 'flex-start', position: 'sticky' as const, top: 12 }
              : { width: '100%' }}
          >

          {/* Tags */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              {renderStepTitle(4, 'Tags')}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {serviceTags.map((tag) => (
                <View key={tag} className={cn('flex-row items-center px-3 py-1.5 rounded-full', isDark ? 'bg-[#222222]' : 'bg-gray-100')}>
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
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, color: colors.input.text, minWidth: 120 }}
                />
                <Pressable onPress={handleAddServiceTag} className="active:opacity-70" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text.primary }}>
                  <Plus size={14} color={colors.bg.primary} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Additional Fields */}
          <View className={cn('mt-4', cardClass)}>
            <View className="flex-row items-center justify-between mb-3">
              {renderStepTitle(5, 'Additional fields')}
              <Pressable
                onPress={handleAddServiceField}
                className="flex-row items-center px-3 rounded-full active:opacity-80"
                style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.outline, height: 34, gap: 5 }}
              >
                <Plus size={14} color={palette.text} strokeWidth={2} />
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Add field</Text>
              </Pressable>
            </View>
            <View className="gap-3">
              {serviceFields.map((field) => {
                const normalizedFieldOptions = (field.options ?? []).map(normalizeVariableOption);
                const fieldOptionDraft = fieldOptionInputs[field.id] ?? { value: '', amount: '' };
                const fieldType = field.type ?? 'Text';
                const isFieldCollapsed = serviceFields.length > 1 && expandedFieldId !== field.id;
                return (
                <View key={field.id} style={configPanelStyle}>
                  {isFieldCollapsed ? (
                    <Pressable
                      onPress={() => setExpandedFieldId(field.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Expand ${field.label.trim() || 'field'}`}
                      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{field.label.trim() || 'Untitled field'}</Text>
                        <Text style={{ color: palette.faint, fontSize: 12, marginTop: 3 }}>{fieldType} · {field.required ? 'Required' : 'Optional'}</Text>
                      </View>
                      <ChevronDown size={16} color={palette.muted} strokeWidth={2} />
                    </Pressable>
                  ) : (
                  <>
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
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                            {fieldType}
                          </Text>
                          <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                        </Pressable>
                      </>
                    ) : (
                      <View style={{ gap: 12, width: '100%' }}>
                        <View style={{ minWidth: 0 }}>
                          <Text style={configLabelStyle}>Field label</Text>
                          <TextInput
                            value={field.label}
                            onChangeText={(value) => handleUpdateServiceField(field.id, { label: value })}
                            placeholder="Field label (e.g., Test Date)"
                            placeholderTextColor={colors.input.placeholder}
                            style={configControlStyle}
                          />
                        </View>
                        <View style={{ minWidth: 0 }}>
                          <Text style={configLabelStyle}>Field type</Text>
                          <Pressable
                            onPress={() => setOpenFieldTypeId((current) => (current === field.id ? null : field.id))}
                            className="active:opacity-80"
                            style={{
                              ...configControlStyle,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                              {fieldType}
                            </Text>
                            <ChevronDown size={14} color={colors.text.muted} strokeWidth={2} />
                          </Pressable>
                        </View>
                        <Pressable onPress={() => handleRemoveServiceField(field.id)} className="active:opacity-70" style={{ height: 36, paddingHorizontal: 13, borderRadius: 999, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                          <Trash2 size={14} color={palette.danger} strokeWidth={2} />
                          <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '600' }}>Remove field</Text>
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
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{type}</Text>
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
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Required</Text>
                      {renderThemeToggle(Boolean(field.required), () => handleUpdateServiceField(field.id, { required: !field.required }), 'Required field')}
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
                  </>
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
                {renderStepTitle(6, 'Availability')}
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                  Hide this service from new order pickers.
                </Text>
              </View>
              {renderThemeToggle(!serviceActive, () => setServiceActive((value) => !value), 'Mark service as inactive')}
            </View>
          </View>

          {!isMobile ? <View style={{ marginTop: 16 }}>{createButton(48)}</View> : null}
          {isMobile ? <View className="h-28" /> : <View className="h-6" />}
          </View>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>

      {isMobile ? (
        <StickyButtonContainer bottomInset={insets.bottom} backgroundColor={palette.page} borderColor={palette.hairline}>
          <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
            {createButton(52)}
          </View>
        </StickyButtonContainer>
      ) : null}

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
    </View>
  );
}
