import { Platform, type ViewStyle } from 'react-native';
import type { ThemeColors } from '@/lib/theme';

// Single source of truth for the bottom tab bar's style, so screens that
// temporarily hide it (e.g. an open thread's chat view) can restore the
// exact same style instead of clearing it to `undefined` — which falls back
// to React Navigation's plain default bar, not this app's floating pill.
export const getTabBarStyle = (
  colors: ThemeColors,
  isDesktop: boolean,
  isMobile: boolean
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
      left: 22,
      right: 22,
      bottom: Platform.OS === 'ios' ? 24 : 20,
      height: tabBarHeight,
      borderRadius: 999,
      backgroundColor: 'transparent',
      borderWidth: 0,
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
