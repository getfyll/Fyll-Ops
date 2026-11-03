import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useStatsColors } from '@/lib/theme';
import { FYLL_LIME, usePaymentsPalette } from '@/components/payments/payments-ui';

// The Insights screens' colours in the new Fyll look: the same cards, thin borders and lime accent as Finance. It keeps
// the shape of useStatsColors, so the charts and tables built on it work unchanged.
export function useInsightsColors() {
  const base = useStatsColors();
  const palette = usePaymentsPalette();

  return useMemo(() => ({
    ...base,
    bg: { ...base.bg, screen: palette.page, card: palette.card, cardAlt: palette.inset, input: palette.softFill },
    text: { ...base.text, secondary: palette.textSoft, tertiary: palette.muted, muted: palette.faint },
    bar: palette.isDark ? FYLL_LIME : '#A3B02A',
    barBg: palette.softFill,
    border: palette.border,
    divider: palette.hairline,
    card: { borderWidth: 1, borderColor: palette.border, shadowOpacity: 0 },
    getCardStyle: () => ({ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }),
  }), [base, palette]);
}

export type InsightsColors = ReturnType<typeof useInsightsColors>;

// Space under the last card of an Insights page, so the small bottom nav on phones never covers it.
export function useInsightsBottomPad() {
  const { isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  if (!isMobile) return 40;
  const navHeight = Platform.OS === 'ios' ? 82 : 76;
  return navHeight + 28 + Math.max(14, insets.bottom + 6) + 28;
}

// The top card of every Insights page has the same minimum height, so moving between pages does not make the content jump.
export function useInsightsTopCardHeight() {
  const { isMobile } = useBreakpoint();
  return isMobile ? 170 : 200;
}
