import { Platform, type ViewStyle } from 'react-native';
import type { ThemeColors } from '@/lib/theme';

const MOBILE_TAB_BAR_HIDDEN_ROUTES = new Set([
  '/inventory-audit',
  '/settings-panel',
  '/fulfillment',
  '/cases',
  '/finance',
  '/insights',
  '/customers',
]);

// These nested routes are primary workspaces, not drill-down detail screens.
const MOBILE_TAB_BAR_VISIBLE_ROUTES = new Set([
  '/inventory/warehouse',
]);

// Primary destinations remain one tap away. Once a user drills into content,
// the page's back button owns navigation and the floating bar should recede.
export const shouldHideMobileTabBar = (pathname: string): boolean => {
  const normalizedPath = `/${pathname.split('?')[0]?.split('#')[0]?.split('/').filter(Boolean).join('/') ?? ''}`;
  if (MOBILE_TAB_BAR_VISIBLE_ROUTES.has(normalizedPath)) return false;
  if (MOBILE_TAB_BAR_HIDDEN_ROUTES.has(normalizedPath)) return true;
  return normalizedPath.split('/').filter(Boolean).length > 1;
};

// Single source of truth for the bottom tab bar's style, so screens that
// temporarily hide it (e.g. an open thread's chat view) can restore the
// exact same style instead of clearing it to `undefined` — which falls back
// to React Navigation's plain default bar, not this app's floating pill.
export const getTabBarStyle = (
  colors: ThemeColors,
  isDesktop: boolean,
  isMobile: boolean,
  bottomInset = 0
): ViewStyle => {
  const isWeb = Platform.OS === 'web';
  const tabBarHeight = isMobile ? (Platform.OS === 'ios' ? 82 : 76) : isWeb ? 80 : (Platform.OS === 'ios' ? 88 : 70);

  if (isDesktop) {
    return { display: 'none' };
  }

  if (isMobile) {
    const isDark = colors.text.primary === '#FFFFFF';
    return {
      position: 'absolute',
      // Same spot as the Fyll Print nav (see RootMobileBottomNav in src/app/_layout.tsx), so switching between them does not jump.
      left: 14,
      right: 14,
      bottom: 28 + Math.max(14, bottomInset + 6),
      height: tabBarHeight,
      borderRadius: 999,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.72)',
      overflow: 'hidden',
      paddingTop: 7,
      paddingBottom: Platform.OS === 'ios' ? 12 : 8,
      paddingHorizontal: 6,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
      elevation: 18,
    };
  }

  return {
    backgroundColor: colors.tabBar.bg,
    borderTopWidth: 1,
    borderTopColor: colors.tabBar.border,
    height: tabBarHeight,
    paddingTop: isWeb ? 6 : 8,
    paddingBottom: isWeb ? 10 : (Platform.OS === 'ios' ? 28 : 12),
  };
};
