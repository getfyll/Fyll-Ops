import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, Alert, Switch, Platform, Modal, Dimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Trash2, Edit2, Check, X, ChevronRight, ChevronUp, ChevronDown, ArrowLeft, Package, ShoppingCart, Tag, RotateCcw, Info, CreditCard, Truck, Wrench, Users, Moon, Sun, Laptop, LogOut, Shield, Building2, AlertTriangle, UserCircle, Upload, FileText, BarChart3, TrendingUp, Zap, Search, Sparkles, ListTodo, Bell, BellOff, Boxes, Clock3, Plus, MoreVertical, Megaphone, Printer, Copy, Link2, Landmark, Store, Mail } from 'lucide-react-native';
import { useWebPushNotifications } from '@/hooks/useWebPushNotifications';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useFyllStore, { formatCurrency, type DeletedItem, type ThemeMode } from '@/lib/state/fyll-store';
import useAuthStore, { ROLE_PERMISSIONS } from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { canShowFinanceNavigation, getDefaultFinanceSectionForRole } from '@/lib/finance-access';
import { isOrderStatusException, ORDER_TRACKING_STAGE_OPTIONS, sortOrderStatusesForFulfillment, type OrderTrackingStage } from '@/lib/order-status';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import {
  buildCustomerTrackingHostUrl,
  buildDeliveryConfirmationHostUrl,
  buildStartReturnHostUrl,
  slugifyBusinessName,
} from '@/lib/tracking-url';
import { FYLL_TRACKING_ORIGIN } from '@/lib/tracking-host';
import { SettingsBackOverrideProvider } from '@/lib/useSettingsBack';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import AccountSettingsScreen from '@/app/account-settings';
import BusinessSettingsScreen from '@/app/business-settings';
import StorefrontSettingsScreen from '@/app/storefront-settings';
import PaymentAccountsScreen from '@/app/payment-accounts';
import TeamManagementScreen from '@/app/team';
import InvitationsScreen from '@/app/invitations';
import WooCommerceSettingsScreen from '@/app/woocommerce-settings';
import OrderAutomationScreen from '@/app/order-automation';
import EmailSettingsScreen from '@/app/email-settings';
import WarehouseSettingsScreen from '@/app/warehouse-settings';
import CategoryManagerScreen from '@/app/category-manager';
import ProductVariablesScreen from '@/app/product-variables';
import ProductOptionsScreen from '@/app/product-options';
import ImportProductsScreen from '@/app/import-products';
import ImportCustomersScreen from '@/app/import-customers';
import ImportOrdersScreen from '@/app/import-orders';
import ImportAiScreen from '@/app/import-ai';
import TasksScreen from '@/app/(tabs)/tasks';
import { SearchClearButton } from '@/components/SearchClearButton';

type SettingsSection =
  | 'order-statuses'
  | 'quality-control-checks'
  | 'sale-sources'
  | 'custom-services'
  | 'order-timelines'
  | 'shipping-zones'
  | 'payment-methods'
  | 'logistics-carriers'
  | 'case-statuses'
  | 'resolution-types'
  | 'recycle-bin';

type WebSettingsMenuKey =
  | 'profile'
  | 'links'
  | 'operations'
  | 'orders'
  | 'inventory'
  | 'cases'
  | 'appearance'
  | 'notifications'
  | 'integrations'
  | 'system';

const SETTINGS_SECTION_MENU_MAP: Record<SettingsSection, WebSettingsMenuKey> = {
  'order-statuses': 'orders',
  'quality-control-checks': 'orders',
  'sale-sources': 'orders',
  'custom-services': 'inventory',
  'order-timelines': 'orders',
  'shipping-zones': 'orders',
  'payment-methods': 'orders',
  'logistics-carriers': 'orders',
  'case-statuses': 'cases',
  'resolution-types': 'cases',
  'recycle-bin': 'system',
};

type WebInlineSettingsPanel =
  | 'account-settings'
  | 'business-settings'
  | 'storefront-settings'
  | 'payment-accounts'
  | 'team'
  | 'invitations'
  | 'woocommerce-settings'
  | 'order-automation'
  | 'email-settings'
  | 'warehouse-settings'
  | 'category-manager'
  | 'product-variables'
  | 'product-options'
  | 'import-products'
  | 'import-customers'
  | 'import-orders'
  | 'import-ai'
  | 'tasks';

const WEB_INLINE_SETTINGS_PANELS: WebInlineSettingsPanel[] = [
  'account-settings',
  'business-settings',
  'storefront-settings',
  'payment-accounts',
  'team',
  'invitations',
  'woocommerce-settings',
  'order-automation',
  'email-settings',
  'warehouse-settings',
  'category-manager',
  'product-variables',
  'product-options',
  'import-products',
  'import-customers',
  'import-orders',
  'import-ai',
  'tasks',
];

const SETTINGS_SECTIONS: SettingsSection[] = [
  'order-statuses',
  'quality-control-checks',
  'sale-sources',
  'custom-services',
  'order-timelines',
  'shipping-zones',
  'payment-methods',
  'logistics-carriers',
  'case-statuses',
  'resolution-types',
  'recycle-bin',
];

const normalizeSettingsSectionParam = (value?: string | null): SettingsSection | null => {
  const normalized = value?.trim().replace(/\?+$/, '') ?? '';
  return SETTINGS_SECTIONS.includes(normalized as SettingsSection)
    ? (normalized as SettingsSection)
    : null;
};

const WEB_SETTINGS_MENUS: WebSettingsMenuKey[] = [
  'profile',
  'links',
  'operations',
  'orders',
  'inventory',
  'cases',
  'appearance',
  'notifications',
  'integrations',
  'system',
];

const normalizeWebSettingsMenuParam = (value?: string | null): WebSettingsMenuKey | null => {
  const normalized = value?.trim().replace(/\?+$/, '') ?? '';
  return WEB_SETTINGS_MENUS.includes(normalized as WebSettingsMenuKey)
    ? (normalized as WebSettingsMenuKey)
    : null;
};

const normalizeWebInlinePanelParam = (value?: string | null): WebInlineSettingsPanel | null => {
  const normalized = value?.trim().replace(/\?+$/, '') ?? '';
  return WEB_INLINE_SETTINGS_PANELS.includes(normalized as WebInlineSettingsPanel)
    ? (normalized as WebInlineSettingsPanel)
    : null;
};

const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Abuja',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

let settingsMainScrollYMemory = 0;
const FYLL_PUBLIC_ORIGIN = 'https://fyll.app';

interface EditableItemProps {
  item: { id: string; name: string; color?: string; defaultPrice?: number; description?: string; trackingStage?: OrderTrackingStage; wooCommerceStatusSlug?: string };
  onUpdate: (name: string, color?: string, defaultPrice?: number, description?: string, trackingStage?: OrderTrackingStage, wooCommerceStatusSlug?: string) => void;
  onDelete: () => void;
  showColor?: boolean;
  showPrice?: boolean;
  showDescription?: boolean;
  showTrackingStage?: boolean;
  showWooCommerceStatusSlug?: boolean;
}

function EditableItem({
  item,
  onUpdate,
  onDelete,
  showColor = false,
  showPrice = false,
  showDescription = false,
  showTrackingStage = false,
  showWooCommerceStatusSlug = false,
}: EditableItemProps) {
  const colors = useThemeColors();
  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editColor, setEditColor] = useState(item.color || '#6B7280');
  const [editPrice, setEditPrice] = useState(item.defaultPrice?.toString() || '0');
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [editTrackingStage, setEditTrackingStage] = useState<OrderTrackingStage>(item.trackingStage ?? 'received');
  const [editWooCommerceStatusSlug, setEditWooCommerceStatusSlug] = useState(item.wooCommerceStatusSlug || '');

  const colorOptions = [
    '#EF4444',
    '#F97316',
    '#F59E0B',
    '#EAB308',
    '#84CC16',
    '#22C55E',
    '#14B8A6',
    '#06B6D4',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#F43F5E',
    '#6B7280',
  ];

  const handleSave = () => {
    if (editName.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUpdate(
        editName.trim(),
        showColor ? editColor : undefined,
        showPrice ? parseFloat(editPrice) || 0 : undefined,
        showDescription ? editDescription.trim() : undefined,
        showTrackingStage ? editTrackingStage : undefined,
        showWooCommerceStatusSlug ? editWooCommerceStatusSlug.trim() : undefined,
      );
      setIsEditing(false);
    }
  };

  return (
    <View className="mb-2">
      <View className="rounded-xl" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
        {isEditing ? (
          <View className="p-4">
            <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={{ color: colors.input.text, fontSize: 14 }}
                autoFocus
                placeholderTextColor={colors.input.placeholder}
                selectionColor={colors.text.primary}
              />
            </View>
            {showPrice && (
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  value={editPrice}
                  onChangeText={setEditPrice}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  keyboardType="numeric"
                  placeholder="Default price"
                  placeholderTextColor={colors.input.placeholder}
                  selectionColor={colors.text.primary}
                />
              </View>
            )}
            {showColor && (
              <View className="flex-row flex-wrap gap-2 mb-3">
                {colorOptions.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEditColor(color);
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: color,
                      borderWidth: editColor === color ? 2 : 0,
                      borderColor: colors.border.light,
                    }}
                  >
                    {editColor === color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                  </Pressable>
                ))}
              </View>
            )}
            {showDescription && (
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  placeholder="Description"
                  placeholderTextColor={colors.input.placeholder}
                  selectionColor={colors.text.primary}
                />
              </View>
            )}
            {showTrackingStage && (
              <View className="mb-3">
                <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
                  Tracking stage
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {ORDER_TRACKING_STAGE_OPTIONS.map((option) => {
                    const selected = editTrackingStage === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setEditTrackingStage(option.value)}
                        className="rounded-full px-3"
                        style={{
                          minHeight: 36,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected ? colors.text.primary : colors.bg.secondary,
                          borderWidth: 1,
                          borderColor: selected ? colors.text.primary : colors.border.light,
                        }}
                      >
                        <Text style={{ color: selected ? colors.bg.primary : colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {showWooCommerceStatusSlug && (
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                <TextInput
                  value={editWooCommerceStatusSlug}
                  onChangeText={setEditWooCommerceStatusSlug}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  placeholder="WooCommerce slug (optional)"
                  placeholderTextColor={colors.input.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={colors.text.primary}
                />
              </View>
            )}
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleSave}
                className="flex-1 rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold text-sm">Save</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditName(item.name);
                  setEditColor(item.color || '#6B7280');
                  setEditPrice(item.defaultPrice?.toString() || '0');
                  setEditDescription(item.description || '');
                  setEditTrackingStage(item.trackingStage ?? 'received');
                  setEditWooCommerceStatusSlug(item.wooCommerceStatusSlug || '');
                  setIsEditing(false);
                }}
                className="px-4 rounded-full items-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center p-4">
            {showColor && (
              <View
                className="w-4 h-4 rounded-full mr-3"
                style={{ backgroundColor: item.color || '#6B7280' }}
              />
            )}
            <View className="flex-1">
              <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{item.name}</Text>
              {showPrice && item.defaultPrice !== undefined && (
                <Text style={{ color: colors.text.tertiary }} className="text-xs">{formatCurrency(item.defaultPrice)}</Text>
              )}
              {showDescription && item.description ? (
                <Text style={{ color: colors.text.tertiary }} className="text-[11px]">
                  {item.description}
                </Text>
              ) : null}
              {showTrackingStage ? (
                <Text style={{ color: colors.text.tertiary }} className="text-[11px] mt-1">
                  {ORDER_TRACKING_STAGE_OPTIONS.find((option) => option.value === (item.trackingStage ?? 'received'))?.label ?? 'Order received'}
                </Text>
              ) : null}
              {showWooCommerceStatusSlug && item.wooCommerceStatusSlug ? (
                <Text style={{ color: colors.text.tertiary }} className="text-[11px] mt-1">
                  WooCommerce: {item.wooCommerceStatusSlug}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsEditing(true);
              }}
              className="p-2 active:opacity-50"
            >
              <Edit2 size={16} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete();
              }}
              className="p-2 active:opacity-50"
            >
              <Trash2 size={16} color="#EF4444" strokeWidth={2} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  rightText?: string;
  onPress?: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  showDivider?: boolean;
}

function SettingsRow({
  title,
  description,
  icon,
  rightText,
  onPress,
  showChevron = true,
  rightElement,
  showDivider = true,
}: SettingsRowProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      className="active:opacity-80"
      disabled={!onPress}
    >
      <View
        className="flex-row items-center px-4 py-3"
        style={{
          minHeight: 76,
          backgroundColor: 'transparent',
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: colors.border.light,
        }}
      >
        <View
          className="items-center justify-center mr-3"
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            backgroundColor: colors.bg.secondary,
          }}
        >
          {icon}
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
            {title}
          </Text>
          {description ? (
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
              {description}
            </Text>
          ) : null}
        </View>
        {rightText ? (
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold mr-2">
            {rightText}
          </Text>
        ) : null}
        {rightElement ? rightElement : null}
        {showChevron && onPress ? <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { businessName, businessSlug, featureAccess } = useBusinessSettings();
  const { section: sectionParam, menu: menuParam, panel: panelParam } = useLocalSearchParams<{ section?: SettingsSection; menu?: WebSettingsMenuKey; panel?: string }>();
  const normalizedSectionParam = normalizeSettingsSectionParam(sectionParam);
  const normalizedMenuParam = normalizeWebSettingsMenuParam(menuParam);
  const normalizedPanelParam = normalizeWebInlinePanelParam(panelParam);
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const saleSources = useFyllStore((s) => s.saleSources);
  const productVariables = useFyllStore((s) => s.productVariables);
  const productOptions = useFyllStore((s) => s.productOptions);
  const categories = useFyllStore((s) => s.categories);
  const customServices = useFyllStore((s) => s.customServices);
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);
  const saveOrderTimelineSettings = useFyllStore((s) => s.saveOrderTimelineSettings);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const orders = useFyllStore((s) => s.orders);
  const logisticsCarriers = useFyllStore((s) => s.logisticsCarriers);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const recycleBin = useFyllStore((s) => s.recycleBin);
  const restoreDeletedItem = useFyllStore((s) => s.restoreDeletedItem);
  const permanentlyDeleteRecycleBinItem = useFyllStore((s) => s.permanentlyDeleteRecycleBinItem);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);
  const customers = useFyllStore((s) => s.customers);
  const lastDataSyncAt = useFyllStore((s) => s.lastDataSyncAt);
  const lastFullDataSyncAt = useFyllStore((s) => s.lastFullDataSyncAt);
  const isBackgroundSyncing = useFyllStore((s) => s.isBackgroundSyncing);
  const themeMode = useFyllStore((s) => s.themeMode);
  const resolvedThemeMode = useResolvedThemeMode();
  const setThemeMode = useFyllStore((s) => s.setThemeMode);
  const businessId = useAuthStore((s) => s.businessId);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sectionSaveStatus, setSectionSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingDeleteSetting, setPendingDeleteSetting] = useState<{
    id: string;
    name: string;
    type: SettingsSection;
  } | null>(null);
  const [showAddOrderStatusForm, setShowAddOrderStatusForm] = useState(false);
  const [restoringDeletedItemId, setRestoringDeletedItemId] = useState<string | null>(null);
  const [recycleBinSearchQuery, setRecycleBinSearchQuery] = useState('');
  const [recentlyRestoredItems, setRecentlyRestoredItems] = useState<Array<DeletedItem & { restoredAt: string }>>([]);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<DeletedItem | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global Low Stock Threshold
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);
  const setUseGlobalLowStockThreshold = useFyllStore((s) => s.setUseGlobalLowStockThreshold);
  const setGlobalLowStockThreshold = useFyllStore((s) => s.setGlobalLowStockThreshold);
  const [tempThreshold, setTempThreshold] = useState(globalLowStockThreshold.toString());
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: 'System' },
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
  ];

  const { isReady: notifReady, promptForPermission, sendDirectSubscriptionTest, getDebugState } = useWebPushNotifications();
  const [notifPermission, setNotifPermission] = useState<string | null>(null);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [testPushResult, setTestPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sendTestPushToThisDevice = async () => {
    if (!businessId) {
      setTestPushResult({ ok: false, message: 'No business selected.' });
      return;
    }
    setIsSendingTestPush(true);
    setTestPushResult(null);
    try {
      const snapshot = await getDebugState();
      const subscriptionId = typeof snapshot?.subscriptionId === 'string' ? snapshot.subscriptionId.trim() : '';
      if (!subscriptionId) {
        setTestPushResult({ ok: false, message: 'This device isn’t subscribed yet. Enable push notifications above first.' });
        return;
      }
      await sendDirectSubscriptionTest({
        businessId,
        subscriptionId,
        heading: 'Fyll test notification',
        content: 'If you can see this, push notifications are working on this device.',
      });
      setTestPushResult({ ok: true, message: 'Test sent — check this device for the notification.' });
    } catch (error: any) {
      setTestPushResult({ ok: false, message: String(error?.message || error) });
    } finally {
      setIsSendingTestPush(false);
    }
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const check = () => setNotifPermission(window.Notification?.permission ?? null);
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  const addOrderStatus = useFyllStore((s) => s.addOrderStatus);
  const updateOrderStatus = useFyllStore((s) => s.updateOrderStatus);
  const reorderOrderStatuses = useFyllStore((s) => s.reorderOrderStatuses);
  const deleteOrderStatus = useFyllStore((s) => s.deleteOrderStatus);
  const qcChecklistRequirements = useFyllStore((s) => s.qcChecklistRequirements);
  const addQcChecklistRequirement = useFyllStore((s) => s.addQcChecklistRequirement);
  const deleteQcChecklistRequirement = useFyllStore((s) => s.deleteQcChecklistRequirement);
  const resetQcChecklistRequirements = useFyllStore((s) => s.resetQcChecklistRequirements);

  const addSaleSource = useFyllStore((s) => s.addSaleSource);
  const updateSaleSource = useFyllStore((s) => s.updateSaleSource);
  const deleteSaleSource = useFyllStore((s) => s.deleteSaleSource);

  const addCustomService = useFyllStore((s) => s.addCustomService);
  const updateCustomService = useFyllStore((s) => s.updateCustomService);
  const deleteCustomService = useFyllStore((s) => s.deleteCustomService);

  const addPaymentMethod = useFyllStore((s) => s.addPaymentMethod);
  const updatePaymentMethod = useFyllStore((s) => s.updatePaymentMethod);
  const bulkRenameOrderPaymentMethod = useFyllStore((s) => s.bulkRenameOrderPaymentMethod);
  const deletePaymentMethod = useFyllStore((s) => s.deletePaymentMethod);

  const addLogisticsCarrier = useFyllStore((s) => s.addLogisticsCarrier);
  const updateLogisticsCarrier = useFyllStore((s) => s.updateLogisticsCarrier);
  const deleteLogisticsCarrier = useFyllStore((s) => s.deleteLogisticsCarrier);
  const addCaseStatus = useFyllStore((s) => s.addCaseStatus);
  const updateCaseStatus = useFyllStore((s) => s.updateCaseStatus);
  const deleteCaseStatus = useFyllStore((s) => s.deleteCaseStatus);

  const resolutionTypes = useFyllStore((s) => s.resolutionTypes);
  const addResolutionType = useFyllStore((s) => s.addResolutionType);
  const updateResolutionType = useFyllStore((s) => s.updateResolutionType);
  const deleteResolutionType = useFyllStore((s) => s.deleteResolutionType);

  const orderedOrderStatuses = useMemo(() => (
    sortOrderStatusesForFulfillment(orderStatuses)
  ), [orderStatuses]);
  const fulfillmentOrderStatuses = useMemo(() => (
    orderedOrderStatuses.filter((status) => !isOrderStatusException(status))
  ), [orderedOrderStatuses]);
  const exceptionOrderStatuses = useMemo(() => (
    orderedOrderStatuses.filter((status) => isOrderStatusException(status))
  ), [orderedOrderStatuses]);

  const handleMoveOrderStatus = (statusId: string, direction: -1 | 1) => {
    const currentIndex = fulfillmentOrderStatuses.findIndex((status) => status.id === statusId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= fulfillmentOrderStatuses.length) return;

    const nextStatuses = [...fulfillmentOrderStatuses];
    const [movedStatus] = nextStatuses.splice(currentIndex, 1);
    nextStatuses.splice(nextIndex, 0, movedStatus);
    reorderOrderStatuses([...nextStatuses, ...exceptionOrderStatuses].map((status) => status.id));
    triggerGlobalSave();
  };

  const unmappedOrderPaymentMethods = useMemo(() => {
    const configuredMethods = new Set(paymentMethods.map((method) => method.name.trim().toLowerCase()).filter(Boolean));
    const counts = new Map<string, number>();
    orders.forEach((order) => {
      const name = order.paymentMethod.trim();
      if (!name || configuredMethods.has(name.toLowerCase())) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [orders, paymentMethods]);

  const handleMergeOrderPaymentMethod = (fromName: string, toName: string) => {
    if (!fromName.trim() || !toName.trim()) return;
    bulkRenameOrderPaymentMethod(fromName, toName, businessId);
    triggerGlobalSave();
  };

  const openDeleteSetting = (type: SettingsSection, setting: { id: string; name: string }) => {
    if (Platform.OS === 'web') {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }
    setPendingDeleteSetting({ id: setting.id, name: setting.name, type });
  };

  const confirmDeleteSetting = () => {
    if (!pendingDeleteSetting) return;
    switch (pendingDeleteSetting.type) {
      case 'order-statuses':
        deleteOrderStatus(pendingDeleteSetting.id, businessId);
        break;
      case 'quality-control-checks':
        deleteQcChecklistRequirement(pendingDeleteSetting.id);
        break;
      case 'case-statuses':
        deleteCaseStatus(pendingDeleteSetting.id, businessId);
        break;
      case 'sale-sources':
        deleteSaleSource(pendingDeleteSetting.id, businessId);
        break;
      case 'custom-services':
        deleteCustomService(pendingDeleteSetting.id, businessId);
        break;
      case 'payment-methods':
        deletePaymentMethod(pendingDeleteSetting.id, businessId);
        break;
      case 'logistics-carriers':
        deleteLogisticsCarrier(pendingDeleteSetting.id, businessId);
        break;
      case 'resolution-types':
        deleteResolutionType(pendingDeleteSetting.id, businessId);
        break;
      default:
        break;
    }
    triggerGlobalSave();
    setPendingDeleteSetting(null);
  };

  const renderDeleteSettingModal = () => (
    <Modal
      visible={!!pendingDeleteSetting}
      animationType="fade"
      transparent
      onRequestClose={() => setPendingDeleteSetting(null)}
    >
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onPress={() => setPendingDeleteSetting(null)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-[90%] rounded-2xl overflow-hidden"
          style={{ backgroundColor: colors.bg.primary, maxWidth: 360 }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <Text style={{ color: colors.text.primary }} className="font-semibold text-lg">Delete Item</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
              {pendingDeleteSetting ? `Delete ${pendingDeleteSetting.name}?` : 'Delete this item?'}
            </Text>
          </View>
          <View className="px-5 py-4 flex-row gap-3">
            <Pressable
              onPress={() => setPendingDeleteSetting(null)}
              className="flex-1 rounded-full items-center"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirmDeleteSetting}
              className="flex-1 rounded-full items-center"
              style={{ backgroundColor: '#EF4444', height: 48, justifyContent: 'center' }}
            >
              <Text className="text-white font-semibold">Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderOrderStatusModal = () => (
    <Modal
      visible={showOrderStatusModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowOrderStatusModal(false)}
    >
      <Pressable
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onPress={() => setShowOrderStatusModal(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full rounded-3xl overflow-hidden"
          style={{ backgroundColor: colors.bg.primary, maxWidth: 520 }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                  {editingOrderStatusId ? 'Edit Order Status' : 'New Order Status'}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {editingOrderStatusId
                    ? 'Update the status name, display color, and how it should appear in customer tracking.'
                    : 'Create a new order status and decide which customer tracking stage it belongs to.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowOrderStatusModal(false)}
                className="w-10 h-10 rounded-2xl items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <View className="px-5 py-5" style={{ gap: 14 }}>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Status Name
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Dispatched"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Tracking Stage
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ORDER_TRACKING_STAGE_OPTIONS.map((option) => {
                  const selected = newItemTrackingStage === option.value;
                  return (
                    <Pressable
                      key={`order-status-stage-${option.value}`}
                      onPress={() => setNewItemTrackingStage(option.value)}
                      className="rounded-full active:opacity-80"
                      style={{
                        minHeight: 38,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.text.primary : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: selected ? colors.text.primary : colors.border.light,
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? colors.bg.primary : colors.text.primary,
                          fontSize: 12,
                          fontWeight: '500',
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                WooCommerce Status Slug
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="delivered"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemWooStatusSlug}
                  onChangeText={setNewItemWooStatusSlug}
                  style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 7 }}>
                Optional. Set the exact WooCommerce status slug FYLL should push for this status.
              </Text>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Status Color
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                {colorOptions.map((color) => (
                  <Pressable
                    key={`order-status-color-${color}`}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setNewItemColor(color);
                    }}
                    className="w-9 h-9 rounded-full items-center justify-center active:opacity-80"
                    style={{
                      backgroundColor: color,
                      borderWidth: newItemColor === color ? 2 : 0,
                      borderColor: colors.border.light,
                    }}
                  >
                    {newItemColor === color ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View className="px-5 pb-5 flex-row" style={{ gap: 12 }}>
            <Pressable
              onPress={() => setShowOrderStatusModal(false)}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, minHeight: 48 }}
            >
              <Text style={{ color: colors.text.tertiary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitOrderStatus}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={[primaryPillButtonStyle, { minHeight: 48 }]}
            >
              <Text style={[primaryPillTextStyle, { fontWeight: '600' }]}>
                {editingOrderStatusId ? 'Save Changes' : 'Add Status'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderOrderTimelineModal = () => (
    <Modal
      visible={showOrderTimelineModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowOrderTimelineModal(false)}
    >
      <Pressable
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onPress={() => setShowOrderTimelineModal(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full rounded-3xl overflow-hidden"
          style={{ backgroundColor: colors.bg.primary, maxWidth: 520 }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                  {editingOrderTimelineId ? 'Edit Order Timeline' : 'New Order Timeline'}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {editingOrderTimelineId
                    ? 'Update the order type, optional shipping zone, and its processing business-day range before delivery time is added.'
                    : 'Create an order type, optionally target a shipping zone, and define its processing business-day range before delivery time is added.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowOrderTimelineModal(false)}
                className="w-10 h-10 rounded-2xl items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <View className="px-5 py-5" style={{ gap: 14 }}>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Order Type
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Ready to wear"
                  placeholderTextColor={colors.input.placeholder}
                  value={newOrderTypeName}
                  onChangeText={setNewOrderTypeName}
                  style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Shipping Zone
              </Text>
              <View
                className="rounded-2xl p-3"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable
                    onPress={() => setNewOrderTypeShippingZoneId(null)}
                    className="rounded-full active:opacity-80"
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      backgroundColor: newOrderTypeShippingZoneId === null ? colors.text.primary : colors.bg.card,
                      borderWidth: 1,
                      borderColor: newOrderTypeShippingZoneId === null ? colors.text.primary : colors.border.light,
                    }}
                  >
                    <Text
                      style={{
                        color: newOrderTypeShippingZoneId === null ? colors.bg.primary : colors.text.secondary,
                        fontSize: 11,
                        fontWeight: '600',
                      }}
                    >
                      All zones
                    </Text>
                  </Pressable>
                  {orderTimelineSettings.shippingZones.map((zone) => {
                    const isSelected = newOrderTypeShippingZoneId === zone.id;
                    return (
                      <Pressable
                        key={`order-timeline-zone-${zone.id}`}
                        onPress={() => setNewOrderTypeShippingZoneId(zone.id)}
                        className="rounded-full active:opacity-80"
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          backgroundColor: isSelected ? colors.text.primary : colors.bg.card,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.text.primary : colors.border.light,
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? colors.bg.primary : colors.text.secondary,
                            fontSize: 11,
                            fontWeight: '600',
                          }}
                        >
                          {zone.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 10 }}>
                  Choose a specific shipping zone only when this processing window should not apply everywhere. Shipping-zone delivery days are added on top.
                </Text>
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Workflow Sequence
              </Text>
              <View
                className="rounded-2xl p-3"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                {newOrderTypeWorkflowStatusIds.length > 0 ? (
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {newOrderTypeWorkflowStatusIds.map((statusId, index) => {
                      const status = orderStatuses.find((entry) => entry.id === statusId);
                      if (!status) return null;
                      return (
                        <Pressable
                          key={`selected-order-timeline-status-${statusId}`}
                          onPress={() => toggleOrderTimelineWorkflowStatus(statusId)}
                          className="rounded-full flex-row items-center active:opacity-80"
                          style={{
                            paddingLeft: 9,
                            paddingRight: 12,
                            paddingVertical: 8,
                            backgroundColor: colors.bg.card,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            gap: 8,
                          }}
                        >
                          <View
                            className="rounded-full items-center justify-center"
                            style={{ width: 18, height: 18, backgroundColor: colors.text.primary }}
                          >
                            <Text style={{ color: colors.bg.primary, fontSize: 10, fontWeight: '600' }}>
                              {index + 1}
                            </Text>
                          </View>
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                            {status.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                    Pick the statuses this order type should pass through. Tap a selected status again to remove it.
                  </Text>
                )}

                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border.light,
                    marginVertical: 12,
                  }}
                />

                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {orderStatuses
                    .filter((status) => status.trackingStage !== 'cancelled')
                    .map((status) => {
                      const selected = newOrderTypeWorkflowStatusIds.includes(status.id);
                      return (
                        <Pressable
                          key={`order-timeline-workflow-${status.id}`}
                          onPress={() => toggleOrderTimelineWorkflowStatus(status.id)}
                          className="rounded-full active:opacity-80"
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            backgroundColor: selected ? colors.text.primary : colors.bg.card,
                            borderWidth: 1,
                            borderColor: selected ? colors.text.primary : colors.border.light,
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? colors.bg.primary : colors.text.secondary,
                              fontSize: 12,
                              fontWeight: '500',
                            }}
                          >
                            {status.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </View>
            </View>

            <View className="flex-row" style={{ gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                  Min Days
                </Text>
                <View
                  className="rounded-2xl px-4"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
                >
                  <TextInput
                    placeholder="3"
                    placeholderTextColor={colors.input.placeholder}
                    value={newOrderTypeMinDays}
                    onChangeText={setNewOrderTypeMinDays}
                    keyboardType="numeric"
                    style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                  Max Days
                </Text>
                <View
                  className="rounded-2xl px-4"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
                >
                  <TextInput
                    placeholder="7"
                    placeholderTextColor={colors.input.placeholder}
                    value={newOrderTypeMaxDays}
                    onChangeText={setNewOrderTypeMaxDays}
                    keyboardType="numeric"
                    style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>
            </View>
          </View>

          <View className="px-5 pb-5 flex-row" style={{ gap: 12 }}>
            <Pressable
              onPress={() => setShowOrderTimelineModal(false)}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, minHeight: 48 }}
            >
              <Text style={{ color: colors.text.tertiary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitOrderTypeTimeline}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={[primaryPillButtonStyle, { minHeight: 48 }]}
            >
              <Text style={[primaryPillTextStyle, { fontWeight: '600' }]}>
                {editingOrderTimelineId ? 'Save Changes' : 'Add Order Type'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderShippingZoneModal = () => (
    <Modal
      visible={showShippingZoneModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowShippingZoneModal(false)}
    >
      <Pressable
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onPress={() => setShowShippingZoneModal(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full rounded-3xl overflow-hidden"
          style={{ backgroundColor: colors.bg.primary, maxWidth: 620 }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                  {editingShippingZoneId ? 'Edit Shipping Zone' : 'New Shipping Zone'}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {editingShippingZoneId
                    ? 'Update the zone name, included states, and delivery fee.'
                    : 'Create a zone, search for the states to include, and set the delivery fee.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowShippingZoneModal(false)}
                className="w-10 h-10 rounded-2xl items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <View className="px-5 py-5" style={{ gap: 14 }}>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Shipping Zone
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Lagos Mainland"
                  placeholderTextColor={colors.input.placeholder}
                  value={newShippingZoneName}
                  onChangeText={setNewShippingZoneName}
                  style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Search States
              </Text>
              <View className="flex-row items-center justify-between" style={{ gap: 10, marginBottom: 8 }}>
                <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                  {newShippingZoneSelectedStates.length} of {NIGERIAN_STATES.length} selected
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Pressable
                    onPress={selectAllNewShippingZoneStates}
                    className="rounded-full px-3 active:opacity-80"
                    style={{
                      minHeight: 32,
                      justifyContent: 'center',
                      backgroundColor: colors.bg.secondary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                      Select all
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={clearAllNewShippingZoneStates}
                    className="rounded-full px-3 active:opacity-80"
                    style={{
                      minHeight: 32,
                      justifyContent: 'center',
                      backgroundColor: colors.bg.secondary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
                      Clear all
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder="Type a Nigerian state"
                  placeholderTextColor={colors.input.placeholder}
                  value={newShippingZoneStateSearch}
                  onChangeText={setNewShippingZoneStateSearch}
                  style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                  selectionColor={colors.text.primary}
                />
                <SearchClearButton visible={Boolean(newShippingZoneStateSearch.trim())} onPress={() => setNewShippingZoneStateSearch('')} />
              </View>
              {newShippingZoneStateSearch.trim().length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {getAvailableStateMatches(newShippingZoneStateSearch, newShippingZoneSelectedStates).map((stateName) => {
                    const isSelected = newShippingZoneSelectedStates.includes(stateName);
                    return (
                    <Pressable
                      key={`shipping-zone-modal-${stateName}`}
                      onPress={() => toggleNewShippingZoneState(stateName)}
                      className="rounded-full active:opacity-80"
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        backgroundColor: isSelected ? colors.text.primary : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.text.primary : colors.border.light,
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.bg.primary : colors.text.secondary,
                          fontSize: 10,
                          fontWeight: '500',
                        }}
                      >
                        {stateName}{isSelected ? ' ×' : ''}
                      </Text>
                    </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Added States
              </Text>
              <View
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, minHeight: 56 }}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {newShippingZoneSelectedStates.length > 0 ? newShippingZoneSelectedStates.map((stateName) => (
                    <Pressable
                      key={`shipping-zone-selected-${stateName}`}
                      onPress={() => toggleNewShippingZoneState(stateName)}
                      className="rounded-full active:opacity-80"
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        backgroundColor: colors.text.primary,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 10, fontWeight: '500' }}>{stateName} ×</Text>
                    </Pressable>
                  )) : (
                    <Text style={{ color: colors.text.muted, fontSize: 12 }}>No states added yet.</Text>
                  )}
                </View>
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Delivery Fee
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14, fontWeight: '500' }}>₦</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={colors.input.placeholder}
                    value={newShippingZoneFee}
                    onChangeText={setNewShippingZoneFee}
                    keyboardType="numeric"
                    style={{ color: colors.input.text, flex: 1, fontSize: 15, fontWeight: '500' }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>
            </View>
          </View>

          <View className="px-5 pb-5 flex-row" style={{ gap: 12 }}>
            <Pressable
              onPress={() => setShowShippingZoneModal(false)}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, minHeight: 48 }}
            >
              <Text style={{ color: colors.text.tertiary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitShippingZoneTimeline}
              className="flex-1 rounded-full items-center justify-center active:opacity-80"
              style={[primaryPillButtonStyle, { minHeight: 48 }]}
            >
              <Text style={[primaryPillTextStyle, { fontWeight: '600' }]}>
                {editingShippingZoneId ? 'Save Changes' : 'Add Shipping Zone'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderOrderTimelineActionMenu = () => (
    <Modal
      visible={!!orderTimelineMenu}
      animationType="fade"
      transparent
      onRequestClose={() => setOrderTimelineMenu(null)}
    >
      <Pressable
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        onPress={() => setOrderTimelineMenu(null)}
      >
        {orderTimelineMenu ? (
          <View
            style={{
              position: 'absolute',
              top: orderTimelineMenu.top,
              left: orderTimelineMenu.left,
              width: 148,
              borderRadius: 14,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
              overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => handleEditOrderTimeline(orderTimelineMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
            >
              <Edit2 size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDeleteOrderTimeline(orderTimelineMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8 }}
            >
              <Trash2 size={14} color="#EF4444" strokeWidth={2} />
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '500' }}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );

  const renderOrderStatusActionMenu = () => (
    <Modal
      visible={!!orderStatusMenu}
      animationType="fade"
      transparent
      onRequestClose={() => setOrderStatusMenu(null)}
    >
      <Pressable
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        onPress={() => setOrderStatusMenu(null)}
      >
        {orderStatusMenu ? (
          <View
            style={{
              position: 'absolute',
              top: orderStatusMenu.top,
              left: orderStatusMenu.left,
              width: 148,
              borderRadius: 14,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
              overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => handleEditOrderStatus(orderStatusMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
            >
              <Edit2 size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDeleteOrderStatus(orderStatusMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8 }}
            >
              <Trash2 size={14} color="#EF4444" strokeWidth={2} />
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '500' }}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );

  const renderShippingZoneActionMenu = () => (
    <Modal
      visible={!!shippingZoneMenu}
      animationType="fade"
      transparent
      onRequestClose={() => setShippingZoneMenu(null)}
    >
      <Pressable
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        onPress={() => setShippingZoneMenu(null)}
      >
        {shippingZoneMenu ? (
          <View
            style={{
              position: 'absolute',
              top: shippingZoneMenu.top,
              left: shippingZoneMenu.left,
              width: 148,
              borderRadius: 14,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
              overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => handleEditShippingZone(shippingZoneMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
            >
              <Edit2 size={14} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDeleteShippingZone(shippingZoneMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 44, paddingHorizontal: 12, gap: 8 }}
            >
              <Trash2 size={14} color="#EF4444" strokeWidth={2} />
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '500' }}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );

  // Auth
  const currentUser = useAuthStore((s) => s.currentUser);
  const userRole = currentUser?.role ?? 'staff';
  const canViewInsights = (ROLE_PERMISSIONS[userRole]?.canViewInsights ?? false) && isBusinessFeatureEnabled(featureAccess, 'insights');
  const canViewFinance = canShowFinanceNavigation(userRole) && isBusinessFeatureEnabled(featureAccess, 'finance');
  const canUseStorefront = isBusinessFeatureEnabled(featureAccess, 'storefront');
  const canUseSocialCheckout = isBusinessFeatureEnabled(featureAccess, 'socialCheckout');
  const canUseCases = isBusinessFeatureEnabled(featureAccess, 'cases');
  const canUseTeamMembers = isBusinessFeatureEnabled(featureAccess, 'teamMembers');
  const canUseTasks = isBusinessFeatureEnabled(featureAccess, 'tasks');
  const canUseDelivery = isBusinessFeatureEnabled(featureAccess, 'delivery');
  const canUseReturns = isBusinessFeatureEnabled(featureAccess, 'returns');
  const canUseAnnouncements = isBusinessFeatureEnabled(featureAccess, 'announcements');
  const canUseOrderAutomation = isBusinessFeatureEnabled(featureAccess, 'orderAutomation');
  const canUseWooCommerce = isBusinessFeatureEnabled(featureAccess, 'woocommerce');
  const canUseFyllPrint = isBusinessFeatureEnabled(featureAccess, 'fyllPrint');
  const canUseAiImport = isBusinessFeatureEnabled(featureAccess, 'aiImport');
  const financeSettingsRoute = `/finance?section=${getDefaultFinanceSectionForRole(userRole)}&from=settings`;

  const handleSaveGlobalSettings = async () => {
    if (!businessId) {
      setSaveStatus('error');
      setSaveMessage('No business selected.');
      return;
    }

    setSaveStatus('saving');
    setSaveMessage(null);
    const result = await saveGlobalSettings(businessId);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveStatus('success');
      setSaveMessage('Saved for all devices.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSaveStatus('error');
      setSaveMessage(result.error ?? 'Save failed.');
    }

    setTimeout(() => {
      setSaveStatus('idle');
    }, 2500);
  };

  const handleSectionSave = async () => {
    if (!businessId) {
      setSectionSaveStatus('error');
      return;
    }

    setSectionSaveStatus('saving');
    const result = await saveGlobalSettings(businessId);
    setSectionSaveStatus(result.success ? 'success' : 'error');

    setTimeout(() => {
      setSectionSaveStatus('idle');
    }, 2000);
  };

  const triggerGlobalSave = () => {
    if (!businessId) return;
    void saveGlobalSettings(businessId).then((result) => {
      if (result.success) {
        setSaveStatus('success');
        setSaveMessage('Saved for all devices.');
      } else {
        setSaveStatus('error');
        setSaveMessage(result.error ?? 'Save failed.');
      }

      setTimeout(() => setSaveStatus('idle'), 2000);
    });
  };

  const parseTimelineDays = (value: string, fallback: number) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const parseThresholdPercent = (value: string, fallback: number) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(100, Math.max(50, parsed));
  };

  const saveTimelineSettings = async (nextSettings: typeof orderTimelineSettings) => {
    const result = await saveOrderTimelineSettings(nextSettings, businessId);
    if (result.success) {
      setSaveStatus('success');
      setSaveMessage('Saved for all devices.');
    } else {
      setSaveStatus('error');
      setSaveMessage(result.error ?? 'Save failed.');
    }

    setTimeout(() => setSaveStatus('idle'), 2000);
    return result;
  };

  const commitDefaultOrderTimelineSettings = () => {
    const minBusinessDays = parseTimelineDays(
      defaultOrderTypeMinDays,
      orderTimelineSettings.defaultOrderType.minBusinessDays
    );
    const maxBusinessDays = Math.max(
      minBusinessDays,
      parseTimelineDays(defaultOrderTypeMaxDays, orderTimelineSettings.defaultOrderType.maxBusinessDays)
    );
    const warningThresholdPercent = parseThresholdPercent(
      defaultOrderTimelineThreshold,
      orderTimelineSettings.warningThresholdPercent
    );
    saveTimelineSettings({
      ...orderTimelineSettings,
      warningThresholdPercent,
      defaultOrderType: {
        ...orderTimelineSettings.defaultOrderType,
        minBusinessDays,
        maxBusinessDays,
      },
    });
    setDefaultOrderTypeMinDays(String(minBusinessDays));
    setDefaultOrderTypeMaxDays(String(maxBusinessDays));
    setDefaultOrderTimelineThreshold(String(warningThresholdPercent));
  };

  const openCreateOrderTimelineModal = () => {
    setEditingOrderTimelineId(null);
    setNewOrderTypeName('');
    setNewOrderTypeMinDays('3');
    setNewOrderTypeMaxDays('7');
    setNewOrderTypeShippingZoneId(null);
    setNewOrderTypeWorkflowStatusIds([]);
    setOrderTimelineMenu(null);
    setShowOrderTimelineModal(true);
  };

  const openCreateOrderStatusModal = () => {
    setEditingOrderStatusId(null);
    setNewItemName('');
    setNewItemColor('#3B82F6');
    setNewItemTrackingStage('received');
    setNewItemWooStatusSlug('');
    setOrderStatusMenu(null);
    setShowOrderStatusModal(true);
  };

  const openEditOrderStatusModal = (statusId: string) => {
    const status = orderStatuses.find((item) => item.id === statusId);
    if (!status) return;
    setEditingOrderStatusId(status.id);
    setNewItemName(status.name);
    setNewItemColor(status.color);
    setNewItemTrackingStage(status.trackingStage ?? 'received');
    setNewItemWooStatusSlug(status.wooCommerceStatusSlug ?? '');
    setOrderStatusMenu(null);
    setShowOrderStatusModal(true);
  };

  const openOrderStatusMenu = (statusId: string, event: GestureResponderEvent) => {
    const menuWidth = 148;
    const screenPadding = 12;
    const screenWidth = Dimensions.get('window').width;
    const pageX = event.nativeEvent.pageX ?? 0;
    const pageY = event.nativeEvent.pageY ?? 0;
    const safeLeft = Math.max(
      screenPadding,
      Math.min(pageX - menuWidth + 32, screenWidth - menuWidth - screenPadding)
    );
    setOrderStatusMenu((current) => (
      current?.id === statusId
        ? null
        : {
            id: statusId,
            top: Math.max(72, pageY + 12),
            left: safeLeft,
          }
    ));
  };

  const openEditOrderTimelineModal = (timelineId: string) => {
    const timeline = orderTimelineSettings.orderTypes.find((item) => item.id === timelineId);
    if (!timeline) return;
    setEditingOrderTimelineId(timeline.id);
    setNewOrderTypeName(timeline.name);
    setNewOrderTypeMinDays(String(timeline.minBusinessDays));
    setNewOrderTypeMaxDays(String(timeline.maxBusinessDays));
    setNewOrderTypeShippingZoneId(timeline.shippingZoneId ?? null);
    setNewOrderTypeWorkflowStatusIds(timeline.workflowStatusIds ?? []);
    setOrderTimelineMenu(null);
    setShowOrderTimelineModal(true);
  };

  const openOrderTimelineMenu = (timelineId: string, event: GestureResponderEvent) => {
    const menuWidth = 148;
    const screenPadding = 12;
    const screenWidth = Dimensions.get('window').width;
    const pageX = event.nativeEvent.pageX ?? 0;
    const pageY = event.nativeEvent.pageY ?? 0;
    const safeLeft = Math.max(
      screenPadding,
      Math.min(pageX - menuWidth + 32, screenWidth - menuWidth - screenPadding)
    );
    setOrderTimelineMenu((current) => (
      current?.id === timelineId
        ? null
        : {
            id: timelineId,
            top: Math.max(72, pageY + 12),
            left: safeLeft,
          }
    ));
  };

  const toggleOrderTimelineWorkflowStatus = (statusId: string) => {
    setNewOrderTypeWorkflowStatusIds((current) => (
      current.includes(statusId)
        ? current.filter((item) => item !== statusId)
        : [...current, statusId]
    ));
  };

  const openCreateShippingZoneModal = () => {
    setEditingShippingZoneId(null);
    setNewShippingZoneName('');
    setNewShippingZoneSelectedStates([]);
    setNewShippingZoneStateSearch('');
    setNewShippingZoneFee('0');
    setShippingZoneMenu(null);
    setShowShippingZoneModal(true);
  };

  const openEditShippingZoneModal = (zoneId: string) => {
    const zone = orderTimelineSettings.shippingZones.find((item) => item.id === zoneId);
    if (!zone) return;
    setEditingShippingZoneId(zone.id);
    setNewShippingZoneName(zone.name);
    setNewShippingZoneSelectedStates(zone.states);
    setNewShippingZoneStateSearch('');
    setNewShippingZoneFee(String(zone.shippingFee ?? 0));
    setShippingZoneMenu(null);
    setShowShippingZoneModal(true);
  };

  const openShippingZoneMenu = (zoneId: string, event: GestureResponderEvent) => {
    const menuWidth = 148;
    const screenPadding = 12;
    const screenWidth = Dimensions.get('window').width;
    const pageX = event.nativeEvent.pageX ?? 0;
    const pageY = event.nativeEvent.pageY ?? 0;
    const safeLeft = Math.max(
      screenPadding,
      Math.min(pageX - menuWidth + 32, screenWidth - menuWidth - screenPadding)
    );
    setShippingZoneMenu((current) => (
      current?.id === zoneId
        ? null
        : {
            id: zoneId,
            top: Math.max(72, pageY + 12),
            left: safeLeft,
          }
    ));
  };

  const handleSubmitOrderTypeTimeline = async () => {
    const name = newOrderTypeName.trim();
    if (!name) return;
    const shippingZoneId = newOrderTypeShippingZoneId ?? null;
    const alreadyExists = orderTimelineSettings.orderTypes.some(
      (item) => (
        item.id !== editingOrderTimelineId
        && item.name.trim().toLowerCase() === name.toLowerCase()
        && (item.shippingZoneId ?? null) === shippingZoneId
      )
    );
    if (alreadyExists) {
      Alert.alert('Duplicate', 'This order timeline already exists for that shipping zone.');
      return;
    }
    const minBusinessDays = parseTimelineDays(newOrderTypeMinDays, 1);
    const maxBusinessDays = Math.max(minBusinessDays, parseTimelineDays(newOrderTypeMaxDays, minBusinessDays));
    const workflowStatusIds = newOrderTypeWorkflowStatusIds.filter((statusId, index, list) => (
      !!orderStatuses.find((status) => status.id === statusId) && list.indexOf(statusId) === index
    ));
    const result = await saveTimelineSettings(
      editingOrderTimelineId
        ? {
            ...orderTimelineSettings,
            orderTypes: orderTimelineSettings.orderTypes.map((item) => (
              item.id === editingOrderTimelineId
                ? { ...item, name, minBusinessDays, maxBusinessDays, shippingZoneId, workflowStatusIds }
                : item
            )),
          }
        : {
            ...orderTimelineSettings,
            orderTypes: [
              ...orderTimelineSettings.orderTypes,
              {
                id: `order-type-${Date.now().toString(36)}`,
                name,
                minBusinessDays,
                maxBusinessDays,
                shippingZoneId,
                workflowStatusIds,
              },
            ],
          }
    );
    if (!result.success) return;
    setEditingOrderTimelineId(null);
    setNewOrderTypeName('');
    setNewOrderTypeMinDays('3');
    setNewOrderTypeMaxDays('7');
    setNewOrderTypeShippingZoneId(null);
    setNewOrderTypeWorkflowStatusIds([]);
    setShowOrderTimelineModal(false);
  };

  const handleSubmitOrderStatus = () => {
    const name = newItemName.trim();
    if (!name) return;

    const alreadyExists = orderStatuses.some(
      (status) => status.id !== editingOrderStatusId && status.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (alreadyExists) {
      Alert.alert('Duplicate', 'This order status already exists.');
      return;
    }

    if (editingOrderStatusId) {
      updateOrderStatus(editingOrderStatusId, {
        name,
        color: newItemColor,
        trackingStage: newItemTrackingStage,
        wooCommerceStatusSlug: newItemWooStatusSlug.trim() || undefined,
      });
    } else {
      addOrderStatus({
        id: `order-status-${Date.now().toString(36)}`,
        name,
        color: newItemColor,
        order: orderStatuses.length + 1,
        trackingStage: newItemTrackingStage,
        wooCommerceStatusSlug: newItemWooStatusSlug.trim() || undefined,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    triggerGlobalSave();
    setEditingOrderStatusId(null);
    setNewItemName('');
    setNewItemColor('#3B82F6');
    setNewItemTrackingStage('received');
    setNewItemWooStatusSlug('');
    setShowOrderStatusModal(false);
  };

  const handleSubmitShippingZoneTimeline = async () => {
    const name = newShippingZoneName.trim();
    if (!name) return;
    const alreadyExists = orderTimelineSettings.shippingZones.some(
      (item) => item.id !== editingShippingZoneId && item.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (alreadyExists) {
      Alert.alert('Duplicate', 'This shipping zone already exists.');
      return;
    }
    const shippingFeeValue = Number.parseFloat(newShippingZoneFee.replace(/,/g, ''));
    const shippingFee = Number.isFinite(shippingFeeValue) && shippingFeeValue >= 0 ? shippingFeeValue : 0;
    const result = await saveTimelineSettings(
      editingShippingZoneId
        ? {
            ...orderTimelineSettings,
            shippingZones: orderTimelineSettings.shippingZones.map((item) => (
              item.id === editingShippingZoneId
                ? {
                    ...item,
                    name,
                    states: newShippingZoneSelectedStates,
                    shippingFee,
                  }
                : item
            )),
          }
        : {
            ...orderTimelineSettings,
            shippingZones: [
              ...orderTimelineSettings.shippingZones,
              {
                id: `shipping-zone-${Date.now().toString(36)}`,
                name,
                states: newShippingZoneSelectedStates,
                shippingFee,
                minBusinessDays: 1,
                maxBusinessDays: 3,
              },
            ],
          }
    );
    if (!result.success) return;
    setEditingShippingZoneId(null);
    setNewShippingZoneName('');
    setNewShippingZoneSelectedStates([]);
    setNewShippingZoneFee('0');
    setNewShippingZoneStateSearch('');
    setShowShippingZoneModal(false);
  };

  const handleDeleteOrderTimeline = (timelineId: string) => {
    saveTimelineSettings({
      ...orderTimelineSettings,
      orderTypes: orderTimelineSettings.orderTypes.filter((entry) => entry.id !== timelineId),
    });
    setOrderTimelineMenu(null);
  };

  const handleDeleteOrderStatus = (statusId: string) => {
    const status = orderStatuses.find((entry) => entry.id === statusId);
    if (!status) return;
    setOrderStatusMenu(null);
    openDeleteSetting('order-statuses', status);
  };

  const handleEditOrderStatus = (statusId: string) => {
    setOrderStatusMenu(null);
    setTimeout(() => {
      openEditOrderStatusModal(statusId);
    }, 0);
  };

  const handleEditOrderTimeline = (timelineId: string) => {
    setOrderTimelineMenu(null);
    setTimeout(() => {
      openEditOrderTimelineModal(timelineId);
    }, 0);
  };

  const handleDeleteShippingZone = (zoneId: string) => {
    saveTimelineSettings({
      ...orderTimelineSettings,
      defaultOrderType: orderTimelineSettings.defaultOrderType.shippingZoneId === zoneId
        ? { ...orderTimelineSettings.defaultOrderType, shippingZoneId: null }
        : orderTimelineSettings.defaultOrderType,
      orderTypes: orderTimelineSettings.orderTypes.map((entry) => (
        entry.shippingZoneId === zoneId
          ? { ...entry, shippingZoneId: null }
          : entry
      )),
      shippingZones: orderTimelineSettings.shippingZones.filter((entry) => entry.id !== zoneId),
    });
    setShippingZoneMenu(null);
  };

  const handleEditShippingZone = (zoneId: string) => {
    setShippingZoneMenu(null);
    setTimeout(() => {
      openEditShippingZoneModal(zoneId);
    }, 0);
  };

  const toggleNewShippingZoneState = (stateName: string) => {
    setNewShippingZoneSelectedStates((current) => (
      current.includes(stateName)
        ? current.filter((entry) => entry !== stateName)
        : [...current, stateName]
    ));
  };

  const selectAllNewShippingZoneStates = () => {
    setNewShippingZoneSelectedStates([...NIGERIAN_STATES]);
  };

  const clearAllNewShippingZoneStates = () => {
    setNewShippingZoneSelectedStates([]);
  };

  const toggleShippingZoneState = (zoneId: string, stateName: string) => {
    saveTimelineSettings({
      ...orderTimelineSettings,
      shippingZones: orderTimelineSettings.shippingZones.map((zone) => {
        if (zone.id !== zoneId) return zone;
        const hasState = zone.states.includes(stateName);
        return {
          ...zone,
          states: hasState
            ? zone.states.filter((entry) => entry !== stateName)
            : [...zone.states, stateName],
        };
      }),
    });
    setShippingZoneStateSearch((current) => ({ ...current, [zoneId]: '' }));
  };

  const removeShippingZoneState = (zoneId: string, stateName: string) => {
    saveTimelineSettings({
      ...orderTimelineSettings,
      shippingZones: orderTimelineSettings.shippingZones.map((zone) => (
        zone.id === zoneId
          ? { ...zone, states: zone.states.filter((entry) => entry !== stateName) }
          : zone
      )),
    });
  };

  const setShippingZoneFee = (zoneId: string, nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(/,/g, ''));
    saveTimelineSettings({
      ...orderTimelineSettings,
      shippingZones: orderTimelineSettings.shippingZones.map((zone) => {
        if (zone.id !== zoneId) return zone;
        return {
          ...zone,
          shippingFee: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
        };
      }),
    });
  };

  const getAvailableStateMatches = (query: string, selectedStates: string[]) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return NIGERIAN_STATES
      .filter((stateName) => stateName.toLowerCase().includes(normalized))
      .sort((left, right) => {
        const leftSelected = selectedStates.includes(left) ? 1 : 0;
        const rightSelected = selectedStates.includes(right) ? 1 : 0;
        if (leftSelected !== rightSelected) return rightSelected - leftSelected;
        return left.localeCompare(right);
      })
      .slice(0, 8);
  };

  const handleSaveLowStock = () => {
    const parsed = parseInt(tempThreshold, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setGlobalLowStockThreshold(parsed);
      triggerGlobalSave();
    } else {
      setTempThreshold(globalLowStockThreshold.toString());
    }
    setShowLowStockModal(false);
  };

  const handleRefreshApp = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    Alert.alert('Refresh App', 'Close the app and reopen it to refresh on iPhone.');
  };

  const teamMembers = useAuthStore((s) => s.teamMembers);
  const logout = useAuthStore((s) => s.logout);
  const [activeWebInlinePanel, setActiveWebInlinePanel] = useState<WebInlineSettingsPanel | null>(null);
  const [activeMobileInlinePanel, setActiveMobileInlinePanel] = useState<WebInlineSettingsPanel | null>(null);
  const closeWebInlinePanel = () => {
    setActiveWebInlinePanel(null);
    if (Platform.OS === 'web') {
      router.replace({ pathname: '/settings', params: normalizedMenuParam ? { menu: normalizedMenuParam } : undefined });
    }
  };
  const openSettingsPanel = (panel: string, nativeRoute: string | { pathname: string; params?: Record<string, string> }) => {
    const decodeParam = (raw: string) => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    const webRouteParams: Record<string, string> = { panel, from: 'settings' };

    if (typeof nativeRoute === 'string') {
      const query = nativeRoute.split('?')[1];
      if (query) {
        query
          .split('&')
          .filter(Boolean)
          .forEach((pair) => {
            const [rawKey, rawValue = ''] = pair.split('=');
            if (!rawKey) return;
            const key = decodeParam(rawKey);
            const value = decodeParam(rawValue);
            if (key.length > 0 && value.length > 0) {
              webRouteParams[key] = value;
            }
          });
      }
    } else if (nativeRoute?.params) {
      Object.entries(nativeRoute.params).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim().length > 0) {
          webRouteParams[key] = value;
        }
      });
    }

    if (isWebDesktop) {
      setActiveWebInlinePanel(panel as WebInlineSettingsPanel);
      router.push({ pathname: '/settings', params: webRouteParams });
      return;
    }

    if (panel === 'payment-accounts') {
      setSearchQuery('');
      setActiveMobileInlinePanel('payment-accounts');
      return;
    }

    if (Platform.OS === 'web') {
      router.push({ pathname: '/settings-panel', params: webRouteParams });
      return;
    }
    router.push(nativeRoute as never);
  };

  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [activeWebSettingsMenu, setActiveWebSettingsMenu] = useState<WebSettingsMenuKey>('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemColor, setNewItemColor] = useState('#3B82F6');
  const [newItemTrackingStage, setNewItemTrackingStage] = useState<OrderTrackingStage>('received');
  const [newItemWooStatusSlug, setNewItemWooStatusSlug] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
  const [showOrderTimelineModal, setShowOrderTimelineModal] = useState(false);
  const [showShippingZoneModal, setShowShippingZoneModal] = useState(false);
  const [editingOrderStatusId, setEditingOrderStatusId] = useState<string | null>(null);
  const [editingOrderTimelineId, setEditingOrderTimelineId] = useState<string | null>(null);
  const [editingShippingZoneId, setEditingShippingZoneId] = useState<string | null>(null);
  const [orderStatusMenu, setOrderStatusMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [orderTimelineMenu, setOrderTimelineMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [shippingZoneMenu, setShippingZoneMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [newOrderTypeName, setNewOrderTypeName] = useState('');
  const [newOrderTypeMinDays, setNewOrderTypeMinDays] = useState('3');
  const [newOrderTypeMaxDays, setNewOrderTypeMaxDays] = useState('7');
  const [newOrderTypeShippingZoneId, setNewOrderTypeShippingZoneId] = useState<string | null>(null);
  const [newOrderTypeWorkflowStatusIds, setNewOrderTypeWorkflowStatusIds] = useState<string[]>([]);
  const [defaultOrderTypeMinDays, setDefaultOrderTypeMinDays] = useState(String(orderTimelineSettings.defaultOrderType.minBusinessDays));
  const [defaultOrderTypeMaxDays, setDefaultOrderTypeMaxDays] = useState(String(orderTimelineSettings.defaultOrderType.maxBusinessDays));
  const [defaultOrderTimelineThreshold, setDefaultOrderTimelineThreshold] = useState(String(orderTimelineSettings.warningThresholdPercent));
  const [newShippingZoneName, setNewShippingZoneName] = useState('');
  const [newShippingZoneSelectedStates, setNewShippingZoneSelectedStates] = useState<string[]>([]);
  const [newShippingZoneStateSearch, setNewShippingZoneStateSearch] = useState('');
  const [shippingZoneStateSearch, setShippingZoneStateSearch] = useState<Record<string, string>>({});
  const [newShippingZoneFee, setNewShippingZoneFee] = useState('0');
  const mainMenuScrollYRef = useRef(settingsMainScrollYMemory);
  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;
  const settingsMainContentWrapStyle = ({ flex: 1 } as const);
  const settingsSectionContentWrapStyle = (
    isWebDesktop
      ? ({ flex: 1, width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } as const)
      : ({ flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18 } as const)
  );
  const settingsSectionHeaderWrapStyle = (
    isWebDesktop
      ? settingsSectionContentWrapStyle
      : ({ flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' } as const)
  );
  const standardTrackingUrl = useMemo(() => {
    return buildCustomerTrackingHostUrl({
      businessName,
      businessSlug,
      trackingCode: 'TRACKING-CODE',
      email: null,
    }).replace(/\/TRACKING-CODE$/, '');
  }, [businessName, businessSlug]);
  const publicBusinessSlug = useMemo(() => slugifyBusinessName(businessSlug || businessName || ''), [businessName, businessSlug]);
  const publicLinks = useMemo(() => {
    const baseBusinessPath = publicBusinessSlug ? `/${publicBusinessSlug}` : '';
    return [
      {
        key: 'return',
        title: 'Return Request',
        description: buildStartReturnHostUrl({
          businessName,
          businessSlug,
        }),
      },
      {
        key: 'delivery-confirmation',
        title: 'Delivery Confirmation',
        description: buildDeliveryConfirmationHostUrl({
          businessName,
          businessSlug,
        }),
      },
      {
        key: 'order-tracking',
        title: 'Order Tracking',
        description: `${FYLL_TRACKING_ORIGIN}${baseBusinessPath}`,
      },
    ];
  }, [businessName, businessSlug, publicBusinessSlug]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2200);
  };

  const copyStandardTrackingUrl = async () => {
    if (!standardTrackingUrl) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(standardTrackingUrl);
      } else {
        await Clipboard.setStringAsync(standardTrackingUrl);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast('Tracking link copied.');
    } catch (error) {
      console.warn('Failed to copy standard tracking URL:', error);
      showToast('Could not copy tracking link.');
    }
  };

  const copyPublicLink = async (url: string, label: string) => {
    if (!url) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        await Clipboard.setStringAsync(url);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast(`${label} link copied.`);
    } catch (error) {
      console.warn(`Failed to copy ${label} link:`, error);
      showToast(`Could not copy ${label.toLowerCase()} link.`);
    }
  };

  const copyBusinessId = async () => {
    if (!businessId) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(businessId);
      } else {
        await Clipboard.setStringAsync(businessId);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast('Business ID copied.');
    } catch (error) {
      console.warn('Failed to copy business ID:', error);
      showToast('Could not copy business ID.');
    }
  };

  const renderToastOverlay = () => (
    toastMessage ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: isWebDesktop ? 28 : 18,
          alignItems: 'center',
          zIndex: 9999,
          elevation: 9999,
        }}
      >
        <View
          style={{
            maxWidth: 320,
            borderRadius: 999,
            backgroundColor: '#111111',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
            {toastMessage}
          </Text>
        </View>
      </View>
    ) : null
  );

  const openSettingsSection = (section: SettingsSection) => {
    setActiveSection(section);
    if (Platform.OS === 'web') {
      if (isDesktop) {
        setActiveWebInlinePanel(null);
        setActiveWebSettingsMenu(SETTINGS_SECTION_MENU_MAP[section]);
      }
      router.replace({ pathname: '/settings', params: { section } });
    }
  };

  const colorOptions = [
    '#EF4444',
    '#F97316',
    '#F59E0B',
    '#EAB308',
    '#84CC16',
    '#22C55E',
    '#14B8A6',
    '#06B6D4',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#F43F5E',
    '#6B7280',
  ];

  useEffect(() => {
    if (!canUseCases && (normalizedSectionParam === 'case-statuses' || normalizedSectionParam === 'resolution-types')) {
      setActiveSection(null);
      router.replace({ pathname: '/settings' });
      return;
    }
    if (normalizedSectionParam) {
      if (normalizedSectionParam !== activeSection) {
        setActiveSection(normalizedSectionParam);
      }
      if (Platform.OS === 'web' && sectionParam && sectionParam !== normalizedSectionParam) {
        router.replace({ pathname: '/settings', params: { section: normalizedSectionParam } });
      }
      return;
    }

    if (!sectionParam && activeSection !== null) {
      setActiveSection(null);
    }
  }, [canUseCases, sectionParam, normalizedSectionParam, activeSection, router]);

  useEffect(() => {
    if (!canUseCases && normalizedMenuParam === 'cases') {
      setActiveWebSettingsMenu('profile');
      router.replace({ pathname: '/settings', params: { menu: 'profile' } });
      return;
    }
    if (!normalizedMenuParam || activeSection) return;
    if (normalizedMenuParam !== activeWebSettingsMenu) {
      setActiveWebInlinePanel(null);
      setActiveWebSettingsMenu(normalizedMenuParam);
    }
  }, [activeSection, activeWebSettingsMenu, canUseCases, normalizedMenuParam, router]);

  useEffect(() => {
    if (!isWebDesktop) return;
    if (normalizedPanelParam) {
      if (normalizedPanelParam !== activeWebInlinePanel) {
        setActiveWebInlinePanel(normalizedPanelParam);
      }
      if (normalizedMenuParam && normalizedMenuParam !== activeWebSettingsMenu) {
        setActiveWebSettingsMenu(normalizedMenuParam);
      }
      return;
    }

    if (!panelParam && activeWebInlinePanel !== null) {
      setActiveWebInlinePanel(null);
    }
  }, [activeWebInlinePanel, activeWebSettingsMenu, isWebDesktop, normalizedMenuParam, normalizedPanelParam, panelParam]);

  useEffect(() => {
    setDefaultOrderTypeMinDays(String(orderTimelineSettings.defaultOrderType.minBusinessDays));
    setDefaultOrderTypeMaxDays(String(orderTimelineSettings.defaultOrderType.maxBusinessDays));
    setDefaultOrderTimelineThreshold(String(orderTimelineSettings.warningThresholdPercent));
  }, [
    orderTimelineSettings.defaultOrderType.minBusinessDays,
    orderTimelineSettings.defaultOrderType.maxBusinessDays,
    orderTimelineSettings.warningThresholdPercent,
  ]);

  const shippingZoneNameById = useMemo(
    () => new Map(orderTimelineSettings.shippingZones.map((zone) => [zone.id, zone.name])),
    [orderTimelineSettings.shippingZones]
  );
  useEffect(() => (
    () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    }
  ), []);

  const handleBackFromSection = () => {
    setActiveSection(null);
    if (Platform.OS === 'web') {
      router.replace('/settings');
      return;
    }
  };

  useEffect(() => {
    if (activeSection !== 'order-statuses') {
      if (showOrderStatusModal) setShowOrderStatusModal(false);
      if (editingOrderStatusId !== null) setEditingOrderStatusId(null);
      if (orderStatusMenu !== null) setOrderStatusMenu(null);
    }
    if (activeSection !== 'order-timelines') {
      if (showOrderTimelineModal) setShowOrderTimelineModal(false);
      if (editingOrderTimelineId !== null) setEditingOrderTimelineId(null);
      if (orderTimelineMenu !== null) setOrderTimelineMenu(null);
    }
    if (activeSection !== 'shipping-zones') {
      if (showShippingZoneModal) setShowShippingZoneModal(false);
      if (editingShippingZoneId !== null) setEditingShippingZoneId(null);
      if (shippingZoneMenu !== null) setShippingZoneMenu(null);
    }
  }, [
    activeSection,
    showOrderStatusModal,
    editingOrderStatusId,
    orderStatusMenu,
    showOrderTimelineModal,
    editingOrderTimelineId,
    orderTimelineMenu,
    showShippingZoneModal,
    editingShippingZoneId,
    shippingZoneMenu,
  ]);

  const handleLogout = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      // Haptics might fail, continue anyway
    }

    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Force navigate even if logout fails
      router.replace('/login');
    }
  };

  const handleAddItem = () => {
    const trimmedName = newItemName.trim();
    if (!trimmedName) return;

    const nameExists = (items: { name: string }[]) =>
      items.some((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase());

    const id = Math.random().toString(36).substring(2, 15);
    let didAdd = false;

      switch (activeSection) {
        case 'order-statuses':
          if (nameExists(orderStatuses)) {
            Alert.alert('Duplicate', 'This status already exists.');
            return;
          }
        addOrderStatus({
          id,
          name: newItemName.trim(),
            color: newItemColor,
            order: orderStatuses.length + 1,
            trackingStage: newItemTrackingStage,
            wooCommerceStatusSlug: newItemWooStatusSlug.trim() || undefined,
          });
          didAdd = true;
          break;
        case 'quality-control-checks':
          if (qcChecklistRequirements.some((item) => item.label.trim().toLowerCase() === trimmedName.toLowerCase())) {
            Alert.alert('Duplicate', 'This quality control check already exists.');
            return;
          }
          addQcChecklistRequirement(trimmedName);
          didAdd = true;
          break;
        case 'case-statuses':
          if (nameExists(caseStatuses)) {
            Alert.alert('Duplicate', 'This case status already exists.');
            return;
          }
          addCaseStatus({
            id,
            name: newItemName.trim(),
            color: newItemColor,
            description: newItemDescription.trim(),
            order: caseStatuses.length + 1,
          });
          didAdd = true;
          setNewItemDescription('');
          break;
        case 'sale-sources':
        if (nameExists(saleSources)) {
          Alert.alert('Duplicate', 'This sale source already exists.');
          return;
        }
        addSaleSource({ id, name: newItemName.trim(), icon: 'circle' });
        didAdd = true;
        break;
      case 'custom-services':
        if (nameExists(customServices)) {
          Alert.alert('Duplicate', 'This add-on already exists.');
          return;
        }
        addCustomService({ id, name: newItemName.trim(), defaultPrice: parseFloat(newItemPrice) || 0 });
        didAdd = true;
        break;
      case 'payment-methods':
        if (nameExists(paymentMethods)) {
          Alert.alert('Duplicate', 'This payment method already exists.');
          return;
        }
        addPaymentMethod({ id, name: newItemName.trim() });
        didAdd = true;
        break;
      case 'logistics-carriers':
        if (nameExists(logisticsCarriers)) {
          Alert.alert('Duplicate', 'This logistics carrier already exists.');
          return;
        }
        addLogisticsCarrier({ id, name: newItemName.trim() });
        didAdd = true;
        break;
      case 'resolution-types':
        if (nameExists(resolutionTypes)) {
          Alert.alert('Duplicate', 'This resolution type already exists.');
          return;
        }
        addResolutionType({
          id,
          name: newItemName.trim(),
          description: newItemDescription.trim(),
          order: resolutionTypes.length + 1,
        });
        didAdd = true;
        setNewItemDescription('');
        break;
    }

    if (!didAdd) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    triggerGlobalSave();
    setNewItemName('');
    setNewItemColor('#3B82F6');
    setNewItemTrackingStage('received');
    setNewItemWooStatusSlug('');
    setNewItemPrice('');
    if (activeSection === 'order-statuses') {
      setShowAddOrderStatusForm(false);
    }
  };

  const formatDeletedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDeletedItemTypeLabel = (item: DeletedItem) => {
    switch (item.entityType) {
      case 'expense-request':
        return 'Expense request';
      case 'refund-request':
        return 'Refund request';
      case 'procurement-item':
        return 'Procurement line';
      default:
        return item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1);
    }
  };

  const filteredRecycleBin = useMemo(() => {
    const query = recycleBinSearchQuery.trim().toLowerCase();
    if (!query) return recycleBin;
    return recycleBin.filter((item) => {
      const haystack = [
        item.label,
        item.entityType,
        getDeletedItemTypeLabel(item),
        item.parentLabel,
        formatDeletedAt(item.deletedAt),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [recycleBin, recycleBinSearchQuery]);

  const handleCopyRecentlyRestoredItem = async (item: DeletedItem) => {
    await Clipboard.setStringAsync(item.label);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRestoreDeletedItem = async (item: DeletedItem) => {
    setRestoringDeletedItemId(item.id);
    try {
      await restoreDeletedItem(item.id, businessId);
      setRecentlyRestoredItems((current) => [
        { ...item, restoredAt: new Date().toISOString() },
        ...current.filter((restoredItem) => restoredItem.id !== item.id),
      ].slice(0, 5));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('Restore deleted item failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Restore failed', 'Could not restore this item. Please try again.');
    } finally {
      setRestoringDeletedItemId(null);
    }
  };

  const renderSectionContent = () => {
      switch (activeSection) {
        case 'recycle-bin':
          return (
            <View className="pt-1">
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Recycle Bin</Text>
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: colors.bg.secondary }}>
                    <Text style={{ color: colors.text.tertiary }} className="text-[11px] font-semibold">
                      {filteredRecycleBin.length}/{recycleBin.length}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                  Deleted orders, products, procurement rows, finance records, customers, and cases are kept here so you can restore them.
                </Text>
                <View
                  className="rounded-full flex-row items-center px-3 mt-4"
                  style={{ height: 42, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <Search size={15} color={colors.text.tertiary} strokeWidth={2.2} />
                  <TextInput
                    placeholder="Search deleted items"
                    placeholderTextColor={colors.input.placeholder}
                    value={recycleBinSearchQuery}
                    onChangeText={setRecycleBinSearchQuery}
                    style={{ color: colors.input.text, fontSize: 14, flex: 1, marginLeft: 8 }}
                    selectionColor={colors.text.primary}
                  />
                  <SearchClearButton visible={Boolean(recycleBinSearchQuery.trim())} onPress={() => setRecycleBinSearchQuery('')} />
                  {recycleBinSearchQuery ? (
                    <Pressable onPress={() => setRecycleBinSearchQuery('')} className="w-7 h-7 rounded-full items-center justify-center active:opacity-70" style={{ backgroundColor: colors.bg.secondary }}>
                      <X size={13} color={colors.text.tertiary} strokeWidth={2.3} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {recentlyRestoredItems.length > 0 ? (
                <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                  <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Recently restored</Text>
                    <Text style={{ color: colors.text.muted }} className="text-[11px]">{recentlyRestoredItems.length}</Text>
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Tap a chip to copy its name, then search for it in the relevant page if you need to delete it again.
                  </Text>
                  <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                    {recentlyRestoredItems.map((item) => (
                      <Pressable
                        key={`restored-${item.id}`}
                        onPress={() => void handleCopyRecentlyRestoredItem(item)}
                        className="rounded-full flex-row items-center active:opacity-75"
                        style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 10, paddingVertical: 7, gap: 6 }}
                      >
                        <RotateCcw size={12} color="#059669" strokeWidth={2.2} />
                        <Text style={{ color: colors.text.primary }} className="text-xs font-semibold" numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={{ color: colors.text.muted }} className="text-[10px]" numberOfLines={1}>
                          {getDeletedItemTypeLabel(item)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {recycleBin.length === 0 ? (
                <View className="rounded-xl p-5 items-center" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                  <Trash2 size={24} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold mt-3">Nothing deleted</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs text-center mt-1">
                    Deleted items will appear here before they are permanently removed.
                  </Text>
                </View>
              ) : filteredRecycleBin.length === 0 ? (
                <View className="rounded-xl p-5 items-center" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                  <Search size={24} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold mt-3">No deleted items found</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs text-center mt-1">
                    Try another item name, type, or parent reference.
                  </Text>
                </View>
              ) : (
                filteredRecycleBin.map((item) => {
                  const isRestoring = restoringDeletedItemId === item.id;
                  return (
                    <View key={item.id} className="rounded-xl p-4 mb-2" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">{item.label}</Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-[11px] mt-0.5">
                            {getDeletedItemTypeLabel(item)} · Deleted {formatDeletedAt(item.deletedAt)}
                          </Text>
                          {item.parentLabel ? (
                            <Text style={{ color: colors.text.muted }} className="text-[11px] mt-0.5">
                              From {item.parentLabel}
                            </Text>
                          ) : null}
                        </View>
                        <View className="flex-row items-center gap-2 ml-2">
                          <Pressable
                            onPress={() => handleRestoreDeletedItem(item)}
                            disabled={isRestoring}
                            className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                            style={{ backgroundColor: '#22C55E', opacity: isRestoring ? 0.6 : 1 }}
                          >
                            <RotateCcw size={14} color="#FFFFFF" strokeWidth={2.5} />
                          </Pressable>
                          <Pressable
                            onPress={() => { setConfirmDeleteText(''); setConfirmDeleteItem(item); }}
                            className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                            style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                          >
                            <Trash2 size={13} color={colors.text.tertiary} strokeWidth={2} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
              <Modal
                visible={confirmDeleteItem !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setConfirmDeleteItem(null)}
              >
                <Pressable
                  onPress={() => setConfirmDeleteItem(null)}
                  style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                >
                  <Pressable
                    onPress={(event) => event.stopPropagation()}
                    style={{ width: '100%', maxWidth: 380, borderRadius: 18, padding: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, gap: 12 }}
                  >
                    <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: colors.bg.secondary }}>
                      <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                    </View>
                    <Text style={{ color: colors.text.primary }} className="font-bold text-base">Delete forever?</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      "{confirmDeleteItem?.label}" will be permanently removed and can never be restored. This is different from the recycle bin — there is no undo.
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                      Type <Text style={{ color: colors.text.primary, fontWeight: '700' }}>DELETE</Text> to confirm.
                    </Text>
                    <TextInput
                      value={confirmDeleteText}
                      onChangeText={setConfirmDeleteText}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder="DELETE"
                      placeholderTextColor={colors.text.tertiary}
                      className="rounded-lg px-3"
                      style={{ height: 44, borderWidth: 1, borderColor: colors.border.light, color: colors.text.primary, backgroundColor: colors.bg.secondary }}
                    />
                    <View className="flex-row gap-2 mt-1">
                      <Pressable
                        onPress={() => setConfirmDeleteItem(null)}
                        className="flex-1 rounded-full items-center justify-center active:opacity-70"
                        style={{ height: 42, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Cancel</Text>
                      </Pressable>
                      <Pressable
                        disabled={confirmDeleteText.trim().toUpperCase() !== 'DELETE'}
                        onPress={() => {
                          if (!confirmDeleteItem) return;
                          void permanentlyDeleteRecycleBinItem(confirmDeleteItem.id, businessId);
                          setConfirmDeleteItem(null);
                        }}
                        className="flex-1 rounded-full items-center justify-center active:opacity-80"
                        style={{ height: 42, backgroundColor: '#EF4444', opacity: confirmDeleteText.trim().toUpperCase() === 'DELETE' ? 1 : 0.4 }}
                      >
                        <Text style={{ color: '#FFFFFF' }} className="font-semibold text-sm">Delete forever</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>
            </View>
          );
      case 'order-statuses':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Pressable
                onPress={() => setShowAddOrderStatusForm((value) => !value)}
                className="flex-row items-center active:opacity-80"
                style={{ minHeight: 38, gap: 12 }}
              >
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                  <Plus size={16} color={colors.text.primary} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Add New Status</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Create another step in this fulfillment flow.
                  </Text>
                </View>
                {showAddOrderStatusForm ? (
                  <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={2.2} />
                ) : (
                  <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.2} />
                )}
              </Pressable>

              {showAddOrderStatusForm ? (
                <View className="mt-4">
                  <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                    <TextInput
                      placeholder="Status name"
                      placeholderTextColor={colors.input.placeholder}
                      value={newItemName}
                      onChangeText={setNewItemName}
                      style={{ color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                  <View className="mb-3" style={{ gap: 8 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Customer tracking stage</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      {ORDER_TRACKING_STAGE_OPTIONS.map((option) => {
                        const selected = newItemTrackingStage === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setNewItemTrackingStage(option.value);
                            }}
                            className="rounded-full px-3 items-center justify-center active:opacity-80"
                            style={{
                              minHeight: 34,
                              borderWidth: 1,
                              borderColor: selected ? colors.text.primary : colors.border.light,
                              backgroundColor: selected ? colors.bg.secondary : colors.bg.card,
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: selected ? '600' : '500' }}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                    <TextInput
                      placeholder="WooCommerce status slug (optional)"
                      placeholderTextColor={colors.input.placeholder}
                      value={newItemWooStatusSlug}
                      onChangeText={setNewItemWooStatusSlug}
                      style={{ color: colors.input.text, fontSize: 14 }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                  <View className="flex-row flex-wrap gap-2 mb-3">
                    {colorOptions.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setNewItemColor(color);
                        }}
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: color,
                          borderWidth: newItemColor === color ? 2 : 0,
                          borderColor: colors.border.light,
                        }}
                      >
                        {newItemColor === color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={handleAddItem}
                    className="rounded-full items-center active:opacity-80"
                    style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
                  >
                    <Text style={primaryPillTextStyle} className="font-semibold">Add Status</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View className="mb-3">
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Fulfillment Flow</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                Move progress statuses into the order your business processes an order.
              </Text>
            </View>

            {fulfillmentOrderStatuses.map((status, index) => (
              <View key={status.id} style={{ marginBottom: 10 }}>
                <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
                  <View
                    className="rounded-full items-center justify-center"
                    style={{ minWidth: 28, height: 28, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-xs font-bold">
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="flex-1 text-xs font-semibold">
                    Step {index + 1}
                  </Text>
                  <Pressable
                    onPress={() => handleMoveOrderStatus(status.id, -1)}
                    disabled={index === 0}
                    className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, opacity: index === 0 ? 0.35 : 1 }}
                  >
                    <ChevronUp size={17} color={colors.text.primary} strokeWidth={2.2} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleMoveOrderStatus(status.id, 1)}
                    disabled={index === fulfillmentOrderStatuses.length - 1}
                    className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, opacity: index === fulfillmentOrderStatuses.length - 1 ? 0.35 : 1 }}
                  >
                    <ChevronDown size={17} color={colors.text.primary} strokeWidth={2.2} />
                  </Pressable>
                </View>
                <EditableItem
                  item={status}
                  showColor
                  showTrackingStage
                  showWooCommerceStatusSlug
                  onUpdate={(name, color, _, __, trackingStage, wooCommerceStatusSlug) => {
                    updateOrderStatus(status.id, { name, color, trackingStage, wooCommerceStatusSlug });
                    triggerGlobalSave();
                  }}
                  onDelete={() => {
                    openDeleteSetting('order-statuses', status);
                  }}
                />
              </View>
            ))}

            {exceptionOrderStatuses.length > 0 ? (
              <View className="mt-4">
                <View className="mb-3">
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Exception Statuses</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Used when an order leaves the normal fulfillment flow.
                  </Text>
                </View>

                {exceptionOrderStatuses.map((status) => (
                  <View key={status.id} style={{ marginBottom: 10 }}>
                    <EditableItem
                      item={status}
                      showColor
                      showTrackingStage
                      showWooCommerceStatusSlug
                      onUpdate={(name, color, _, __, trackingStage, wooCommerceStatusSlug) => {
                        updateOrderStatus(status.id, { name, color, trackingStage, wooCommerceStatusSlug });
                        triggerGlobalSave();
                      }}
                      onDelete={() => {
                        openDeleteSetting('order-statuses', status);
                      }}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );

      case 'quality-control-checks':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add Quality Control Check</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Check label"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                <Pressable
                  onPress={handleAddItem}
                  className="rounded-full items-center active:opacity-80"
                  style={[primaryPillButtonStyle, { height: 46, justifyContent: 'center', paddingHorizontal: 18 }]}
                >
                  <Text style={primaryPillTextStyle} className="font-semibold">Add Check</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    resetQcChecklistRequirements();
                    triggerGlobalSave();
                  }}
                  className="rounded-full flex-row items-center active:opacity-80"
                  style={{ height: 46, justifyContent: 'center', paddingHorizontal: 18, gap: 8, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <RotateCcw size={15} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold">Restore Defaults</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {qcChecklistRequirements.length === 0 ? (
                <View className="rounded-xl p-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">No checks configured</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Add checks for the dispatch proof your business needs.
                  </Text>
                </View>
              ) : qcChecklistRequirements.map((item) => (
                <View
                  key={item.key}
                  className="rounded-xl px-4 py-3 flex-row items-center"
                  style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, gap: 12 }}
                >
                  <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: colors.bg.secondary }}>
                    <Check size={16} color="#10B981" strokeWidth={2.4} />
                  </View>
                  <Text style={{ color: colors.text.primary }} className="flex-1 font-semibold text-sm">
                    {item.label}
                  </Text>
                  <Pressable
                    onPress={() => openDeleteSetting('quality-control-checks', { id: item.key, name: item.label })}
                    className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        );

      case 'case-statuses':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add Case Status</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Status name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemDescription}
                  onChangeText={setNewItemDescription}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {colorOptions.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setNewItemColor(color);
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: color,
                      borderWidth: newItemColor === color ? 2 : 0,
                      borderColor: colors.border.light,
                    }}
                  >
                    {newItemColor === color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Add Status</Text>
              </Pressable>
            </View>

            {caseStatuses.map((status) => (
              <EditableItem
                key={status.id}
                item={status}
                showColor
                showDescription
                onUpdate={(name, color, _, description) => {
                  updateCaseStatus(status.id, { name, color, description });
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('case-statuses', status);
                }}
              />
            ))}
          </View>
        );

      case 'sale-sources':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add New Source</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Source name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Add Source</Text>
              </Pressable>
            </View>

            {saleSources.map((source) => (
              <EditableItem
                key={source.id}
                item={source}
                onUpdate={(name) => {
                  updateSaleSource(source.id, { name });
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('sale-sources', source);
                }}
              />
            ))}
          </View>
        );

      case 'custom-services':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add New Add-on</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Add-on name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Default price (optional)"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemPrice}
                  onChangeText={setNewItemPrice}
                  keyboardType="numeric"
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={[primaryPillTextStyle, { fontSize: 12, fontWeight: '600' }]}>Add Add-on</Text>
              </Pressable>
            </View>

            {customServices.map((service) => (
              <EditableItem
                key={service.id}
                item={service}
                showPrice
                onUpdate={(name, _, defaultPrice) => {
                  updateCustomService(service.id, { name, defaultPrice });
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('custom-services', service);
                }}
              />
            ))}
          </View>
        );

      case 'order-timelines':
        return (
          <View className="pt-1">
            <View
              className="rounded-2xl p-5 mb-5"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', letterSpacing: 0.2 }}>
                Default Order Timeline
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 18, marginTop: 6 }}>
                Applies when an order type does not have a more specific timeline match. The due-soon threshold controls when ops starts seeing warning badges.
              </Text>

              <View className="flex-row mt-4" style={{ gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', marginBottom: 8 }}>
                    Min processing days
                  </Text>
                  <View
                    className="rounded-2xl px-4"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="3"
                      placeholderTextColor={colors.input.placeholder}
                      value={defaultOrderTypeMinDays}
                      onChangeText={setDefaultOrderTypeMinDays}
                      onEndEditing={commitDefaultOrderTimelineSettings}
                      keyboardType="numeric"
                      style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', marginBottom: 8 }}>
                    Max processing days
                  </Text>
                  <View
                    className="rounded-2xl px-4"
                    style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="7"
                      placeholderTextColor={colors.input.placeholder}
                      value={defaultOrderTypeMaxDays}
                      onChangeText={setDefaultOrderTypeMaxDays}
                      onEndEditing={commitDefaultOrderTimelineSettings}
                      keyboardType="numeric"
                      style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>
              </View>

              <View
                className="rounded-2xl px-4 py-4 mt-4"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }}>
                      Warning threshold
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400', marginTop: 6 }}>
                      Flag "Due soon" at {parseThresholdPercent(defaultOrderTimelineThreshold, orderTimelineSettings.warningThresholdPercent)}% of timeline
                    </Text>
                  </View>
                  <View
                    className="rounded-2xl px-4"
                    style={{ width: 96, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 46, justifyContent: 'center' }}
                  >
                    <TextInput
                      placeholder="80"
                      placeholderTextColor={colors.input.placeholder}
                      value={defaultOrderTimelineThreshold}
                      onChangeText={setDefaultOrderTimelineThreshold}
                      onEndEditing={commitDefaultOrderTimelineSettings}
                      keyboardType="numeric"
                      style={{ color: colors.input.text, fontSize: 15, fontWeight: '500', textAlign: 'center' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>
              </View>

              <View
                className="rounded-2xl px-4 py-4 mt-4"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }}>
                  Default expected window: {parseTimelineDays(defaultOrderTypeMinDays, orderTimelineSettings.defaultOrderType.minBusinessDays)}-{Math.max(
                    parseTimelineDays(defaultOrderTypeMinDays, orderTimelineSettings.defaultOrderType.minBusinessDays),
                    parseTimelineDays(defaultOrderTypeMaxDays, orderTimelineSettings.defaultOrderType.maxBusinessDays)
                  )} business days before shipping-zone delivery time is added.
                </Text>
              </View>
            </View>

            <View className="mb-4">
              <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18 }}>
                Set processing timelines by order type. Shipping-zone delivery days are added afterwards. Add a shipping zone only when that processing window should override the default all-zones version.
              </Text>
            </View>

            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                    Customer tracking page
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                    Share this general tracking page with customers so they can enter their tracking code and email.
                  </Text>
                </View>
                {standardTrackingUrl ? (
                  <Pressable
                    onPress={copyStandardTrackingUrl}
                    className="rounded-full items-center justify-center active:opacity-80"
                    style={[primaryPillButtonStyle, { minHeight: 38, paddingHorizontal: 16 }]}
                  >
                    <Text style={[primaryPillTextStyle, { fontSize: 12, fontWeight: '600' }]}>
                      Copy link
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                className="rounded-2xl px-4 py-3 mt-3"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text
                  selectable
                  style={{
                    color: standardTrackingUrl ? colors.text.primary : colors.text.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  }}
                >
                  {standardTrackingUrl || 'Tracking page link appears here on web/production.'}
                </Text>
              </View>
            </View>

            {!isWebDesktop ? (
              <Pressable
                onPress={openCreateOrderTimelineModal}
                className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4"
                style={[primaryPillButtonStyle, { height: 46, gap: 8 }]}
              >
                <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Type</Text>
              </Pressable>
            ) : null}

            {isWebDesktop ? (
              <View
                className="rounded-2xl overflow-hidden"
                style={{ borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    minHeight: 44,
                    alignItems: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                    backgroundColor: colors.bg.card,
                  }}
                >
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 2, paddingHorizontal: 20 }}>
                    Order Type
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.2, paddingHorizontal: 20 }}>
                    Shipping Zone
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 0.9, paddingHorizontal: 20 }}>
                    Min Proc.
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 0.9, paddingHorizontal: 20 }}>
                    Max Proc.
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', width: 92, paddingHorizontal: 20 }}>
                    Action
                  </Text>
                </View>

                {orderTimelineSettings.orderTypes.map((type, index) => (
                  <View
                    key={type.id}
                    style={{
                      flexDirection: 'row',
                      minHeight: 68,
                      alignItems: 'center',
                      borderBottomWidth: index < orderTimelineSettings.orderTypes.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                    }}
                  >
                    <View style={{ flex: 2, paddingHorizontal: 20, justifyContent: 'center' }}>
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                        {type.name}
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 4 }} numberOfLines={1}>
                        {(type.workflowStatusIds ?? [])
                          .map((statusId) => orderStatuses.find((status) => status.id === statusId)?.name)
                          .filter(Boolean)
                          .join(' -> ') || 'No workflow sequence'}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text.primary, flex: 1.2, fontSize: 12, fontWeight: '500', paddingHorizontal: 20 }}>
                      {type.shippingZoneId ? (shippingZoneNameById.get(type.shippingZoneId) ?? 'Unknown zone') : 'All zones'}
                    </Text>
                    <Text style={{ color: colors.text.primary, flex: 0.9, fontSize: 12, fontWeight: '500', paddingHorizontal: 20 }}>
                      {type.minBusinessDays}
                    </Text>
                    <Text style={{ color: colors.text.primary, flex: 0.9, fontSize: 12, fontWeight: '500', paddingHorizontal: 20 }}>
                      {type.maxBusinessDays}
                    </Text>
                    <View style={{ width: 92, alignItems: 'flex-end', paddingHorizontal: 20 }}>
                      <Pressable
                        onPress={(event) => openOrderTimelineMenu(type.id, event)}
                        className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <MoreVertical size={14} color={colors.text.secondary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View>
                {orderTimelineSettings.orderTypes.map((type) => (
                  <View
                    key={type.id}
                    className="rounded-xl p-4 mb-4"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                          {type.name}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 8 }}>
                          {type.shippingZoneId ? (shippingZoneNameById.get(type.shippingZoneId) ?? 'Unknown zone') : 'All zones'}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 6 }}>
                          {(type.workflowStatusIds ?? [])
                            .map((statusId) => orderStatuses.find((status) => status.id === statusId)?.name)
                            .filter(Boolean)
                            .join(' -> ') || 'No workflow sequence'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={(event) => openOrderTimelineMenu(type.id, event)}
                        className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <MoreVertical size={16} color={colors.text.secondary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );

      case 'shipping-zones':
        return (
          <View className="pt-1">
            <View className="mb-4">
              <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18 }}>
                Group states into delivery zones and set the shipping fee for each zone.
              </Text>
            </View>

            {!isWebDesktop ? (
              <Pressable
                onPress={openCreateShippingZoneModal}
                className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4"
                style={[primaryPillButtonStyle, { height: 46, gap: 8 }]}
              >
                <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Zone</Text>
              </Pressable>
            ) : null}

            {isWebDesktop ? (
              <View className="rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card }}>
                <View
                  style={{
                    flexDirection: 'row',
                    minHeight: 44,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                    backgroundColor: colors.bg.card,
                  }}
                >
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.25, paddingHorizontal: 20, alignSelf: 'center' }}>Zone</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 2.6, paddingHorizontal: 20, alignSelf: 'center' }}>States</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.05, paddingHorizontal: 20, alignSelf: 'center' }}>Fee</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', width: 92, paddingHorizontal: 20, alignSelf: 'center' }}>Action</Text>
                </View>

                {orderTimelineSettings.shippingZones.map((zone, index) => (
                  <View
                    key={zone.id}
                    style={{
                      borderBottomWidth: index < orderTimelineSettings.shippingZones.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        minHeight: 68,
                        paddingVertical: 12,
                      }}
                    >
                      <View style={{ flex: 1.25, paddingHorizontal: 20, justifyContent: 'center' }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{zone.name}</Text>
                      </View>
                      <View style={{ flex: 2.6, paddingHorizontal: 20, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {zone.states.length > 0 ? zone.states.map((stateName) => (
                            <View
                              key={`${zone.id}-selected-${stateName}`}
                              className="rounded-full"
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 5,
                                backgroundColor: colors.text.primary,
                                borderWidth: 1,
                                borderColor: colors.border.light,
                              }}
                            >
                              <Text style={{ color: colors.bg.primary, fontSize: 9, fontWeight: '500' }}>{stateName}</Text>
                            </View>
                          )) : (
                            <Text style={{ color: colors.text.muted, fontSize: 11 }}>Fallback zone</Text>
                          )}
                        </View>
                      </View>
                      <View style={{ flex: 1.05, paddingHorizontal: 20, justifyContent: 'center' }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                          {formatCurrency(zone.shippingFee ?? 0)}
                        </Text>
                      </View>
                      <View style={{ width: 92, alignItems: 'flex-end', paddingHorizontal: 20, justifyContent: 'center' }}>
                        <Pressable
                          onPress={(event) => openShippingZoneMenu(zone.id, event)}
                          className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <MoreVertical size={14} color={colors.text.secondary} strokeWidth={2} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View>
                {orderTimelineSettings.shippingZones.map((zone) => (
                  <View
                    key={zone.id}
                    className="rounded-xl p-4 mb-4"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                          {zone.name}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 8 }}>
                          {zone.states.length > 0 ? zone.states.join(', ') : 'Fallback zone'}
                        </Text>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', marginTop: 8 }}>
                          {formatCurrency(zone.shippingFee ?? 0)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={(event) => openShippingZoneMenu(zone.id, event)}
                        className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <MoreVertical size={16} color={colors.text.secondary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );

      case 'payment-methods':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add New Payment Method</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Payment method name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Add Payment Method</Text>
              </Pressable>
            </View>

            {paymentMethods.map((method) => (
              <EditableItem
                key={method.id}
                item={method}
                onUpdate={(name) => {
                  updatePaymentMethod(method.id, { name }, businessId);
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('payment-methods', method);
                }}
              />
            ))}

            {unmappedOrderPaymentMethods.length > 0 && paymentMethods.length > 0 ? (
              <View className="rounded-xl p-4 mt-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Order payment labels to clean up</Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1 mb-3">
                  These labels exist on saved orders but not in your current payment methods. Merge them into the correct method.
                </Text>

                {unmappedOrderPaymentMethods.map((legacyMethod) => (
                  <View
                    key={legacyMethod.name}
                    className="py-3"
                    style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}
                  >
                    <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>
                          {legacyMethod.name}
                        </Text>
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                          {legacyMethod.count} {legacyMethod.count === 1 ? 'order' : 'orders'}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                      {paymentMethods.map((method) => (
                        <Pressable
                          key={`${legacyMethod.name}-${method.id}`}
                          onPress={() => handleMergeOrderPaymentMethod(legacyMethod.name, method.name)}
                          className="rounded-full px-3 items-center justify-center active:opacity-80"
                          style={{ height: 34, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.input.bg }}
                        >
                          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">
                            Merge into {method.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );

      case 'logistics-carriers':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add New Carrier</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Carrier name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Add Carrier</Text>
              </Pressable>
            </View>

            {logisticsCarriers.map((carrier) => (
              <EditableItem
                key={carrier.id}
                item={carrier}
                onUpdate={(name) => {
                  updateLogisticsCarrier(carrier.id, { name });
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('logistics-carriers', carrier);
                }}
              />
            ))}
          </View>
        );

      case 'resolution-types':
        return (
          <View className="pt-1">
            <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-semibold text-sm mb-3">Add Resolution Type</Text>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Resolution type name"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View className="rounded-xl px-4 mb-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                <TextInput
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.input.placeholder}
                  value={newItemDescription}
                  onChangeText={setNewItemDescription}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Pressable
                onPress={handleAddItem}
                className="rounded-full items-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50, justifyContent: 'center' }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Add Resolution Type</Text>
              </Pressable>
            </View>

            {resolutionTypes.map((type) => (
              <EditableItem
                key={type.id}
                item={type}
                showDescription
                onUpdate={(name, _, __, description) => {
                  updateResolutionType(type.id, { name, description });
                  triggerGlobalSave();
                }}
                onDelete={() => {
                  openDeleteSetting('resolution-types', type);
                }}
              />
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  // All settings items for search
  const searchItems: { id: string; title: string; description?: string; icon: React.ReactNode; onPress?: () => void; rightText?: string }[] = [
    { id: 'switch-business', title: 'Switch Business', description: 'Add and open existing businesses', icon: <Building2 size={18} color="#10B981" />, onPress: () => router.push('/switch-business?from=settings') },
    ...(currentUser ? [
      { id: 'my-account', title: 'My Account', description: 'Profile and password', icon: <UserCircle size={18} color="#3B82F6" strokeWidth={2} />, onPress: () => openSettingsPanel('account-settings', '/account-settings?from=settings') },
    ] : []),
    { id: 'business-settings', title: 'Business Settings', description: 'Company name, business name, logo', icon: <Building2 size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('business-settings', '/business-settings?from=settings') },
    ...(canUseStorefront ? [
      { id: 'storefront-settings', title: 'Storefront', description: 'Public shop link and storefront publishing', icon: <Store size={18} color="#8B5CF6" strokeWidth={2} />, onPress: () => openSettingsPanel('storefront-settings', '/storefront-settings?from=settings&menu=integrations') },
    ] : []),
    ...(canUseWooCommerce ? [
      { id: 'woocommerce-settings', title: 'WooCommerce', description: 'Store URL and API keys', icon: <ShoppingCart size={18} color="#2563EB" strokeWidth={2} />, onPress: () => openSettingsPanel('woocommerce-settings', '/woocommerce-settings?from=settings') },
    ] : []),
    { id: 'recycle-bin', title: 'Recycle Bin', description: 'Restore deleted orders, products, and finance rows', icon: <Trash2 size={18} color="#EF4444" strokeWidth={2} />, rightText: `${recycleBin.length}`, onPress: () => openSettingsSection('recycle-bin') },
    ...(canUseAiImport ? [
      { id: 'import-ai', title: 'AI Import Assistant', description: 'Import orders, customers, products, and expenses', icon: <Sparkles size={18} color="#8B5CF6" strokeWidth={2} />, onPress: () => openSettingsPanel('import-ai', '/import-ai?from=settings') },
    ] : []),
    ...(currentUser?.role === 'admin' && canUseTeamMembers ? [
      { id: 'team-members', title: 'Team Members', description: 'Roles and permissions', icon: <Shield size={18} color="#EF4444" strokeWidth={2} />, rightText: `${teamMembers.length}`, onPress: () => openSettingsPanel('team', '/team?from=settings') },
      { id: 'invitations', title: 'Invitations', description: 'VIP access, invite limits, history', icon: <Shield size={18} color="#F59E0B" strokeWidth={2} />, onPress: () => openSettingsPanel('invitations', '/invitations?from=settings') },
    ] : []),
    ...(canUseTasks ? [
      { id: 'tasks', title: 'Tasks', description: 'Assign work, due dates, recurring ops', icon: <ListTodo size={18} color="#2563EB" strokeWidth={2} />, onPress: () => openSettingsPanel('tasks', '/tasks') },
    ] : []),
    ...(canUseFyllPrint ? [
      { id: 'fyll-print', title: 'Fyll Print', description: 'Queues and print history', icon: <Printer size={18} color="#111111" strokeWidth={2} />, onPress: () => router.push('/fyll-print' as never) },
    ] : []),
    ...(canUseDelivery ? [
      { id: 'delivery', title: 'Delivery', description: 'Dispatch, confirmations, and follow-ups', icon: <Truck size={18} color="#059669" strokeWidth={2} />, onPress: () => router.push('/(tabs)/deliveries' as never) },
    ] : []),
    ...(canUseReturns ? [
      { id: 'returns', title: 'Returns', description: 'Return cases and customer requests', icon: <RotateCcw size={18} color="#2563EB" strokeWidth={2} />, onPress: () => router.push('/returns' as never) },
    ] : []),
    { id: 'partners', title: 'Partners', description: 'Dispatch jobs to external partners and vendors', icon: <Building2 size={18} color="#111111" strokeWidth={2} />, onPress: () => router.push('/partners?partnerSection=jobs' as never) },
    ...(canUseAnnouncements ? [
      { id: 'announcements', title: 'Announcements', description: 'Send simple customer updates', icon: <Megaphone size={18} color="#111111" strokeWidth={2} />, onPress: () => router.push('/(tabs)/announcements' as never) },
    ] : []),
    ...publicLinks.map((link) => ({
      id: `public-link-${link.key}`,
      title: `${link.title} Link`,
      description: link.description,
      icon: <Link2 size={18} color="#2563EB" strokeWidth={2} />,
      onPress: () => copyPublicLink(link.description, link.title),
    })),
    { id: 'customer-list', title: 'Customer List', description: 'Contacts and history', icon: <Users size={18} color="#10B981" strokeWidth={2} />, rightText: `${customers.length}`, onPress: () => router.push('/customers' as never) },
    { id: 'import-customers', title: 'Import Customers', description: 'Upload contacts via CSV', icon: <Upload size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('import-customers', '/import-customers?from=settings') },
    { id: 'order-statuses', title: 'Order Statuses', description: 'Workflow stages', icon: <ShoppingCart size={18} color="#F59E0B" strokeWidth={2} />, rightText: `${orderStatuses.length}`, onPress: () => openSettingsSection('order-statuses') },
    { id: 'quality-control-checks', title: 'Quality Control Checks', description: 'Dispatch checklist requirements', icon: <ListTodo size={18} color="#10B981" strokeWidth={2} />, rightText: `${qcChecklistRequirements.length}`, onPress: () => openSettingsSection('quality-control-checks') },
    { id: 'order-timelines', title: 'Order Timelines', description: 'Order types and processing ETA rules', icon: <Clock3 size={18} color="#2563EB" strokeWidth={2} />, rightText: `${orderTimelineSettings.orderTypes.length}`, onPress: () => openSettingsSection('order-timelines') },
    { id: 'shipping-zones', title: 'Shipping Zones', description: 'Delivery zones by Nigerian state', icon: <Truck size={18} color="#F59E0B" strokeWidth={2} />, rightText: `${orderTimelineSettings.shippingZones.length}`, onPress: () => openSettingsSection('shipping-zones') },
    { id: 'sale-sources', title: 'Sale Sources', description: 'Where orders come from', icon: <Tag size={18} color="#059669" strokeWidth={2} />, rightText: `${saleSources.length}`, onPress: () => openSettingsSection('sale-sources') },
    { id: 'payment-methods', title: 'Payment Methods', description: 'Bank transfer, POS, website', icon: <CreditCard size={18} color="#3B82F6" strokeWidth={2} />, rightText: `${paymentMethods.length}`, onPress: () => openSettingsSection('payment-methods') },
    ...(canUseSocialCheckout ? [
      { id: 'payment-accounts', title: 'Bank Accounts', description: 'Shown on Social Checkout payment links', icon: <Landmark size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('payment-accounts', { pathname: '/payment-accounts', params: { from: 'settings' } }) },
    ] : []),
    ...(canUseOrderAutomation ? [
      { id: 'order-automation', title: 'Order Automation', description: 'Auto-complete stale orders', icon: <Zap size={18} color="#F59E0B" strokeWidth={2} />, onPress: () => openSettingsPanel('order-automation', '/order-automation?from=settings') },
    ] : []),
    { id: 'import-orders', title: 'Import Orders', description: 'Upload orders via CSV', icon: <Upload size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('import-orders', '/import-orders?from=settings') },
    ...(canViewInsights && currentUser?.role === 'admin' ? [
      { id: 'insights', title: 'Insights Dashboard', description: 'Sales, customers, and trends', icon: <BarChart3 size={18} color="#3B82F6" strokeWidth={2} />, onPress: () => router.push('/insights' as never) },
    ] : []),
    ...(canViewFinance ? [
      { id: 'finance', title: 'Finance', description: 'Overview, expenses, procurement, settings', icon: <TrendingUp size={18} color="#10B981" strokeWidth={2} />, onPress: () => router.push(financeSettingsRoute as never) },
    ] : []),
    { id: 'service-catalog', title: 'Service Catalog', description: 'All services and pricing', icon: <Wrench size={18} color={colors.text.secondary} strokeWidth={2} />, onPress: () => router.push('/services' as never) },
    { id: 'addons', title: 'Add-ons', description: 'Lens coating, express delivery', icon: <Wrench size={18} color="#8B5CF6" strokeWidth={2} />, rightText: `${customServices.length}`, onPress: () => openSettingsSection('custom-services') },
    ...(canUseCases ? [
      { id: 'all-cases', title: 'All Cases', description: 'View and manage cases', icon: <FileText size={18} color="#8B5CF6" strokeWidth={2} />, onPress: () => router.push('/cases' as never) },
      { id: 'case-statuses', title: 'Case Statuses', description: 'Customize workflow stages', icon: <FileText size={18} color="#F59E0B" strokeWidth={2} />, rightText: `${caseStatuses.length}`, onPress: () => openSettingsSection('case-statuses') },
      { id: 'resolution-types', title: 'Resolution Types', description: 'How cases are resolved', icon: <Check size={18} color="#10B981" strokeWidth={2} />, rightText: `${resolutionTypes.length}`, onPress: () => openSettingsSection('resolution-types') },
    ] : []),
    { id: 'logistics-carriers', title: 'Logistics Carriers', description: 'Delivery partners', icon: <Truck size={18} color="#F59E0B" strokeWidth={2} />, rightText: `${logisticsCarriers.length}`, onPress: () => openSettingsSection('logistics-carriers') },
    { id: 'low-stock-alert', title: 'Low Stock Alert', description: useGlobalLowStockThreshold ? `On · ${globalLowStockThreshold} units` : 'Off · Tap to configure', icon: <AlertTriangle size={18} color="#F59E0B" strokeWidth={2} />, onPress: () => { setTempThreshold(globalLowStockThreshold.toString()); setShowLowStockModal(true); } },
    { id: 'warehouse-settings', title: 'Warehouse Settings', description: 'Manage warehouse categories and units', icon: <Boxes size={18} color="#6366F1" strokeWidth={2} />, onPress: () => openSettingsPanel('warehouse-settings', '/warehouse-settings?from=settings&menu=inventory') },
    { id: 'categories', title: 'Categories', description: 'Product groups', icon: <Tag size={18} color="#3B82F6" strokeWidth={2} />, rightText: `${categories.length}`, onPress: () => openSettingsPanel('category-manager', '/category-manager?from=settings&menu=inventory') },
    { id: 'product-variables', title: 'Product Variables', description: 'Stock variants, SKUs, barcodes and prices', icon: <Package size={18} color="#A855F7" strokeWidth={2} />, rightText: `${productVariables.length}`, onPress: () => openSettingsPanel('product-variables', '/product-variables?from=settings') },
    { id: 'product-options', title: 'Product Options', description: 'Choices customers pick on item lines', icon: <Tag size={18} color="#16A34A" strokeWidth={2} />, rightText: `${productOptions.length}`, onPress: () => openSettingsPanel('product-options', '/product-options?from=settings') },
    { id: 'import-products', title: 'Import Products', description: 'Upload CSV', icon: <Upload size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('import-products', '/import-products?from=settings') },
    ...(currentUser ? [
      { id: 'log-out', title: 'Log Out', description: 'Sign out of your account', icon: <LogOut size={18} color={colors.text.tertiary} strokeWidth={2} />, onPress: handleLogout },
    ] : []),
  ];

  const filteredSearchItems = searchQuery.trim()
    ? searchItems.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const webSettingsMenuItems: {
    key: WebSettingsMenuKey;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { key: 'profile', label: 'Profile', icon: <UserCircle size={18} color={activeWebSettingsMenu === 'profile' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'links', label: 'Links', icon: <Link2 size={18} color={activeWebSettingsMenu === 'links' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'operations', label: 'Operations', icon: <Zap size={18} color={activeWebSettingsMenu === 'operations' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'orders', label: 'Orders', icon: <ShoppingCart size={18} color={activeWebSettingsMenu === 'orders' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'inventory', label: 'Inventory', icon: <Package size={18} color={activeWebSettingsMenu === 'inventory' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    ...(canUseCases ? [
      { key: 'cases' as const, label: 'Cases', icon: <FileText size={18} color={activeWebSettingsMenu === 'cases' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    ] : []),
    { key: 'appearance', label: 'Appearance', icon: <Sun size={18} color={activeWebSettingsMenu === 'appearance' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell size={18} color={activeWebSettingsMenu === 'notifications' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'integrations', label: 'Connections', icon: <Boxes size={18} color={activeWebSettingsMenu === 'integrations' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
    { key: 'system', label: 'System', icon: <Shield size={18} color={activeWebSettingsMenu === 'system' ? primaryPillTextStyle.color : colors.text.tertiary} strokeWidth={2} /> },
  ];

  const getSettingsItem = (id: string) => searchItems.find((item) => item.id === id);
  const getSettingsItems = (ids: string[]) => ids.map(getSettingsItem).filter(Boolean) as typeof searchItems;

  const mobileSettingsCardStyle = {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 24,
    overflow: 'hidden',
  } as const;

  const renderWebSettingsCard = (
    title: string,
    children: React.ReactNode,
    subtitle?: string,
  ) => (
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderRadius: 18,
        padding: 28,
      }}
    >
      <View style={{ marginBottom: 22 }}>
        <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase', ...(Platform.OS === 'web' ? ({ fontSize: '14px', lineHeight: '18px' } as any) : {}) }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, lineHeight: 16 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );

  const renderWebSettingsRows = (items: typeof searchItems) => (
    <View style={{ gap: 14 }}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={item.onPress}
          className="active:opacity-80"
          style={{
            minHeight: 72,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 18,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
            }}
          >
            {item.icon}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', ...(Platform.OS === 'web' ? ({ fontSize: '14px', lineHeight: '18px' } as any) : {}) }} numberOfLines={1}>
              {item.title}
            </Text>
            {item.description ? (
              <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
          {item.rightText ? (
            <Text style={{ color: colors.text.tertiary, fontSize: 14, fontWeight: '600' }}>
              {item.rightText}
            </Text>
          ) : null}
          <ChevronRight size={17} color={colors.text.tertiary} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );

  const renderWebAppearanceContent = () => (
    <View style={{ gap: 26 }}>
      <View>
        <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginBottom: 14 }}>Theme</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {themeOptions.map((option) => {
            const isSelected = themeMode === option.mode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setThemeMode(option.mode);
                }}
                className="active:opacity-80"
                style={{
                  height: 42,
                  minWidth: 92,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? colors.text.primary : colors.bg.primary,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.text.primary : colors.border.medium,
                }}
              >
                <Text style={{ color: isSelected ? colors.bg.primary : colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border.light }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Current mode</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {themeMode === 'system'
              ? `Following device: ${resolvedThemeMode === 'dark' ? 'Dark' : 'Light'}`
              : `Manually set: ${themeMode === 'dark' ? 'Dark' : 'Light'}`}
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            backgroundColor: colors.bg.secondary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {themeMode === 'system'
            ? <Laptop size={19} color="#6366F1" strokeWidth={2} />
            : resolvedThemeMode === 'dark'
            ? <Moon size={19} color="#8B5CF6" strokeWidth={2} />
            : <Sun size={19} color="#F59E0B" strokeWidth={2} />}
        </View>
      </View>
    </View>
  );

  const renderWebNotificationsContent = () => (
    <View style={{ gap: 14 }}>
      <View
        style={{
          minHeight: 72,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.primary,
          paddingHorizontal: 18,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: notifPermission === 'granted' ? '#10B98120' : colors.bg.secondary,
          }}
        >
          {notifPermission === 'granted'
            ? <Bell size={18} color="#10B981" strokeWidth={2} />
            : <BellOff size={18} color={colors.text.tertiary} strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Push notifications</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {notifPermission === 'granted' ? 'Enabled for browser alerts' : notifPermission === 'denied' ? 'Blocked in browser settings' : 'Not enabled yet'}
          </Text>
        </View>
        {notifPermission !== 'granted' && notifPermission !== 'denied' ? (
          <Pressable
            onPress={() => {
              promptForPermission();
              setTimeout(() => setNotifPermission(window.Notification?.permission ?? null), 1500);
            }}
            disabled={!notifReady}
            className="active:opacity-80"
            style={[primaryPillButtonStyle, { height: 38, minWidth: 88, alignItems: 'center', justifyContent: 'center', opacity: notifReady ? 1 : 0.5 }]}
          >
            <Text style={primaryPillTextStyle} className="text-sm font-semibold">Enable</Text>
          </Pressable>
        ) : null}
      </View>

      {notifPermission === 'granted' ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 18,
            paddingVertical: 16,
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Test this device</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2, marginBottom: 14 }}>
            Sends a real push notification straight to this browser, so you can confirm delivery actually works.
          </Text>
          <Pressable
            onPress={sendTestPushToThisDevice}
            disabled={isSendingTestPush || !notifReady}
            className="active:opacity-80"
            style={{
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
              borderWidth: 1,
              borderColor: colors.border.light,
              opacity: isSendingTestPush || !notifReady ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
              {isSendingTestPush ? 'Sending…' : 'Send test notification to this device'}
            </Text>
          </Pressable>
          {testPushResult ? (
            <Text
              style={{ color: testPushResult.ok ? '#10B981' : '#EF4444', fontSize: 12, marginTop: 10, textAlign: 'center' }}
            >
              {testPushResult.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {canUseOrderAutomation ? (
        <Pressable
          onPress={() => openSettingsPanel('email-settings', '/email-settings?from=settings')}
          className="active:opacity-80"
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 18,
            paddingVertical: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
            }}
          >
            <Mail size={18} color={colors.text.tertiary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Emails</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
              Order status update and delivery confirmation emails
            </Text>
          </View>
          <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );

  const renderWebLinksContent = () => (
    <View style={{ gap: 14 }}>
      {currentUser?.role === 'admin' && businessId ? (
        <Pressable
          onPress={copyBusinessId}
          className="active:opacity-80"
          style={{
            minHeight: 72,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 18,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
            }}
          >
            <Building2 size={18} color="#10B981" strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }} numberOfLines={1}>
              Fyll Business ID
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={1}>
              {businessId}
            </Text>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
            <Copy size={15} color={colors.text.secondary} strokeWidth={2} />
          </View>
        </Pressable>
      ) : null}
      {publicLinks.map((link) => (
        <Pressable
          key={link.key}
          onPress={() => copyPublicLink(link.description, link.title)}
          className="active:opacity-80"
          style={{
            minHeight: 72,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: 18,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
            }}
          >
            <Link2 size={18} color="#2563EB" strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }} numberOfLines={1}>
              {link.title}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={1}>
              {link.description}
            </Text>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg.secondary,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
            <Copy size={15} color={colors.text.secondary} strokeWidth={2} />
          </View>
        </Pressable>
      ))}
    </View>
  );

  const renderWebSystemContent = () => (
    <View style={{ gap: 14 }}>
      <Pressable
        onPress={handleSaveGlobalSettings}
        disabled={saveStatus === 'saving'}
        className="active:opacity-80"
        style={{
          minHeight: 72,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.primary,
          paddingHorizontal: 18,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          opacity: saveStatus === 'saving' ? 0.6 : 1,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg.secondary,
          }}
        >
          <Upload size={18} color="#10B981" strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>
            {saveStatus === 'saving' ? 'Saving global settings' : 'Save global settings'}
          </Text>
          <Text style={{ color: saveStatus === 'error' ? '#EF4444' : colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {saveMessage || 'Sync settings across devices'}
          </Text>
        </View>
        <ChevronRight size={17} color={colors.text.tertiary} strokeWidth={2} />
      </Pressable>
      {renderWebSettingsRows(getSettingsItems(['recycle-bin', 'import-ai', 'log-out']))}
      <Pressable
        onPress={handleRefreshApp}
        className="active:opacity-80"
        style={{
          minHeight: 72,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.primary,
          paddingHorizontal: 18,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg.secondary,
          }}
        >
          <RotateCcw size={18} color={colors.text.tertiary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Refresh app</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>Reload app data</Text>
        </View>
        <ChevronRight size={17} color={colors.text.tertiary} strokeWidth={2} />
      </Pressable>
    </View>
  );

  const webInlinePanelTitles: Partial<Record<WebInlineSettingsPanel, string>> = {
    'account-settings': 'My Account',
    'business-settings': 'Business Settings',
    'storefront-settings': 'Storefront',
    'payment-accounts': 'Bank Accounts',
    team: 'Team Members',
    invitations: 'Invitations',
    'woocommerce-settings': 'WooCommerce',
    'order-automation': 'Order Automation',
    'email-settings': 'Emails',
    'warehouse-settings': 'Warehouse Settings',
    'category-manager': 'Categories',
    'product-variables': 'Product Variables',
    'product-options': 'Product Options',
    'import-products': 'Import Products',
    'import-customers': 'Import Customers',
    'import-orders': 'Import Orders',
    'import-ai': 'AI Import Assistant',
    tasks: 'Tasks',
  };

  const renderWebInlinePanelComponent = () => {
    switch (activeWebInlinePanel) {
      case 'account-settings':
        return <AccountSettingsScreen embeddedInSettings />;
      case 'business-settings':
        return <BusinessSettingsScreen />;
      case 'storefront-settings':
        return <StorefrontSettingsScreen />;
      case 'payment-accounts':
        return <PaymentAccountsScreen />;
      case 'team':
        return <TeamManagementScreen />;
      case 'invitations':
        return <InvitationsScreen />;
      case 'woocommerce-settings':
        return <WooCommerceSettingsScreen />;
      case 'order-automation':
        return <OrderAutomationScreen />;
      case 'email-settings':
        return <EmailSettingsScreen />;
      case 'warehouse-settings':
        return <WarehouseSettingsScreen />;
      case 'category-manager':
        return <CategoryManagerScreen />;
      case 'product-variables':
        return <ProductVariablesScreen />;
      case 'product-options':
        return <ProductOptionsScreen />;
      case 'import-products':
        return <ImportProductsScreen />;
      case 'import-customers':
        return <ImportCustomersScreen />;
      case 'import-orders':
        return <ImportOrdersScreen />;
      case 'import-ai':
        return <ImportAiScreen />;
      case 'tasks':
        return <TasksScreen />;
      default:
        return null;
    }
  };

  const renderWebInlinePanel = () => {
    if (!activeWebInlinePanel) return null;

    return (
      <View
        style={{
          backgroundColor: colors.bg.primary,
          borderWidth: 1,
          borderColor: colors.border.light,
          borderRadius: 18,
          overflow: 'hidden',
          minHeight: Math.max(680, Dimensions.get('window').height - 260),
        }}
      >
        <SettingsBackOverrideProvider onBack={closeWebInlinePanel}>
          <View style={{ backgroundColor: colors.bg.primary, borderRadius: 18 }}>
            {renderWebInlinePanelComponent()}
          </View>
        </SettingsBackOverrideProvider>
      </View>
    );
  };

  const renderActiveWebSettingsContent = () => {
    if (activeWebInlinePanel) {
      return renderWebInlinePanel();
    }

    switch (activeWebSettingsMenu) {
      case 'profile':
        return renderWebSettingsCard(
          'Profile',
          renderWebSettingsRows(getSettingsItems(['my-account', 'switch-business', 'business-settings', 'payment-accounts', 'team-members', 'invitations'])),
          'Workspace, account, roles, and team access.'
        );
      case 'links':
        return renderWebSettingsCard('Business Links', renderWebLinksContent(), 'Copy customer-facing URLs for tracking, returns, and delivery confirmation.');
      case 'operations':
        return renderWebSettingsCard(
          'Operations',
          renderWebSettingsRows(getSettingsItems(['fyll-print', 'delivery', 'returns', 'announcements', 'tasks', 'customer-list', 'import-customers', 'finance', 'insights'])),
          'Daily workflow areas and customer operations.'
        );
      case 'orders':
        return renderWebSettingsCard(
          'Orders',
          renderWebSettingsRows(getSettingsItems(['order-statuses', 'quality-control-checks', 'order-timelines', 'shipping-zones', 'sale-sources', 'payment-methods', 'logistics-carriers', 'order-automation', 'import-orders'])),
          'Order workflows, payment labels, timeline rules, and imports.'
        );
      case 'inventory':
        return renderWebSettingsCard(
          'Inventory',
          renderWebSettingsRows(getSettingsItems(['low-stock-alert', 'warehouse-settings', 'categories', 'product-variables', 'product-options', 'import-products', 'service-catalog', 'addons'])),
          'Stock alerts, product structure, warehouse settings, and services.'
        );
      case 'cases':
        return renderWebSettingsCard(
          'Cases',
          renderWebSettingsRows(getSettingsItems(['all-cases', 'case-statuses', 'resolution-types'])),
          'Support case workflows and resolution settings.'
        );
      case 'appearance':
        return renderWebSettingsCard('Appearance', renderWebAppearanceContent(), 'Control the workspace theme.');
      case 'notifications':
        return renderWebSettingsCard('Notifications', renderWebNotificationsContent(), 'Push notifications for this browser and customer email settings.');
      case 'integrations':
        return renderWebSettingsCard(
          'Connections',
          renderWebSettingsRows(getSettingsItems(['storefront-settings', 'woocommerce-settings'])),
          'Connected stores and external sync settings.'
        );
      case 'system':
        return renderWebSettingsCard('System', renderWebSystemContent(), 'Sync, refresh, recycle bin, import assistant, and account actions.');
      default:
        return null;
    }
  };

  const renderActiveWebSectionCard = () => {
    if (!activeSection) return null;

    const titles: Record<SettingsSection, string> = {
      'order-statuses': 'Order Statuses',
      'quality-control-checks': 'Quality Control Checks',
      'sale-sources': 'Sale Sources',
      'custom-services': 'Add-ons',
      'order-timelines': 'Order Timelines',
      'shipping-zones': 'Shipping Zones',
      'payment-methods': 'Payment Methods',
      'logistics-carriers': 'Logistics Carriers',
      'case-statuses': 'Case Statuses',
      'resolution-types': 'Resolution Types',
      'recycle-bin': 'Recycle Bin',
    };

    const subtitles: Record<SettingsSection, string> = {
      'order-statuses': 'Manage workflow labels, tracking stages, and optional WooCommerce mappings.',
      'quality-control-checks': 'Manage the QC checklist used before dispatching orders.',
      'sale-sources': 'Define the source labels available when orders are created.',
      'custom-services': 'Manage add-ons and optional service line items.',
      'order-timelines': 'Set delivery windows, workflow steps, and order-type timing rules.',
      'shipping-zones': 'Configure location-based delivery zones and fees.',
      'payment-methods': 'Manage the payment method labels shown across orders and checkout workflows.',
      'logistics-carriers': 'Control the carrier labels available for cases and delivery handling.',
      'case-statuses': 'Manage support workflow statuses for internal case handling.',
      'resolution-types': 'Control the available resolution outcomes for customer cases.',
      'recycle-bin': 'Restore or permanently remove deleted records kept for recovery.',
    };

    return (
      <View
        style={{
          backgroundColor: colors.bg.card,
          borderWidth: 1,
          borderColor: colors.border.light,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            minHeight: 60,
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleBackFromSection();
              }}
              className="active:opacity-60"
              style={{
                width: 34,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                marginRight: 12,
              }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', ...(Platform.OS === 'web' ? ({ fontSize: '14px', lineHeight: '18px' } as any) : {}) }} numberOfLines={1}>
                {titles[activeSection]}
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4, lineHeight: 18 }} numberOfLines={2}>
                {subtitles[activeSection]}
              </Text>
            </View>
          </View>

          {activeSection !== 'recycle-bin' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {activeSection === 'order-timelines' ? (
                <Pressable
                  onPress={openCreateOrderTimelineModal}
                  className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                  style={[primaryPillButtonStyle, { height: 40, minWidth: 110, gap: 8 }]}
                >
                  <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                  <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Type</Text>
                </Pressable>
              ) : null}
              {activeSection === 'shipping-zones' ? (
                <Pressable
                  onPress={openCreateShippingZoneModal}
                  className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                  style={[primaryPillButtonStyle, { height: 40, minWidth: 110, gap: 8 }]}
                >
                  <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                  <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Zone</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSectionSave}
                className="px-4 rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 40, minWidth: 96 }]}
              >
                <Text style={primaryPillTextStyle} className="text-sm font-semibold">
                  {sectionSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 18, paddingVertical: 18 }}>
          {renderSectionContent()}
        </View>
      </View>
    );
  };

  if (activeMobileInlinePanel === 'payment-accounts') {
    return (
      <SettingsBackOverrideProvider onBack={() => setActiveMobileInlinePanel(null)}>
        <PaymentAccountsScreen />
      </SettingsBackOverrideProvider>
    );
  }

  if (activeSection) {
    if (isWebDesktop) {
      return (
        <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
          <SafeAreaView className="flex-1" edges={[]}>
            <KeyboardAwareScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              enableOnAndroid
              extraScrollHeight={100}
              contentContainerStyle={{ paddingBottom: 64 }}
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: 1480,
                  alignSelf: 'center',
                  paddingHorizontal: 36,
                  paddingTop: 34,
                }}
              >
                <View style={{ marginBottom: 34 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '600', letterSpacing: 0 }}>
                    Settings
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 14, marginTop: 6, ...(Platform.OS === 'web' ? ({ fontSize: '14px' } as any) : {}) }}>
                    Manage your workspace and account preferences.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View
                    style={{
                      width: 174,
                      flexShrink: 0,
                      gap: 8,
                      ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 24, alignSelf: 'flex-start' } as any) : {}),
                    }}
                  >
                    {webSettingsMenuItems.map((item) => {
                      const selected = activeWebSettingsMenu === item.key;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setActiveSection(null);
                            setActiveWebInlinePanel(null);
                            setActiveWebSettingsMenu(item.key);
                            router.replace({ pathname: '/settings', params: { menu: item.key } });
                          }}
                          className="active:opacity-80"
                          style={{
                            height: 56,
                            borderRadius: 999,
                            paddingLeft: 24,
                            paddingRight: 18,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            backgroundColor: selected ? colors.text.primary : 'transparent',
                          }}
                        >
                          {item.icon}
                          <Text
                            style={{
                              color: selected ? colors.bg.primary : colors.text.tertiary,
                              fontSize: 14,
                              lineHeight: 18,
                              fontWeight: selected ? '600' : '500',
                            }}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={{ flex: 1, maxWidth: 612 }}>
                    {renderActiveWebSectionCard()}
                    <View style={{ marginTop: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Info size={16} color={colors.text.tertiary} strokeWidth={2} />
                      <Text style={{ color: colors.text.tertiary, fontSize: 16 }}>
                        Need help? Contact support at support@fyll.app
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </KeyboardAwareScrollView>
          </SafeAreaView>

          {renderToastOverlay()}
          {renderDeleteSettingModal()}
          {renderOrderStatusActionMenu()}
          {renderOrderTimelineActionMenu()}
          {renderShippingZoneActionMenu()}
          {renderOrderStatusModal()}
          {renderOrderTimelineModal()}
          {renderShippingZoneModal()}
        </View>
      );
    }

    const titles: Record<SettingsSection, string> = {
      'order-statuses': 'Order Statuses',
      'quality-control-checks': 'Quality Control Checks',
      'sale-sources': 'Sale Sources',
      'custom-services': 'Add-ons',
      'order-timelines': 'Order Timelines',
      'shipping-zones': 'Shipping Zones',
      'payment-methods': 'Payment Methods',
      'logistics-carriers': 'Logistics Carriers',
      'case-statuses': 'Case Statuses',
      'resolution-types': 'Resolution Types',
      'recycle-bin': 'Recycle Bin',
    };

    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View style={settingsSectionHeaderWrapStyle}>
              <View
                className={isWebDesktop ? 'pl-5 pr-7 pt-5 pb-4 flex-row items-center' : 'px-5 pt-6 pb-3 flex-row items-center'}
                style={isWebDesktop ? { maxWidth: 1440, width: '100%', alignSelf: 'flex-start', minHeight: desktopHeaderMinHeight } : undefined}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleBackFromSection();
                  }}
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
                  style={{ backgroundColor: 'transparent' }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View className="flex-1">
                  <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{titles[activeSection]}</Text>
                  {sectionSaveStatus === 'success' && (
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">Saved</Text>
                  )}
                  {sectionSaveStatus === 'error' && (
                    <Text style={{ color: '#EF4444' }} className="text-xs mt-1">Save failed</Text>
                  )}
                </View>
                {activeSection !== 'recycle-bin' ? (
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    {isWebDesktop && activeSection === 'order-timelines' ? (
                      <Pressable
                        onPress={openCreateOrderTimelineModal}
                        className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                        style={[primaryPillButtonStyle, { height: 42, minWidth: 116, gap: 8 }]}
                      >
                        <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                        <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Type</Text>
                      </Pressable>
                    ) : null}
                    {isWebDesktop && activeSection === 'shipping-zones' ? (
                      <Pressable
                        onPress={openCreateShippingZoneModal}
                        className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                        style={[primaryPillButtonStyle, { height: 42, minWidth: 118, gap: 8 }]}
                      >
                        <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                        <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Zone</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={handleSectionSave}
                      className="px-4 rounded-full items-center justify-center active:opacity-80"
                      style={[primaryPillButtonStyle, { height: 42, minWidth: 104 }]}
                    >
                      <Text style={primaryPillTextStyle} className="text-sm font-semibold">
                        {sectionSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          >
            <View style={[settingsSectionContentWrapStyle, !isWebDesktop ? { paddingTop: 18 } : null]}>
              {renderSectionContent()}
              <View className="h-24" />
            </View>
          </KeyboardAwareScrollView>
        </SafeAreaView>

        {renderToastOverlay()}
        {renderDeleteSettingModal()}
        {renderOrderStatusActionMenu()}
        {renderOrderTimelineActionMenu()}
        {renderShippingZoneActionMenu()}
        {renderOrderStatusModal()}
        {renderOrderTimelineModal()}
        {renderShippingZoneModal()}
      </View>
    );
  }

  if (isWebDesktop) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1" edges={[]}>
          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
            contentContainerStyle={{ paddingBottom: 64 }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 1480,
                alignSelf: 'center',
                paddingHorizontal: 36,
                paddingTop: 34,
              }}
            >
              <View style={{ marginBottom: 34 }}>
                <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '600', letterSpacing: 0 }}>
                  Settings
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 14, marginTop: 6, ...(Platform.OS === 'web' ? ({ fontSize: '14px' } as any) : {}) }}>
                  Manage your workspace and account preferences.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                <View
                  style={{
                    width: 174,
                    flexShrink: 0,
                    gap: 8,
                    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 24, alignSelf: 'flex-start' } as any) : {}),
                  }}
                >
                  {webSettingsMenuItems.map((item) => {
                    const selected = activeWebSettingsMenu === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveWebInlinePanel(null);
                          setActiveWebSettingsMenu(item.key);
                          router.replace({ pathname: '/settings', params: { menu: item.key } });
                        }}
                        className="active:opacity-80"
                        style={{
                          height: 56,
                          borderRadius: 999,
                          paddingLeft: 24,
                          paddingRight: 18,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          backgroundColor: selected ? colors.text.primary : 'transparent',
                        }}
                      >
                        {item.icon}
                        <Text
                          style={{
                            color: selected ? colors.bg.primary : colors.text.tertiary,
                            fontSize: 14,
                            lineHeight: 18,
                            fontWeight: selected ? '600' : '500',
                          }}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flex: 1, maxWidth: 612 }}>
                  {renderActiveWebSettingsContent()}
                  <View style={{ marginTop: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Info size={16} color={colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: colors.text.tertiary, fontSize: 16 }}>
                      Need help? Contact support at support@fyll.app
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </SafeAreaView>

        {renderToastOverlay()}
        {renderDeleteSettingModal()}
        {renderOrderStatusActionMenu()}
        {renderOrderTimelineActionMenu()}
        {renderShippingZoneActionMenu()}
        {renderOrderStatusModal()}
        {renderOrderTimelineModal()}
        {renderShippingZoneModal()}

        <Modal
          visible={showLowStockModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLowStockModal(false)}
        >
          <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
            <View
              className="w-full rounded-3xl p-5"
              style={{ maxWidth: 420, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 pr-3">
                  <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">
                    Low Stock Alert
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                    Set a global stock threshold for inventory warnings.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowLowStockModal(false)}
                  className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              </View>
              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Use global threshold</Text>
                <Switch
                  value={useGlobalLowStockThreshold}
                  onValueChange={setUseGlobalLowStockThreshold}
                  trackColor={{ false: colors.border.medium, true: colors.text.primary }}
                  thumbColor={colors.bg.primary}
                />
              </View>
              <View
                className="rounded-2xl px-4 mb-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 54, justifyContent: 'center' }}
              >
                <TextInput
                  value={tempThreshold}
                  onChangeText={setTempThreshold}
                  keyboardType="numeric"
                  placeholder="5"
                  placeholderTextColor={colors.input.placeholder}
                  selectionColor={colors.text.primary}
                  style={{ color: colors.input.text, fontSize: 16, fontWeight: '600' }}
                />
              </View>
              <Pressable
                onPress={() => {
                  const parsed = parseInt(tempThreshold, 10);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    setGlobalLowStockThreshold(parsed);
                    setShowLowStockModal(false);
                    showToast('Low stock threshold updated.');
                  }
                }}
                className="rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50 }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold text-sm">Save Threshold</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        <View style={settingsMainContentWrapStyle}>
        <View>
          {isWebDesktop ? (
            <View className="px-5 pt-3" style={{ paddingTop: 20 }}>
              <View
                className="flex-row items-start justify-between"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.light,
                  marginHorizontal: -20,
                  paddingHorizontal: 20,
                  paddingBottom: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View className="flex-row items-start justify-between">
                    <View>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium uppercase tracking-wider">Menu</Text>
                      <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>More</Text>
                    </View>
                    <Pressable
                      onPress={handleRefreshApp}
                      className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
                      style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <RotateCcw size={16} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                  </View>
                  <View className="flex-row items-center mt-2 rounded-full px-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 42, marginBottom: 6 }}>
                    <Search size={15} color={colors.text.muted} strokeWidth={2} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search settings…"
                      placeholderTextColor={colors.input.placeholder}
                      style={{ flex: 1, color: colors.input.text, fontSize: 14, marginLeft: 8 }}
                      selectionColor={colors.text.primary}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                    />
                    <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View className="px-5 pt-6 pb-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <View className="flex-row items-start justify-between">
                <View>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium uppercase tracking-wider">Menu</Text>
                  <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>More</Text>
                </View>
                <Pressable
                  onPress={handleRefreshApp}
                  className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <RotateCcw size={16} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              </View>
              <View className="flex-row items-center mt-3 rounded-full px-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 42, marginBottom: 6 }}>
                <Search size={15} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search settings…"
                  placeholderTextColor={colors.input.placeholder}
                  style={{ flex: 1, color: colors.input.text, fontSize: 14, marginLeft: 8 }}
                  selectionColor={colors.text.primary}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>
            </View>
          )}
        </View>

        <KeyboardAwareScrollView
          className="flex-1 px-5 pt-4"
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          extraScrollHeight={100}
          contentOffset={{ x: 0, y: mainMenuScrollYRef.current }}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const nextY = event.nativeEvent.contentOffset.y;
            mainMenuScrollYRef.current = nextY;
            settingsMainScrollYMemory = nextY;
          }}
          contentContainerStyle={{
            paddingBottom: tabBarHeight + 16,
            paddingRight: Platform.OS === 'web' && isDesktop ? 24 : 0,
          }}
        >
          {searchQuery.trim() ? (
            <View style={mobileSettingsCardStyle}>
              {filteredSearchItems.length > 0 ? (
                filteredSearchItems.map((item, index) => (
                  <SettingsRow
                    key={item.id}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    rightText={item.rightText}
                    onPress={item.onPress}
                    showChevron={!!item.onPress}
                    showDivider={index < filteredSearchItems.length - 1}
                  />
                ))
              ) : (
                <View className="items-center py-12">
                  <Search size={32} color={colors.text.muted} strokeWidth={1.5} />
                  <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium mt-3">No results for "{searchQuery}"</Text>
                  <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Try a different keyword</Text>
                </View>
              )}
              <View className="h-8" />
            </View>
          ) : null}

          {!searchQuery.trim() && (
            <>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">Business</Text>
              <View style={mobileSettingsCardStyle}>
                <SettingsRow
                  title="Switch Business"
                  description="Add and open existing businesses"
                  icon={<Building2 size={18} color="#10B981" strokeWidth={2} />}
                  onPress={() => router.push('/switch-business?from=settings')}
                />
              </View>
            </>
          )}

          {!searchQuery.trim() && currentUser && (
            <>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Account</Text>
              <View style={mobileSettingsCardStyle}>
                <SettingsRow
                  title="My Account"
                  description="Profile and password"
                  icon={<UserCircle size={18} color="#3B82F6" strokeWidth={2} />}
                  onPress={() => openSettingsPanel('account-settings', '/account-settings?from=settings')}
                />
              </View>
            </>
          )}

          {!searchQuery.trim() && (<>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Business</Text>
          <View style={mobileSettingsCardStyle}>
          <SettingsRow
            title="Business Settings"
            description="Logo, phone, website"
            icon={<Building2 size={18} color="#10B981" strokeWidth={2} />}
            onPress={() => openSettingsPanel('business-settings', '/business-settings?from=settings')}
          />
          {canUseSocialCheckout ? (
            <SettingsRow
              title="Bank Accounts"
              description="Social Checkout payment destinations"
              icon={<Landmark size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsPanel('payment-accounts', { pathname: '/payment-accounts', params: { from: 'settings' } })}
            />
          ) : null}
          {canViewInsights && currentUser?.role === 'admin' ? (
            <SettingsRow
              title="Insights Dashboard"
              description="Sales, customers, and trends"
              icon={<BarChart3 size={18} color="#3B82F6" strokeWidth={2} />}
              onPress={() => router.push('/insights' as never)}
            />
          ) : null}
          {canViewFinance ? (
            <SettingsRow
              title="Finance"
              description="Overview, expenses, procurement, settings"
              icon={<TrendingUp size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => router.push(financeSettingsRoute as never)}
            />
          ) : null}
          {canUseTasks ? (
            <SettingsRow
              title="Tasks"
              description="Assign work, due dates, recurring ops"
              icon={<ListTodo size={18} color="#2563EB" strokeWidth={2} />}
              onPress={() => openSettingsPanel('tasks', '/tasks')}
            />
          ) : null}
          {canUseFyllPrint ? (
            <SettingsRow
              title="Fyll Print"
              description="View print queues and history"
              icon={<Printer size={18} color={colors.text.primary} strokeWidth={2} />}
              onPress={() => router.push('/fyll-print' as never)}
            />
          ) : null}
          {canUseDelivery ? (
            <SettingsRow
              title="Delivery"
              description="Dispatch, confirmations, and follow-ups"
              icon={<Truck size={18} color="#059669" strokeWidth={2} />}
              onPress={() => router.push('/(tabs)/deliveries' as never)}
            />
          ) : null}
          {canUseReturns ? (
            <SettingsRow
              title="Returns"
              description="Return cases and customer requests"
              icon={<RotateCcw size={18} color="#2563EB" strokeWidth={2} />}
              onPress={() => router.push('/returns' as never)}
            />
          ) : null}
          {canUseAnnouncements ? (
            <SettingsRow
              title="Announcements"
              description="Send simple customer updates"
              icon={<Megaphone size={18} color={colors.text.primary} strokeWidth={2} />}
              onPress={() => router.push('/(tabs)/announcements' as never)}
            />
          ) : null}
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Connections</Text>
          <View style={mobileSettingsCardStyle}>
          {canUseStorefront ? (
            <SettingsRow
              title="Storefront"
              description="Public shop link and storefront publishing"
              icon={<Store size={18} color="#8B5CF6" strokeWidth={2} />}
              onPress={() => openSettingsPanel('storefront-settings', '/storefront-settings?from=settings&menu=integrations')}
            />
          ) : null}
          {canUseWooCommerce ? (
            <SettingsRow
              title="WooCommerce"
              description="Store URL and API keys"
              icon={<ShoppingCart size={18} color="#2563EB" strokeWidth={2} />}
              onPress={() => openSettingsPanel('woocommerce-settings', '/woocommerce-settings?from=settings&menu=integrations')}
            />
          ) : null}
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Links</Text>
          <View style={mobileSettingsCardStyle}>
            {publicLinks.map((link) => (
              <SettingsRow
                key={link.key}
                title={link.title}
                description={link.description}
                icon={<Link2 size={18} color="#2563EB" strokeWidth={2} />}
                showChevron={false}
                onPress={() => copyPublicLink(link.description, link.title)}
                rightElement={
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Copy size={15} color={colors.text.secondary} strokeWidth={2} />
                  </View>
                }
              />
            ))}
          </View>

          {currentUser?.role === 'admin' && businessId ? (
            <>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Business Identity</Text>
              <View style={mobileSettingsCardStyle}>
                <SettingsRow
                  title="Fyll Business ID"
                  description={businessId}
                  icon={<Building2 size={18} color="#10B981" strokeWidth={2} />}
                  showChevron={false}
                  onPress={copyBusinessId}
                  rightElement={
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <Copy size={15} color={colors.text.secondary} strokeWidth={2} />
                    </View>
                  }
                />
              </View>
            </>
          ) : null}

          {currentUser?.role === 'admin' && canUseTeamMembers && (
            <>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Team</Text>
              <View style={mobileSettingsCardStyle}>
                <SettingsRow
                  title="Team Members"
                  description="Roles and permissions"
                  icon={<Shield size={18} color="#EF4444" strokeWidth={2} />}
                  rightText={`${teamMembers.length}`}
                  onPress={() => openSettingsPanel('team', '/team?from=settings')}
                />
                <SettingsRow
                  title="Invitations"
                  description="VIP access, invite limits, history"
                  icon={<Shield size={18} color="#F59E0B" strokeWidth={2} />}
                  onPress={() => openSettingsPanel('invitations', '/invitations?from=settings')}
                />
              </View>
            </>
          )}

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Data</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Recycle Bin"
              description="Restore deleted orders, products, and finance rows"
              icon={<Trash2 size={18} color="#EF4444" strokeWidth={2} />}
              rightText={`${recycleBin.length}`}
              onPress={() => openSettingsSection('recycle-bin')}
            />
            <SettingsRow
              title="AI Import Assistant"
              description="Orders, customers, products, expenses"
              icon={<Sparkles size={18} color="#8B5CF6" strokeWidth={2} />}
              onPress={() => openSettingsPanel('import-ai', '/import-ai?from=settings')}
            />
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Customers</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Customer List"
              description="Contacts and history"
              icon={<Users size={18} color="#10B981" strokeWidth={2} />}
              rightText={`${customers.length}`}
              onPress={() => router.push('/customers' as never)}
            />
            <SettingsRow
              title="Import Customers"
              description="Upload contacts via CSV"
              icon={<Upload size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsPanel('import-customers', '/import-customers?from=settings')}
            />
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Orders & Sales</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Order Statuses"
              description="Workflow stages"
              icon={<ShoppingCart size={18} color="#F59E0B" strokeWidth={2} />}
              rightText={`${orderStatuses.length}`}
              onPress={() => openSettingsSection('order-statuses')}
            />
            <SettingsRow
              title="Quality Control Checks"
              description="Dispatch checklist requirements"
              icon={<ListTodo size={18} color="#10B981" strokeWidth={2} />}
              rightText={`${qcChecklistRequirements.length}`}
              onPress={() => openSettingsSection('quality-control-checks')}
            />
            <SettingsRow
              title="Order Timelines"
              description="Order types and processing ETA rules"
              icon={<Clock3 size={18} color="#2563EB" strokeWidth={2} />}
              rightText={`${orderTimelineSettings.orderTypes.length}`}
              onPress={() => openSettingsSection('order-timelines')}
            />
            <SettingsRow
              title="Shipping Zones"
              description="Delivery zones by Nigerian state"
              icon={<Truck size={18} color="#F59E0B" strokeWidth={2} />}
              rightText={`${orderTimelineSettings.shippingZones.length}`}
              onPress={() => openSettingsSection('shipping-zones')}
            />
            <SettingsRow
              title="Sale Sources"
              description="Where orders come from"
              icon={<Tag size={18} color="#059669" strokeWidth={2} />}
              rightText={`${saleSources.length}`}
              onPress={() => openSettingsSection('sale-sources')}
            />
            <SettingsRow
              title="Payment Methods"
              description="Bank transfer, POS, website"
              icon={<CreditCard size={18} color="#3B82F6" strokeWidth={2} />}
              rightText={`${paymentMethods.length}`}
              onPress={() => openSettingsSection('payment-methods')}
            />
            <SettingsRow
              title="Logistics Carriers"
              description="Delivery partners"
              icon={<Truck size={18} color="#F59E0B" strokeWidth={2} />}
              rightText={`${logisticsCarriers.length}`}
              onPress={() => openSettingsSection('logistics-carriers')}
            />
            {canUseOrderAutomation ? (
              <SettingsRow
                title="Order Automation"
                description="Auto-complete stale orders"
                icon={<Zap size={18} color="#F59E0B" strokeWidth={2} />}
                onPress={() => openSettingsPanel('order-automation', '/order-automation?from=settings')}
              />
            ) : null}
            <SettingsRow
              title="Import Orders"
              description="Upload orders via CSV"
              icon={<Upload size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsPanel('import-orders', '/import-orders?from=settings')}
            />
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Services</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Service Catalog"
              description="All services and pricing"
              icon={<Wrench size={18} color={colors.text.secondary} strokeWidth={2} />}
              onPress={() => router.push('/services' as never)}
            />
            <SettingsRow
              title="Add-ons"
              description="Lens coating, express delivery"
              icon={<Wrench size={18} color="#8B5CF6" strokeWidth={2} />}
              rightText={`${customServices.length}`}
              onPress={() => openSettingsSection('custom-services')}
            />
          </View>

          {canUseCases ? (
            <>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Cases</Text>
              <View style={mobileSettingsCardStyle}>
                <SettingsRow
                  title="All Cases"
                  description="View and manage cases"
                  icon={<FileText size={18} color="#8B5CF6" strokeWidth={2} />}
                  onPress={() => router.push('/cases' as never)}
                />
                <SettingsRow
                  title="Case Statuses"
                  description="Customize workflow stages"
                  icon={<FileText size={18} color="#F59E0B" strokeWidth={2} />}
                  rightText={`${caseStatuses.length}`}
                  onPress={() => openSettingsSection('case-statuses')}
                />
                <SettingsRow
                  title="Resolution Types"
                  description="How cases are resolved"
                  icon={<Check size={18} color="#10B981" strokeWidth={2} />}
                  rightText={`${resolutionTypes.length}`}
                  onPress={() => openSettingsSection('resolution-types')}
                />
              </View>
            </>
          ) : null}

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Inventory</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Low Stock Alert"
              description={useGlobalLowStockThreshold
                ? `On • ${globalLowStockThreshold} units`
                : 'Off • Tap to configure'}
              icon={<AlertTriangle size={18} color="#F59E0B" strokeWidth={2} />}
              onPress={() => {
                setTempThreshold(globalLowStockThreshold.toString());
                setShowLowStockModal(true);
              }}
            />
            <SettingsRow
              title="Warehouse Settings"
              description="Manage warehouse categories and units"
              icon={<Boxes size={18} color="#6366F1" strokeWidth={2} />}
              onPress={() => openSettingsPanel('warehouse-settings', '/warehouse-settings?from=settings&menu=inventory')}
            />
            <SettingsRow
              title="Categories"
              description="Product groups"
              icon={<Tag size={18} color="#3B82F6" strokeWidth={2} />}
              rightText={`${categories.length}`}
              onPress={() => openSettingsPanel('category-manager', '/category-manager?from=settings&menu=inventory')}
            />
            <SettingsRow
              title="Product Variables"
              description="Stock variants, SKUs, barcodes and prices"
              icon={<Package size={18} color="#A855F7" strokeWidth={2} />}
              rightText={`${productVariables.length}`}
              onPress={() => openSettingsPanel('product-variables', '/product-variables?from=settings')}
            />
            <SettingsRow
              title="Product Options"
              description="Choices customers pick on item lines"
              icon={<Tag size={18} color="#16A34A" strokeWidth={2} />}
              rightText={`${productOptions.length}`}
              onPress={() => openSettingsPanel('product-options', '/product-options?from=settings')}
            />
            <SettingsRow
              title="Import Products"
              description="Upload CSV"
              icon={<Upload size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsPanel('import-products', '/import-products?from=settings')}
            />
          </View>

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Appearance</Text>
          <View
            className="rounded-2xl p-4 border"
            style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}
          >
            <View className="flex-row items-center mb-3">
              <View
                className="w-9 h-9 rounded-lg items-center justify-center mr-3"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                {themeMode === 'system'
                  ? <Laptop size={18} color="#6366F1" strokeWidth={2} />
                  : resolvedThemeMode === 'dark'
                  ? <Moon size={18} color="#8B5CF6" strokeWidth={2} />
                  : <Sun size={18} color="#F59E0B" strokeWidth={2} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
                  Theme
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-[11px] mt-0.5">
                  {themeMode === 'system'
                    ? `Following device: ${resolvedThemeMode === 'dark' ? 'Dark' : 'Light'}`
                    : `Manually set: ${themeMode === 'dark' ? 'Dark' : 'Light'}`}
                </Text>
              </View>
            </View>

            <View
              className="rounded-full p-1"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {themeOptions.map((option) => {
                  const isSelected = themeMode === option.mode;
                  return (
                    <Pressable
                      key={option.mode}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setThemeMode(option.mode);
                      }}
                      className="rounded-full active:opacity-80"
                      style={{
                        flex: 1,
                        height: 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? colors.bg.card : 'transparent',
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? colors.border.light : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.text.primary : colors.text.tertiary,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {((Platform.OS === 'web' && notifPermission !== null) || canUseOrderAutomation) && (
          <>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Notifications</Text>
          <View style={mobileSettingsCardStyle}>
            {Platform.OS === 'web' && notifPermission !== null && (
              <View
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-9 h-9 rounded-lg items-center justify-center"
                    style={{ backgroundColor: notifPermission === 'granted' ? '#10B98120' : colors.bg.secondary }}
                  >
                    {notifPermission === 'granted'
                      ? <Bell size={18} color="#10B981" strokeWidth={2} />
                      : <BellOff size={18} color={colors.text.tertiary} strokeWidth={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
                      Push Notifications
                    </Text>
                    <Text style={{ color: notifPermission === 'granted' ? '#10B981' : notifPermission === 'denied' ? '#EF4444' : colors.text.tertiary }} className="text-[11px] mt-0.5">
                      {notifPermission === 'granted' ? 'Enabled — you\'ll receive alerts' : notifPermission === 'denied' ? 'Blocked — enable in browser settings' : 'Not yet enabled'}
                    </Text>
                  </View>
                  {notifPermission !== 'granted' && notifPermission !== 'denied' && (
                    <Pressable
                      onPress={() => {
                        promptForPermission();
                        setTimeout(() => setNotifPermission(window.Notification?.permission ?? null), 1500);
                      }}
                      disabled={!notifReady}
                      className="rounded-full px-3 items-center justify-center active:opacity-80"
                      style={{ height: 34, backgroundColor: '#2563EB', opacity: notifReady ? 1 : 0.5 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Enable</Text>
                    </Pressable>
                  )}
                  {notifPermission === 'denied' && (
                    <Pressable
                      onPress={() => {
                        if (typeof window !== 'undefined') window.open('https://support.apple.com/guide/safari/customize-settings-for-a-website-ibrw7f78f7fe/mac', '_blank');
                      }}
                      className="rounded-full px-3 items-center justify-center active:opacity-80"
                      style={{ height: 34, backgroundColor: colors.bg.secondary }}
                    >
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>How to fix</Text>
                    </Pressable>
                  )}
                </View>

                {notifPermission === 'granted' && (
                  <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                    <Pressable
                      onPress={sendTestPushToThisDevice}
                      disabled={isSendingTestPush || !notifReady}
                      className="rounded-full items-center justify-center active:opacity-80"
                      style={{ height: 40, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, opacity: isSendingTestPush || !notifReady ? 0.6 : 1 }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                        {isSendingTestPush ? 'Sending…' : 'Send test notification to this device'}
                      </Text>
                    </Pressable>
                    {testPushResult && (
                      <Text
                        style={{ color: testPushResult.ok ? '#10B981' : '#EF4444' }}
                        className="text-[11px] mt-2 text-center"
                      >
                        {testPushResult.message}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {canUseOrderAutomation ? (
              <Pressable
                onPress={() => openSettingsPanel('email-settings', '/email-settings?from=settings')}
                className="rounded-2xl p-4 border flex-row items-center gap-3 active:opacity-70"
                style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}
              >
                <View
                  className="w-9 h-9 rounded-lg items-center justify-center"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Mail size={18} color={colors.text.tertiary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">
                    Emails
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-[11px] mt-0.5">
                    Order status update and delivery confirmation emails
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          </>
          )}

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">Sync</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Save Global Settings"
              description="Sync across devices"
              icon={<Upload size={18} color="#10B981" strokeWidth={2} />}
              showChevron={false}
              rightElement={
                <Pressable
                  onPress={handleSaveGlobalSettings}
                  disabled={saveStatus === 'saving'}
                  className="rounded-full px-3 items-center justify-center active:opacity-80"
                  style={[primaryPillButtonStyle, { height: 36, minWidth: 80 }]}
                >
                  <Text style={primaryPillTextStyle} className="font-semibold text-xs">
                    {saveStatus === 'saving' ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              }
            />
          </View>
          {saveMessage && (
            <Text
              style={{ color: saveStatus === 'error' ? '#EF4444' : colors.text.tertiary }}
              className="text-xs mt-2"
            >
              {saveMessage}
            </Text>
          )}

          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-4 mb-3 tracking-wider">App</Text>
          <View style={mobileSettingsCardStyle}>
            <SettingsRow
              title="Fyll ERP"
              description="Version 1.0.0"
              icon={<Info size={18} color="#3B82F6" strokeWidth={2} />}
              showChevron={false}
            />
            <SettingsRow
              title="Refresh App"
              description="Reload app data"
              icon={<RotateCcw size={18} color={colors.text.tertiary} strokeWidth={2} />}
              onPress={handleRefreshApp}
            />
            {currentUser && (
              <SettingsRow
                title="Log Out"
                icon={<LogOut size={18} color={colors.text.tertiary} strokeWidth={2} />}
                showChevron={false}
                onPress={handleLogout}
              />
            )}
          </View>

          <View className="h-8" />
          </>)}

          <View className="h-16" />
        </KeyboardAwareScrollView>

        {renderToastOverlay()}

        <Modal
          visible={showLowStockModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLowStockModal(false)}
        >
          <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
            <View className="w-full rounded-2xl p-5" style={{ backgroundColor: colors.bg.primary }}>
              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">Global Low Stock Alert</Text>
                <Pressable
                  onPress={() => setShowLowStockModal(false)}
                  className="w-9 h-9 rounded-xl items-center justify-center active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Enable global threshold</Text>
                <Switch
                  value={useGlobalLowStockThreshold}
                  onValueChange={(value) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setUseGlobalLowStockThreshold(value);
                  }}
                  trackColor={{ false: '#767577', true: '#F59E0B' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {useGlobalLowStockThreshold && (
                <View className="mb-4">
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium mb-2">Alert when stock falls below</Text>
                  <View className="flex-row items-center">
                    <View
                      className="flex-1 rounded-xl px-4 mr-3"
                      style={{
                        backgroundColor: colors.input.bg,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        height: 50,
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        value={tempThreshold}
                        onChangeText={setTempThreshold}
                        keyboardType="number-pad"
                        style={{ color: colors.input.text, fontSize: 16, fontWeight: '600' }}
                        placeholderTextColor={colors.input.placeholder}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm">units</Text>
                  </View>
                  <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                    This overrides individual product thresholds
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleSaveLowStock}
                className="rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 48 }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Save</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        </View>
      </SafeAreaView>

      {renderDeleteSettingModal()}
    </View>
  );
}
