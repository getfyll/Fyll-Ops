import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Modal, Platform, StyleProp, ViewStyle, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Plus, Minus, Trash2, ChevronDown, Check, Search, Package, User as UserIcon, Users, Calendar, ChevronLeft, ChevronRight, Sparkles, Clock3, Pencil, ArrowLeft } from 'lucide-react-native';
import useFyllStore, {
  OrderItem,
  OrderService,
  ORDER_CLASSIFICATIONS,
  OrderClassification,
  ServiceFieldType,
  PrescriptionInfo,
  type SocialCheckoutDraft,
  generateOrderNumber,
  formatCurrency,
  NIGERIA_STATES,
  Customer,
} from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { cn } from '@/lib/cn';
import { normalizeDeliveryStateValue } from '@/lib/format-address';
import { normalizeProductType } from '@/lib/product-utils';
import * as Haptics from 'expo-haptics';
import { Button, StickyButtonContainer } from '@/components/Button';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { sendOrderNotification } from '@/hooks/useWebPushNotifications';
import { addBusinessDays, getCustomerTrackingCode, resolveOrderTimeline } from '@/lib/fulfillment';
import { useThemeColors } from '@/lib/theme';
import { PrescriptionSection } from '@/components/PrescriptionSection';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { fetchWooCommerceOrder, fetchWooCommerceOrders, type WooNormalizedOrder } from '@/lib/woocommerce';
import { normalizeWooLookupValue } from '@/lib/woocommerce-link';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { supabaseData } from '@/lib/supabase/data';
import { queueSocialCheckoutEmail } from '@/lib/supabase/social-checkout-emails';
import { SearchClearButton } from '@/components/SearchClearButton';

interface SearchResult {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  stock: number;
  price: number;
  isService: boolean;
}

const normalizePickerIdentity = (value: string) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getSearchResultIdentity = (result: SearchResult) => (
  normalizePickerIdentity(`${result.productName} ${result.variantName === 'Service' ? '' : result.variantName}`)
);

const shouldPreferSearchResult = (next: SearchResult, current: SearchResult) => {
  if ((next.stock > 0) !== (current.stock > 0)) return next.stock > 0;
  if (Boolean(next.variantName?.trim()) !== Boolean(current.variantName?.trim())) return Boolean(next.variantName?.trim());
  if (next.stock !== current.stock) return next.stock > current.stock;
  return next.productName.length < current.productName.length;
};

interface AiParsedServiceItem {
  serviceName: string;
  quantity?: number;
  unitPrice?: number;
  notes?: string;
}

type SelectedWooOrderPreview = {
  reference: string;
  customerName: string;
  customerEmail: string;
};

type DatePickerTarget =
  | { type: 'order' }
  | { type: 'serviceField'; itemIndex: number; fieldId: string };

type TimePickerTarget = { itemIndex: number; fieldId: string };
type OrderFlowMode = 'product' | 'service';

const normalizeServiceFieldType = (type?: string): ServiceFieldType => (
  type === 'Date' || type === 'Time' || type === 'Number' || type === 'Select' || type === 'Price' ? type : 'Text'
);

const normalizeOption = (option: string | { value: string; amount?: number }) => (
  typeof option === 'string' ? { value: option } : option
);

const createOrderLineId = () => `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getOrderItemLineId = (item: OrderItem, index: number) => item.id ?? `${item.productId}:${item.variantId}:${index}`;

const toIsoDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDateString = (value: string | undefined): Date | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseTimeString = (value: string | undefined): { hour: number; minute: number } | null => {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

const toTimeString = (hour: number, minute: number): string => (
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
);

const formatTimeDisplay = (value: string | undefined): string => {
  const parsed = parseTimeString(value);
  if (!parsed) return value ?? '';
  const date = new Date();
  date.setHours(parsed.hour, parsed.minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const getInitials = (value: string | undefined): string => {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'C';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
};

const buildFallbackAiServiceId = (serviceName: string) => {
  const normalized = serviceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `ai-service-${normalized || 'unknown'}`;
};

const getOptionAmountForValue = (
  options: (string | { value: string; amount?: number })[] | undefined,
  selectedValue: string | undefined
): number => {
  if (!selectedValue || !options?.length) return 0;
  const selectedOption = options
    .map(normalizeOption)
    .find((option) => option.value === selectedValue);
  return typeof selectedOption?.amount === 'number' && Number.isFinite(selectedOption.amount)
    ? selectedOption.amount
    : 0;
};

const calculateServiceUnitPrice = (
  product: { variants: { id: string; sellingPrice: number }[]; serviceUsesGlobalPricing?: boolean },
  variantId: string,
  serviceVariables: OrderItem['serviceVariables'],
  serviceFields: OrderItem['serviceFields']
): number => {
  const basePrice = product.variants.find((variant) => variant.id === variantId)?.sellingPrice ?? 0;
  const usesGlobalPricing = product.serviceUsesGlobalPricing ?? true;
  const variableAmount = usesGlobalPricing
    ? 0
    : (serviceVariables ?? []).reduce((sum, variable) => {
      if (variable.type !== 'Select') return sum;
      return sum + getOptionAmountForValue(variable.options, variable.value);
    }, 0);
  const fieldSelectAmount = (serviceFields ?? []).reduce((sum, field) => {
    if (field.type !== 'Select') return sum;
    return sum + getOptionAmountForValue(field.options, field.value);
  }, 0);
  const fieldPriceAmount = (serviceFields ?? []).reduce((sum, field) => {
    if (field.type !== 'Price') return sum;
    const parsed = Number.parseFloat((field.value ?? '').trim());
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
  return (usesGlobalPricing ? basePrice : 0) + variableAmount + fieldSelectAmount + fieldPriceAmount;
};

export default function NewOrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    aiParsed?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
    deliveryState?: string;
    deliveryFee?: string;
    websiteOrderReference?: string;
    notes?: string;
    source?: string;
    paymentMethod?: string;
    socialCheckoutReference?: string;
    socialCheckoutBill?: string;
    socialCheckoutAmount?: string;
    items?: string;
    services?: string;
    prefillProductId?: string;
    prefillVariantId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { isDesktop, width: breakpointWidth } = useBreakpoint();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const isDesktopWeb = Platform.OS === 'web' && isDesktop;
  const isNarrowWeb = Platform.OS === 'web' && breakpointWidth < 1280;
  const rightColumnWidth = isDesktopWeb ? (isNarrowWeb ? Math.max(320, Math.round(breakpointWidth * 0.3)) : 420) : undefined;
  const webMaxWidth = 1456;
  const socialCheckoutReference = params.socialCheckoutReference || '';
  const socialCheckoutBill = params.socialCheckoutBill || '';
  const socialCheckoutAmount = Number(params.socialCheckoutAmount) || 0;
  const hasSocialCheckoutPrefill = Boolean(socialCheckoutReference || socialCheckoutBill);
  const canvasBg = !isDark && (hasSocialCheckoutPrefill || isDesktopWeb) ? '#FFFFFF' : colors.bg.primary;
  const panelBg = !isDark && (hasSocialCheckoutPrefill || isDesktopWeb) ? '#FFFFFF' : colors.bg.primary;
  const textPrimaryClass = isDark ? 'text-white' : 'text-gray-900';
  const textSecondaryClass = isDark ? 'text-gray-300' : 'text-gray-600';
  const textMutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardClass = isDark ? 'bg-[#1A1A1A] border-[#333333]' : 'bg-white border-gray-200';
  const softCardClass = isDark ? 'bg-[#222222] border-[#333333]' : isDesktopWeb ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200';
  const sectionTitleClass = 'font-semibold text-[15px]';
  const fieldLabelClass = 'text-xs font-semibold uppercase tracking-wider';
  const summaryCardClass = cardClass;
  const summaryPrimaryClass = textPrimaryClass;
  const summarySecondaryClass = textSecondaryClass;
  const summaryAccentClass = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const summaryDividerColor = colors.border.light;
  const datePickerSurface = isDark ? '#1A1A1A' : '#FFFFFF';
  const datePickerSoftBg = isDark ? '#222222' : '#F3F4F6';
  const datePickerBorder = isDark ? '#333333' : '#E5E7EB';
  const datePickerIconColor = isDark ? '#E5E7EB' : '#111111';
  const selectionModalSurface = isDark ? '#1A1A1A' : '#FFFFFF';
  const selectionModalSoftBg = isDark ? '#222222' : '#F3F4F6';
  const selectionModalBorder = isDark ? '#333333' : '#E5E7EB';
  const selectionModalSelectedBg = isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6';
  const selectionModalSelectedText = isDark ? '#FFFFFF' : '#111111';
  const selectionModalText = isDark ? '#9CA3AF' : '#6B7280';
  const products = useFyllStore((s) => s.products);
  const customServices = useFyllStore((s) => s.customServices);
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const saleSources = useFyllStore((s) => s.saleSources);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const customers = useFyllStore((s) => s.customers);
  const addOrder = useFyllStore((s) => s.addOrder);
  const addCustomer = useFyllStore((s) => s.addCustomer);
  const updateVariantStock = useFyllStore((s) => s.updateVariantStock);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const {
    woocommerceStoreUrl,
    woocommerceConsumerKey,
    woocommerceConsumerSecret,
    hasWooCommerceConnection,
  } = useBusinessSettings();

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPullingWooOrder, setIsPullingWooOrder] = useState(false);
  const submitGuard = useRef(false);
  const aiServicesHydratedRef = useRef(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
  }, []);

  // Customer info - initialize from AI params if provided
  const [customerName, setCustomerName] = useState(params.customerName || '');
  const [customerPrescription, setCustomerPrescription] = useState<PrescriptionInfo | undefined>(
    !hasSocialCheckoutPrefill && params.notes?.trim()
      ? {
        text: params.notes.trim(),
        uploadedAt: new Date().toISOString(),
      }
      : undefined
  );
  const [customerEmail, setCustomerEmail] = useState(params.customerEmail || '');
  const [customerPhone, setCustomerPhone] = useState(params.customerPhone || '');
  const [deliveryState, setDeliveryState] = useState(() => normalizeDeliveryStateValue(params.deliveryState || ''));
  const [deliveryAddress, setDeliveryAddress] = useState(params.deliveryAddress || '');
  const [orderTypeId, setOrderTypeId] = useState(orderTimelineSettings.orderTypes[0]?.id ?? orderTimelineSettings.defaultOrderType.id);
  const [showOrderTypeMenu, setShowOrderTypeMenu] = useState(false);
  const [orderFlowMode, setOrderFlowMode] = useState<OrderFlowMode>(() => {
    if (params.services && !params.items) return 'service';
    return 'product';
  });
  const isServiceOrder = orderFlowMode === 'service';
  const [showOrderFlowChooser, setShowOrderFlowChooser] = useState<boolean>(() => {
    const hasPresetFlow = Boolean(params.prefillProductId || (params.services && !params.items));
    const hasPaymentPrefill = Boolean(params.websiteOrderReference || params.notes || hasSocialCheckoutPrefill);
    return !hasPresetFlow && !hasPaymentPrefill;
  });
  const [showStateModal, setShowStateModal] = useState(false);
  const [stateSearchQuery, setStateSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  useEffect(() => {
    const hasSelectedType = orderTimelineSettings.orderTypes.some((type) => type.id === orderTypeId);
    if (!hasSelectedType) {
      setOrderTypeId(orderTimelineSettings.orderTypes[0]?.id ?? orderTimelineSettings.defaultOrderType.id);
    }
  }, [orderTimelineSettings.defaultOrderType.id, orderTimelineSettings.orderTypes, orderTypeId]);

  useEffect(() => {
    if (isServiceOrder) {
      setShowOrderTypeMenu(false);
    }
  }, [isServiceOrder]);

  useEffect(() => {
    setItemTypeTab(isServiceOrder ? 'service' : 'product');
    setShowProductSearch(false);
    setSearchQuery('');
  }, [isServiceOrder]);

  useEffect(() => {
    setItems((previous) => previous.filter((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const isService = product ? normalizeProductType(product.productType) === 'service' : false;
      return isServiceOrder ? isService : !isService;
    }));
  }, [isServiceOrder, products]);

  // Order details
  const [source, setSource] = useState(() => (
    params.source
      ? params.source
      : saleSources[0]?.name || ''
  ));
  const [paymentMethod, setPaymentMethod] = useState(() => (
    params.paymentMethod
      ? params.paymentMethod
      : paymentMethods[0]?.name || ''
  ));
  const [orderClassification, setOrderClassification] = useState<OrderClassification>('Sale');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<OrderService[]>([]);
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
  const [servicePriceInput, setServicePriceInput] = useState('');
  const [showServicePriceModal, setShowServicePriceModal] = useState(false);
  const [pendingServiceItemId, setPendingServiceItemId] = useState<string | null>(null);
  const [addonSearchQuery, setAddonSearchQuery] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(params.deliveryFee || '');
  const [additionalCharges, setAdditionalCharges] = useState('');
  const [additionalChargesNote, setAdditionalChargesNote] = useState('');
  const [discountCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [websiteOrderRef, setWebsiteOrderRef] = useState(params.websiteOrderReference || '');
  const [wooLookupOrders, setWooLookupOrders] = useState<WooNormalizedOrder[]>([]);
  const [isFetchingWooSuggestions, setIsFetchingWooSuggestions] = useState(false);
  const [showWooSuggestions, setShowWooSuggestions] = useState(false);
  const [selectedWooOrderPreview, setSelectedWooOrderPreview] = useState<SelectedWooOrderPreview | null>(null);
  const wooLookupLoadedRef = useRef(false);

  const prefillProductId = params.prefillProductId;
  const prefillVariantId = params.prefillVariantId;

  useEffect(() => {
    if (!prefillProductId || !prefillVariantId) return;
    const normalizedProductId = prefillProductId.toString();
    const normalizedVariantId = prefillVariantId.toString();

    if (items.some((item) => item.productId === normalizedProductId && item.variantId === normalizedVariantId)) return;

    const product = products.find((p) => String(p.id) === normalizedProductId);
    const variant = product?.variants.find((v) => String(v.id) === normalizedVariantId);
    if (!product || !variant) return;

    setItems([
      {
        id: createOrderLineId(),
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
        unitPrice: variant.sellingPrice || 0,
      },
    ]);
  }, [prefillProductId, prefillVariantId, products, items]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [itemTypeTab, setItemTypeTab] = useState<'product' | 'service'>('product');
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showOrderClassificationModal, setShowOrderClassificationModal] = useState(false);
  const isProductTabActive = itemTypeTab === 'product' && showProductSearch;
  const isServiceTabActive = itemTypeTab === 'service' && showProductSearch;
  const itemActionButtonColor = colors.text.primary;
  const itemActionButtonActiveTextColor = colors.bg.primary;

  // Order Date state
  const [orderDateType, setOrderDateType] = useState<'today' | 'another'>('today');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date()); // For calendar navigation
  const [pickerDate, setPickerDate] = useState(new Date());
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);

  // Handle AI-parsed items
  useEffect(() => {
    if (params.aiParsed === 'true' && params.items) {
      try {
        const parsedItems: {
          productName: string;
          variantInfo: string;
          quantity: number;
          unitPrice?: number;
        }[] = JSON.parse(params.items);

        // Try to match AI-parsed products to actual products in inventory
        const matchedItems: OrderItem[] = [];

        parsedItems.forEach((aiItem) => {
          // Search for matching product
          const matchingProduct = products.find((p) =>
            p.name.toLowerCase().includes(aiItem.productName.toLowerCase()) ||
            aiItem.productName.toLowerCase().includes(p.name.toLowerCase())
          );

          if (matchingProduct) {
            // Try to find matching variant
            const matchingVariant = matchingProduct.variants.find((v) => {
              const variantName = Object.values(v.variableValues).join(' ').toLowerCase();
              const aiVariant = aiItem.variantInfo.toLowerCase();
              return variantName.includes(aiVariant) || aiVariant.includes(variantName);
            });

            // Use first variant if no match found
            const variant = matchingVariant || matchingProduct.variants[0];

            if (variant) {
              const isService = normalizeProductType(matchingProduct.productType) === 'service';
              const serviceVariables = isService
                ? (matchingProduct.serviceVariables ?? []).map((variable) => ({
                  id: variable.id,
                  name: variable.name,
                  type: variable.type,
                  options: (variable.options ?? []).map(normalizeOption),
                  required: variable.required,
                  value: variable.defaultValue ?? (variable.type === 'Toggle' ? 'false' : ''),
                }))
                : undefined;
              const serviceFields = isService
                ? (matchingProduct.serviceFields ?? []).map((field) => ({
                  id: field.id,
                  label: field.label,
                  type: normalizeServiceFieldType(field.type),
                  options: (field.options ?? []).map(normalizeOption),
                  required: field.required,
                  value: field.defaultValue ?? field.value ?? '',
                }))
                : undefined;
              const derivedUnitPrice = isService
                ? calculateServiceUnitPrice(matchingProduct, variant.id, serviceVariables, serviceFields)
                : (variant.sellingPrice || 0);

              matchedItems.push({
                id: createOrderLineId(),
                productId: matchingProduct.id,
                variantId: variant.id,
                quantity: Number.isFinite(aiItem.quantity) && aiItem.quantity > 0 ? aiItem.quantity : 1,
                unitPrice: typeof aiItem.unitPrice === 'number' && aiItem.unitPrice > 0
                  ? aiItem.unitPrice
                  : derivedUnitPrice,
                serviceId: isService ? matchingProduct.id : undefined,
                serviceVariables,
                serviceFields,
              });
            }
          }
        });

        if (matchedItems.length > 0) {
          setItems(matchedItems);
        }
      } catch (error) {
        console.error('Error parsing AI items:', error);
      }
    }
  }, [params.aiParsed, params.items, products]);

  useEffect(() => {
    if (aiServicesHydratedRef.current) return;
    if (params.aiParsed !== 'true' || !params.services) return;

    try {
      const parsedServices: AiParsedServiceItem[] = JSON.parse(params.services);
      const hydratedServices: OrderService[] = [];

      parsedServices.forEach((service) => {
        const serviceName = (service.serviceName ?? '').trim();
        if (!serviceName) return;

        const quantity = Number.isFinite(Number(service.quantity)) && Number(service.quantity) > 0
          ? Number(service.quantity)
          : 1;

        const matchingService = customServices.find((entry) =>
          entry.name.toLowerCase().includes(serviceName.toLowerCase())
          || serviceName.toLowerCase().includes(entry.name.toLowerCase())
        );

        const basePrice = typeof service.unitPrice === 'number' && service.unitPrice > 0
          ? service.unitPrice
          : (matchingService?.defaultPrice ?? 0);
        const totalPrice = basePrice * quantity;

        hydratedServices.push({
          serviceId: matchingService?.id ?? buildFallbackAiServiceId(serviceName),
          name: quantity > 1 ? `${matchingService?.name ?? serviceName} x${quantity}` : (matchingService?.name ?? serviceName),
          price: totalPrice,
        });
      });

      if (hydratedServices.length > 0) {
        setServices((current) => (current.length > 0 ? current : hydratedServices));
      }
      aiServicesHydratedRef.current = true;
    } catch (error) {
      console.error('Error parsing AI services:', error);
      aiServicesHydratedRef.current = true;
    }
  }, [params.aiParsed, params.services, customServices]);

  // Search results - searches both product names and variant values
  // Excludes discontinued products
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();

    const resultsByIdentity = new Map<string, SearchResult>();
    products
      .filter((product) => !product.isDiscontinued && !product.isArchived)
      .forEach((product) => {
        const isService = normalizeProductType(product.productType) === 'service';
        if (itemTypeTab === 'service' && !isService) return;
        if (itemTypeTab === 'product' && isService) return;
        if (!isService && product.catalogSource === 'woocommerce-plugin') return;
        product.variants.forEach((variant) => {
          const variantName = Object.values(variant.variableValues).join(' ');
          const matchesProduct = product.name.toLowerCase().includes(query);
          const matchesVariant = variantName.toLowerCase().includes(query);

          if (matchesProduct || matchesVariant) {
            const result: SearchResult = {
              productId: product.id,
              productName: product.name,
              variantId: variant.id,
              variantName: isService ? 'Service' : variantName,
              stock: variant.stock,
              price: variant.sellingPrice,
              isService,
            };
            const identity = getSearchResultIdentity(result);
            const existing = resultsByIdentity.get(identity);
            if (!existing || shouldPreferSearchResult(result, existing)) {
              resultsByIdentity.set(identity, result);
            }
          }
        });
      });
    return Array.from(resultsByIdentity.values());
  }, [searchQuery, products, itemTypeTab]);

  // Customer search results
  const customerSearchResults = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers.slice(0, 5);
    const query = customerSearchQuery.toLowerCase();
    return customers.filter((c) =>
      c.fullName.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      c.email.toLowerCase().includes(query)
    );
  }, [customerSearchQuery, customers]);

  const filteredNigeriaStates = useMemo(() => {
    const query = stateSearchQuery.trim().toLowerCase();
    if (!query) return NIGERIA_STATES;
    return NIGERIA_STATES.filter((state) => state.toLowerCase().includes(query));
  }, [stateSearchQuery]);

  // Select existing customer to auto-fill
  const handleSelectCustomer = (customer: Customer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.fullName);
    setCustomerEmail(customer.email);
    setCustomerPhone(customer.phone);
    setDeliveryState(customer.defaultState);
    setDeliveryAddress(customer.defaultAddress);
    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
  };

  // Clear customer selection
  const handleClearCustomer = () => {
    setSelectedCustomerId(null);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setDeliveryState('');
    setDeliveryAddress('');
  };

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [items]);
  const servicesTotal = useMemo(() => {
    return services.reduce((sum, service) => sum + service.price, 0);
  }, [services]);

  const deliveryFeeNum = isServiceOrder ? 0 : parseFloat(deliveryFee) || 0;
  const additionalChargesNum = parseFloat(additionalCharges) || 0;
  const discountAmountNum = parseFloat(discountAmount) || 0;

  const totalAmount = subtotal + servicesTotal + deliveryFeeNum + additionalChargesNum - discountAmountNum;
  const buildDefaultSelectedOptions = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    const entries = (product?.orderOptions ?? [])
      .filter((option) => option.name.trim() && option.values.length > 0)
      .map((option) => [option.name, option.values[0]] as const);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  };

  const fulfillmentTimelinePreview = useMemo(() => (
    resolveOrderTimeline({ orderTypeId, deliveryState: isServiceOrder ? '' : deliveryState }, orderTimelineSettings)
  ), [deliveryState, isServiceOrder, orderTimelineSettings, orderTypeId]);
  const selectedOrderType = fulfillmentTimelinePreview.orderType;
  const orderDateValueForPreview = orderDateType === 'today' ? new Date() : selectedDate;
  const estimatedDeliveryPreview = useMemo(() => {
    const eta = addBusinessDays(new Date(orderDateValueForPreview), fulfillmentTimelinePreview.maxBusinessDays);
    return eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [fulfillmentTimelinePreview.maxBusinessDays, orderDateValueForPreview]);

  const handleAddProduct = (result: SearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const product = products.find((p) => p.id === result.productId);
    const hasOrderOptions = !result.isService && Boolean(product?.orderOptions?.some((option) =>
      option.name.trim() && option.values.length > 0
    ));
    const existingIndex = hasOrderOptions
      ? -1
      : items.findIndex((item) => item.productId === result.productId && item.variantId === result.variantId);

    if (existingIndex >= 0) {
      // Increment quantity if already exists
      handleUpdateQuantity(existingIndex, 1);
    } else {
      const serviceVariables = result.isService
        ? (product?.serviceVariables ?? []).map((variable) => ({
          id: variable.id,
          name: variable.name,
          type: variable.type,
          options: (variable.options ?? []).map(normalizeOption),
          required: variable.required,
          value: variable.defaultValue ?? (variable.type === 'Toggle' ? 'false' : ''),
        }))
        : undefined;
      const serviceFields = result.isService
        ? (product?.serviceFields ?? []).map((field) => ({
          id: field.id,
          label: field.label,
          type: normalizeServiceFieldType(field.type),
          options: (field.options ?? []).map(normalizeOption),
          required: field.required,
          value: field.defaultValue ?? field.value ?? '',
        }))
        : undefined;
      const unitPrice = result.isService && product
        ? calculateServiceUnitPrice(product, result.variantId, serviceVariables, serviceFields)
        : result.price;
      setItems([...items, {
        id: createOrderLineId(),
        productId: result.productId,
        variantId: result.variantId,
        quantity: 1,
        unitPrice,
        serviceId: result.isService ? result.productId : undefined,
        selectedOptions: hasOrderOptions ? buildDefaultSelectedOptions(result.productId) : undefined,
        serviceVariables,
        serviceFields,
      }]);
    }
    setSearchQuery('');
    setShowProductSearch(false);
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const newItems = [...items];
    const newQty = newItems[index].quantity + delta;

    if (newQty <= 0) {
      const removedLineId = getOrderItemLineId(newItems[index], index);
      newItems.splice(index, 1);
      setServices((current) => current.filter((service) => service.linkedItemId !== removedLineId));
    } else {
      const product = products.find((p) => p.id === newItems[index].productId);
      const isService = product ? normalizeProductType(product.productType) === 'service' : false;
      const variant = product?.variants.find((v) => v.id === newItems[index].variantId);
      if (isService) {
        newItems[index].quantity = newQty;
      } else if ((product?.orderOptions?.length ?? 0) > 0 || (variant && newQty <= variant.stock)) {
        newItems[index].quantity = newQty;
      }
    }

    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const removedLineId = getOrderItemLineId(items[index], index);
    setItems(items.filter((_, i) => i !== index));
    setServices((current) => current.filter((service) => service.linkedItemId !== removedLineId));
  };

  const openAddServiceForItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingServiceItemId(getOrderItemLineId(item, index));
    setShowServiceModal(true);
  };

  const closeServiceModal = () => {
    setShowServiceModal(false);
    setPendingServiceItemId(null);
    setAddonSearchQuery('');
  };

  const filteredCustomServices = useMemo(() => {
    const query = addonSearchQuery.trim().toLowerCase();
    return [...customServices]
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
      .filter((service) => !query || service.name.toLowerCase().includes(query));
  }, [addonSearchQuery, customServices]);

  const handleOrderOptionUpdate = (itemIndex: number, optionName: string, value: string) => {
    setItems((prev) => prev.map((item, index) => {
      if (index !== itemIndex) return item;
      return {
        ...item,
        selectedOptions: {
          ...(item.selectedOptions ?? {}),
          [optionName]: value,
        },
      };
    }));
  };

  const handleAddService = (serviceId: string) => {
    const service = customServices.find((entry) => entry.id === serviceId);
    if (!service) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextServices = [...services, {
      serviceId: service.id,
      name: service.name,
      price: service.defaultPrice,
      linkedItemId: pendingServiceItemId ?? undefined,
    }];
    setServices(nextServices);
    setShowServiceModal(false);
    setPendingServiceItemId(null);

    if (service.defaultPrice === 0) {
      setEditingServiceIndex(nextServices.length - 1);
      setServicePriceInput('');
      setShowServicePriceModal(true);
    }
  };

  const handleRemoveService = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setServices(services.filter((_, serviceIndex) => serviceIndex !== index));
  };

  const openEditServicePrice = (index: number) => {
    const selected = services[index];
    if (!selected) return;
    setEditingServiceIndex(index);
    setServicePriceInput(selected.price ? selected.price.toString() : '');
    setShowServicePriceModal(true);
  };

  const confirmEditServicePrice = () => {
    if (editingServiceIndex === null) return;
    const parsed = Number.parseFloat(servicePriceInput);
    const nextPrice = Number.isFinite(parsed) ? parsed : 0;
    setServices(services.map((service, index) => (
      index === editingServiceIndex ? { ...service, price: nextPrice } : service
    )));
    setEditingServiceIndex(null);
    setServicePriceInput('');
    setShowServicePriceModal(false);
  };


  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const applyWooOrderLink = (wooOrder: WooNormalizedOrder) => {
    setWebsiteOrderRef(wooOrder.websiteOrderReference);
    setShowWooSuggestions(false);
    setSelectedWooOrderPreview({
      reference: wooOrder.websiteOrderReference,
      customerName: wooOrder.customerName,
      customerEmail: wooOrder.customerEmail,
    });
  };

  const loadWooSuggestions = async () => {
    if (
      wooLookupLoadedRef.current
      || isFetchingWooSuggestions
      || !hasWooCommerceConnection
      || !woocommerceStoreUrl
      || !woocommerceConsumerKey
      || !woocommerceConsumerSecret
    ) {
      return;
    }

    setIsFetchingWooSuggestions(true);
    try {
      const { orders: recentWooOrders } = await fetchWooCommerceOrders({
        storeUrl: woocommerceStoreUrl,
        consumerKey: woocommerceConsumerKey,
        consumerSecret: woocommerceConsumerSecret,
        limit: 50,
      });
      setWooLookupOrders(recentWooOrders);
      wooLookupLoadedRef.current = true;
    } catch {
      // Keep the form usable even if suggestions fail.
    } finally {
      setIsFetchingWooSuggestions(false);
    }
  };

  const handleWebsiteOrderRefChange = (value: string) => {
    setWebsiteOrderRef(value);

    if (
      selectedWooOrderPreview
      && normalizeWooLookupValue(selectedWooOrderPreview.reference) !== normalizeWooLookupValue(value)
    ) {
      setSelectedWooOrderPreview(null);
    }

    const hasValue = value.trim().length > 0;
    setShowWooSuggestions(hasValue);
    if (hasValue && !wooLookupLoadedRef.current) {
      void loadWooSuggestions();
    }
  };

  const handleSelectWooSuggestion = async (wooOrder: WooNormalizedOrder) => {
    if (!businessId) {
      showToast('error', 'No business selected.');
      return;
    }

    setIsPullingWooOrder(true);
    try {
      applyWooOrderLink(wooOrder);
      showToast('success', `Woo order ${wooOrder.websiteOrderReference} linked.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (selectionError) {
      const message = selectionError instanceof Error && selectionError.message
        ? selectionError.message
        : 'Could not pull WooCommerce order.';
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPullingWooOrder(false);
    }
  };

  const wooSuggestions = useMemo(() => {
    const lookup = normalizeWooLookupValue(websiteOrderRef);
    if (!lookup) return [] as WooNormalizedOrder[];

    return wooLookupOrders
      .filter((order) => {
        const candidates = [
          order.websiteOrderReference,
          order.orderNumber,
          order.customerEmail,
          order.customerName,
        ]
          .map((value) => normalizeWooLookupValue(value))
          .filter(Boolean);

        return candidates.some((value) => value.includes(lookup));
      })
      .slice(0, 6);
  }, [websiteOrderRef, wooLookupOrders]);

  const handlePullWooOrder = async () => {
    const reference = websiteOrderRef.trim();

    if (!businessId) {
      showToast('error', 'No business selected.');
      return;
    }

    if (!reference) {
      showToast('error', 'Enter a WooCommerce order ID first.');
      return;
    }

    if (!hasWooCommerceConnection || !woocommerceStoreUrl || !woocommerceConsumerKey || !woocommerceConsumerSecret) {
      showToast('error', 'Set up WooCommerce first in Settings.');
      return;
    }

    setIsPullingWooOrder(true);

    try {
      const wooOrder = await fetchWooCommerceOrder({
        storeUrl: woocommerceStoreUrl,
        consumerKey: woocommerceConsumerKey,
        consumerSecret: woocommerceConsumerSecret,
        reference,
      });
      applyWooOrderLink(wooOrder);
      showToast('success', `Woo order ${wooOrder.websiteOrderReference} linked to this draft.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (pullError) {
      const message = pullError instanceof Error && pullError.message
        ? pullError.message
        : 'Could not pull WooCommerce order.';
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPullingWooOrder(false);
    }
  };

  const handleSubmit = async () => {
    if (!customerName.trim() || items.length === 0 || isSubmitting || submitGuard.current) return;
    const missingRequiredService = items.some((item) =>
      (item.serviceVariables ?? []).some((variable) =>
        variable.required && !(variable.value ?? '').toString().trim()
      ) || (item.serviceFields ?? []).some((field) =>
        field.required && !(field.value ?? '').toString().trim()
      )
    );
    if (missingRequiredService) {
      showToast('error', 'Please complete required service fields.');
      return;
    }

    submitGuard.current = true;
    setIsSubmitting(true);

    try {
      // Small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 300));

      let resolvedCustomerId = selectedCustomerId ?? undefined;

      if (!resolvedCustomerId && customerName.trim()) {
        const normalizedEmail = customerEmail.trim().toLowerCase();
        const normalizedPhone = customerPhone.trim();
        const normalizedName = customerName.trim().toLowerCase();

        const existingCustomer = customers.find((customer) =>
          (normalizedEmail && customer.email.toLowerCase() === normalizedEmail) ||
          (normalizedPhone && customer.phone === normalizedPhone) ||
          customer.fullName.toLowerCase() === normalizedName
        );

        if (existingCustomer) {
          resolvedCustomerId = existingCustomer.id;
        } else {
          const newCustomerId = Math.random().toString(36).substring(2, 15);
          const newCustomer: Customer = {
            id: newCustomerId,
            fullName: customerName.trim(),
            email: customerEmail.trim(),
            phone: customerPhone.trim(),
            defaultState: isServiceOrder ? '' : deliveryState,
            defaultAddress: isServiceOrder ? '' : deliveryAddress.trim(),
            createdAt: new Date().toISOString(),
          };
          await addCustomer(newCustomer, businessId);
          resolvedCustomerId = newCustomerId;
        }
      }

      // Compute the order date - use today or selected date
      const orderDateValue = orderDateType === 'today' ? new Date() : selectedDate;
      const orderNumber = generateOrderNumber();
      const orderDateIso = orderDateValue.toISOString();
      const resolvedTimeline = resolveOrderTimeline({ orderTypeId, deliveryState: isServiceOrder ? '' : deliveryState }, orderTimelineSettings);
      const fulfillmentOriginalEta = addBusinessDays(new Date(orderDateValue), resolvedTimeline.maxBusinessDays);

      const order = {
        id: Math.random().toString(36).substring(2, 15),
        orderNumber,
        customerTrackingCode: getCustomerTrackingCode({ id: '', orderNumber, customerTrackingCode: undefined }),
        websiteOrderReference: websiteOrderRef.trim() || undefined,
        customerId: resolvedCustomerId,
        customerName: customerName.trim(),
        customerNote: customerPrescription?.text?.trim() || undefined,
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        deliveryState: isServiceOrder ? '' : deliveryState,
        deliveryAddress: isServiceOrder ? '' : deliveryAddress.trim(),
        orderTypeId: resolvedTimeline.orderType.id,
        orderTypeName: resolvedTimeline.orderType.name,
        items,
        services,
        additionalCharges: additionalChargesNum,
        additionalChargesNote: additionalChargesNote.trim(),
        deliveryFee: isServiceOrder ? 0 : deliveryFeeNum,
        discountCode: discountCode.trim() || undefined,
        discountAmount: discountAmountNum || undefined,
        paymentMethod,
        orderClassification,
        status: 'Processing',
        source,
        subtotal,
        totalAmount,
        prescription: customerPrescription,
        fulfillmentStartedAt: orderDateIso,
        fulfillmentTimelineDays: resolvedTimeline.maxBusinessDays,
        fulfillmentOriginalEta: fulfillmentOriginalEta.toISOString(),
        fulfillmentEffectiveEta: fulfillmentOriginalEta.toISOString(),
        orderDate: orderDateIso,
        createdAt: orderDateIso,
        updatedAt: new Date().toISOString(),
        createdBy: currentUser?.name,
      };

      await addOrder(order, businessId);

      const socialCheckoutCode = /^SC-(.+)$/i.exec(socialCheckoutReference.trim())?.[1];
      if (socialCheckoutCode && businessId) {
        try {
          const checkoutRows = await supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId);
          const paymentDraft = checkoutRows.find((row) => row.data.id === socialCheckoutCode)?.data;
          if (paymentDraft) {
            const linkedAt = new Date().toISOString();
            await supabaseData.upsertCollection('social_checkouts', businessId, [{
              ...paymentDraft,
              status: 'verified',
              convertedOrderId: order.id,
              reviewedBy: currentUser?.name,
              reviewedAt: linkedAt,
              updatedAt: linkedAt,
            }]);
            queueSocialCheckoutEmail({
              type: 'order_created',
              businessId,
              checkoutCode: socialCheckoutCode,
              orderId: order.id,
            });
          }
        } catch (linkError) {
          console.warn('Social checkout link update failed:', linkError);
        }
      }

      // Deduct stock after order is persisted
      await Promise.all(
        items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          const isService = product ? normalizeProductType(product.productType) === 'service' : false;
          if (isService) return Promise.resolve();
          return updateVariantStock(item.productId, item.variantId, -item.quantity, businessId);
        })
      );

      // Send push notification to team
      if (businessId) {
        sendOrderNotification({
          businessId,
          orderNumber: order.orderNumber,
          customerName: order.customerName || 'Walk-in',
          totalAmount: formatCurrency(totalAmount),
          createdBy: currentUser?.name,
        }).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (params.aiParsed === 'true') {
        showToast('success', 'Draft order created successfully.');
        setTimeout(() => router.replace('/orders'), 900);
      } else {
        showToast('success', 'Order saved successfully.');
        setTimeout(() => router.back(), 900);
      }
    } catch (error) {
      console.warn('Order save failed:', error);
      showToast('error', 'Could not save this order. Please try again.');
    } finally {
      submitGuard.current = false;
      setIsSubmitting(false);
    }
  };

  const getItemDetails = (item: OrderItem) => {
    const product = products.find((p) => p.id === item.productId);
    const isService = product ? normalizeProductType(product.productType) === 'service' : false;
    const usesGlobalPricing = product?.serviceUsesGlobalPricing ?? true;
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const variantName = isService
      ? (product?.categories?.[0] ?? 'Service')
      : (variant ? Object.values(variant.variableValues).join(' / ') : (item.variantName ?? ''));
    return {
      productName: product?.name || item.productName || 'Product unavailable',
      variantName,
      stock: variant?.stock || 0,
      isService,
      usesGlobalPricing,
      orderOptions: product?.orderOptions ?? [],
    };
  };

  const handleServiceVariableUpdate = (itemIndex: number, variableId: string, value: string) => {
    setItems((prev) => prev.map((item, index) => {
      if (index !== itemIndex) return item;
      const nextVars = (item.serviceVariables ?? []).map((variable) =>
        variable.id === variableId ? { ...variable, value } : variable
      );
      const product = products.find((p) => p.id === item.productId);
      const isService = product ? normalizeProductType(product.productType) === 'service' : false;
      if (!product || !isService) {
        return { ...item, serviceVariables: nextVars };
      }

      return {
        ...item,
        serviceVariables: nextVars,
        unitPrice: calculateServiceUnitPrice(product, item.variantId, nextVars, item.serviceFields),
      };
    }));
  };

  const handleServiceFieldUpdate = (itemIndex: number, fieldId: string, value: string) => {
    setItems((prev) => prev.map((item, index) => {
      if (index !== itemIndex) return item;
      const nextFields = (item.serviceFields ?? []).map((field) =>
        field.id === fieldId ? { ...field, value } : field
      );
      const product = products.find((p) => p.id === item.productId);
      const isService = product ? normalizeProductType(product.productType) === 'service' : false;
      if (!product || !isService) {
        return { ...item, serviceFields: nextFields };
      }
      return {
        ...item,
        serviceFields: nextFields,
        unitPrice: calculateServiceUnitPrice(product, item.variantId, item.serviceVariables, nextFields),
      };
    }));
  };

  const openOrderDatePicker = () => {
    const initialDate = selectedDate;
    setDatePickerTarget({ type: 'order' });
    setPickerDate(initialDate);
    setCalendarViewDate(initialDate);
    setShowDatePicker(true);
  };

  const openServiceFieldDatePicker = (itemIndex: number, fieldId: string, currentValue: string) => {
    const parsedDate = parseIsoDateString(currentValue) ?? new Date();
    setDatePickerTarget({ type: 'serviceField', itemIndex, fieldId });
    setPickerDate(parsedDate);
    setCalendarViewDate(parsedDate);
    setShowDatePicker(true);
  };

  const openServiceFieldTimePicker = (itemIndex: number, fieldId: string, currentValue: string) => {
    const parsedTime = parseTimeString(currentValue);
    const fallback = new Date();
    setTimePickerTarget({ itemIndex, fieldId });
    setPickerHour(parsedTime?.hour ?? fallback.getHours());
    setPickerMinute(parsedTime?.minute ?? fallback.getMinutes());
    setShowTimePicker(true);
  };

  const commitDatePickerValue = () => {
    if (!datePickerTarget) {
      setShowDatePicker(false);
      return;
    }

    if (datePickerTarget.type === 'order') {
      setSelectedDate(pickerDate);
      setOrderDateType('another');
    } else {
      handleServiceFieldUpdate(datePickerTarget.itemIndex, datePickerTarget.fieldId, toIsoDateString(pickerDate));
    }

    setShowDatePicker(false);
    setDatePickerTarget(null);
  };

  const commitTimePickerValue = () => {
    if (!timePickerTarget) {
      setShowTimePicker(false);
      return;
    }
    handleServiceFieldUpdate(timePickerTarget.itemIndex, timePickerTarget.fieldId, toTimeString(pickerHour, pickerMinute));
    setShowTimePicker(false);
    setTimePickerTarget(null);
  };

  const contentWrapperStyle: StyleProp<ViewStyle> = isDesktopWeb
    ? { width: '100%', maxWidth: webMaxWidth, alignSelf: 'flex-start', paddingHorizontal: 28, paddingBottom: 56 }
    : isDesktop
      ? { maxWidth: 1120, alignSelf: 'center', width: '100%' }
      : undefined;

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: canvasBg }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" style={{ backgroundColor: canvasBg }}>
      <View
        style={[
          { flex: 1, backgroundColor: panelBg },
          isDesktopWeb
            ? { width: '100%' }
            : null,
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
        {/* Header */}
        {isDesktopWeb ? (
          <View style={{ backgroundColor: colors.bg.primary, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View
              style={{
                paddingHorizontal: 28,
                paddingTop: 20,
                paddingBottom: 12,
                width: '100%',
                maxWidth: webMaxWidth,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <Pressable
                    onPress={() => router.back()}
                    className="active:opacity-70"
                    style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                  >
                    <ArrowLeft size={19} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                  <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }} numberOfLines={1}>
                    {isServiceOrder ? 'New Service Order' : 'New Product Order'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Button
                    onPress={() => router.back()}
                    fullWidth={false}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    onPress={handleSubmit}
                    disabled={!customerName.trim() || items.length === 0 || isSubmitting}
                    fullWidth={false}
                    size="sm"
                    variant="primary"
                    loading={isSubmitting}
                    loadingText="Creating..."
                  >
                    {isServiceOrder ? 'Create Service Order' : 'Create Order'}
                  </Button>
                </View>
              </View>
            </View>
          </View>
        ) : (
        <View className="flex-row items-center justify-between px-5 py-4" style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-full items-center justify-center active:opacity-50" style={{ backgroundColor: colors.bg.secondary }}>
            <X size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text className={cn('text-lg font-bold', textPrimaryClass)}>
            {isServiceOrder ? 'New Service Order' : 'New Product Order'}
          </Text>
          {/* Empty spacer for layout balance */}
          <View className="w-10 h-10" />
        </View>
        )}

        {/* AI-Parsed Banner */}
        {params.aiParsed === 'true' && (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 flex-row items-center border', isDark ? 'bg-[#1C1C1C] border-[#2F2F2F]' : 'bg-purple-50 border-purple-200')}>
            <View className="w-10 h-10 rounded-full bg-purple-500 items-center justify-center mr-3">
              <Sparkles size={20} color="#FFFFFF" strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className={cn('font-bold text-sm mb-1', isDark ? 'text-purple-200' : 'text-purple-900')}>AI-Parsed Order Draft</Text>
              <Text className={cn('text-xs leading-5', isDark ? 'text-purple-300' : 'text-purple-700')}>
                Review and edit the information below. {params.notes ? 'Note: ' + params.notes : ''}
              </Text>
            </View>
          </View>
        )}

        {(() => {
          const socialCheckoutSection = hasSocialCheckoutPrefill ? (
            <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className={cn(sectionTitleClass, textPrimaryClass)}>Social Checkout Reference</Text>
                  <Text className={cn('text-xs mt-1', textMutedClass)}>Payment confirmed before order creation.</Text>
                </View>
                <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{socialCheckoutReference || websiteOrderRef}</Text>
                </View>
              </View>
              {socialCheckoutAmount > 0 ? (
                <View className="flex-row items-center justify-between mb-3">
                  <Text className={cn('text-sm', textSecondaryClass)}>Paid Amount</Text>
                  <Text className={cn('text-sm font-semibold', textPrimaryClass)}>{formatCurrency(socialCheckoutAmount)}</Text>
                </View>
              ) : null}
              {socialCheckoutBill.trim() ? (
                <View className="rounded-2xl p-4" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                  <Text className={cn('text-xs font-semibold uppercase tracking-wider mb-2', textMutedClass)}>What They Ordered</Text>
                  <Text className={cn('text-sm leading-6', textPrimaryClass)}>{socialCheckoutBill.trim()}</Text>
                </View>
              ) : null}
            </View>
          ) : null;

          const orderFlowSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <Text className={cn(sectionTitleClass, textPrimaryClass)}>Order Flow</Text>
            <Text className={cn('text-xs mt-1 mb-4', textMutedClass)}>
              This order stays in one flow. Product orders handle physical items, service orders handle services only.
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setOrderFlowMode('product');
                }}
                className="flex-1 rounded-full items-center justify-center active:opacity-70"
                style={{
                  height: 42,
                  backgroundColor: !isServiceOrder ? colors.text.primary : colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: !isServiceOrder ? colors.text.primary : colors.border.light,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: !isServiceOrder ? colors.bg.primary : colors.text.primary }}
                >
                  Product Order
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setOrderFlowMode('service');
                }}
                className="flex-1 rounded-full items-center justify-center active:opacity-70"
                style={{
                  height: 42,
                  backgroundColor: isServiceOrder ? colors.text.primary : colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: isServiceOrder ? colors.text.primary : colors.border.light,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: isServiceOrder ? colors.bg.primary : colors.text.primary }}
                >
                  Service Order
                </Text>
              </Pressable>
            </View>
          </View>
          );

          const coreDetailsSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className={cn(sectionTitleClass, textPrimaryClass)}>Core Details</Text>
                <Text className={cn('text-xs mt-1', textMutedClass)}>
                  {isServiceOrder
                    ? 'Customer and order reference details for this service order.'
                    : 'Customer, delivery, and order reference details.'}
                </Text>
              </View>
              {customers.length > 0 && (
                <Pressable
                  onPress={() => setShowCustomerSearch(!showCustomerSearch)}
                  className="px-3 rounded-full flex-row items-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 34 }}
                >
                  <Users size={14} color={colors.text.primary} strokeWidth={2} />
                  <Text className="font-semibold text-xs ml-1.5" style={{ color: colors.text.primary }}>
                    {selectedCustomerId ? 'Change' : 'Search'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Customer Search */}
            {showCustomerSearch && (
              <View className="mb-4">
                <View className={cn('flex-row items-center rounded-xl px-3 border', softCardClass)}>
                  <Search size={18} color={colors.text.muted} strokeWidth={2} />
                  <TextInput
                    placeholder="Search by name, phone, or email..."
                    placeholderTextColor={colors.input.placeholder}
                    value={customerSearchQuery}
                    onChangeText={setCustomerSearchQuery}
                    autoFocus
                    className="flex-1 py-3 px-2"
                    style={{ color: colors.input.text }}
                  />
                  <SearchClearButton visible={Boolean(customerSearchQuery.trim())} onPress={() => setCustomerSearchQuery('')} />
                </View>
                {customerSearchResults.length > 0 && (
                  <View className={cn('mt-2 rounded-xl overflow-hidden border', softCardClass)}>
                    {customerSearchResults.slice(0, 5).map((customer) => (
                      <Pressable
                        key={customer.id}
                        onPress={() => handleSelectCustomer(customer)}
                        className="flex-row items-center p-3 border-b active:opacity-70"
                        style={{ borderBottomColor: colors.border.light }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{
                            backgroundColor: isDark ? '#F3F4F6' : '#111111',
                            borderWidth: 1,
                            borderColor: isDark ? '#E5E7EB' : '#2C2C2C',
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: isDark ? '#111111' : '#FFFFFF' }}
                          >
                            {getInitials(customer.fullName)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className={cn('font-semibold text-sm', textPrimaryClass)}>{customer.fullName}</Text>
                          <Text className={cn('text-xs', textMutedClass)}>
                            {customer.phone || customer.email || 'No contact info'}
                          </Text>
                        </View>
                        {selectedCustomerId === customer.id && (
                          <Check size={18} color="#059669" strokeWidth={2} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
                {customerSearchResults.length === 0 && customerSearchQuery.trim() && (
                  <View className={cn('mt-2 p-4 rounded-xl items-center', softCardClass)}>
                    <Text className={cn('text-sm', textMutedClass)}>No customers found</Text>
                  </View>
                )}
              </View>
            )}

            {/* Selected Customer Indicator */}
            {selectedCustomerId && (
              <View className="flex-row items-center justify-between mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <View className="flex-row items-center">
                  <Check size={16} color="#059669" strokeWidth={2} />
                  <Text className="text-emerald-700 font-medium text-sm ml-2">Existing customer selected</Text>
                </View>
                <Pressable onPress={handleClearCustomer} className="active:opacity-50">
                  <X size={18} color="#059669" strokeWidth={2} />
                </Pressable>
              </View>
            )}

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Full Name *</Text>
              <TextInput
                placeholder="Enter customer name"
                placeholderTextColor="#9CA3AF"
                value={customerName}
                onChangeText={setCustomerName}
                className={cn('rounded-xl px-4 py-3 text-base border', softCardClass)}
                style={{ color: colors.input.text }}
              />
            </View>

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Phone Number</Text>
              <TextInput
                placeholder="+234 xxx xxx xxxx"
                placeholderTextColor="#9CA3AF"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                className={cn('rounded-xl px-4 py-3 text-base border', softCardClass)}
                style={{ color: colors.input.text }}
              />
            </View>

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Email</Text>
              <TextInput
                placeholder="email@example.com"
                placeholderTextColor="#9CA3AF"
                value={customerEmail}
                onChangeText={setCustomerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                className={cn('rounded-xl px-4 py-3 text-base border', softCardClass)}
                style={{ color: colors.input.text }}
              />
            </View>

            {!isServiceOrder && (
              <>
                <View className="mb-4">
                  <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Delivery State</Text>
                  <Pressable
                    onPress={() => {
                      setShowStateModal(!showStateModal);
                      if (showStateModal) setStateSearchQuery('');
                    }}
                    className={cn('rounded-xl px-4 py-3 flex-row items-center justify-between border', softCardClass)}
                  >
                    <Text className={cn('text-base', deliveryState ? textPrimaryClass : textMutedClass)}>
                      {deliveryState || 'Select state'}
                    </Text>
                    <ChevronDown size={20} color="#6B7280" strokeWidth={2} />
                  </Pressable>
                  {showStateModal && (
                    <View
                      className={cn('rounded-xl mt-2 overflow-hidden border', cardClass)}
                    >
                      <View className="flex-row items-center px-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                        <Search size={16} color={colors.input.placeholder} strokeWidth={2} />
                        <TextInput
                          placeholder="Search state"
                          placeholderTextColor={colors.input.placeholder}
                          value={stateSearchQuery}
                          onChangeText={setStateSearchQuery}
                          className="flex-1 px-2 py-3 text-sm"
                          style={{ color: colors.input.text }}
                        />
                        <SearchClearButton visible={Boolean(stateSearchQuery.trim())} onPress={() => setStateSearchQuery('')} />
                      </View>
                      {Platform.OS === 'web' ? (
                        <View style={{ maxHeight: 260, overflowY: 'auto' } as any}>
                          {filteredNigeriaStates.length > 0 ? filteredNigeriaStates.map((state) => (
                            <Pressable
                              key={state}
                              onPress={() => {
                                setDeliveryState(state);
                                setShowStateModal(false);
                                setStateSearchQuery('');
                              }}
                              className="flex-row items-center justify-between px-4 py-2.5 border-b active:opacity-70"
                              style={{ borderBottomColor: colors.border.light }}
                            >
                              <Text
                                style={{ color: deliveryState === state ? colors.text.primary : colors.text.secondary }}
                                className={cn('text-sm', deliveryState === state && 'font-semibold')}
                              >
                                {state}
                              </Text>
                              {deliveryState === state && <Check size={16} color={colors.text.primary} strokeWidth={2} />}
                            </Pressable>
                          )) : (
                            <Text style={{ color: colors.text.tertiary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 14 }}>
                              No states match your search.
                            </Text>
                          )}
                        </View>
                      ) : (
                        <ScrollView
                          style={{ maxHeight: 260 }}
                          showsVerticalScrollIndicator
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                        >
                          {filteredNigeriaStates.length > 0 ? filteredNigeriaStates.map((state) => (
                            <Pressable
                              key={state}
                              onPress={() => {
                                setDeliveryState(state);
                                setShowStateModal(false);
                                setStateSearchQuery('');
                                Haptics.selectionAsync();
                              }}
                              className="flex-row items-center justify-between px-4 py-2.5 border-b active:opacity-70"
                              style={{ borderBottomColor: colors.border.light }}
                            >
                              <Text
                                style={{ color: deliveryState === state ? colors.text.primary : colors.text.secondary }}
                                className={cn('text-sm', deliveryState === state && 'font-semibold')}
                              >
                                {state}
                              </Text>
                              {deliveryState === state && <Check size={16} color={colors.text.primary} strokeWidth={2} />}
                            </Pressable>
                          )) : (
                            <Text style={{ color: colors.text.tertiary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 14 }}>
                              No states match your search.
                            </Text>
                          )}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>

                <View className="mb-4">
                  <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Delivery Address</Text>
                  <TextInput
                    placeholder="Enter full delivery address"
                    placeholderTextColor="#9CA3AF"
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    multiline
                    numberOfLines={3}
                    className={cn('rounded-xl px-4 py-3 text-base border', softCardClass)}
                    style={{ color: colors.input.text, minHeight: 80, textAlignVertical: 'top' }}
                  />
                </View>

              </>
            )}

          </View>
          );

          const orderMetaSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <View className="mb-4">
              <Text className={cn(sectionTitleClass, textPrimaryClass)}>Order Type &amp; Reference</Text>
              <Text className={cn('text-xs mt-1', textMutedClass)}>Delivery timeline and website order linkage.</Text>
            </View>

            {!isServiceOrder && (
              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-2')} style={{ color: colors.text.secondary }}>Order Type</Text>
                <Pressable
                  onPress={() => setShowOrderTypeMenu((open) => !open)}
                  className="rounded-xl px-4 flex-row items-center justify-between active:opacity-70"
                  style={{
                    minHeight: 48,
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                    {selectedOrderType.name}
                  </Text>
                  <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
                {showOrderTypeMenu ? (
                  <View
                    className="mt-2 rounded-2xl overflow-hidden"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    {orderTimelineSettings.orderTypes.map((type, index) => {
                      const isSelected = type.id === selectedOrderType.id;
                      return (
                        <Pressable
                          key={type.id}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setOrderTypeId(type.id);
                            setShowOrderTypeMenu(false);
                          }}
                          className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                          style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border.light } : undefined}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: isSelected ? '600' : '400' }}>
                            {type.name}
                          </Text>
                          {isSelected ? <Check size={16} color={colors.text.primary} strokeWidth={2.4} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <View
                  className="mt-3 rounded-2xl p-4 border"
                  style={{ backgroundColor: colors.bg.secondary, borderColor: colors.border.light }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-bold">
                    Estimated delivery: {estimatedDeliveryPreview}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    {fulfillmentTimelinePreview.minBusinessDays}-{fulfillmentTimelinePreview.maxBusinessDays} business days
                    {fulfillmentTimelinePreview.shippingZone ? ` · ${fulfillmentTimelinePreview.shippingZone.name}` : ''}
                  </Text>
                </View>
              </View>
            )}

            <View>
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Website Order Ref (WooCommerce)</Text>
              <TextInput
                placeholder="e.g. 47581 or WC-47581"
                placeholderTextColor="#9CA3AF"
                value={websiteOrderRef}
                onChangeText={handleWebsiteOrderRefChange}
                onFocus={() => {
                  setShowWooSuggestions(Boolean(websiteOrderRef.trim()));
                  if (!wooLookupLoadedRef.current) {
                    void loadWooSuggestions();
                  }
                }}
                className={cn('rounded-xl px-4 h-[52px] text-base border', softCardClass)}
                style={{ color: colors.input.text }}
              />

              {showWooSuggestions && (wooSuggestions.length > 0 || isFetchingWooSuggestions) ? (
                <View
                  className={cn('mt-2 rounded-2xl border overflow-hidden', cardClass)}
                  style={{ backgroundColor: colors.bg.primary }}
                >
                  {isFetchingWooSuggestions && wooSuggestions.length === 0 ? (
                    <View className="px-4 py-3 flex-row items-center">
                      <ActivityIndicator size="small" color={colors.text.primary} />
                      <Text className={cn('ml-3 text-sm', textSecondaryClass)}>Loading WooCommerce orders...</Text>
                    </View>
                  ) : null}
                  {wooSuggestions.map((wooOrder, index) => (
                    <Pressable
                      key={`${wooOrder.externalId}-${wooOrder.websiteOrderReference}`}
                      onPress={() => {
                        void handleSelectWooSuggestion(wooOrder);
                      }}
                      className="px-4 py-3 active:opacity-70"
                      style={{
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                      }}
                    >
                      <Text className={cn('text-sm font-semibold', textPrimaryClass)}>
                        {wooOrder.websiteOrderReference}
                      </Text>
                      <Text className={cn('mt-1 text-xs', textSecondaryClass)}>
                        {wooOrder.customerEmail || wooOrder.customerName || 'No customer email'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {selectedWooOrderPreview ? (
                <View
                  className={cn('mt-2 rounded-2xl border p-3', cardClass)}
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Text className={cn('text-xs font-semibold uppercase tracking-wider', textMutedClass)}>
                    Woo order selected
                  </Text>
                  <Text className={cn('mt-1 text-sm font-semibold', textPrimaryClass)}>
                    {selectedWooOrderPreview.reference}
                  </Text>
                  <Text className={cn('mt-1 text-xs', textSecondaryClass)}>
                    {selectedWooOrderPreview.customerEmail || selectedWooOrderPreview.customerName}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          );

          const itemsSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <View className="mb-4">
              {isDesktop ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className={cn(sectionTitleClass, textPrimaryClass)}>{isServiceOrder ? 'Services *' : 'Products *'}</Text>
                    <Text className={cn('text-xs mt-1', textMutedClass)}>
                      {isServiceOrder ? 'Add services from your service catalog.' : 'Add products from your inventory catalog.'}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    {!isServiceOrder ? (
                    <Pressable
                      onPress={() => {
                        setItemTypeTab('product');
                        setShowProductSearch(true);
                      }}
                      className="px-3 rounded-full flex-row items-center justify-center active:opacity-70"
                      style={{
                        backgroundColor: isProductTabActive ? itemActionButtonColor : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: isProductTabActive ? itemActionButtonColor : colors.border.light,
                        height: 34,
                      }}
                    >
                      <Plus size={14} color={isProductTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor} strokeWidth={2.2} />
                      <Text
                        className="font-semibold text-xs ml-1.5"
                        style={{ color: isProductTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor }}
                      >
                        Add Product
                      </Text>
                    </Pressable>
                    ) : null}
                    {isServiceOrder ? (
                      <Pressable
                        onPress={() => {
                          setItemTypeTab('service');
                          setShowProductSearch(true);
                        }}
                        className="px-3 rounded-full flex-row items-center justify-center active:opacity-70"
                        style={{
                          backgroundColor: isServiceTabActive ? itemActionButtonColor : colors.bg.secondary,
                          borderWidth: 1,
                          borderColor: isServiceTabActive ? itemActionButtonColor : colors.border.light,
                          height: 34,
                        }}
                      >
                        <Plus size={14} color={isServiceTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor} strokeWidth={2.2} />
                        <Text
                          className="font-semibold text-xs ml-1.5"
                          style={{ color: isServiceTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor }}
                        >
                          Add Service
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : (
                <>
                  <View className="flex-col items-stretch">
                    <View>
                      <Text className={cn(sectionTitleClass, textPrimaryClass)}>{isServiceOrder ? 'Services *' : 'Products *'}</Text>
                      <Text className={cn('text-xs mt-1', textMutedClass)}>
                        {isServiceOrder ? 'Add services from your service catalog.' : 'Add products from your inventory catalog.'}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2 mt-3">
                    {!isServiceOrder ? (
                    <Pressable
                      onPress={() => {
                        setItemTypeTab('product');
                        setShowProductSearch(true);
                      }}
                      className="px-3 rounded-full flex-row items-center justify-center active:opacity-70"
                      style={{
                        flex: 1,
                        backgroundColor: isProductTabActive ? itemActionButtonColor : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: isProductTabActive ? itemActionButtonColor : colors.border.light,
                        height: 38,
                      }}
                    >
                      <Plus size={14} color={isProductTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor} strokeWidth={2.2} />
                      <Text
                        className="font-semibold text-xs ml-1.5"
                        style={{ color: isProductTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor }}
                      >
                        Add Product
                      </Text>
                    </Pressable>
                    ) : null}
                    {isServiceOrder ? (
                      <Pressable
                        onPress={() => {
                          setItemTypeTab('service');
                          setShowProductSearch(true);
                        }}
                        className="px-3 rounded-full flex-row items-center justify-center active:opacity-70"
                        style={{
                          flex: 1,
                          backgroundColor: isServiceTabActive ? itemActionButtonColor : colors.bg.secondary,
                          borderWidth: 1,
                          borderColor: isServiceTabActive ? itemActionButtonColor : colors.border.light,
                          height: 38,
                        }}
                      >
                        <Plus size={14} color={isServiceTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor} strokeWidth={2.2} />
                        <Text
                          className="font-semibold text-xs ml-1.5"
                          style={{ color: isServiceTabActive ? itemActionButtonActiveTextColor : itemActionButtonColor }}
                        >
                          Add Service
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              )}
            </View>

            {/* Item Search */}
            {showProductSearch && (
              <View className="mb-4">
                <View className={cn('flex-row items-center rounded-xl px-3 border', softCardClass)}>
                  <Search size={18} color="#9CA3AF" strokeWidth={2} />
                  <TextInput
                    placeholder={itemTypeTab === 'service'
                      ? 'Search services (e.g., Installation)'
                      : 'Search products or variants (e.g., Sam, Black, Gold)'}
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                    className={cn('flex-1 py-3 px-2 text-base', textPrimaryClass)}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
                </View>

                {searchResults.length > 0 && (
                  <View className={cn('mt-2 rounded-xl border max-h-60', cardClass)}>
                    <ScrollView nestedScrollEnabled>
                      {searchResults.map((result) => {
                        const isSelected = items.some(
                          (item) => item.productId === result.productId && item.variantId === result.variantId
                        );
                        return (
                          <Pressable
                            key={`${result.productId}-${result.variantId}`}
                            onPress={() => handleAddProduct(result)}
                            className={cn(
                              'flex-row items-center p-3 border-b border-gray-100',
                              isSelected ? 'bg-emerald-50' : 'active:bg-gray-50'
                            )}
                          >
                            <View className="w-10 h-10 bg-gray-100 rounded-lg items-center justify-center mr-3">
                              <Package size={18} color="#6B7280" strokeWidth={2} />
                            </View>
                            <View className="flex-1">
                              <Text className={cn('font-semibold text-sm', textPrimaryClass)}>
                                {result.productName}{result.isService ? '' : ` - ${result.variantName}`}
                              </Text>
                              {result.isService ? (
                                <Text className="text-xs text-gray-500">Service</Text>
                              ) : (
                                <Text className={cn(
                                  'text-xs',
                                  result.stock > 0 ? 'text-emerald-600' : 'text-red-500'
                                )}>
                                  {result.stock > 0 ? `${result.stock} in stock` : 'Out of stock'}
                                </Text>
                              )}
                            </View>
                            <Text className={cn('font-bold text-sm', textPrimaryClass)}>{formatCurrency(result.price)}</Text>
                            {isSelected && <Check size={18} color="#059669" strokeWidth={2} style={{ marginLeft: 8 }} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Selected Items */}
            {items.length > 0 ? (
              <View>
                {items.map((item, index) => {
                  const { productName, variantName, stock, isService, usesGlobalPricing, orderOptions } = getItemDetails(item);
                  const fullName = isService ? productName : `${productName} - ${variantName}`;
                  const itemLineId = getOrderItemLineId(item, index);
                  const linkedServiceEntries = services
                    .map((service, serviceIndex) => ({ service, serviceIndex }))
                    .filter(({ service }) => service.linkedItemId === itemLineId);
                  const serviceVariables = item.serviceVariables ?? [];
                  const serviceFields = item.serviceFields ?? [];
                  const selectedOptions = item.selectedOptions ?? {};
                  const legacySelectedOptionEntries = Object.entries(selectedOptions)
                    .filter(([name, value]) => name.trim() && value.trim())
                    .filter(([name]) => !orderOptions.some((option) => option.name === name));
                  return (
                    <View
                      key={`${item.productId}-${item.variantId}-${index}`}
                      className={cn('mb-3 rounded-2xl border p-3', cardClass)}
                    >
                      <View className="flex-row items-center">
                        <View className="flex-1 mr-3">
                          <Text className={cn('font-semibold text-sm', textPrimaryClass)} numberOfLines={2}>{fullName}</Text>
                          <Text className="text-gray-500 text-xs mt-0.5">
                            {isService ? 'Service' : `${stock} in stock`}
                          </Text>
                        </View>

                        <View
                          className={cn('flex-row items-center rounded-full border', isDark ? 'bg-[#1C1C1C] border-[#2C2C2C]' : 'bg-gray-100 border-gray-200')}
                        >
                          <Pressable
                            onPress={() => handleUpdateQuantity(index, -1)}
                            className="p-2 active:opacity-50"
                          >
                            <Minus size={14} color={isDark ? '#E5E7EB' : '#374151'} strokeWidth={2} />
                          </Pressable>
                          <Text className={cn('font-bold text-sm w-8 text-center', textPrimaryClass)}>{item.quantity}</Text>
                          <Pressable
                            onPress={() => handleUpdateQuantity(index, 1)}
                            className="p-2 active:opacity-50"
                          >
                            <Plus size={14} color={isDark ? '#E5E7EB' : '#374151'} strokeWidth={2} />
                          </Pressable>
                        </View>

                        <Pressable onPress={() => handleRemoveItem(index)} className="ml-2 p-1 active:opacity-50">
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                      </View>

                      <Text className={cn('font-bold text-sm mt-1', textPrimaryClass)}>
                        {formatCurrency(item.unitPrice * item.quantity)}
                        {item.quantity > 1 && (
                          <Text className="text-gray-400 font-normal text-xs">
                            {' '}({formatCurrency(item.unitPrice)} × {item.quantity})
                          </Text>
                        )}
                      </Text>

                      {!isService && (orderOptions.length > 0 || legacySelectedOptionEntries.length > 0) && (
                        <View className="mt-3 pt-3 border-t border-gray-100">
                          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Item Choices
                          </Text>
                          <View style={{ gap: 12 }}>
                            {orderOptions.map((option) => {
                              const selectedValue = selectedOptions[option.name] ?? option.values[0] ?? '';
                              return (
                                <View key={option.id || option.name}>
                                  <Text className="text-gray-600 text-sm font-medium mb-2">
                                    {option.name}
                                  </Text>
                                  <View className="flex-row flex-wrap gap-2">
                                    {option.values.map((value) => {
                                      const selected = selectedValue === value;
                                      return (
                                        <Pressable
                                          key={`${option.name}-${value}`}
                                          onPress={() => handleOrderOptionUpdate(index, option.name, value)}
                                          className="px-4 py-2 rounded-full"
                                          style={{
                                            backgroundColor: selected ? '#111111' : '#F3F4F6',
                                            borderWidth: 1,
                                            borderColor: selected ? '#111111' : '#E5E7EB',
                                          }}
                                        >
                                          <Text className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-gray-700')}>
                                            {value}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                </View>
                              );
                            })}
                            {legacySelectedOptionEntries.map(([name, value]) => (
                              <View key={name} className="self-start rounded-full px-3 py-1.5" style={{ backgroundColor: colors.bg.secondary }}>
                                <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">
                                  {name}: {value}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {isService && (serviceVariables.length > 0 || serviceFields.length > 0) && (
                        <View className="mt-3 pt-3 border-t border-gray-100">
                          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Service Configuration
                          </Text>
                          <View className="gap-3">
                            {serviceVariables.map((variable) => {
                              const value = variable.value ?? '';
                              const isRequired = Boolean(variable.required);
                              return (
                                <View key={variable.id}>
                                  <Text className="text-gray-600 text-sm font-medium mb-2">
                                    {variable.name}{isRequired ? ' *' : ''}
                                  </Text>
                                  {variable.type === 'Select' && (
                                    <View className="flex-row flex-wrap gap-2">
                                      {(variable.options ?? []).map((rawOption) => {
                                        const option = normalizeOption(rawOption);
                                        const selected = value === option.value;
                                        return (
                                          <Pressable
                                            key={`${option.value}-${option.amount ?? 'na'}`}
                                            onPress={() => handleServiceVariableUpdate(index, variable.id, option.value)}
                                            className="px-4 py-2 rounded-full"
                                            style={{
                                              backgroundColor: selected ? '#111111' : '#F3F4F6',
                                              borderWidth: 1,
                                              borderColor: selected ? '#111111' : '#E5E7EB',
                                            }}
                                          >
                                            <Text className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-gray-700')}>
                                              {option.value}
                                              {!usesGlobalPricing && typeof option.amount === 'number' && Number.isFinite(option.amount)
                                                ? ` (+${formatCurrency(option.amount)})`
                                                : ''}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>
                                  )}
                                  {variable.type === 'Toggle' && (
                                    <Switch
                                      value={value === 'true'}
                                      onValueChange={(next: boolean) => handleServiceVariableUpdate(index, variable.id, next ? 'true' : 'false')}
                                    />
                                  )}
                                  {variable.type === 'Number' && (
                                    <TextInput
                                      value={value}
                                      onChangeText={(next) => handleServiceVariableUpdate(index, variable.id, next)}
                                      placeholder="Enter value"
                                      placeholderTextColor="#9CA3AF"
                                      keyboardType="numeric"
                                      className={cn('rounded-xl px-4 py-3 text-sm border', softCardClass, textPrimaryClass)}
                                    />
                                  )}
                                  {variable.type === 'Text' && (
                                    <TextInput
                                      value={value}
                                      onChangeText={(next) => handleServiceVariableUpdate(index, variable.id, next)}
                                      placeholder="Enter value"
                                      placeholderTextColor="#9CA3AF"
                                      className={cn('rounded-xl px-4 py-3 text-sm border', softCardClass, textPrimaryClass)}
                                    />
                                  )}
                                </View>
                              );
                            })}

                            {serviceFields.map((field) => {
                              const value = field.value ?? '';
                              const isRequired = Boolean(field.required);
                              const fieldType = normalizeServiceFieldType(field.type);
                              const parsedDateValue = fieldType === 'Date' ? parseIsoDateString(value) : null;
                              const displayDateValue = parsedDateValue
                                ? parsedDateValue.toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                                : '';
                              const fieldOptions = Array.from(
                                new Map(
                                  (field.options ?? [])
                                    .map(normalizeOption)
                                    .filter((option) => option.value.trim().length > 0)
                                    .map((option) => [option.value, option])
                                ).values()
                              );
                              const displayTimeValue = fieldType === 'Time' ? formatTimeDisplay(value) : '';
                              return (
                                <View key={field.id}>
                                  <Text className="text-gray-600 text-sm font-medium mb-2">
                                    {field.label}{isRequired ? ' *' : ''}
                                  </Text>
                                  {fieldType === 'Date' ? (
                                    <Pressable
                                      onPress={() => openServiceFieldDatePicker(index, field.id, value)}
                                      className={cn('rounded-xl px-4 py-3 text-sm border flex-row items-center justify-between', softCardClass)}
                                    >
                                      <View className="flex-row items-center">
                                        <Calendar size={16} color="#9CA3AF" strokeWidth={2} />
                                        <Text className={cn('text-sm ml-2', displayDateValue ? textPrimaryClass : textMutedClass)}>
                                          {displayDateValue || value || 'Pick a date'}
                                        </Text>
                                      </View>
                                      <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
                                    </Pressable>
                                  ) : fieldType === 'Time' ? (
                                    <Pressable
                                      onPress={() => openServiceFieldTimePicker(index, field.id, value)}
                                      className={cn('rounded-xl px-4 py-3 text-sm border flex-row items-center justify-between', softCardClass)}
                                    >
                                      <View className="flex-row items-center">
                                        <Clock3 size={16} color="#9CA3AF" strokeWidth={2} />
                                        <Text className={cn('text-sm ml-2', displayTimeValue ? textPrimaryClass : textMutedClass)}>
                                          {displayTimeValue || value || 'Pick a time'}
                                        </Text>
                                      </View>
                                      <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
                                    </Pressable>
                                  ) : fieldType === 'Select' ? (
                                    <View className="flex-row flex-wrap gap-2">
                                      {fieldOptions.map((option) => {
                                        const selected = value === option.value;
                                        return (
                                          <Pressable
                                            key={`${field.id}-${option.value}-${option.amount ?? 'na'}`}
                                            onPress={() => handleServiceFieldUpdate(index, field.id, option.value)}
                                            className="px-4 py-2 rounded-full"
                                            style={{
                                              backgroundColor: selected ? '#111111' : '#F3F4F6',
                                              borderWidth: 1,
                                              borderColor: selected ? '#111111' : '#E5E7EB',
                                            }}
                                          >
                                            <Text className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-gray-700')}>
                                              {option.value}
                                              {typeof option.amount === 'number' && Number.isFinite(option.amount)
                                                ? ` (+${formatCurrency(option.amount)})`
                                                : ''}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                      {fieldOptions.length === 0 && (
                                        <Text className={cn('text-xs', textMutedClass)}>
                                          No options configured for this field.
                                        </Text>
                                      )}
                                    </View>
                                  ) : (
                                    <TextInput
                                      value={value}
                                      onChangeText={(next) => handleServiceFieldUpdate(index, field.id, next)}
                                      placeholder={fieldType === 'Number' || fieldType === 'Price' ? 'Enter number' : 'Enter value'}
                                      placeholderTextColor="#9CA3AF"
                                      keyboardType={fieldType === 'Number' || fieldType === 'Price' ? 'numeric' : 'default'}
                                      className={cn('rounded-xl px-4 py-3 text-sm border', softCardClass, textPrimaryClass)}
                                    />
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {customServices.length > 0 && (
                        <View className="mt-3 pt-3 border-t" style={{ borderTopColor: colors.border.light }}>
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-1 pr-3">
                              <Text className={cn('text-xs font-semibold uppercase tracking-wider', textMutedClass)}>
                                Add-ons for this item
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => openAddServiceForItem(index)}
                              className="px-3 py-1.5 rounded-full flex-row items-center active:opacity-70"
                              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                            >
                              <Plus size={13} color={colors.text.primary} strokeWidth={2} />
                              <Text className="text-xs font-semibold ml-1" style={{ color: colors.text.primary }}>Add add-on</Text>
                            </Pressable>
                          </View>

                          {linkedServiceEntries.length > 0 ? (
                            <View style={{ gap: 8 }}>
                              {linkedServiceEntries.map(({ service, serviceIndex }) => (
                                <View
                                  key={`${service.serviceId}-${serviceIndex}`}
                                  className="flex-row items-center rounded-xl px-3 py-2"
                                  style={{ backgroundColor: colors.bg.secondary }}
                                >
                                  <View className="flex-1">
                                    <Text className={cn('font-medium text-sm', textPrimaryClass)}>{service.name}</Text>
                                    <Text className={cn('text-xs mt-0.5', textMutedClass)}>Linked to {fullName}</Text>
                                  </View>
                                  <Text className={cn('font-bold text-sm mr-2', textPrimaryClass)}>{formatCurrency(service.price)}</Text>
                                  <Pressable
                                    onPress={() => openEditServicePrice(serviceIndex)}
                                    className="px-2 py-1 rounded-lg mr-1 active:opacity-70"
                                    style={{ backgroundColor: service.price > 0 ? 'rgba(59, 130, 246, 0.08)' : 'rgba(234, 179, 8, 0.12)' }}
                                  >
                                    <Pencil size={13} color={service.price > 0 ? '#3B82F6' : '#CA8A04'} strokeWidth={2} />
                                  </Pressable>
                                  <Pressable onPress={() => handleRemoveService(serviceIndex)} className="p-1 active:opacity-50">
                                    <Trash2 size={15} color="#EF4444" strokeWidth={2} />
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text className={cn('text-xs', textMutedClass)}>No add-ons linked to this item.</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="py-8 items-center">
                <Package size={32} color="#D1D5DB" strokeWidth={1.5} />
                <Text className="text-gray-400 text-sm mt-2">No items added yet</Text>
              </View>
            )}
          </View>
          );

          const itemLineIds = new Set(items.map((item, index) => getOrderItemLineId(item, index)));
          const unassignedServiceEntries = services
            .map((service, index) => ({ service, index }))
            .filter(({ service }) => !service.linkedItemId || !itemLineIds.has(service.linkedItemId));

          const addonsSection = items.length > 0 && unassignedServiceEntries.length > 0 ? (
            <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-3">
                  <Text className={cn(sectionTitleClass, textPrimaryClass)}>Unassigned add-ons</Text>
                  <Text className={cn('text-xs mt-1', textMutedClass)}>Older or imported add-ons that are not linked to a product line.</Text>
                </View>
              </View>

              {unassignedServiceEntries.length > 0 ? (
                unassignedServiceEntries.map(({ service, index }) => (
                  <View
                    key={`${service.serviceId}-${index}`}
                    className="flex-row items-center py-3 border-b"
                    style={{ borderBottomColor: colors.border.light }}
                  >
                    <View className="flex-1">
                      <Text className={cn('font-medium text-sm', textPrimaryClass)}>{service.name}</Text>
                    </View>
                    <Text className={cn('font-bold text-sm mr-2', textPrimaryClass)}>{formatCurrency(service.price)}</Text>
                    <Pressable
                      onPress={() => openEditServicePrice(index)}
                      className="px-2 py-1 rounded-lg mr-2 active:opacity-70"
                      style={{ backgroundColor: service.price > 0 ? 'rgba(59, 130, 246, 0.08)' : 'rgba(234, 179, 8, 0.12)' }}
                    >
                      <View className="flex-row items-center">
                        <Pencil size={14} color={service.price > 0 ? '#3B82F6' : '#CA8A04'} strokeWidth={2} />
                        <Text className="text-xs font-semibold ml-1" style={{ color: service.price > 0 ? '#3B82F6' : '#CA8A04' }}>
                          {service.price > 0 ? 'Edit' : 'Set'}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => handleRemoveService(index)} className="p-1 active:opacity-50">
                      <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text className={cn('text-sm text-center py-4', textMutedClass)}>No add-ons added</Text>
              )}
            </View>
          ) : null;

          const feesSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <View className="mb-4">
              <Text className={cn(sectionTitleClass, textPrimaryClass)}>Charges</Text>
              <Text className={cn('text-xs mt-1', textMutedClass)}>
                {isServiceOrder ? 'Extra charges and discounts for this service order.' : 'Delivery, extra charges, and discounts.'}
              </Text>
            </View>

            {!isServiceOrder && (
              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Delivery Fee</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  value={deliveryFee}
                  onChangeText={setDeliveryFee}
                  keyboardType="numeric"
                  className={cn('rounded-xl px-4 py-3 text-base border', softCardClass, textPrimaryClass)}
                />
              </View>
            )}

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Additional Charges</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={additionalCharges}
                onChangeText={setAdditionalCharges}
                keyboardType="numeric"
                className={cn('rounded-xl px-4 py-3 text-base border', softCardClass, textPrimaryClass)}
              />
            </View>

            {additionalChargesNum > 0 && (
              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Additional Charges Note</Text>
                <TextInput
                  placeholder="Describe the additional charges"
                  placeholderTextColor="#9CA3AF"
                  value={additionalChargesNote}
                  onChangeText={setAdditionalChargesNote}
                  className={cn('rounded-xl px-4 py-3 text-base border', softCardClass, textPrimaryClass)}
                />
              </View>
            )}

            <View>
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Discount Amount</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={discountAmount}
                onChangeText={setDiscountAmount}
                keyboardType="numeric"
                className={cn('rounded-xl px-4 py-3 text-base border', softCardClass, textPrimaryClass)}
              />
            </View>
          </View>
          );

          const orderDetailsSection = (
          <View className={cn('mx-4 mt-4 rounded-2xl p-4 border', cardClass)}>
            <View className="mb-4">
              <Text className={cn(sectionTitleClass, textPrimaryClass)}>Order Details</Text>
              <Text className={cn('text-xs mt-1', textMutedClass)}>Date, sales source, and payment method.</Text>
            </View>

            {/* Order Date */}
            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Order Date</Text>
              <View className={cn('flex-row rounded-xl overflow-hidden border', softCardClass)}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                    setOrderDateType('today');
                  }}
                  className="flex-1 py-3 items-center justify-center"
                  style={{ backgroundColor: orderDateType === 'today' ? '#111111' : 'transparent' }}
                >
                  <Text className={cn(
                    'font-semibold text-sm',
                    orderDateType === 'today' ? 'text-white' : textSecondaryClass
                  )}>
                    Today
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                    setOrderDateType('another');
                    openOrderDatePicker();
                  }}
                  className="flex-1 py-3 items-center justify-center"
                  style={{ backgroundColor: orderDateType === 'another' ? '#111111' : 'transparent' }}
                >
                  <Text className={cn(
                    'font-semibold text-sm',
                    orderDateType === 'another' ? 'text-white' : textSecondaryClass
                  )}>
                    Another Day
                  </Text>
                </Pressable>
              </View>

              {/* Date Display for "Another Day" */}
              {orderDateType === 'another' && (
                <Pressable
                  onPress={openOrderDatePicker}
                  className={cn('mt-3 rounded-xl px-4 py-3 flex-row items-center justify-between border active:opacity-70', softCardClass)}
                >
                  <View className="flex-row items-center">
                    <Calendar size={18} color={colors.text.muted} strokeWidth={2} />
                    <Text className={cn('text-base ml-2', textPrimaryClass)}>
                      {selectedDate.toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <ChevronDown size={20} color={colors.text.muted} strokeWidth={2} />
                </Pressable>
              )}
            </View>

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Sales Source</Text>
              <Pressable
                onPress={() => setShowSourceModal(!showSourceModal)}
                className={cn('rounded-xl px-4 py-3 flex-row items-center justify-between border', softCardClass)}
              >
                <Text className={cn('text-base', textPrimaryClass)}>{source}</Text>
                <ChevronDown size={20} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
              {showSourceModal && (
                <ScrollView
                  className={cn('rounded-xl mt-2 border', cardClass)}
                  style={{ maxHeight: 220 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {saleSources.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setSource(s.name);
                        setShowSourceModal(false);
                        Haptics.selectionAsync();
                      }}
                      className="flex-row items-center justify-between px-4 py-2.5 border-b active:opacity-70"
                      style={{ borderBottomColor: colors.border.light }}
                    >
                      <Text
                        style={{ color: source === s.name ? colors.text.primary : colors.text.secondary }}
                        className={cn('text-sm', source === s.name && 'font-semibold')}
                      >
                        {s.name}
                      </Text>
                      {source === s.name && <Check size={16} color={colors.text.primary} strokeWidth={2} />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Order Category</Text>
              <Pressable
                onPress={() => setShowOrderClassificationModal(!showOrderClassificationModal)}
                className={cn('rounded-xl px-4 py-3 flex-row items-center justify-between border', softCardClass)}
              >
                <Text className={cn('text-base', textPrimaryClass)}>{orderClassification}</Text>
                <ChevronDown size={20} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
              {showOrderClassificationModal && (
                <ScrollView
                  className={cn('rounded-xl mt-2 border', cardClass)}
                  style={{ maxHeight: 220 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {ORDER_CLASSIFICATIONS.map((classification) => (
                    <Pressable
                      key={classification}
                      onPress={() => {
                        setOrderClassification(classification);
                        setShowOrderClassificationModal(false);
                        Haptics.selectionAsync();
                      }}
                      className="flex-row items-center justify-between px-4 py-2.5 border-b active:opacity-70"
                      style={{ borderBottomColor: colors.border.light }}
                    >
                      <Text
                        style={{ color: orderClassification === classification ? colors.text.primary : colors.text.secondary }}
                        className={cn('text-sm', orderClassification === classification && 'font-semibold')}
                      >
                        {classification}
                      </Text>
                      {orderClassification === classification && <Check size={16} color={colors.text.primary} strokeWidth={2} />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            <View>
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: colors.text.secondary }}>Payment Method</Text>
              <Pressable
                onPress={() => setShowPaymentModal(!showPaymentModal)}
                className={cn('rounded-xl px-4 py-3 flex-row items-center justify-between border', softCardClass)}
              >
                <Text className={cn('text-base', textPrimaryClass)}>{paymentMethod}</Text>
                <ChevronDown size={20} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
              {showPaymentModal && (
                <ScrollView
                  className={cn('rounded-xl mt-2 border', cardClass)}
                  style={{ maxHeight: 220 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {paymentMethods.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        setPaymentMethod(m.name);
                        setShowPaymentModal(false);
                        Haptics.selectionAsync();
                      }}
                      className="flex-row items-center justify-between px-4 py-2.5 border-b active:opacity-70"
                      style={{ borderBottomColor: colors.border.light }}
                    >
                      <Text
                        style={{ color: paymentMethod === m.name ? colors.text.primary : colors.text.secondary }}
                        className={cn('text-sm', paymentMethod === m.name && 'font-semibold')}
                      >
                        {m.name}
                      </Text>
                      {paymentMethod === m.name && <Check size={16} color={colors.text.primary} strokeWidth={2} />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
          );

          const prescriptionSectionEl = (
          <PrescriptionSection
            prescription={customerPrescription}
            onUpdate={setCustomerPrescription}
            editable
            staffName={currentUser?.name}
            containerClassName="mx-4 mt-4"
          />
          );

          const summarySection = (
          <View className={cn('mx-4 mt-4 mb-8 rounded-2xl p-4 border', summaryCardClass)}>
            <View className="mb-3">
              <Text className={cn(sectionTitleClass, summaryPrimaryClass)}>Summary</Text>
              <Text className={cn('text-xs mt-1', summarySecondaryClass)}>Final order totals before you create the order.</Text>
            </View>

            <View className="flex-row justify-between mb-2">
              <Text className={cn('text-sm', summarySecondaryClass)}>{isServiceOrder ? 'Services Subtotal' : 'Items Subtotal'}</Text>
              <Text className={cn('font-semibold', summaryPrimaryClass)}>{formatCurrency(subtotal)}</Text>
            </View>

            {servicesTotal > 0 && (
              <View className="flex-row justify-between mb-2">
                <Text className={cn('text-sm', summarySecondaryClass)}>Add-ons</Text>
                <Text className={cn('font-semibold', summaryPrimaryClass)}>{formatCurrency(servicesTotal)}</Text>
              </View>
            )}

            {deliveryFeeNum > 0 && (
              <View className="flex-row justify-between mb-2">
                <Text className={cn('text-sm', summarySecondaryClass)}>Delivery Fee</Text>
                <Text className={cn('font-semibold', summaryPrimaryClass)}>{formatCurrency(deliveryFeeNum)}</Text>
              </View>
            )}

            {additionalChargesNum > 0 && (
              <View className="flex-row justify-between mb-2">
                <Text className={cn('text-sm', summarySecondaryClass)}>Additional Charges</Text>
                <Text className={cn('font-semibold', summaryPrimaryClass)}>{formatCurrency(additionalChargesNum)}</Text>
              </View>
            )}

            {discountAmountNum > 0 && (
              <View className="flex-row justify-between mb-2">
                <Text className={cn('text-sm', summarySecondaryClass)}>Discount</Text>
                <Text className={cn('font-semibold', summaryAccentClass)}>-{formatCurrency(discountAmountNum)}</Text>
              </View>
            )}

            <View className="mt-2 pt-3 flex-row justify-between" style={{ borderTopWidth: 1, borderTopColor: summaryDividerColor }}>
              <Text className={cn('font-bold text-lg', summaryPrimaryClass)}>Total</Text>
              <Text className={cn('font-bold text-2xl', summaryPrimaryClass)}>{formatCurrency(totalAmount)}</Text>
            </View>
          </View>
          );

          return (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <View style={contentWrapperStyle}>
                {isDesktopWeb ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {socialCheckoutSection}
                      {orderFlowSection}
                      {coreDetailsSection}
                      {itemsSection}
                      {addonsSection}
                      {feesSection}
                      {prescriptionSectionEl}
                    </View>
                    <View style={{ width: rightColumnWidth ?? 420 }}>
                      {orderMetaSection}
                      {orderDetailsSection}
                      {summarySection}
                    </View>
                  </View>
                ) : (
                  <>
                    {socialCheckoutSection}
                    {orderFlowSection}
                    {coreDetailsSection}
                    {orderMetaSection}
                    {itemsSection}
                    {addonsSection}
                    {feesSection}
                    {orderDetailsSection}
                    {prescriptionSectionEl}
                    {summarySection}
                  </>
                )}

                {/* Bottom padding for sticky CTA */}
                {!isDesktopWeb && <View className="h-32" />}
              </View>
            </ScrollView>
          );
        })()}
        </KeyboardAvoidingView>
      </View>

      {/* Service Selection Modal - Centered */}
      <Modal visible={showServiceModal} animationType="fade" transparent onRequestClose={closeServiceModal}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={closeServiceModal}
          />
          <View
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: selectionModalSurface, maxWidth: 400, maxHeight: '70%', borderWidth: 1, borderColor: selectionModalBorder }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: selectionModalBorder }}>
              <Text className={cn('font-bold text-lg', textPrimaryClass)}>Add Add-on</Text>
              <Pressable
                onPress={closeServiceModal}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: selectionModalSoftBg }}
              >
                <X size={18} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
            </View>
            <View className="px-5 pt-4">
              <View
                className="flex-row items-center rounded-xl px-3 border"
                style={{ backgroundColor: selectionModalSoftBg, borderColor: selectionModalBorder }}
              >
                <Search size={17} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  value={addonSearchQuery}
                  onChangeText={setAddonSearchQuery}
                  placeholder="Search add-ons"
                  placeholderTextColor={colors.text.muted}
                  autoFocus
                  className={cn('flex-1 py-3 px-2 text-sm', textPrimaryClass)}
                />
                <SearchClearButton visible={Boolean(addonSearchQuery.trim())} onPress={() => setAddonSearchQuery('')} />
              </View>
            </View>
            <ScrollView
              className="px-5 py-4"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={true}
            >
              {filteredCustomServices.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() => handleAddService(service.id)}
                  className="flex-row items-center justify-between py-3 px-4 rounded-xl mb-2 active:opacity-70"
                  style={{ backgroundColor: selectionModalSoftBg }}
                >
                  <Text className={cn('font-medium text-base', textPrimaryClass)}>{service.name}</Text>
                  <Text className="text-green-400 font-bold">{formatCurrency(service.defaultPrice)}</Text>
                </Pressable>
              ))}
              {customServices.length === 0 && (
                <Text className={cn('text-sm text-center py-4', textMutedClass)}>
                  No add-ons available. Create one in settings first.
                </Text>
              )}
              {customServices.length > 0 && filteredCustomServices.length === 0 && (
                <Text className={cn('text-sm text-center py-4', textMutedClass)}>
                  No add-ons match your search.
                </Text>
              )}
              <View className="h-4" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Service Price Modal */}
      <Modal visible={showServicePriceModal} animationType="fade" transparent onRequestClose={() => setShowServicePriceModal(false)}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={() => setShowServicePriceModal(false)}
          />
          <View
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 420 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: '#E5E7EB' }}>
              <Text className="text-gray-900 font-bold text-lg">Set Service Price</Text>
              <Pressable
                onPress={() => setShowServicePriceModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                <X size={18} color="#6B7280" strokeWidth={2} />
              </Pressable>
            </View>
            <View className="px-5 py-4">
              <Text className="text-gray-600 text-sm font-medium mb-2">Service Fee</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                value={servicePriceInput}
                onChangeText={setServicePriceInput}
                keyboardType="numeric"
                className="bg-gray-50 rounded-xl px-4 py-3 text-gray-900 text-base border border-gray-200"
              />
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={() => setShowServicePriceModal(false)}
                  className="flex-1 rounded-xl items-center justify-center"
                  style={{ height: 48, backgroundColor: '#F3F4F6' }}
                >
                  <Text className="text-gray-700 font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmEditServicePrice}
                  className="flex-1 rounded-xl items-center justify-center"
                  style={{ height: 48, backgroundColor: '#111111' }}
                >
                  <Text className="text-white font-semibold">Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal - Works on iOS/Android/Web */}
      <Modal
        visible={showDatePicker}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowDatePicker(false);
          setDatePickerTarget(null);
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => {
            setShowDatePicker(false);
            setDatePickerTarget(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: datePickerSurface, borderWidth: 1, borderColor: datePickerBorder, maxWidth: 400 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: datePickerBorder }}>
              <Text className={cn('font-bold text-lg', textPrimaryClass)}>
                {datePickerTarget?.type === 'serviceField' ? 'Select Field Date' : 'Select Date'}
              </Text>
              <Pressable
                onPress={() => {
                  setShowDatePicker(false);
                  setDatePickerTarget(null);
                }}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: datePickerSoftBg }}
              >
                <X size={18} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Calendar View for all platforms */}
            <View className="p-4">
              {/* Month/Year Navigation */}
              <View className="flex-row items-center justify-between mb-4">
                <Pressable
                  onPress={() => {
                    const newDate = new Date(calendarViewDate);
                    newDate.setMonth(newDate.getMonth() - 1);
                    setCalendarViewDate(newDate);
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: datePickerSoftBg }}
                >
                  <ChevronLeft size={20} color={datePickerIconColor} strokeWidth={2} />
                </Pressable>
                <Text className={cn('font-bold text-base', textPrimaryClass)}>
                  {calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </Text>
                <Pressable
                  onPress={() => {
                    const newDate = new Date(calendarViewDate);
                    newDate.setMonth(newDate.getMonth() + 1);
                    const shouldRestrictFutureDates = datePickerTarget?.type !== 'serviceField';
                    if (!shouldRestrictFutureDates || newDate <= new Date()) {
                      setCalendarViewDate(newDate);
                    }
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: datePickerSoftBg }}
                >
                  <ChevronRight size={20} color={datePickerIconColor} strokeWidth={2} />
                </Pressable>
              </View>

              {/* Day Labels */}
              <View className="flex-row mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <View key={day} className="flex-1 items-center py-2">
                    <Text className={cn('text-xs font-semibold', textMutedClass)}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
              {(() => {
                const year = calendarViewDate.getFullYear();
                const month = calendarViewDate.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const today = new Date();

                const weeks: (number | null)[][] = [];
                let currentWeek: (number | null)[] = [];

                // Fill in empty slots before first day
                for (let i = 0; i < firstDay; i++) {
                  currentWeek.push(null);
                }

                // Fill in days
                for (let day = 1; day <= daysInMonth; day++) {
                  currentWeek.push(day);
                  if (currentWeek.length === 7) {
                    weeks.push(currentWeek);
                    currentWeek = [];
                  }
                }

                // Fill in remaining slots
                if (currentWeek.length > 0) {
                  while (currentWeek.length < 7) {
                    currentWeek.push(null);
                  }
                  weeks.push(currentWeek);
                }

                return weeks.map((week, weekIndex) => (
                  <View key={weekIndex} className="flex-row">
                    {week.map((day, dayIndex) => {
                      if (day === null) {
                        return <View key={dayIndex} className="flex-1 items-center py-2" />;
                      }

                      const dateObj = new Date(year, month, day);
                      const isSelected = pickerDate.getDate() === day &&
                        pickerDate.getMonth() === month &&
                        pickerDate.getFullYear() === year;
                      const shouldRestrictFutureDates = datePickerTarget?.type !== 'serviceField';
                      const isFuture = shouldRestrictFutureDates && dateObj > today;
                      const isToday = today.getDate() === day &&
                        today.getMonth() === month &&
                        today.getFullYear() === year;

                      return (
                        <Pressable
                          key={dayIndex}
                          onPress={() => {
                            if (!isFuture) {
                              const newDate = new Date(year, month, day, 12, 0, 0);
                              setPickerDate(newDate);
                            }
                          }}
                          disabled={isFuture}
                          className={cn(
                            'flex-1 items-center py-2 mx-0.5 my-0.5 rounded-lg',
                            !isSelected && !isFuture && (isDark ? 'active:bg-[#222222]' : 'active:bg-gray-100')
                          )}
                          style={isSelected ? { backgroundColor: '#111111' } : undefined}
                        >
                          <Text className={cn(
                            'text-sm font-medium',
                            (isSelected || isToday) && 'font-semibold',
                            !isSelected && isFuture && (isDark ? 'text-gray-600' : 'text-gray-300')
                          )}
                          style={{ color: isSelected ? '#FFFFFF' : (isFuture ? (isDark ? '#4B5563' : '#D1D5DB') : colors.text.primary) }}>
                            {day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ));
              })()}

              {/* Confirm Button */}
              <Pressable
                onPress={commitDatePickerValue}
                className="mt-4 w-full py-3 rounded-xl items-center active:opacity-80"
                style={{ backgroundColor: '#111111' }}
              >
                <Text className="font-semibold text-white">Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showTimePicker}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowTimePicker(false);
          setTimePickerTarget(null);
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => {
            setShowTimePicker(false);
            setTimePickerTarget(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: datePickerSurface, borderWidth: 1, borderColor: datePickerBorder, maxWidth: 420 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: datePickerBorder }}>
              <Text className={cn('font-bold text-lg', textPrimaryClass)}>Select Time</Text>
              <Pressable
                onPress={() => {
                  setShowTimePicker(false);
                  setTimePickerTarget(null);
                }}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: datePickerSoftBg }}
              >
                <X size={18} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
            </View>

            <View className="p-4">
              <View className="flex-row items-center justify-center">
                <View className="items-center">
                  <Text className={cn('text-xs mb-2', textMutedClass)}>Hour</Text>
                  <Pressable
                    onPress={() => setPickerHour((prev) => (prev + 23) % 24)}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: datePickerSoftBg }}
                  >
                    <Minus size={16} color={datePickerIconColor} strokeWidth={2} />
                  </Pressable>
                  <Text className={cn('font-bold text-3xl my-3', textPrimaryClass)}>{String(pickerHour).padStart(2, '0')}</Text>
                  <Pressable
                    onPress={() => setPickerHour((prev) => (prev + 1) % 24)}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: datePickerSoftBg }}
                  >
                    <Plus size={16} color={datePickerIconColor} strokeWidth={2} />
                  </Pressable>
                </View>
                <Text className={cn('font-bold text-3xl mx-4 mt-7', textPrimaryClass)}>:</Text>
                <View className="items-center">
                  <Text className={cn('text-xs mb-2', textMutedClass)}>Minute</Text>
                  <Pressable
                    onPress={() => setPickerMinute((prev) => (prev + 59) % 60)}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: datePickerSoftBg }}
                  >
                    <Minus size={16} color={datePickerIconColor} strokeWidth={2} />
                  </Pressable>
                  <Text className={cn('font-bold text-3xl my-3', textPrimaryClass)}>{String(pickerMinute).padStart(2, '0')}</Text>
                  <Pressable
                    onPress={() => setPickerMinute((prev) => (prev + 1) % 60)}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: datePickerSoftBg }}
                  >
                    <Plus size={16} color={datePickerIconColor} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
              <Text className={cn('text-center text-sm mt-4', textSecondaryClass)}>
                {formatTimeDisplay(toTimeString(pickerHour, pickerMinute))}
              </Text>
              <Pressable
                onPress={commitTimePickerValue}
                className="mt-4 w-full py-3 rounded-xl items-center active:opacity-80"
                style={{ backgroundColor: '#111111' }}
              >
                <Text className="font-semibold text-white">Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showOrderFlowChooser}
        transparent
        animationType="fade"
        onRequestClose={() => router.back()}
      >
        <Pressable
          className="flex-1 items-center justify-center px-5"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onPress={() => router.back()}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full rounded-[28px] border p-5"
            style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light, maxWidth: 460 }}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className={cn('text-2xl font-bold', textPrimaryClass)}>Start New Order</Text>
                <Text className={cn('text-sm mt-2 leading-6', textSecondaryClass)}>
                  Choose the type of order first so the rest of the form stays focused.
                </Text>
              </View>
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
            </View>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setOrderFlowMode('product');
                  setShowOrderFlowChooser(false);
                }}
                className="rounded-[24px] border p-4 active:opacity-80"
                style={{ borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}
              >
                <View className="flex-row items-center">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: colors.bg.card }}
                  >
                    <Package size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className={cn('text-base font-semibold', textPrimaryClass)}>Product Order</Text>
                    <Text className={cn('text-xs mt-1', textMutedClass)}>
                      For glasses, accessories, packaging, and other physical items.
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setOrderFlowMode('service');
                  setShowOrderFlowChooser(false);
                }}
                className="rounded-[24px] border p-4 active:opacity-80"
                style={{ borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}
              >
                <View className="flex-row items-center">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: colors.bg.card }}
                  >
                    <Clock3 size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className={cn('text-base font-semibold', textPrimaryClass)}>Service Order</Text>
                    <Text className={cn('text-xs mt-1', textMutedClass)}>
                      For lab work, fittings, repairs, and other service-only orders.
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sticky Bottom CTA */}
      {!isDesktopWeb && (
        <StickyButtonContainer
          bottomInset={insets.bottom}
          backgroundColor={colors.bg.card}
          borderColor={colors.border.light}
        >
          <View style={contentWrapperStyle}>
            <Button
              onPress={handleSubmit}
              disabled={!customerName.trim() || items.length === 0}
              loading={isSubmitting}
              loadingText="Creating..."
            >
              {isServiceOrder ? 'Create Service Order' : 'Create Order'}
            </Button>
          </View>
        </StickyButtonContainer>
      )}

      {toast && (
        <View
          className="absolute left-5 right-5 items-center"
          style={{ top: insets.top + 60 }}
        >
          <View
            className="flex-row items-center px-5 py-4 rounded-xl"
            style={{ backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444' }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.bg.card }}>
              <Check size={18} color={toast.type === 'success' ? '#111111' : '#EF4444'} strokeWidth={2.5} />
            </View>
            <Text className="text-white font-semibold text-sm">{toast.message}</Text>
          </View>
        </View>
      )}
      </SafeAreaView>
    </View>
  );
}
