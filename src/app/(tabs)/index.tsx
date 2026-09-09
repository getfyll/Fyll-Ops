import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TrendingDown,
  ShoppingCart,
  BarChart3,
  Scan,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Package,
  Users,
  FileText,
  Bell,
  X,
  MessageCircle,
  Clock3,
  Calendar,
  User as UserIcon,
  Truck,
  CircleAlert,
  Printer,
  MoreHorizontal,
  Settings,
  RotateCcw,
  Megaphone,
  Search,
  Wallet,
  Check,
} from 'lucide-react-native';
import useFyllStore, { formatCurrency, getSocialCheckoutEffectiveStatus, Order, Product, type PartnerJob, type SocialCheckoutDraft } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import * as Haptics from 'expo-haptics';
import { getPlatformBreakdown } from '@/lib/analytics-utils';
import useAuthStore from '@/lib/state/auth-store';
import { collaborationData, type CollaborationNotification } from '@/lib/supabase/collaboration';
import { supabase } from '@/lib/supabase';
import { supabaseData } from '@/lib/supabase/data';
import { isTeamThreadEntityId, getTeamThreadDisplayNameFromEntityId } from '@/lib/team-threads';
import { FulfillmentPipelineCard, type FulfillmentStageKey } from '@/components/FulfillmentPipelineCard';
import { getFulfillmentPipelineBucket } from '@/lib/fulfillment';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { WebContainer } from '@/components/web/WebContainer';
import { WebPageHeader } from '@/components/web/WebPageHeader';
import { WebCard } from '@/components/web/WebCard';
import { InteractiveLineChart } from '@/components/stats/InteractiveLineChart';
import { InteractiveBarChart } from '@/components/stats/InteractiveBarChart';
import { SkeletonBox } from '@/components/SkeletonLoader';
import { storage } from '@/lib/storage';
import { getFyllPrintQueue } from '@/lib/fyll-print-queue';
import { createOrderStatusColorMap, getOrderStatusColor } from '@/lib/order-status-colors';
import { taskData, type Task } from '@/lib/supabase/tasks';
import { triggerTaskEventReminders } from '@/hooks/useWebPushNotifications';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';

const ORDER_NOTIFICATIONS_SEEN_KEY_PREFIX = 'dashboard-order-notifications-seen';
const ONBOARDING_DISMISSED_KEY_PREFIX = 'dashboard-onboarding-dismissed';
const getOrderNotificationsSeenKey = (businessId: string) =>
  `${ORDER_NOTIFICATIONS_SEEN_KEY_PREFIX}:${businessId}`;
const getOnboardingDismissedKey = (businessId: string) =>
  `${ONBOARDING_DISMISSED_KEY_PREFIX}:${businessId}`;

const formatTaskDueDate = (value?: string | null) => {
  if (!value) return 'No date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const toSentenceCase = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1).toLowerCase()}`;
};

const getTaskStatusMeta = (status: Task['status']) => {
  if (status === 'done') return { label: 'Done', color: '#059669', background: 'rgba(5,150,105,0.12)' };
  if (status === 'in_progress') return { label: 'In progress', color: '#2563EB', background: 'rgba(37,99,235,0.12)' };
  return { label: 'Todo', color: '#B45309', background: 'rgba(180,83,9,0.12)' };
};

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  onPress?: () => void;
  loading?: boolean;
}

function MetricCard({ title, value, subtitle, trend, icon, onPress, loading = false }: MetricCardProps) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        onPress={onPress}
        className="rounded-2xl p-4 active:opacity-80"
        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
        disabled={!onPress}
      >
        <View className="flex-row items-center justify-between mb-3">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            {icon}
          </View>
          {loading ? (
            <SkeletonBox width={44} height={22} rounded="full" />
          ) : trend !== undefined ? (
            <View className="flex-row items-center px-2 py-1 rounded-full" style={{ backgroundColor: trend >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}>
              {trend >= 0 ? (
                <ArrowUpRight size={12} color="#22C55E" strokeWidth={2.5} />
              ) : (
                <TrendingDown size={12} color="#EF4444" strokeWidth={2.5} />
              )}
              <Text style={{ color: trend >= 0 ? '#22C55E' : '#EF4444' }} className="text-xs font-semibold ml-0.5">
                {Math.abs(trend)}%
              </Text>
            </View>
          ) : null}
          {onPress && !trend && !loading && (
            <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
          )}
        </View>
        {loading ? (
          <>
            <SkeletonBox width="68%" height={11} rounded="md" />
            <View style={{ height: 10 }} />
            <SkeletonBox width="48%" height={24} rounded="md" />
            <View style={{ height: 8 }} />
            <SkeletonBox width="58%" height={11} rounded="md" />
          </>
        ) : (
          <>
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium tracking-wide uppercase mb-1">{title}</Text>
            <Text style={{ color: colors.text.primary }} className="text-2xl font-bold tracking-tight">{value}</Text>
            {subtitle && <Text style={{ color: colors.text.muted }} className="text-xs mt-1">{subtitle}</Text>}
          </>
        )}
      </Pressable>
    </View>
  );
}

type OnboardingStep = {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  route: string;
  settingsPanel?: string;
};

function OnboardingChecklistCard({
  steps,
  onDismiss,
  onStepPress,
  inset = true,
}: {
  steps: OnboardingStep[];
  onDismiss: () => void;
  onStepPress: (step: OnboardingStep) => void;
  inset?: boolean;
}) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const completedCount = steps.filter((step) => step.complete).length;
  const progress = steps.length > 0 ? completedCount / steps.length : 0;
  const nextStep = steps.find((step) => !step.complete);

  return (
    <View className={inset ? 'px-5 pt-4' : undefined}>
      <View
        className="rounded-3xl p-4"
        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
      >
        <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary }} className="text-base font-bold">Complete your setup</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
              {completedCount}/{steps.length} done
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <X size={16} color={colors.text.tertiary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View className="mt-4 flex-row">
          <View className="rounded-full overflow-hidden" style={{ width: 120, height: 6, backgroundColor: colors.bg.secondary }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: 6, backgroundColor: colors.text.primary }} />
          </View>
        </View>

        <View className="flex-row flex-wrap mt-3" style={{ marginHorizontal: -4 }}>
          {steps.map((step) => (
            <Pressable
              key={step.id}
              onPress={() => onStepPress(step)}
              style={{ width: '33.333%', padding: 4 }}
              className="active:opacity-70"
            >
              <View
                className="rounded-2xl flex-row items-center"
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  gap: 8,
                  backgroundColor: isDark ? colors.bg.elevated : colors.bg.secondary,
                  borderWidth: isDark ? 1 : 0,
                  borderColor: colors.border.light,
                }}
              >
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: step.complete ? colors.text.primary : 'transparent',
                    borderWidth: step.complete ? 0 : 1.5,
                    borderColor: colors.border.medium ?? colors.border.light,
                  }}
                >
                  {step.complete ? <Check size={15} color={colors.bg.primary} strokeWidth={3} /> : null}
                </View>
                <Text
                  style={{
                    color: step.complete ? colors.text.tertiary : colors.text.primary,
                    textDecorationLine: step.complete ? 'line-through' : 'none',
                  }}
                  className="text-sm font-semibold flex-1"
                  numberOfLines={1}
                >
                  {step.shortLabel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {nextStep ? (
          <View className="mt-4 flex-row">
            <Pressable
              onPress={() => onStepPress(nextStep)}
              className="rounded-full items-center justify-center active:opacity-80"
              style={{ height: 40, paddingHorizontal: 20, backgroundColor: colors.text.primary }}
            >
              <Text style={{ color: colors.bg.primary }} className="text-sm font-semibold">
                {nextStep.title}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// Audit Banner Component
interface AuditBannerProps {
  onPress: () => void;
  inset?: boolean;
}

function AuditBanner({ onPress, inset = true }: AuditBannerProps) {
  const content = (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 active:opacity-90"
      style={{ backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#E9D5FF' }}
    >
      <View className="flex-row items-center">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
          style={{ backgroundColor: '#FAF5FF' }}
        >
          <ClipboardList size={24} color="#8B5CF6" strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text style={{ color: '#6B21A8' }} className="font-bold text-base">
            Monthly Audit Due
          </Text>
          <Text style={{ color: '#7C3AED' }} className="text-sm mt-0.5">
            Complete your inventory audit before month-end
          </Text>
        </View>
        <ChevronRight size={20} color="#8B5CF6" strokeWidth={2} />
      </View>
    </Pressable>
  );

  if (!inset) return content;

  return <View className="px-5 pt-4">{content}</View>;
}

function EventBanner({
  title,
  subtitle,
  onPress,
  inset = true,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  inset?: boolean;
}) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const bannerBackground = isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF';
  const bannerBorder = isDark ? 'rgba(96,165,250,0.34)' : '#BFDBFE';
  const iconBackground = isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE';
  const titleColor = isDark ? '#BFDBFE' : '#1D4ED8';
  const subtitleColor = isDark ? '#93C5FD' : '#2563EB';

  const content = (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 active:opacity-90"
      style={{ backgroundColor: bannerBackground, borderWidth: 1, borderColor: bannerBorder }}
    >
      <View className="flex-row items-center">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
          style={{ backgroundColor: iconBackground }}
        >
          <Calendar size={24} color="#2563EB" strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text style={{ color: titleColor }} className="font-bold text-base">
            {title}
          </Text>
          <Text style={{ color: subtitleColor }} className="text-sm mt-0.5">
            {subtitle}
          </Text>
        </View>
        <ChevronRight size={20} color={subtitleColor} strokeWidth={2} />
      </View>
    </Pressable>
  );

  if (!inset) return content;

  return <View className="px-5 pt-4">{content}</View>;
}

function PrintQueueBanner({
  count,
  onPress,
  inset = true,
}: {
  count: number;
  onPress: () => void;
  inset?: boolean;
}) {
  const colors = useThemeColors();
  const content = (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 active:opacity-90"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <View className="flex-row items-center">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
          style={{ backgroundColor: colors.bg.secondary }}
        >
          <Printer size={23} color={colors.text.primary} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.text.primary }} className="font-bold text-base">
            Fyll Print queue
          </Text>
          <Text style={{ color: colors.text.secondary }} className="text-sm mt-0.5">
            {count} label{count === 1 ? '' : 's'} waiting to print
          </Text>
        </View>
        <ChevronRight size={20} color={colors.text.tertiary} strokeWidth={2} />
      </View>
    </Pressable>
  );

  if (!inset) return content;

  return <View className="px-5 pt-4">{content}</View>;
}

// Notification Bell Component
function NotificationBell({ count, onPress }: { count: number; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: colors.bg.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Bell size={20} color={colors.text.primary} strokeWidth={2} />
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor: '#DC2626',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function WebMoreMenu() {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <View style={{ position: 'relative', zIndex: 40 }}>
      <Pressable
        onPress={() => router.push('/(tabs)/settings' as any)}
        className="rounded-full px-4 flex-row items-center active:opacity-80"
        style={{
          backgroundColor: colors.bg.card,
          height: 44,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <MoreHorizontal size={18} color={colors.text.primary} strokeWidth={2.5} />
        <Text style={{ color: colors.text.primary }} className="font-semibold ml-2 text-sm">
          More
        </Text>
      </Pressable>
    </View>
  );
}

function WebFeatureSearchMenu() {
  const router = useRouter();
  const colors = useThemeColors();
  const { featureAccess } = useBusinessSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownWidth = 390;
  const isDark = colors.bg.primary === '#111111';
  const featureItems = [
    { label: 'Dashboard', description: 'Home overview and quick actions', route: '/(tabs)', Icon: BarChart3, keywords: 'home overview dashboard' },
    { label: 'New Order', description: 'Create a customer order', route: '/new-order', Icon: Plus, keywords: 'create order sales checkout' },
    { label: 'Orders', description: 'Search, filter, and manage orders', route: '/(tabs)/orders', Icon: ShoppingCart, keywords: 'orders status customer sales' },
    { label: 'Inventory', description: 'Products, services, stock, barcode labels', route: '/(tabs)/inventory', Icon: Package, keywords: 'products stock inventory barcode labels' },
    { label: 'Warehouse', description: 'Warehouse items and stock counts', route: '/(tabs)/inventory/warehouse', Icon: Package, keywords: 'warehouse bins supplies stock' },
    { label: 'Delivery', description: 'Dispatch tracking and shipping labels', route: '/(tabs)/deliveries', Icon: Truck, keywords: 'delivery dispatch shipping courier label' },
    { label: 'Fyll Print', description: 'Shipping and inventory print queues', route: '/fyll-print', Icon: Printer, keywords: 'print label queue barcode shipping' },
    { label: 'Returns', description: 'Return requests and workflows', route: '/returns', Icon: RotateCcw, keywords: 'returns refund exchange customer proof' },
    { label: 'Cases', description: 'Support cases and customer issues', route: '/(tabs)/cases', Icon: FileText, keywords: 'cases support issues complaints' },
    { label: 'Customers', description: 'Customer profiles and history', route: '/(tabs)/customers', Icon: Users, keywords: 'customers contacts profiles' },
    { label: 'Announcements', description: 'Compose customer announcements', route: '/(tabs)/announcements', Icon: Megaphone, keywords: 'announcements email customers broadcast' },
    { label: 'Announcement Setup', description: 'Email template, sender, and reply-to settings', route: '/(tabs)/announcements?announcementSection=setup', Icon: Settings, keywords: 'announcement setup email template sender reply to' },
    { label: 'Threads', description: 'Team conversations', route: '/(tabs)/threads', Icon: MessageCircle, keywords: 'threads comments messages collaboration' },
    { label: 'Tasks', description: 'Assigned work and reminders', route: '/(tabs)/tasks', Icon: ClipboardList, keywords: 'tasks reminders assignments' },
    { label: 'Finance', description: 'Revenue, expenses, refunds, procurement', route: '/(tabs)/finance', Icon: DollarSign, keywords: 'finance revenue expenses refunds procurement salary' },
    { label: 'Insights', description: 'Performance analytics', route: '/(tabs)/insights', Icon: BarChart3, keywords: 'insights analytics reports stats' },
    { label: 'Business Settings', description: 'Business profile, links, and operations settings', route: '/business-settings', Icon: Settings, keywords: 'settings business links return tracking delivery confirmation' },
    { label: 'WooCommerce Settings', description: 'Website store integration settings', route: '/woocommerce-settings', Icon: Settings, keywords: 'woocommerce website integration sync' },
    { label: 'Import Products', description: 'Upload product CSV data', route: '/import-products', Icon: Package, keywords: 'import csv products upload' },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const featureForRoute = (route: string) => {
    if (route.includes('/deliveries')) return 'delivery' as const;
    if (route.includes('/fyll-print')) return 'fyllPrint' as const;
    if (route.includes('/returns')) return 'returns' as const;
    if (route.includes('/cases')) return 'cases' as const;
    if (route.includes('/announcements')) return 'announcements' as const;
    if (route.includes('/threads')) return 'threads' as const;
    if (route.includes('/tasks')) return 'tasks' as const;
    if (route.includes('/finance')) return 'finance' as const;
    if (route.includes('/insights')) return 'insights' as const;
    if (route.includes('/woocommerce-settings')) return 'woocommerce' as const;
    return null;
  };
  const enabledFeatureItems = featureItems.filter((item) => {
    const feature = featureForRoute(item.route);
    if (!feature) return true;
    if (feature === 'woocommerce' && !isBusinessFeatureEnabled(featureAccess, 'additionalIntegrations')) return false;
    return isBusinessFeatureEnabled(featureAccess, feature);
  });
  const visibleItems = normalizedQuery
    ? enabledFeatureItems.filter((item) => {
        const searchable = `${item.label} ${item.description} ${item.keywords}`.toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : enabledFeatureItems.slice(0, 8);

  return (
    <View style={{ position: 'relative', zIndex: 10000, elevation: 10000 }}>
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        className="rounded-full px-4 flex-row items-center active:opacity-80"
        style={{
          backgroundColor: colors.bg.card,
          height: 44,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <Search size={18} color={colors.text.primary} strokeWidth={2.5} />
        <Text style={{ color: colors.text.primary }} className="font-semibold ml-2 text-sm">
          Search
        </Text>
      </Pressable>

      {isOpen ? (
        <View
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            marginLeft: -(dropdownWidth / 2),
            width: dropdownWidth,
            maxHeight: 520,
            borderRadius: 24,
            padding: 10,
            backgroundColor: colors.bg.card,
            borderWidth: 1,
            borderColor: colors.border.light,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.38 : 0.14,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            zIndex: 10001,
            elevation: 10001,
          }}
        >
          <View
            style={{
              height: 46,
              borderRadius: 18,
              backgroundColor: colors.bg.secondary,
              borderWidth: 1,
              borderColor: colors.border.light,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              marginBottom: 8,
            }}
          >
            <Search size={17} color={colors.text.tertiary} strokeWidth={2.3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search menus and features"
              placeholderTextColor={colors.text.muted}
              autoFocus
              style={{
                flex: 1,
                marginLeft: 10,
                color: colors.text.primary,
                fontSize: 14,
                fontWeight: '500',
                outlineStyle: 'none' as any,
              }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} style={{ padding: 4 }}>
                <X size={16} color={colors.text.tertiary} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView style={{ maxHeight: 442 }} showsVerticalScrollIndicator={false}>
            {visibleItems.length > 0 ? (
              visibleItems.map(({ label, description, route, Icon }) => (
                <Pressable
                  key={`${route}-${label}`}
                  onPress={() => {
                    setIsOpen(false);
                    setQuery('');
                    router.push(route as any);
                  }}
                  className="flex-row items-center rounded-2xl active:opacity-75"
                  style={{ paddingHorizontal: 12, paddingVertical: 11 }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 13,
                      backgroundColor: colors.bg.secondary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 11,
                    }}
                  >
                    <Icon size={17} color={colors.text.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', marginTop: 1 }} numberOfLines={1}>
                      {description}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                </Pressable>
              ))
            ) : (
              <View style={{ paddingHorizontal: 14, paddingVertical: 18 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }}>
                  No matching menu or feature found.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// Notification Panel Component
function NotificationPanel({
  visible,
  onClose,
  notifications,
  onNotificationPress,
  onMarkAllRead,
  orders: ordersList = [],
  profilesMap = new Map<string, string>(),
}: {
  visible: boolean;
  onClose: () => void;
  notifications: CollaborationNotification[];
  onNotificationPress: (n: CollaborationNotification) => void;
  onMarkAllRead: () => void;
  orders?: Order[];
  profilesMap?: Map<string, string>;
}) {
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const router = useRouter();

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Build a map of order id → order number for quick lookup
  const orderNumberMap = useMemo(() => {
    if (!visible || !ordersList?.length) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();
    (ordersList ?? []).forEach((o) => {
      if (o.id && o.orderNumber) map.set(o.id, o.orderNumber);
    });
    return map;
  }, [ordersList, visible]);

  const getNotificationText = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    const eType = n.entity_type ?? payload?.entityType;
    const eId = n.entity_id ?? payload?.entityId;

    let entityLabel = '';
    if (eType === 'order' && eId) {
      const orderNum = orderNumberMap.get(eId);
      entityLabel = orderNum ? `thread #${orderNum}` : 'a thread';
    } else if (eType === 'case' && eId) {
      entityLabel = isTeamThreadEntityId(eId)
        ? getTeamThreadDisplayNameFromEntityId(eId)
        : 'a thread';
    } else if (eType === 'task') {
      entityLabel = 'a task';
    }

    const context = entityLabel ? ` in ${entityLabel}` : '';

    if (payload?.type === 'task_assigned') {
      const authorName =
        (n.actor_user_id ? profilesMap.get(n.actor_user_id) : null)
        ?? payload?.authorName
        ?? 'A team member';
      return `${authorName} assigned you a task${context}`;
    }
    if (payload?.type === 'task_completed') {
      const authorName =
        (n.actor_user_id ? profilesMap.get(n.actor_user_id) : null)
        ?? payload?.authorName
        ?? 'A team member';
      return `${authorName} completed a task${context}`;
    }
    if (payload?.type === 'task_due_reminder') {
      if (payload?.isOverdue) {
        return `Task overdue${context}`;
      }
      return `Task due today${context}`;
    }
    if (payload?.type === 'task_event_reminder') {
      return payload?.reminderStage === 'now'
        ? `Event starting now${context}`
        : `Event in 30 min${context}`;
    }
    if (payload?.type === 'delivery_confirmation_received') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      return `${customerName} confirmed delivery${context}`;
    }
    if (payload?.type === 'delivery_confirmation_pending') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      return `${customerName} reported pending delivery${context}`;
    }
    if (payload?.type === 'social_checkout_payment_submitted') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      const amount = typeof payload?.amount === 'string' && payload.amount.trim()
        ? ` ${payload.amount.trim()}`
        : '';
      return `${customerName} submitted payment proof${amount}`;
    }
    if (payload?.type === 'payment_received') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      const amount = typeof payload?.amount === 'string' && payload.amount.trim()
        ? ` ${payload.amount.trim()}`
        : '';
      const sourceLabel = typeof payload?.sourceLabel === 'string' && payload.sourceLabel.trim()
        ? payload.sourceLabel.trim()
        : 'payment';
      return `${customerName} made a ${sourceLabel} payment${amount}`;
    }
    if (payload?.type === 'return_request_submitted') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      const returnRef = typeof payload?.returnRef === 'string' && payload.returnRef.trim()
        ? ` ${payload.returnRef.trim()}`
        : '';
      return `${customerName} submitted return request${returnRef}`;
    }
    if (payload?.type === 'storefront_order_created') {
      const customerName = typeof payload?.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      const orderNumber = typeof payload?.orderNumber === 'string' && payload.orderNumber.trim()
        ? ` #${payload.orderNumber.trim()}`
        : '';
      return `New storefront order${orderNumber} from ${customerName}`;
    }

    if (payload?.type === 'partner_job_event') {
      return typeof payload?.heading === 'string' && payload.heading.trim()
        ? payload.heading.trim()
        : 'Partner job update';
    }
    if (eType === 'task') {
      return 'New comment in task';
    }
    if (eType === 'case') {
      return entityLabel ? `New comment in ${entityLabel}` : 'New comment in case';
    }
    return `New message${context}`;
  }, [orderNumberMap, profilesMap]);

  const isTaskNotification = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    const eType = n.entity_type ?? payload?.entityType;
    return eType === 'task'
      || payload?.type === 'task_assigned'
      || payload?.type === 'task_completed'
      || payload?.type === 'task_due_reminder'
      || payload?.type === 'task_event_reminder';
  }, []);

  const isOrderUpdateNotification = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    return payload?.type === 'delivery_confirmation_received'
      || payload?.type === 'delivery_confirmation_pending'
      || payload?.type === 'storefront_order_created';
  }, []);

  const isPaymentNotification = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    return payload?.type === 'social_checkout_payment_submitted'
      || payload?.type === 'payment_received';
  }, []);

  const isReturnNotification = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    return payload?.type === 'return_request_submitted';
  }, []);

  const taskNotifications = useMemo(
    () => notifications.filter((n) => isTaskNotification(n)),
    [isTaskNotification, notifications]
  );

  const orderUpdateNotifications = useMemo(
    () => notifications.filter((n) => isOrderUpdateNotification(n)),
    [isOrderUpdateNotification, notifications]
  );

  const paymentNotifications = useMemo(
    () => notifications.filter((n) => isPaymentNotification(n)),
    [isPaymentNotification, notifications]
  );

  const returnNotifications = useMemo(
    () => notifications.filter((n) => isReturnNotification(n)),
    [isReturnNotification, notifications]
  );

  const threadNotifications = useMemo(
    () => notifications.filter((n) => !isTaskNotification(n) && !isOrderUpdateNotification(n) && !isPaymentNotification(n) && !isReturnNotification(n)),
    [isOrderUpdateNotification, isPaymentNotification, isReturnNotification, isTaskNotification, notifications]
  );

  const getNotificationIconMeta = useCallback((n: CollaborationNotification) => {
    const payload = n.payload as any;
    if (payload?.type === 'task_completed') {
      return { icon: ClipboardList, color: '#059669', bg: 'rgba(5,150,105,0.14)' };
    }
    if (payload?.type === 'task_due_reminder') {
      return {
        icon: Clock3,
        color: payload?.isOverdue ? '#DC2626' : '#D97706',
        bg: payload?.isOverdue ? 'rgba(220,38,38,0.14)' : 'rgba(217,119,6,0.14)',
      };
    }
    if (payload?.type === 'task_event_reminder') {
      return {
        icon: Calendar,
        color: payload?.reminderStage === 'now' ? '#2563EB' : '#0F766E',
        bg: payload?.reminderStage === 'now' ? 'rgba(37,99,235,0.14)' : 'rgba(15,118,110,0.14)',
      };
    }
    if (payload?.type === 'delivery_confirmation_received') {
      return { icon: Truck, color: '#059669', bg: 'rgba(5,150,105,0.14)' };
    }
    if (payload?.type === 'delivery_confirmation_pending') {
      return { icon: CircleAlert, color: '#D97706', bg: 'rgba(217,119,6,0.14)' };
    }
    if (payload?.type === 'social_checkout_payment_submitted' || payload?.type === 'payment_received') {
      return { icon: Wallet, color: '#7C3AED', bg: 'rgba(124,58,237,0.14)' };
    }
    if (payload?.type === 'return_request_submitted') {
      return { icon: RotateCcw, color: '#2563EB', bg: 'rgba(37,99,235,0.14)' };
    }
    if (payload?.type === 'storefront_order_created') {
      return { icon: Package, color: '#059669', bg: 'rgba(5,150,105,0.14)' };
    }
    if (isTaskNotification(n)) {
      return { icon: ClipboardList, color: '#2563EB', bg: 'rgba(37,99,235,0.14)' };
    }
    return { icon: MessageCircle, color: colors.accent.primary, bg: `${colors.accent.primary}15` };
  }, [colors.accent.primary, isTaskNotification]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Orders created in the last 24h — shown in a "New Orders" section
  const recentOrders = useMemo(() => {
    if (!visible) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return [...(ordersList ?? [])]
      .filter((o) => new Date(o.createdAt).getTime() > cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [ordersList, visible]);

  const handleOrderPress = (orderId: string) => {
    onClose();
    router.push(`/order/${orderId}` as any);
  };

  const renderNotificationItem = (n: CollaborationNotification, compact: boolean) => {
    const notifText = getNotificationText(n);
    const bodyPreview = (n.payload as any)?.body;
    const truncatedPreview = typeof bodyPreview === 'string' && bodyPreview.length > 80
      ? `${bodyPreview.slice(0, 77)}...`
      : bodyPreview;
    const iconMeta = getNotificationIconMeta(n);
    const NotificationIcon = iconMeta.icon;

    return (
      <Pressable
        key={n.id}
        onPress={() => onNotificationPress(n)}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: compact ? 18 : 20,
          paddingVertical: compact ? 14 : 16,
          backgroundColor: n.is_read ? 'transparent' : `${colors.accent.primary}08`,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        }}
      >
        <View
          style={{
            width: compact ? 36 : 40,
            height: compact ? 36 : 40,
            borderRadius: compact ? 10 : 12,
            backgroundColor: n.is_read ? colors.bg.secondary : iconMeta.bg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: compact ? 12 : 14,
          }}
        >
          <NotificationIcon
            size={compact ? 16 : 18}
            color={n.is_read ? colors.text.muted : iconMeta.color}
            strokeWidth={2}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text.primary,
              fontSize: compact ? 13 : 14,
              fontWeight: n.is_read ? '400' : '600',
            }}
            numberOfLines={1}
          >
            {notifText}
          </Text>
          {truncatedPreview ? (
            <Text
              style={{ color: colors.text.tertiary, fontSize: compact ? 12 : 13, marginTop: 2 }}
              numberOfLines={1}
            >
              "{truncatedPreview}"
            </Text>
          ) : null}
          <Text style={{ color: colors.text.muted, fontSize: compact ? 11 : 12, marginTop: 2 }}>
            {formatTimeAgo(n.created_at)}
          </Text>
        </View>
        {!n.is_read && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#DC2626',
              marginTop: compact ? 4 : 6,
              marginLeft: 8,
            }}
          />
        )}
      </Pressable>
    );
  };

  const renderNewOrderItem = (order: Order, compact: boolean) => (
    <Pressable
      key={order.id}
      onPress={() => handleOrderPress(order.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: compact ? 18 : 20,
        paddingVertical: compact ? 12 : 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
      }}
    >
      <View
        style={{
          width: compact ? 36 : 40,
          height: compact ? 36 : 40,
          borderRadius: compact ? 10 : 12,
          backgroundColor: 'rgba(59,130,246,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: compact ? 12 : 14,
        }}
      >
        <ShoppingCart size={compact ? 15 : 17} color="#3B82F6" strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.text.primary, fontSize: compact ? 13 : 14, fontWeight: '600' }}
          numberOfLines={1}
        >
          New order {order.orderNumber}
        </Text>
        {order.createdBy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
            <UserIcon size={11} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.tertiary, fontSize: compact ? 12 : 13 }} numberOfLines={1}>
              Created by {order.createdBy}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.text.muted, fontSize: compact ? 11 : 12, marginTop: 2 }}>
          {order.customerName} • {formatTimeAgo(order.createdAt)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: '#3B82F6', alignSelf: 'flex-start', marginTop: 2 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>NEW</Text>
      </View>
    </Pressable>
  );

  if (!visible) {
    return null;
  }

  if (isWebDesktop) {
    return (
      <>
        <Pressable
          onPress={onClose}
          style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        />
        <View
          style={{
            position: 'fixed' as any,
            top: 80,
            right: 28,
            width: 400,
            maxHeight: 520,
            backgroundColor: colors.bg.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border.light,
            zIndex: 10000,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } as any : {}),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Pressable onPress={onMarkAllRead}>
                <Text style={{ color: colors.accent.primary, fontSize: 13, fontWeight: '600' }}>
                  Mark all read
                </Text>
              </Pressable>
            )}
          </View>
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {recentOrders.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>New Orders</Text>
                </View>
                {recentOrders.map((o) => renderNewOrderItem(o, true))}
              </>
            )}
            {notifications.length === 0 && recentOrders.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Bell size={32} color={colors.text.muted} strokeWidth={1.5} />
                <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 8 }}>
                  No notifications yet
                </Text>
              </View>
            ) : notifications.length > 0 ? (
              <>
                {taskNotifications.length > 0 && (
                  <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Tasks</Text>
                  </View>
                )}
                {taskNotifications.map((n) => renderNotificationItem(n, true))}
                {orderUpdateNotifications.length > 0 && (
                  <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Order Updates</Text>
                  </View>
                )}
                {orderUpdateNotifications.map((n) => renderNotificationItem(n, true))}
                {paymentNotifications.length > 0 && (
                  <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Payments</Text>
                  </View>
                )}
                {paymentNotifications.map((n) => renderNotificationItem(n, true))}
                {returnNotifications.length > 0 && (
                  <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Returns</Text>
                  </View>
                )}
                {returnNotifications.map((n) => renderNotificationItem(n, true))}
                {threadNotifications.length > 0 && (
                  <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Threads</Text>
                  </View>
                )}
                {threadNotifications.map((n) => renderNotificationItem(n, true))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </>
    );
  }

  // Mobile: full screen modal
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700' }}>
            Notifications
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {unreadCount > 0 && (
              <Pressable onPress={onMarkAllRead}>
                <Text style={{ color: colors.accent.primary, fontSize: 14, fontWeight: '600' }}>
                  Mark all read
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.bg.secondary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {recentOrders.length > 0 && (
            <>
              <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>New Orders</Text>
              </View>
              {recentOrders.map((o) => renderNewOrderItem(o, false))}
            </>
          )}
          {notifications.length === 0 && recentOrders.length === 0 ? (
            <View style={{ padding: 48, alignItems: 'center' }}>
              <Bell size={40} color={colors.text.muted} strokeWidth={1.5} />
              <Text style={{ color: colors.text.muted, fontSize: 15, marginTop: 12 }}>
                No notifications yet
              </Text>
            </View>
          ) : notifications.length > 0 ? (
            <>
              {taskNotifications.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Tasks</Text>
                </View>
              )}
              {taskNotifications.map((n) => renderNotificationItem(n, false))}
              {orderUpdateNotifications.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Order Updates</Text>
                </View>
              )}
              {orderUpdateNotifications.map((n) => renderNotificationItem(n, false))}
              {paymentNotifications.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Payments</Text>
                </View>
              )}
              {paymentNotifications.map((n) => renderNotificationItem(n, false))}
              {returnNotifications.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Returns</Text>
                </View>
              )}
              {returnNotifications.map((n) => renderNotificationItem(n, false))}
              {threadNotifications.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Threads</Text>
                </View>
              )}
              {threadNotifications.map((n) => renderNotificationItem(n, false))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// Recent Order Item Component
interface RecentOrderItemProps {
  order: Order;
  productById: Map<string, Product>;
  statusColorMap: Record<string, string>;
  onPress: () => void;
  isLast?: boolean;
}

function RecentOrderItem({ order, productById, statusColorMap, onPress, isLast = false }: RecentOrderItemProps) {
  const colors = useThemeColors();

  // Get first item info
  const firstItem = order.items[0];
  const product = firstItem?.productId ? productById.get(firstItem.productId) : undefined;
  const variant = product?.variants.find((v) => v.id === firstItem?.variantId);
  const itemName = product?.name ?? 'Unknown Product';
  const itemSku = variant?.sku ?? 'N/A';

  const statusColor = getOrderStatusColor(order.status, statusColorMap, '#F59E0B');

  return (
    <View>
      <Pressable
        onPress={onPress}
        className="flex-row items-center py-3 active:opacity-70"
        style={isLast ? undefined : { borderBottomWidth: 1, borderBottomColor: colors.border.light }}
      >
        <View className="flex-1">
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>
            {order.customerName}
          </Text>
          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
            {itemName} • {itemSku}
          </Text>
        </View>
        <View className="items-end">
          <View className="px-2 py-1 rounded-md" style={{ backgroundColor: `${statusColor}15` }}>
            <Text style={{ color: statusColor }} className="text-xs font-semibold">{order.status}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

interface RecentPartnerJobItemProps {
  job: PartnerJob;
  partnerName: string;
  onPress: () => void;
  isLast?: boolean;
}

function RecentPartnerJobItem({ job, partnerName, onPress, isLast = false }: RecentPartnerJobItemProps) {
  const colors = useThemeColors();

  const normalizedStatus = String(job.status ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const statusMeta = normalizedStatus.includes('cancel')
    ? { label: 'Cancelled', color: '#DC2626', background: 'rgba(220,38,38,0.12)' }
    : normalizedStatus.includes('ready')
      ? { label: 'Ready for pickup', color: '#2563EB', background: 'rgba(37,99,235,0.12)' }
      : normalizedStatus.includes('progress')
        ? { label: 'In progress', color: '#B45309', background: 'rgba(180,83,9,0.12)' }
        : normalizedStatus.includes('sent to business') || normalizedStatus.includes('returned')
          ? { label: 'Sent to business', color: '#16A34A', background: 'rgba(22,163,74,0.12)' }
          : normalizedStatus.includes('sent')
            ? { label: 'Sent to partner', color: '#6B7280', background: 'rgba(107,114,128,0.12)' }
            : { label: normalizedStatus ? normalizedStatus.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Status', color: '#6B7280', background: 'rgba(107,114,128,0.12)' };

  return (
    <View>
      <Pressable
        onPress={onPress}
        className="flex-row items-center py-3 active:opacity-70"
        style={isLast ? undefined : { borderBottomWidth: 1, borderBottomColor: colors.border.light }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold text-sm" numberOfLines={1}>
            {job.customerName || 'Customer'}
          </Text>
          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
            {job.jobType || job.itemLabel || 'Partner job'} • {partnerName || 'No partner'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 12 }}>
          <View
            className="px-2 py-1 rounded-md"
            style={{ backgroundColor: statusMeta.background, maxWidth: 150 }}
          >
            <Text style={{ color: statusMeta.color }} className="text-xs font-semibold" numberOfLines={1}>
              {statusMeta.label}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const tabBarHeight = useTabBarHeight();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const cases = useFyllStore((s) => s.cases);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const customers = useFyllStore((s) => s.customers);
  const isBackgroundSyncing = useFyllStore((s) => s.isBackgroundSyncing);
  const hasAuditForMonth = useFyllStore((s) => s.hasAuditForMonth);
  const { businessName, businessPhone, returnAddress, storefrontEnabled, featureAccess, isLoading: isLoadingBusinessSettings } = useBusinessSettings();
  const canUseStorefront = isBusinessFeatureEnabled(featureAccess, 'storefront');
  const canUseCases = isBusinessFeatureEnabled(featureAccess, 'cases');
  const canUseSocialCheckout = isBusinessFeatureEnabled(featureAccess, 'socialCheckout');
  const canUseTasks = isBusinessFeatureEnabled(featureAccess, 'tasks');
  const canUseFinance = isBusinessFeatureEnabled(featureAccess, 'finance');
  const canUseInsights = isBusinessFeatureEnabled(featureAccess, 'insights');

  const userName = useAuthStore((s) => s.currentUser?.name ?? '');
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? '');
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const userRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const pendingInvites = useAuthStore((s) => s.pendingInvites);
  const queryClient = useQueryClient();
  const eventReminderTriggerKeyRef = useRef<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [orderNotificationsSeenAt, setOrderNotificationsSeenAt] = useState(0);
  const [eventNowTick, setEventNowTick] = useState(() => Date.now());
  const [pendingPrintQueueCount, setPendingPrintQueueCount] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingDismissedLoaded, setOnboardingDismissedLoaded] = useState(false);
  const [showInitialDashboardSkeleton, setShowInitialDashboardSkeleton] = useState(true);
  const shouldShowHomeTaskCard = canUseTasks && (!isWebDesktop || userRole === 'staff');

  const refreshPrintQueueCount = useCallback(() => {
    let isCancelled = false;
    void getFyllPrintQueue()
      .then((queue) => {
        if (isCancelled) return;
        setPendingPrintQueueCount(queue.inventory.length + queue.shipping.length);
      })
      .catch(() => {
        if (isCancelled) return;
        setPendingPrintQueueCount(0);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useFocusEffect(refreshPrintQueueCount);

  useEffect(() => {
    if (!showInitialDashboardSkeleton) return;
    const timer = setTimeout(() => setShowInitialDashboardSkeleton(false), 900);
    return () => clearTimeout(timer);
  }, [showInitialDashboardSkeleton]);

  useEffect(() => {
    let isCancelled = false;

    if (!businessId) {
      setOrderNotificationsSeenAt(0);
      setOnboardingDismissed(false);
      setOnboardingDismissedLoaded(false);
      return;
    }

    setOnboardingDismissedLoaded(false);

    void storage.getItem(getOrderNotificationsSeenKey(businessId)).then((value) => {
      if (isCancelled) return;
      const parsed = Number(value ?? '0');
      setOrderNotificationsSeenAt(Number.isFinite(parsed) ? parsed : 0);
    }).catch(() => {
      if (isCancelled) return;
      setOrderNotificationsSeenAt(0);
    });

    void storage.getItem(getOnboardingDismissedKey(businessId)).then((value) => {
      if (isCancelled) return;
      setOnboardingDismissed(value === 'true');
    }).catch(() => {
      if (isCancelled) return;
      setOnboardingDismissed(false);
    }).finally(() => {
      if (isCancelled) return;
      setOnboardingDismissedLoaded(true);
    });

    return () => {
      isCancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!showNotifications || !businessId) return;

    const seenAt = Date.now();
    setOrderNotificationsSeenAt((previous) => Math.max(previous, seenAt));
    void storage.setItem(getOrderNotificationsSeenKey(businessId), String(seenAt));
  }, [showNotifications, businessId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEventNowTick(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Notification queries
  const notificationsQuery = useQuery({
    queryKey: ['collaboration-notifications', businessId],
    enabled: Boolean(businessId),
    queryFn: () => collaborationData.listMyNotifications(businessId!, { limit: 30 }),
    refetchInterval: 15000,
  });

  // Realtime: refetch notifications immediately when a new one arrives
  useEffect(() => {
    if (!businessId || !currentUserId) return;
    const channel = supabase
      .channel(`notifications:${businessId}:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'collaboration_notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['collaboration-notifications', businessId] });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, currentUserId, queryClient]);

  const mobileHomeTasksQuery = useQuery({
    queryKey: ['dashboard-mobile-tasks', businessId, userRole, currentUserId],
    enabled: Boolean(businessId),
    queryFn: () => taskData.listTasks(businessId!),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const socialCheckoutDraftsQuery = useQuery({
    queryKey: ['dashboard-social-checkouts', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId!);
      return rows.map((row) => row.data);
    },
    staleTime: 30_000,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!businessId) return;
    const bucketKey = `${businessId}:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
    if (eventReminderTriggerKeyRef.current === bucketKey) return;
    eventReminderTriggerKeyRef.current = bucketKey;
    void triggerTaskEventReminders({ businessId, reminderIso: new Date().toISOString() }).catch((error) => {
      console.warn('Could not trigger task event reminders:', error);
    });
  }, [businessId, eventNowTick]);

  // Fetch profiles for author name display in notifications
  const profilesQuery = useQuery({
    queryKey: ['collaboration-profiles', businessId],
    enabled: Boolean(businessId),
    queryFn: () => collaborationData.fetchProfilesForBusiness(businessId!),
    staleTime: 5 * 60 * 1000,
  });
  const profilesMap = useMemo(() => {
    const map = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((p) => {
      if (p.id && p.name) map.set(p.id, p.name);
    });
    return map;
  }, [profilesQuery.data]);

  const notifications = useMemo(
    () => notificationsQuery.data ?? [],
    [notificationsQuery.data]
  );
  const mobileHomeScopedTasks = useMemo(() => {
    if (!shouldShowHomeTaskCard) return [] as Task[];
    const rawTasks = mobileHomeTasksQuery.data ?? [];
    const filtered = rawTasks.filter((task) => task.status !== 'done');
    const scoped = userRole === 'staff'
      ? filtered.filter((task) => (
        task.created_by === currentUserId
        || (task.assignee_user_ids ?? []).includes(currentUserId)
      ))
      : filtered;

    return [...scoped].sort((left, right) => {
      if (userRole === 'staff') {
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }
      const leftDue = left.due_date ? new Date(`${left.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(`${right.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [shouldShowHomeTaskCard, mobileHomeTasksQuery.data, userRole, currentUserId]);

  const homeRelevantEvents = useMemo(() => {
    if (!currentUserId) return [] as Task[];
    return (mobileHomeTasksQuery.data ?? [])
      .filter((task) => task.item_type === 'event' && task.status !== 'done' && Boolean(task.starts_at))
      .filter((task) => (
        task.created_by === currentUserId
        || (task.assignee_user_ids ?? []).includes(currentUserId)
      ))
      .sort((left, right) => {
        const leftStart = left.starts_at ? new Date(left.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
        const rightStart = right.starts_at ? new Date(right.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
      });
  }, [currentUserId, mobileHomeTasksQuery.data]);

  const upcomingHomeEvent = useMemo(() => {
    const nowMs = eventNowTick;
    const thirtyMinutesFromNow = nowMs + (30 * 60 * 1000);
    return homeRelevantEvents.find((task) => {
      const startMs = task.starts_at ? new Date(task.starts_at).getTime() : Number.NaN;
      const endMs = task.ends_at ? new Date(task.ends_at).getTime() : Number.NaN;
      if (!Number.isFinite(startMs)) return false;
      const isHappeningNow = Number.isFinite(endMs)
        ? nowMs >= startMs && nowMs <= endMs
        : Math.abs(nowMs - startMs) <= 5 * 60 * 1000;
      if (isHappeningNow) return true;
      return startMs > nowMs && startMs <= thirtyMinutesFromNow;
    }) ?? null;
  }, [eventNowTick, homeRelevantEvents]);

  const upcomingHomeEventMeta = useMemo(() => {
    if (!upcomingHomeEvent?.starts_at) return null;
    const startDate = new Date(upcomingHomeEvent.starts_at);
    if (Number.isNaN(startDate.getTime())) return null;
    const nowMs = eventNowTick;
    const startMs = startDate.getTime();
    const endMs = upcomingHomeEvent.ends_at ? new Date(upcomingHomeEvent.ends_at).getTime() : Number.NaN;
    const isHappeningNow = Number.isFinite(endMs)
      ? nowMs >= startMs && nowMs <= endMs
      : Math.abs(nowMs - startMs) <= 5 * 60 * 1000;
    const timeLabel = startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isHappeningNow) {
      return {
        title: 'Event Happening Now',
        subtitle: `${upcomingHomeEvent.title} • ${timeLabel}`,
      };
    }

    const diffMinutes = Math.max(1, Math.round((startMs - nowMs) / 60000));
    return {
      title: 'Upcoming Event',
      subtitle: `${upcomingHomeEvent.title} • ${timeLabel} in ${diffMinutes} min`,
    };
  }, [eventNowTick, upcomingHomeEvent]);
  const mobileHomeTaskRows = useMemo(
    () => mobileHomeScopedTasks.slice(0, 5),
    [mobileHomeScopedTasks]
  );
  const unreadNotificationCount = useMemo(() => {
    const now = Date.now();
    const threadUnread = notifications.filter((n) => !n.is_read).length;
    const newOrdersCount = orders.filter(
      (o) => {
        const createdAtMs = new Date(o.createdAt).getTime();
        if (!Number.isFinite(createdAtMs)) return false;
        return (now - createdAtMs) < 24 * 60 * 60 * 1000 && createdAtMs > orderNotificationsSeenAt;
      }
    ).length;
    return threadUnread + newOrdersCount;
  }, [notifications, orders, orderNotificationsSeenAt]);

  const handleNotificationPress = useCallback((n: CollaborationNotification) => {
    // Mark as read
    if (!n.is_read) {
      collaborationData.markNotificationAsRead(n.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['collaboration-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts'] });
    }
    setShowNotifications(false);
    // Navigate using joined thread entity info, or fall back to payload
    const eType = n.entity_type ?? (n.payload as any)?.entityType;
    const eId = n.entity_id ?? (n.payload as any)?.entityId;
    const payloadType = (n.payload as any)?.type;
    if (payloadType === 'social_checkout_payment_submitted') {
      const checkoutCode = typeof (n.payload as any)?.checkoutCode === 'string' && (n.payload as any).checkoutCode.trim()
        ? (n.payload as any).checkoutCode.trim()
        : eId;
      if (checkoutCode) {
        router.push(`/social-checkout/${encodeURIComponent(checkoutCode)}` as any);
      } else {
        router.push('/(tabs)/payments' as any);
      }
      return;
    }
    if (payloadType === 'payment_received') {
      const source = typeof (n.payload as any)?.source === 'string' ? (n.payload as any).source.trim().toLowerCase() : '';
      const checkoutCode = typeof (n.payload as any)?.checkoutCode === 'string' ? (n.payload as any).checkoutCode.trim() : '';
      const paymentId = typeof (n.payload as any)?.paymentId === 'string' ? (n.payload as any).paymentId.trim() : '';
      if (source === 'social_checkout' && checkoutCode) {
        router.push(`/social-checkout/${encodeURIComponent(checkoutCode)}` as any);
      } else if (paymentId) {
        router.push(`/storefront-payment/${encodeURIComponent(paymentId)}` as any);
      } else {
        router.push('/(tabs)/payments' as any);
      }
      return;
    }
    if (payloadType === 'partner_job_event') {
      router.push('/partners?partnerSection=jobs' as any);
      return;
    }
    if (payloadType === 'return_request_submitted') {
      const returnId = typeof (n.payload as any)?.returnId === 'string' && (n.payload as any).returnId.trim()
        ? (n.payload as any).returnId.trim()
        : eId;
      if (returnId) {
        router.push(`/return/${encodeURIComponent(returnId)}` as any);
      } else {
        router.push('/returns' as any);
      }
      return;
    }
    if (eType === 'order' && eId) {
      if (payloadType === 'delivery_confirmation_received' || payloadType === 'delivery_confirmation_pending') {
        router.push(`/order/${encodeURIComponent(eId)}` as any);
        return;
      }
      router.push(`/threads?orderId=${encodeURIComponent(eId)}` as any);
    } else if (eType === 'case' && eId) {
      if (isTeamThreadEntityId(eId)) {
        router.push(`/threads?teamEntityId=${encodeURIComponent(eId)}` as any);
      } else {
        router.push(`/threads?caseEntityId=${encodeURIComponent(eId)}` as any);
      }
    } else if (eType === 'task' && eId) {
      router.push(`/(tabs)/task/${encodeURIComponent(eId)}` as any);
    }
  }, [queryClient, router]);

  const handleMarkAllRead = useCallback(() => {
    if (businessId) {
      collaborationData.markAllNotificationsAsRead(businessId).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['collaboration-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts'] });
    }
  }, [businessId, queryClient]);

  // Check if audit banner should show (25th-31st of month, and no audit logged this month)
  const showAuditBanner = useMemo(() => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Only show between 25th and 31st
    if (dayOfMonth < 25) return false;

    // Check if audit already done this month
    return !hasAuditForMonth(currentMonth, currentYear);
  }, [hasAuditForMonth]);

  const sortedOrdersByDate = useMemo(() => {
    return [...orders].sort(
      (a, b) =>
        new Date(b.orderDate ?? b.createdAt).getTime() - new Date(a.orderDate ?? a.createdAt).getTime()
    );
  }, [orders]);

  const recentOrdersMobile = useMemo(() => sortedOrdersByDate.slice(0, 5), [sortedOrdersByDate]);

  const recentOrdersWeb = useMemo(() => sortedOrdersByDate.slice(0, 10), [sortedOrdersByDate]);

  const partnerById = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((partner) => {
      map.set(partner.id, partner.name);
    });
    return map;
  }, [partners]);

  const sortedPartnerJobsByDate = useMemo(() => {
    return [...partnerJobs].sort(
      (a, b) =>
        new Date(b.dispatchedAt ?? b.createdAt).getTime() - new Date(a.dispatchedAt ?? a.createdAt).getTime()
    );
  }, [partnerJobs]);

  const recentPartnerJobs = useMemo(() => sortedPartnerJobsByDate.slice(0, 5), [sortedPartnerJobsByDate]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((product) => {
      map.set(product.id, product);
    });
    return map;
  }, [products]);
  const orderStatusColorMap = useMemo(
    () => createOrderStatusColorMap(orderStatuses),
    [orderStatuses]
  );
  const financeCardBadgeCount = useMemo(() => {
    if (userRole === 'admin') {
      return expenseRequests.filter((request) => request.status === 'submitted').length;
    }
    if (userRole === 'manager') {
      return expenseRequests.filter(
        (request) => request.submittedByUserId === currentUserId && request.status === 'submitted'
      ).length;
    }
    return 0;
  }, [currentUserId, expenseRequests, userRole]);

  const openCasesCount = useMemo(
    () => cases.filter((caseItem) => caseItem.status !== 'Closed' && caseItem.status !== 'Resolved').length,
    [cases]
  );
  const activePartnerJobsCount = useMemo(
    () => partnerJobs.filter((job) => job.status !== 'collected' && job.status !== 'billed' && job.status !== 'cancelled').length,
    [partnerJobs]
  );
  const pendingPaymentCount = useMemo(
    () => (socialCheckoutDraftsQuery.data ?? []).filter((draft) => getSocialCheckoutEffectiveStatus(draft) === 'payment_submitted').length,
    [socialCheckoutDraftsQuery.data]
  );
  const onboardingSteps = useMemo<OnboardingStep[]>(() => [
    {
      id: 'business-profile',
      title: 'Set up business profile',
      shortLabel: 'Business',
      description: 'Add your business name, contact details, and return address.',
      complete: Boolean(businessName.trim() && businessPhone.trim() && returnAddress.trim()),
      actionLabel: 'Open',
      route: '/business-settings?from=settings',
      settingsPanel: 'business-settings',
    },
    {
      id: 'payment-methods',
      title: 'Add payment methods',
      shortLabel: 'Payments',
      description: 'Create payment labels customers and staff can use.',
      complete: paymentMethods.length > 0,
      actionLabel: 'Add',
      route: '/settings?section=payment-methods',
    },
    {
      id: 'order-flow',
      title: 'Review fulfillment flow',
      shortLabel: 'Fulfillment',
      description: 'Confirm the status steps your orders move through.',
      complete: orderStatuses.length >= 3,
      actionLabel: 'Review',
      route: '/settings?section=order-statuses',
    },
    {
      id: 'catalog',
      title: 'Add products or services',
      shortLabel: 'Catalog',
      description: 'Put at least one sellable item into your catalog.',
      complete: products.length > 0,
      actionLabel: 'Add',
      route: '/new-product',
    },
    {
      id: 'first-order',
      title: 'Create first order',
      shortLabel: 'First order',
      description: 'Test your workflow with a real or sample order.',
      complete: orders.length > 0,
      actionLabel: 'Create',
      route: '/new-order',
    },
    {
      id: 'team',
      title: 'Invite your team',
      shortLabel: 'Team',
      description: 'Add staff who will process orders with you.',
      complete: teamMembers.length > 1 || pendingInvites.some((invite) => invite.status !== 'cancelled'),
      actionLabel: 'Invite',
      route: '/invitations?from=settings',
      settingsPanel: 'invitations',
    },
    ...(canUseStorefront ? [{
      id: 'storefront',
      title: 'Enable storefront',
      shortLabel: 'Storefront',
      description: 'Turn on your public storefront when you are ready.',
      complete: storefrontEnabled,
      actionLabel: 'Open',
      route: '/storefront-settings?from=settings',
      settingsPanel: 'storefront-settings',
    }] : []),
  ], [businessName, businessPhone, canUseStorefront, returnAddress, orderStatuses.length, orders.length, paymentMethods.length, pendingInvites, products.length, storefrontEnabled, teamMembers.length]);
  const onboardingComplete = onboardingSteps.every((step) => step.complete);
  const onboardingReady = onboardingDismissedLoaded && !isLoadingBusinessSettings;
  const showOnboardingChecklist = onboardingReady && (userRole === 'admin' || userRole === 'manager') && !onboardingDismissed && !onboardingComplete;
  const hasDashboardBodyData = orders.length > 0
    || products.length > 0
    || customers.length > 0
    || cases.length > 0
    || expenseRequests.length > 0
    || (socialCheckoutDraftsQuery.data?.length ?? 0) > 0
    || (mobileHomeTasksQuery.data?.length ?? 0) > 0;
  const dashboardDataPending = isBackgroundSyncing
    || mobileHomeTasksQuery.isPending
    || socialCheckoutDraftsQuery.isPending;
  const shouldShowDashboardSkeleton = showInitialDashboardSkeleton || dashboardDataPending;

  const handleDismissOnboarding = () => {
    setOnboardingDismissed(true);
    if (businessId) {
      void storage.setItem(getOnboardingDismissedKey(businessId), 'true');
    }
  };

  const handleOnboardingStepPress = (step: OnboardingStep) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (Platform.OS === 'web' && step.settingsPanel) {
      router.push({
        pathname: '/settings',
        params: {
          panel: step.settingsPanel,
          from: 'settings',
          ...(step.id === 'storefront' ? { menu: 'integrations' } : null),
        },
      } as any);
      return;
    }
    router.push(step.route as any);
  };

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    let totalRevenue = 0;
    let lastMonthRevenue = 0;
    let productSales = 0;
    let deliveryFees = 0;
    let servicesRevenue = 0;
    let pendingOrders = 0;

    orders.forEach((order) => {
      const status = order.status.trim().toLowerCase();
      if (status !== 'delivered' && status !== 'completed' && status !== 'refunded') {
        pendingOrders += 1;
      }
      if (status === 'refunded') return;

      const orderDate = new Date(order.orderDate ?? order.createdAt);
      const month = orderDate.getMonth();
      const year = orderDate.getFullYear();

      if (month === currentMonth && year === currentYear) {
        totalRevenue += order.totalAmount;
        productSales += order.subtotal || order.totalAmount;
        deliveryFees += order.deliveryFee || 0;
        servicesRevenue += order.services?.reduce((sSum, service) => sSum + service.price, 0) || 0;
        return;
      }

      if (month === lastMonth && year === lastMonthYear) {
        lastMonthRevenue += order.totalAmount;
      }
    });

    const revenueChange = lastMonthRevenue > 0
      ? Math.round(((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;

    return {
      productSales,
      deliveryFees,
      servicesRevenue,
      totalRevenue,
      revenueChange,
      pendingOrders,
      totalOrders: orders.length,
    };
  }, [orders]);

  const fulfillment = useMemo(() => {
    const counts: Record<FulfillmentStageKey, number> = {
      processing: 0,
      dispatch: 0,
      delivered: 0,
    };

    orders.forEach((o) => {
      const key = getFulfillmentPipelineBucket(o);
      if (!key) return;
      counts[key] += 1;
    });

    return counts;
  }, [orders]);

  const handleQuickAction = (route: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push(route as any);
  };

  const handleCardPress = (route: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

  const goToFulfillment = (tab?: FulfillmentStageKey) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const pathname = isWebDesktop ? '/fulfillment' : '/fulfillment-pipeline';
    router.push(
      tab
        ? ({ pathname, params: { tab } } as any)
        : (pathname as any)
    );
  };

  const inventoryVariantCount = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.variants?.length ?? 0), 0);
  }, [products]);

  const mostSoldProducts = useMemo(() => {
    const qtyByProductId = new Map<string, number>();

    orders.forEach((order) => {
      const status = (order.status || '').toLowerCase();
      if (status.includes('refund')) return;

      order.items.forEach((item) => {
        const productId = item.productId;
        if (!productId) return;
        qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + (item.quantity ?? 0));
      });
    });

    const rows = Array.from(qtyByProductId.entries()).map(([productId, quantity]) => {
      const product = productById.get(productId);
      return {
        productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.variants?.[0]?.sku ?? '—',
        quantity,
      };
    });

    rows.sort((a, b) => b.quantity - a.quantity);
    return rows;
  }, [orders, productById]);

  const revenueTrend7d = useMemo(() => {
    const trendDays = 7;
    const toDayId = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (trendDays - 1));

    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - trendDays);

    let prevTotal = 0;
    let prevOrdersTotal = 0;

    const revenueByDay = new Map<string, number>();
    const ordersByDay = new Map<string, number>();
    orders.forEach((order) => {
      const status = (order.status || '').toLowerCase();
      if (status.includes('refund')) return;

      const date = new Date(order.orderDate ?? order.createdAt);
      if (date < prevStart || date > end) return;

      if (date < start) {
        prevTotal += order.totalAmount;
        prevOrdersTotal += 1;
        return;
      }

      const key = toDayId(date);
      revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + order.totalAmount);
      ordersByDay.set(key, (ordersByDay.get(key) ?? 0) + 1);
    });

    const days = Array.from({ length: trendDays }, (_, idx) => {
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      const key = toDayId(date);
      return {
        key,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        value: revenueByDay.get(key) ?? 0,
        orders: ordersByDay.get(key) ?? 0,
      };
    });

    const total = days.reduce((sum, day) => sum + day.value, 0);
    const ordersTotal = days.reduce((sum, day) => sum + day.orders, 0);
    const change =
      prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
    const ordersChange =
      prevOrdersTotal > 0 ? Math.round(((ordersTotal - prevOrdersTotal) / prevOrdersTotal) * 100) : null;

    return { days, total, ordersTotal, change, ordersChange };
  }, [orders]);

  const formatShortDate = (isoLike: string) => {
    const [yearRaw, monthRaw, dayRaw] = isoLike.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date(isoLike);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Processing':
        return '#3B82F6';
      case 'Lab Processing':
        return '#8B5CF6';
      case 'Quality Check':
        return '#111111';
      case 'Ready for Pickup':
        return '#10B981';
      case 'Delivered':
        return '#059669';
      case 'Refunded':
        return '#EF4444';
      default:
        return '#F59E0B';
    }
  };

  const [selectedTrendIndex, setSelectedTrendIndex] = useState<number | null>(null);

  const selectedTrendDay =
    typeof selectedTrendIndex === 'number' ? revenueTrend7d.days[selectedTrendIndex] : null;

  const revenueLineData = useMemo(
    () => revenueTrend7d.days.map((day) => ({ key: day.key, label: day.label, value: day.value })),
    [revenueTrend7d.days]
  );

  const orderVolumeData = useMemo(
    () => revenueTrend7d.days.map((day) => ({ key: day.key, label: day.label, value: day.orders })),
    [revenueTrend7d.days]
  );

  const platformData = useMemo(() => getPlatformBreakdown(orders), [orders]);

  const formatCompactCurrencyTick = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `₦${Math.round(value / 1_000_000)}m`;
    if (abs >= 1_000) return `₦${Math.round(value / 1_000)}k`;
    return `₦${Math.round(value)}`;
  };

  const WebRecentOrders = (
    <WebCard style={{ padding: 0, flex: 1 }}>
      <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text.primary }} className="text-base font-bold">
          Recent Orders
        </Text>
        <Pressable
          onPress={() => router.push('/orders')}
          className="flex-row items-center px-2 py-1 active:opacity-70"
        >
          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">
            View All
          </Text>
          <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {recentOrdersWeb.length === 0 ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          <Text style={{ color: colors.text.muted }} className="text-sm">
            No orders yet.
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          {recentOrdersWeb.map((order, idx) => {
            const statusColor = getStatusColor(order.status);
            const dateSource = order.orderDate ?? order.createdAt;
            return (
              <Pressable
                key={order.id}
                onPress={() => router.push(`/orders/${order.id}`)}
                className="active:opacity-70"
                style={{
                  borderBottomWidth: idx === recentOrdersWeb.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 }}>
                  <Text style={{ color: colors.text.primary, flex: 1.1 }} className="text-sm font-semibold" numberOfLines={1}>
                    {order.orderNumber}
                  </Text>
                  <Text style={{ color: colors.text.secondary, flex: 1.6 }} className="text-sm" numberOfLines={1}>
                    {order.customerName}
                  </Text>
                  <Text style={{ color: colors.text.primary, flex: 1 }} className="text-sm font-semibold" numberOfLines={1}>
                    {formatCurrency(order.totalAmount)}
                  </Text>
                  <View style={{ flex: 1.2, flexDirection: 'row' }}>
                    <View className="px-2 py-1 rounded-md" style={{ backgroundColor: `${statusColor}15` }}>
                      <Text style={{ color: statusColor }} className="text-xs font-semibold" numberOfLines={1}>
                        {order.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.text.tertiary, width: 72, textAlign: 'right' }} className="text-sm">
                    {formatShortDate(dateSource)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </WebCard>
  );

  const WebRecentPartnerJobs = (
    <WebCard style={{ padding: 0, flex: 1 }}>
      <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text.primary }} className="text-base font-bold">
          Partner Jobs
        </Text>
        <Pressable
          onPress={() => router.push('/partners?partnerSection=jobs')}
          className="flex-row items-center px-2 py-1 active:opacity-70"
        >
          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">
            View All
          </Text>
          <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {recentPartnerJobs.length === 0 ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          <Text style={{ color: colors.text.muted }} className="text-sm">
            No partner jobs yet.
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light, paddingHorizontal: 18 }}>
          {recentPartnerJobs.map((job, idx) => (
            <RecentPartnerJobItem
              key={job.id}
              job={job}
              partnerName={partnerById.get(job.partnerId) ?? ''}
              onPress={() => router.push('/partners?partnerSection=jobs')}
              isLast={idx === recentPartnerJobs.length - 1}
            />
          ))}
        </View>
      )}
    </WebCard>
  );

  const WebMostSoldProducts = (
    <WebCard style={{ padding: 0, flex: 1 }}>
      <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <Package size={20} color={colors.text.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base" numberOfLines={1}>
              Most Sold
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
              {mostSoldProducts.length === 0
                ? 'No sales yet'
                : `Top ${Math.min(mostSoldProducts.length, 8)} products by quantity`}
            </Text>
          </View>
        </View>

        <Pressable onPress={() => router.push('/insights/best-sellers')} className="flex-row items-center px-2 py-1 active:opacity-70">
          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">
            View All
          </Text>
          <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {mostSoldProducts.length === 0 ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          <Text style={{ color: colors.text.muted }} className="text-sm">
            No sales yet.
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          {mostSoldProducts.slice(0, 8).map((row, idx, arr) => (
            <Pressable
              key={row.productId}
              onPress={() => router.push(`/inventory/${row.productId}`)}
              className="active:opacity-70"
              style={{
                borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                borderBottomColor: colors.border.light,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                    {row.sku}
                  </Text>
                </View>
                <Text style={{ color: colors.text.primary, width: 90, textAlign: 'right' }} className="text-sm font-semibold">
                  {row.quantity}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </WebCard>
  );

  const WebRevenueTrend = (
    <WebCard style={{ padding: 18, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <DollarSign size={20} color={colors.text.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base" numberOfLines={1}>
              Revenue Trend
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
              {selectedTrendDay
                ? `${formatShortDate(selectedTrendDay.key)} • ${formatCurrency(selectedTrendDay.value)}`
                : `Last 7 days • ${formatCurrency(revenueTrend7d.total)} • ${revenueTrend7d.ordersTotal} orders`}
            </Text>
          </View>
        </View>
        {revenueTrend7d.change !== null ? (
          <View
            className="flex-row items-center px-2 py-1 rounded-full"
            style={{ backgroundColor: revenueTrend7d.change >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}
          >
            {revenueTrend7d.change >= 0 ? (
              <ArrowUpRight size={12} color="#22C55E" strokeWidth={2.5} />
            ) : (
              <TrendingDown size={12} color="#EF4444" strokeWidth={2.5} />
            )}
            <Text style={{ color: revenueTrend7d.change >= 0 ? '#22C55E' : '#EF4444' }} className="text-xs font-semibold ml-0.5">
              {Math.abs(revenueTrend7d.change)}%
            </Text>
          </View>
        ) : null}
      </View>

      <InteractiveLineChart
        data={revenueLineData}
        height={220}
        lineColor={colors.text.primary}
        gridColor={colors.border.light}
        textColor={colors.text.muted}
        selectedIndex={selectedTrendIndex}
        onSelectIndex={setSelectedTrendIndex}
        formatYLabel={formatCompactCurrencyTick}
      />
    </WebCard>
  );

  const WebOrderVolume = (
    <WebCard style={{ padding: 18, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <ShoppingCart size={20} color={colors.text.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base" numberOfLines={1}>
              Order Volume
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
              {selectedTrendDay
                ? `${formatShortDate(selectedTrendDay.key)} • ${selectedTrendDay.orders} orders`
                : `Last 7 days • ${revenueTrend7d.ordersTotal} orders`}
            </Text>
          </View>
        </View>
        {revenueTrend7d.ordersChange !== null ? (
          <View
            className="flex-row items-center px-2 py-1 rounded-full"
            style={{ backgroundColor: revenueTrend7d.ordersChange >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}
          >
            {revenueTrend7d.ordersChange >= 0 ? (
              <ArrowUpRight size={12} color="#22C55E" strokeWidth={2.5} />
            ) : (
              <TrendingDown size={12} color="#EF4444" strokeWidth={2.5} />
            )}
            <Text style={{ color: revenueTrend7d.ordersChange >= 0 ? '#22C55E' : '#EF4444' }} className="text-xs font-semibold ml-0.5">
              {Math.abs(revenueTrend7d.ordersChange)}%
            </Text>
          </View>
        ) : null}
      </View>

      <InteractiveBarChart
        data={orderVolumeData}
        height={220}
        barColor={colors.text.primary}
        gridColor={colors.border.light}
        textColor={colors.text.muted}
        selectedIndex={selectedTrendIndex}
        onSelectIndex={setSelectedTrendIndex}
        formatYLabel={(value) => String(Math.round(value))}
      />
    </WebCard>
  );

  const WebStaffTasksCard = (
    <WebCard style={{ padding: 0, flex: 1 }}>
      <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <ClipboardList size={20} color={colors.text.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-base" numberOfLines={1}>
              Your Tasks
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-xs" numberOfLines={1}>
              {mobileHomeScopedTasks.length} added or assigned
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/tasks' as any)} className="flex-row items-center px-2 py-1 active:opacity-70">
          <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">
            View All
          </Text>
          <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {mobileHomeTasksQuery.isPending || shouldShowDashboardSkeleton ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 12 }}>
          {[0, 1, 2].map((index) => (
            <View key={`web-task-skeleton-${index}`} className="flex-row items-center" style={{ gap: 10 }}>
              <SkeletonBox width={28} height={28} rounded="full" />
              <View style={{ flex: 1 }}>
                <SkeletonBox width="72%" height={13} rounded="md" />
                <View style={{ height: 7 }} />
                <SkeletonBox width="48%" height={11} rounded="md" />
              </View>
              <SkeletonBox width={62} height={22} rounded="full" />
            </View>
          ))}
        </View>
      ) : mobileHomeTaskRows.length === 0 ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          <Text style={{ color: colors.text.muted }} className="text-sm">
            No open tasks assigned or created by you.
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          {mobileHomeTaskRows.map((task, index) => {
            const status = getTaskStatusMeta(task.status);
            return (
              <Pressable
                key={task.id}
                onPress={() => router.push(`/(tabs)/task/${task.id}` as any)}
                className="active:opacity-70"
                style={{
                  borderBottomWidth: index === mobileHomeTaskRows.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 }}>
                  <Text style={{ color: colors.text.primary, flex: 1.5 }} className="text-sm font-semibold" numberOfLines={1}>
                    {toSentenceCase(task.title)}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, width: 92, textAlign: 'right' }} className="text-sm">
                    {formatTaskDueDate(task.due_date)}
                  </Text>
                  <View style={{ width: 110, alignItems: 'flex-end' }}>
                    <View className="px-2 py-1 rounded-md" style={{ backgroundColor: status.background }}>
                      <Text style={{ color: status.color }} className="text-xs font-semibold" numberOfLines={1}>
                        {status.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </WebCard>
  );

  if (isWebDesktop) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <NotificationPanel
          visible={showNotifications}
          onClose={() => setShowNotifications(false)}
          notifications={notifications}
          onNotificationPress={handleNotificationPress}
          onMarkAllRead={handleMarkAllRead}
          orders={orders}
          profilesMap={profilesMap}
        />
        <SafeAreaView className="flex-1" edges={['top']}>
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 28, paddingBottom: 40 }}
          >
            <WebContainer>
              <WebPageHeader
                title="Dashboard"
                subtitle={userName ? `Welcome back, ${userName}` : 'Welcome back'}
                actions={
                  <>
                    <Pressable
                      onPress={() => router.push('/new-order')}
                      className="rounded-full px-4 flex-row items-center active:opacity-80"
                      style={{ backgroundColor: colors.accent.primary, height: 44 }}
                    >
                      <Plus size={18} color={colors.bg.primary === '#111111' ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                      <Text
                        style={{ color: colors.bg.primary === '#111111' ? '#000000' : '#FFFFFF' }}
                        className="font-semibold ml-2 text-sm"
                      >
                        New Order
                      </Text>
                    </Pressable>
                    <WebFeatureSearchMenu />
                    <WebMoreMenu />
                    <NotificationBell
                      count={unreadNotificationCount}
                      onPress={() => setShowNotifications((prev) => !prev)}
                    />
                  </>
                }
              />

              {showAuditBanner ? (
                <View style={{ marginTop: 16 }}>
                  <AuditBanner onPress={() => handleQuickAction('/inventory-audit')} inset={false} />
                </View>
              ) : null}

              {upcomingHomeEvent && upcomingHomeEventMeta ? (
                <View style={{ marginTop: 16 }}>
                  <EventBanner
                    title={upcomingHomeEventMeta.title}
                    subtitle={upcomingHomeEventMeta.subtitle}
                    onPress={() => router.push(`/(tabs)/task/${upcomingHomeEvent.id}` as any)}
                    inset={false}
                  />
                </View>
              ) : null}

              {showOnboardingChecklist ? (
                <View style={{ marginTop: 16 }}>
                  <OnboardingChecklistCard
                    steps={onboardingSteps}
                    onDismiss={handleDismissOnboarding}
                    onStepPress={handleOnboardingStepPress}
                    inset={false}
                  />
                </View>
              ) : null}

              <View style={{ marginTop: 16 }}>
                <FulfillmentPipelineCard
                  counts={fulfillment}
                  onPress={() => goToFulfillment()}
                  onStagePress={(stage) => goToFulfillment(stage)}
                />
              </View>

              <View style={{ marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {(userRole === 'admin' || userRole === 'manager') && (
                  <MetricCard
                    title="Total Revenue"
                    value={formatCurrency(stats.totalRevenue)}
                    subtitle="This month"
                    trend={stats.revenueChange}
                    icon={<DollarSign size={18} color={colors.text.primary} strokeWidth={2.5} />}
                    onPress={() => handleCardPress('/insights')}
                    loading={shouldShowDashboardSkeleton}
                  />
                )}
                <MetricCard
                  title="Active Orders"
                  value={String(stats.pendingOrders)}
                  subtitle={`${stats.totalOrders} total`}
                  icon={<ShoppingCart size={18} color={colors.text.primary} strokeWidth={2.5} />}
                  onPress={() => handleCardPress('/orders')}
                  loading={shouldShowDashboardSkeleton}
                />
                <MetricCard
                  title="Inventory Items"
                  value={String(inventoryVariantCount)}
                  subtitle={`${products.length} products`}
                  icon={<Package size={18} color={colors.text.primary} strokeWidth={2.5} />}
                  onPress={() => handleCardPress('/inventory')}
                  loading={shouldShowDashboardSkeleton}
                />
                <MetricCard
                  title="Customers"
                  value={String(customers.length)}
                  subtitle="Total customers"
                  icon={<Users size={18} color={colors.text.primary} strokeWidth={2.5} />}
                  onPress={() => handleCardPress('/customers')}
                  loading={shouldShowDashboardSkeleton}
                />
              </View>

              <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
                {(userRole === 'admin' || userRole === 'manager') && (
                  <View style={{ flex: 1.4, minWidth: 0 }}>{WebRevenueTrend}</View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>{WebOrderVolume}</View>
              </View>

              {userRole === 'staff' ? (
                <View style={{ marginTop: 16 }}>
                  {WebStaffTasksCard}
                </View>
              ) : null}

              <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
                <View style={{ flex: 1.4, minWidth: 0 }}>{WebRecentOrders}</View>
                <View style={{ flex: 1, minWidth: 0 }}>{WebMostSoldProducts}</View>
              </View>

              <View style={{ marginTop: 16 }}>
                {WebRecentPartnerJobs}
              </View>
            </WebContainer>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        >
          {/* Header */}
          <View className="px-5 pt-6 pb-2">
            <View className="flex-row items-center justify-between">
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium">Welcome back</Text>
                {userName ? (
                  <Text style={{ color: colors.text.primary }} className="text-3xl font-bold tracking-tight">{userName}</Text>
                ) : null}
              </View>
              <NotificationBell
                count={unreadNotificationCount}
                onPress={() => setShowNotifications(true)}
              />
            </View>
          </View>
          <NotificationPanel
            visible={showNotifications}
            onClose={() => setShowNotifications(false)}
            notifications={notifications}
            onNotificationPress={handleNotificationPress}
            onMarkAllRead={handleMarkAllRead}
            orders={orders}
            profilesMap={profilesMap}
          />

          {/* Audit Banner - Shows between 25th-31st if no audit logged */}
          {showAuditBanner && (
            <AuditBanner onPress={() => handleQuickAction('/inventory-audit')} />
          )}

          {upcomingHomeEvent && upcomingHomeEventMeta ? (
            <EventBanner
              title={upcomingHomeEventMeta.title}
              subtitle={upcomingHomeEventMeta.subtitle}
              onPress={() => router.push(`/(tabs)/task/${upcomingHomeEvent.id}` as any)}
            />
          ) : null}

          {pendingPrintQueueCount > 0 ? (
            <PrintQueueBanner
              count={pendingPrintQueueCount}
              onPress={() => router.push('/fyll-print' as any)}
            />
          ) : null}

          {showOnboardingChecklist ? (
            <OnboardingChecklistCard
              steps={onboardingSteps}
              onDismiss={handleDismissOnboarding}
              onStepPress={handleOnboardingStepPress}
            />
          ) : null}

          {/* Hero Revenue Card — admin & manager only */}
          {(userRole === 'admin' || userRole === 'manager') && (
          <View className="px-5 pt-4">
            <View
              className="rounded-3xl overflow-hidden p-6"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ color: colors.text.muted }} className="text-sm font-medium">Total Revenue</Text>
                {shouldShowDashboardSkeleton ? (
                  <SkeletonBox width={48} height={24} rounded="full" />
                ) : stats.revenueChange !== 0 ? (
                  <View style={{ backgroundColor: stats.revenueChange >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                    {stats.revenueChange >= 0 ? (
                      <ArrowUpRight size={12} color="#22C55E" strokeWidth={2.5} />
                    ) : (
                      <TrendingDown size={12} color="#EF4444" strokeWidth={2.5} />
                    )}
                    <Text style={{ color: stats.revenueChange >= 0 ? '#22C55E' : '#EF4444', fontSize: 12, fontWeight: '700', marginLeft: 2 }}>
                      {Math.abs(stats.revenueChange)}%
                    </Text>
                  </View>
                ) : null}
              </View>
              {shouldShowDashboardSkeleton ? (
                <>
                  <SkeletonBox width="72%" height={38} rounded="md" />
                  <View style={{ height: 8 }} />
                  <SkeletonBox width="30%" height={14} rounded="md" />
                </>
              ) : (
                <>
                  <Text style={{ color: colors.text.primary }} className="text-4xl font-bold tracking-tight mb-1">
                    {formatCurrency(stats.totalRevenue)}
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm">This month</Text>
                </>
              )}

              <View className="flex-row mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                <View className="flex-1">
                  <Text style={{ color: colors.text.muted }} className="text-xs">Products</Text>
                  {shouldShowDashboardSkeleton ? <SkeletonBox width="78%" height={14} rounded="md" /> : <Text style={{ color: colors.text.primary }} className="font-semibold">{formatCurrency(stats.productSales)}</Text>}
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text.muted }} className="text-xs">Delivery</Text>
                  {shouldShowDashboardSkeleton ? <SkeletonBox width="78%" height={14} rounded="md" /> : <Text style={{ color: colors.text.primary }} className="font-semibold">{formatCurrency(stats.deliveryFees)}</Text>}
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text.muted }} className="text-xs">Services</Text>
                  {shouldShowDashboardSkeleton ? <SkeletonBox width="78%" height={14} rounded="md" /> : <Text style={{ color: colors.text.primary }} className="font-semibold">{formatCurrency(stats.servicesRevenue)}</Text>}
                </View>
              </View>
            </View>
          </View>
          )}

          {/* Stats Grid - Clickable */}
          <View className="px-5 pt-4">
            <View className="flex-row flex-wrap gap-3">
              <MetricCard
                title="Active Orders"
                value={String(stats.pendingOrders)}
                subtitle={`${stats.totalOrders} total`}
                icon={<ShoppingCart size={20} color={colors.text.primary} strokeWidth={2} />}
                onPress={() => handleCardPress('/(tabs)/orders')}
                loading={shouldShowDashboardSkeleton}
              />
              <MetricCard
                title="Products"
                value={String(products.length)}
                subtitle="in catalog"
                icon={<BarChart3 size={20} color={colors.text.primary} strokeWidth={2} />}
                onPress={() => handleCardPress('/(tabs)/inventory')}
                loading={shouldShowDashboardSkeleton}
              />
            </View>
          </View>

          <View className="px-5 pt-6">
            <View className="flex-row gap-3">
              {canUseCases ? (
                <Pressable
                  onPress={() => handleCardPress('/cases')}
                  className="flex-1 rounded-2xl p-4 active:opacity-80"
                  style={{
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    position: 'relative',
                  }}
                >
                  {openCasesCount > 0 ? (
                    <View
                      className="rounded-full items-center justify-center"
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        minWidth: 22,
                        height: 22,
                        paddingHorizontal: 6,
                        backgroundColor: '#F59E0B',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        {openCasesCount > 99 ? '99+' : openCasesCount}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mb-3"
                    style={{ backgroundColor: 'rgba(245,158,11,0.14)' }}
                  >
                    <FileText size={20} color="#F59E0B" strokeWidth={2.5} />
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-sm">Cases</Text>
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1" numberOfLines={2}>
                    {openCasesCount > 0 ? 'Open cases' : 'Customer cases'}
                  </Text>
                </Pressable>
              ) : null}

              {canUseSocialCheckout ? (
                <Pressable
                  onPress={() => handleCardPress('/payments')}
                  className="flex-1 rounded-2xl p-4 active:opacity-80"
                  style={{
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    position: 'relative',
                  }}
                >
                  {pendingPaymentCount > 0 ? (
                    <View
                      className="rounded-full items-center justify-center"
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        minWidth: 22,
                        height: 22,
                        paddingHorizontal: 6,
                        backgroundColor: '#8B5CF6',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        {pendingPaymentCount > 99 ? '99+' : pendingPaymentCount}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mb-3"
                    style={{ backgroundColor: 'rgba(139,92,246,0.12)' }}
                  >
                    <Wallet size={20} color="#8B5CF6" strokeWidth={2.5} />
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-sm">Payments</Text>
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1" numberOfLines={2}>
                    {pendingPaymentCount > 0 ? 'Pending review' : 'Social checkout links'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Finance & Insights navigation cards */}
          {(userRole === 'admin' || userRole === 'manager') && (canUseFinance || canUseInsights) && (
            <View className="px-5 pt-6">
              <View className="flex-row gap-3">
                {canUseFinance ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)/finance' as any)}
                    className="flex-1 rounded-2xl p-4 active:opacity-80"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, position: 'relative' }}
                  >
                    {financeCardBadgeCount > 0 ? (
                      <View
                        className="rounded-full items-center justify-center"
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          minWidth: 22,
                          height: 22,
                          paddingHorizontal: 6,
                          backgroundColor: '#2563EB',
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                          {financeCardBadgeCount > 99 ? '99+' : financeCardBadgeCount}
                        </Text>
                      </View>
                    ) : null}
                    <View className="w-9 h-9 rounded-xl items-center justify-center mb-2" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                      <DollarSign size={18} color="#10B981" strokeWidth={2.5} />
                    </View>
                    <Text style={{ color: colors.text.primary }} className="font-bold text-sm">Finance</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                      {userRole === 'admin'
                        ? `${financeCardBadgeCount} requests pending`
                        : 'Expenses & procurement'}
                    </Text>
                  </Pressable>
                ) : null}
                {userRole === 'admin' && canUseInsights ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)/insights' as any)}
                    className="flex-1 rounded-2xl p-4 active:opacity-80"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <View className="w-9 h-9 rounded-xl items-center justify-center mb-2" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
                      <BarChart3 size={18} color="#3B82F6" strokeWidth={2.5} />
                    </View>
                    <Text style={{ color: colors.text.primary }} className="font-bold text-sm">Insights</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">Sales & trends</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}

          {/* Partner Jobs */}
          <View className="px-5 pt-6">
            <Pressable
              onPress={() => router.push('/partners?partnerSection=jobs' as any)}
              className="w-full rounded-2xl p-4 active:opacity-80"
              style={{
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border.light,
                position: 'relative',
              }}
            >
              {activePartnerJobsCount > 0 ? (
                <View
                  className="rounded-full items-center justify-center"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    marginTop: -11,
                    right: 14,
                    minWidth: 22,
                    height: 22,
                    paddingHorizontal: 6,
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  }}
                >
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    {activePartnerJobsCount > 99 ? '99+' : activePartnerJobsCount}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-center">
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}
                >
                  <Truck size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.5} />
                </View>
                <View className="flex-1 pr-10">
                  <Text style={{ color: colors.text.primary }} className="font-bold text-sm">Partner Jobs</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                    {activePartnerJobsCount > 0 ? `${activePartnerJobsCount} active job${activePartnerJobsCount === 1 ? '' : 's'}` : 'No active jobs'}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>

          {/* Fulfillment Pipeline */}
          <View className="px-5 pt-6">
            <FulfillmentPipelineCard
              counts={fulfillment}
              onPress={() => goToFulfillment()}
              onStagePress={(stage) => goToFulfillment(stage)}
            />
          </View>

          {/* Recent Orders Feed */}
          {(shouldShowDashboardSkeleton || recentOrdersMobile.length > 0) && (
            <View className="px-5 pt-6">
              <View
                className="rounded-2xl p-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center mb-2">
                  <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                    <ShoppingCart size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-base">Recent Orders</Text>
                    {shouldShowDashboardSkeleton ? (
                      <SkeletonBox width={72} height={11} rounded="md" />
                    ) : (
                      <Text style={{ color: colors.text.tertiary }} className="text-xs">Last {recentOrdersMobile.length} orders</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => router.push('/(tabs)/orders')}
                    className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">View All</Text>
                    <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                </View>
                {shouldShowDashboardSkeleton ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <View
                      key={`recent-order-skeleton-${index}`}
                      className="flex-row items-center"
                      style={{
                        paddingVertical: 12,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <SkeletonBox width="58%" height={13} rounded="md" />
                        <View style={{ height: 8 }} />
                        <SkeletonBox width="42%" height={11} rounded="md" />
                      </View>
                      <SkeletonBox width={78} height={22} rounded="full" />
                    </View>
                  ))
                ) : (
                  recentOrdersMobile.map((order, index) => (
                    <RecentOrderItem
                      key={order.id}
                      order={order}
                      productById={productById}
                      statusColorMap={orderStatusColorMap}
                      onPress={() => router.push(`/order/${order.id}`)}
                      isLast={index === recentOrdersMobile.length - 1}
                    />
                  ))
                )}
              </View>
            </View>
          )}

          {(shouldShowDashboardSkeleton || recentPartnerJobs.length > 0) && (
            <View className="px-5 pt-6">
              <View
                className="rounded-2xl p-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center mb-2">
                  <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                    <Truck size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-base">Partner Jobs</Text>
                    {shouldShowDashboardSkeleton ? (
                      <SkeletonBox width={96} height={11} rounded="md" />
                    ) : (
                      <Text style={{ color: colors.text.tertiary }} className="text-xs">Last {recentPartnerJobs.length} jobs</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => router.push('/partners?partnerSection=jobs')}
                    className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">View All</Text>
                    <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                </View>
                {shouldShowDashboardSkeleton ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <View
                      key={`partner-job-skeleton-${index}`}
                      className="flex-row items-center"
                      style={{
                        paddingVertical: 12,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border.light,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <SkeletonBox width="54%" height={13} rounded="md" />
                        <View style={{ height: 8 }} />
                        <SkeletonBox width="48%" height={11} rounded="md" />
                      </View>
                      <SkeletonBox width={88} height={22} rounded="full" />
                    </View>
                  ))
                ) : (
                  recentPartnerJobs.map((job, index) => (
                    <RecentPartnerJobItem
                      key={job.id}
                      job={job}
                      partnerName={partnerById.get(job.partnerId) ?? ''}
                      onPress={() => router.push('/partners?partnerSection=jobs')}
                      isLast={index === recentPartnerJobs.length - 1}
                    />
                  ))
                )}
              </View>
            </View>
          )}

          {shouldShowHomeTaskCard ? (
            <View className="px-5 pt-6">
              <View
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center p-4">
                  <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                    <ClipboardList size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary }} className="font-bold text-base">
                      {userRole === 'staff' ? 'Your Tasks' : 'Tasks'}
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">
                      {userRole === 'staff' ? `${mobileHomeScopedTasks.length} added or assigned` : `${mobileHomeScopedTasks.length} active`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(tabs)/tasks' as any)}
                    className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">View All</Text>
                    <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                  {mobileHomeTasksQuery.isPending || shouldShowDashboardSkeleton
                    ? Array.from({ length: 5 }).map((_, index) => (
                      <View
                        key={`task-loading-${index}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderBottomWidth: index === 4 ? 0 : 1,
                          borderBottomColor: colors.border.light,
                        }}
                      >
                        <View style={{ flex: 1.6 }}>
                          <SkeletonBox width="72%" height={13} rounded="md" />
                          <View style={{ height: 7 }} />
                          <SkeletonBox width="48%" height={11} rounded="md" />
                        </View>
                        <View style={{ width: 70, alignItems: 'flex-end' }}>
                          <SkeletonBox width={52} height={12} rounded="md" />
                        </View>
                        <View style={{ width: 94, alignItems: 'flex-end' }}>
                          <SkeletonBox width={72} height={22} rounded="full" />
                        </View>
                      </View>
                    ))
                    : null}

                  {!mobileHomeTasksQuery.isPending && !shouldShowDashboardSkeleton
                    ? mobileHomeTaskRows.map((task, index) => {
                      const status = getTaskStatusMeta(task.status);
                      return (
                        <Pressable
                          key={task.id}
                          onPress={() => router.push(`/(tabs)/task/${task.id}` as any)}
                          className="active:opacity-70"
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: index === mobileHomeTaskRows.length - 1 ? 0 : 1,
                            borderBottomColor: colors.border.light,
                          }}
                        >
                          <Text style={{ flex: 1.6, color: colors.text.primary, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                            {toSentenceCase(task.title)}
                          </Text>
                          <Text style={{ width: 70, textAlign: 'right', color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>
                            {formatTaskDueDate(task.due_date)}
                          </Text>
                          <View style={{ width: 94, alignItems: 'flex-end' }}>
                            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: status.background }}>
                              <Text style={{ color: status.color, fontSize: 11, fontWeight: '700' }}>
                                {status.label}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })
                    : null}
                </View>
              </View>
            </View>
          ) : null}

          {/* Most Sold Products - Mobile */}
          {(shouldShowDashboardSkeleton || mostSoldProducts.length > 0) && (
            <View className="px-5 pt-6">
              <View
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center p-4">
                  <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: colors.bg.secondary }}>
                    <Package size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="font-bold text-base">Most Sold</Text>
                    {shouldShowDashboardSkeleton ? (
                      <SkeletonBox width={112} height={11} rounded="md" />
                    ) : (
                      <Text style={{ color: colors.text.tertiary }} className="text-xs">Top {Math.min(mostSoldProducts.length, 5)} products by quantity</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => router.push('/insights/best-sellers')}
                    className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">View All</Text>
                    <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                  {shouldShowDashboardSkeleton ? Array.from({ length: 4 }).map((_, idx) => (
                    <View
                      key={`most-sold-skeleton-${idx}`}
                      style={{
                        borderBottomWidth: idx === 3 ? 0 : 1,
                        borderBottomColor: colors.border.light,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <SkeletonBox width="58%" height={13} rounded="md" />
                          <View style={{ height: 8 }} />
                          <SkeletonBox width="36%" height={11} rounded="md" />
                        </View>
                        <SkeletonBox width={28} height={18} rounded="md" />
                      </View>
                    </View>
                  )) : mostSoldProducts.slice(0, 5).map((row, idx, arr) => (
                    <Pressable
                      key={row.productId}
                      onPress={() => router.push(`/product/${row.productId}`)}
                      className="active:opacity-70"
                      style={{
                        borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                        borderBottomColor: colors.border.light,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>
                            {row.sku}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text.primary }} className="text-base font-bold">
                          {row.quantity}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Sales by Source */}
          <View className="px-5 pt-6">
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <BarChart3 size={20} color={colors.text.primary} strokeWidth={2} />
                  </View>
                  <Text style={{ color: colors.text.primary }} className="font-bold text-base">Sales by Source</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/insights/platforms')}
                  className="flex-row items-center px-3 py-1.5 rounded-full active:opacity-70"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mr-1">View All</Text>
                  <ChevronRight size={14} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              </View>
              {shouldShowDashboardSkeleton ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <View key={`platform-source-skeleton-${index}`} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <SkeletonBox width="38%" height={14} rounded="md" />
                      <SkeletonBox width={58} height={14} rounded="md" />
                    </View>
                    <SkeletonBox width="100%" height={12} rounded="full" />
                  </View>
                ))
              ) : platformData.length === 0 ? (
                <Text style={{ color: colors.text.muted }} className="text-sm text-center py-4">No orders yet</Text>
              ) : (
                platformData.slice(0, 4).map((item) => (
                  <View key={item.label} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">
                        {item.label}
                      </Text>
                      <View className="flex-row items-center">
                        <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                          {item.value}
                        </Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs ml-2">
                          {item.percentage}%
                        </Text>
                      </View>
                    </View>
                    <View
                      className="h-3 rounded-full overflow-hidden"
                      style={{ backgroundColor: colors.bg.secondary }}
                    >
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: colors.text.primary,
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Quick Actions */}
          <View className="px-5 pt-6 pb-8">
            <Text style={{ color: colors.text.primary }} className="font-bold text-base mb-4">Quick Actions</Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => handleQuickAction('/new-order')}
                className="flex-1 rounded-2xl overflow-hidden active:opacity-80 p-4"
                style={{ backgroundColor: '#111111' }}
              >
                <Plus size={24} color="#FFFFFF" strokeWidth={2} />
                <Text className="text-white font-semibold mt-2">New Order</Text>
              </Pressable>
              <Pressable
                onPress={() => handleQuickAction('/scan')}
                className="flex-1 active:opacity-70"
              >
                <View
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <Scan size={24} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold mt-2">Scan Item</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
