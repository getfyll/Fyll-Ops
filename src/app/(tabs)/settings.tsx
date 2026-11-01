import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert, Switch, Platform, Modal, Dimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Trash2, Edit2, Check, X, ChevronRight, ChevronUp, ChevronDown, ArrowLeft, Package, ShoppingCart, Tag, RotateCcw, Info, CreditCard, Truck, Wrench, Users, Moon, Sun, Laptop, LogOut, Shield, Building2, AlertTriangle, UserCircle, Upload, FileText, BarChart3, TrendingUp, Zap, Search, Sparkles, ListTodo, Bell, BellOff, Boxes, Clock3, Plus, MoreVertical, Megaphone, Printer, Copy, Link2, Landmark, Store, Mail, LayoutGrid, Award, MessageCircle } from 'lucide-react-native';
import { MilestoneReplay } from '@/components/milestones/MilestoneReplay';
import { useWebPushNotifications } from '@/hooks/useWebPushNotifications';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useFyllStore, { formatCurrency, type DeletedItem, type ThemeMode } from '@/lib/state/fyll-store';
import useAuthStore, { ROLE_PERMISSIONS } from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { canShowFinanceNavigation, getDefaultFinanceSectionForRole } from '@/lib/finance-access';
import { isOrderStatusException, ORDER_TRACKING_STAGE_OPTIONS, sortOrderStatusesForFulfillment, type OrderTrackingStage } from '@/lib/order-status';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, usePageHeadingStyle } from '@/lib/page-heading';
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
import WhatsAppSettingsScreen from '@/app/whatsapp-settings';
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
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { isPickupTimeline } from '@/lib/fulfillment';
import { FeaturesSettings, type FeatureRowKey } from '@/components/FeaturesSettings';
import { LimeToggle } from '@/components/settings/LimeToggle';
import { SETTINGS_NAV, getSettingsNavItem, normalizeSettingsNavKey, searchSettings, type SettingsNavKey, type SettingsSearchEntry } from '@/lib/settings-nav';
import useSettingsNavStore from '@/lib/state/settings-nav-store';

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
  | 'recycle-bin'
  | 'all-features';

// Pages of the Settings menu (see lib/settings-nav.ts).
type WebSettingsMenuKey = SettingsNavKey;

const SETTINGS_SECTION_MENU_MAP: Record<SettingsSection, WebSettingsMenuKey> = {
  'order-statuses': 'orders',
  'quality-control-checks': 'orders',
  'sale-sources': 'orders',
  'custom-services': 'orders',
  'order-timelines': 'orders',
  'shipping-zones': 'orders',
  'payment-methods': 'payments',
  'logistics-carriers': 'orders',
  'case-statuses': 'cases',
  'resolution-types': 'cases',
  'recycle-bin': 'system',
  'all-features': 'all-features',
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
  | 'whatsapp-settings'
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
  'whatsapp-settings',
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
  'all-features',
];

const normalizeSettingsSectionParam = (value?: string | null): SettingsSection | null => {
  const normalized = value?.trim().replace(/\?+$/, '') ?? '';
  // Shipping Zones now live inside Fulfillment Timelines.
  if (normalized === 'shipping-zones') return 'order-timelines';
  return SETTINGS_SECTIONS.includes(normalized as SettingsSection)
    ? (normalized as SettingsSection)
    : null;
};

// Old `?menu=` values (e.g. the removed Operations page) redirect to their new home.
const normalizeWebSettingsMenuParam = (value?: string | null): WebSettingsMenuKey | null => normalizeSettingsNavKey(value);

// Which Settings page an inline sub-panel belongs to, so the sidebar highlights the right item.
const PANEL_NAV_KEY: Record<WebInlineSettingsPanel, WebSettingsMenuKey> = {
  'account-settings': 'profile',
  'business-settings': 'business-details',
  'storefront-settings': 'integrations',
  'payment-accounts': 'payments',
  team: 'team',
  invitations: 'team',
  'woocommerce-settings': 'integrations',
  'order-automation': 'orders',
  'email-settings': 'notifications',
  'whatsapp-settings': 'notifications',
  'warehouse-settings': 'inventory',
  'category-manager': 'inventory',
  'product-variables': 'inventory',
  'product-options': 'inventory',
  'import-products': 'import-export',
  'import-customers': 'import-export',
  'import-orders': 'import-export',
  'import-ai': 'import-export',
  tasks: 'all-features',
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
  modern?: boolean;
  plainActions?: boolean;
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
  modern = false,
  plainActions = false,
}: EditableItemProps) {
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const primaryPillButtonStyle = {
    backgroundColor: FYLL_LIME,
    borderRadius: 999,
  } as const;
  // Bricolage is single-weight, so ask for 400 to stop the web faux-bolding it.
  const primaryPillTextStyle = {
    color: FYLL_LIME_INK,
    fontFamily: 'BricolageGrotesque_700Bold',
    fontWeight: '400',
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
    '#65A30D',
    '#0F766E',
    '#0284C7',
    '#C026D3',
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
      <View style={{ borderRadius: modern ? 24 : 12, overflow: 'hidden', backgroundColor: modern ? palette.card : colors.bg.card, borderWidth: 1, borderColor: modern ? palette.border : colors.border.light }}>
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
                <Text style={[primaryPillTextStyle, { fontSize: 14, fontWeight: '600' }]}>Save</Text>
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
          <View className="flex-row items-center p-4" style={{ minHeight: modern ? 76 : undefined }}>
            {showColor && (
              <View
                className="w-4 h-4 rounded-full mr-3"
                style={{ backgroundColor: item.color || '#6B7280' }}
              />
            )}
            <View className="flex-1">
              <Text style={{ color: modern ? palette.text : colors.text.primary, fontSize: modern ? 14 : undefined, fontWeight: modern ? '600' : undefined }} className={modern ? '' : 'font-medium text-sm'}>{item.name}</Text>
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
              style={modern ? { width: plainActions ? 30 : 38, height: plainActions ? 30 : 38, borderRadius: plainActions ? 0 : 19, alignItems: 'center', justifyContent: 'center', backgroundColor: plainActions ? 'transparent' : palette.softFill, marginRight: plainActions ? 2 : 6 } : undefined}
            >
              <Edit2 size={plainActions ? 14 : 16} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete();
              }}
              className="p-2 active:opacity-50"
              style={modern ? { width: plainActions ? 30 : 38, height: plainActions ? 30 : 38, borderRadius: plainActions ? 0 : 19, alignItems: 'center', justifyContent: 'center', backgroundColor: plainActions ? 'transparent' : palette.dangerBg } : undefined}
            >
              <Trash2 size={plainActions ? 14 : 16} color="#EF4444" strokeWidth={2} />
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
  const palette = usePaymentsPalette();
  // One icon colour for every row (the new branding), whatever colour the caller passed.
  const tintedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ color?: string }>, { color: palette.limeOnSurface })
    : icon;
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
        style={{
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: palette.hairline,
        }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
          {tintedIcon}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
        {rightText ? (
          <View style={{ minWidth: 26, height: 24, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
            <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '600' }}>{rightText}</Text>
          </View>
        ) : null}
        {rightElement ? rightElement : null}
        {showChevron && onPress ? <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} /> : null}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const appBuild = Application.nativeBuildVersion;
  const appVersionLabel = appBuild ? `Version ${appVersion} · Build ${appBuild}` : `Version ${appVersion}`;
  const { businessName, businessSlug, featureAccess } = useBusinessSettings();
  const { section: sectionParam, menu: menuParam, panel: panelParam } = useLocalSearchParams<{ section?: SettingsSection; menu?: WebSettingsMenuKey; panel?: string }>();
  const normalizedSectionParam = normalizeSettingsSectionParam(sectionParam);
  const normalizedMenuParam = normalizeWebSettingsMenuParam(menuParam);
  const normalizedPanelParam = normalizeWebInlinePanelParam(panelParam);
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const settingsPalette = usePaymentsPalette();
  const setNavActiveKey = useSettingsNavStore((state) => state.setActiveKey);
  const [settingsSearch, setSettingsSearch] = useState('');
  const pageHeadingStyle = usePageHeadingStyle(isMobile);
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
  const [showAddQcCheckForm, setShowAddQcCheckForm] = useState(false);
  const [showAddSaleSourceForm, setShowAddSaleSourceForm] = useState(false);
  const [showAddPaymentMethodForm, setShowAddPaymentMethodForm] = useState(false);
  const [showAddLogisticsCarrierForm, setShowAddLogisticsCarrierForm] = useState(false);
  const [showAddCustomServiceForm, setShowAddCustomServiceForm] = useState(false);
  const [showAddCaseStatusForm, setShowAddCaseStatusForm] = useState(false);
  const [showAddResolutionTypeForm, setShowAddResolutionTypeForm] = useState(false);
  const [restoringDeletedItemId, setRestoringDeletedItemId] = useState<string | null>(null);
  const [recycleBinSearchQuery, setRecycleBinSearchQuery] = useState('');
  const [showMilestoneReplay, setShowMilestoneReplay] = useState<boolean>(false);
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
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
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
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
        onPress={() => setShowOrderStatusModal(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full rounded-3xl overflow-hidden"
          style={{ backgroundColor: settingsPalette.card, maxWidth: 520, borderWidth: 1, borderColor: settingsPalette.border }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text style={{ color: settingsPalette.text, fontFamily: 'BricolageGrotesque_700Bold', fontSize: isMobile ? 18 : 22, lineHeight: isMobile ? 22 : 27, fontWeight: '400' }}>
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
                style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.border }}
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
                style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, minHeight: 50, justifyContent: 'center' }}
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
                        backgroundColor: selected ? FYLL_LIME : settingsPalette.softFill,
                        borderWidth: 1,
                        borderColor: selected ? FYLL_LIME : settingsPalette.outline,
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? FYLL_LIME_INK : settingsPalette.text,
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
                style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, minHeight: 50, justifyContent: 'center' }}
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
              style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, minHeight: 48 }}
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
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
        onPress={() => setShowOrderTimelineModal(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full rounded-3xl overflow-hidden"
          style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, maxWidth: 780, maxHeight: '92%' }}
        >
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 22 : 18, fontWeight: '700' }}>
                  {editingOrderTimelineId || editingTimelineZoneId ? 'Edit Fulfillment Timeline' : 'New Fulfillment Timeline'}
                </MoneyText>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {newOrderTypeFulfillmentMethod === 'pickup'
                    ? 'Set how long it takes to get an order ready for collection.'
                    : 'Choose the states, delivery window, and processing time before shipping.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowOrderTimelineModal(false)}
                className="w-10 h-10 rounded-2xl items-center justify-center active:opacity-70"
                style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20, gap: 14 }}>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                Timeline Name
              </Text>
              <View
                className="rounded-2xl px-4"
                style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}
              >
                <TextInput
                  placeholder={newOrderTypeFulfillmentMethod === 'pickup' ? 'e.g. Store pick up' : 'e.g. Lagos delivery'}
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
                Fulfillment Type
              </Text>
              <View style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: 999, borderWidth: 1, borderColor: settingsPalette.outline, backgroundColor: settingsPalette.inset }}>
                {([
                  { key: 'delivery' as const, label: 'Delivery' },
                  { key: 'pickup' as const, label: 'Pick up' },
                ]).map(({ key, label }) => {
                  const active = newOrderTypeFulfillmentMethod === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setNewOrderTypeFulfillmentMethod(key)}
                      style={{ flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : 'transparent' }}
                    >
                      <Text style={{ color: active ? FYLL_LIME_INK : settingsPalette.text, fontSize: 14, fontWeight: active ? '700' : '600' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 8 }}>
                {newOrderTypeFulfillmentMethod === 'pickup'
                  ? 'For orders the customer collects. Only processing days apply: no states and no delivery days.'
                  : 'For orders that are delivered. Add the states it covers and the delivery days below.'}
              </Text>
            </View>

            {newOrderTypeFulfillmentMethod === 'pickup' ? null : (
              <>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 7 }}>
                States
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
                      key={`timeline-state-${stateName}`}
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
                      key={`timeline-selected-${stateName}`}
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
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 }}>
                Delivery Timeline
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 8 }}>
                Business days to deliver to these states. Leave the states empty to apply this timeline everywhere.
              </Text>
              <View className="flex-row" style={{ gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View className="rounded-2xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                    <TextInput
                      placeholder="Min days (1)"
                      placeholderTextColor={colors.input.placeholder}
                      value={newTimelineDeliveryMin}
                      onChangeText={setNewTimelineDeliveryMin}
                      keyboardType="numeric"
                      style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View className="rounded-2xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, minHeight: 50, justifyContent: 'center' }}>
                    <TextInput
                      placeholder="Max days (3)"
                      placeholderTextColor={colors.input.placeholder}
                      value={newTimelineDeliveryMax}
                      onChangeText={setNewTimelineDeliveryMax}
                      keyboardType="numeric"
                      style={{ color: colors.input.text, fontSize: 15, fontWeight: '500' }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>
              </View>
            </View>

              </>
            )}

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
                  Min Processing Days
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
                  Max Processing Days
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
          </ScrollView>

          <View className="px-5 pb-5 pt-3 flex-row" style={{ gap: 12 }}>
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
                {editingOrderTimelineId || editingTimelineZoneId ? 'Save Changes' : 'Add Timeline'}
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
              borderRadius: 18,
              backgroundColor: settingsPalette.card,
              borderWidth: 1,
              borderColor: settingsPalette.border,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOpacity: 0.18,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <Pressable
              onPress={() => handleEditOrderTimeline(orderTimelineMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 46, paddingHorizontal: 14, gap: 9, borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}
            >
              <Edit2 size={14} color={settingsPalette.text} strokeWidth={2} />
              <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '600' }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDeleteOrderTimeline(orderTimelineMenu.id)}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 46, paddingHorizontal: 14, gap: 9, backgroundColor: settingsPalette.dangerBg }}
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
    setNewShippingZoneSelectedStates([]);
    setNewShippingZoneStateSearch('');
    setNewTimelineDeliveryMin('1');
    setNewTimelineDeliveryMax('3');
    setNewOrderTypeFulfillmentMethod('delivery');
    setEditingTimelineZoneId(null);
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

  const openEditOrderTimelineModal = (rowKey: string) => {
    const row = timelineRows.find((item) => item.key === rowKey);
    if (!row) return;
    setEditingOrderTimelineId(row.typeId);
    setEditingTimelineZoneId(row.zoneId);
    setNewOrderTypeName(row.name);
    setNewOrderTypeMinDays(String(row.processingMin));
    setNewOrderTypeMaxDays(String(row.processingMax));
    setNewOrderTypeShippingZoneId(row.zoneId);
    setNewOrderTypeWorkflowStatusIds(row.workflowStatusIds);
    setNewShippingZoneSelectedStates(row.states);
    setNewShippingZoneStateSearch('');
    setNewTimelineDeliveryMin(String(row.deliveryMin ?? 1));
    setNewTimelineDeliveryMax(String(row.deliveryMax ?? 3));
    setNewOrderTypeFulfillmentMethod(row.fulfillmentMethod);
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
    const states = newOrderTypeFulfillmentMethod === 'pickup' ? [] : newShippingZoneSelectedStates;
    const stateKey = [...states].sort().join('|');
    const alreadyExists = timelineRows.some((row) => (
      row.key !== (editingOrderTimelineId ?? (editingTimelineZoneId ? `zone:${editingTimelineZoneId}` : null))
      && row.name.trim().toLowerCase() === name.toLowerCase()
      && [...row.states].sort().join('|') === stateKey
    ));
    if (alreadyExists) {
      Alert.alert('Duplicate', 'A fulfillment timeline with this name already exists for those states.');
      return;
    }
    const minBusinessDays = parseTimelineDays(newOrderTypeMinDays, 1);
    const maxBusinessDays = Math.max(minBusinessDays, parseTimelineDays(newOrderTypeMaxDays, minBusinessDays));
    const deliveryMin = parseTimelineDays(newTimelineDeliveryMin, 1);
    const deliveryMax = Math.max(deliveryMin, parseTimelineDays(newTimelineDeliveryMax, deliveryMin));
    const workflowStatusIds = newOrderTypeWorkflowStatusIds.filter((statusId, index, list) => (
      !!orderStatuses.find((status) => status.id === statusId) && list.indexOf(statusId) === index
    ));

    // The states and delivery days live on a zone linked to this timeline. A zone shared with other order types is
    // never edited in place (that would change them too); a copy is made instead.
    const currentZoneId = editingTimelineZoneId;
    const zoneSharedWithOthers = Boolean(currentZoneId) && orderTimelineSettings.orderTypes.some(
      (type) => type.id !== editingOrderTimelineId && type.shippingZoneId === currentZoneId
    );
    let shippingZones = orderTimelineSettings.shippingZones;
    let shippingZoneId: string | null = null;
    if (states.length > 0) {
      if (currentZoneId && !zoneSharedWithOthers && shippingZones.some((zone) => zone.id === currentZoneId)) {
        shippingZoneId = currentZoneId;
        shippingZones = shippingZones.map((zone) => (
          zone.id === currentZoneId ? { ...zone, name, states, minBusinessDays: deliveryMin, maxBusinessDays: deliveryMax } : zone
        ));
      } else {
        shippingZoneId = `shipping-zone-${Date.now().toString(36)}`;
        shippingZones = [...shippingZones, { id: shippingZoneId, name, states, shippingFee: 0, minBusinessDays: deliveryMin, maxBusinessDays: deliveryMax }];
      }
    } else if (currentZoneId && !zoneSharedWithOthers) {
      // No states means "everywhere": the zone this timeline owned is no longer needed.
      shippingZones = shippingZones.filter((zone) => zone.id !== currentZoneId);
    }

    const nextType = { name, minBusinessDays, maxBusinessDays, shippingZoneId, workflowStatusIds, fulfillmentMethod: newOrderTypeFulfillmentMethod };
    const result = await saveTimelineSettings({
      ...orderTimelineSettings,
      shippingZones,
      orderTypes: editingOrderTimelineId
        ? orderTimelineSettings.orderTypes.map((item) => (item.id === editingOrderTimelineId ? { ...item, ...nextType } : item))
        : [...orderTimelineSettings.orderTypes, { id: `order-type-${Date.now().toString(36)}`, ...nextType }],
    });
    if (!result.success) return;
    setEditingOrderTimelineId(null);
    setEditingTimelineZoneId(null);
    setNewOrderTypeName('');
    setNewOrderTypeMinDays('3');
    setNewOrderTypeMaxDays('7');
    setNewOrderTypeShippingZoneId(null);
    setNewOrderTypeWorkflowStatusIds([]);
    setNewShippingZoneSelectedStates([]);
    setNewShippingZoneStateSearch('');
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

  const handleDeleteOrderTimeline = (rowKey: string) => {
    const row = timelineRows.find((item) => item.key === rowKey);
    setOrderTimelineMenu(null);
    if (!row) return;
    const zoneStillUsed = Boolean(row.zoneId) && orderTimelineSettings.orderTypes.some(
      (type) => type.id !== row.typeId && type.shippingZoneId === row.zoneId
    );
    saveTimelineSettings({
      ...orderTimelineSettings,
      orderTypes: orderTimelineSettings.orderTypes.filter((entry) => entry.id !== row.typeId),
      // The timeline's own states and delivery days go with it, unless another order type still uses that zone.
      shippingZones: row.zoneId && !zoneStillUsed
        ? orderTimelineSettings.shippingZones.filter((zone) => zone.id !== row.zoneId)
        : orderTimelineSettings.shippingZones,
    });
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
      showToast('Low stock alert updated.');
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
  useEffect(() => {
    const key = activeWebInlinePanel
      ? PANEL_NAV_KEY[activeWebInlinePanel]
      : activeSection
        ? SETTINGS_SECTION_MENU_MAP[activeSection]
        : activeWebSettingsMenu;
    setNavActiveKey(key);
  }, [activeSection, activeWebInlinePanel, activeWebSettingsMenu, setNavActiveKey]);
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
  const [newTimelineDeliveryMin, setNewTimelineDeliveryMin] = useState('1');
  const [newTimelineDeliveryMax, setNewTimelineDeliveryMax] = useState('3');
  // Delivery timelines have states and delivery days; pick-up timelines are processing days only.
  const [newOrderTypeFulfillmentMethod, setNewOrderTypeFulfillmentMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [editingTimelineZoneId, setEditingTimelineZoneId] = useState<string | null>(null);
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
  const mainMenuScrollRef = useRef<any>(null);
  const primaryPillButtonStyle = {
    backgroundColor: FYLL_LIME,
    borderRadius: 999,
  } as const;
  // Bricolage is single-weight, so ask for 400 to stop the web faux-bolding it.
  const primaryPillTextStyle = {
    color: FYLL_LIME_INK,
    fontFamily: 'BricolageGrotesque_700Bold',
    fontWeight: '400',
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

  const openSettingsSection = (requestedSection: SettingsSection) => {
    const section: SettingsSection = requestedSection === 'shipping-zones' ? 'order-timelines' : requestedSection;
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

  // One list: each fulfillment timeline = states + delivery days (the linked zone) + processing days (the order type).
  // Zones with no order type are kept and shown too, so nothing set up before disappears.
  const timelineRows = useMemo(() => {
    const zoneById = new Map(orderTimelineSettings.shippingZones.map((zone) => [zone.id, zone] as const));
    const linkedZoneIds = new Set<string>();
    type TimelineRow = {
      key: string;
      typeId: string | null;
      zoneId: string | null;
      name: string;
      states: string[];
      deliveryMin: number | null;
      deliveryMax: number | null;
      processingMin: number;
      processingMax: number;
      workflowStatusIds: string[];
      fulfillmentMethod: 'delivery' | 'pickup';
    };
    const rows: TimelineRow[] = orderTimelineSettings.orderTypes.map((type) => {
      const zone = type.shippingZoneId ? zoneById.get(type.shippingZoneId) ?? null : null;
      if (zone) linkedZoneIds.add(zone.id);
      return {
        key: type.id,
        typeId: type.id,
        zoneId: zone?.id ?? null,
        name: type.name,
        states: zone?.states ?? [],
        deliveryMin: zone?.minBusinessDays ?? null,
        deliveryMax: zone?.maxBusinessDays ?? null,
        processingMin: type.minBusinessDays,
        processingMax: type.maxBusinessDays,
        workflowStatusIds: type.workflowStatusIds ?? [],
        fulfillmentMethod: isPickupTimeline(type) ? 'pickup' : 'delivery',
      };
    });
    orderTimelineSettings.shippingZones.filter((zone) => !linkedZoneIds.has(zone.id)).forEach((zone) => {
      rows.push({
        key: `zone:${zone.id}`,
        typeId: null,
        zoneId: zone.id,
        name: zone.name,
        states: zone.states,
        deliveryMin: zone.minBusinessDays,
        deliveryMax: zone.maxBusinessDays,
        processingMin: orderTimelineSettings.defaultOrderType.minBusinessDays,
        processingMax: orderTimelineSettings.defaultOrderType.maxBusinessDays,
        workflowStatusIds: [],
        fulfillmentMethod: 'delivery',
      });
    });
    return rows;
  }, [orderTimelineSettings]);

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
    if (activeSection || activeMobileInlinePanel) return;

    const restoreMainMenuScroll = () => {
      const scrollY = mainMenuScrollYRef.current;
      if (scrollY <= 0 || !mainMenuScrollRef.current) return;

      if (typeof mainMenuScrollRef.current.scrollToPosition === 'function') {
        mainMenuScrollRef.current.scrollToPosition(0, scrollY, false);
        return;
      }
      mainMenuScrollRef.current.scrollTo?.({ x: 0, y: scrollY, animated: false });
    };

    const frame = requestAnimationFrame(restoreMainMenuScroll);
    const timer = setTimeout(restoreMainMenuScroll, 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [activeMobileInlinePanel, activeSection]);

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
    if (activeSection === 'sale-sources') {
      setShowAddSaleSourceForm(false);
    }
    if (activeSection === 'payment-methods') {
      setShowAddPaymentMethodForm(false);
    }
    if (activeSection === 'logistics-carriers') {
      setShowAddLogisticsCarrierForm(false);
    }
    if (activeSection === 'custom-services') {
      setShowAddCustomServiceForm(false);
    }
    if (activeSection === 'case-statuses') {
      setShowAddCaseStatusForm(false);
    }
    if (activeSection === 'resolution-types') {
      setShowAddResolutionTypeForm(false);
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
              <View className="p-5 mb-5" style={{ position: 'relative', overflow: 'hidden', minHeight: 156, justifyContent: 'center', borderRadius: 28, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, shadowColor: '#000000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
                <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
                <View className="flex-row items-center" style={{ gap: 15 }}>
                  <LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Recovery centre</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 27, lineHeight: 32 }}>{recycleBin.length} deleted {recycleBin.length === 1 ? 'item' : 'items'}</MoneyText>
                    <Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 2 }}>Restore records or remove them permanently</Text>
                  </View>
                </View>
              </View>

              <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Deleted items</Text>
              <View className="rounded-3xl p-4 mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View
                  className="rounded-2xl flex-row items-center px-4"
                  style={{ height: 48, backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline }}
                >
                  <Search size={16} color={settingsPalette.faint} strokeWidth={2.2} />
                  <TextInput
                    placeholder="Search deleted items"
                    placeholderTextColor={colors.input.placeholder}
                    value={recycleBinSearchQuery}
                    onChangeText={setRecycleBinSearchQuery}
                    style={{ color: settingsPalette.text, fontSize: 14, flex: 1, marginLeft: 9 }}
                    selectionColor={FYLL_LIME}
                  />
                  <SearchClearButton visible={Boolean(recycleBinSearchQuery.trim())} onPress={() => setRecycleBinSearchQuery('')} />
                </View>
                <Text style={{ color: settingsPalette.faint, fontSize: 11, marginTop: 10, marginLeft: 2 }}>{filteredRecycleBin.length} of {recycleBin.length} items shown</Text>
              </View>

              {recentlyRestoredItems.length > 0 ? (
                <View className="rounded-3xl p-4 mb-4" style={{ backgroundColor: settingsPalette.nudgeBg, borderWidth: 1, borderColor: settingsPalette.nudgeBorder }}>
                  <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                    <Text style={{ color: settingsPalette.text }} className="font-semibold text-sm">Recently restored</Text>
                    <Text style={{ color: settingsPalette.faint }} className="text-[11px]">{recentlyRestoredItems.length}</Text>
                  </View>
                  <Text style={{ color: settingsPalette.nudgeSub }} className="text-xs mt-1">
                    Tap a chip to copy its name, then search for it in the relevant page if you need to delete it again.
                  </Text>
                  <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                    {recentlyRestoredItems.map((item) => (
                      <Pressable
                        key={`restored-${item.id}`}
                        onPress={() => void handleCopyRecentlyRestoredItem(item)}
                        className="rounded-full flex-row items-center active:opacity-75"
                        style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, paddingHorizontal: 10, paddingVertical: 7, gap: 6 }}
                      >
                        <RotateCcw size={12} color="#059669" strokeWidth={2.2} />
                        <Text style={{ color: settingsPalette.text }} className="text-xs font-semibold" numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={{ color: settingsPalette.faint }} className="text-[10px]" numberOfLines={1}>
                          {getDeletedItemTypeLabel(item)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {recycleBin.length === 0 ? (
                <View className="rounded-3xl p-7 items-center" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                  <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}><Trash2 size={21} color={settingsPalette.limeOnSurface} strokeWidth={2} /></View>
                  <Text style={{ color: settingsPalette.text }} className="font-semibold mt-3">Nothing deleted</Text>
                  <Text style={{ color: settingsPalette.faint }} className="text-xs text-center mt-1">
                    Deleted items will appear here before they are permanently removed.
                  </Text>
                </View>
              ) : filteredRecycleBin.length === 0 ? (
                <View className="rounded-3xl p-7 items-center" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
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
                    <View key={item.id} className="rounded-3xl p-4 mb-3" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                      <View className="flex-row items-center">
                        <View className="w-[42px] h-[42px] rounded-[13px] items-center justify-center mr-3" style={{ backgroundColor: settingsPalette.dangerBg }}>
                          <Trash2 size={17} color={settingsPalette.danger} strokeWidth={2} />
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: settingsPalette.text }} className="font-semibold text-sm">{item.label}</Text>
                          <Text style={{ color: settingsPalette.faint }} className="text-[11px] mt-0.5">
                            {getDeletedItemTypeLabel(item)} · Deleted {formatDeletedAt(item.deletedAt)}
                          </Text>
                          {item.parentLabel ? (
                            <Text style={{ color: settingsPalette.muted }} className="text-[11px] mt-0.5">
                              From {item.parentLabel}
                            </Text>
                          ) : null}
                        </View>
                        <View className="flex-row items-center gap-2 ml-2">
                          <Pressable
                            onPress={() => handleRestoreDeletedItem(item)}
                            disabled={isRestoring}
                            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                            style={{ backgroundColor: FYLL_LIME, opacity: isRestoring ? 0.6 : 1 }}
                          >
                            <RotateCcw size={14} color={FYLL_LIME_INK} strokeWidth={2.5} />
                          </Pressable>
                          <Pressable
                            onPress={() => { setConfirmDeleteText(''); setConfirmDeleteItem(item); }}
                            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                            style={{ backgroundColor: settingsPalette.dangerBg }}
                          >
                            <Trash2 size={13} color={settingsPalette.danger} strokeWidth={2} />
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
                    style={{ width: '100%', maxWidth: 380, borderRadius: 26, padding: 20, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, gap: 12 }}
                  >
                    <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: settingsPalette.dangerBg }}>
                      <Trash2 size={18} color={settingsPalette.danger} strokeWidth={2} />
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
                      className="rounded-2xl px-4"
                      selectionColor={FYLL_LIME}
                      style={{ height: 50, borderWidth: 1, borderColor: settingsPalette.outline, color: settingsPalette.text, backgroundColor: settingsPalette.inset, fontSize: 14 }}
                    />
                    <View className="flex-row gap-2 mt-1">
                      <Pressable
                        onPress={() => setConfirmDeleteItem(null)}
                        className="flex-1 rounded-full items-center justify-center active:opacity-70"
                        style={{ height: 46, backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline }}
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
                        style={{ height: 46, backgroundColor: settingsPalette.danger, opacity: confirmDeleteText.trim().toUpperCase() === 'DELETE' ? 1 : 0.4 }}
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
            <View className="p-5 mb-7" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, shadowColor: '#000000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
              <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
              <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: FYLL_LIME }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 18 }}>
                <LinearGradient colors={[FYLL_LIME, '#879400']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><ShoppingCart size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Order workflow</Text>
                  <MoneyText style={{ color: settingsPalette.text, fontSize: 27, lineHeight: 32, letterSpacing: -0.7 }}>{orderStatuses.length} statuses</MoneyText>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 2 }}>{fulfillmentOrderStatuses.length} in fulfillment · {exceptionOrderStatuses.length} exceptions</Text>
                </View>
              </View>
              <Pressable
                onPress={openCreateOrderStatusModal}
                className="flex-row items-center justify-center active:opacity-80"
                style={{ height: 46, borderRadius: 999, gap: 8, backgroundColor: FYLL_LIME }}
              >
                <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.5} />
                <Text style={{ color: FYLL_LIME_INK, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: isMobile ? 14 : 15 }}>Add new status</Text>
              </Pressable>

              {false && showAddOrderStatusForm ? (
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

            <View className="mb-3" style={{ paddingHorizontal: 4 }}>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase' }}>Fulfillment flow</Text>
              <Text style={{ color: settingsPalette.faint, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                Move progress statuses into the order your business processes an order.
              </Text>
            </View>

            {isMobile ? (
              <View style={{ marginLeft: 3 }}>
                {fulfillmentOrderStatuses.map((status, index) => {
                  const trackingLabel = ORDER_TRACKING_STAGE_OPTIONS.find((option) => option.value === (status.trackingStage ?? 'received'))?.label ?? 'Order Received';
                  return (
                    <View key={status.id} style={{ flexDirection: 'row', minHeight: 104 }}>
                      <View style={{ width: 38, alignItems: 'center' }}>
                        {index > 0 ? <View style={{ position: 'absolute', top: 0, width: 2, height: 16, backgroundColor: settingsPalette.outline }} /> : null}
                        {index < fulfillmentOrderStatuses.length - 1 ? <View style={{ position: 'absolute', top: 34, bottom: 0, width: 2, backgroundColor: settingsPalette.outline }} /> : null}
                        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg, borderWidth: 1, borderColor: settingsPalette.outline, zIndex: 1 }}>
                          <Text style={{ color: settingsPalette.limeOnSurface, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 12, fontWeight: '400' }}>{index + 1}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, marginLeft: 8, marginBottom: 12, minHeight: 88, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: status.color || '#6B7280', flexShrink: 0 }} />
                        <Pressable onPress={() => openEditOrderStatusModal(status.id)} style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>{status.name}</Text>
                          <Text numberOfLines={1} style={{ color: settingsPalette.faint, fontSize: 11.5, marginTop: 4 }}>{trackingLabel}</Text>
                          {status.wooCommerceStatusSlug ? <Text numberOfLines={1} style={{ color: settingsPalette.muted, fontSize: 10, marginTop: 3 }}>WooCommerce · {status.wooCommerceStatusSlug}</Text> : null}
                        </Pressable>
                        <View style={{ gap: 5 }}>
                          <Pressable onPress={() => handleMoveOrderStatus(status.id, -1)} disabled={index === 0} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.softFill, opacity: index === 0 ? 0.28 : pressed ? 0.65 : 1 })}><ChevronUp size={15} color={settingsPalette.text} strokeWidth={2.2} /></Pressable>
                          <Pressable onPress={() => handleMoveOrderStatus(status.id, 1)} disabled={index === fulfillmentOrderStatuses.length - 1} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.softFill, opacity: index === fulfillmentOrderStatuses.length - 1 ? 0.28 : pressed ? 0.65 : 1 })}><ChevronDown size={15} color={settingsPalette.text} strokeWidth={2.2} /></Pressable>
                        </View>
                        <Pressable onPress={(event) => openOrderStatusMenu(status.id, event)} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.softFill, opacity: pressed ? 0.65 : 1 })}><MoreVertical size={16} color={settingsPalette.faint} strokeWidth={2.2} /></Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : fulfillmentOrderStatuses.map((status, index) => (
              <View key={status.id} style={{ marginBottom: 10 }}>
                <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
                  <View className="rounded-full items-center justify-center" style={{ minWidth: 28, height: 28, backgroundColor: settingsPalette.nudgeBg, borderWidth: 1, borderColor: settingsPalette.outline }}><Text style={{ color: settingsPalette.limeOnSurface, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 12, fontWeight: '400' }}>{index + 1}</Text></View>
                  <Text style={{ color: settingsPalette.faint }} className="flex-1 text-xs font-semibold">Step {index + 1}</Text>
                  <Pressable onPress={() => handleMoveOrderStatus(status.id, -1)} disabled={index === 0} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70" style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, opacity: index === 0 ? 0.35 : 1 }}><ChevronUp size={17} color={settingsPalette.text} strokeWidth={2.2} /></Pressable>
                  <Pressable onPress={() => handleMoveOrderStatus(status.id, 1)} disabled={index === fulfillmentOrderStatuses.length - 1} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70" style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, opacity: index === fulfillmentOrderStatuses.length - 1 ? 0.35 : 1 }}><ChevronDown size={17} color={settingsPalette.text} strokeWidth={2.2} /></Pressable>
                </View>
                <EditableItem item={status} showColor showTrackingStage showWooCommerceStatusSlug modern onUpdate={(name, color, _, __, trackingStage, wooCommerceStatusSlug) => { updateOrderStatus(status.id, { name, color, trackingStage, wooCommerceStatusSlug }); triggerGlobalSave(); }} onDelete={() => openDeleteSetting('order-statuses', status)} />
              </View>
            ))}

            {exceptionOrderStatuses.length > 0 ? (
              <View className="mt-4">
                <View className="mb-3" style={{ paddingHorizontal: 4 }}>
                  <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase' }}>Exception statuses</Text>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                    Used when an order leaves the normal fulfillment flow.
                  </Text>
                </View>

                {exceptionOrderStatuses.map((status) => {
                  const trackingLabel = ORDER_TRACKING_STAGE_OPTIONS.find((option) => option.value === (status.trackingStage ?? 'cancelled'))?.label ?? 'Cancelled';
                  return isMobile ? (
                    <View key={status.id} style={{ minHeight: 76, marginBottom: 10, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: status.color || '#EF4444' }} />
                      <Pressable onPress={() => openEditOrderStatusModal(status.id)} style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>{status.name}</Text>
                        <Text numberOfLines={1} style={{ color: settingsPalette.faint, fontSize: 11.5, marginTop: 4 }}>{trackingLabel}</Text>
                      </Pressable>
                      <Pressable onPress={(event) => openOrderStatusMenu(status.id, event)} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.softFill, opacity: pressed ? 0.65 : 1 })}><MoreVertical size={16} color={settingsPalette.faint} strokeWidth={2.2} /></Pressable>
                    </View>
                  ) : (
                    <View key={status.id} style={{ marginBottom: 10 }}>
                      <EditableItem item={status} showColor showTrackingStage showWooCommerceStatusSlug modern onUpdate={(name, color, _, __, trackingStage, wooCommerceStatusSlug) => { updateOrderStatus(status.id, { name, color, trackingStage, wooCommerceStatusSlug }); triggerGlobalSave(); }} onDelete={() => openDeleteSetting('order-statuses', status)} />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );

      case 'quality-control-checks':
        return (
          <View className="pt-1">
            <View className="p-5 mb-7" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, shadowColor: '#000000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
              <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
              <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: FYLL_LIME }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 18 }}>
                <LinearGradient colors={[FYLL_LIME, '#879400']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><ListTodo size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Dispatch proof</Text>
                  <MoneyText style={{ color: settingsPalette.text, fontSize: 27, lineHeight: 32, letterSpacing: -0.7 }}>{qcChecklistRequirements.length} {qcChecklistRequirements.length === 1 ? 'check' : 'checks'}</MoneyText>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 2 }}>Required before an order is dispatched</Text>
                </View>
              </View>
              <View style={{ gap: 10 }}>
                {showAddQcCheckForm ? (
                  <View>
                    <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 }}>New check</Text>
                    <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline, height: 52, justifyContent: 'center' }}>
                      <TextInput autoFocus placeholder="e.g. Confirm lenses are clean" placeholderTextColor={colors.input.placeholder} value={newItemName} onChangeText={setNewItemName} style={{ color: settingsPalette.text, fontSize: isMobile ? 14 : 15 }} selectionColor={colors.text.primary} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable onPress={() => { setNewItemName(''); setShowAddQcCheckForm(false); }} className="rounded-full items-center justify-center active:opacity-70" style={{ flex: 1, height: 46, backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline }}><Text style={{ color: settingsPalette.text, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 13, fontWeight: '400' }}>Cancel</Text></Pressable>
                      <Pressable onPress={() => { if (!newItemName.trim()) return; handleAddItem(); setShowAddQcCheckForm(false); }} className="rounded-full flex-row items-center justify-center active:opacity-80" style={[primaryPillButtonStyle, { flex: 1.4, height: 46, gap: 8 }]}><Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.5} /><Text style={[primaryPillTextStyle, { fontSize: isMobile ? 14 : 15 }]}>Add check</Text></Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => { setNewItemName(''); setShowAddQcCheckForm(true); }} className="rounded-full flex-row items-center justify-center active:opacity-80" style={[primaryPillButtonStyle, { height: 46, gap: 8 }]}><Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.5} /><Text style={[primaryPillTextStyle, { fontSize: isMobile ? 14 : 15 }]}>New check</Text></Pressable>
                )}
                <Pressable
                  onPress={() => {
                    resetQcChecklistRequirements();
                    triggerGlobalSave();
                  }}
                  className="rounded-full flex-row items-center active:opacity-80"
                  style={{ height: 44, justifyContent: 'center', gap: 8, backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline }}
                >
                  <RotateCcw size={15} color={settingsPalette.text} strokeWidth={2} />
                  <Text style={{ color: settingsPalette.text, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 13, fontWeight: '400' }}>Restore defaults</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ paddingHorizontal: 4, marginBottom: 10 }}>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase' }}>Dispatch checklist</Text>
              <Text style={{ color: settingsPalette.faint, fontSize: 12, lineHeight: 17, marginTop: 4 }}>Team members complete these checks before dispatch.</Text>
            </View>
            <View style={{ borderRadius: 26, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, paddingHorizontal: 16, overflow: 'hidden' }}>
              {qcChecklistRequirements.length === 0 ? (
                <View className="p-5">
                  <Text style={{ color: settingsPalette.text }} className="font-semibold text-sm">No checks configured</Text>
                  <Text style={{ color: settingsPalette.faint }} className="text-xs mt-1">
                    Add checks for the dispatch proof your business needs.
                  </Text>
                </View>
              ) : qcChecklistRequirements.map((item, index) => (
                <View
                  key={item.key}
                  className="py-4 flex-row items-center"
                  style={{ minHeight: 72, gap: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: settingsPalette.hairline }}
                >
                  <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: settingsPalette.nudgeBg }}>
                    <Check size={17} color={settingsPalette.limeOnSurface} strokeWidth={2.6} />
                  </View>
                  <Text style={{ color: settingsPalette.text, fontSize: isMobile ? 14 : 15 }} className="flex-1 font-semibold">
                    {item.label}
                  </Text>
                  <Pressable
                    onPress={() => openDeleteSetting('quality-control-checks', { id: item.key, name: item.label })}
                    className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: settingsPalette.dangerBg }}
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
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']} style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Case workflow</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {caseStatuses.length} {caseStatuses.length === 1 ? 'status' : 'statuses'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Define the stages your team uses to track customer issues from opening to resolution.
                </Text>
              </View>
            </View>

            <Pressable onPress={() => setShowAddCaseStatusForm((value) => !value)} className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4" style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}>
              {showAddCaseStatusForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showAddCaseStatusForm ? 'Close' : 'New case status'}</MoneyText>
            </Pressable>

            {showAddCaseStatusForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add case status</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput autoFocus placeholder="e.g. Investigating" placeholderTextColor={colors.input.placeholder} value={newItemName} onChangeText={setNewItemName} style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, minHeight: 50, justifyContent: 'center' }}>
                  <TextInput placeholder="Description (optional)" placeholderTextColor={colors.input.placeholder} value={newItemDescription} onChangeText={setNewItemDescription} style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>Status colour</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                {colorOptions.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setNewItemColor(color);
                    }}
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: color,
                      borderWidth: newItemColor === color ? 3 : 0,
                      borderColor: settingsPalette.text,
                    }}
                  >
                    {newItemColor === color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save status</MoneyText>
              </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Case statuses</Text>
            {caseStatuses.map((status) => (
              <EditableItem
                key={status.id}
                item={status}
                showColor
                showDescription
                modern
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
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient
                    colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']}
                    style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Tag size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Order attribution</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {saleSources.length} {saleSources.length === 1 ? 'source' : 'sources'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Keep every sales channel organised so you can see where orders and revenue originate.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setShowAddSaleSourceForm((value) => !value)}
              className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4"
              style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}
            >
              {showAddSaleSourceForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>
                {showAddSaleSourceForm ? 'Close' : 'New source'}
              </MoneyText>
            </Pressable>

            {showAddSaleSourceForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add sale source</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput
                    autoFocus
                    placeholder="e.g. Instagram, walk-in or website"
                    placeholderTextColor={colors.input.placeholder}
                    value={newItemName}
                    onChangeText={setNewItemName}
                    onSubmitEditing={handleAddItem}
                    returnKeyType="done"
                    style={{ color: settingsPalette.text, fontSize: 14 }}
                    selectionColor={FYLL_LIME}
                  />
                </View>
                <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save source</MoneyText>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Saved sources</Text>
            {saleSources.map((source) => (
              <EditableItem
                key={source.id}
                item={source}
                modern
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
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']} style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                    <Wrench size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Order extras</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {customServices.length} {customServices.length === 1 ? 'add-on' : 'add-ons'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Create optional extras such as lens coatings, gift wrapping, or express delivery.
                </Text>
              </View>
            </View>

            <Pressable onPress={() => setShowAddCustomServiceForm((value) => !value)} className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4" style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}>
              {showAddCustomServiceForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showAddCustomServiceForm ? 'Close' : 'New add-on'}</MoneyText>
            </Pressable>

            {showAddCustomServiceForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add order extra</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput autoFocus placeholder="e.g. Anti-glare coating" placeholderTextColor={colors.input.placeholder} value={newItemName} onChangeText={setNewItemName} style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput placeholder="Default price (optional)" placeholderTextColor={colors.input.placeholder} value={newItemPrice} onChangeText={setNewItemPrice} onSubmitEditing={handleAddItem} returnKeyType="done" keyboardType="numeric" style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save add-on</MoneyText>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Saved add-ons</Text>
            {customServices.map((service) => (
              <EditableItem
                key={service.id}
                item={service}
                showPrice
                modern
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
              className="rounded-3xl overflow-hidden mb-4"
              style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
            >
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient
                    colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']}
                    style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Clock3 size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Delivery planning</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {timelineRows.length} {timelineRows.length === 1 ? 'timeline' : 'timelines'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Set processing and delivery windows by location so every order has a clear expected date.
                </Text>
              </View>
            </View>

            <Pressable onPress={openCreateOrderTimelineModal} className="rounded-full flex-row items-center justify-center active:opacity-80 mb-5" style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}>
              <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>New timeline</MoneyText>
            </Pressable>

            <View
              className="rounded-3xl mb-4"
              style={{ padding: isWebDesktop ? 22 : 16, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
            >
              <Text style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 15 : 14, fontWeight: '700' }}>Default timeline</Text>
              <Text style={{ color: settingsPalette.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Used when an order has no more specific timeline match.</Text>

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
                      style={{ color: colors.input.text, fontSize: isWebDesktop ? 15 : 14, fontWeight: '500' }}
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
                      style={{ color: colors.input.text, fontSize: isWebDesktop ? 15 : 14, fontWeight: '500' }}
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
                      style={{ color: colors.input.text, fontSize: isWebDesktop ? 15 : 14, fontWeight: '500', textAlign: 'center' }}
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
                  )} business days before each timeline's delivery days are added.
                </Text>
              </View>
            </View>

            <View
              className="rounded-3xl p-4 mb-5"
              style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
            >
              <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>
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

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Fulfillment timelines</Text>

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
                    Timeline
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.6, paddingHorizontal: 20 }}>
                    States
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 0.9, paddingHorizontal: 20 }}>
                    Delivery
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 0.9, paddingHorizontal: 20 }}>
                    Processing
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', width: 92, paddingHorizontal: 20 }}>
                    Action
                  </Text>
                </View>

                {timelineRows.map((row, index) => (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: 'row',
                      minHeight: 68,
                      alignItems: 'center',
                      borderBottomWidth: index < timelineRows.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                    }}
                  >
                    <View style={{ flex: 2, paddingHorizontal: 20, justifyContent: 'center' }}>
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                        {row.name}
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 4 }} numberOfLines={1}>
                        {row.workflowStatusIds
                          .map((statusId) => orderStatuses.find((status) => status.id === statusId)?.name)
                          .filter(Boolean)
                          .join(' -> ') || 'No workflow sequence'}
                      </Text>
                    </View>
                    <View style={{ flex: 1.6, paddingHorizontal: 20, justifyContent: 'center' }}>
                      {row.states.length > 0 ? (
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400', lineHeight: 17 }} numberOfLines={2}>
                          {row.states.join(', ')}
                        </Text>
                      ) : (
                        <Text style={{ color: colors.text.muted, fontSize: 12 }}>{row.fulfillmentMethod === 'pickup' ? 'Pick up only' : 'All states'}</Text>
                      )}
                    </View>
                    <Text style={{ color: colors.text.primary, flex: 0.9, fontSize: 12, fontWeight: '500', paddingHorizontal: 20 }}>
                      {row.deliveryMin != null && row.deliveryMax != null ? `${row.deliveryMin}-${row.deliveryMax} days` : '—'}
                    </Text>
                    <Text style={{ color: colors.text.primary, flex: 0.9, fontSize: 12, fontWeight: '500', paddingHorizontal: 20 }}>
                      {row.processingMin}-{row.processingMax} days
                    </Text>
                    <View style={{ width: 92, alignItems: 'flex-end', paddingHorizontal: 20 }}>
                      <Pressable
                        onPress={(event) => openOrderTimelineMenu(row.key, event)}
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
                {timelineRows.map((row) => (
                  <View
                    key={row.key}
                    className="rounded-3xl p-4 mb-3"
                    style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
                  >
                    <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 17, marginTop: 8 }}>
                          {row.fulfillmentMethod === 'pickup' ? 'Pick up only' : row.states.length > 0 ? row.states.join(', ') : 'All states'}
                        </Text>
                        <View className="flex-row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: settingsPalette.nudgeBg }}>
                            <Text style={{ color: settingsPalette.text, fontSize: 10, fontWeight: '700' }}>Delivery {row.deliveryMin != null && row.deliveryMax != null ? `${row.deliveryMin}-${row.deliveryMax}d` : '—'}</Text>
                          </View>
                          <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: settingsPalette.inset }}>
                            <Text style={{ color: settingsPalette.text, fontSize: 10, fontWeight: '700' }}>Processing {row.processingMin}-{row.processingMax}d</Text>
                          </View>
                        </View>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 6 }}>
                          {row.workflowStatusIds
                            .map((statusId) => orderStatuses.find((status) => status.id === statusId)?.name)
                            .filter(Boolean)
                            .join(' -> ') || 'No workflow sequence'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={(event) => openOrderTimelineMenu(row.key, event)}
                        className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}
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

      case 'all-features':
        return <FeaturesSettings onConfigure={handleConfigureFeature} />;

      case 'payment-methods':
        return (
          <View className="pt-1">
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  {!isWebDesktop ? (
                    <LinearGradient
                      colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']}
                      style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <CreditCard size={22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                    </LinearGradient>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Checkout options</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {paymentMethods.length} {paymentMethods.length === 1 ? 'method' : 'methods'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Manage the payment choices available when orders are recorded and checked out.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setShowAddPaymentMethodForm((value) => !value)}
              className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4"
              style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}
            >
              {showAddPaymentMethodForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>
                {showAddPaymentMethodForm ? 'Close' : 'New payment method'}
              </MoneyText>
            </Pressable>

            {showAddPaymentMethodForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add payment method</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput
                    autoFocus
                    placeholder="e.g. Bank transfer or POS"
                    placeholderTextColor={colors.input.placeholder}
                    value={newItemName}
                    onChangeText={setNewItemName}
                    onSubmitEditing={handleAddItem}
                    returnKeyType="done"
                    style={{ color: settingsPalette.text, fontSize: 14 }}
                    selectionColor={FYLL_LIME}
                  />
                </View>
                <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save payment method</MoneyText>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Payment methods</Text>
            {paymentMethods.map((method) => (
              <EditableItem
                key={method.id}
                item={method}
                modern
                plainActions
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
              <View className="rounded-3xl p-4 mt-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.nudgeBorder }}>
                <View className="flex-row items-center" style={{ gap: 9 }}>
                  <AlertTriangle size={17} color={settingsPalette.limeOnSurface} strokeWidth={2.2} />
                  <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>Payment labels to clean up</Text>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 10 }}>
                  These labels exist on saved orders but not in your current payment methods. Merge them into the correct method.
                </Text>

                {unmappedOrderPaymentMethods.map((legacyMethod) => (
                  <View
                    key={legacyMethod.name}
                    className="py-3"
                    style={{ borderTopWidth: 1, borderTopColor: settingsPalette.hairline }}
                  >
                    <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: settingsPalette.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
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
                          style={{ minHeight: 36, borderWidth: 1, borderColor: settingsPalette.outline, backgroundColor: settingsPalette.inset }}
                        >
                          <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '600' }}>
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
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient
                    colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']}
                    style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Truck size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.2} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Delivery partners</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {logisticsCarriers.length} {logisticsCarriers.length === 1 ? 'carrier' : 'carriers'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Manage the delivery companies available when assigning and tracking order shipments.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setShowAddLogisticsCarrierForm((value) => !value)}
              className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4"
              style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}
            >
              {showAddLogisticsCarrierForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>
                {showAddLogisticsCarrierForm ? 'Close' : 'New carrier'}
              </MoneyText>
            </Pressable>

            {showAddLogisticsCarrierForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add logistics carrier</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput
                    autoFocus
                    placeholder="e.g. DHL or local dispatch"
                    placeholderTextColor={colors.input.placeholder}
                    value={newItemName}
                    onChangeText={setNewItemName}
                    onSubmitEditing={handleAddItem}
                    returnKeyType="done"
                    style={{ color: settingsPalette.text, fontSize: 14 }}
                    selectionColor={FYLL_LIME}
                  />
                </View>
                <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save carrier</MoneyText>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Saved carriers</Text>
            {logisticsCarriers.map((carrier) => (
              <EditableItem
                key={carrier.id}
                item={carrier}
                modern
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
            <View className="rounded-3xl overflow-hidden mb-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#DDEB3F', '#9EAD00'] : ['#E3EC54', '#B9C722']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 5 }} />
              <View style={{ padding: isWebDesktop ? 24 : 18 }}>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <LinearGradient colors={resolvedThemeMode === 'dark' ? ['#E5EF50', '#A9B700'] : ['#E8F15A', '#C4D12B']} style={{ width: isWebDesktop ? 54 : 48, height: isWebDesktop ? 54 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={isWebDesktop ? 25 : 22} color={FYLL_LIME_INK} strokeWidth={2.5} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Case outcomes</Text>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, fontWeight: '700', marginTop: 2 }}>
                      {resolutionTypes.length} {resolutionTypes.length === 1 ? 'resolution' : 'resolutions'}
                    </MoneyText>
                  </View>
                </View>
                <Text style={{ color: settingsPalette.muted, fontSize: isWebDesktop ? 13 : 12, lineHeight: isWebDesktop ? 20 : 18, marginTop: 14 }}>
                  Define the outcomes your team records when a customer case is resolved.
                </Text>
              </View>
            </View>

            <Pressable onPress={() => setShowAddResolutionTypeForm((value) => !value)} className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4" style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}>
              {showAddResolutionTypeForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showAddResolutionTypeForm ? 'Close' : 'New resolution type'}</MoneyText>
            </Pressable>

            {showAddResolutionTypeForm ? (
              <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add resolution type</Text>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 50, justifyContent: 'center' }}>
                  <TextInput autoFocus placeholder="e.g. Refund issued" placeholderTextColor={colors.input.placeholder} value={newItemName} onChangeText={setNewItemName} style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <View className="rounded-2xl px-4 mb-3" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, minHeight: 50, justifyContent: 'center' }}>
                  <TextInput placeholder="Description (optional)" placeholderTextColor={colors.input.placeholder} value={newItemDescription} onChangeText={setNewItemDescription} onSubmitEditing={handleAddItem} returnKeyType="done" style={{ color: settingsPalette.text, fontSize: 14 }} selectionColor={FYLL_LIME} />
                </View>
                <Pressable onPress={handleAddItem} className="rounded-full items-center active:opacity-80" style={{ minHeight: 48, justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save resolution type</MoneyText>
                </Pressable>
              </View>
            ) : null}

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Resolution types</Text>
            {resolutionTypes.map((type) => (
              <EditableItem
                key={type.id}
                item={type}
                showDescription
                modern
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
    { id: 'business-settings', title: 'Business Settings', description: 'Name, logo, customer contact', icon: <Building2 size={18} color="#10B981" strokeWidth={2} />, onPress: () => openSettingsPanel('business-settings', '/business-settings?from=settings') },
    ...(canUseStorefront ? [
      { id: 'storefront-settings', title: 'Storefront', description: 'Public shop link and storefront publishing', icon: <Store size={18} color="#8B5CF6" strokeWidth={2} />, onPress: () => openSettingsPanel('storefront-settings', '/storefront-settings?from=settings&menu=integrations') },
    ] : []),
    ...(canUseWooCommerce ? [
      { id: 'woocommerce-settings', title: 'WooCommerce', description: 'Store URL and API keys', icon: <ShoppingCart size={18} color="#2563EB" strokeWidth={2} />, onPress: () => openSettingsPanel('woocommerce-settings', '/woocommerce-settings?from=settings') },
    ] : []),
    { id: 'recycle-bin', title: 'Recycle Bin', description: 'Restore deleted orders, products, and finance rows', icon: <Trash2 size={18} color="#EF4444" strokeWidth={2} />, rightText: `${recycleBin.length}`, onPress: () => openSettingsSection('recycle-bin') },
    ...(currentUser?.role === 'admin' ? [
      { id: 'milestone-replay', title: 'Replay milestone celebration', description: 'Watch your latest order milestone again', icon: <Award size={18} color="#D5E057" strokeWidth={2} />, onPress: () => setShowMilestoneReplay(true) },
    ] : []),
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
    { id: 'order-timelines', title: 'Fulfillment Timelines', description: 'Processing and delivery days by state', icon: <Clock3 size={18} color="#2563EB" strokeWidth={2} />, rightText: `${timelineRows.length}`, onPress: () => openSettingsSection('order-timelines') },
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

  // "Configure" on the Features page opens that feature's own page.
  const handleConfigureFeature = (feature: FeatureRowKey) => {
    switch (feature) {
      case 'delivery':
        openSettingsSection('order-timelines');
        break;
      case 'cases':
        selectSettingsNav('cases');
        break;
      case 'returns':
        router.push('/returns' as never);
        break;
      case 'fyllPrint':
        router.push('/fyll-print' as never);
        break;
      case 'tasks':
        router.push('/(tabs)/tasks' as never);
        break;
      case 'finance':
        router.push('/(tabs)/finance?section=settings' as never);
        break;
      case 'announcements':
        router.push('/announcements/setup' as never);
        break;
    }
  };

  const selectSettingsNav = (key: WebSettingsMenuKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSection(null);
    setActiveWebInlinePanel(null);
    setActiveWebSettingsMenu(key);
    router.replace({ pathname: '/settings', params: { menu: key } });
  };

  const getSettingsItem = (id: string) => searchItems.find((item) => item.id === id);
  const getSettingsItems = (ids: string[]) => ids.map(getSettingsItem).filter(Boolean) as typeof searchItems;

  const mobileSettingsCardStyle = {
    backgroundColor: settingsPalette.card,
    borderWidth: 1,
    borderColor: settingsPalette.border,
    borderRadius: 26,
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
        borderRadius: 26,
        padding: 28,
      }}
    >
      <View style={{ marginBottom: 22 }}>
        <MoneyText style={{ color: colors.text.primary, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 }}>
          {title}
        </MoneyText>
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
            borderRadius: 22,
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
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: settingsPalette.nudgeBg,
            }}
          >
            {/* One icon colour for every row (Fyll lime), whatever colour the item passed. */}
            {React.isValidElement(item.icon)
              ? React.cloneElement(item.icon as React.ReactElement<{ color?: string }>, { color: settingsPalette.limeOnSurface })
              : item.icon}
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
    <View style={{ gap: 18 }}>
      <View style={{ padding: 18, borderRadius: 26, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: settingsPalette.text, fontSize: 15, fontWeight: '700' }}>Workspace theme</Text>
          <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>{themeMode === 'system' ? `Following device · ${resolvedThemeMode === 'dark' ? 'Dark' : 'Light'}` : `${themeMode === 'dark' ? 'Dark' : 'Light'} mode selected`}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 999, backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}>
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
                  flex: 1,
                  height: 42,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? FYLL_LIME : 'transparent',
                }}
              >
                <Text style={{ color: isSelected ? FYLL_LIME_INK : settingsPalette.faint, fontSize: 14, fontWeight: '700' }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  const renderWebNotificationsContent = () => (
    <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
      <View
        style={{
          minHeight: 72,
          paddingHorizontal: 18,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          borderBottomWidth: 1,
          borderBottomColor: settingsPalette.hairline,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: settingsPalette.nudgeBg,
          }}
        >
          {notifPermission === 'granted'
            ? <Bell size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />
            : <BellOff size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Push notifications</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {notifPermission === 'granted' ? 'Enabled for browser alerts' : notifPermission === 'denied' ? 'Blocked in browser settings' : 'Not enabled yet'}
          </Text>
        </View>
        {notifPermission !== 'denied' ? (
          <Pressable
            onPress={() => {
              if (notifPermission === 'granted') void sendTestPushToThisDevice();
              else {
                promptForPermission();
                setTimeout(() => setNotifPermission(window.Notification?.permission ?? null), 1500);
              }
            }}
            disabled={!notifReady || isSendingTestPush}
            className="active:opacity-80"
            style={{ height: 36, minWidth: 78, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME, opacity: notifReady && !isSendingTestPush ? 1 : 0.5 }}
          >
            <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '700' }}>{isSendingTestPush ? 'Sending…' : notifPermission === 'granted' ? 'Test' : 'Enable'}</Text>
          </Pressable>
        ) : null}
      </View>

      {currentUser?.role === 'admin' ? (
        <SettingsRow
          title="WhatsApp alerts"
          description="Orders and payments sent to WhatsApp"
          icon={<MessageCircle size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />}
          onPress={() => openSettingsPanel('whatsapp-settings', '/whatsapp-settings?from=settings')}
          showDivider={canUseOrderAutomation}
        />
      ) : null}

      {canUseOrderAutomation ? (
        <SettingsRow
          title="Emails"
          description="Order status updates and delivery confirmations"
          icon={<Mail size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />}
          onPress={() => openSettingsPanel('email-settings', '/email-settings?from=settings')}
          showDivider={false}
        />
      ) : null}
      {testPushResult ? <Text style={{ color: testPushResult.ok ? '#10B981' : '#EF4444', fontSize: 12, paddingHorizontal: 18, paddingBottom: 12 }}>{testPushResult.message}</Text> : null}
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
            borderRadius: 22,
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
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: settingsPalette.nudgeBg,
            }}
          >
            <Building2 size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />
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
            borderRadius: 22,
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
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: settingsPalette.nudgeBg,
            }}
          >
            <Link2 size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />
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
      {renderWebSettingsRows(getSettingsItems(['recycle-bin', 'milestone-replay', 'import-ai', 'log-out']))}
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
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: settingsPalette.nudgeBg,
          }}
        >
          <RotateCcw size={18} color={settingsPalette.limeOnSurface} strokeWidth={2} />
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
    'whatsapp-settings': 'WhatsApp Alerts',
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
        return <BusinessSettingsScreen embeddedInSettings />;
      case 'storefront-settings':
        return <StorefrontSettingsScreen embeddedInSettings />;
      case 'payment-accounts':
        return <PaymentAccountsScreen embeddedInSettings />;
      case 'team':
        return <TeamManagementScreen embeddedInSettings />;
      case 'invitations':
        return <InvitationsScreen embeddedInSettings />;
      case 'woocommerce-settings':
        return <WooCommerceSettingsScreen />;
      case 'order-automation':
        return <OrderAutomationScreen />;
      case 'email-settings':
        return <EmailSettingsScreen />;
      case 'whatsapp-settings':
        return <WhatsAppSettingsScreen />;
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

  // ---- Settings search (names, descriptions and keywords of every page) ----
  const SEARCH_ITEM_GROUP: Record<string, string> = {
    'my-account': 'Account', 'switch-business': 'Account',
    'business-settings': 'Business', 'team-members': 'Business', invitations: 'Business', 'payment-accounts': 'Business', 'payment-methods': 'Business',
    'order-statuses': 'Features', 'quality-control-checks': 'Features', 'order-timelines': 'Features', 'sale-sources': 'Features', 'logistics-carriers': 'Features', 'order-automation': 'Features',
    'low-stock-alert': 'Features', 'warehouse-settings': 'Features', categories: 'Features', 'product-variables': 'Features', 'product-options': 'Features', 'service-catalog': 'Features', addons: 'Features',
    'all-cases': 'Features', 'case-statuses': 'Features', 'resolution-types': 'Features',
    'import-orders': 'Data', 'import-products': 'Data', 'import-customers': 'Data', 'import-ai': 'Data', 'storefront-settings': 'Data', 'woocommerce-settings': 'Data', 'recycle-bin': 'Data',
  };
  const SEARCH_ITEM_KEYWORDS: Record<string, string[]> = {
    'order-timelines': ['delivery fee', 'delivery days', 'delivery zones', 'shipping zones', 'states', 'processing days', 'eta', 'timeline', 'delivery'],
    'business-settings': ['logo', 'business name', 'phone', 'address'],
    'payment-accounts': ['bank', 'bank account', 'payment link'],
    'team-members': ['invite', 'staff', 'roles', 'permissions', 'manager'],
    invitations: ['invite', 'vip', 'access'],
    'low-stock-alert': ['stock', 'threshold', 'warning'],
    'storefront-settings': ['shop', 'website', 'store link'],
    'recycle-bin': ['deleted', 'restore'],
  };
  const settingsSearchEntries = useMemo<SettingsSearchEntry[]>(() => [
    ...SETTINGS_NAV.map((item) => ({ id: `nav:${item.key}`, title: item.label, description: item.description, group: item.group, keywords: item.keywords, navKey: item.key })),
    ...searchItems.filter((item) => item.id !== 'customer-list').map((item) => ({ id: `item:${item.id}`, title: item.title, description: item.description ?? '', group: SEARCH_ITEM_GROUP[item.id] ?? 'Settings', keywords: SEARCH_ITEM_KEYWORDS[item.id] ?? [], onOpen: item.onPress })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [searchItems]);
  const settingsSearchResults = useMemo(() => searchSettings(settingsSearchEntries, settingsSearch), [settingsSearch, settingsSearchEntries]);

  const renderWebSettingsTopBar = () => {
    const navItem = getSettingsNavItem(activeWebInlinePanel ? PANEL_NAV_KEY[activeWebInlinePanel] : activeSection ? SETTINGS_SECTION_MENU_MAP[activeSection] : activeWebSettingsMenu);
    const palette = settingsPalette;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 28, zIndex: 20 }}>
        <Text style={{ color: palette.faint, fontSize: 13 }}>
          Settings / <Text style={{ color: palette.textSoft }}>{navItem?.label ?? 'Settings'}</Text>
        </Text>
        <View style={{ width: 360, position: 'relative' }}>
          <View style={{ height: 46, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.inputBg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
            <Search size={17} color={palette.faint} strokeWidth={2} />
            <TextInput
              value={settingsSearch}
              onChangeText={setSettingsSearch}
              placeholder="Search settings, e.g. delivery fee"
              placeholderTextColor={palette.faint}
              accessibilityLabel="Search settings"
              onSubmitEditing={() => {
                const first = settingsSearchResults[0];
                if (!first) return;
                setSettingsSearch('');
                if (first.navKey) selectSettingsNav(first.navKey); else first.onOpen?.();
              }}
              style={[{ flex: 1, color: palette.text, fontSize: 15 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
            />
          </View>
          {settingsSearch.trim().length > 0 ? (
            <View style={{ position: 'absolute', top: 52, left: 0, right: 0, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 6, zIndex: 30, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
              {settingsSearchResults.length === 0 ? (
                <Text style={{ color: palette.faint, fontSize: 13, paddingHorizontal: 12, paddingVertical: 12 }}>No settings match "{settingsSearch.trim()}".</Text>
              ) : settingsSearchResults.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    setSettingsSearch('');
                    if (entry.navKey) selectSettingsNav(entry.navKey); else entry.onOpen?.();
                  }}
                  className="active:opacity-80"
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{entry.title}</Text>
                    <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{entry.description}</Text>
                  </View>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{entry.group}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
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
          renderWebSettingsRows(getSettingsItems(['my-account', 'switch-business'])),
          'Your account, password and workspaces.'
        );
      case 'business-details':
        // One page, so it opens straight into the form instead of a list with a single row.
        return (
          <View style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, borderRadius: 26, overflow: 'hidden', minHeight: Math.max(680, Dimensions.get('window').height - 260) }}>
            <SettingsBackOverrideProvider onBack={() => selectSettingsNav('profile')}>
              <BusinessSettingsScreen embeddedInSettings />
            </SettingsBackOverrideProvider>
          </View>
        );
      case 'team':
        return renderWebSettingsCard(
          'Team & roles',
          renderWebSettingsRows(getSettingsItems(['team-members', 'invitations'])),
          'Who can use Fyll, what they can do, and who you have invited.'
        );
      case 'payments':
        return renderWebSettingsCard(
          'Payments',
          renderWebSettingsRows(getSettingsItems(['payment-accounts', 'payment-methods'])),
          'Bank accounts shown on payment links, and the payment methods you record on orders.'
        );
      case 'links':
        return renderWebSettingsCard('Business Links', renderWebLinksContent(), 'Copy customer-facing URLs for tracking, returns, and delivery confirmation.');
      case 'all-features':
        return <FeaturesSettings onConfigure={handleConfigureFeature} />;
      case 'orders':
        return renderWebSettingsCard(
          'Orders',
          renderWebSettingsRows(getSettingsItems(['order-statuses', 'quality-control-checks', 'order-timelines', 'sale-sources', 'addons', 'logistics-carriers', 'order-automation'])),
          'Order workflows, quality control, fulfillment timelines, sources, add-ons and carriers.'
        );
      case 'inventory':
        return renderWebSettingsCard(
          'Inventory',
          renderWebSettingsRows(getSettingsItems(['low-stock-alert', 'warehouse-settings', 'categories', 'product-variables', 'product-options', 'service-catalog'])),
          'Stock alerts, warehouse, categories, variants and services.'
        );
      case 'import-export':
        return renderWebSettingsCard(
          'Import & export',
          renderWebSettingsRows(getSettingsItems(['import-orders', 'import-products', 'import-customers', 'import-ai'])),
          'Bring orders, products and customers into Fyll.'
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
    const usePaymentHeader = activeSection === 'payment-methods';

    const titles: Record<SettingsSection, string> = {
      'order-statuses': 'Order Statuses',
      'quality-control-checks': 'Quality Control Checks',
      'sale-sources': 'Sale Sources',
      'custom-services': 'Add-ons',
      'order-timelines': 'Fulfillment Timelines',
      'shipping-zones': 'Shipping Zones',
      'payment-methods': 'Payment Methods',
      'logistics-carriers': 'Logistics Carriers',
      'case-statuses': 'Case Statuses',
      'resolution-types': 'Resolution Types',
      'recycle-bin': 'Recycle Bin',
      'all-features': 'Features',
    };

    const subtitles: Record<SettingsSection, string> = {
      'order-statuses': 'Manage workflow labels, tracking stages, and optional WooCommerce mappings.',
      'quality-control-checks': 'Manage the QC checklist used before dispatching orders.',
      'sale-sources': 'Define the source labels available when orders are created.',
      'custom-services': 'Manage add-ons and optional service line items.',
      'order-timelines': 'Choose the states, delivery days and processing days that set each order\'s expected delivery date.',
      'shipping-zones': 'Configure location-based delivery zones and fees.',
      'payment-methods': 'Manage the payment method labels shown across orders and checkout workflows.',
      'logistics-carriers': 'Control the carrier labels available for cases and delivery handling.',
      'case-statuses': 'Manage support workflow statuses for internal case handling.',
      'resolution-types': 'Control the available resolution outcomes for customer cases.',
      'recycle-bin': 'Restore or permanently remove deleted records kept for recovery.',
      'all-features': 'Turn tools on or off for your team, and see how each one is set up.',
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
            minHeight: usePaymentHeader ? 58 : 60,
            paddingHorizontal: usePaymentHeader ? 20 : 28,
            paddingVertical: usePaymentHeader ? 4 : 14,
            borderBottomWidth: usePaymentHeader ? 0 : 1,
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
                width: usePaymentHeader ? 38 : 34,
                height: usePaymentHeader ? 38 : 34,
                borderRadius: usePaymentHeader ? 19 : 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: usePaymentHeader ? settingsPalette.softFill : 'transparent',
                marginRight: usePaymentHeader ? 10 : 12,
              }}
            >
              <ArrowLeft size={usePaymentHeader ? 18 : 20} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              {usePaymentHeader ? (
                <>
                  <Text style={{ color: colors.text.tertiary, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Settings</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 17, lineHeight: 21, fontWeight: '600' }} numberOfLines={1}>{titles[activeSection]}</Text>
                </>
              ) : (
                <>
                  <MoneyText style={{ color: colors.text.primary, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 }} numberOfLines={1}>
                    {titles[activeSection]}
                  </MoneyText>
                  <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4, lineHeight: 18 }} numberOfLines={2}>
                    {subtitles[activeSection]}
                  </Text>
                </>
              )}
            </View>
          </View>

          {activeSection !== 'recycle-bin' && activeSection !== 'all-features' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {activeSection === 'order-timelines' ? (
                <Pressable
                  onPress={openCreateOrderTimelineModal}
                  className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                  style={[primaryPillButtonStyle, { height: 40, minWidth: 130, gap: 8 }]}
                >
                  <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                  <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Timeline</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSectionSave}
                className="px-4 rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 40, minWidth: 96 }]}
              >
                <Text style={[primaryPillTextStyle, { fontSize: 14 }]} className="font-semibold">
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
        <PaymentAccountsScreen embeddedInSettings />
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
                  alignSelf: 'flex-start',
                  paddingHorizontal: 36,
                  paddingTop: 34,
                }}
              >
                {renderWebSettingsTopBar()}
              <View style={{ width: '100%', maxWidth: activeSection === 'payment-methods' ? 1120 : 960, paddingBottom: 16 }}>
                {renderActiveWebSectionCard()}
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
      'order-timelines': 'Fulfillment Timelines',
      'shipping-zones': 'Shipping Zones',
      'payment-methods': 'Payment Methods',
      'logistics-carriers': 'Logistics Carriers',
      'case-statuses': 'Case Statuses',
      'resolution-types': 'Resolution Types',
      'recycle-bin': 'Recycle Bin',
      'all-features': 'Features',
    };

    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
          {activeSection === 'all-features' || activeSection === 'order-statuses' || activeSection === 'quality-control-checks' || activeSection === 'order-timelines' || activeSection === 'sale-sources' || activeSection === 'payment-methods' || activeSection === 'logistics-carriers' || activeSection === 'custom-services' || activeSection === 'case-statuses' || activeSection === 'resolution-types' || activeSection === 'recycle-bin' ? (
            <LinearGradient
              pointerEvents="none"
              colors={resolvedThemeMode === 'dark'
                ? ['rgba(111,125,18,0.55)', 'rgba(17,17,17,0)']
                : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']}
              locations={[0, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }}
            />
          ) : null}
          <View>
            <View style={settingsSectionHeaderWrapStyle}>
              <View
                className="flex-row items-center"
                style={{ minHeight: 66, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4 }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleBackFromSection();
                  }}
                  className="items-center justify-center mr-3 active:opacity-50"
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: settingsPalette.softFill }}
                >
                  <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2.2} />
                </Pressable>
                <View className="flex-1">
                  <Text style={{ color: settingsPalette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>{titles[activeSection]}</Text>
                  {sectionSaveStatus === 'success' && (
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">Saved</Text>
                  )}
                  {sectionSaveStatus === 'error' && (
                    <Text style={{ color: '#EF4444' }} className="text-xs mt-1">Save failed</Text>
                  )}
                </View>
                {activeSection !== 'recycle-bin' && activeSection !== 'all-features' ? (
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    {isWebDesktop && activeSection === 'order-timelines' ? (
                      <Pressable
                        onPress={openCreateOrderTimelineModal}
                        className="px-4 rounded-full flex-row items-center justify-center active:opacity-80"
                        style={[primaryPillButtonStyle, { height: 42, minWidth: 136, gap: 8 }]}
                      >
                        <Plus size={14} color={primaryPillTextStyle.color} strokeWidth={2.2} />
                        <Text style={primaryPillTextStyle} className="text-sm font-semibold">New Timeline</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={handleSectionSave}
                      className="px-4 rounded-full items-center justify-center active:opacity-80"
                      style={[primaryPillButtonStyle, { height: 42, minWidth: 104 }]}
                    >
                      <Text style={[primaryPillTextStyle, { fontSize: 14 }]} className="font-semibold">
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
                alignSelf: 'flex-start',
                paddingHorizontal: 36,
                paddingTop: 34,
              }}
            >
              {renderWebSettingsTopBar()}
              <View style={{ width: '100%', maxWidth: 960, paddingBottom: 16 }}>
                {renderActiveWebSettingsContent()}
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
          <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
            <View
              className="w-full rounded-3xl p-5"
              style={{ maxWidth: 440, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
            >
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-row items-center flex-1 pr-3" style={{ gap: 12 }}>
                  <LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={21} color={FYLL_LIME_INK} strokeWidth={2.2} /></LinearGradient>
                  <View style={{ flex: 1 }}>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 20, fontWeight: '700' }}>Low stock alert</MoneyText>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12, marginTop: 2 }}>Set one warning threshold across inventory.</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setShowLowStockModal(false)}
                  className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: settingsPalette.softFill }}
                >
                  <X size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl p-4 mb-4" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View style={{ flex: 1, paddingRight: 14 }}>
                  <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>Use global threshold</Text>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>{useGlobalLowStockThreshold ? 'Applied to every product' : 'Products use individual thresholds'}</Text>
                </View>
                <LimeToggle compact
                  value={useGlobalLowStockThreshold}
                  onValueChange={setUseGlobalLowStockThreshold}
                  accessibilityLabel="Use global low stock threshold"
                  activeColor={FYLL_LIME}
                  inactiveColor={resolvedThemeMode === 'dark' ? '#66685F' : '#D8D9D1'}
                  inactiveBorderColor={resolvedThemeMode === 'dark' ? '#898B82' : '#B9BBB2'}
                />
              </View>
              {useGlobalLowStockThreshold ? <View
                className="rounded-2xl px-4 mb-4"
                style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 54, justifyContent: 'center' }}
              >
                <TextInput
                  value={tempThreshold}
                  onChangeText={setTempThreshold}
                  keyboardType="numeric"
                  placeholder="5"
                  placeholderTextColor={colors.input.placeholder}
                  selectionColor={FYLL_LIME}
                  style={{ color: settingsPalette.text, fontSize: 16, fontWeight: '600' }}
                />
              </View> : null}
              <Pressable
                onPress={handleSaveLowStock}
                className="rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50 }]}
              >
                <Text style={[primaryPillTextStyle, { fontSize: 14, fontWeight: '600' }]}>Save threshold</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <MilestoneReplay visible={showMilestoneReplay} onClose={() => setShowMilestoneReplay(false)} />
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
                      <MoneyText style={{ color: colors.text.primary, ...pageHeadingStyle, fontWeight: '400', letterSpacing: -0.8 }}>More</MoneyText>
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
                  <MoneyText style={{ color: colors.text.primary, ...pageHeadingStyle, fontWeight: '400', letterSpacing: -0.8 }}>More</MoneyText>
                </View>
                <Pressable
                  onPress={handleRefreshApp}
                  className="w-10 h-10 items-center justify-center active:opacity-70"
                  style={{ borderRadius: 20, backgroundColor: 'transparent', borderWidth: 1, borderColor: settingsPalette.border }}
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
          ref={mainMenuScrollRef}
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
              {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
              <View style={{ marginBottom: -1 }}>
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
            </View>
          ) : null}

          {!searchQuery.trim() && (
            <>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Business</Text>
              <View style={mobileSettingsCardStyle}>
                {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
                <View style={{ marginBottom: -1 }}>
                <SettingsRow
                  title="Switch Business"
                  description="Add and open existing businesses"
                  icon={<Building2 size={18} color="#10B981" strokeWidth={2} />}
                  onPress={() => router.push('/switch-business?from=settings')}
                />
                </View>
              </View>
            </>
          )}

          {!searchQuery.trim() && currentUser && (
            <>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Account</Text>
              <View style={mobileSettingsCardStyle}>
                {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
                <View style={{ marginBottom: -1 }}>
                <SettingsRow
                  title="My Account"
                  description="Profile and password"
                  icon={<UserCircle size={18} color="#3B82F6" strokeWidth={2} />}
                  onPress={() => openSettingsPanel('account-settings', '/account-settings?from=settings')}
                />
                </View>
              </View>
            </>
          )}

          {!searchQuery.trim() && (<>
          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Business</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
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
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Connections</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
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
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Links</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
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
          </View>

          {currentUser?.role === 'admin' && businessId ? (
            <>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Business Identity</Text>
              <View style={mobileSettingsCardStyle}>
                {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
                <View style={{ marginBottom: -1 }}>
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
              </View>
            </>
          ) : null}

          {currentUser?.role === 'admin' && canUseTeamMembers && (
            <>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Team</Text>
              <View style={mobileSettingsCardStyle}>
                {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
                <View style={{ marginBottom: -1 }}>
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
              </View>
            </>
          )}

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Import customers</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            <SettingsRow
              title="Import Customers"
              description="Upload contacts via CSV"
              icon={<Upload size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsPanel('import-customers', '/import-customers?from=settings')}
            />
            </View>
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Features</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            <SettingsRow
              title="All features"
              description="Turn tools on or off and see how each is set up"
              icon={<LayoutGrid size={18} color="#10B981" strokeWidth={2} />}
              onPress={() => openSettingsSection('all-features')}
            />
            </View>
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Orders & Sales</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
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
              title="Fulfillment Timelines"
              description="Processing and delivery days by state"
              icon={<Clock3 size={18} color="#2563EB" strokeWidth={2} />}
              rightText={`${timelineRows.length}`}
              onPress={() => openSettingsSection('order-timelines')}
            />
            <SettingsRow
              title="Sale Sources"
              description="Where orders come from"
              icon={<Tag size={18} color="#059669" strokeWidth={2} />}
              rightText={`${saleSources.length}`}
              onPress={() => openSettingsSection('sale-sources')}
            />
            <SettingsRow
              title="Add-ons"
              description="Lens coating, express delivery"
              icon={<Wrench size={18} color="#8B5CF6" strokeWidth={2} />}
              rightText={`${customServices.length}`}
              onPress={() => openSettingsSection('custom-services')}
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
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Services</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            <SettingsRow
              title="Service Catalog"
              description="All services and pricing"
              icon={<Wrench size={18} color={colors.text.secondary} strokeWidth={2} />}
              onPress={() => router.push('/services' as never)}
            />
            </View>
          </View>

          {canUseCases ? (
            <>
              <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Cases</Text>
              <View style={mobileSettingsCardStyle}>
                {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
                <View style={{ marginBottom: -1 }}>
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
              </View>
            </>
          ) : null}

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Inventory</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
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
          </View>

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Appearance</Text>
          <View
            style={{
              padding: 16,
              borderRadius: 26,
              backgroundColor: settingsPalette.card,
              borderWidth: 1,
              borderColor: settingsPalette.border,
            }}
          >
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>
                Workspace theme
              </Text>
              <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>
                {themeMode === 'system'
                  ? `Following device · ${resolvedThemeMode === 'dark' ? 'Dark' : 'Light'}`
                  : `${themeMode === 'dark' ? 'Dark' : 'Light'} mode selected`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 5, padding: 4, borderRadius: 999, backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}>
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
                      flex: 1,
                      height: 38,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? FYLL_LIME : 'transparent',
                    }}
                  >
                    <Text style={{ color: isSelected ? FYLL_LIME_INK : settingsPalette.faint, fontSize: 13, fontWeight: '700' }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {((Platform.OS === 'web' && notifPermission !== null) || currentUser?.role === 'admin' || canUseOrderAutomation) && (
          <>
          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>Notifications</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            {Platform.OS === 'web' && notifPermission !== null && (
              <View style={{ minHeight: 72, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: currentUser?.role === 'admin' || canUseOrderAutomation ? 1 : 0, borderBottomColor: settingsPalette.hairline }}>
                  <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}>
                    {notifPermission === 'granted'
                      ? <Bell size={18} color={FYLL_LIME} strokeWidth={2} />
                      : <BellOff size={18} color={FYLL_LIME} strokeWidth={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>
                      Push Notifications
                    </Text>
                    <Text style={{ color: testPushResult ? (testPushResult.ok ? '#10B981' : '#EF4444') : settingsPalette.faint, fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={2}>
                      {testPushResult?.message ?? (notifPermission === 'granted' ? 'Alerts are enabled on this device' : notifPermission === 'denied' ? 'Blocked in browser settings' : 'Get alerts for orders and activity')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      if (notifPermission === 'granted') {
                        void sendTestPushToThisDevice();
                      } else if (notifPermission === 'denied') {
                        if (typeof window !== 'undefined') window.open('https://support.apple.com/guide/safari/customize-settings-for-a-website-ibrw7f78f7fe/mac', '_blank');
                      } else {
                        promptForPermission();
                        setTimeout(() => setNotifPermission(window.Notification?.permission ?? null), 1500);
                      }
                    }}
                    disabled={!notifReady || isSendingTestPush}
                    className="active:opacity-80"
                    style={{
                      height: 34,
                      minWidth: 66,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: notifPermission === 'denied' ? settingsPalette.softFill : FYLL_LIME,
                      borderWidth: notifPermission === 'denied' ? 1 : 0,
                      borderColor: notifPermission === 'denied' ? settingsPalette.outline : 'transparent',
                      opacity: !notifReady || isSendingTestPush ? 0.55 : 1,
                    }}
                  >
                    <Text style={{ color: notifPermission === 'denied' ? settingsPalette.textSoft : FYLL_LIME_INK, fontSize: 12, fontWeight: '700' }}>
                      {isSendingTestPush ? 'Sending…' : notifPermission === 'granted' ? 'Test' : notifPermission === 'denied' ? 'Fix' : 'Enable'}
                    </Text>
                  </Pressable>
              </View>
            )}

            {currentUser?.role === 'admin' ? (
              <SettingsRow
                title="WhatsApp alerts"
                description="Orders and payments sent to WhatsApp"
                icon={<MessageCircle size={18} color="#25A95B" strokeWidth={2} />}
                onPress={() => openSettingsPanel('whatsapp-settings', '/whatsapp-settings?from=settings')}
                showDivider={canUseOrderAutomation}
              />
            ) : null}

            {canUseOrderAutomation ? (
              <View>
                <SettingsRow
                  title="Emails"
                  description="Order status updates and delivery confirmations"
                  icon={<Mail size={18} color={colors.text.tertiary} strokeWidth={2} />}
                  onPress={() => openSettingsPanel('email-settings', '/email-settings?from=settings')}
                  showDivider={false}
                />
              </View>
            ) : null}
            </View>
          </View>
          </>
          )}

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>System</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            <SettingsRow
              title="Recycle Bin"
              description="Restore deleted orders, products, and finance rows"
              icon={<Trash2 size={18} color="#EF4444" strokeWidth={2} />}
              rightText={`${recycleBin.length}`}
              onPress={() => openSettingsSection('recycle-bin')}
            />
            {currentUser?.role === 'admin' ? (
              <SettingsRow
                title="Replay milestone celebration"
                description="Watch your latest order milestone again"
                icon={<Award size={18} color="#D5E057" strokeWidth={2} />}
                onPress={() => setShowMilestoneReplay(true)}
              />
            ) : null}
            {canUseAiImport ? (
              <SettingsRow
                title="AI Import Assistant"
                description="Orders, customers, products, expenses"
                icon={<Sparkles size={18} color="#8B5CF6" strokeWidth={2} />}
                onPress={() => openSettingsPanel('import-ai', '/import-ai?from=settings')}
              />
            ) : null}
            <SettingsRow
              title="Refresh App"
              description="Reload app data"
              icon={<RotateCcw size={18} color={colors.text.tertiary} strokeWidth={2} />}
              onPress={handleRefreshApp}
              showDivider={Boolean(currentUser)}
            />
            {currentUser ? (
              <SettingsRow
                title="Log Out"
                description="Sign out of your account"
                icon={<LogOut size={18} color={colors.text.tertiary} strokeWidth={2} />}
                showChevron={false}
                showDivider={false}
                onPress={handleLogout}
              />
            ) : null}
            </View>
          </View>
          {saveMessage && (
            <Text
              style={{ color: saveStatus === 'error' ? '#EF4444' : colors.text.tertiary }}
              className="text-xs mt-2"
            >
              {saveMessage}
            </Text>
          )}

          <Text style={{ color: settingsPalette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginLeft: 8 }}>About</Text>
          <View style={mobileSettingsCardStyle}>
            {/* The last row's divider tucks under the card border so the bottom edge stays one line thick. */}
            <View style={{ marginBottom: -1 }}>
            <SettingsRow
              title="Fyll ERP"
              description={appVersionLabel}
              icon={<Info size={18} color="#3B82F6" strokeWidth={2} />}
              showChevron={false}
              showDivider={false}
            />
            </View>
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
          <View className="flex-1 items-center justify-center px-5" style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
            <View className="w-full rounded-3xl p-5" style={{ maxWidth: 440, backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-row items-center flex-1 pr-3" style={{ gap: 12 }}>
                  <LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={21} color={FYLL_LIME_INK} strokeWidth={2.2} /></LinearGradient>
                  <View style={{ flex: 1 }}>
                    <MoneyText style={{ color: settingsPalette.text, fontSize: 18, fontWeight: '700' }}>Low stock alert</MoneyText>
                    <Text style={{ color: settingsPalette.muted, fontSize: 12, marginTop: 2 }}>Set one warning threshold across inventory.</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setShowLowStockModal(false)}
                  className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: settingsPalette.softFill }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between rounded-2xl p-4 mb-4" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border }}>
                <View style={{ flex: 1, paddingRight: 14 }}>
                  <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>Use global threshold</Text>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 3 }}>{useGlobalLowStockThreshold ? 'Applied to every product' : 'Products use individual thresholds'}</Text>
                </View>
                <LimeToggle compact
                  value={useGlobalLowStockThreshold}
                  onValueChange={(value) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setUseGlobalLowStockThreshold(value);
                  }}
                  accessibilityLabel="Use global low stock threshold"
                  activeColor={FYLL_LIME}
                  inactiveColor={resolvedThemeMode === 'dark' ? '#66685F' : '#D8D9D1'}
                  inactiveBorderColor={resolvedThemeMode === 'dark' ? '#898B82' : '#B9BBB2'}
                />
              </View>

              {useGlobalLowStockThreshold && (
                <View className="mb-4">
                  <Text style={{ color: settingsPalette.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Alert when stock falls below</Text>
                  <View className="flex-row items-center rounded-2xl px-4" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 52 }}>
                    <View
                      className="flex-1"
                      style={{
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        value={tempThreshold}
                        onChangeText={setTempThreshold}
                        keyboardType="number-pad"
                        style={{ color: colors.input.text, fontSize: 16, fontWeight: '600' }}
                        placeholderTextColor={colors.input.placeholder}
                        selectionColor={FYLL_LIME}
                      />
                    </View>
                    <Text style={{ color: settingsPalette.faint, fontSize: 12 }}>units</Text>
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
                <Text style={[primaryPillTextStyle, { fontSize: 14, fontWeight: '600' }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        </View>
      </SafeAreaView>

      {renderDeleteSettingModal()}
      <MilestoneReplay visible={showMilestoneReplay} onClose={() => setShowMilestoneReplay(false)} />
    </View>
  );
}
