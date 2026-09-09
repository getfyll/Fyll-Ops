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
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, ChevronDown, Check,
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
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { FyllAiButton } from '@/components/FyllAiButton';
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
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const isEditing = !!existingCase;
  const isWeb = Platform.OS === 'web';
  const isDark = colors.bg.primary === '#111111';
  const useDesktopCanvas = isWeb && !isDark;
  const canvasBg = useDesktopCanvas ? '#F3F3F5' : colors.bg.primary;
  const panelBg = useDesktopCanvas ? '#FFFFFF' : colors.bg.primary;
  const formBg = isWeb ? (isDark ? colors.bg.secondary : (useDesktopCanvas ? '#F8F8FA' : '#FFFFFF')) : colors.bg.secondary;
  const formBorder = isWeb ? (isDark ? colors.border.light : '#E5E7EB') : colors.border.light;

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
    const linkedCustomer = standaloneCustomerName.trim() || customerName || '';
    onClose();
    setTimeout(() => {
      router.push({
        pathname: '/ai-case',
        params: {
          orderId: orderId ?? '',
          orderNumber: orderNumber ?? '',
          customerName: linkedCustomer,
        },
      });
    }, 0);
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
    className="flex-row items-center justify-between py-3 px-4 rounded-xl"
    style={{
      backgroundColor: formBg,
      borderWidth: 1,
      borderColor: show ? colors.accent.primary : formBorder,
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
          <Text style={{ color: colors.text.primary }} className="font-medium">
            {selected}
          </Text>
        </View>
        <ChevronDown size={20} color={colors.text.muted} strokeWidth={1.5} />
      </Pressable>

      {show && (
        <View
          className="rounded-xl overflow-hidden absolute left-0 right-0 top-[58px]"
          style={{
            backgroundColor: formBg,
            borderWidth: 1,
            borderColor: formBorder,
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
                  ? (isWeb ? (isDark ? colors.bg.card : '#F9FAFB') : colors.bg.secondary)
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
                <Check size={18} color={colors.accent.primary} strokeWidth={2} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        style={{ backgroundColor: canvasBg }}
      >
        <View
          style={[
            { flex: 1, backgroundColor: panelBg },
            useDesktopCanvas
              ? {
                  width: '100%',
                  maxWidth: 980,
                  alignSelf: 'center',
                  borderWidth: 1,
                  borderColor: '#E6E6E6',
                  borderRadius: 18,
                  overflow: 'visible',
                  marginTop: 0,
                  marginBottom: 12,
                }
              : null,
          ]}
        >
        <View
          className="flex-1"
          style={{
            backgroundColor: panelBg,
          }}
        >
          {/* Header */}
          <View
            className="flex-row items-center justify-between px-5 py-4"
            style={{
              backgroundColor: colors.bg.card,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
            }}
          >
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onClose();
                }}
                className="p-2 -ml-2 active:opacity-70"
              >
                <X size={24} color={colors.text.primary} strokeWidth={1.5} />
              </Pressable>
              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                {isEditing ? 'Edit Case' : 'New Case'}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            className="flex-1"
            style={{ backgroundColor: panelBg }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 24,
              width: '100%',
              maxWidth: 1040,
              alignSelf: 'center',
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
            {/* AI Case Shortcut */}
            {!isEditing && (
              <View
                className="mb-4"
              >
                <FyllAiButton
                  label="Fyll AI Case"
                  onPress={handleOpenAICase}
                  height={52}
                  borderRadius={999}
                  iconSize={18}
                  textSize={16}
                />
              </View>
            )}

            {/* Order Info + Customer Name */}
            {orderId && orderNumber && (
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
              <View className="mb-4" style={{ position: 'relative', zIndex: 260, overflow: 'visible' }}>
                <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
                          <Link2 size={16} color={colors.accent.primary} strokeWidth={2} />
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
                        height: 52,
                        backgroundColor: formBg,
                        borderWidth: 1,
                        borderColor: formBorder,
                      }}
                    >
                      <Search size={17} color={colors.text.muted} strokeWidth={2} />
                      <TextInput
                        value={linkSearchQuery}
                        onChangeText={setLinkSearchQuery}
                        placeholder="Search order number, customer, phone, email..."
                        placeholderTextColor={colors.text.muted}
                        className="flex-1 ml-2"
                        style={{ color: colors.text.primary, outlineStyle: 'none' as any }}
                      />
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
            <View className="mb-6">
              <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
                Customer Name *
              </Text>
              <TextInput
                value={standaloneCustomerName}
                onChangeText={setStandaloneCustomerName}
                placeholder="Enter customer name..."
                placeholderTextColor={colors.text.muted}
                className="py-3 px-4 rounded-xl"
                style={{
                  backgroundColor: formBg,
                  color: colors.text.primary,
                  borderWidth: 1,
                  borderColor: formBorder,
                  height: 52,
                }}
              />
            </View>

          {/* Priority Selection */}
          <View className="mb-5" style={{ position: 'relative', zIndex: 1 }}>
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-3">
              Priority
            </Text>
            <View
              className="flex-row p-1.5 rounded-xl"
              style={{ backgroundColor: formBg, borderWidth: 1, borderColor: formBorder }}
            >
              {CASE_PRIORITIES.map((p) => {
                const isSelected = priority === p;
                const priorityColor = CASE_PRIORITY_COLORS[p];
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPriority(p);
                    }}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-full active:opacity-80"
                    style={{
                      backgroundColor: isSelected ? priorityColor : 'transparent',
                      borderWidth: 0,
                      borderColor: 'transparent',
                    }}
                  >
                    {isSelected && <Flag size={12} color="#FFFFFF" strokeWidth={2} />}
                    <Text
                      style={{ color: isSelected ? '#FFFFFF' : colors.text.muted }}
                      className="text-[10px] font-bold uppercase tracking-tighter"
                    >
                      {p}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Source Channel */}
          <View className="mb-5" style={{ position: 'relative', zIndex: showSourceDropdown ? 240 : 1, overflow: 'visible' }}>
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-3">
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

          {/* Status */}
          <View className="mb-5" style={{ position: 'relative', zIndex: showStatusDropdown ? 230 : 1, overflow: 'visible' }}>
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
              <Text style={{ color: colors.accent.primary }} className="text-xs font-semibold">
                Customize case statuses in Settings
              </Text>
            </Pressable>
          </View>

          {/* Case Type */}
          <View className="mb-5" style={{ position: 'relative', zIndex: showCaseTypeDropdown ? 220 : 1, overflow: 'visible' }}>
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-3">
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

            {showReturnDetails ? (
              <View
                className="mb-5 rounded-2xl p-4"
                style={{
                  backgroundColor: formBg,
                  borderWidth: 1,
                  borderColor: formBorder,
                  position: 'relative',
                  zIndex: showReturnReasonDropdown || showReturnResolutionDropdown || showReturnShippingDropdown ? 210 : 2,
                  overflow: 'visible',
                }}
              >
                <View className="mb-4">
                  <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                    Return details
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Choose these manually for business-created returns.
                  </Text>
                </View>

                <View className="mb-4" style={{ position: 'relative', zIndex: showReturnReasonDropdown ? 90 : 3 }}>
                  <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
                    <TextInput
                      value={returnOtherReason}
                      onChangeText={setReturnOtherReason}
                      placeholder="Write the return reason..."
                      placeholderTextColor={colors.text.muted}
                      className="py-3 px-4 rounded-xl mt-3"
                      style={{
                        backgroundColor: colors.bg.primary,
                        color: colors.text.primary,
                        borderWidth: 1,
                        borderColor: formBorder,
                        outlineStyle: 'none' as any,
                      }}
                    />
                  ) : null}
                </View>

                <View className="mb-4" style={{ position: 'relative', zIndex: showReturnResolutionDropdown ? 80 : 2 }}>
                  <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
                  <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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

          {/* Issue Summary */}
          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
              Issue Summary *
            </Text>
            <TextInput
              value={issueSummary}
              onChangeText={setIssueSummary}
              placeholder="Brief description of the issue..."
              placeholderTextColor={colors.text.muted}
              className="py-3 px-4 rounded-xl"
              style={{
                backgroundColor: formBg,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: formBorder,
              }}
            />
          </View>

          {/* Original Customer Message */}
          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
              Original Customer Message
            </Text>
            <TextInput
              value={originalMessage}
              onChangeText={setOriginalMessage}
              placeholder="Paste the customer's original complaint or message..."
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              className="py-3 px-4 rounded-xl"
              style={{
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
          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
              Proof Images
            </Text>
            <Pressable
              onPress={handleAddAttachment}
              className="rounded-2xl items-center justify-center active:opacity-80"
              style={{
                height: 130,
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

          {/* Resolution Section */}
          {showResolution && (
            <View
              className="p-4 rounded-xl mb-4"
              style={{
                backgroundColor: formBg,
                borderWidth: 1,
                borderColor: formBorder,
                position: 'relative',
                zIndex: showResolutionTypeDropdown ? 250 : 1,
                overflow: 'visible',
              }}
            >
              <Text style={{ color: colors.text.primary }} className="font-semibold mb-4">
                Resolution Details
              </Text>

              {/* Resolution Type */}
              <View className="mb-4" style={{ position: 'relative', zIndex: 260 }}>
                <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
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
                <View className="mb-4" style={{ position: 'relative', zIndex: 1 }}>
                  <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
                    Resolution Value
                  </Text>
                  <TextInput
                    value={resolutionValue}
                    onChangeText={setResolutionValue}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="numeric"
                    className="py-3 px-4 rounded-xl"
                    style={{
                      backgroundColor: colors.bg.primary,
                      color: colors.text.primary,
                      borderWidth: 1,
                      borderColor: formBorder,
                    }}
                  />
                </View>
              )}

              {/* Resolution Notes */}
              <View style={{ position: 'relative', zIndex: 1 }}>
                <Text style={{ color: colors.text.secondary }} className="text-xs uppercase font-semibold mb-2">
                  Resolution Notes
                </Text>
                <TextInput
                  value={resolutionNotes}
                  onChangeText={setResolutionNotes}
                  placeholder="How was this case resolved..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                  numberOfLines={3}
                  className="py-3 px-4 rounded-xl"
                  style={{
                    backgroundColor: colors.bg.primary,
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

          <Pressable
            onPress={handleSave}
            className="h-14 rounded-full items-center justify-center active:opacity-80 mt-2"
            style={{ backgroundColor: isDark ? '#FFFFFF' : '#111111' }}
          >
            <Text style={{ color: isDark ? '#111111' : '#FFFFFF' }} className="font-semibold text-base">
              {isEditing ? 'Update Case' : 'Create Case'}
            </Text>
          </Pressable>

          {/* Spacer for keyboard */}
          <View className="h-8" />
          </ScrollView>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default CaseForm;
