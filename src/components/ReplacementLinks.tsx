import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, RefreshCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Case, type Order } from '@/lib/state/fyll-store';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';

const LIME_EDGE = 'rgba(91,106,14,0.25)';

/** Banner on a replacement order: what it replaces, and that it isn't a sale. */
export function ReplacementBanner({ order, style }: { order: Order; style?: ViewStyle }) {
  const palette = usePaymentsPalette();
  const router = useRouter();
  const link = order.replacementFor;
  if (!link?.caseId) return null;

  const go = (path: string) => {
    Haptics.selectionAsync();
    router.push(path as any);
  };

  return (
    <View
      style={[
        { flexDirection: 'row', borderRadius: 26, padding: 16, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: LIME_EDGE, gap: 12 },
        style,
      ]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCcw size={17} color={FYLL_LIME_INK} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>Replacement order · not a sale</Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
          Kept out of sales, revenue and order counts.
        </Text>
        <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
          {link.orderId ? (
            <Pressable
              onPress={() => go(`/order/${link.orderId}`)}
              className="rounded-full px-3 py-1.5 active:opacity-80"
              style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
            >
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Replaces {link.orderNumber ?? 'order'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => go(`/case/${link.caseId}`)}
            className="rounded-full px-3 py-1.5 active:opacity-80"
            style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
          >
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{link.caseNumber}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Under a case row on the original order: the replacement orders that case sent. */
export function CaseReplacementRows({ caseItem }: { caseItem: Case }) {
  const palette = usePaymentsPalette();
  const router = useRouter();
  const orders = useFyllStore((s) => s.orders);
  const entries = caseItem.replacementOrders ?? [];
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: 6, marginLeft: 14, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: FYLL_LIME }}>
      {entries.map((entry) => {
        const status = orders.find((order) => order.id === entry.orderId)?.status;
        return (
          <Pressable
            key={entry.orderId}
            onPress={() => {
              Haptics.selectionAsync();
              router.push(`/order/${entry.orderId}` as any);
            }}
            className="flex-row items-center rounded-2xl px-3 py-2.5 active:opacity-80"
            style={{ backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: LIME_EDGE, gap: 10 }}
          >
            <RefreshCcw size={14} color={palette.limeOnSurface} strokeWidth={2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                Replacement sent · {entry.orderNumber}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>
                {status ?? 'Order'} · not a sale
              </Text>
            </View>
            <ChevronRight size={16} color={palette.faint} strokeWidth={2} />
          </Pressable>
        );
      })}
    </View>
  );
}
