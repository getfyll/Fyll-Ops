import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { FYLL_LIME, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { SparklineChart } from '@/components/stats/SparklineChart';

type Parts = { bold: string; rest: string } | null;
export type HeadlineStat = { label: string; value: string; dim?: boolean };

// The big headline card for an Insights page (the same one as on the main Insights page): a small label, the headline
// figure, how it moved, one plain sentence, and the numbers that matter in a row (2 by 2 on phones).
export function HeadlineCard({
  label,
  figure,
  change,
  changeLabel,
  sentence,
  stats,
  compact,
}: {
  label: string;
  figure: string;
  change?: number;
  changeLabel?: string;
  sentence?: Parts;
  stats: HeadlineStat[];
  compact: boolean;
}) {
  const palette = usePaymentsPalette();
  const hasChange = change !== undefined && Number.isFinite(change);
  const up = (change ?? 0) >= 0;
  const chipInk = !hasChange ? palette.muted : up ? palette.limeOnSurface : palette.danger;
  const chipBg = !hasChange ? palette.softFill : up ? palette.nudgeBg : palette.dangerBg;

  return (
    <View style={{ flex: compact ? undefined : 1, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}>
      <LinearGradient
        pointerEvents="none"
        colors={palette.isDark ? ['rgba(213,224,87,0.13)', 'rgba(213,224,87,0)'] : ['rgba(213,224,87,0.24)', 'rgba(213,224,87,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.8 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ padding: compact ? 20 : 28, gap: compact ? 12 : 16, flex: compact ? undefined : 1, minHeight: compact ? 250 : 300 }}>
        <Text style={{ color: palette.faint, fontSize: compact ? 12 : 10, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{label}</Text>
        <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'flex-end', flexWrap: 'wrap', gap: compact ? 10 : 16 }}>
          <MoneyText style={{ color: palette.text, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{figure}</MoneyText>
          {hasChange ? (
            <View style={{ height: compact ? 30 : 28, paddingHorizontal: compact ? 14 : 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: chipBg, marginBottom: compact ? 0 : 10 }}>
              {up ? <ArrowUp size={15} color={chipInk} strokeWidth={2.6} /> : <ArrowDown size={15} color={chipInk} strokeWidth={2.6} />}
              <Text style={{ color: chipInk, fontSize: compact ? 12 : 10, fontWeight: '700' }}>{Math.abs(change ?? 0).toFixed(0)}% {changeLabel ?? ''}</Text>
            </View>
          ) : null}
        </View>
        {sentence ? (
          <Text style={{ color: palette.muted, fontSize: compact ? 12 : 14, lineHeight: compact ? 18 : 21 }}>
            <Text style={{ color: palette.text, fontWeight: '700' }}>{sentence.bold}</Text>
            {sentence.rest}
          </Text>
        ) : null}
        {compact ? null : <View style={{ flex: 1 }} />}
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <View style={{ flexDirection: 'row', flexWrap: compact ? 'wrap' : 'nowrap', rowGap: compact ? 16 : 0 }}>
          {stats.map((stat, index) => (
            <View key={stat.label} style={compact ? { width: '50%', gap: 4 } : { flex: 1, gap: 6, paddingLeft: index === 0 ? 0 : 20, borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: palette.hairline }}>
              <Text style={{ color: palette.muted, fontSize: compact ? 12 : 10 }} numberOfLines={1}>{stat.label}</Text>
              <MoneyText style={{ color: stat.dim ? palette.faint : palette.text, fontSize: compact ? 16 : 20, letterSpacing: -0.4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{stat.value}</MoneyText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// The smaller card beside it: a label, a figure, its trend, and a few small numbers. Stacked on wide screens, a short row
// on phones.
export function SideCard({
  label,
  figure,
  series,
  lines,
  subline,
  live = false,
  compact,
  onPress,
}: {
  label: string;
  figure: string;
  series: number[];
  lines: string[];
  subline?: string;
  live?: boolean;
  compact: boolean;
  onPress?: () => void;
}) {
  const palette = usePaymentsPalette();
  const [chartWidth, setChartWidth] = useState(0);
  const hasSeries = series.some((value) => value > 0);

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{label}</Text>
            {live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: FYLL_LIME }} /> : null}
          </View>
          <MoneyText style={{ color: palette.text, fontSize: 20, lineHeight: 24, letterSpacing: -0.6 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{figure}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{subline ?? lines.slice(0, 2).join(' · ')}</Text>
        </View>
        {hasSeries ? <SparklineChart data={series} width={110} height={46} strokeColor={FYLL_LIME} strokeWidth={2} /> : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      style={{ flex: 1, borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 24, gap: 14, minHeight: 300 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{label}</Text>
        {live ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: FYLL_LIME }} />
            <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>Live</Text>
          </View>
        ) : null}
      </View>
      <MoneyText style={{ color: palette.text, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{figure}</MoneyText>
      <View style={{ flex: 1, minHeight: 90, justifyContent: 'center' }} onLayout={(event) => setChartWidth(Math.floor(event.nativeEvent.layout.width))}>
        {chartWidth > 0 && hasSeries ? <SparklineChart data={series} width={chartWidth} height={70} strokeColor={FYLL_LIME} strokeWidth={2.5} /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
        {lines.map((line) => (
          <Text key={line} style={{ width: '50%', color: palette.muted, fontSize: 14 }} numberOfLines={1}>{line}</Text>
        ))}
      </View>
    </Pressable>
  );
}
