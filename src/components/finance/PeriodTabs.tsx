import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

type PeriodKey = '7d' | 'month' | '30d' | 'year';

// Shorter names than the card headings use ("Last 30 days"), so four tabs fit across a phone.
const SHORT_LABELS: Record<PeriodKey, string> = {
  '7d': '7 days',
  month: 'Month',
  '30d': '30 days',
  year: 'Year',
};

// The date range switcher used on every Finance page: the same full-width lime pill tabs as the Payments page.
export function PeriodTabs({
  value,
  onChange,
  options = ['7d', 'month', '30d', 'year'],
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
  options?: PeriodKey[];
}) {
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();

  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border, maxWidth: isDesktop ? 420 : undefined }}
    >
      {options.map((key) => {
        const selected = value === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.selectionAsync();
              onChange(key);
            }}
            style={(state) => ({
              flex: 1,
              height: 34,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? FYLL_LIME : isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent',
            })}
          >
            <Text style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: 12, fontWeight: '600' }}>{SHORT_LABELS[key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
