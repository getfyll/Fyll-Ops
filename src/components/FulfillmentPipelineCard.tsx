import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { Truck } from 'lucide-react-native';
import { HomeCard, HomeCta, HomeLink } from '@/components/home/home-ui';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

export type FulfillmentStageKey = 'processing' | 'dispatch' | 'delivered';

export type FulfillmentCounts = Record<FulfillmentStageKey, number>;

const STAGES: { key: FulfillmentStageKey; label: string }[] = [
  { key: 'processing', label: 'Processing' },
  { key: 'dispatch', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered (30d)' },
];

const formatCount = (value: number) => String(Math.max(0, value));

export function FulfillmentPipelineCard({
  counts,
  onPress,
  onStagePress,
  onAddOrder,
}: {
  counts: FulfillmentCounts;
  onPress: () => void;
  onStagePress?: (stage: FulfillmentStageKey) => void;
  onAddOrder?: () => void;
}) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const headlineSize = isMobile ? 28 : 24;
  const active = counts.processing + counts.dispatch;
  const total = active + counts.delivered;
  const colorFor: Record<FulfillmentStageKey, string> = {
    processing: palette.warn,
    dispatch: palette.textSoft,
    delivered: palette.tones.verified.dot,
  };

  return (
    <HomeCard style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
          <Truck size={19} color={palette.limeOnSurface} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>Fulfillment</Text>
          <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>Orders in progress</Text>
        </View>
        <HomeLink onPress={onPress} />
      </View>

      <View style={{ gap: 4 }}>
        <MoneyText style={{ color: palette.text, fontSize: headlineSize, letterSpacing: -0.4 }}>{active}</MoneyText>
        <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>
          {`${counts.delivered} delivered in the last 30 days`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 3, height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
        {total > 0 ? STAGES.map((stage) => (
          counts[stage.key] > 0 ? (
            <Pressable
              key={stage.key}
              onPress={() => onStagePress?.(stage.key)}
              accessibilityLabel={`${stage.label}: ${counts[stage.key]} orders`}
              style={{ flex: counts[stage.key], backgroundColor: colorFor[stage.key] }}
            />
          ) : null
        )) : null}
      </View>

      <View style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
        {STAGES.map((stage, index) => (
          <Pressable
            key={stage.key}
            onPress={() => onStagePress?.(stage.key)}
            className="active:opacity-80"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: index === 0 ? 0 : 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colorFor[stage.key] }} />
            <Text style={{ flex: 1, minWidth: 0, color: palette.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{stage.label}</Text>
            <MoneyText style={{ color: palette.text, fontSize: 13 }}>{formatCount(counts[stage.key])}</MoneyText>
            <Text style={{ width: 72, textAlign: 'right', color: colorFor[stage.key], fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {total > 0 ? `${Math.round((counts[stage.key] / total) * 100)}%` : '0%'}
            </Text>
          </Pressable>
        ))}
      </View>

      {onAddOrder ? (
        <View style={{ marginTop: 'auto' }}>
          <HomeCta label="Add order" onPress={onAddOrder} />
        </View>
      ) : null}
    </HomeCard>
  );
}
