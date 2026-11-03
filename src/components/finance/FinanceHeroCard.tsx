import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { FYLL_LIME, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

type Tone = 'positive' | 'negative' | 'neutral';

export type HeroSegment = { key: string; label: string; amount: number; color?: string };
export type SentencePart = { text: string; bold?: boolean };

// Bar colours, biggest first. The biggest part is Fyll lime; the rest are muted so it stands out.
const SEGMENT_COLORS = [FYLL_LIME, '#E8B04A', '#D9776D', '#8A8F98'];
const OTHER_COLOR = '#6F7168';

// Turns raw groups into at most five bar segments: the four biggest, then everything else as "Other".
export function buildHeroSegments(groups: { name: string; amount: number; color?: string }[]): HeroSegment[] {
  const sorted = groups.filter((group) => group.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 4).map((group) => ({ key: group.name, label: group.name, amount: group.amount, color: group.color }));
  const otherAmount = sorted.slice(4).reduce((sum, group) => sum + group.amount, 0);
  return otherAmount > 0 ? [...top, { key: '__other', label: 'Other', amount: otherAmount }] : top;
}

// The headline card at the top of a Finance tab: the period's total, a one-line takeaway, the change from the period
// before, one side figure, and a bar showing what the total is made of.
export function FinanceHeroCard({
  eyebrow,
  amount,
  amountTone = 'default',
  sentence,
  changeLabel,
  changeTone,
  previousLabel,
  sideLabel,
  sideValue,
  segments,
  legendNote,
  formatMoney,
  isMobile,
  loading = false,
}: {
  eyebrow: string;
  amount: string;
  amountTone?: 'default' | 'danger';
  sentence: SentencePart[];
  changeLabel?: string;
  changeTone: Tone;
  previousLabel: string;
  sideLabel: string;
  sideValue: string;
  segments: HeroSegment[];
  legendNote?: string;
  formatMoney: (amount: number) => string;
  isMobile: boolean;
  loading?: boolean;
}) {
  const palette = usePaymentsPalette();
  const colored = segments.map((segment, index) => ({ ...segment, color: segment.color ?? (segment.key === '__other' ? OTHER_COLOR : SEGMENT_COLORS[index] ?? OTHER_COLOR) }));
  const barTotal = colored.reduce((sum, segment) => sum + segment.amount, 0);

  const changeNumber = changeLabel?.match(/^([+-]?)(\d+(?:\.\d+)?)%/);
  const changeText = changeNumber ? `${changeNumber[2]}% vs ${previousLabel}` : changeLabel ?? null;
  const changeColor = changeTone === 'positive' ? palette.limeOnSurface : changeTone === 'negative' ? palette.danger : palette.muted;
  const changeBg = changeTone === 'positive' ? palette.nudgeBg : changeTone === 'negative' ? palette.dangerBg : palette.softFill;
  // The arrow follows the number's direction; the colour says whether that is good news.
  const goingUp = changeNumber ? changeNumber[1] !== '-' : null;
  const ChangeIcon = goingUp === null || changeTone === 'neutral' ? null : goingUp ? ArrowUp : ArrowDown;
  const bodySize = isMobile ? 10 : 12;

  return (
    <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}>
      <LinearGradient
        pointerEvents="none"
        colors={palette.isDark ? ['rgba(213,224,87,0.13)', 'rgba(213,224,87,0)'] : ['rgba(213,224,87,0.24)', 'rgba(213,224,87,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.8 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ padding: isMobile ? 20 : 28, gap: isMobile ? 16 : 20 }}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <View style={{ flex: isMobile ? undefined : 1, minWidth: 0, gap: isMobile ? 8 : 10 }}>
            <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{eyebrow}</Text>
            {loading ? (
              <View style={{ width: 200, height: 44, borderRadius: 12, backgroundColor: palette.softFill }} />
            ) : (
              <MoneyText
                style={{ color: amountTone === 'danger' ? palette.danger : palette.text, fontSize: 40, lineHeight: 46, letterSpacing: -1.4 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {amount}
              </MoneyText>
            )}
            {loading ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: palette.muted, fontSize: bodySize }}>
                  {sentence.map((part, index) => (
                    <Text key={index} style={part.bold ? { color: palette.text, fontWeight: '700' } : undefined}>{part.text}</Text>
                  ))}
                </Text>
                {changeText ? (
                  <View style={{ height: isMobile ? 26 : 30, paddingHorizontal: isMobile ? 10 : 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: changeBg }}>
                    {ChangeIcon ? <ChangeIcon size={13} color={changeColor} strokeWidth={2.6} /> : null}
                    <Text style={{ color: changeColor, fontSize: isMobile ? 10 : 12, fontWeight: '600' }}>{changeText}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
          <View style={{ alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 6 }}>
            <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{sideLabel}</Text>
            <MoneyText style={{ color: palette.text, fontSize: isMobile ? 20 : 28, letterSpacing: -0.6 }} numberOfLines={1}>{sideValue}</MoneyText>
          </View>
        </View>

        <View style={{ height: isMobile ? 22 : 30, flexDirection: 'row', gap: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
          {barTotal > 0
            ? colored.map((segment) => (
              <View key={segment.key} style={{ flexGrow: segment.amount, flexBasis: 0, backgroundColor: segment.color, minWidth: 4 }} />
            ))
            : null}
        </View>

        {colored.length > 0 || legendNote ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: isMobile ? 14 : 28, rowGap: isMobile ? 8 : 10 }}>
            {colored.map((segment) => (
              <View key={segment.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                <View style={{ width: isMobile ? 9 : 10, height: isMobile ? 9 : 10, borderRadius: isMobile ? 3 : 4, backgroundColor: segment.color }} />
                <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12, flexShrink: 1 }} numberOfLines={1}>
                  {segment.label} <Text style={{ color: palette.textSoft }}>{formatMoney(segment.amount)}</Text>
                </Text>
              </View>
            ))}
            {legendNote ? <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12 }}>{legendNote}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
