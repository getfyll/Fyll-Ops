import { useMemo } from 'react';
import type { TextStyle } from 'react-native';
import { useFonts, PublicSans_700Bold } from '@expo-google-fonts/public-sans';

export const DESKTOP_PAGE_HEADER_MIN_HEIGHT = 92;
export const DESKTOP_PAGE_HEADER_GUTTER = 8;

export const getStandardPageHeadingStyle = (isMobile: boolean): TextStyle => ({
  fontSize: isMobile ? 24 : 28,
  lineHeight: isMobile ? 30 : 34,
  fontWeight: '700',
  letterSpacing: -0.6,
});

export const getDashboardHeadingStyle = (isMobile: boolean): TextStyle => ({
  fontSize: isMobile ? 28 : 30,
  lineHeight: isMobile ? 34 : 36,
  fontWeight: '700',
});

// Page titles across the app: the standard size/weight in Public Sans Bold
// (falls back to the system bold font until the typeface has loaded).
export const usePageHeadingStyle = (isMobile: boolean): TextStyle => {
  const [fontLoaded] = useFonts({ PublicSans_700Bold });
  return useMemo(
    () => ({
      ...getStandardPageHeadingStyle(isMobile),
      ...(fontLoaded ? { fontFamily: 'PublicSans_700Bold', fontWeight: '400' as const } : null),
    }),
    [isMobile, fontLoaded]
  );
};
