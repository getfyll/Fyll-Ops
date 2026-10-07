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
import useFyllStore, { formatCurrency, getSocialCheckoutEffectiveStatus, Order } from '@/lib/state/fyll-store';
import {
  buildDashboardSnapshot,
  getDashboardPeriodKey,
  isCompleteDashboardSnapshot,
  type DashboardRecentOrder,
  type DashboardRecentPartnerJob,
} from '@/lib/dashboard-snapshot';
import { useThemeColors } from '@/lib/theme';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { collaborationData, type CollaborationNotification } from '@/lib/supabase/collaboration';
import { supabase } from '@/lib/supabase';
import { isTeamThreadEntityId, getTeamThreadDisplayNameFromEntityId } from '@/lib/team-threads';
import { FulfillmentPipelineCard, type FulfillmentStageKey } from '@/components/FulfillmentPipelineCard';
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
import { SearchClearButton } from '@/components/SearchClearButton';
import { fetchSocialCheckoutDrafts, getSocialCheckoutQueryKey } from '@/lib/social-checkout-query';
import { supabaseData } from '@/lib/supabase/data';
import { buildHomeNeeds, type HomePaymentRecord } from '@/lib/home-needs';
import { NeedsYouCard, NeedsYouCarousel, useDismissedNeeds, useVisibleNeeds } from '@/components/home/NeedsYouToday';
import { JumpToRow, JumpToGrid, buildJumpToItems } from '@/components/home/JumpToRow';
import { EmptyLine, HomeCard, HomeCardHeader, HomeLink, HomeRow, KpiStrip, StatusText, HOME_GAP, type KpiItem } from '@/components/home/home-ui';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';

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
            <SearchClearButton visible={Boolean(query.trim())} onPress={() => setQuery('')} />
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
  orders?: Pick<Order, 'id' | 'orderNumber' | 'customerName' | 'createdAt' | 'createdBy'>[];
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

  const renderNewOrderItem = (
    order: Pick<Order, 'id' | 'orderNumber' | 'customerName' | 'createdAt' | 'createdBy'>,
    compact: boolean
  ) => (
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

// Recent order row (shared by the web and mobile home page). `wide` lays it out
// as a table row for the full-width web card.
interface RecentOrderItemProps {
  order: DashboardRecentOrder;
  statusColor: string;
  dateLabel: string;
  onPress: () => void;
  first?: boolean;
  wide?: boolean;
}

function RecentOrderItem({ order, statusColor, dateLabel, onPress, first = false, wide = false }: RecentOrderItemProps) {
  const palette = usePaymentsPalette();
  if (wide) {
    return (
      <HomeRow onPress={onPress} first={first} style={{ gap: 16 }}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', flex: 1.5 }} numberOfLines={1}>{order.customerName}</Text>
        <Text style={{ color: palette.faint, fontSize: 12, flex: 1 }} numberOfLines={1}>{order.orderNumber}</Text>
        <Text style={{ color: palette.faint, fontSize: 12, width: 90 }}>{dateLabel}</Text>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', width: 110, textAlign: 'right' }}>{formatCurrency(order.totalAmount)}</Text>
        <View style={{ width: 150, alignItems: 'flex-end' }}>
          <StatusText label={order.status} color={statusColor} />
        </View>
      </HomeRow>
    );
  }
  return (
    <HomeRow onPress={onPress} first={first}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{order.customerName}</Text>
        <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{order.orderNumber} {'\u00b7'} {dateLabel}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{formatCurrency(order.totalAmount)}</Text>
        <StatusText label={order.status} color={statusColor} />
      </View>
    </HomeRow>
  );
}

interface RecentPartnerJobItemProps {
  job: DashboardRecentPartnerJob;
  onPress: () => void;
  first?: boolean;
}

function RecentPartnerJobItem({ job, onPress, first = false }: RecentPartnerJobItemProps) {
  const palette = usePaymentsPalette();

  const normalizedStatus = String(job.status ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const statusMeta = normalizedStatus.includes('cancel')
    ? { label: 'Cancelled', color: palette.danger }
    : normalizedStatus.includes('ready')
      ? { label: 'Ready for pickup', color: palette.tones.verified.ink }
      : normalizedStatus.includes('progress')
        ? { label: 'In progress', color: palette.warn }
        : normalizedStatus.includes('sent to business') || normalizedStatus.includes('returned')
          ? { label: 'Sent to business', color: palette.tones.verified.ink }
          : normalizedStatus.includes('sent')
            ? { label: 'Sent to partner', color: palette.muted }
            : { label: normalizedStatus ? normalizedStatus.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Status', color: palette.muted };

  return (
    <HomeRow onPress={onPress} first={first}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{job.customerName || 'Customer'}</Text>
        <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{job.jobType || job.itemLabel || 'Partner job'} {'\u00b7'} {job.partnerName || 'No partner'}</Text>
      </View>
      <StatusText label={statusMeta.label} color={statusMeta.color} />
    </HomeRow>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const isDark = colors.bg.primary === '#111111';
  const tabBarHeight = useTabBarHeight();
  const { isDesktop, isMobile } = useBreakpoint();
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_700Bold });
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const cases = useFyllStore((s) => s.cases);
  const dashboardSnapshot = useFyllStore((s) => s.dashboardSnapshot);
  const hasVerifiedDashboardData = useFyllStore((s) => s.hasVerifiedDashboardData);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const paymentMethods = useFyllStore((s) => s.paymentMethods);
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const customers = useFyllStore((s) => s.customers);
  const auditLogs = useFyllStore((s) => s.auditLogs);
  const { businessName, businessPhone, returnAddress, storefrontEnabled, featureAccess, isLoading: isLoadingBusinessSettings } = useBusinessSettings();
  const canUseStorefront = isBusinessFeatureEnabled(featureAccess, 'storefront');
  const canUseCases = isBusinessFeatureEnabled(featureAccess, 'cases');
  const canUseSocialCheckout = isBusinessFeatureEnabled(featureAccess, 'socialCheckout');
  const canUseTasks = isBusinessFeatureEnabled(featureAccess, 'tasks');
  const canUseFinance = isBusinessFeatureEnabled(featureAccess, 'finance');
  const canUseInsights = isBusinessFeatureEnabled(featureAccess, 'insights');
  const canUseFyllPrint = isBusinessFeatureEnabled(featureAccess, 'fyllPrint');

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
  const shouldShowHomeTaskCard = canUseTasks && (!isWebDesktop || userRole === 'staff');

  const refreshPrintQueueCount = useCallback(() => {
    let isCancelled = false;
    if (!businessId || isLoadingBusinessSettings || !canUseFyllPrint) {
      setPendingPrintQueueCount(0);
      return () => {
        isCancelled = true;
      };
    }

    void getFyllPrintQueue(businessId)
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
  }, [businessId, canUseFyllPrint, isLoadingBusinessSettings]);

  useFocusEffect(refreshPrintQueueCount);

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
    queryKey: ['tasks', businessId],
    enabled: Boolean(businessId),
    queryFn: () => taskData.listTasks(businessId!),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const socialCheckoutDraftsQuery = useQuery({
    queryKey: getSocialCheckoutQueryKey(businessId),
    enabled: Boolean(businessId),
    queryFn: () => fetchSocialCheckoutDrafts(businessId!),
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

  const orderStatusColorMap = useMemo(
    () => createOrderStatusColorMap(orderStatuses),
    [orderStatuses]
  );

  const currentDashboardPeriodKey = getDashboardPeriodKey(new Date(eventNowTick));
  const currentDashboardHourKey = Math.floor(eventNowTick / (60 * 60 * 1000));
  const liveDashboardSnapshot = useMemo(() => {
    if (!businessId) return null;
    return buildDashboardSnapshot({
      businessId,
      products,
      orders,
      customers,
      cases,
      partners,
      partnerJobs,
      expenseRequests,
      auditLogs,
      orderStatuses,
      asOf: new Date(Math.min(Date.now(), (currentDashboardHourKey + 1) * 60 * 60 * 1000 - 1)),
    });
  }, [auditLogs, businessId, cases, currentDashboardHourKey, customers, expenseRequests, orderStatuses, orders, partnerJobs, partners, products]);
  const cachedDashboardSnapshot = isCompleteDashboardSnapshot(dashboardSnapshot)
    && dashboardSnapshot.businessId === businessId
    && dashboardSnapshot.periodKey === currentDashboardPeriodKey
    ? dashboardSnapshot
    : null;
  const dashboardMetrics = hasVerifiedDashboardData ? liveDashboardSnapshot : cachedDashboardSnapshot;
  const recentOrdersWeb = dashboardMetrics?.recentOrders ?? [];
  const recentOrdersMobile = recentOrdersWeb.slice(0, 5);
  const recentPartnerJobs = dashboardMetrics?.recentPartnerJobs ?? [];
  const mostSoldProducts = dashboardMetrics?.mostSoldProducts ?? [];
  const revenueTrend7d = dashboardMetrics?.revenueTrend7d ?? {
    days: [],
    total: 0,
    ordersTotal: 0,
    change: null,
    ordersChange: null,
  };
  const platformData = dashboardMetrics?.platformBreakdown ?? [];
  const financeCardBadgeCount = userRole === 'admin'
    ? (dashboardMetrics?.submittedExpenseRequestCount ?? 0)
    : userRole === 'manager'
      ? (dashboardMetrics?.submittedExpenseRequestCountByUser[currentUserId] ?? 0)
      : 0;
  const showAuditBanner = new Date(eventNowTick).getDate() >= 25
    && dashboardMetrics !== null
    && !dashboardMetrics.hasAuditForPeriod;
  const unreadNotificationCount = useMemo(() => {
    const threadUnread = notifications.filter((notification) => !notification.is_read).length;
    const newOrdersCount = (dashboardMetrics?.newOrderCreatedAtLast24Hours ?? []).filter((createdAt) => {
      const createdAtMs = new Date(createdAt).getTime();
      return Number.isFinite(createdAtMs) && createdAtMs > orderNotificationsSeenAt;
    }).length;
    return threadUnread + newOrdersCount;
  }, [dashboardMetrics?.newOrderCreatedAtLast24Hours, notifications, orderNotificationsSeenAt]);
  const openCasesCount = dashboardMetrics?.openCasesCount ?? 0;
  const activePartnerJobsCount = dashboardMetrics?.activePartnerJobsCount ?? 0;
  const pendingPaymentCount = useMemo(
    () => (socialCheckoutDraftsQuery.data ?? []).filter((draft) => getSocialCheckoutEffectiveStatus(draft) === 'payment_submitted').length,
    [socialCheckoutDraftsQuery.data]
  );
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);
  const canSeePaymentNeeds = userRole !== 'staff' && canUseSocialCheckout;
  // Same query key as the Orders screen, so the two share one cached fetch.
  const homePaymentsQuery = useQuery({
    queryKey: ['orders-unlinked-verified-payments', businessId],
    enabled: Boolean(businessId) && !isOfflineMode && canSeePaymentNeeds,
    queryFn: async () => {
      const rows = await supabaseData.fetchCollection<HomePaymentRecord>('payments', businessId!);
      return rows.map((row) => row.data);
    },
    staleTime: 30_000,
  });
  const homeNeeds = useMemo(() => buildHomeNeeds({
    orders,
    products,
    partnerJobs,
    partners,
    orderStatuses,
    payments: canSeePaymentNeeds ? (homePaymentsQuery.data ?? null) : null,
    openCasesCount: canUseCases ? openCasesCount : 0,
    pendingVerificationCount: canSeePaymentNeeds ? pendingPaymentCount : 0,
    globalLowStock: { enabled: useGlobalLowStockThreshold, value: globalLowStockThreshold },
    now: new Date(eventNowTick),
  }), [canSeePaymentNeeds, canUseCases, eventNowTick, globalLowStockThreshold, homePaymentsQuery.data, openCasesCount, orderStatuses, orders, partnerJobs, partners, pendingPaymentCount, products, useGlobalLowStockThreshold]);
  const { dismissed: dismissedNeeds, dismiss: dismissNeed, restore: restoreNeeds } = useDismissedNeeds(businessId);
  const visibleNeeds = useVisibleNeeds(homeNeeds, dismissedNeeds);
  const jumpToItems = buildJumpToItems({
    canUseCases,
    canUseSocialCheckout,
    canUseFinance,
    canUseInsights,
    isAdmin: userRole === 'admin',
    isManagerOrAdmin: userRole === 'admin' || userRole === 'manager',
    openCasesCount,
    pendingPaymentCount,
    financeBadgeCount: financeCardBadgeCount,
    activePartnerJobsCount,
  });
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
      complete: (dashboardMetrics?.productCount ?? 0) > 0,
      actionLabel: 'Add',
      route: '/new-product',
    },
    {
      id: 'first-order',
      title: 'Create first order',
      shortLabel: 'First order',
      description: 'Test your workflow with a real or sample order.',
      complete: (dashboardMetrics?.totalOrders ?? 0) > 0,
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
  ], [businessName, businessPhone, canUseStorefront, dashboardMetrics?.productCount, dashboardMetrics?.totalOrders, returnAddress, orderStatuses.length, paymentMethods.length, pendingInvites, storefrontEnabled, teamMembers.length]);
  const onboardingComplete = onboardingSteps.every((step) => step.complete);
  const onboardingReady = onboardingDismissedLoaded && !isLoadingBusinessSettings;
  const showOnboardingChecklist = onboardingReady && (userRole === 'admin' || userRole === 'manager') && !onboardingDismissed && !onboardingComplete;
  // Render only a complete, business-scoped snapshot. Partial persisted arrays must never
  // masquerade as dashboard data while the complete background sync is still running.
  const shouldShowDashboardSkeleton = !dashboardMetrics;
  const shouldShowDashboardMetricsSkeleton = !dashboardMetrics;

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

  const stats = dashboardMetrics ?? {
    productSales: 0,
    deliveryFees: 0,
    servicesRevenue: 0,
    totalRevenue: 0,
    revenueChange: 0,
    pendingOrders: 0,
    totalOrders: 0,
  };

  const fulfillment: Record<FulfillmentStageKey, number> = dashboardMetrics?.fulfillment ?? {
    processing: 0,
    dispatch: 0,
    delivered: 0,
  };

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

  const [selectedRevenueTrendIndex, setSelectedRevenueTrendIndex] = useState<number | null>(null);
  const [selectedOrderVolumeIndex, setSelectedOrderVolumeIndex] = useState<number | null>(null);

  const selectedRevenueTrendDay =
    typeof selectedRevenueTrendIndex === 'number' ? revenueTrend7d.days[selectedRevenueTrendIndex] : null;
  const selectedOrderVolumeDay =
    typeof selectedOrderVolumeIndex === 'number' ? revenueTrend7d.days[selectedOrderVolumeIndex] : null;

  const revenueLineData = useMemo(
    () => revenueTrend7d.days.map((day) => ({ key: day.key, label: day.label, value: day.value })),
    [revenueTrend7d.days]
  );

  const orderVolumeData = useMemo(
    () => revenueTrend7d.days.map((day) => ({ key: day.key, label: day.label, value: day.orders })),
    [revenueTrend7d.days]
  );

  const formatCompactCurrencyTick = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `₦${Math.round(value / 1_000_000)}m`;
    if (abs >= 1_000) return `₦${Math.round(value / 1_000)}k`;
    return `₦${Math.round(value)}`;
  };

  const trendBadge = (change: number | null) => {
    if (change === null) return null;
    return (
      <Text style={{ color: change >= 0 ? palette.limeOnSurface : palette.danger, fontSize: 12, fontWeight: '600' }}>
        {change >= 0 ? '+' : '-'}{Math.abs(change)}%
      </Text>
    );
  };

  const renderRecentOrders = (limit: number, routeFor: (id: string) => string, wide = false) => (
    <HomeCard>
      <HomeCardHeader
        title="Recent orders"
        subtitle={shouldShowDashboardSkeleton ? undefined : `Last ${Math.min(limit, recentOrdersWeb.length)} orders`}
        loading={shouldShowDashboardSkeleton}
        right={<HomeLink onPress={() => router.push(isWebDesktop ? '/orders' : '/(tabs)/orders')} />}
      />
      {shouldShowDashboardSkeleton ? (
        [0, 1, 2].map((index) => (
          <HomeRow key={`order-skeleton-${index}`} first={index === 0}>
            <View style={{ flex: 1 }}>
              <SkeletonBox width="55%" height={13} rounded="md" />
              <View style={{ height: 7 }} />
              <SkeletonBox width="38%" height={11} rounded="md" />
            </View>
            <SkeletonBox width={70} height={22} rounded="full" />
          </HomeRow>
        ))
      ) : recentOrdersWeb.length === 0 ? (
        <EmptyLine text="No orders yet." />
      ) : (
        <>
          {wide ? (
            <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 8 }}>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1.5 }}>Customer</Text>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 }}>Order</Text>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', width: 90 }}>Date</Text>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', width: 110, textAlign: 'right' }}>Total</Text>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', width: 150, textAlign: 'right' }}>Status</Text>
            </View>
          ) : null}
        {recentOrdersWeb.slice(0, limit).map((order, index) => (
          <RecentOrderItem
            key={order.id}
            order={order}
            statusColor={getOrderStatusColor(order.status, orderStatusColorMap, '#F59E0B')}
            dateLabel={formatShortDate(order.orderDate ?? order.createdAt)}
            onPress={() => router.push(routeFor(order.id) as any)}
            first={index === 0 && !wide}
            wide={wide}
          />
        ))}
        </>
      )}
    </HomeCard>
  );

  const renderPartnerJobs = (limit: number) => (
    <HomeCard>
      <HomeCardHeader
        title="Partner jobs"
        subtitle={shouldShowDashboardSkeleton ? undefined : `Last ${Math.min(limit, recentPartnerJobs.length)} jobs`}
        loading={shouldShowDashboardSkeleton}
        right={<HomeLink onPress={() => router.push('/partners?partnerSection=jobs' as any)} />}
      />
      {shouldShowDashboardSkeleton ? (
        [0, 1, 2].map((index) => (
          <HomeRow key={`job-skeleton-${index}`} first={index === 0}>
            <View style={{ flex: 1 }}>
              <SkeletonBox width="50%" height={13} rounded="md" />
              <View style={{ height: 7 }} />
              <SkeletonBox width="42%" height={11} rounded="md" />
            </View>
            <SkeletonBox width={90} height={22} rounded="full" />
          </HomeRow>
        ))
      ) : recentPartnerJobs.length === 0 ? (
        <EmptyLine text="No partner jobs yet." />
      ) : (
        recentPartnerJobs.slice(0, limit).map((job, index) => (
          <RecentPartnerJobItem
            key={job.id}
            job={job}
            onPress={() => router.push('/partners?partnerSection=jobs' as any)}
            first={index === 0}
          />
        ))
      )}
    </HomeCard>
  );

  const renderMostSold = (limit: number, routeFor: (id: string) => string) => {
    const top = mostSoldProducts.slice(0, limit);
    const maxQuantity = Math.max(1, ...top.map((row) => row.quantity));
    return (
      <HomeCard>
        <HomeCardHeader
          title="Most sold"
          subtitle={shouldShowDashboardSkeleton ? undefined : top.length === 0 ? 'No sales yet' : `Top ${top.length} products by quantity`}
          loading={shouldShowDashboardSkeleton}
          right={<HomeLink onPress={() => router.push('/insights/best-sellers' as any)} />}
        />
        {shouldShowDashboardSkeleton ? (
          [0, 1, 2].map((index) => (
            <HomeRow key={`sold-skeleton-${index}`} first={index === 0}>
              <View style={{ flex: 1 }}>
                <SkeletonBox width="52%" height={13} rounded="md" />
                <View style={{ height: 7 }} />
                <SkeletonBox width="30%" height={11} rounded="md" />
              </View>
              <SkeletonBox width={30} height={13} rounded="md" />
            </HomeRow>
          ))
        ) : top.length === 0 ? (
          <EmptyLine text="No sales yet." />
        ) : (
          top.map((row, index) => (
            <HomeRow key={row.productId} first={index === 0} onPress={() => router.push(routeFor(row.productId) as any)} style={{ alignItems: 'flex-start' }}>
              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', width: 16, paddingTop: 1 }}>{index + 1}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.name}</Text>
                    <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{row.sku}</Text>
                  </View>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{row.quantity} sold</Text>
                </View>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.softFill, overflow: 'hidden' }}>
                  <View style={{ height: 4, borderRadius: 2, width: `${Math.round((row.quantity / maxQuantity) * 100)}%`, backgroundColor: FYLL_LIME }} />
                </View>
              </View>
            </HomeRow>
          ))
        )}
      </HomeCard>
    );
  };

  const renderRevenueTrend = (chartHeight: number) => (
    <HomeCard>
      <HomeCardHeader
        title="Revenue trend"
        loading={shouldShowDashboardSkeleton}
        subtitle={selectedRevenueTrendDay
          ? `${formatShortDate(selectedRevenueTrendDay.key)} · ${formatCurrency(selectedRevenueTrendDay.value)}`
          : `Last 7 days · ${formatCurrency(revenueTrend7d.total)} · ${revenueTrend7d.ordersTotal} orders`}
        right={trendBadge(revenueTrend7d.change)}
      />
      {shouldShowDashboardSkeleton ? (
        <SkeletonBox width="100%" height={chartHeight} rounded="lg" />
      ) : (
        <InteractiveLineChart
          data={revenueLineData}
          height={chartHeight}
          lineColor={palette.limeOnSurface}
          gridColor={palette.hairline}
          textColor={palette.faint}
          selectedIndex={selectedRevenueTrendIndex}
          onSelectIndex={setSelectedRevenueTrendIndex}
          formatYLabel={formatCompactCurrencyTick}
          formatValueLabel={formatCurrency}
          tooltipBackgroundColor={palette.inverseBg}
          tooltipTextColor={palette.inverseText}
        />
      )}
      {!isWebDesktop && !shouldShowDashboardMetricsSkeleton ? (
        <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          {[
            ['Products', stats.productSales],
            ['Delivery', stats.deliveryFees],
            ['Services', stats.servicesRevenue],
          ].map(([label, amount], index) => (
            <View key={String(label)} style={{ flex: 1, gap: 2, alignItems: index === 0 ? 'flex-start' : index === 1 ? 'center' : 'flex-end' }}>
              <Text style={{ color: palette.faint, fontSize: 12, textAlign: index === 0 ? 'left' : index === 1 ? 'center' : 'right' }}>{label}</Text>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', textAlign: index === 0 ? 'left' : index === 1 ? 'center' : 'right' }}>{formatCurrency(Number(amount))}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </HomeCard>
  );

  const renderOrderVolume = (chartHeight: number) => (
    <HomeCard>
      <HomeCardHeader
        title="Order volume"
        loading={shouldShowDashboardSkeleton}
        subtitle={selectedOrderVolumeDay
          ? `${formatShortDate(selectedOrderVolumeDay.key)} · ${selectedOrderVolumeDay.orders} orders`
          : `Last 7 days · ${revenueTrend7d.ordersTotal} orders`}
        right={trendBadge(revenueTrend7d.ordersChange)}
      />
      {shouldShowDashboardSkeleton ? (
        <SkeletonBox width="100%" height={chartHeight} rounded="lg" />
      ) : (
        <InteractiveBarChart
          data={orderVolumeData}
          height={chartHeight}
          barColor={FYLL_LIME}
          gridColor={palette.hairline}
          textColor={palette.faint}
          selectedIndex={selectedOrderVolumeIndex}
          onSelectIndex={setSelectedOrderVolumeIndex}
          formatYLabel={(value) => String(Math.round(value))}
          formatValueLabel={(value) => `${Math.round(value)} ${Math.round(value) === 1 ? 'order' : 'orders'}`}
          tooltipBackgroundColor={palette.inverseBg}
          tooltipTextColor={palette.inverseText}
        />
      )}
    </HomeCard>
  );

  const renderTasks = () => (
    <HomeCard>
      <HomeCardHeader
        title={userRole === 'staff' ? 'Your tasks' : 'Tasks'}
        subtitle={userRole === 'staff' ? `${mobileHomeScopedTasks.length} added or assigned` : `${mobileHomeScopedTasks.length} active`}
        right={<HomeLink onPress={() => router.push('/(tabs)/tasks' as any)} />}
      />
      {mobileHomeTasksQuery.isPending || shouldShowDashboardSkeleton ? (
        [0, 1, 2].map((index) => (
          <HomeRow key={`task-skeleton-${index}`} first={index === 0}>
            <View style={{ flex: 1 }}>
              <SkeletonBox width="62%" height={13} rounded="md" />
              <View style={{ height: 7 }} />
              <SkeletonBox width="36%" height={11} rounded="md" />
            </View>
            <SkeletonBox width={64} height={22} rounded="full" />
          </HomeRow>
        ))
      ) : mobileHomeTaskRows.length === 0 ? (
        <EmptyLine text="No open tasks assigned or created by you." />
      ) : (
        mobileHomeTaskRows.map((task, index) => {
          const status = getTaskStatusMeta(task.status);
          return (
            <HomeRow key={task.id} first={index === 0} onPress={() => router.push(`/(tabs)/task/${task.id}` as any)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{toSentenceCase(task.title)}</Text>
                <Text style={{ color: palette.faint, fontSize: 12 }}>{formatTaskDueDate(task.due_date)}</Text>
              </View>
              <StatusText label={status.label} color={status.color} />
            </HomeRow>
          );
        })
      )}
    </HomeCard>
  );

  const renderSalesBySource = () => (
    <HomeCard>
      <HomeCardHeader
        title="Sales by source"
        right={<HomeLink onPress={() => router.push('/insights/platforms' as any)} />}
      />
      {shouldShowDashboardSkeleton ? (
        [0, 1, 2, 3].map((index) => (
          <View key={`source-skeleton-${index}`} style={{ marginBottom: 12 }}>
            <SkeletonBox width="38%" height={13} rounded="md" />
            <View style={{ height: 8 }} />
            <SkeletonBox width="100%" height={6} rounded="full" />
          </View>
        ))
      ) : platformData.length === 0 ? (
        <EmptyLine text="No orders yet." />
      ) : (
        platformData.slice(0, 4).map((item, index) => (
          <View key={item.label} style={{ gap: 6, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{item.label}</Text>
              <Text style={{ color: palette.faint, fontSize: 12 }}>
                <Text style={{ color: palette.text, fontWeight: '600' }}>{item.value}</Text> {'·'} {item.percentage}%
              </Text>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.softFill, overflow: 'hidden' }}>
              <View style={{ height: 4, borderRadius: 2, width: `${Math.min(item.percentage, 100)}%`, backgroundColor: FYLL_LIME }} />
            </View>
          </View>
        ))
      )}
    </HomeCard>
  );

  const kpiItems: KpiItem[] = [
    ...((userRole === 'admin' || userRole === 'manager') ? [{
      key: 'revenue',
      label: 'Total revenue',
      value: formatCurrency(stats.totalRevenue),
      sub: 'this month',
      trend: stats.revenueChange !== 0 ? stats.revenueChange : null,
      onPress: () => handleCardPress(isWebDesktop ? '/insights' : '/(tabs)/insights'),
    }] : []),
    {
      key: 'delivery',
      label: 'Out for delivery',
      value: String(fulfillment.dispatch),
      sub: `${stats.pendingOrders} open orders`,
      onPress: () => goToFulfillment('dispatch'),
    },
    {
      key: 'inventory',
      label: 'Inventory items',
      value: String(dashboardMetrics?.inventoryVariantCount ?? 0),
      sub: `${dashboardMetrics?.productCount ?? 0} products`,
      onPress: () => handleCardPress(isWebDesktop ? '/inventory' : '/(tabs)/inventory'),
    },
    {
      key: 'customers',
      label: 'Customers',
      value: String(dashboardMetrics?.customerCount ?? 0),
      sub: 'total customers',
      onPress: () => handleCardPress('/customers'),
    },
  ];

  const greetingHour = new Date(eventNowTick).getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date(eventNowTick).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const needsSummary = visibleNeeds.length === 0
    ? 'Nothing needs you right now'
    : `${visibleNeeds.length} ${visibleNeeds.length === 1 ? 'thing needs' : 'things need'} you today`;

  const firstName = userName.trim().split(/\s+/)[0] ?? '';

  if (isWebDesktop) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <NotificationPanel
          visible={showNotifications}
          onClose={() => setShowNotifications(false)}
          notifications={notifications}
          onNotificationPress={handleNotificationPress}
          onMarkAllRead={handleMarkAllRead}
          orders={recentOrdersWeb}
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
                title={firstName ? `${greeting}, ${firstName}` : greeting}
                titleTextStyle={bricolageLoaded ? { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' } : undefined}
                subtitle={`${todayLabel} · ${needsSummary}`}
                actions={
                  <>
                    <Pressable
                      onPress={() => router.push('/new-order')}
                      className="rounded-full px-4 flex-row items-center active:opacity-80"
                      style={{ backgroundColor: FYLL_LIME, height: 40 }}
                    >
                      <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.6} />
                      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>New order</Text>
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

              <View style={{ marginTop: HOME_GAP, gap: HOME_GAP }}>
                {showAuditBanner ? (
                  <AuditBanner onPress={() => handleQuickAction('/inventory-audit')} inset={false} />
                ) : null}

                {upcomingHomeEvent && upcomingHomeEventMeta ? (
                  <EventBanner
                    title={upcomingHomeEventMeta.title}
                    subtitle={upcomingHomeEventMeta.subtitle}
                    onPress={() => router.push(`/(tabs)/task/${upcomingHomeEvent.id}` as any)}
                    inset={false}
                  />
                ) : null}

                {showOnboardingChecklist ? (
                  <OnboardingChecklistCard
                    steps={onboardingSteps}
                    onDismiss={handleDismissOnboarding}
                    onStepPress={handleOnboardingStepPress}
                    inset={false}
                  />
                ) : null}

                <JumpToRow items={jumpToItems} onPress={handleCardPress} />

                <KpiStrip items={kpiItems} loading={shouldShowDashboardMetricsSkeleton} />

                <NeedsYouCard
                  needs={visibleNeeds}
                  onAction={handleCardPress}
                  onDismiss={dismissNeed}
                  onRestore={restoreNeeds}
                />

                <FulfillmentPipelineCard
                  counts={fulfillment}
                  onPress={() => goToFulfillment()}
                  onStagePress={(stage) => goToFulfillment(stage)}
                />

                <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: HOME_GAP }}>
                  {(userRole === 'admin' || userRole === 'manager') && (
                    <View style={{ flex: 1.4, minWidth: 0 }}>{renderRevenueTrend(200)}</View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>{renderOrderVolume(200)}</View>
                </View>

                {userRole === 'staff' ? renderTasks() : null}

                {renderRecentOrders(8, (id) => `/orders/${id}`, true)}

                <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: HOME_GAP }}>
                  <View style={{ flex: 1, minWidth: 0 }}>{renderPartnerJobs(4)}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>{renderMostSold(4, (id) => `/inventory/${id}`)}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>{renderSalesBySource()}</View>
                </View>
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
          contentContainerStyle={{ paddingBottom: tabBarHeight + 72 }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: palette.faint, fontSize: 12 }}>{todayLabel}</Text>
                <Text style={{ color: palette.text, fontSize: 22, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -0.4 }} numberOfLines={1}>
                  {firstName ? `${greeting}, ${firstName}` : greeting}
                </Text>
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
            orders={recentOrdersWeb}
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

          {!isLoadingBusinessSettings && canUseFyllPrint && pendingPrintQueueCount > 0 ? (
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

          {!shouldShowDashboardSkeleton ? (
            <View className="pt-4">
              <NeedsYouCarousel
                needs={visibleNeeds}
                onAction={handleCardPress}
                onDismiss={dismissNeed}
                onRestore={restoreNeeds}
              />
            </View>
          ) : null}

          <View style={{ gap: HOME_GAP, paddingTop: HOME_GAP }}>
            <View style={{ paddingHorizontal: 20, gap: HOME_GAP }}>
              <KpiStrip items={kpiItems} loading={shouldShowDashboardMetricsSkeleton} />

              {(userRole === 'admin' || userRole === 'manager') ? renderRevenueTrend(170) : null}

              <JumpToGrid items={jumpToItems} onPress={handleCardPress} />

              <FulfillmentPipelineCard
                counts={fulfillment}
                onPress={() => goToFulfillment()}
                onStagePress={(stage) => goToFulfillment(stage)}
              />

              {renderRecentOrders(5, (id) => `/order/${id}`)}

              {renderPartnerJobs(5)}

              {shouldShowHomeTaskCard ? renderTasks() : null}

              {renderMostSold(5, (id) => `/product/${id}`)}

              {renderSalesBySource()}

              <View style={{ flexDirection: 'row', gap: HOME_GAP, paddingBottom: 8 }}>
                <Pressable
                  onPress={() => handleQuickAction('/new-order')}
                  className="active:opacity-80"
                  style={{ flex: 1, height: 48, borderRadius: 999, backgroundColor: FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Plus size={18} color={FYLL_LIME_INK} strokeWidth={2.4} />
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>New order</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickAction('/scan')}
                  className="active:opacity-80"
                  style={{ flex: 1, height: 48, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Scan size={18} color={palette.text} strokeWidth={2.2} />
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Scan item</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>

        {isMobile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new order"
            onPress={() => handleQuickAction('/new-order')}
            style={(state) => [
              {
                position: 'absolute',
                right: 20,
                bottom: Math.max(96, tabBarHeight - 48),
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                transform: [{ scale: state.pressed ? 0.94 : 1 }],
                zIndex: 40,
              },
              Platform.OS === 'web'
                ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
                : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
            ]}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
