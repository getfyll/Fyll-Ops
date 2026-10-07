import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { HomeCard, HomeCardHeader, HomeLink } from '@/components/home/home-ui';
import { usePaymentsPalette } from '@/components/payments/payments-ui';

export type FulfillmentStageKey = 'processing' | 'dispatch' | 'delivered';

export type FulfillmentCounts = Record<FulfillmentStageKey, number>;

const STAGES: { key: FulfillmentStageKey; label: string }[] = [
  { key: 'processing', label: 'Processing' },
  { key: 'dispatch', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
];

const formatCount = (value: number) => String(Math.max(0, value));

export function FulfillmentPipelineCard({
  counts,
  onPress,
  onStagePress,
}: {
  counts: FulfillmentCounts;
  onPress: () => void;
  onStagePress?: (stage: FulfillmentStageKey) => void;
}) {
  const palette = usePaymentsPalette();
  const total = counts.processing + counts.dispatch + counts.delivered;
  const colorFor: Record<FulfillmentStageKey, string> = {
    processing: palette.warn,
    dispatch: palette.textSoft,
    delivered: palette.tones.verified.dot,
  };

  return (
    <HomeCard>
      <HomeCardHeader
        title="Fulfillment"
        subtitle={`${total} orders in fulfillment`}
        right={<HomeLink onPress={onPress} />}
      />

      <View style={{ flexDirection: 'row', gap: 3, height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
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

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        {STAGES.map((stage) => (
          <Pressable key={stage.key} onPress={() => onStagePress?.(stage.key)} className="active:opacity-80" style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colorFor[stage.key] }} />
              <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{stage.label}</Text>
            </View>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>{formatCount(counts[stage.key])}</Text>
          </Pressable>
        ))}
      </View>
    </HomeCard>
  );
}
