import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { LayoutDashboard, Package, ShoppingCart, MoreHorizontal, BarChart3, Users, LogOut, Database, FileText, Briefcase, MessageSquare, ChevronsLeft, ChevronsRight, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Receipt, Truck, Calculator, Settings, ListTodo, User, Banknote, Boxes, Megaphone, Printer, RotateCcw, Wallet, Link2, ClipboardCheck, Building2, AlertTriangle } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuthStore, { ROLE_PERMISSIONS } from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import * as Haptics from 'expo-haptics';
import { SvgXml } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { collaborationData } from '@/lib/supabase/collaboration';
import { isTeamThreadEntityId } from '@/lib/team-threads';
import {
  canShowFinanceNavigation,
  getAllowedFinanceSections,
  getDefaultFinanceSectionForRole,
  type FinanceSection,
} from '@/lib/finance-access';
import { isBusinessFeatureEnabled, type BusinessFeatureKey } from '@/lib/feature-access';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

type PermissionKey = keyof typeof ROLE_PERMISSIONS['admin'];

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  requiresPermission?: PermissionKey;
}

type FinanceSubKey = FinanceSection | 'calculator' | 'procurement-orders' | 'procurement-receive-goods' | 'procurement-cost-breakdown' | 'procurement-margin-tracker';

type FinanceSubItem = {
  key: FinanceSubKey;
  label: string;
  icon: typeof LayoutDashboard;
  enabled: boolean;
};

type InventorySubItem = {
  key: 'inventory-home' | 'warehouse' | 'linking' | 'audit';
  label: string;
  href: '/inventory' | '/inventory/warehouse' | '/inventory/linking' | '/inventory-audit';
  icon: typeof LayoutDashboard;
  requiresWooCommerce?: boolean;
};

type AnnouncementSubItem = {
  key: 'compose' | 'setup';
  label: string;
  href: '/announcements' | '/announcements/setup';
  icon: typeof LayoutDashboard;
};

type PartnerSubItem = {
  key: 'jobs' | 'all' | 'bills' | 'issues';
  label: string;
  href: '/partners' | '/partners/all' | '/partners/bills' | '/partners/issues';
  icon: typeof LayoutDashboard;
};

const NAV_FEATURES: Partial<Record<string, BusinessFeatureKey>> = {
  '/payments': 'socialCheckout',
  '/deliveries': 'delivery',
  '/fyll-print': 'fyllPrint',
  '/returns': 'returns',
  '/announcements': 'announcements',
  '/threads': 'threads',
  '/tasks': 'tasks',
  '/cases': 'cases',
  '/insights': 'insights',
  '/finance': 'finance',
};

const navItems: NavItem[] = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Services', href: '/services', icon: Briefcase },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Payments', href: '/payments', icon: Wallet },
  { name: 'Partners', href: '/partners', icon: Building2 },
  { name: 'Delivery', href: '/deliveries', icon: Truck },
  { name: 'Fyll Print', href: '/fyll-print', icon: Printer },
  { name: 'Returns', href: '/returns', icon: RotateCcw },
  { name: 'Announcements', href: '/announcements', icon: Megaphone },
  { name: 'Threads', href: '/threads', icon: MessageSquare },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  { name: 'Cases', href: '/cases', icon: FileText },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Insights', href: '/insights', icon: BarChart3, requiresPermission: 'canViewInsights' },
  { name: 'Finance', href: '/finance', icon: TrendingUp, requiresPermission: 'canViewRevenue' },
  { name: 'More', href: '/settings', icon: MoreHorizontal },
];

const financeSubItems: FinanceSubItem[] = [
  { key: 'overview', label: 'Overview', icon: TrendingUp, enabled: true },
  { key: 'revenue', label: 'Revenue', icon: Banknote, enabled: true },
  { key: 'other-income', label: 'Other Income', icon: Banknote, enabled: true },
  { key: 'expenses', label: 'Expenses', icon: Receipt, enabled: true },
  { key: 'refunds', label: 'Refunds', icon: TrendingDown, enabled: true },
  { key: 'procurement', label: 'Procurement', icon: Truck, enabled: true },
  { key: 'procurement-orders', label: 'Orders', icon: ShoppingCart, enabled: true },
  { key: 'procurement-receive-goods', label: 'Goods Received', icon: Boxes, enabled: true },
  { key: 'procurement-cost-breakdown', label: 'Cost Breakdown', icon: BarChart3, enabled: true },
  { key: 'procurement-margin-tracker', label: 'Margin Tracker', icon: TrendingUp, enabled: true },
  { key: 'salary', label: 'Salary', icon: User, enabled: true },
  { key: 'calculator', label: 'Calculator', icon: Calculator, enabled: true },
  { key: 'settings', label: 'Settings', icon: Settings, enabled: true },
];

const inventorySubItems: InventorySubItem[] = [
  { key: 'inventory-home', label: 'Products', href: '/inventory', icon: Package },
  { key: 'linking', label: 'Linking', href: '/inventory/linking', icon: Link2, requiresWooCommerce: true },
  { key: 'warehouse', label: 'Warehouse', href: '/inventory/warehouse', icon: Boxes },
  { key: 'audit', label: 'Audit', href: '/inventory-audit', icon: ClipboardCheck },
];

const announcementSubItems: AnnouncementSubItem[] = [
  { key: 'compose', label: 'Compose', href: '/announcements', icon: Megaphone },
  { key: 'setup', label: 'Setup', href: '/announcements/setup', icon: Settings },
];

const partnerSubItems: PartnerSubItem[] = [
  { key: 'jobs', label: 'Jobs', href: '/partners', icon: FileText },
  { key: 'bills', label: 'Bills', href: '/partners/bills', icon: Banknote },
  { key: 'issues', label: 'Issues', href: '/partners/issues', icon: AlertTriangle },
  { key: 'all', label: 'All partners', href: '/partners/all', icon: Users },
];

export function DesktopSidebar() {
  const colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const { section, procurementPage, announcementSection, partnerSection } = useGlobalSearchParams<{
    section?: string | string[];
    procurementPage?: string | string[];
    announcementSection?: string | string[];
    partnerSection?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const isDark = colors.bg.primary === '#111111';

  const currentUser = useAuthStore((s) => s.currentUser);
  const { businessName, featureAccess, hasWooCommerceConnection } = useBusinessSettings();
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const partnerJobIssues = useFyllStore((s) => s.partnerJobIssues);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFinanceMenuOpen, setIsFinanceMenuOpen] = useState(false);
  const [isInventoryMenuOpen, setIsInventoryMenuOpen] = useState(false);
  const [isAnnouncementMenuOpen, setIsAnnouncementMenuOpen] = useState(false);
  const [isPartnerMenuOpen, setIsPartnerMenuOpen] = useState(false);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const logout = useAuthStore((s) => s.logout);
  const userRole = currentUser?.role ?? 'staff';
  const canAccessFinanceNav = canShowFinanceNavigation(userRole) && isBusinessFeatureEnabled(featureAccess, 'finance');
  const allowedFinanceSections = useMemo(
    () => new Set(getAllowedFinanceSections(userRole)),
    [userRole]
  );
  const visibleFinanceSubItems = useMemo(() => {
    return financeSubItems.filter((item) => {
      if (item.key === 'calculator') return canAccessFinanceNav;
      if (item.key === 'procurement') return userRole === 'admin' && allowedFinanceSections.has('procurement');
      if (item.key === 'procurement-receive-goods') return allowedFinanceSections.has('procurement');
      if (item.key === 'procurement-orders' || item.key === 'procurement-cost-breakdown' || item.key === 'procurement-margin-tracker') return userRole === 'admin' && allowedFinanceSections.has('procurement');
      return allowedFinanceSections.has(item.key);
    });
  }, [allowedFinanceSections, canAccessFinanceNav, userRole]);
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
  const totalUnreadTasks = useMemo(() => {
    const taskCounts = taskThreadCountsQuery.data ?? {};
    return Object.values(taskCounts).reduce((sum, count) => sum + count, 0);
  }, [taskThreadCountsQuery.data]);
  const pendingExpenseRequestCount = useMemo(() => {
    if (userRole !== 'admin') return 0;
    return expenseRequests.filter((request) => request.status === 'submitted').length;
  }, [expenseRequests, userRole]);
  const openPartnerIssueCount = useMemo(() => {
    return partnerJobIssues.filter((issue) => issue.status === 'open').length;
  }, [partnerJobIssues]);

  useEffect(() => {
    if (pathname.includes('finance')) {
      setIsFinanceMenuOpen(true);
    }
    if (pathname.includes('inventory')) {
      setIsInventoryMenuOpen(true);
    }
    if (pathname.includes('announcements')) {
      setIsAnnouncementMenuOpen(true);
    }
    if (pathname.includes('partners') || pathname.includes('partner-bills')) {
      setIsPartnerMenuOpen(true);
    }
  }, [pathname]);

  const activeFinanceSection: FinanceSection = (() => {
    const currentSection = Array.isArray(section) ? section[0] : section;
    if (currentSection === 'revenue') return 'revenue';
    if (currentSection === 'other-income') return 'other-income';
    if (currentSection === 'expenses') return 'expenses';
    if (currentSection === 'refunds') return 'refunds';
    if (currentSection === 'procurement') return 'procurement';
    if (currentSection === 'costing') return 'costing';
    if (currentSection === 'salary') return 'salary';
    if (currentSection === 'settings') return 'settings';
    if (currentSection === 'overview') return 'overview';
    return getDefaultFinanceSectionForRole(userRole);
  })();
  const activeProcurementPage = Array.isArray(procurementPage) ? procurementPage[0] : procurementPage;

  const triggerTapHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const navigateToFinanceSection = (targetSection: FinanceSection) => {
    triggerTapHaptic();
    router.push(`/(tabs)/finance?section=${targetSection}` as any);
  };

  const navigateToFinanceSubItem = (targetItem: FinanceSubKey) => {
    if (targetItem === 'calculator') {
      triggerTapHaptic();
      router.push('/calculator' as any);
      return;
    }
    if (targetItem === 'procurement' && userRole !== 'admin') {
      triggerTapHaptic();
      router.push('/(tabs)/finance?section=procurement&procurementPage=receive-goods' as any);
      return;
    }
    if (targetItem === 'procurement-orders') {
      triggerTapHaptic();
      router.push('/(tabs)/finance?section=procurement&procurementPage=orders' as any);
      return;
    }
    if (targetItem === 'procurement-receive-goods') {
      triggerTapHaptic();
      router.push('/(tabs)/finance?section=procurement&procurementPage=receive-goods' as any);
      return;
    }
    if (targetItem === 'procurement-cost-breakdown') {
      triggerTapHaptic();
      router.push('/(tabs)/finance?section=procurement&procurementPage=cost-breakdown' as any);
      return;
    }
    if (targetItem === 'procurement-margin-tracker') {
      triggerTapHaptic();
      router.push('/(tabs)/finance?section=procurement&procurementPage=margin-tracker' as any);
      return;
    }
    navigateToFinanceSection(targetItem);
  };

  const inventoryPathname = pathname.replace('/(tabs)', '');
  const activeInventorySubKey: InventorySubItem['key'] = inventoryPathname.includes('/inventory-audit')
    ? 'audit'
    : inventoryPathname.includes('/inventory/warehouse')
    ? 'warehouse'
    : inventoryPathname.includes('/inventory/linking')
      ? 'linking'
    : 'inventory-home';
  const rawAnnouncementSection = Array.isArray(announcementSection) ? announcementSection[0] : announcementSection;
  const activeAnnouncementSubKey: AnnouncementSubItem['key'] = rawAnnouncementSection === 'setup' ? 'setup' : 'compose';
  const rawPartnerSection = Array.isArray(partnerSection) ? partnerSection[0] : partnerSection;
  const isPartnerRoute = pathname.includes('partners') || pathname.includes('partner-bills');
  const activePartnerSubKey: PartnerSubItem['key'] = pathname.includes('partner-bills')
    ? 'bills'
    : rawPartnerSection === 'all'
      ? 'all'
      : rawPartnerSection === 'bills'
        ? 'bills'
        : rawPartnerSection === 'issues'
          ? 'issues'
          : 'jobs';

  const handleNavigation = (href: string) => {
    triggerTapHaptic();
    const defaultFinanceSection = getDefaultFinanceSectionForRole(userRole);

    // Map routes to tab routes
    const routeMap: Record<string, string> = {
      '/': '/(tabs)',
      '/inventory': '/(tabs)/inventory',
      '/inventory/warehouse': '/(tabs)/inventory/warehouse',
      '/inventory/linking': '/(tabs)/inventory/linking',
      '/inventory-audit': '/inventory-audit',
      '/services': '/(tabs)/services',
      '/orders': '/(tabs)/orders',
      '/payments': '/(tabs)/payments',
      '/fyll-print': '/fyll-print',
      '/partners': '/partners?partnerSection=jobs',
      '/partners/all': '/partners?partnerSection=all',
      '/partners/bills': '/partners?partnerSection=bills',
      '/partners/issues': '/partners?partnerSection=issues',
      '/announcements': '/(tabs)/announcements',
      '/announcements/setup': '/(tabs)/announcements?announcementSection=setup',
      '/threads': '/(tabs)/threads',
      '/tasks': '/(tabs)/tasks',
      '/customers': '/(tabs)/customers',
      '/insights': '/(tabs)/insights',
      '/finance': `/(tabs)/finance?section=${defaultFinanceSection}`,
      '/settings': '/(tabs)/settings',
      '/cases': '/(tabs)/cases',
      '/(tabs)/cases': '/(tabs)/cases',
    };

    const targetRoute = routeMap[href] || href;
    router.push(targetRoute as any);
  };

  const handleLogout = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await logout();
    router.replace('/login');
  };

  const sidebarWidth = isCollapsed ? 88 : 260;

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
    }
    // Check if current path starts with the nav item href
    return pathname.includes(href.replace('/', ''));
  };

  return (
    <View
      style={{
        width: sidebarWidth,
        backgroundColor: colors.bg.primary,
        borderRightWidth: 1,
        borderRightColor: colors.border.light,
        paddingTop: insets.top || 20,
        paddingBottom: insets.bottom || 20,
      }}
    >
      {/* Logo/Brand */}
      <View
        style={{
          paddingHorizontal: isCollapsed ? 12 : 18,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
        }}
      >
        {!isCollapsed ? (
          <SvgXml
            xml={`<svg width="92" height="30" viewBox="0 0 344 195" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M27.2814 190.462V91.8673H78.4995H79.4995V90.8673V70.5023V69.5023H78.4995H27.2814V58.7533C27.2814 48.4452 29.5154 40.4114 33.8725 34.546L33.8726 34.546L33.8804 34.5351C38.1419 28.6347 45.6793 25.5504 56.829 25.5504C62.3428 25.5504 66.9479 26.068 70.6648 27.0817L70.6854 27.0873L70.7063 27.0921C74.5027 27.9549 77.3729 28.8909 79.3577 29.8834L80.5143 30.4617L80.7831 29.1968L85.2217 8.30955L85.3942 7.4978L84.6281 7.17862C82.4396 6.26676 78.6987 5.2942 73.4771 4.24979C68.3435 3.18796 62.1805 2.66317 55.0014 2.66317C36.5665 2.66317 22.8382 7.49247 14.0498 17.3545C5.30253 26.9965 1 40.6716 1 58.2311V190.462V191.462H2H26.2814H27.2814V190.462ZM101.618 167.36L100.5 166.852L100.229 168.049L95.7903 187.631L95.617 188.396L96.3183 188.747C97.0819 189.128 98.2703 189.582 99.8435 190.106L99.8579 190.111L99.8724 190.115C101.641 190.646 103.494 191.088 105.432 191.441C107.547 191.968 109.665 192.322 111.785 192.5C113.908 192.852 115.951 193.03 117.914 193.03C125.128 193.03 131.583 192.15 137.267 190.375C143.129 188.598 148.378 185.841 153.006 182.103C157.625 178.372 161.782 173.591 165.483 167.778C169.351 162.149 173.032 155.396 176.529 147.528L176.533 147.519C185.423 126.948 193.702 104.9 201.369 81.3759L201.37 81.3738C209.036 57.6773 216.005 33.0244 222.277 7.41531L222.58 6.17744H221.306H196.241H195.444L195.266 6.95389C190.918 25.9141 186.308 44.3515 181.438 62.2663C176.774 79.422 171.312 96.739 165.051 114.217C161.251 106.035 157.597 97.5585 154.089 88.7884C150.266 79.2297 146.703 69.6713 143.401 60.1134C140.099 50.5532 137.057 41.2547 134.277 32.2179C131.67 23.1809 129.411 14.755 127.501 6.93999L127.315 6.17744H126.53H100.421H99.1265L99.4532 7.42986C105.73 31.4914 113.576 55.2903 122.99 78.8265L122.994 78.8348C132.512 102.024 142.718 124.014 153.614 144.802C149.35 154.066 144.629 160.632 139.494 164.608L139.486 164.614L139.479 164.62C134.318 168.782 127.084 170.926 117.653 170.926C114.793 170.926 111.837 170.505 108.782 169.657L108.763 169.651L108.744 169.647C105.823 168.959 103.453 168.194 101.618 167.36ZM280.241 193.029L281.108 193.049L281.251 192.194L284.645 171.829L284.814 170.813L283.794 170.674C280.004 170.157 276.838 169.557 274.285 168.879C271.801 168.046 269.867 166.902 268.439 165.474C267.022 164.057 265.965 162.136 265.304 159.658C264.638 157.161 264.293 153.948 264.293 149.994V3V1.81327L263.124 2.01448L238.842 6.19192L238.012 6.33479V7.17744V153.91C238.012 166.933 241.179 176.732 247.714 183.086C254.253 189.443 265.186 192.679 280.241 193.029ZM337.583 191.462L338.45 191.482L338.592 190.627L341.986 170.262L342.156 169.246L341.135 169.106C337.346 168.59 334.18 167.99 331.627 167.311C329.142 166.479 327.208 165.335 325.781 163.907C324.363 162.49 323.306 160.569 322.646 158.09C321.98 155.593 321.635 152.381 321.635 148.427V3.00075V1.81402L320.465 2.01523L296.184 6.19267L295.354 6.33554V7.17819V152.343C295.354 165.366 298.52 175.165 305.056 181.519C311.594 187.876 322.527 191.112 337.583 191.462Z" fill="${colors.text.primary}" stroke="${colors.text.primary}" stroke-width="2"/>
            </svg>`}
            width={92}
            height={30}
          />
        ) : (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '800' }}>
              F
            </Text>
          </View>
        )}
        <Pressable
          onPress={() => setIsCollapsed((value) => !value)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.bg.secondary,
            borderWidth: 1,
            borderColor: colors.border.light,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: isCollapsed ? 0 : 8,
            position: isCollapsed ? 'absolute' : 'relative',
            right: isCollapsed ? -6 : undefined,
            top: isCollapsed ? 6 : undefined,
          }}
        >
          {isCollapsed ? (
            <ChevronsRight size={15} color={colors.text.muted} strokeWidth={2.4} />
          ) : (
            <ChevronsLeft size={15} color={colors.text.muted} strokeWidth={2.4} />
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityLabel="Switch business"
        onPress={() => router.push('/switch-business')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          marginHorizontal: 12,
          marginTop: Platform.OS === 'web' ? 8 : 0,
          marginBottom: 8,
          paddingHorizontal: isCollapsed ? 0 : 14,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.bg.secondary,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.bg.tertiary,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: isCollapsed ? 0 : 12,
          }}
        >
          <Building2 size={18} color={colors.text.primary} strokeWidth={2.3} />
        </View>
        {!isCollapsed ? (
          <>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.text.muted,
                  textTransform: 'uppercase',
                }}
                numberOfLines={1}
              >
                Business
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.text.primary,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {businessName?.trim() || 'Current business'}
              </Text>
            </View>
            <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.4} />
          </>
        ) : null}
      </Pressable>

      {/* Navigation Items */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 8 }}
      >
        {navItems.map((item) => {
          const feature = NAV_FEATURES[item.href];
          if (feature && !isBusinessFeatureEnabled(featureAccess, feature)) return null;
          // Check permission if required
          if (item.href === '/finance' && !canAccessFinanceNav) return null;
          if (item.href !== '/finance' && item.requiresPermission) {
            const permissions = ROLE_PERMISSIONS[userRole];
            const hasPermission = permissions ? permissions[item.requiresPermission] : false;
            if (!hasPermission) return null;
          }

          const active = isActive(item.href) || (item.href === '/finance' && pathname.includes('calculator'));
          const Icon = item.icon;
          const activeBg = colors.accent.primary;
          const activeFg = isDark ? '#111111' : '#FFFFFF';
          const navBadgeCount = item.href === '/threads'
            ? totalUnreadThreads
            : item.href === '/tasks'
              ? totalUnreadTasks
              : 0;

          if (item.href === '/inventory' && !isCollapsed) {
            return (
              <View key={item.href} style={{ marginHorizontal: 12, marginVertical: 4 }}>
                <Pressable
                  onPress={() => {
                    if (active) {
                      if (activeInventorySubKey !== 'inventory-home') {
                        setIsInventoryMenuOpen(true);
                        handleNavigation('/inventory');
                        return;
                      }
                      setIsInventoryMenuOpen((previous) => !previous);
                      return;
                    }
                    setIsInventoryMenuOpen(true);
                    handleNavigation('/inventory');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    backgroundColor: active ? colors.bg.secondary : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.border.light,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 14,
                    }}
                  >
                    <Icon
                      size={20}
                      color={active ? colors.text.primary : colors.text.tertiary}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: active ? '700' : '500',
                      color: active ? colors.text.primary : colors.text.secondary,
                    }}
                  >
                    {item.name}
                  </Text>
                  {isInventoryMenuOpen ? (
                    <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  ) : (
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  )}
                </Pressable>

                {isInventoryMenuOpen ? (
                  <View
                    style={{
                      marginTop: 8,
                      marginLeft: 18,
                      paddingLeft: 12,
                      borderLeftWidth: 1,
                      borderLeftColor: colors.border.light,
                    }}
                  >
                    {inventorySubItems.filter((subItem) => !subItem.requiresWooCommerce || hasWooCommerceConnection).map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = active && subItem.key === activeInventorySubKey;

                      return (
                        <Pressable
                          key={subItem.key}
                          onPress={() => handleNavigation(subItem.href)}
                          style={{
                            position: 'relative',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            marginBottom: 2,
                            borderRadius: 16,
                            backgroundColor: isSubActive ? colors.bg.secondary : 'transparent',
                          }}
                        >
                          <SubIcon
                            size={18}
                            color={isSubActive ? colors.text.primary : colors.text.tertiary}
                            strokeWidth={isSubActive ? 2.4 : 2}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSubActive ? '700' : '500',
                              color: isSubActive ? colors.text.primary : colors.text.secondary,
                              marginLeft: 10,
                            }}
                          >
                            {subItem.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }

          if (item.href === '/announcements' && !isCollapsed) {
            return (
              <View key={item.href} style={{ marginHorizontal: 12, marginVertical: 4 }}>
                <Pressable
                  onPress={() => {
                    if (active) {
                      if (activeAnnouncementSubKey !== 'compose') {
                        setIsAnnouncementMenuOpen(true);
                        handleNavigation('/announcements');
                        return;
                      }
                      setIsAnnouncementMenuOpen((previous) => !previous);
                      return;
                    }
                    setIsAnnouncementMenuOpen(true);
                    handleNavigation('/announcements');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    backgroundColor: active ? colors.bg.secondary : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.border.light,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 14,
                    }}
                  >
                    <Icon
                      size={20}
                      color={active ? colors.text.primary : colors.text.tertiary}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: active ? '700' : '500',
                      color: active ? colors.text.primary : colors.text.secondary,
                    }}
                  >
                    {item.name}
                  </Text>
                  {isAnnouncementMenuOpen ? (
                    <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  ) : (
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  )}
                </Pressable>

                {isAnnouncementMenuOpen ? (
                  <View
                    style={{
                      marginTop: 8,
                      marginLeft: 18,
                      paddingLeft: 12,
                      borderLeftWidth: 1,
                      borderLeftColor: colors.border.light,
                    }}
                  >
                    {announcementSubItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = active && subItem.key === activeAnnouncementSubKey;

                      return (
                        <Pressable
                          key={subItem.key}
                          onPress={() => handleNavigation(subItem.href)}
                          style={{
                            position: 'relative',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            marginBottom: 2,
                            borderRadius: 16,
                            backgroundColor: isSubActive ? colors.bg.secondary : 'transparent',
                          }}
                        >
                          <SubIcon
                            size={18}
                            color={isSubActive ? colors.text.primary : colors.text.tertiary}
                            strokeWidth={isSubActive ? 2.4 : 2}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSubActive ? '700' : '500',
                              color: isSubActive ? colors.text.primary : colors.text.secondary,
                              marginLeft: 10,
                            }}
                          >
                            {subItem.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }

          if (item.href === '/partners' && !isCollapsed) {
            const partnerActive = isPartnerRoute;
            return (
              <View key={item.href} style={{ marginHorizontal: 12, marginVertical: 4 }}>
                <Pressable
                  onPress={() => {
                    if (partnerActive) {
                      if (activePartnerSubKey !== 'jobs') {
                        setIsPartnerMenuOpen(true);
                        handleNavigation('/partners');
                        return;
                      }
                      setIsPartnerMenuOpen((previous) => !previous);
                      return;
                    }
                    setIsPartnerMenuOpen(true);
                    handleNavigation('/partners');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    backgroundColor: partnerActive ? colors.bg.secondary : 'transparent',
                    borderWidth: partnerActive ? 1 : 0,
                    borderColor: colors.border.light,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 14,
                    }}
                  >
                    <Icon
                      size={20}
                      color={partnerActive ? colors.text.primary : colors.text.tertiary}
                      strokeWidth={partnerActive ? 2.5 : 2}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: partnerActive ? '700' : '500',
                      color: partnerActive ? colors.text.primary : colors.text.secondary,
                    }}
                  >
                    {item.name}
                  </Text>
                  {isPartnerMenuOpen ? (
                    <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  ) : (
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  )}
                </Pressable>

                {isPartnerMenuOpen ? (
                  <View
                    style={{
                      marginTop: 8,
                      marginLeft: 18,
                      paddingLeft: 12,
                      borderLeftWidth: 1,
                      borderLeftColor: colors.border.light,
                    }}
                  >
                    {partnerSubItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = partnerActive && subItem.key === activePartnerSubKey;
                      const subBadgeCount = subItem.key === 'issues' ? openPartnerIssueCount : 0;

                      return (
                        <Pressable
                          key={subItem.key}
                          onPress={() => handleNavigation(subItem.href)}
                          style={{
                            position: 'relative',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            marginBottom: 2,
                            borderRadius: 16,
                            backgroundColor: isSubActive ? colors.bg.secondary : 'transparent',
                          }}
                        >
                          <SubIcon
                            size={18}
                            color={isSubActive ? colors.text.primary : colors.text.tertiary}
                            strokeWidth={isSubActive ? 2.4 : 2}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSubActive ? '700' : '500',
                              color: isSubActive ? colors.text.primary : colors.text.secondary,
                              marginLeft: 10,
                            }}
                          >
                            {subItem.label}
                          </Text>
                          {subBadgeCount > 0 ? (
                            <View
                              style={{
                                marginLeft: 'auto',
                                minWidth: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: '#EF4444',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingHorizontal: 6,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontWeight: '700',
                                }}
                              >
                                {subBadgeCount > 99 ? '99+' : subBadgeCount}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }

          if (item.href === '/finance' && !isCollapsed) {
            return (
              <View key={item.href} style={{ marginHorizontal: 12, marginVertical: 4 }}>
                <Pressable
                  onPress={() => {
                    if (active) {
                      setIsFinanceMenuOpen((previous) => !previous);
                      return;
                    }
                    setIsFinanceMenuOpen(true);
                    navigateToFinanceSection(getDefaultFinanceSectionForRole(userRole));
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    backgroundColor: active ? colors.bg.secondary : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.border.light,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 14,
                    }}
                  >
                    <Icon
                      size={20}
                      color={active ? colors.text.primary : colors.text.tertiary}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: active ? '700' : '500',
                      color: active ? colors.text.primary : colors.text.secondary,
                    }}
                  >
                    {item.name}
                  </Text>
                  {isFinanceMenuOpen ? (
                    <ChevronUp size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  ) : (
                    <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />
                  )}
                </Pressable>

                {isFinanceMenuOpen ? (
                  <View
                    style={{
                      marginTop: 8,
                      marginLeft: 18,
                      paddingLeft: 12,
                      borderLeftWidth: 1,
                      borderLeftColor: colors.border.light,
                    }}
                  >
                    {visibleFinanceSubItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isNestedProcurementItem = subItem.key === 'procurement-orders' || subItem.key === 'procurement-receive-goods' || subItem.key === 'procurement-cost-breakdown' || subItem.key === 'procurement-margin-tracker';
                      const isSubActive = active && (
                        subItem.key === 'procurement-orders'
                          ? activeFinanceSection === 'procurement' && activeProcurementPage === 'orders'
                          : subItem.key === 'procurement-receive-goods'
                            ? activeFinanceSection === 'procurement' && activeProcurementPage === 'receive-goods'
                          : subItem.key === 'procurement-cost-breakdown'
                            ? activeFinanceSection === 'procurement' && activeProcurementPage === 'cost-breakdown'
                          : subItem.key === 'procurement-margin-tracker'
                            ? activeFinanceSection === 'procurement' && activeProcurementPage === 'margin-tracker'
                          : subItem.key === 'calculator'
                            ? pathname.includes('calculator')
                          : subItem.key === activeFinanceSection && !(subItem.key === 'procurement' && (activeProcurementPage === 'orders' || activeProcurementPage === 'receive-goods' || activeProcurementPage === 'cost-breakdown' || activeProcurementPage === 'margin-tracker'))
                      );
                      const isCalculatorItem = subItem.key === 'calculator';
                      const subBadgeCount = subItem.key === 'expenses' ? pendingExpenseRequestCount : 0;

                      return (
                        <Pressable
                          key={subItem.key}
                          onPress={() => {
                            if (!subItem.enabled) return;
                            navigateToFinanceSubItem(subItem.key);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: isNestedProcurementItem ? 10 : 12,
                            marginLeft: isNestedProcurementItem ? 24 : 0,
                            marginBottom: 2,
                            borderRadius: isNestedProcurementItem ? 12 : 16,
                            backgroundColor: isSubActive ? colors.bg.secondary : 'transparent',
                            opacity: subItem.enabled ? 1 : 0.45,
                          }}
                        >
                          {isNestedProcurementItem ? (
                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                left: 5,
                                top: -8,
                                bottom: -8,
                                width: 1,
                                backgroundColor: colors.border.light,
                              }}
                            />
                          ) : null}
                          <SubIcon
                            size={isNestedProcurementItem ? 15 : 18}
                            color={isSubActive || isCalculatorItem ? colors.text.primary : colors.text.tertiary}
                            strokeWidth={isSubActive ? 2.4 : 2}
                          />
                          <Text
                            style={{
                              fontSize: isNestedProcurementItem ? 12 : 13,
                              fontWeight: isSubActive || isCalculatorItem ? '700' : '500',
                              color: isSubActive || isCalculatorItem ? colors.text.primary : colors.text.secondary,
                              marginLeft: 10,
                            }}
                          >
                            {subItem.label}
                          </Text>
                          {subBadgeCount > 0 ? (
                            <View
                              style={{
                                marginLeft: 'auto',
                                minWidth: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: '#EF4444',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingHorizontal: 6,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontWeight: '700',
                                }}
                              >
                                {subBadgeCount > 99 ? '99+' : subBadgeCount}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }

          return (
            <Pressable
              key={item.href}
              onPress={() => handleNavigation(item.href)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 12,
                marginVertical: 4,
                paddingHorizontal: isCollapsed ? 0 : 16,
                paddingVertical: isCollapsed ? 12 : 14,
                borderRadius: 999,
                backgroundColor: active ? activeBg : 'transparent',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                position: 'relative',
              }}
            >
              <View
                style={{
                  width: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: isCollapsed ? 0 : 14,
                }}
              >
                <Icon
                  size={20}
                  color={active ? activeFg : colors.text.tertiary}
                  strokeWidth={active ? 2.5 : 2}
                />
              </View>
              {!isCollapsed ? (
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: active ? '600' : '500',
                    color: active ? activeFg : colors.text.secondary,
                  }}
                >
                  {item.name}
                </Text>
              ) : null}
              {navBadgeCount > 0 && (
                <View
                  style={{
                    marginLeft: isCollapsed ? 0 : 'auto',
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                    position: isCollapsed ? 'absolute' : 'relative',
                    right: isCollapsed ? 6 : undefined,
                    top: isCollapsed ? 4 : undefined,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {navBadgeCount > 99 ? '99+' : navBadgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* User Section */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border.light,
          paddingTop: 12,
          paddingHorizontal: 12,
        }}
      >
        {currentUser && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              paddingHorizontal: isCollapsed ? 0 : 16,
              paddingVertical: 10,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.bg.tertiary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: isCollapsed ? 0 : 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.text.primary,
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            {!isCollapsed ? (
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.text.primary,
                  }}
                  numberOfLines={1}
                >
                  {currentUser.name}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                    textTransform: 'capitalize',
                  }}
                >
                  {currentUser.role}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        <Pressable
          onPress={() => router.push('/supabase-check')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            paddingHorizontal: isCollapsed ? 0 : 16,
            paddingVertical: 12,
            borderRadius: isCollapsed ? 999 : 12,
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            marginBottom: 8,
          }}
        >
          <Database size={18} color="#22C55E" strokeWidth={2} />
          {!isCollapsed ? (
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#22C55E',
                marginLeft: 12,
              }}
            >
              Test Supabase
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            paddingHorizontal: isCollapsed ? 0 : 16,
            paddingVertical: 12,
            borderRadius: isCollapsed ? 999 : 12,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <LogOut size={18} color="#EF4444" strokeWidth={2} />
          {!isCollapsed ? (
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#EF4444',
                marginLeft: 12,
              }}
            >
              Sign Out
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
