import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Case } from '@/lib/state/fyll-store';

// An order keeps its own fulfilment status (it describes where the parcel is).
// Cases sit beside it: this chip says "this order has a problem being handled".
export type OrderCaseState = 'open' | 'resolved';

const CLOSED_CASE_STATUSES = new Set(['resolved', 'closed']);

export const isCaseOpen = (caseItem: Pick<Case, 'status'>) => (
  !CLOSED_CASE_STATUSES.has((caseItem.status ?? '').trim().toLowerCase())
);

/** 'open' if any linked case is still open, 'resolved' if all are closed, nothing if the order has no cases. */
export const buildOrderCaseStates = (cases: Case[]): Record<string, OrderCaseState> => {
  const states: Record<string, OrderCaseState> = {};
  cases.forEach((caseItem) => {
    if (!caseItem.orderId) return;
    if (isCaseOpen(caseItem)) states[caseItem.orderId] = 'open';
    else if (!states[caseItem.orderId]) states[caseItem.orderId] = 'resolved';
  });
  return states;
};

const TONES: Record<OrderCaseState, { bg: string; ink: string; label: string }> = {
  open: { bg: 'rgba(245,158,11,0.16)', ink: '#D97706', label: 'Case open' },
  resolved: { bg: 'rgba(138,138,138,0.16)', ink: '#8A8A8A', label: 'Case resolved' },
};

export function OrderCaseChip({
  state,
  size = 'sm',
  onPress,
}: {
  state: OrderCaseState | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  onPress?: () => void;
}) {
  if (!state) return null;
  const tone = TONES[state];
  const dims = size === 'xs'
    ? { height: 16, px: 6, font: 9, dot: 5 }
    : size === 'md'
      ? { height: 28, px: 11, font: 12, dot: 6 }
      : { height: 18, px: 7, font: 10, dot: 5 };

  const chip = (
    <View
      style={{
        height: dims.height,
        paddingHorizontal: dims.px,
        borderRadius: 999,
        backgroundColor: tone.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <View style={{ width: dims.dot, height: dims.dot, borderRadius: dims.dot / 2, backgroundColor: tone.ink }} />
      <Text style={{ color: tone.ink, fontSize: dims.font, fontWeight: '700' }} numberOfLines={1}>{tone.label}</Text>
    </View>
  );

  if (!onPress) return chip;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${tone.label}, view case`} className="active:opacity-70">
      {chip}
    </Pressable>
  );
}
