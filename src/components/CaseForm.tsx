import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, ChevronDown, Check, Sparkles,
  Link2,
  Mail,
  Phone,
  MessageSquare,
  Globe,
  Store,
  HelpCircle,
  Flag,
  RefreshCcw,
  Undo2,
  DollarSign,
  Zap,
  ShieldCheck,
  ImageIcon,
  Search,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFonts, BricolageGrotesque_500Medium, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { LinearGradient } from 'expo-linear-gradient';
import { FyllAiButton } from '@/components/FyllAiButton';
import { CaseAiSheet } from '@/components/cases/CaseAiSheet';
import { BackButton, isHovered, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import useFyllStore, {
  Case,
  CaseType,
  CaseStatus,
  CasePriority,
  CaseSource,
  CaseResolution,
  ResolutionType,
  CaseTimelineEntry,
  CASE_STATUS_COLORS,
  CASE_TYPES,
  CASE_PRIORITIES,
  CASE_PRIORITY_COLORS,
  CASE_SOURCES,
  CaseAttachment,
  Customer,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  type ReturnReason,
  type ReturnResolution,
  type ReturnShippingPayer,
  generateCaseNumber,
  generateCaseId,
  Order,
} from '@/lib/state/fyll-store';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SearchClearButton } from '@/components/SearchClearButton';

// Get icon for case type
const getCaseTypeIcon = (type: CaseType, color: string, size: number = 18) => {
  const props = { size, color, strokeWidth: 1.5 };
  switch (type) {
    case 'Repair': return <RefreshCcw {...props} />;
    case 'Replacement': return <Undo2 {...props} />;
    case 'Refund': return <DollarSign {...props} />;
    case 'Partial Refund': return <Zap {...props} />;
    case 'Return': return <RefreshCcw {...props} />;
    case 'Goodwill': return <ShieldCheck {...props} />;
    default: return <HelpCircle {...props} />;
  }
};

// Get icon for case source
const getCaseSourceIcon = (source: CaseSource, color: string, size: number = 18) => {
  const props = { size, color, strokeWidth: 1.5 };
  switch (source) {
    case 'Email': return <Mail {...props} />;
    case 'Phone': return <Phone {...props} />;
    case 'Chat': return <MessageSquare {...props} />;
    case 'Web': return <Globe {...props} />;
    case 'In-Store': return <Store {...props} />;
    default: return <HelpCircle {...props} />;
  }
};

type CaseLinkSearchResult =
  | { kind: 'order'; order: Order }
  | { kind: 'customer'; customer: Customer };

export interface CaseReturnDetails {
  reason: ReturnReason;
  otherReason?: string;
  resolution: ReturnResolution;
  shippingPayer: ReturnShippingPayer;
}

const formatOrderItems = (order: Order) =>
  order.items
    .slice(0, 2)
    .map((item) => [item.productName, item.variantName].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');

interface CaseFormProps {
  visible: boolean;
  onClose: () => void;
  onSave: (caseData: Case, returnDetails?: CaseReturnDetails) => void;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  existingCase?: Case;
  createdBy?: string;
  initialCaseType?: CaseType;
  enableReturnDetails?: boolean;
}

// A text field whose border turns lime while you are typing in it.
function FieldInput({ style, onFocus, onBlur, ...props }: React.ComponentProps<typeof TextInput>) {
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

// A numbered card, like on the New Order screen. `raised` lifts it above its neighbours while one of
// its dropdowns is open so the list is not hidden behind the next card.
function CaseStepCard({ n, title, compact, palette, raised, titleFontLoaded, children }: { n: number; title: string; compact: boolean; palette: ReturnType<typeof usePaymentsPalette>; raised?: boolean; titleFontLoaded: boolean; children: React.ReactNode }) {
  return (
    <View style={{ position: 'relative', zIndex: raised ? 500 : 1, borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
          <Text style={{ color: palette.limeOnSurface, fontSize: 12.5, fontWeight: '700' }}>{n}</Text>
        </View>
        <Text style={{ flex: 1, color: palette.text, fontSize: 17, fontWeight: '500', fontFamily: titleFontLoaded ? 'BricolageGrotesque_500Medium' : undefined }}>{title}</Text>
      </View>
      <View style={{ marginBottom: -14 }}>{children}</View>
    </View>
  );
}

export function CaseForm({
  visible,
  onClose,
  onSave,
  orderId,
  orderNumber,
  customerId,
  customerName,
  existingCase,
  createdBy,
  initialCaseType,
  enableReturnDetails,
}: CaseFormProps) {
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_700Bold });
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const { isMobile, isDesktop } = useBreakpoint();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 1024;
  const router = useRouter();
  const isEditing = !!existingCase;
  const isWeb = Platform.OS === 'web';
  const isDark = colors.bg.primary === '#111111';
  const useDesktopCanvas = false;
  const canvasBg = palette.page;
  const panelBg = palette.page;
  const formBg = palette.inset;
  const formBorder = palette.outline;
  const focusBorder = palette.isDark ? FYLL_LIME : '#B8C43A';

  const [showAiSheet, setShowAiSheet] = useState<boolean>(false);
  const [caseType, setCaseType] = useState<CaseType>('Other');
  const [status, setStatus] = useState<CaseStatus>('Open');
  const [priority, setPriority] = useState<CasePriority>('Medium');
  const [source, setSource] = useState<CaseSource>('Email');
  const [issueSummary, setIssueSummary] = useState('');
  const [originalMessage, setOriginalMessage] = useState('');
  const [standaloneCustomerName, setStandaloneCustomerName] = useState(customerName || '');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCaseTypeDropdown, setShowCaseTypeDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [attachments, setAttachments] = useState<CaseAttachment[]>(existingCase?.attachments ?? []);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const resolutionTypes = useFyllStore((s) => s.resolutionTypes);
  const orders = useFyllStore((s) => s.orders);
  const customers = useFyllStore((s) => s.customers);
  const resolutionTypeOptions = resolutionTypes.map((rt) => rt.name);
  const caseTypeOptions = useMemo(() => {
    const base = [...CASE_TYPES];
    if (caseType && !base.includes(caseType)) {
      base.push(caseType);
    }
    return base;
  }, [caseType]);
  const sourceOptions = useMemo(() => {
    const base = [...CASE_SOURCES];
    if (source && !base.includes(source)) {
      base.push(source);
    }
    return base;
  }, [source]);
  const statusOptions = caseStatuses.length > 0
    ? caseStatuses.map((option) => option.name)
    : Object.keys(CASE_STATUS_COLORS);
  const statusColorMap = caseStatuses.reduce<Record<string, string>>((map, option) => {
    map[option.name] = option.color;
    return map;
  }, {});
  Object.entries(CASE_STATUS_COLORS).forEach(([name, color]) => {
    if (!statusColorMap[name]) {
      statusColorMap[name] = color;
    }
  });
  const selectedStatusOption = caseStatuses.find((option) => option.name === status);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [nameFocused, setNameFocused] = useState<boolean>(false);
  const [returnReason, setReturnReason] = useState<ReturnReason | null>(null);
  const [returnResolution, setReturnResolution] = useState<ReturnResolution | null>(null);
  const [returnShippingPayer, setReturnShippingPayer] = useState<ReturnShippingPayer | null>(null);
  const [returnOtherReason, setReturnOtherReason] = useState('');
  const [showReturnReasonDropdown, setShowReturnReasonDropdown] = useState(false);
  const [showReturnResolutionDropdown, setShowReturnResolutionDropdown] = useState(false);
  const [showReturnShippingDropdown, setShowReturnShippingDropdown] = useState(false);

  // Resolution fields
  const [resolutionType, setResolutionType] = useState<ResolutionType>('No Action Required');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionValue, setResolutionValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showResolutionTypeDropdown, setShowResolutionTypeDropdown] = useState(false);

  useEffect(() => {
    const defaultStatus = caseStatuses[0]?.name ?? 'Open';
    const defaultResolutionType = resolutionTypes[0]?.name ?? 'No Action Required';
    if (existingCase) {
      setCaseType(existingCase.type);
      setStatus(existingCase.status);
      setPriority(existingCase.priority || 'Medium');
      setSource(existingCase.source || 'Email');
      setIssueSummary(existingCase.issueSummary);
      setOriginalMessage(existingCase.originalCustomerMessage || '');
      setStandaloneCustomerName(existingCase.customerName || customerName || '');
      setAttachments(existingCase.attachments ?? []);
      const matchedOrder = existingCase.orderId ? orders.find((item) => item.id === existingCase.orderId) ?? null : null;
      const matchedCustomer = existingCase.customerId ? customers.find((item) => item.id === existingCase.customerId) ?? null : null;
      setSelectedOrder(matchedOrder);
      setSelectedCustomer(matchedCustomer);
      setLinkSearchQuery('');
      setReturnReason(null);
      setReturnResolution(null);
      setReturnShippingPayer(null);
      setReturnOtherReason('');
      if (existingCase.resolution) {
        setResolutionType(existingCase.resolution.type);
        setResolutionNotes(existingCase.resolution.notes);
        setResolutionValue(existingCase.resolution.value?.toString() || '');
      }
    } else {
      // Reset form for new case
      setCaseType(initialCaseType ?? 'Other');
      setStatus(defaultStatus);
      setPriority('Medium');
      setSource('Email');
      setIssueSummary('');
      setOriginalMessage('');
      setAttachments([]);
      setResolutionType(defaultResolutionType);
      setResolutionNotes('');
      setResolutionValue('');
      setStandaloneCustomerName(customerName || '');
      const matchedOrder = orderId ? orders.find((item) => item.id === orderId) ?? null : null;
      const matchedCustomer = customerId ? customers.find((item) => item.id === customerId) ?? null : null;
      setSelectedOrder(matchedOrder);
      setSelectedCustomer(matchedCustomer);
      setLinkSearchQuery('');
      setReturnReason(null);
      setReturnResolution(null);
      setReturnShippingPayer(null);
      setReturnOtherReason('');
    }
  }, [existingCase, visible, caseStatuses, resolutionTypes, customerName, initialCaseType, orderId, customerId, orders, customers]);

  const showResolution = status === 'Resolved' || status === 'Closed';
  const showReturnDetails = Boolean(enableReturnDetails && caseType === 'Return' && !isEditing);
  const selectedReturnReasonLabel = returnReason
    ? RETURN_REASONS.find((item) => item.value === returnReason)?.label ?? 'Choose reason'
    : 'Choose reason';
  const selectedReturnResolutionLabel = returnResolution
    ? RETURN_RESOLUTIONS.find((item) => item.value === returnResolution)?.label ?? 'Choose refund or exchange'
    : 'Choose refund or exchange';
  const returnShippingOptions: Array<{ value: ReturnShippingPayer; label: string }> = [
    { value: 'customer', label: 'Customer pays' },
    { value: 'seller', label: 'Business pays' },
  ];
  const selectedReturnShippingLabel = returnShippingPayer
    ? returnShippingOptions.find((item) => item.value === returnShippingPayer)?.label ?? 'Choose who pays'
    : 'Choose who pays';
  const canSearchCaseLink = !orderId;
  const selectedLinkLabel = selectedOrder
    ? `${selectedOrder.orderNumber} · ${selectedOrder.customerName}`
    : selectedCustomer
      ? selectedCustomer.fullName
      : null;
  // Typing in the Customer Name field suggests matching customers (name, phone or email).
  const nameSuggestions = useMemo<Customer[]>(() => {
    const query = standaloneCustomerName.trim().toLowerCase();
    if (!nameFocused || !query || selectedCustomer?.fullName === standaloneCustomerName) return [];
    return customers
      .filter((item) => [item.fullName, item.phone, item.email].join(' ').toLowerCase().includes(query))
      .slice(0, 6);
  }, [customers, nameFocused, selectedCustomer, standaloneCustomerName]);

  const linkSearchResults = useMemo<CaseLinkSearchResult[]>(() => {
    const query = linkSearchQuery.trim().toLowerCase();
    if (!query) return [];

    const orderResults = orders
      .filter((item) => {
        const searchable = [
          item.orderNumber,
          item.customerTrackingCode,
          item.websiteOrderReference,
          item.customerName,
          item.customerEmail,
          item.customerPhone,
          formatOrderItems(item),
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 6)
      .map((item): CaseLinkSearchResult => ({ kind: 'order', order: item }));

    const linkedCustomerIds = new Set(
      orderResults
        .map((item) => item.kind === 'order' ? item.order.customerId : undefined)
        .filter(Boolean)
    );
    const customerResults = customers
      .filter((item) => {
        if (linkedCustomerIds.has(item.id)) return false;
        const searchable = [
          item.fullName,
          item.email,
          item.phone,
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 4)
      .map((item): CaseLinkSearchResult => ({ kind: 'customer', customer: item }));

    return [...orderResults, ...customerResults].slice(0, 8);
  }, [customers, linkSearchQuery, orders]);

  const selectOrderForCase = (item: Order) => {
    const linkedCustomer = item.customerId
      ? customers.find((customer) => customer.id === item.customerId) ?? null
      : customers.find((customer) =>
          customer.email.trim().toLowerCase() === item.customerEmail.trim().toLowerCase()
          || customer.phone.trim() === item.customerPhone.trim()
        ) ?? null;
    setSelectedOrder(item);
    setSelectedCustomer(linkedCustomer);
    setStandaloneCustomerName(item.customerName);
    setLinkSearchQuery('');
    Haptics.selectionAsync();
  };

  const selectCustomerForCase = (item: Customer) => {
    setSelectedOrder(null);
    setSelectedCustomer(item);
    setStandaloneCustomerName(item.fullName);
    setLinkSearchQuery('');
    Haptics.selectionAsync();
  };

  const clearCaseLink = () => {
    setSelectedOrder(null);
    setSelectedCustomer(null);
    setLinkSearchQuery('');
    Haptics.selectionAsync();
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2400);
  };

  const handleAddAttachment = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow photo access to attach proof images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const nextAttachments = await Promise.all(
        result.assets.map(async (asset, index) => {
          const manipulated = await ImageManipulator.manipulateAsync(
            asset.uri,
            [],
            {
              compress: 0.6,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: true,
            }
          );

          const newAttachment: CaseAttachment = {
            id: Math.random().toString(36).slice(2),
            label: asset.fileName || `Image ${attachments.length + index + 1}`,
            uri: manipulated.uri,
            preview: manipulated.base64 ? `data:image/jpeg;base64,${manipulated.base64}` : undefined,
            uploadedAt: new Date().toISOString(),
          };

          return newAttachment;
        })
      );

      setAttachments((prev) => [...prev, ...nextAttachments]);
    } catch (error) {
      console.warn('Case attachment failed:', error);
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleSave = () => {
    setFormError(null);
    if (!issueSummary.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFormError('Add a short issue summary before saving.');
      showToast('Add a short issue summary before saving.');
      return;
    }

    // For standalone cases, require customer name
    const resolvedCustomerName = standaloneCustomerName.trim() || customerName;
    if (!resolvedCustomerName) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFormError('Add the customer name before saving.');
      showToast('Add the customer name before saving.');
      return;
    }
    if (showResolution) {
      if (!resolutionNotes.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Add resolution details before saving.');
        showToast('Add resolution details before closing the case.');
        return;
      }
      if ((resolutionType === 'Refund Issued' || resolutionType === 'Credit Applied') && !resolutionValue.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Enter a resolution value for refunds or credits.');
        showToast('Enter a resolution value to close the case.');
        return;
      }
    }
    if (showReturnDetails) {
      if (!returnReason) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Choose the return reason before creating the return.');
        showToast('Choose the return reason.');
        return;
      }
      if (returnReason === 'other' && !returnOtherReason.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Write the return reason before creating the return.');
        showToast('Write the return reason.');
        return;
      }
      if (!returnResolution) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Choose refund or exchange before creating the return.');
        showToast('Choose refund or exchange.');
        return;
      }
      if (!returnShippingPayer) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFormError('Choose who pays return shipping before creating the return.');
        showToast('Choose who pays shipping.');
        return;
      }
    }

    const now = new Date().toISOString();
    let resolution: CaseResolution | undefined;

    // Save resolution if user has entered resolution details (regardless of status)
    if (showResolution) {
      resolution = {
        type: resolutionType,
        notes: resolutionNotes,
        value: resolutionValue ? parseFloat(resolutionValue) : undefined,
        resolvedAt: existingCase?.resolution?.resolvedAt || now,
        resolvedBy: createdBy,
      };
    } else if (existingCase?.resolution) {
      // Preserve existing resolution if not editing it
      resolution = existingCase.resolution;
    }

    // Create initial timeline entry for new cases
    let timeline: CaseTimelineEntry[] | undefined = existingCase?.timeline;
    if (!isEditing) {
      const initialEntry: CaseTimelineEntry = {
        id: Math.random().toString(36).slice(2),
        date: now,
        action: 'Case Created',
        user: createdBy || 'System',
      };
      timeline = [initialEntry];
    }

    const caseData: Case = {
      id: existingCase?.id || generateCaseId(),
      caseNumber: existingCase?.caseNumber || generateCaseNumber(),
      orderId: selectedOrder?.id || orderId || existingCase?.orderId,
      orderNumber: selectedOrder?.orderNumber || orderNumber || existingCase?.orderNumber,
      customerId: selectedOrder?.customerId || selectedCustomer?.id || customerId,
      customerName: resolvedCustomerName,
      type: caseType,
      status,
      priority,
      source,
      issueSummary: issueSummary.trim(),
      originalCustomerMessage: originalMessage.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      timeline,
      resolution,
      createdAt: existingCase?.createdAt || now,
      updatedAt: now,
      createdBy: existingCase?.createdBy || createdBy,
      updatedBy: createdBy,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(caseData, showReturnDetails && returnReason && returnResolution && returnShippingPayer ? {
      reason: returnReason,
      otherReason: returnReason === 'other' ? returnOtherReason.trim() : undefined,
      resolution: returnResolution,
      shippingPayer: returnShippingPayer,
    } : undefined);
    showToast(isEditing ? 'Case updated.' : 'Case created.');
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => onClose(), 700);
  };

  const handleOpenAICase = () => {
    Haptics.selectionAsync();
    setShowAiSheet(true);
  };

  const renderDropdown = (
    items: string[],
    selected: string,
    onSelect: (item: string) => void,
    show: boolean,
    setShow: (show: boolean) => void,
    colorMap?: Record<string, string>,
    renderIcon?: (item: string, isSelected: boolean) => React.ReactNode,
  ) => (
    <View style={{ position: 'relative', zIndex: show ? 50 : 1, overflow: 'visible' }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
      setShow(!show);
    }}
    className="flex-row items-center justify-between px-4"
    style={{
      height: 46,
      borderRadius: 12,
      backgroundColor: formBg,
      borderWidth: 1,
      borderColor: show ? focusBorder : formBorder,
    }}
  >
        <View className="flex-row items-center gap-2">
          {renderIcon ? renderIcon(selected, true) : null}
          {colorMap && (
            <View
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorMap[selected] || colors.text.muted }}
            />
          )}
          <Text style={{ color: colors.text.primary, fontSize: 14.5, fontWeight: '600' }}>
            {selected}
          </Text>
        </View>
        <ChevronDown size={20} color={colors.text.muted} strokeWidth={1.5} />
      </Pressable>

      {show && (
        <View
          className="rounded-xl overflow-hidden absolute left-0 right-0 top-[58px]"
          style={{
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.outline,
            zIndex: 1000,
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 30,
          }}
        >
          {items.map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(item);
                setShow(false);
              }}
              className="flex-row items-center justify-between py-3 px-4"
              style={{
                backgroundColor: item === selected
                  ? palette.softFill
                  : 'transparent',
              }}
            >
              <View className="flex-row items-center gap-2">
                {renderIcon ? renderIcon(item, item === selected) : null}
                {colorMap && (
                  <View
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colorMap[item] || colors.text.muted }}
                  />
                )}
                <Text style={{ color: colors.text.primary }}>{item}</Text>
              </View>
              {item === selected && (
                <Check size={18} color={palette.limeOnSurface} strokeWidth={2} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // On desktop web the form fills the content area next to the left nav instead of covering the whole
  // screen. Everywhere else it is a full-screen modal with no slide animation.
  const inline = isWeb && isDesktop;
  const wrapShell = (children: React.ReactNode) => {
    if (inline) {
      if (!visible || showAiSheet) return null;
      return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: palette.page }}>
          {children}
        </View>
      );
    }
    return (
      <Modal
        visible={visible && !showAiSheet}
        transparent={false}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        {children}
      </Modal>
    );
  };

  return (
    <>
    {wrapShell(
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: palette.page }}
      >
        <View style={{ flex: 1, backgroundColor: palette.page }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: inline ? 28 : 20, paddingTop: inline ? 28 : 14, paddingBottom: 14, backgroundColor: palette.page }}>
            <BackButton onPress={() => { Haptics.selectionAsync(); onClose(); }} palette={palette} label="Close" />
            <Text style={{ color: palette.text, fontSize: inline ? 28 : 22, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -0.8 }}>
              {isEditing ? 'Edit case' : 'New case'}
            </Text>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: inline ? 28 : isMobile ? 16 : 24,
              paddingTop: 20,
              paddingBottom: 32,
              ...(inline ? { width: '100%' as const, maxWidth: 1456, alignSelf: 'flex-start' as const } : null),
            }}
          >
            {toastMessage && (
              <View
                className="mb-4 rounded-full px-4 py-2"
                style={{
                  backgroundColor: isDark ? '#EF4444' : '#111111',
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ color: isDark ? '#111111' : '#FFFFFF' }} className="text-xs font-semibold">
                  {toastMessage}
                </Text>
              </View>
            )}
            {formError && (
              <View
                className="mb-4 rounded-xl px-4 py-3"
                style={{
                  backgroundColor: isDark ? '#3B1D1D' : '#FEE2E2',
                  borderWidth: 1,
                  borderColor: isDark ? '#7F1D1D' : '#FCA5A5',
                }}
              >
                <Text style={{ color: isDark ? '#FCA5A5' : '#991B1B' }} className="text-sm font-semibold">
                  {formError}
                </Text>
              </View>
            )}
            {(() => {
              let step = 3;
              const returnStep = showReturnDetails ? step++ : 0;
              const resolutionStep = showResolution ? step++ : 0;
              const detailsStep = step;
              const customerCard = (
                <CaseStepCard n={1} title="Customer" compact={isMobile} palette={palette} titleFontLoaded={bricolageLoaded} raised={Boolean(linkSearchQuery.trim()) || nameSuggestions.length > 0}>
            {/* Order Info + Customer Name */}
            {orderId && orderNumber && (
              <View className="mb-3.5">
                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                  Linked Order
                </Text>
                <View
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: formBg, borderWidth: 1, borderColor: formBorder }}
                >
                  <Text style={{ color: colors.text.primary }} className="font-semibold">
                    {orderNumber}
                  </Text>
                </View>
              </View>
            )}
            {canSearchCaseLink && (
              <View className="mb-3.5" style={{ position: 'relative', zIndex: 260, overflow: 'visible' }}>
                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                  Link Customer or Order
                </Text>
                {selectedLinkLabel ? (
                  <View
                    className="rounded-xl p-4"
                    style={{ backgroundColor: formBg, borderWidth: 1, borderColor: formBorder }}
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Link2 size={16} color={palette.limeOnSurface} strokeWidth={2} />
                          <Text style={{ color: colors.text.primary }} className="font-semibold" numberOfLines={1}>
                            {selectedLinkLabel}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1" numberOfLines={1}>
                          {selectedOrder
                            ? `${selectedOrder.customerEmail || selectedOrder.customerPhone || 'Order linked'}`
                            : selectedCustomer?.email || selectedCustomer?.phone || 'Customer linked'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={clearCaseLink}
                        className="px-3 py-2 rounded-full active:opacity-80"
                        style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: formBorder }}
                      >
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">
                          Clear
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View
                      className="rounded-xl px-4 flex-row items-center"
                      style={{
                        height: 46,
                        backgroundColor: formBg,
                        borderWidth: 1,
                        borderColor: formBorder,
                      }}
                    >
                      <Search size={17} color={colors.text.muted} strokeWidth={2} />
                      <FieldInput
                        value={linkSearchQuery}
                        onChangeText={setLinkSearchQuery}
                        placeholder="Search order number, customer, phone, email..."
                        placeholderTextColor={colors.text.muted}
                        className="flex-1 ml-2"
                        style={{ color: colors.text.primary, outlineStyle: 'none' as any }}
                      />
                      <SearchClearButton visible={Boolean(linkSearchQuery.trim())} onPress={() => setLinkSearchQuery('')} />
                    </View>
                    {linkSearchQuery.trim() ? (
                      <View
                        className="rounded-xl overflow-hidden mt-2"
                        style={{ backgroundColor: formBg, borderWidth: 1, borderColor: formBorder }}
                      >
                        {linkSearchResults.length > 0 ? (
                          linkSearchResults.map((result) => {
                            const key = result.kind === 'order' ? `order-${result.order.id}` : `customer-${result.customer.id}`;
                            const title = result.kind === 'order'
                              ? `${result.order.orderNumber} · ${result.order.customerName}`
                              : result.customer.fullName;
                            const subtitle = result.kind === 'order'
                              ? [result.order.customerEmail, result.order.customerPhone, formatOrderItems(result.order)].filter(Boolean).join(' · ')
                              : [result.customer.email, result.customer.phone].filter(Boolean).join(' · ');
                            return (
                              <Pressable
                                key={key}
                                onPress={() => result.kind === 'order' ? selectOrderForCase(result.order) : selectCustomerForCase(result.customer)}
                                className="px-4 py-3 active:opacity-80"
                                style={{ borderTopWidth: key === (linkSearchResults[0].kind === 'order' ? `order-${linkSearchResults[0].order.id}` : `customer-${linkSearchResults[0].customer.id}`) ? 0 : 1, borderTopColor: formBorder }}
                              >
                                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                                  {title}
                                </Text>
                                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1" numberOfLines={1}>
                                  {subtitle || (result.kind === 'order' ? 'Order' : 'Customer')}
                                </Text>
                              </Pressable>
                            );
                          })
                        ) : (
                          <View className="px-4 py-3">
                            <Text style={{ color: colors.text.tertiary }} className="text-sm">
                              No matching customer or order found.
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )}
            <View className="mb-3.5" style={{ position: 'relative', zIndex: nameSuggestions.length > 0 ? 270 : 1, overflow: 'visible' }}>
              <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                Customer Name <Text style={{ color: palette.danger }}>*</Text>
              </Text>
              <FieldInput
                value={standaloneCustomerName}
                onChangeText={(text) => {
                  setStandaloneCustomerName(text);
                  if (selectedCustomer && selectedCustomer.fullName !== text) setSelectedCustomer(null);
                }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setTimeout(() => setNameFocused(false), 150)}
                placeholder="Search or enter customer name..."
                placeholderTextColor={colors.text.muted}
                className="py-3 px-4"
                style={{
                  borderRadius: 12,
                  backgroundColor: formBg,
                  color: colors.text.primary,
                  borderWidth: 1,
                  borderColor: formBorder,
                  height: 46,
                }}
              />
              {nameSuggestions.length > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 78,
                    zIndex: 1000,
                    borderRadius: 14,
                    overflow: 'hidden',
                    backgroundColor: palette.card,
                    borderWidth: 1,
                    borderColor: palette.outline,
                    shadowColor: '#000000',
                    shadowOpacity: 0.18,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 30,
                  }}
                >
                  {nameSuggestions.map((item, index) => (
                    <Pressable
                      key={item.id}
                      onPress={() => selectCustomerForCase(item)}
                      style={(state) => ({
                        paddingHorizontal: 16,
                        paddingVertical: 11,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: palette.hairline,
                        backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent',
                      })}
                    >
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.fullName}</Text>
                      {item.phone || item.email ? (
                        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {[item.phone, item.email].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>


                </CaseStepCard>
              );
              const issueCard = (
                <CaseStepCard n={2} title="Issue" compact={isMobile} palette={palette} titleFontLoaded={bricolageLoaded}>
          {/* Issue Summary */}
          <View className="mb-3.5">
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Issue Summary <Text style={{ color: palette.danger }}>*</Text>
            </Text>
            <FieldInput
              value={issueSummary}
              onChangeText={setIssueSummary}
              placeholder="Brief description of the issue..."
              placeholderTextColor={colors.text.muted}
              className="py-3 px-4"
              style={{
                borderRadius: 12,
                backgroundColor: formBg,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: formBorder,
              }}
            />
          </View>

          {/* Original Customer Message */}
          <View className="mb-3.5">
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Original Customer Message
            </Text>
            <FieldInput
              value={originalMessage}
              onChangeText={setOriginalMessage}
              placeholder="Paste the customer's original complaint or message..."
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              className="py-3 px-4"
              style={{
                borderRadius: 12,
                backgroundColor: formBg,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: formBorder,
                minHeight: 100,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {/* Proof Attachments */}
          <View className="mb-3.5">
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Proof Images
            </Text>
            <Pressable
              onPress={handleAddAttachment}
              className="rounded-2xl items-center justify-center active:opacity-80"
              style={{
                height: 150,
                borderWidth: 1,
                borderColor: formBorder,
                borderStyle: 'dashed',
                backgroundColor: formBg,
              }}
            >
              <ImageIcon size={22} color={colors.text.muted} strokeWidth={1.6} />
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-3">
                Upload proof images
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                PNG or JPEG · multiple files allowed
              </Text>
            </Pressable>
            {attachments.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 4 }}
              >
                {attachments.map((attachment) => (
                  <View key={attachment.id} className="mr-3" style={{ position: 'relative' }}>
                    <View className="rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: formBorder }}>
                      <Image
                        source={{ uri: attachment.preview ?? attachment.uri }}
                        style={{ width: 96, height: 96 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => handleRemoveAttachment(attachment.id)}
                        className="w-8 h-8 rounded-full items-center justify-center absolute top-2 right-2"
                        style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
                      >
                        <X size={14} color="#fff" strokeWidth={2} />
                      </Pressable>
                    </View>
                    <Text style={{ color: colors.text.secondary }} className="text-[11px] mt-2 text-center">
                      {attachment.label}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>


                </CaseStepCard>
              );
              const returnCard = showReturnDetails ? (
                <CaseStepCard n={returnStep} title="Return details" compact={isMobile} palette={palette} titleFontLoaded={bricolageLoaded} raised={showReturnReasonDropdown || showReturnResolutionDropdown || showReturnShippingDropdown}>
            {showReturnDetails ? (
              <View style={{ position: 'relative', zIndex: showReturnReasonDropdown || showReturnResolutionDropdown || showReturnShippingDropdown ? 210 : 2, overflow: 'visible' }}>
                <Text style={{ color: palette.muted, fontSize: 12, marginBottom: 14 }}>Choose these manually for business-created returns.</Text>

                <View className="mb-3.5" style={{ position: 'relative', zIndex: showReturnReasonDropdown ? 90 : 3 }}>
                  <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                    Return Reason
                  </Text>
                  {renderDropdown(
                    RETURN_REASONS.map((item) => item.label),
                    selectedReturnReasonLabel,
                    (label) => {
                      const reason = RETURN_REASONS.find((item) => item.label === label);
                      if (reason) setReturnReason(reason.value);
                    },
                    showReturnReasonDropdown,
                    setShowReturnReasonDropdown,
                  )}
                  {returnReason === 'other' ? (
                    <FieldInput
                      value={returnOtherReason}
                      onChangeText={setReturnOtherReason}
                      placeholder="Write the return reason..."
                      placeholderTextColor={colors.text.muted}
                      className="py-3 px-4 mt-3"
                      style={{
                        borderRadius: 12,
                        backgroundColor: formBg,
                        color: colors.text.primary,
                        borderWidth: 1,
                        borderColor: formBorder,
                        outlineStyle: 'none' as any,
                      }}
                    />
                  ) : null}
                </View>

                <View className="mb-3.5" style={{ position: 'relative', zIndex: showReturnResolutionDropdown ? 80 : 2 }}>
                  <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                    Refund or Exchange
                  </Text>
                  {renderDropdown(
                    RETURN_RESOLUTIONS.map((item) => item.label),
                    selectedReturnResolutionLabel,
                    (label) => {
                      const resolution = RETURN_RESOLUTIONS.find((item) => item.label === label);
                      if (resolution) setReturnResolution(resolution.value);
                    },
                    showReturnResolutionDropdown,
                    setShowReturnResolutionDropdown,
                  )}
                </View>

                <View style={{ position: 'relative', zIndex: showReturnShippingDropdown ? 70 : 1 }}>
                  <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                    Return Shipping
                  </Text>
                  {renderDropdown(
                    returnShippingOptions.map((item) => item.label),
                    selectedReturnShippingLabel,
                    (label) => {
                      const payer = returnShippingOptions.find((item) => item.label === label);
                      if (payer) setReturnShippingPayer(payer.value);
                    },
                    showReturnShippingDropdown,
                    setShowReturnShippingDropdown,
                  )}
                </View>
              </View>
            ) : null}


                </CaseStepCard>
              ) : null;
              const resolutionCard = showResolution ? (
                <CaseStepCard n={resolutionStep} title="Resolution details" compact={isMobile} palette={palette} titleFontLoaded={bricolageLoaded} raised={showResolutionTypeDropdown}>
          {/* Resolution Section */}
          {showResolution && (
            <View style={{ position: 'relative', zIndex: showResolutionTypeDropdown ? 250 : 1, overflow: 'visible' }}>

              {/* Resolution Type */}
              <View className="mb-3.5" style={{ position: 'relative', zIndex: 260 }}>
                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                  Resolution Type
                </Text>
                {renderDropdown(
                  resolutionTypeOptions,
                  resolutionType,
                  setResolutionType,
                  showResolutionTypeDropdown,
                  setShowResolutionTypeDropdown,
                )}
              </View>

              {/* Resolution Value (for refunds/credits) */}
              {(resolutionType === 'Refund Issued' || resolutionType === 'Credit Applied') && (
                <View className="mb-3.5" style={{ position: 'relative', zIndex: 1 }}>
                  <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                    Resolution Value
                  </Text>
                  <FieldInput
                    value={resolutionValue}
                    onChangeText={setResolutionValue}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="numeric"
                    className="py-3 px-4"
                    style={{
                      borderRadius: 12,
                      backgroundColor: formBg,
                      color: colors.text.primary,
                      borderWidth: 1,
                      borderColor: formBorder,
                    }}
                  />
                </View>
              )}

              {/* Resolution Notes */}
              <View style={{ position: 'relative', zIndex: 1 }}>
                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
                  Resolution Notes
                </Text>
                <FieldInput
                  value={resolutionNotes}
                  onChangeText={setResolutionNotes}
                  placeholder="How was this case resolved..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                  numberOfLines={3}
                  className="py-3 px-4"
                  style={{
                    borderRadius: 12,
                    backgroundColor: formBg,
                    color: colors.text.primary,
                    borderWidth: 1,
                    borderColor: formBorder,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            </View>
          )}


                </CaseStepCard>
              ) : null;
              const detailsCard = (
                <CaseStepCard n={detailsStep} title="Case details" compact={isMobile} palette={palette} titleFontLoaded={bricolageLoaded} raised={showSourceDropdown || showStatusDropdown || showCaseTypeDropdown}>
          {/* Priority Selection */}
          <View className="mb-3.5" style={{ position: 'relative', zIndex: 1 }}>
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Priority
            </Text>
            <View
              style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: palette.page, borderWidth: 1, borderColor: palette.hairline }}
            >
              {CASE_PRIORITIES.map((p) => {
                const isSelected = priority === p;
                const priorityColor = p === 'Low' ? palette.muted : CASE_PRIORITY_COLORS[p];
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPriority(p);
                    }}
                    style={{ flex: 1, height: 38, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: isSelected ? (p === 'Low' ? palette.softFill : `${priorityColor}2E`) : 'transparent' }}
                  >
                    {isSelected ? <Flag size={13} color={priorityColor} strokeWidth={2.4} /> : null}
                    <Text style={{ color: isSelected ? priorityColor : palette.muted, fontSize: 13, fontWeight: '600' }}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Case Type */}
          <View className="mb-3.5" style={{ position: 'relative', zIndex: showCaseTypeDropdown ? 240 : 1, overflow: 'visible' }}>
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Case Type
            </Text>
            {renderDropdown(
              caseTypeOptions,
              caseType,
              (item) => setCaseType(item as CaseType),
              showCaseTypeDropdown,
              setShowCaseTypeDropdown,
              undefined,
              (item, isSelected) => getCaseTypeIcon(item as CaseType, isSelected ? colors.text.primary : colors.text.muted, 16),
            )}
          </View>

          {/* Status */}
          <View className="mb-3.5" style={{ position: 'relative', zIndex: showStatusDropdown ? 230 : 1, overflow: 'visible' }}>
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Status
            </Text>
            {renderDropdown(
              statusOptions,
              status,
              setStatus,
              showStatusDropdown,
              setShowStatusDropdown,
              statusColorMap,
            )}
            {selectedStatusOption?.description ? (
              <Text style={{ color: colors.text.tertiary, marginTop: 4, fontSize: 12 }}>
                {selectedStatusOption.description}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                router.push('/settings?section=case-statuses');
              }}
              className="mt-2"
            >
              <Text style={{ color: palette.limeOnSurface }} className="text-xs font-semibold">
                Customize case statuses in Settings
              </Text>
            </Pressable>
          </View>

          {/* Source Channel */}
          <View className="mb-3.5" style={{ position: 'relative', zIndex: showSourceDropdown ? 220 : 1, overflow: 'visible' }}>
            <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 7 }}>
              Source Channel
            </Text>
            {renderDropdown(
              sourceOptions,
              source,
              (item) => setSource(item as CaseSource),
              showSourceDropdown,
              setShowSourceDropdown,
              undefined,
              (item, isSelected) => getCaseSourceIcon(item as CaseSource, isSelected ? colors.text.primary : colors.text.muted, 16),
            )}
          </View>

                </CaseStepCard>
              );
              const aiCard = !isEditing ? (
                <View style={{ borderRadius: 20, borderWidth: 1, borderColor: 'rgba(168,120,255,0.22)', overflow: 'hidden' }}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(168,120,255,0.12)', palette.card, palette.card]}
                    locations={[0, 0.6, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View style={{ padding: 18, gap: 12 }}>
                    <View style={{ gap: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={18} color="#B78BFF" strokeWidth={1.8} />
                        <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>Draft with Fyll AI</Text>
                      </View>
                      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>
                        Upload screenshots of the issue and Fyll AI writes the case for you.
                      </Text>
                    </View>
                    <FyllAiButton label="Fyll AI Case" onPress={handleOpenAICase} height={48} borderRadius={999} iconSize={16} textSize={14.5} />
                  </View>
                </View>
              ) : null;
              const createButton = (
                <Pressable
                  onPress={handleSave}
                  style={({ pressed }) => ({ height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
                >
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '600' }}>
                    {isEditing ? 'Update case' : 'Create case'}
                  </Text>
                </Pressable>
              );
              if (!isWide) {
                return (
                  <View style={{ gap: 14 }}>
                    {customerCard}
                    {issueCard}
                    {returnCard}
                    {resolutionCard}
                    {aiCard}
                    {detailsCard}
                    {createButton}
                  </View>
                );
              }
              return (
                <View style={{ flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'flex-start' : 'stretch', gap: 16 }}>
                  <View style={{ flex: isWide ? 1.5 : undefined, gap: 16, zIndex: 2 }}>
                    {customerCard}
                    {issueCard}
                    {returnCard}
                    {resolutionCard}
                  </View>
                  <View style={{ flex: isWide ? 1 : undefined, minWidth: isWide ? 340 : undefined, gap: 16, zIndex: 1 }}>
                    {aiCard}
                    {detailsCard}
                    {createButton}
                  </View>
                </View>
              );
            })()}
          </ScrollView>

        </View>
      </KeyboardAvoidingView>
    )}
    <CaseAiSheet
      visible={visible && showAiSheet}
      onClose={() => setShowAiSheet(false)}
      onCreated={() => { setShowAiSheet(false); onClose(); }}
      prefill={{ customerName: standaloneCustomerName.trim() || customerName || '', orderNumber: orderNumber ?? '', orderId }}
    />
    </>
  );
}

export default CaseForm;
