import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { View, Platform } from 'react-native';
import { PlatformPressable } from '@react-navigation/elements';
import { BlurView } from 'expo-blur';
import { LayoutDashboard, Package, ShoppingCart, MoreHorizontal, BarChart3, Users, Briefcase, MessageSquare, TrendingUp, ListTodo, Wallet } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import useAuthStore, { ROLE_PERMISSIONS } from '@/lib/state/auth-store';
import { useQuery } from '@tanstack/react-query';
import { collaborationData } from '@/lib/supabase/collaboration';
import { isTeamThreadEntityId } from '@/lib/team-threads';
import useFyllStore from '@/lib/state/fyll-store';
import { storage } from '@/lib/storage';
import { canShowFinanceNavigation } from '@/lib/finance-access';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getTabBarStyle } from '@/lib/tab-bar-style';

const ORDERS_TAB_BADGE_SEEN_KEY_PREFIX = 'orders-tab-badge-seen';
const getOrdersTabBadgeSeenKey = (businessId: string) =>
  `${ORDERS_TAB_BADGE_SEEN_KEY_PREFIX}:${businessId}`;

function TabBarIcon({
  Icon,
  color,
  focused,
  offsetY = 0,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  color: string;
  focused: boolean;
  offsetY?: number;
}) {
  const colors = useThemeColors();
  return (
    <View
      className="items-center justify-center"
      style={{
        width: 54,
        height: 40,
        marginTop: 2,
        borderRadius: 999,
        backgroundColor: focused ? (colors.bg.primary === '#FFFFFF' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)') : 'transparent',
      }}
    >
      <View style={{ transform: [{ translateY: offsetY }] }}>
        <Icon size={23} color={color} strokeWidth={focused ? 2.5 : 2} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemeColors();
  const pathname = usePathname();
  const { isDesktop, isMobile, isTablet } = useBreakpoint();
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const [ordersTabSeenAt, setOrdersTabSeenAt] = useState(0);
  const userRole = currentUser?.role ?? 'staff';
  const { featureAccess } = useBusinessSettings();
  const canViewInsights = (ROLE_PERMISSIONS[userRole]?.canViewInsights ?? false) && isBusinessFeatureEnabled(featureAccess, 'insights');
  const canViewFinance = canShowFinanceNavigation(userRole) && isBusinessFeatureEnabled(featureAccess, 'finance');
  const canViewPayments = isBusinessFeatureEnabled(featureAccess, 'socialCheckout');
  const canViewThreads = isBusinessFeatureEnabled(featureAccess, 'threads');
  const canViewTasks = isBusinessFeatureEnabled(featureAccess, 'tasks');
  const threadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'order'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'order'),
    refetchInterval: 15000,
  });
  const teamThreadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'case'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'case'),
    refetchInterval: 15000,
  });
  const taskThreadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'task'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'task'),
    refetchInterval: 15000,
  });
  const totalUnreadThreads = useMemo(() => {
    const orderCounts = threadCountsQuery.data ?? {};
    const teamCaseCounts = teamThreadCountsQuery.data ?? {};
    const orderTotal = Object.values(orderCounts).reduce((sum, count) => sum + count, 0);
    const teamTotal = Object.entries(teamCaseCounts).reduce((sum, [entityId, count]) => {
      return isTeamThreadEntityId(entityId) ? sum + count : sum;
    }, 0);
    return orderTotal + teamTotal;
  }, [teamThreadCountsQuery.data, threadCountsQuery.data]);
  const totalUnreadTaskThreads = useMemo(() => {
    const taskCounts = taskThreadCountsQuery.data ?? {};
    return Object.values(taskCounts).reduce((sum, count) => sum + count, 0);
  }, [taskThreadCountsQuery.data]);

  const orders = useFyllStore((s) => s.orders);

  useEffect(() => {
    let isCancelled = false;

    if (!businessId) {
      setOrdersTabSeenAt(0);
      return;
    }

    void storage.getItem(getOrdersTabBadgeSeenKey(businessId)).then((value) => {
      if (isCancelled) return;
      const parsed = Number(value ?? '0');
      setOrdersTabSeenAt(Number.isFinite(parsed) ? parsed : 0);
    }).catch(() => {
      if (isCancelled) return;
      setOrdersTabSeenAt(0);
    });

    return () => {
      isCancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    if (!/^\/orders(?:\/|$)/.test(pathname)) return;

    const seenAt = Date.now();
    setOrdersTabSeenAt((previous) => Math.max(previous, seenAt));
    void storage.setItem(getOrdersTabBadgeSeenKey(businessId), String(seenAt));
  }, [businessId, pathname]);

  const newOrdersCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return orders.filter((o) => {
      const createdAtMs = new Date(o.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      return createdAtMs > cutoff && createdAtMs > ordersTabSeenAt;
    }).length;
  }, [orders, ordersTabSeenAt]);

  const isWeb = Platform.OS === 'web';
  const noWebFocusStyle = isWeb ? ({ outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' } as any) : null;
  const tabBarHeight = isMobile ? (Platform.OS === 'ios' ? 82 : 76) : isWeb ? 80 : (Platform.OS === 'ios' ? 88 : 70);

  // On desktop, show sidebar instead of bottom tabs
  const tabBarStyle = getTabBarStyle(colors, isDesktop, isMobile);

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Desktop Sidebar */}
      {isDesktop && <DesktopSidebar />}

      {/* Main Content with Tabs */}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            sceneStyle: { backgroundColor: colors.bg.primary },
            tabBarActiveTintColor: colors.tabBar.active,
            tabBarInactiveTintColor: colors.tabBar.inactive,
            tabBarStyle,
            tabBarBackground: () => (
              isMobile ? (
                <BlurView
                  intensity={Platform.OS === 'ios' ? 38 : 26}
                  tint={colors.bg.primary === '#FFFFFF' ? 'light' : 'dark'}
                  style={{ flex: 1, borderRadius: 999, overflow: 'hidden' }}
                />
              ) : null
            ),
            tabBarLabelStyle: {
              fontSize: isMobile ? 10 : isWeb ? 10 : 11,
              fontWeight: '600',
              marginTop: isMobile ? 0 : isWeb ? 2 : 2,
              lineHeight: isMobile ? 12 : isWeb ? 12 : 13,
              paddingBottom: isWeb ? 0 : 0,
              height: isMobile ? 12 : isWeb ? 12 : undefined,
            },
            tabBarItemStyle: {
              paddingVertical: isWeb ? 0 : 0,
              paddingTop: isWeb ? 0 : 0,
              paddingBottom: isWeb ? 0 : 0,
              height: isMobile ? 62 : isWeb ? 55 : undefined,
              maxHeight: isMobile ? 62 : isWeb ? 55 : undefined,
              justifyContent: 'center',
              alignItems: 'center',
              ...(noWebFocusStyle ?? {}),
            },
            // Must be PlatformPressable (not a plain Pressable) — on web these
            // buttons render as real <a href> tags, and PlatformPressable is
            // what calls e.preventDefault() on click so React Navigation's
            // client-side routing handles it instead of the browser doing a
            // full page navigation/reload to that href.
            tabBarButton: (props: any) => (
              <PlatformPressable
                {...props}
                style={[props.style, noWebFocusStyle]}
              />
            ),
            tabBarIconStyle: {
              marginTop: 0,
              marginBottom: 0,
              height: isMobile ? 40 : isWeb ? 32 : undefined,
            },
            headerStyle: {
              backgroundColor: colors.bg.primary,
            },
            headerTitleStyle: {
              color: colors.text.primary,
              fontSize: 18,
              fontWeight: '700',
            },
            headerShadowVisible: false,
          }}
        >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={LayoutDashboard} color={color} focused={focused} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={Package} color={color} focused={focused} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={Briefcase} color={color} focused={focused} />,
          headerShown: false,
          // Keep Services out of bottom nav on phone + tablet; desktop uses sidebar.
          href: isMobile || isTablet ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={ShoppingCart} color={color} focused={focused} />,
          tabBarBadge: newOrdersCount > 0 ? (newOrdersCount > 99 ? '99+' : newOrdersCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#3B82F6',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '700',
          },
          headerShown: false,
          href: canViewThreads ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={Wallet} color={color} focused={focused} />,
          headerShown: false,
          href: canViewPayments && !isMobile && !isTablet ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'Delivery',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Announcements',
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="threads"
        options={{
          title: 'Threads',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={MessageSquare} color={color} focused={focused} />,
          tabBarBadge: totalUnreadThreads > 0 ? (totalUnreadThreads > 99 ? '99+' : totalUnreadThreads) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '700',
          },
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={Users} color={color} focused={focused} />,
          headerShown: false,
          href: isMobile ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={BarChart3} color={color} focused={focused} />,
          headerShown: false,
          // Show on iPad/tablet and desktop, hide on phones.
          href: (isTablet || isDesktop) && canViewInsights ? '/insights' : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={MoreHorizontal} color={color} focused={focused} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="inventory-audit"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={ListTodo} color={color} focused={focused} />,
          tabBarBadge: totalUnreadTaskThreads > 0 ? (totalUnreadTaskThreads > 99 ? '99+' : totalUnreadTaskThreads) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '700',
          },
          headerShown: false,
          href: canViewTasks && !isMobile ? '/tasks' : null,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color, focused }) => <TabBarIcon Icon={TrendingUp} color={color} focused={focused} />,
          headerShown: false,
          href: canViewFinance && !isMobile && !isTablet ? '/finance' : null,
        }}
      />
      <Tabs.Screen
        name="task"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="fulfillment"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          headerShown: false,
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings-panel"
        options={{
          headerShown: false,
          href: null,
        }}
      />
        </Tabs>
      </View>
    </View>
  );
}
