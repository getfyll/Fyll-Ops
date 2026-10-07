import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { SkeletonBox } from '@/components/SkeletonLoader';
import { useBreakpoint } from '@/lib/useBreakpoint';

// The home page's shared look: one card, one header, one row, one type scale
// (titles 14, body 12) on web and mobile, so every section reads as one system.
export const HOME_GAP = 16;
export const HOME_TITLE_SIZE = 14;
export const HOME_BODY_SIZE = 12;

export function HomeCard({ children, style, flush = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; flush?: boolean }) {
  const palette = usePaymentsPalette();
  return (
    <View
      style={[
        {
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 18,
          overflow: 'hidden',
          // Fill the row when paired with a taller card, so side-by-side cards end level.
          flexGrow: 1,
        },
        flush ? null : { paddingHorizontal: 18, paddingVertical: 16 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function HomeLink({ label = 'View all', onPress }: { label?: string; onPress: () => void }) {
  const palette = usePaymentsPalette();
  return (
    <Pressable onPress={onPress} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}>
      <Text style={{ color: palette.limeOnSurface, fontSize: HOME_BODY_SIZE, fontWeight: '600' }}>{label}</Text>
      <ChevronRight size={14} color={palette.limeOnSurface} strokeWidth={2.2} />
    </Pressable>
  );
}

export function HomeCardHeader({
  title,
  subtitle,
  right,
  loading,
  flushPadding = false,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  loading?: boolean;
  flushPadding?: boolean;
}) {
  const palette = usePaymentsPalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12, ...(flushPadding ? { paddingHorizontal: 18, paddingTop: 16 } : null) }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: HOME_TITLE_SIZE, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        {loading ? (
          <SkeletonBox width={120} height={11} rounded="md" />
        ) : subtitle ? (
          <Text style={{ color: palette.faint, fontSize: HOME_BODY_SIZE }} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// A list row with a hairline above it. Pass `first` to drop the line on the first row.
export function HomeRow({
  children,
  onPress,
  first = false,
  padded = false,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePaymentsPalette();
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: palette.hairline,
    ...(padded ? { paddingHorizontal: 18 } : null),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={(state) => [base, isHovered(state) ? { backgroundColor: palette.cardHover } : null, state.pressed ? { opacity: 0.75 } : null, style]}>
      {children}
    </Pressable>
  );
}

export function StatusText({ label, color }: { label: string; color: string }) {
  const { isMobile } = useBreakpoint();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: isMobile ? 10 : HOME_BODY_SIZE, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function EmptyLine({ text }: { text: string }) {
  const palette = usePaymentsPalette();
  return <Text style={{ color: palette.faint, fontSize: HOME_BODY_SIZE, paddingVertical: 6 }}>{text}</Text>;
}

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
  money?: boolean;
  onPress?: () => void;
};

// The four headline numbers as one connected strip: a single card divided by
// hairlines (four across on web, two by two on mobile).
export function KpiStrip({ items, loading = false }: { items: KpiItem[]; loading?: boolean }) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const columns = isMobile ? 2 : Math.max(1, Math.min(items.length, 4));

  return (
    <HomeCard flush>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map((item, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          const trendUp = (item.trend ?? 0) >= 0;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              disabled={!item.onPress}
              style={(state) => ({
                width: `${100 / columns}%`,
                paddingHorizontal: isMobile ? 14 : 18,
                paddingVertical: isMobile ? 14 : 16,
                gap: 4,
                borderLeftWidth: col === 0 ? 0 : 1,
                borderLeftColor: palette.hairline,
                borderTopWidth: row === 0 ? 0 : 1,
                borderTopColor: palette.hairline,
                backgroundColor: isHovered(state) && item.onPress ? palette.cardHover : 'transparent',
                opacity: state.pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: palette.muted, fontSize: HOME_BODY_SIZE, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }} numberOfLines={1}>
                {item.label}
              </Text>
              {loading ? (
                <>
                  <SkeletonBox width="55%" height={24} rounded="md" />
                  <SkeletonBox width="70%" height={11} rounded="md" />
                </>
              ) : (
                <>
                  <MoneyText style={{ color: palette.text, fontSize: isMobile && item.key === 'revenue' ? 28 : isMobile ? 20 : 24, letterSpacing: -0.4 }} numberOfLines={1}>
                    {item.value}
                  </MoneyText>
                  <Text style={{ color: palette.faint, fontSize: HOME_BODY_SIZE }} numberOfLines={1}>
                    {item.trend !== undefined && item.trend !== null ? (
                      <Text style={{ color: trendUp ? palette.limeOnSurface : palette.danger, fontWeight: '600' }}>
                        {trendUp ? '+' : '-'}{Math.abs(item.trend)}%{' '}
                      </Text>
                    ) : null}
                    {item.sub ?? ''}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </HomeCard>
  );
}
