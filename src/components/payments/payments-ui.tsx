import React from 'react';
import { Pressable, View, Text, type PressableStateCallbackType, type TextProps } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { useThemeColors, useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

// Shared look for the Ops payments screens (list + detail). Ops stays
// black/white; Fyll lime only marks the few things that need a tap.

export type StatusTone = 'verified' | 'awaiting' | 'review' | 'rejected' | 'closed';

export const FYLL_LIME = '#D5E057';
export const FYLL_LIME_HOVER = '#E1EB6B';
export const FYLL_LIME_INK = '#1E1E1E';

// Money that never arrived reads as struck through.
export const isUnsuccessfulTone = (tone: StatusTone) => tone === 'rejected' || tone === 'closed';

export function usePaymentsPalette() {
  const colors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  return {
    isDark,
    page: colors.bg.primary,
    card: isDark ? '#1C1C1C' : '#FFFFFF',
    cardHover: isDark ? '#232323' : '#FAFAF7',
    inset: isDark ? '#141414' : '#F6F6F4',
    border: isDark ? 'rgba(255,255,255,0.07)' : '#ECECEC',
    hairline: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0',
    outline: isDark ? 'rgba(255,255,255,0.14)' : '#DCDCDC',
    text: colors.text.primary,
    textSoft: isDark ? '#D5D6CC' : '#333333',
    muted: isDark ? '#9D9E94' : '#6B6B6B',
    faint: isDark ? '#8C8D84' : '#8A8A8A',
    avatarBg: isDark ? '#2A2B24' : '#F1F2EA',
    avatarText: isDark ? '#D5D6CC' : '#4A4B40',
    inverseBg: isDark ? '#F4F4EF' : '#111111',
    inverseText: isDark ? '#141414' : '#FFFFFF',
    segmentBg: isDark ? '#1C1C1C' : '#F2F2F2',
    inputBg: isDark ? '#1C1C1C' : '#FFFFFF',
    softFill: isDark ? 'rgba(255,255,255,0.06)' : '#F2F2F2',
    nudgeBg: isDark ? 'rgba(213,224,87,0.10)' : 'rgba(213,224,87,0.16)',
    nudgeBorder: isDark ? 'rgba(213,224,87,0.28)' : 'rgba(170,184,40,0.45)',
    nudgeSub: isDark ? '#B9BAB0' : '#55564C',
    limeOnSurface: isDark ? FYLL_LIME : '#5B6A0E',
    warn: isDark ? '#E3B15A' : '#A5650C',
    warnBg: isDark ? 'rgba(227,177,90,0.14)' : 'rgba(224,162,58,0.14)',
    warnBorder: isDark ? 'rgba(227,177,90,0.35)' : 'rgba(224,162,58,0.45)',
    danger: isDark ? '#E5776D' : '#C2453A',
    dangerBg: isDark ? 'rgba(229,119,109,0.12)' : 'rgba(194,69,58,0.08)',
    dangerBorder: isDark ? 'rgba(229,119,109,0.32)' : 'rgba(194,69,58,0.3)',
    tones: (isDark
      ? {
        verified: { ink: '#B9C46A', dot: '#B9C46A', bg: 'rgba(185,196,106,0.14)' },
        awaiting: { ink: '#E3B15A', dot: '#E3B15A', bg: 'rgba(227,177,90,0.14)' },
        review: { ink: FYLL_LIME, dot: FYLL_LIME, bg: 'rgba(213,224,87,0.14)' },
        rejected: { ink: '#E5776D', dot: '#E5776D', bg: 'rgba(229,119,109,0.14)' },
        closed: { ink: '#8C8D84', dot: '#5D5E56', bg: 'rgba(255,255,255,0.06)' },
      }
      : {
        verified: { ink: '#5B6A0E', dot: '#97A91E', bg: 'rgba(151,169,30,0.14)' },
        awaiting: { ink: '#A5650C', dot: '#E0A23A', bg: 'rgba(224,162,58,0.16)' },
        review: { ink: '#111111', dot: '#C2D130', bg: 'rgba(194,209,48,0.24)' },
        rejected: { ink: '#C2453A', dot: '#E5776D', bg: 'rgba(229,119,109,0.14)' },
        closed: { ink: '#8A8A8A', dot: '#BDBDBD', bg: '#F0F0F0' },
      }) as Record<StatusTone, { ink: string; dot: string; bg: string }>,
  };
}

export type PaymentsPalette = ReturnType<typeof usePaymentsPalette>;

// react-native-web reports mouse hover on Pressable state; native never sets it.
export const isHovered = (state: PressableStateCallbackType) => (state as PressableStateCallbackType & { hovered?: boolean }).hovered === true;

export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter((part) => part && part !== '—');
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

export function StatusDot({ tone, label, palette }: { tone: StatusTone; label: string; palette: PaymentsPalette }) {
  const { ink, dot } = palette.tones[tone];
  const fs = useMobileFont();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text style={{ color: ink, fontSize: fs(12.5), fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function InitialsAvatar({ name, palette, size = 38 }: { name: string; palette: PaymentsPalette; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.avatarBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ color: palette.avatarText, fontSize: 13, fontWeight: '600' }}>{getInitials(name)}</Text>
    </View>
  );
}

export function SectionLabel({ children, palette }: { children: React.ReactNode; palette: PaymentsPalette }) {
  const fs = useMobileFont();
  return (
    <Text style={{ color: palette.faint, fontSize: fs(12), fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</Text>
  );
}

// Headline money figures use Fyll's display face (Bricolage Grotesque, as on
// the customer payment pages) — the one typographic brand moment in Ops.
// Falls back to system bold until the font has loaded.
export function MoneyText({ style, ...props }: TextProps) {
  const [fontLoaded] = useFonts({ BricolageGrotesque_700Bold });
  return (
    <Text
      {...props}
      style={[
        { fontWeight: '700', fontVariant: ['tabular-nums'] },
        style,
        // Single-weight face: ask for 400 so web doesn't synthesise a faux bold.
        fontLoaded ? { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' } : null,
      ]}
    />
  );
}

// Phones: body text on the payments screens is 12px (main) or 10px (secondary:
// status, captions, dates). Headings (17px+) keep their size. Desktop unchanged.
export function useMobileFont() {
  const { isMobile } = useBreakpoint();
  return (size: number) => {
    if (!isMobile || size > 16) return size;
    return size >= 13 ? 12 : 10;
  };
}

// Standard Ops back button: chevron in a thin outlined circle (40px).
export function BackButton({ onPress, palette, label = 'Back' }: { onPress: () => void; palette: PaymentsPalette; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={(state) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent',
      })}
    >
      <ChevronLeft size={20} color={palette.text} strokeWidth={2.2} />
    </Pressable>
  );
}
