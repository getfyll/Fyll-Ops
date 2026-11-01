import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

// The amber strip at the top of the Finance Overview and Expenses pages: shown only while team expense requests are
// waiting for the owner's approval. Tapping it opens the approval queue.
export function PendingExpenseBanner({
  count,
  onPress,
  boldText,
  restText,
  actionLabel = 'Review',
}: {
  count: number;
  onPress: () => void;
  // Optional wording for other kinds of pending work (refunds, purchase orders); defaults to expense requests.
  boldText?: string;
  restText?: string;
  actionLabel?: string;
}) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const textSize = isMobile ? 12 : 14;
  if (count <= 0) return null;
  const amber = palette.isDark ? '#E8B04A' : '#C98A1B';
  const plural = count === 1;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${boldText ?? `${count} expense request${plural ? '' : 's'}`}${restText ?? (plural ? ' from your team is waiting for approval' : ' from your team are waiting for approval')}. ${actionLabel}`}
      style={(state) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: 18,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.warnBorder,
        backgroundColor: isHovered(state) || state.pressed ? (palette.isDark ? 'rgba(232,176,74,0.2)' : 'rgba(224,162,58,0.22)') : palette.warnBg,
      })}
    >
      <View style={{ minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: amber }}>
        <Text style={{ color: '#1E1E1E', fontSize: 14, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
      </View>
      <Text style={{ flex: 1, minWidth: 0, color: palette.muted, fontSize: textSize, lineHeight: isMobile ? 17 : 19 }} numberOfLines={2}>
        <Text style={{ color: palette.text, fontWeight: '700' }}>{boldText ?? `${count} expense request${plural ? '' : 's'}`}</Text>
        {restText ?? (plural ? ' from your team is waiting for approval' : ' from your team are waiting for approval')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text style={{ color: amber, fontSize: textSize, fontWeight: '700' }}>{actionLabel}</Text>
        <ArrowRight size={15} color={amber} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}
