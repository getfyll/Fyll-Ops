import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

// The date range switcher on the pages inside Insights: one full-width lime pill, the same as Finance and the main
// Insights page, so every range fits without swiping.
export function InsightsRangeTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 4, marginTop: 16, borderRadius: 999, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border, maxWidth: isDesktop ? 520 : undefined }}
    >
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={(state) => ({ flex: 1, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? FYLL_LIME : isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <Text numberOfLines={1} style={{ color: selected ? FYLL_LIME_INK : palette.muted, fontSize: 12, fontWeight: '600' }}>
              {option.label.replace(/^(Last|This) /, '')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
