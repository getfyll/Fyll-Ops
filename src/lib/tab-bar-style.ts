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
    return {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: Platform.OS === 'ios' ? 24 : 20,
      height: tabBarHeight,
      borderRadius: 999,
      backgroundColor: colors.bg.primary === '#FFFFFF' ? 'rgba(255, 255, 255, 0.78)' : 'rgba(24, 24, 24, 0.72)',
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: colors.bg.primary === '#FFFFFF' ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.12)',
      overflow: 'hidden',
      paddingTop: 7,
      paddingBottom: Platform.OS === 'ios' ? 12 : 8,
      paddingHorizontal: 6,
      shadowColor: '#000000',
      shadowOpacity: colors.bg.primary === '#FFFFFF' ? 0.14 : 0.28,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
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
