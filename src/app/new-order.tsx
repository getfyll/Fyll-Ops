import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, TextInputProps, KeyboardAvoidingView, Modal, Platform, StyleProp, ViewStyle, Switch, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Plus, Minus, Trash2, ChevronDown, Check, Search, Package, User as UserIcon, Users, Calendar, ChevronLeft, ChevronRight, Sparkles, Clock3, Pencil } from 'lucide-react-native';
import useFyllStore, {
  OrderItem,
  OrderService,
  ORDER_CLASSIFICATIONS,
  OrderClassification,
  ServiceFieldType,
  PrescriptionInfo,
  type SocialCheckoutDraft,
  generateOrderNumber,
  generateProductId,
  generateVariantBarcode,
  formatCurrency,
  NIGERIA_STATES,
  Customer,
} from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { cn } from '@/lib/cn';
import { normalizeDeliveryStateValue } from '@/lib/format-address';
import { normalizeProductType } from '@/lib/product-utils';
import * as Haptics from 'expo-haptics';
import { StickyButtonContainer } from '@/components/Button';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette, type PaymentsPalette } from '@/components/payments/payments-ui';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { getFyllPublicAppOrigin } from '@/lib/fyll-app-url';
import { buildCustomerTrackingUrl } from '@/lib/tracking-url';
import { useWooCommerceAvailable } from '@/hooks/useWooCommerceAvailable';
import { buildWhatsAppUrl } from '@/lib/quotes';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { sendOrderNotification } from '@/hooks/useWebPushNotifications';
import { addBusinessDays, getCustomerTrackingCode, resolveOrderTimeline } from '@/lib/fulfillment';
import { useThemeColors } from '@/lib/theme';
import { PrescriptionSection } from '@/components/PrescriptionSection';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { fetchWooCommerceOrder, fetchWooCommerceOrders, queueWooCommerceOrderFromFyll, type WooNormalizedOrder } from '@/lib/woocommerce';
import { normalizeWooLookupValue } from '@/lib/woocommerce-link';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { supabaseData } from '@/lib/supabase/data';
import { useQueryClient } from '@tanstack/react-query';
import { fetchQuotes, quotesQueryKey, updateQuote } from '@/lib/quotes-api';
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


type InventoryTile = SearchResult & { sku: string; imageUrl?: string; lowStock: number };

// A numbered card: the New Order screen is a short list of these (customer, items, delivery, payment).
function StepCard({ n, title, right, compact, palette, children }: { n: number; title: string; right?: React.ReactNode; compact: boolean; palette: PaymentsPalette; children: React.ReactNode }) {
  return (
    <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: compact ? 16 : 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <StepBadge n={n} palette={palette} />
        <Text style={{ flex: 1, color: palette.text, fontSize: compact ? 14 : 16, fontWeight: '500' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

// A text field whose border turns lime while you are typing in it.
function FocusInput({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const palette = usePaymentsPalette();
  const [focused, setFocused] = useState<boolean>(false);
  return (
    <TextInput
      {...props}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={[style, focused ? { borderColor: palette.isDark ? FYLL_LIME : '#B8C43A' } : null]}
    />
  );
}

// The search box with an icon and a clear button; its border turns lime while it is active.
function SearchBox({ value, onChangeText, placeholder, palette, autoFocus = false }: { value: string; onChangeText: (value: string) => void; placeholder: string; palette: PaymentsPalette; autoFocus?: boolean }) {
  const [focused, setFocused] = useState<boolean>(false);
  return (
    <View style={{ borderRadius: 18, backgroundColor: palette.inset, borderWidth: 1, borderColor: focused ? (palette.isDark ? FYLL_LIME : '#B8C43A') : palette.border, height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Search size={18} color={palette.faint} strokeWidth={2} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        style={[{ flex: 1, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
      <SearchClearButton visible={Boolean(value.trim())} onPress={() => onChangeText('')} />
    </View>
  );
}

// The small numbered circle that starts every card title.
function StepBadge({ n, palette }: { n: number; palette: PaymentsPalette }) {
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
      <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '700' }}>{n}</Text>
    </View>
  );
}

function ChoicePill({ label, selected, onPress, palette, compact = false }: { label: string; selected: boolean; onPress: () => void; palette: PaymentsPalette; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? FYLL_LIME : 'transparent', borderWidth: selected ? 0 : 1, borderColor: palette.outline }}
    >
      <Text style={{ color: selected ? FYLL_LIME_INK : palette.textSoft, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Thumb({ imageUrl, size, palette }: { imageUrl?: string | null; size: number; palette: PaymentsPalette }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size > 50 ? 14 : 12, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
      <ResolvedAttachmentImage imageUrl={imageUrl} style={{ width: size, height: size }} resizeMode="contain" fallback={<Package size={size * 0.4} color="#9CA3AF" strokeWidth={1.8} />} />
    </View>
  );
}

function Stepper({ quantity, onMinus, onPlus, palette, fontSize = 16 }: { quantity: number; onMinus: () => void; onPlus: () => void; palette: PaymentsPalette; fontSize?: number }) {
  return (
    <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: palette.softFill, paddingHorizontal: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fewer" onPress={onMinus} hitSlop={6} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={16} color={palette.text} strokeWidth={2.4} />
      </Pressable>
      <Text style={{ minWidth: 26, textAlign: 'center', color: palette.text, fontSize, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{quantity}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={onPlus} hitSlop={6} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={16} color={palette.text} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

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
    linkPaymentId?: string;
    socialCheckoutBill?: string;
    socialCheckoutAmount?: string;
    quoteId?: string;
    quoteItems?: string;
    quoteAdditionalCharges?: string;
    quoteAdditionalNote?: string;
    items?: string;
    services?: string;
    prefillProductId?: string;
    prefillVariantId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { isDesktop, width: breakpointWidth } = useBreakpoint();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const isDark = colors.bg.primary === '#111111';
  const isDesktopWeb = Platform.OS === 'web' && isDesktop;
  const orderLineFontSize = isDesktopWeb ? 14 : 12;
  const isNarrowWeb = Platform.OS === 'web' && breakpointWidth < 1280;
  const rightColumnWidth = isDesktopWeb ? (isNarrowWeb ? Math.max(320, Math.round(breakpointWidth * 0.3)) : 420) : undefined;
  const webMaxWidth = 1456;
  const socialCheckoutReference = params.socialCheckoutReference || '';
  const socialCheckoutBill = params.socialCheckoutBill || '';
  const socialCheckoutAmount = Number(params.socialCheckoutAmount) || 0;
  const hasSocialCheckoutPrefill = Boolean(socialCheckoutReference || socialCheckoutBill);
  const quoteId = typeof params.quoteId === 'string' ? params.quoteId.trim() : '';
  const canvasBg = palette.page;
  const panelBg = palette.page;
  const textPrimaryClass = isDark ? 'text-white' : 'text-gray-900';
  const textSecondaryClass = isDark ? 'text-gray-300' : 'text-gray-600';
  const textMutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardClass = isDark ? 'bg-[#1C1C1C] border-[rgba(255,255,255,0.07)]' : 'bg-white border-[#ECECEC]';
  const softCardClass = isDark ? 'bg-[#141414] border-[rgba(255,255,255,0.14)] focus:border-[#D5E057]' : 'bg-[#F6F6F4] border-[#DCDCDC] focus:border-[#B8C43A]';
  const dropdownOpenBorder = isDark ? FYLL_LIME : '#B8C43A';
  const sectionTitleClass = isDesktopWeb ? 'font-medium text-base' : 'font-medium text-sm';
  const fieldLabelClass = 'font-semibold';
  const fieldLabelFontSize = isDesktopWeb ? 14 : 12;
  const summaryCardClass = cardClass;
  const summaryPrimaryClass = textPrimaryClass;
  const summarySecondaryClass = textSecondaryClass;
  const summaryAccentClass = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const summaryDividerColor = colors.border.light;
  const datePickerSurface = isDark ? '#1C1C1C' : '#FFFFFF';
  const datePickerSoftBg = isDark ? '#141414' : '#F6F6F4';
  const datePickerBorder = isDark ? 'rgba(255,255,255,0.1)' : '#ECECEC';
  const datePickerIconColor = isDark ? '#E5E7EB' : '#111111';
  const selectionModalSurface = isDark ? '#1C1C1C' : '#FFFFFF';
  const selectionModalSoftBg = isDark ? '#141414' : '#F6F6F4';
  const selectionModalBorder = isDark ? 'rgba(255,255,255,0.1)' : '#ECECEC';
  const selectionModalSelectedBg = isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6';
  const selectionModalSelectedText = isDark ? '#FFFFFF' : '#111111';
  const selectionModalText = isDark ? '#9CA3AF' : '#6B7280';
  const products = useFyllStore((s) => s.products);
  const customServices = useFyllStore((s) => s.customServices);
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const saleSources = useFyllStore((s) => s.saleSources);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const customers = useFyllStore((s) => s.customers);
  const queryClient = useQueryClient();
  const orders = useFyllStore((s) => s.orders);
  const addOrder = useFyllStore((s) => s.addOrder);
  const addCustomer = useFyllStore((s) => s.addCustomer);
  const updateVariantStock = useFyllStore((s) => s.updateVariantStock);
  const addProduct = useFyllStore((s) => s.addProduct);
  const wooAvailable = useWooCommerceAvailable();
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const {
    woocommerceStoreUrl,
    woocommerceConsumerKey,
    woocommerceConsumerSecret,
    hasWooCommerceConnection,
    businessName,
    businessSlug,
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
  const [showStateModal, setShowStateModal] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQuantity, setCustomItemQuantity] = useState('1');
  const [isAddingCustomItem, setIsAddingCustomItem] = useState(false);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [sendReceipt, setSendReceipt] = useState(false);
  const [sendToWoo, setSendToWoo] = useState(false);
  const [notifyWooCustomer, setNotifyWooCustomer] = useState(false);
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
  const [optionPickerItemIndex, setOptionPickerItemIndex] = useState<number | null>(null);
  const [optionPickerOptionName, setOptionPickerOptionName] = useState<string | null>(null);
  const [optionPickerSearch, setOptionPickerSearch] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(params.deliveryFee || '');
  const [additionalCharges, setAdditionalCharges] = useState(params.quoteAdditionalCharges || '');
  const [additionalChargesNote, setAdditionalChargesNote] = useState(params.quoteAdditionalNote || '');
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

  // A verified quote: its inventory items arrive as exact product/variant lines.
  const quoteItemsHydratedRef = useRef(false);
  useEffect(() => {
    if (!params.quoteItems || quoteItemsHydratedRef.current || products.length === 0) return;
    quoteItemsHydratedRef.current = true;
    try {
      const lines: { productId: string; variantId: string; quantity: number; unitPrice: number }[] = JSON.parse(params.quoteItems);
      const matched: OrderItem[] = [];
      lines.forEach((line) => {
        const product = products.find((p) => p.id === line.productId);
        const variant = product?.variants.find((v) => v.id === line.variantId);
        if (!product || !variant) return;
        matched.push({
          id: createOrderLineId(),
          productId: product.id,
          variantId: variant.id,
          quantity: Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1,
          unitPrice: Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? line.unitPrice : (variant.sellingPrice || 0),
        });
      });
      if (matched.length > 0) setItems(matched);
    } catch (error) {
      console.error('Error reading quote items:', error);
    }
  }, [params.quoteItems, products]);

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

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId],
  );
  const selectedCustomerOrderCount = useMemo(
    () => (selectedCustomerId ? orders.filter((order) => order.customerId === selectedCustomerId).length : 0),
    [orders, selectedCustomerId],
  );

  // Units sold per product variant, from past orders (cancelled ones do not count).
  const soldByVariant = useMemo(() => {
    const sold = new Map<string, number>();
    orders.forEach((order) => {
      if (`${order.status ?? ''}`.toLowerCase().includes('cancel')) return;
      (order.items ?? []).forEach((item) => {
        const key = `${item.productId}:${item.variantId}`;
        sold.set(key, (sold.get(key) ?? 0) + (item.quantity || 0));
      });
    });
    return sold;
  }, [orders]);

  // The inventory grid: six products at a time, the most sold ones first. An empty search shows
  // your best sellers; a search shows the best matches, again with the most sold on top.
  const inventoryTiles = useMemo<InventoryTile[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const tiles: InventoryTile[] = [];
    products.forEach((product) => {
      if (product.isDiscontinued || product.isArchived) return;
      if (normalizeProductType(product.productType) === 'service') return;
      if (product.catalogSource === 'woocommerce-plugin') return;
      product.variants.forEach((variant) => {
        const variantName = Object.values(variant.variableValues ?? {}).join(' ');
        const haystack = `${product.name} ${variantName} ${variant.sku ?? ''}`.toLowerCase();
        if (query && !haystack.includes(query)) return;
        tiles.push({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName,
          stock: variant.stock,
          price: variant.sellingPrice,
          isService: false,
          sku: variant.sku ?? '',
          imageUrl: variant.imageUrl || product.imageUrl,
          lowStock: product.lowStockThreshold ?? 5,
        });
      });
    });
    const soldOf = (tile: InventoryTile) => soldByVariant.get(`${tile.productId}:${tile.variantId}`) ?? 0;
    tiles.sort((a, b) => soldOf(b) - soldOf(a) || a.productName.localeCompare(b.productName) || a.variantName.localeCompare(b.variantName));
    return tiles.slice(0, 6);
  }, [products, searchQuery, soldByVariant]);
  // The service grid: your services, the most used first.
  const serviceTiles = useMemo<SearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const used = new Map<string, number>();
    orders.forEach((order) => {
      if (`${order.status ?? ''}`.toLowerCase().includes('cancel')) return;
      (order.items ?? []).forEach((item) => used.set(item.productId, (used.get(item.productId) ?? 0) + (item.quantity || 0)));
    });
    const tiles: SearchResult[] = [];
    products.forEach((product) => {
      if (product.isDiscontinued || product.isArchived) return;
      if (normalizeProductType(product.productType) !== 'service') return;
      if (query && !product.name.toLowerCase().includes(query)) return;
      const variant = product.variants[0];
      if (!variant) return;
      tiles.push({ productId: product.id, productName: product.name, variantId: variant.id, variantName: 'Service', stock: 0, price: variant.sellingPrice, isService: true });
    });
    tiles.sort((a, b) => (used.get(b.productId) ?? 0) - (used.get(a.productId) ?? 0) || a.productName.localeCompare(b.productName));
    return tiles.slice(0, 6);
  }, [orders, products, searchQuery]);
  const showingBestSellers = !searchQuery.trim() && inventoryTiles.some((tile) => (soldByVariant.get(`${tile.productId}:${tile.variantId}`) ?? 0) > 0);

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

  // A custom item is saved as a real inventory product (so it can be sold again and shows up in
  // Inventory) and added to this order as a normal item — which also lets an order be created with
  // custom items only. Stock starts at the quantity ordered and drops back to 0 when the order is created.
  const handleAddCustomItem = async () => {
    const name = customItemName.trim();
    const price = parseFloat(customItemPrice) || 0;
    const quantity = Math.max(1, Math.floor(Number(customItemQuantity) || 1));
    if (!name || price <= 0 || isAddingCustomItem) return;
    if (!businessId) {
      showToast('error', 'Your workspace is still loading. Please try again in a moment.');
      return;
    }
    setIsAddingCustomItem(true);
    try {
      let productId: string;
      let variantId: string;
      const existing = products.find((product) =>
        normalizeProductType(product.productType) === 'product'
        && !product.isArchived
        && !product.isDiscontinued
        && product.variants.length === 1
        && product.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        // Same name already in inventory: reuse it, topping up stock so this order can be created.
        const variant = existing.variants[0];
        productId = existing.id;
        variantId = variant.id;
        if (variant.stock < quantity) {
          await updateVariantStock(productId, variantId, quantity - variant.stock, businessId);
        }
      } else {
        productId = generateProductId();
        variantId = `${productId}-1`;
        await addProduct({
          id: productId,
          name,
          description: 'Custom item added from a new order.',
          categories: ['Custom'],
          variants: [{
            id: variantId,
            sku: `CUSTOM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            barcode: generateVariantBarcode(),
            variableValues: {},
            stock: quantity,
            sellingPrice: price,
          }],
          lowStockThreshold: 0,
          createdAt: new Date().toISOString(),
          productType: 'product',
          createdBy: currentUser?.name,
          useGlobalStock: false,
        }, businessId);
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setItems((current) => {
        const existingIndex = current.findIndex((item) => item.productId === productId && item.variantId === variantId);
        if (existingIndex >= 0) {
          return current.map((item, index) => (index === existingIndex ? { ...item, quantity: item.quantity + quantity, unitPrice: price } : item));
        }
        return [...current, { id: createOrderLineId(), productId, variantId, quantity, unitPrice: price }];
      });
      setCustomItemName('');
      setCustomItemPrice('');
      setCustomItemQuantity('1');
      setShowCustomItemModal(false);
      showToast('success', existing ? `${name} added to this order.` : `${name} added to this order and to your inventory.`);
    } catch (error) {
      console.warn('Could not add custom item:', error);
      showToast('error', 'Could not add the custom item. Please try again.');
    } finally {
      setIsAddingCustomItem(false);
    }
  };

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

  const handleRemoveOrderOption = (itemIndex: number, optionName: string) => {
    setItems((prev) => prev.map((item, index) => {
      if (index !== itemIndex) return item;
      const nextSelectedOptions = { ...(item.selectedOptions ?? {}) };
      delete nextSelectedOptions[optionName];
      return { ...item, selectedOptions: nextSelectedOptions };
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
        socialCheckoutReference: socialCheckoutReference.trim() || undefined,
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

      // Created from a storefront / website payment: link that payment to this order.
      const linkPaymentId = typeof params.linkPaymentId === 'string' ? params.linkPaymentId.trim() : '';
      if (linkPaymentId && businessId) {
        try {
          const paymentRows = await supabaseData.fetchCollection<{ id: string } & Record<string, unknown>>('payments', businessId);
          const paymentRecord = paymentRows.find((row) => row.id === linkPaymentId || row.data?.id === linkPaymentId)?.data;
          if (paymentRecord) {
            const linkedAt = new Date().toISOString();
            await supabaseData.upsertCollection('payments', businessId, [{
              ...paymentRecord,
              linkedOrderId: order.id,
              linkedOrderNumber: order.orderNumber,
              linkedOrderLinkedAt: linkedAt,
              unlinkedOrderId: null,
              unlinkedOrderAt: null,
              updatedAt: linkedAt,
            }]);
          }
        } catch (linkError) {
          console.warn('Payment link update failed:', linkError);
        }
      }

      // Created from a verified quote: mark the quote as converted.
      if (quoteId && businessId) {
        try {
          const quote = (await fetchQuotes(businessId)).find((row) => row.id === quoteId);
          if (quote) {
            const linkedAt = new Date().toISOString();
            await updateQuote(businessId, quote, {
              status: 'order_created',
              convertedOrderId: order.id,
              convertedOrderNumber: order.orderNumber,
              reviewedBy: currentUser?.name,
              reviewedAt: linkedAt,
            }, { text: `Deposit verified, order ${order.orderNumber} created`, tone: 'good' });
            void queryClient.invalidateQueries({ queryKey: quotesQueryKey(businessId) });
          }
        } catch (linkError) {
          console.warn('Quote link update failed:', linkError);
        }
      }

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

      // Optional WhatsApp receipt: a ready-to-send message with the order, total and tracking link.
      if (sendReceipt && customerPhone.trim()) {
        try {
          const firstName = customerName.trim().split(/\s+/)[0] || 'there';
          const lineText = items.map((item) => {
            const product = products.find((entry) => entry.id === item.productId);
            const variant = product?.variants.find((entry) => entry.id === item.variantId);
            const variantLabel = variant ? Object.values(variant.variableValues ?? {}).join(' ') : '';
            return `${item.quantity}x ${product?.name ?? 'Item'}${variantLabel ? ` (${variantLabel})` : ''}`;
          }).concat(services.map((service) => service.name));
          const trackUrl = buildCustomerTrackingUrl({
            origin: getFyllPublicAppOrigin(),
            businessName,
            businessSlug,
            trackingCode: order.customerTrackingCode ?? '',
            email: order.customerEmail,
          });
          const receipt = [
            `Hi ${firstName}, thanks for your order${businessName ? ` from ${businessName}` : ''}!`,
            '',
            `Order ${order.orderNumber}`,
            ...lineText,
            '',
            `Total: ${formatCurrency(totalAmount)}`,
            `Track your order: ${trackUrl}`,
          ].join('\n');
          void Linking.openURL(buildWhatsAppUrl(customerPhone, receipt));
        } catch (receiptError) {
          console.warn('Could not open the WhatsApp receipt:', receiptError);
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

      // Send push notification to team. Skipped when the order comes from a payment that was already approved
      // (Social Checkout / Fyll Checkout): the payment alert has told them, so a "new order" alert is a repeat.
      const alreadyAnnouncedByPayment = Boolean(socialCheckoutReference.trim() || linkPaymentId);
      if (businessId && !alreadyAnnouncedByPayment) {
        sendOrderNotification({
          businessId,
          orderNumber: order.orderNumber,
          customerName: order.customerName || 'Walk-in',
          totalAmount: formatCurrency(totalAmount),
          createdBy: currentUser?.name,
        }).catch(() => {});
      }

      // Queue the WooCommerce copy only after the Fyll order is safely persisted.
      // The slow Woo API work runs in the Edge Function background and never blocks saving.
      let wooQueued = false;
      let wooFailure = '';
      if (sendToWoo && wooAvailable && !websiteOrderRef.trim() && !isServiceOrder && businessId) {
        try {
          await queueWooCommerceOrderFromFyll({ businessId, orderId: order.id, silentImport: !notifyWooCustomer });
          wooQueued = true;
        } catch (wooError) {
          wooFailure = wooError instanceof Error ? wooError.message : 'Could not queue the WooCommerce sync.';
        }
      }

      Haptics.notificationAsync(wooFailure ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);

      const leaveDelay = wooFailure ? 3200 : 900;
      if (wooFailure) {
        showToast('error', `Order saved, but WooCommerce sync could not be queued: ${wooFailure} Send it from the order page.`);
      } else if (params.aiParsed === 'true') {
        showToast('success', wooQueued ? 'Draft order created. Sending to WooCommerce in the background.' : 'Draft order created successfully.');
      } else {
        showToast('success', wooQueued ? 'Order saved. Sending to WooCommerce in the background.' : 'Order saved successfully.');
      }
      if (params.aiParsed === 'true') {
        setTimeout(() => router.replace('/orders'), leaveDelay);
      } else {
        setTimeout(() => router.back(), leaveDelay);
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
        <View style={{ backgroundColor: palette.page }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: isDesktopWeb ? 28 : 16,
              paddingTop: isDesktopWeb ? 20 : 12,
              paddingBottom: 12,
              width: '100%',
              maxWidth: isDesktopWeb ? webMaxWidth : undefined,
              alignSelf: isDesktopWeb ? 'flex-start' : undefined,
            }}
          >
            <BackButton onPress={() => router.back()} palette={palette} label="Back" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <MoneyText style={{ color: palette.text, fontSize: isDesktopWeb ? 28 : 22, letterSpacing: -0.8 }} numberOfLines={1}>New order</MoneyText>
              {isDesktopWeb ? (
                <Text style={{ color: palette.muted, fontSize: 14, marginTop: 2 }}>Customer, items, delivery and payment. Everything else is optional.</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', height: isDesktopWeb ? 44 : 38, padding: 3, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.segmentBg }}>
              {([['product', 'Product'], ['service', 'Service']] as const).map(([mode, label]) => {
                const selected = orderFlowMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setOrderFlowMode(mode);
                    }}
                    style={{ paddingHorizontal: isDesktopWeb ? 18 : 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? FYLL_LIME : 'transparent' }}
                  >
                    <Text style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: 14, fontWeight: '600' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {isDesktopWeb ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={(state) => ({ height: 44, paddingHorizontal: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
              >
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* AI-Parsed Banner */}
        {params.aiParsed === 'true' && (
          <View className={cn('mx-4 mt-4 rounded-[20px] p-4 flex-row items-center border', isDark ? 'bg-[#1C1C1C] border-[#2F2F2F]' : 'bg-purple-50 border-purple-200')}>
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
            <View className={cn('rounded-[20px] p-4 border', cardClass)}>
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className={cn(sectionTitleClass, textPrimaryClass)}>{quoteId ? 'Quote Reference' : 'Social Checkout Reference'}</Text>
                  <Text className={cn('text-xs mt-1', textMutedClass)}>{quoteId ? 'Deposit verified before order creation.' : 'Payment confirmed before order creation.'}</Text>
                </View>
                <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{socialCheckoutReference || websiteOrderRef}</Text>
                </View>
              </View>
              {socialCheckoutAmount > 0 ? (
                <View className="flex-row items-center justify-between mb-3">
                  <Text className={cn('text-sm', textSecondaryClass)}>{quoteId ? 'Deposit Paid' : 'Paid Amount'}</Text>
                  <Text className={cn('text-sm font-semibold', textPrimaryClass)}>{formatCurrency(socialCheckoutAmount)}</Text>
                </View>
              ) : null}
              {socialCheckoutBill.trim() ? (
                <View className="rounded-[20px] p-4" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                  <Text className={cn('text-xs font-semibold uppercase tracking-wider mb-2', textMutedClass)}>What They Ordered</Text>
                  <Text className={cn('text-sm leading-6', textPrimaryClass)}>{socialCheckoutBill.trim()}</Text>
                </View>
              ) : null}
            </View>
          ) : null;

          const orderMetaSection = (
          <View className={cn('rounded-[20px] p-4 border', cardClass)}>
            <View className="mb-4 flex-row items-center" style={{ gap: 12 }}>
              <StepBadge n={5} palette={palette} />
              <View className="flex-1">
                <Text className={textPrimaryClass} style={{ fontSize: isDesktopWeb ? 16 : 14, fontWeight: '500' }}>Order type &amp; reference</Text>
              </View>
            </View>

            {!isServiceOrder && (
              <View className="mb-4">
                <Text className={cn(fieldLabelClass, 'mb-2')} style={{ color: palette.textSoft, fontSize: fieldLabelFontSize }}>Order Type</Text>
                <Pressable
                  onPress={() => setShowOrderTypeMenu((open) => !open)}
                  className="rounded-xl px-4 flex-row items-center justify-between active:opacity-70"
                  style={{
                    minHeight: 48,
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: showOrderTypeMenu ? dropdownOpenBorder : colors.border.light,
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
                {(() => {
                  const start = new Date(orderDateValueForPreview);
                  const earliest = addBusinessDays(new Date(start), fulfillmentTimelinePreview.minBusinessDays);
                  const latest = addBusinessDays(new Date(start), fulfillmentTimelinePreview.maxBusinessDays);
                  const short = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const sameDay = short(earliest) === short(latest);
                  const startsToday = start.toDateString() === new Date().toDateString();
                  const zone = fulfillmentTimelinePreview.shippingZone ? ` · ${fulfillmentTimelinePreview.shippingZone.name}` : '';
                  const stops = [
                    { key: 'placed', title: 'Order placed', date: startsToday ? 'Today' : short(start), align: 'flex-start' as const },
                    { key: 'earliest', title: 'Earliest', date: short(earliest), align: 'center' as const },
                    { key: 'latest', title: 'Latest', date: short(latest), align: 'flex-end' as const },
                  ];
                  return (
                    <View style={{ marginTop: 12, borderRadius: 18, padding: 16, gap: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500' }}>Estimated delivery</Text>
                        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                          <Text style={{ color: palette.limeOnSurface, fontSize: 11.5, fontWeight: '600' }}>
                            {fulfillmentTimelinePreview.minBusinessDays === fulfillmentTimelinePreview.maxBusinessDays ? `${fulfillmentTimelinePreview.maxBusinessDays} business days` : `${fulfillmentTimelinePreview.minBusinessDays}-${fulfillmentTimelinePreview.maxBusinessDays} business days`}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: palette.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
                        {sameDay ? short(latest) : `${short(earliest)} to ${short(latest)}`}
                        <Text style={{ color: palette.faint, fontSize: 13, fontWeight: '400' }}>{`  ${latest.getFullYear()}${zone}`}</Text>
                      </Text>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: palette.textSoft }} />
                          <View style={{ flex: 1, height: 2, backgroundColor: palette.outline }} />
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: FYLL_LIME }} />
                          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: FYLL_LIME }} />
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: FYLL_LIME }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                          {stops.map((stop) => (
                            <View key={stop.key} style={{ alignItems: stop.align, minWidth: 64 }}>
                              <Text style={{ color: palette.faint, fontSize: 11.5 }}>{stop.title}</Text>
                              <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{stop.date}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}

            {wooAvailable || websiteOrderRef.trim() ? (
            <View>
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: palette.textSoft, fontSize: fieldLabelFontSize }}>Website Order Ref (WooCommerce)</Text>
              <FocusInput
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
                className={cn('rounded-[14px] px-4 h-[52px] text-[15px] border', softCardClass)}
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
            ) : null}
          </View>
          );

          const itemLineIds = new Set(items.map((item, index) => getOrderItemLineId(item, index)));
          const unassignedServiceEntries = services
            .map((service, index) => ({ service, index }))
            .filter(({ service }) => !service.linkedItemId || !itemLineIds.has(service.linkedItemId));

          const addonsSection = items.length > 0 && unassignedServiceEntries.length > 0 ? (
            <View className={cn('rounded-[20px] p-4 border', cardClass)}>
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

          const orderDetailsSection = (
          <View className={cn('rounded-[20px] p-4 border', cardClass)}>
            <View className="mb-4 flex-row items-center" style={{ gap: 12 }}>
              <StepBadge n={6} palette={palette} />
              <View className="flex-1">
                <Text className={textPrimaryClass} style={{ fontSize: isDesktopWeb ? 16 : 14, fontWeight: '500' }}>Order details</Text>
              </View>
            </View>

            {/* Order Date */}
            <View className="mb-4">
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: palette.textSoft, fontSize: fieldLabelFontSize }}>Order Date</Text>
              <View className={cn('flex-row rounded-full overflow-hidden border', softCardClass)}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                    setOrderDateType('today');
                  }}
                  className="flex-1 py-3 items-center justify-center"
                  style={{ backgroundColor: orderDateType === 'today' ? FYLL_LIME : 'transparent' }}
                >
                  <Text className={cn(
                    'font-semibold text-sm',
                    orderDateType === 'today' ? 'text-[#1E1E1E]' : textSecondaryClass
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
                  style={{ backgroundColor: orderDateType === 'another' ? FYLL_LIME : 'transparent' }}
                >
                  <Text className={cn(
                    'font-semibold text-sm',
                    orderDateType === 'another' ? 'text-[#1E1E1E]' : textSecondaryClass
                  )}>
                    Another Day
                  </Text>
                </Pressable>
              </View>

              {/* Date Display for "Another Day" */}
              {orderDateType === 'another' && (
                <Pressable
                  onPress={openOrderDatePicker}
                  className={cn('mt-3 rounded-[14px] px-4 py-3.5 flex-row items-center justify-between border active:opacity-70', softCardClass)}
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

            <View>
              <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: palette.textSoft, fontSize: fieldLabelFontSize }}>Order Category</Text>
              <Pressable
                onPress={() => setShowOrderClassificationModal(!showOrderClassificationModal)}
                className={cn('rounded-[14px] px-4 py-3.5 flex-row items-center justify-between border', softCardClass)}
                style={showOrderClassificationModal ? { borderColor: dropdownOpenBorder } : undefined}
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

          </View>
          );

          const prescriptionSectionEl = (
          <PrescriptionSection
            prescription={customerPrescription}
            onUpdate={setCustomerPrescription}
            editable
            staffName={currentUser?.name}
            containerClassName=""
            stepNumber={7}
          />
          );

          // ── New layout: numbered steps + a summary ───────────────────────────────
          const compact = !isDesktopWeb;
          const fieldInput = [{ height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null];
          const fieldLabel = (text: string) => (
            <Text style={{ color: palette.textSoft, fontSize: fieldLabelFontSize, fontWeight: '600', marginBottom: 8 }}>{text}</Text>
          );
          const innerBox = { borderRadius: 18, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border } as const;
          const limeButtonStyle = (state: { pressed: boolean; hovered?: boolean }, height = 44) => ({ height, borderRadius: 999, paddingHorizontal: 18, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, backgroundColor: state.hovered ? FYLL_LIME_HOVER : FYLL_LIME, opacity: state.pressed ? 0.85 : 1 });
          const outlinePill = { height: 40, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: palette.outline };

          // Delivery state and address live with the customer, so a new customer is added in one go.
          const deliveryFields = (
            <>
                <View>
                  <Text className={cn(fieldLabelClass, 'mb-1.5')} style={{ color: palette.textSoft, fontSize: fieldLabelFontSize }}>Delivery State</Text>
                  <Pressable
                    onPress={() => {
                      setShowStateModal(!showStateModal);
                      if (showStateModal) setStateSearchQuery('');
                    }}
                    className={cn('rounded-[14px] px-4 py-3.5 flex-row items-center justify-between border', softCardClass)}
                    style={showStateModal ? { borderColor: dropdownOpenBorder } : undefined}
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
                      <View style={{ padding: 8 }}>
                        <SearchBox value={stateSearchQuery} onChangeText={setStateSearchQuery} placeholder="Search state" palette={palette} />
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


              <View>
                {fieldLabel('Delivery address')}
                <FocusInput
                  placeholder="Enter full delivery address"
                  placeholderTextColor={palette.faint}
                  value={deliveryAddress}
                  onChangeText={setDeliveryAddress}
                  multiline
                  textAlignVertical="top"
                  style={[fieldInput, { height: undefined, minHeight: 84, paddingTop: 14, lineHeight: 21 }]}
                />
              </View>
            </>
          );

          const customerStep = (
            <StepCard n={1} title="Customer" compact={compact} palette={palette}>
              {selectedCustomer ? (
                <View style={{ ...innerBox, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                    <Text style={{ color: FYLL_LIME_INK, fontSize: 17, fontWeight: '700' }}>{getInitials(selectedCustomer.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 160, gap: 3 }}>
                    <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                      {selectedCustomer.fullName}
                      <Text style={{ color: palette.faint, fontSize: 14, fontWeight: '400' }}>{`  ·  ${selectedCustomerOrderCount} ${selectedCustomerOrderCount === 1 ? 'order' : 'orders'}`}</Text>
                    </Text>
                    {[
                      selectedCustomer.phone ? `Phone: ${selectedCustomer.phone}` : '',
                      selectedCustomer.email ? `Email: ${selectedCustomer.email}` : '',
                      deliveryState.trim() ? `State: ${deliveryState.trim()}` : '',
                      deliveryAddress.trim() ? `Address: ${deliveryAddress.trim()}` : '',
                    ].filter(Boolean).map((line) => (
                      <Text key={line} style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }} selectable>{line}</Text>
                    ))}
                  </View>
                  <Pressable accessibilityRole="button" onPress={handleClearCustomer} style={(state) => ({ ...outlinePill, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {customers.length > 0 ? (
                    <View>
                      <SearchBox value={customerSearchQuery} onChangeText={setCustomerSearchQuery} placeholder="Find an existing customer" palette={palette} />
                      {customerSearchQuery.trim() ? (
                        <View style={{ ...innerBox, marginTop: 8, overflow: 'hidden' }}>
                          {customerSearchResults.length === 0 ? <Text style={{ color: palette.faint, fontSize: 14, padding: 16 }}>No customers found. Add them below.</Text> : null}
                          {customerSearchResults.slice(0, 5).map((customer, index) => (
                            <Pressable
                              key={customer.id}
                              accessibilityRole="button"
                              onPress={() => handleSelectCustomer(customer)}
                              style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: index ? 1 : 0, borderTopColor: palette.hairline, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
                            >
                              <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.avatarBg }}>
                                <Text style={{ color: palette.avatarText, fontSize: 13, fontWeight: '600' }}>{getInitials(customer.fullName)}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '500' }}>{customer.fullName}</Text>
                                <Text style={{ color: palette.faint, fontSize: 13 }}>{customer.phone || customer.email || 'No contact info'}</Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View>
                    {fieldLabel('Full name *')}
                    <FocusInput placeholder="Customer name" placeholderTextColor={palette.faint} value={customerName} onChangeText={setCustomerName} style={fieldInput} />
                  </View>
                  <View style={{ flexDirection: compact ? 'column' : 'row', gap: 14 }}>
                    <View style={{ flex: 1 }}>
                      {fieldLabel('Phone')}
                      <FocusInput placeholder="+234 xxx xxx xxxx" placeholderTextColor={palette.faint} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" style={fieldInput} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {fieldLabel('Email')}
                      <FocusInput placeholder="email@example.com" placeholderTextColor={palette.faint} value={customerEmail} onChangeText={setCustomerEmail} keyboardType="email-address" autoCapitalize="none" style={fieldInput} />
                    </View>
                  </View>
                </>
              )}
              {isServiceOrder ? null : (!selectedCustomer || !deliveryState.trim() || !deliveryAddress.trim()) ? deliveryFields : null}
            </StepCard>
          );

          // Product orders: the cart, a search, the inventory grid and a custom item.
          const cartLineIds = new Set(items.map((item, index) => getOrderItemLineId(item, index)));
          const customEntries = services
            .map((service, index) => ({ service, index }))
            .filter(({ service }) => !service.linkedItemId || !cartLineIds.has(service.linkedItemId));
          const cartCount = items.length + customEntries.length;

          const productItemsStep = (
            <StepCard
              n={2}
              title="Items"
              compact={compact}
              palette={palette}
              right={<Text style={{ color: palette.faint, fontSize: 14 }}>{cartCount} {cartCount === 1 ? 'item' : 'items'}</Text>}
            >
              {cartCount > 0 ? (
                <View style={{ ...innerBox, paddingHorizontal: 14 }}>
                  {items.map((item, index) => {
                    const details = getItemDetails(item);
                    const product = products.find((entry) => entry.id === item.productId);
                    const variant = product?.variants.find((entry) => entry.id === item.variantId);
                    const lineId = getOrderItemLineId(item, index);
                    const linked = services.map((service, serviceIndex) => ({ service, serviceIndex })).filter(({ service }) => service.linkedItemId === lineId);
                    const title = details.variantName ? `${details.productName} · ${details.variantName}` : details.productName;
                    return (
                      <View key={lineId} style={{ paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: palette.hairline, gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: compact ? 'wrap' : 'nowrap' }}>
                          <Thumb imageUrl={variant?.imageUrl || product?.imageUrl} size={compact ? 48 : 56} palette={palette} />
                          <View style={{ flex: 1, minWidth: compact ? 120 : 0, gap: 2 }}>
                            <Text style={{ color: palette.text, fontSize: orderLineFontSize, fontWeight: '600' }} numberOfLines={2}>{title}</Text>
                            <Text style={{ color: palette.muted, fontSize: orderLineFontSize }}>{formatCurrency(item.unitPrice)} each</Text>
                          </View>
                          <Stepper quantity={item.quantity} onMinus={() => handleUpdateQuantity(index, -1)} onPlus={() => handleUpdateQuantity(index, 1)} palette={palette} fontSize={compact ? 15 : 16} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: compact && customServices.length > 0 ? 'space-between' : 'flex-end', gap: 12, ...(compact ? { width: '100%' } : null) }}>
                            {compact && customServices.length > 0 ? (
                              <Pressable accessibilityRole="button" onPress={() => openAddServiceForItem(index)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline }}>
                                <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>+ Add-on</Text>
                              </Pressable>
                            ) : null}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Text style={{ minWidth: compact ? 82 : 96, textAlign: 'right', color: palette.text, fontSize: orderLineFontSize, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
                              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${title}`} hitSlop={8} onPress={() => handleRemoveItem(index)} style={{ padding: 4 }}>
                                <Trash2 size={17} color={palette.danger} strokeWidth={2.2} />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                        {details.orderOptions.length > 0 || (!compact && customServices.length > 0) ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: compact ? 0 : 68 }}>
                            {details.orderOptions.map((option) => (
                              <Pressable
                                key={option.id}
                                accessibilityRole="button"
                                onPress={() => { setOptionPickerItemIndex(index); setOptionPickerOptionName(option.name); }}
                                style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.softFill }}
                              >
                                <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '600' }}>{option.name}: {item.selectedOptions?.[option.name] ?? 'Choose'}</Text>
                              </Pressable>
                            ))}
                            {!compact && customServices.length > 0 ? (
                              <Pressable accessibilityRole="button" onPress={() => openAddServiceForItem(index)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline }}>
                                <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>+ Add-on</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                        {linked.map(({ service, serviceIndex }) => (
                          <View key={`${lineId}-${serviceIndex}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: compact ? 0 : 68 }}>
                            <Text style={{ flex: 1, color: palette.muted, fontSize: 13.5 }}>+ {service.name}</Text>
                            <Text style={{ color: palette.textSoft, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{formatCurrency(service.price)}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${service.name}`} hitSlop={8} onPress={() => handleRemoveService(serviceIndex)}>
                              <X size={15} color={palette.faint} strokeWidth={2.4} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                  {customEntries.map(({ service, index }, position) => (
                    <View key={`custom-${index}`} style={{ paddingVertical: 14, borderTopWidth: items.length + position ? 1 : 0, borderTopColor: palette.hairline, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: compact ? 48 : 56, height: compact ? 48 : 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                        <Pencil size={18} color={palette.limeOnSurface} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: palette.text, fontSize: orderLineFontSize, fontWeight: '600' }} numberOfLines={2}>{service.name}</Text>
                        <Text style={{ color: palette.muted, fontSize: 13.5 }}>Custom item</Text>
                      </View>
                      <Text style={{ color: palette.text, fontSize: orderLineFontSize, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(service.price)}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${service.name}`} hitSlop={8} onPress={() => handleRemoveService(index)}>
                        <X size={17} color={palette.faint} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <SearchBox value={searchQuery} onChangeText={setSearchQuery} placeholder="Search inventory: name, colour or SKU" palette={palette} />

              {showingBestSellers ? (
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '500', marginBottom: -4 }}>Most sold</Text>
              ) : null}
              {inventoryTiles.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {inventoryTiles.map((tile) => {
                    const addedQty = items.filter((item) => item.productId === tile.productId && item.variantId === tile.variantId).reduce((sum, item) => sum + item.quantity, 0);
                    const lowStock = tile.stock <= tile.lowStock;
                    return (
                      <View key={`${tile.productId}-${tile.variantId}`} style={{ ...innerBox, flexGrow: 1, flexBasis: compact ? '100%' : '48%', minWidth: 0, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Thumb imageUrl={tile.imageUrl} size={52} palette={palette} />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }} numberOfLines={2}>{tile.variantName ? `${tile.productName} · ${tile.variantName}` : tile.productName}</Text>
                          <Text style={{ color: lowStock ? palette.warn : palette.faint, fontSize: 10 }} numberOfLines={1}>{tile.sku ? `${tile.sku} · ` : ''}{tile.stock} in stock</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{formatCurrency(tile.price)}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${tile.productName}`}
                            onPress={() => {
                              const query = searchQuery;
                              handleAddProduct(tile);
                              setSearchQuery(query);
                            }}
                            style={addedQty > 0
                              ? { height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }
                              : { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}
                          >
                            {addedQty > 0
                              ? <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>{`Added · ${addedQty}`}</Text>
                              : <Plus size={16} color={palette.text} strokeWidth={2.4} />}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ color: palette.faint, fontSize: 14 }}>{searchQuery.trim() ? 'No products match your search.' : 'No products in your inventory yet.'}</Text>
              )}

              <Pressable accessibilityRole="button" onPress={() => setShowCustomItemModal(true)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 14, fontWeight: '600' }}>+ Custom item (adds to inventory)</Text>
              </Pressable>
            </StepCard>
          );

          const serviceItemsStep = (
            <StepCard
              n={2}
              title="Services"
              compact={compact}
              palette={palette}
              right={<Text style={{ color: palette.faint, fontSize: 14 }}>{items.length} {items.length === 1 ? 'service' : 'services'}</Text>}
            >
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
                      className="mb-3"
                      style={{ ...innerBox, padding: 14 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: compact ? 'wrap' : 'nowrap' }}>
                        <View style={{ width: compact ? 48 : 56, height: compact ? 48 : 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                          <Package size={20} color={palette.limeOnSurface} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: compact ? 120 : 0, gap: 2 }}>
                          <Text style={{ color: palette.text, fontSize: orderLineFontSize, fontWeight: '600' }} numberOfLines={2}>{fullName}</Text>
                          <Text style={{ color: palette.muted, fontSize: orderLineFontSize }}>
                            {isService ? `${formatCurrency(item.unitPrice)} each` : `${stock} in stock · ${formatCurrency(item.unitPrice)} each`}
                          </Text>
                        </View>
                        <Stepper quantity={item.quantity} onMinus={() => handleUpdateQuantity(index, -1)} onPlus={() => handleUpdateQuantity(index, 1)} palette={palette} fontSize={compact ? 15 : 16} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, ...(compact ? { width: '100%' } : null) }}>
                          <Text style={{ minWidth: compact ? 82 : 96, textAlign: 'right', color: palette.text, fontSize: orderLineFontSize, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${fullName}`} hitSlop={8} onPress={() => handleRemoveItem(index)} style={{ padding: 4 }}>
                            <Trash2 size={17} color={palette.danger} strokeWidth={2.2} />
                          </Pressable>
                        </View>
                      </View>

                      {!isService && (orderOptions.length > 0 || legacySelectedOptionEntries.length > 0) && (
                        <View className="mt-3 pt-3 border-t" style={{ borderTopColor: palette.hairline }}>
                          <View className="flex-row items-center justify-between mb-2">
                            <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.faint }}>
                              Product Options
                            </Text>
                            {orderOptions.length > 0 ? (
                              <Pressable
                                onPress={() => {
                                  setOptionPickerSearch('');
                                  setOptionPickerItemIndex(index);
                                  setOptionPickerOptionName(orderOptions.length === 1 ? orderOptions[0].name : null);
                                }}
                                className="px-3 py-1.5 rounded-full flex-row items-center active:opacity-70"
                                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                              >
                                <Plus size={13} color={colors.text.primary} strokeWidth={2} />
                                <Text className="text-xs font-semibold ml-1" style={{ color: colors.text.primary }}>Add Option</Text>
                              </Pressable>
                            ) : null}
                          </View>

                          {(() => {
                            const chosenEntries = orderOptions
                              .map((option) => [option.name, selectedOptions[option.name]] as const)
                              .filter(([, value]) => Boolean(value));
                            if (chosenEntries.length === 0 && legacySelectedOptionEntries.length === 0) {
                              return <Text className="text-xs text-gray-400">No options selected for this item.</Text>;
                            }
                            return (
                              <View style={{ gap: 8 }}>
                                {chosenEntries.map(([name, value]) => (
                                  <View key={name} className="flex-row items-center justify-between">
                                    <View className="flex-row items-center" style={{ gap: 8 }}>
                                      <Text className="text-sm font-medium" style={{ color: colors.text.secondary }}>{name}</Text>
                                      <View
                                        className="rounded-full px-3 items-center justify-center"
                                        style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 28 }}
                                      >
                                        <Text className="text-sm font-semibold" style={{ color: colors.text.primary }}>{value}</Text>
                                      </View>
                                    </View>
                                    <View className="flex-row items-center" style={{ gap: 4 }}>
                                      <Pressable
                                        onPress={() => {
                                          setOptionPickerSearch('');
                                          setOptionPickerItemIndex(index);
                                          setOptionPickerOptionName(name);
                                        }}
                                        className="w-7 h-7 rounded-full items-center justify-center active:opacity-70"
                                      >
                                        <Pencil size={12} color={colors.text.primary} strokeWidth={2.4} />
                                      </Pressable>
                                      <Pressable
                                        onPress={() => handleRemoveOrderOption(index, name)}
                                        className="w-7 h-7 rounded-full items-center justify-center active:opacity-70"
                                      >
                                        <X size={14} color={colors.text.muted} strokeWidth={2.4} />
                                      </Pressable>
                                    </View>
                                  </View>
                                ))}
                                {legacySelectedOptionEntries.map(([name, value]) => (
                                  <View key={name} className="self-start rounded-full px-3 py-1.5" style={{ backgroundColor: colors.bg.secondary }}>
                                    <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">
                                      {name}: {value}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            );
                          })()}
                        </View>
                      )}

                      {isService && (serviceVariables.length > 0 || serviceFields.length > 0) && (
                        <View className="mt-3 pt-3 border-t" style={{ borderTopColor: palette.hairline }}>
                          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500', marginBottom: 12 }}>
                            Service configuration
                          </Text>
                          <View className="gap-3">
                            {serviceVariables.map((variable) => {
                              const value = variable.value ?? '';
                              const isRequired = Boolean(variable.required);
                              return (
                                <View key={variable.id}>
                                  <Text style={{ color: palette.textSoft, fontSize: fieldLabelFontSize, fontWeight: '600', marginBottom: 8 }}>
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
                                            style={{
                                              height: 38,
                                              paddingHorizontal: 16,
                                              borderRadius: 999,
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              backgroundColor: selected ? FYLL_LIME : 'transparent',
                                              borderWidth: selected ? 0 : 1,
                                              borderColor: palette.outline,
                                            }}
                                          >
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? FYLL_LIME_INK : palette.textSoft }}>
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
                                      trackColor={{ true: FYLL_LIME, false: palette.outline }}
                                      thumbColor="#FFFFFF"
                                      value={value === 'true'}
                                      onValueChange={(next: boolean) => handleServiceVariableUpdate(index, variable.id, next ? 'true' : 'false')}
                                    />
                                  )}
                                  {variable.type === 'Number' && (
                                    <FocusInput
                                      value={value}
                                      onChangeText={(next) => handleServiceVariableUpdate(index, variable.id, next)}
                                      placeholder="Enter value"
                                      placeholderTextColor={palette.faint}
                                      keyboardType="numeric"
                                      className={cn('rounded-[14px] px-4 h-[52px] text-[15px] border', softCardClass, textPrimaryClass)}
                                    />
                                  )}
                                  {variable.type === 'Text' && (
                                    <FocusInput
                                      value={value}
                                      onChangeText={(next) => handleServiceVariableUpdate(index, variable.id, next)}
                                      placeholder="Enter value"
                                      placeholderTextColor={palette.faint}
                                      className={cn('rounded-[14px] px-4 h-[52px] text-[15px] border', softCardClass, textPrimaryClass)}
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
                                  <Text style={{ color: palette.textSoft, fontSize: fieldLabelFontSize, fontWeight: '600', marginBottom: 8 }}>
                                    {field.label}{isRequired ? ' *' : ''}
                                  </Text>
                                  {fieldType === 'Date' ? (
                                    <Pressable
                                      onPress={() => openServiceFieldDatePicker(index, field.id, value)}
                                      className={cn('rounded-[14px] px-4 h-[52px] border flex-row items-center justify-between', softCardClass)}
                                    >
                                      <View className="flex-row items-center">
                                        <Calendar size={16} color={palette.faint} strokeWidth={2} />
                                        <Text className={cn('text-[15px] ml-2', displayDateValue ? textPrimaryClass : textMutedClass)}>
                                          {displayDateValue || value || 'Pick a date'}
                                        </Text>
                                      </View>
                                      <ChevronDown size={16} color={palette.faint} strokeWidth={2} />
                                    </Pressable>
                                  ) : fieldType === 'Time' ? (
                                    <Pressable
                                      onPress={() => openServiceFieldTimePicker(index, field.id, value)}
                                      className={cn('rounded-[14px] px-4 h-[52px] border flex-row items-center justify-between', softCardClass)}
                                    >
                                      <View className="flex-row items-center">
                                        <Clock3 size={16} color={palette.faint} strokeWidth={2} />
                                        <Text className={cn('text-[15px] ml-2', displayTimeValue ? textPrimaryClass : textMutedClass)}>
                                          {displayTimeValue || value || 'Pick a time'}
                                        </Text>
                                      </View>
                                      <ChevronDown size={16} color={palette.faint} strokeWidth={2} />
                                    </Pressable>
                                  ) : fieldType === 'Select' ? (
                                    <View className="flex-row flex-wrap gap-2">
                                      {fieldOptions.map((option) => {
                                        const selected = value === option.value;
                                        return (
                                          <Pressable
                                            key={`${field.id}-${option.value}-${option.amount ?? 'na'}`}
                                            onPress={() => handleServiceFieldUpdate(index, field.id, option.value)}
                                            style={{
                                              height: 38,
                                              paddingHorizontal: 16,
                                              borderRadius: 999,
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              backgroundColor: selected ? FYLL_LIME : 'transparent',
                                              borderWidth: selected ? 0 : 1,
                                              borderColor: palette.outline,
                                            }}
                                          >
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? FYLL_LIME_INK : palette.textSoft }}>
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
                                    <FocusInput
                                      value={value}
                                      onChangeText={(next) => handleServiceFieldUpdate(index, field.id, next)}
                                      placeholder={fieldType === 'Number' || fieldType === 'Price' ? 'Enter number' : 'Enter value'}
                                      placeholderTextColor={palette.faint}
                                      keyboardType={fieldType === 'Number' || fieldType === 'Price' ? 'numeric' : 'default'}
                                      className={cn('rounded-[14px] px-4 h-[52px] text-[15px] border', softCardClass, textPrimaryClass)}
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
                              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>
                                Add-ons for this item
                              </Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => openAddServiceForItem(index)}
                              style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: palette.outline }}
                            >
                              <Plus size={14} color={palette.text} strokeWidth={2.4} />
                              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Add add-on</Text>
                            </Pressable>
                          </View>

                          {linkedServiceEntries.length > 0 ? (
                            <View style={{ gap: 8 }}>
                              {linkedServiceEntries.map(({ service, serviceIndex }) => (
                                <View
                                  key={`${service.serviceId}-${serviceIndex}`}
                                  className="flex-row items-center"
                                  style={{ backgroundColor: palette.softFill, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
                                >
                                  <View className="flex-1">
                                    <Text className={cn('font-medium text-sm', textPrimaryClass)}>{service.name}</Text>
                                    <Text className={cn('text-xs mt-0.5', textMutedClass)}>Linked to {fullName}</Text>
                                  </View>
                                  <Text className={cn('font-bold text-sm mr-2', textPrimaryClass)}>{formatCurrency(service.price)}</Text>
                                  <Pressable
                                    onPress={() => openEditServicePrice(serviceIndex)}
                                    className="p-2 mr-1 active:opacity-70"
                                  >
                                    <Pencil size={14} color={service.price > 0 ? palette.muted : palette.warn} strokeWidth={2.2} />
                                  </Pressable>
                                  <Pressable onPress={() => handleRemoveService(serviceIndex)} className="p-1 active:opacity-50">
                                    <Trash2 size={15} color={palette.danger} strokeWidth={2.2} />
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
            ) : null}

              <SearchBox value={searchQuery} onChangeText={setSearchQuery} placeholder="Search services" palette={palette} />

              {serviceTiles.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {serviceTiles.map((tile) => {
                    const addedQty = items.filter((item) => item.productId === tile.productId && item.variantId === tile.variantId).reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <View key={`${tile.productId}-${tile.variantId}`} style={{ ...innerBox, flexGrow: 1, flexBasis: compact ? '100%' : '48%', minWidth: 0, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                          <Package size={20} color={palette.limeOnSurface} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }} numberOfLines={2}>{tile.productName}</Text>
                          <Text style={{ color: palette.faint, fontSize: 10 }}>Service</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{formatCurrency(tile.price)}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${tile.productName}`}
                            onPress={() => {
                              const query = searchQuery;
                              handleAddProduct(tile);
                              setSearchQuery(query);
                            }}
                            style={addedQty > 0
                              ? { height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }
                              : { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}
                          >
                            {addedQty > 0
                              ? <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>{`Added · ${addedQty}`}</Text>
                              : <Plus size={16} color={palette.text} strokeWidth={2.4} />}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ color: palette.faint, fontSize: 14 }}>{searchQuery.trim() ? 'No services match your search.' : 'No services in your catalog yet.'}</Text>
              )}
            </StepCard>
          );

          // Extra charges and discounts sit in their own step, just above payment.
          const chargesStep = (
            <StepCard n={3} title="Charges" compact={compact} palette={palette}>
              {isServiceOrder ? null : (
                <View>
                  {fieldLabel('Delivery fee')}
                  <FocusInput placeholder="0" placeholderTextColor={palette.faint} value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="numeric" style={fieldInput} />
                </View>
              )}
              <View>
                {fieldLabel('Additional charges')}
                <FocusInput placeholder="0" placeholderTextColor={palette.faint} value={additionalCharges} onChangeText={setAdditionalCharges} keyboardType="numeric" style={fieldInput} />
              </View>
              {additionalChargesNum > 0 ? (
                <View>
                  {fieldLabel('What the extra charge is for')}
                  <FocusInput placeholder="Describe the additional charges" placeholderTextColor={palette.faint} value={additionalChargesNote} onChangeText={setAdditionalChargesNote} style={fieldInput} />
                </View>
              ) : null}
              <View>
                {fieldLabel('Discount amount')}
                <FocusInput placeholder="0" placeholderTextColor={palette.faint} value={discountAmount} onChangeText={setDiscountAmount} keyboardType="numeric" style={fieldInput} />
              </View>
            </StepCard>
          );

          const paymentStepNumber = 4;
          const paymentStep = paymentMethods.length > 0 || saleSources.length > 0 ? (
            <StepCard n={paymentStepNumber} title="Payment" compact={compact} palette={palette}>
              {paymentMethods.length > 0 ? (
                <View>
                  {fieldLabel('Payment method')}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {paymentMethods.map((method) => (
                      <ChoicePill key={method.id} label={method.name} selected={paymentMethod === method.name} onPress={() => setPaymentMethod(method.name)} palette={palette} compact={compact} />
                    ))}
                  </View>
                </View>
              ) : null}
              {saleSources.length > 0 ? (
                <View>
                  {fieldLabel('Where did the order come from?')}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {saleSources.map((entry) => (
                      <ChoicePill key={entry.id} label={entry.name} selected={source === entry.name} onPress={() => setSource(entry.name)} palette={palette} compact={compact} />
                    ))}
                  </View>
                </View>
              ) : null}
            </StepCard>
          ) : null;

          // The extra fields are always visible now: order type and reference, date and source, charges, notes.
          const moreOptions = (
            <View style={{ gap: 14 }}>
              {orderMetaSection}
              {orderDetailsSection}
              {prescriptionSectionEl}
            </View>
          );

          // The running total, always visible next to the form on desktop and under it on phones.
          const summaryLines: { key: string; label: string; amount: number }[] = [
            ...items.map((item, index) => {
              const details = getItemDetails(item);
              const name = details.variantName ? `${details.productName} · ${details.variantName}` : details.productName;
              return { key: `i-${index}`, label: `${item.quantity}× ${name}`, amount: item.unitPrice * item.quantity };
            }),
            ...services.map((service, index) => ({ key: `s-${index}`, label: service.name, amount: service.price })),
          ];
          const receiptPhone = customerPhone.trim();
          // Sending to WooCommerce only makes sense for a product order that is not already linked to one.
          const showWooOption = wooAvailable && !isServiceOrder && !websiteOrderRef.trim();
          const canCreateOrder = Boolean(customerName.trim()) && items.length > 0 && !isSubmitting;
          const summaryRow = (label: string, value: string, muted = true) => (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: muted ? palette.muted : palette.text, fontSize: 15 }}>{label}</Text>
              <Text style={{ color: muted ? palette.textSoft : palette.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>{value}</Text>
            </View>
          );
          const summaryCard = (
            <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: compact ? 16 : 22, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ color: palette.text, fontSize: compact ? 14 : 16, fontWeight: '500' }}>Summary</Text>
                {paymentMethod ? (
                  <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                    <Text style={{ color: palette.limeOnSurface, fontSize: 12.5, fontWeight: '600' }}>{paymentMethod}</Text>
                  </View>
                ) : null}
              </View>
              {summaryLines.length === 0 ? <Text style={{ color: palette.faint, fontSize: 14 }}>Add items to see the total.</Text> : null}
              {summaryLines.map((line) => (
                <View key={line.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, color: palette.textSoft, fontSize: orderLineFontSize }} numberOfLines={2}>{line.label}</Text>
                  <Text style={{ color: palette.text, fontSize: orderLineFontSize, fontVariant: ['tabular-nums'] }}>{formatCurrency(line.amount)}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: palette.hairline }} />
              {summaryRow('Subtotal', formatCurrency(subtotal + servicesTotal))}
              {!isServiceOrder ? summaryRow('Delivery', formatCurrency(deliveryFeeNum)) : null}
              {additionalChargesNum > 0 ? summaryRow('Additional charges', formatCurrency(additionalChargesNum)) : null}
              {discountAmountNum > 0 ? summaryRow('Discount', `-${formatCurrency(discountAmountNum)}`) : null}
              {showDiscountInput ? (
                <FocusInput placeholder="Discount amount" placeholderTextColor={palette.faint} value={discountAmount} onChangeText={setDiscountAmount} keyboardType="numeric" autoFocus style={[fieldInput, { height: 46 }]} />
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setShowDiscountInput(true)} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ color: palette.limeOnSurface, fontSize: 14, fontWeight: '600' }}>Add discount</Text>
                </Pressable>
              )}
              <View style={{ height: 1, backgroundColor: palette.hairline }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>Total</Text>
                <MoneyText style={{ color: palette.text, fontSize: compact ? 30 : 38, letterSpacing: -1.2 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalAmount)}</MoneyText>
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sendReceipt, disabled: !receiptPhone }}
                disabled={!receiptPhone}
                onPress={() => setSendReceipt((value) => !value)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: receiptPhone ? 1 : 0.45 }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: sendReceipt && receiptPhone ? FYLL_LIME : 'transparent', borderWidth: sendReceipt && receiptPhone ? 0 : 1.5, borderColor: palette.outline }}>
                  {sendReceipt && receiptPhone ? <Check size={15} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                </View>
                <Text style={{ color: palette.text, fontSize: 15 }}>Send receipt on WhatsApp</Text>
              </Pressable>
              {showWooOption ? (
                <View style={{ gap: 10 }}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: sendToWoo }}
                    onPress={() => setSendToWoo((value) => !value)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: sendToWoo ? FYLL_LIME : 'transparent', borderWidth: sendToWoo ? 0 : 1.5, borderColor: palette.outline }}>
                      {sendToWoo ? <Check size={15} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                    </View>
                    <Text style={{ color: palette.text, fontSize: 15 }}>Send to WooCommerce</Text>
                  </Pressable>
                  {sendToWoo ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: notifyWooCustomer }}
                      onPress={() => setNotifyWooCustomer((value) => !value)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 36 }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: notifyWooCustomer ? FYLL_LIME : 'transparent', borderWidth: notifyWooCustomer ? 0 : 1.5, borderColor: palette.outline }}>
                        {notifyWooCustomer ? <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                      </View>
                      <Text style={{ color: palette.muted, fontSize: 13.5, flex: 1 }}>Let WooCommerce email the customer</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
          // Desktop: the Create order button closes the right-hand column. Phones use the sticky button.
          const createAction = (
            <View style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={handleSubmit}
                disabled={!canCreateOrder}
                style={(state) => ({ ...limeButtonStyle({ pressed: state.pressed, hovered: isHovered(state) }, 48), paddingHorizontal: 22, opacity: canCreateOrder ? (state.pressed ? 0.85 : 1) : 0.45 })}
              >
                {isSubmitting ? <ActivityIndicator size="small" color={FYLL_LIME_INK} /> : null}
                <Text style={{ color: FYLL_LIME_INK, fontSize: 18, fontWeight: '600' }}>{isSubmitting ? 'Creating...' : isServiceOrder ? 'Create service order' : 'Create order'}</Text>
              </Pressable>
              <Text style={{ color: palette.faint, fontSize: 13.5, textAlign: 'center' }}>
                {sendReceipt && receiptPhone ? `Receipt goes to ${customerName.trim().split(/\s+/)[0] || 'the customer'} on WhatsApp` : 'You can edit the order after you create it'}
              </Text>
            </View>
          );
          // Desktop: customer, items and charges on the left; the total, payment and the rest on the right.
          const leftColumn = (
            <View style={{ gap: 14 }}>
              {socialCheckoutSection}
              {customerStep}
              {isServiceOrder ? serviceItemsStep : productItemsStep}
              {isServiceOrder ? addonsSection : null}
              {chargesStep}
            </View>
          );

          return (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={contentWrapperStyle}>
                {isDesktopWeb ? (
                  <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start', paddingTop: 24 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{leftColumn}</View>
                    <View style={{ width: rightColumnWidth ?? 420, gap: 14 }}>
                      {summaryCard}
                      {paymentStep}
                      {moreOptions}
                      {createAction}
                    </View>
                  </View>
                ) : (
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
                    {leftColumn}
                    {paymentStep}
                    {moreOptions}
                    {summaryCard}
                  </View>
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
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={closeServiceModal}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, maxHeight: '78%', borderRadius: 26, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>Add add-on</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeServiceModal} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <X size={16} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              <SearchBox value={addonSearchQuery} onChangeText={setAddonSearchQuery} placeholder="Search add-ons" palette={palette} autoFocus />
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, gap: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredCustomServices.map((service) => (
                <Pressable
                  key={service.id}
                  accessibilityRole="button"
                  onPress={() => handleAddService(service.id)}
                  style={(state) => ({ minHeight: 52, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: isHovered(state) ? palette.softFill : palette.inset, borderWidth: 1, borderColor: palette.border, opacity: state.pressed ? 0.8 : 1 })}
                >
                  <Text style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: '500' }} numberOfLines={2}>{service.name}</Text>
                  <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{formatCurrency(service.defaultPrice)}</Text>
                </Pressable>
              ))}
              {customServices.length === 0 ? (
                <Text style={{ color: palette.faint, fontSize: 14, textAlign: 'center', paddingVertical: 16 }}>No add-ons available. Create one in settings first.</Text>
              ) : null}
              {customServices.length > 0 && filteredCustomServices.length === 0 ? (
                <Text style={{ color: palette.faint, fontSize: 14, textAlign: 'center', paddingVertical: 16 }}>No add-ons match your search.</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Service Price Modal */}
      <Modal visible={showServicePriceModal} animationType="fade" transparent onRequestClose={() => setShowServicePriceModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setShowServicePriceModal(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 26, padding: 20, gap: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>Set service price</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowServicePriceModal(false)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <X size={16} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            </View>
            <View>
              <Text style={{ color: palette.textSoft, fontSize: fieldLabelFontSize, fontWeight: '600', marginBottom: 8 }}>Service fee</Text>
              <FocusInput
                placeholder="0"
                placeholderTextColor={palette.faint}
                value={servicePriceInput}
                onChangeText={setServicePriceInput}
                keyboardType="numeric"
                autoFocus
                style={[{ height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setShowServicePriceModal(false)} style={{ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirmEditServicePrice} style={{ flex: 1.3, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={optionPickerItemIndex !== null} animationType="fade" transparent onRequestClose={() => setOptionPickerItemIndex(null)}>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          <Pressable className="absolute inset-0" onPress={() => setOptionPickerItemIndex(null)} />
          <View className="w-[90%] rounded-2xl overflow-hidden" style={{ backgroundColor: colors.bg.card, maxWidth: 420, maxHeight: '70%' }}>
            {(() => {
              if (optionPickerItemIndex === null) return null;
              const activeItem = items[optionPickerItemIndex];
              const activeOrderOptions = activeItem ? getItemDetails(activeItem).orderOptions : [];
              const activeOption = optionPickerOptionName
                ? activeOrderOptions.find((option) => option.name === optionPickerOptionName)
                : null;
              const query = optionPickerSearch.trim().toLowerCase();

              if (!activeOption) {
                // Step 1: choose which option to set
                const filteredOptions = activeOrderOptions.filter((option) => option.name.toLowerCase().includes(query));
                return (
                  <>
                    <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                      <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Add Option</Text>
                      <Pressable
                        onPress={() => setOptionPickerItemIndex(null)}
                        className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                        style={{ backgroundColor: colors.bg.secondary }}
                      >
                        <X size={18} color={colors.text.muted} strokeWidth={2} />
                      </Pressable>
                    </View>
                    <View className="px-5 pt-4 pb-2">
                      <View className="flex-row items-center rounded-xl px-3" style={{ backgroundColor: colors.bg.secondary, height: 44, borderWidth: 1, borderColor: colors.border.light }}>
                        <Search size={16} color={colors.text.muted} strokeWidth={2} />
                        <TextInput
                          value={optionPickerSearch}
                          onChangeText={setOptionPickerSearch}
                          placeholder="Search options"
                          placeholderTextColor={colors.text.muted}
                          style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
                          autoFocus
                        />
                      </View>
                    </View>
                    <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
                      {filteredOptions.length === 0 ? (
                        <View className="px-5 py-8 items-center">
                          <Text style={{ color: colors.text.muted }} className="text-sm">No matches</Text>
                        </View>
                      ) : (
                        filteredOptions.map((option, optionIndex) => (
                          <Pressable
                            key={option.id || option.name}
                            onPress={() => { setOptionPickerSearch(''); setOptionPickerOptionName(option.name); }}
                            className="flex-row items-center justify-between px-5 py-3 active:opacity-70"
                            style={{ borderTopWidth: optionIndex === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{option.name}</Text>
                            <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </>
                );
              }

              // Step 2: choose value for the selected option
              const filteredValues = activeOption.values.filter((value) => value.toLowerCase().includes(query));
              const currentValue = activeItem?.selectedOptions?.[activeOption.name] ?? '';
              return (
                <>
                  <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                    <Text style={{ color: colors.text.primary }} className="font-bold text-lg">{activeOption.name}</Text>
                    <Pressable
                      onPress={() => setOptionPickerItemIndex(null)}
                      className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                      style={{ backgroundColor: colors.bg.secondary }}
                    >
                      <X size={18} color={colors.text.muted} strokeWidth={2} />
                    </Pressable>
                  </View>
                  <View className="px-5 pt-4 pb-2">
                    <View className="flex-row items-center rounded-xl px-3" style={{ backgroundColor: colors.bg.secondary, height: 44, borderWidth: 1, borderColor: colors.border.light }}>
                      <Search size={16} color={colors.text.muted} strokeWidth={2} />
                      <TextInput
                        value={optionPickerSearch}
                        onChangeText={setOptionPickerSearch}
                        placeholder={`Search ${activeOption.name}`}
                        placeholderTextColor={colors.text.muted}
                        style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
                        autoFocus
                      />
                    </View>
                  </View>
                  <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
                    {filteredValues.length === 0 ? (
                      <View className="px-5 py-8 items-center">
                        <Text style={{ color: colors.text.muted }} className="text-sm">No matches</Text>
                      </View>
                    ) : (
                      filteredValues.map((value, valueIndex) => {
                        const selected = currentValue === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => {
                              handleOrderOptionUpdate(optionPickerItemIndex, activeOption.name, value);
                              setOptionPickerItemIndex(null);
                              setOptionPickerOptionName(null);
                            }}
                            className="flex-row items-center justify-between px-5 py-3 active:opacity-70"
                            style={{ borderTopWidth: valueIndex === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{value}</Text>
                            {selected ? <Check size={16} color={colors.text.primary} strokeWidth={2.4} /> : null}
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </>
              );
            })()}
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
                          style={isSelected ? { backgroundColor: FYLL_LIME } : undefined}
                        >
                          <Text className={cn(
                            'text-sm font-medium',
                            (isSelected || isToday) && 'font-semibold',
                            !isSelected && isFuture && (isDark ? 'text-gray-600' : 'text-gray-300')
                          )}
                          style={{ color: isSelected ? FYLL_LIME_INK : (isFuture ? (isDark ? '#4B5563' : '#D1D5DB') : colors.text.primary) }}>
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
                style={{ backgroundColor: FYLL_LIME }}
              >
                <Text className="font-semibold" style={{ color: FYLL_LIME_INK }}>Done</Text>
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
                style={{ backgroundColor: FYLL_LIME }}
              >
                <Text className="font-semibold" style={{ color: FYLL_LIME_INK }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCustomItemModal} animationType="fade" transparent onRequestClose={() => setShowCustomItemModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setShowCustomItemModal(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 26, padding: 20, gap: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Custom item</Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>For anything not in your inventory yet: a made-to-order piece or a one-off. It is added to your inventory too, so you can sell it again.</Text>
            </View>
            <FocusInput
              placeholder="Item name"
              placeholderTextColor={palette.faint}
              value={customItemName}
              onChangeText={setCustomItemName}
              autoFocus
              style={[{ height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            <FocusInput
              placeholder="Price (₦)"
              placeholderTextColor={palette.faint}
              value={customItemPrice}
              onChangeText={setCustomItemPrice}
              keyboardType="numeric"
              style={[{ height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            <FocusInput
              placeholder="Quantity"
              placeholderTextColor={palette.faint}
              value={customItemQuantity}
              onChangeText={setCustomItemQuantity}
              keyboardType="number-pad"
              style={[{ height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setShowCustomItemModal(false)} style={{ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!customItemName.trim() || !(parseFloat(customItemPrice) > 0) || isAddingCustomItem}
                onPress={() => { void handleAddCustomItem(); }}
                style={{ flex: 1.3, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME, opacity: !customItemName.trim() || !(parseFloat(customItemPrice) > 0) || isAddingCustomItem ? 0.45 : 1 }}
              >
                <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>{isAddingCustomItem ? 'Adding…' : 'Add to order'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sticky Bottom CTA */}
      {!isDesktopWeb && (
        <StickyButtonContainer
          bottomInset={insets.bottom}
          backgroundColor={palette.page}
          borderColor={palette.hairline}
        >
          <View style={contentWrapperStyle}>
            {(() => {
              const canCreate = Boolean(customerName.trim()) && items.length > 0 && !isSubmitting;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSubmit}
                  disabled={!canCreate}
                  style={(state) => ({ height: 50, paddingHorizontal: 22, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FYLL_LIME, opacity: canCreate ? (state.pressed ? 0.85 : 1) : 0.45 })}
                >
                  {isSubmitting ? <ActivityIndicator size="small" color={FYLL_LIME_INK} /> : null}
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 18, fontWeight: '600' }}>
                    {isSubmitting ? 'Creating...' : `${isServiceOrder ? 'Create service order' : 'Create order'}${totalAmount > 0 ? ` · ${formatCurrency(totalAmount)}` : ''}`}
                  </Text>
                </Pressable>
              );
            })()}
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
