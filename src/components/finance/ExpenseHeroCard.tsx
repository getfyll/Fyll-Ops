import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { FYLL_LIME, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

type Tone = 'positive' | 'negative' | 'neutral';

export type ExpenseHeroCategory = { name: string; amount: number };

// Bar colours, in order of size. The biggest cost is Fyll lime; the rest are muted so it stands out.
const CATEGORY_COLORS = [FYLL_LIME, '#E8B04A', '#D9776D', '#8A8F98'];
const OTHER_COLOR = '#6F7168';

// The headline card on the Expenses tab: what was spent in the period, how it compares to the one before, and a bar that
// shows which categories took the most.
export function ExpenseHeroCard({
  periodLabel,
  previousLabel,
  formatMoney,
  total,
  count,
  categories,
  changeLabel,
  changeTone,
  isMobile,
  loading = false,
}: {
  periodLabel: string;
  previousLabel: string;
  formatMoney: (amount: number) => string;
  total: number;
  count: number;
  categories: ExpenseHeroCategory[];
  changeLabel?: string;
  changeTone: Tone;
  isMobile: boolean;
  loading?: boolean;
}) {
  const palette = usePaymentsPalette();

  const sorted = [...categories].filter((category) => category.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 4);
  const otherAmount = sorted.slice(4).reduce((sum, category) => sum + category.amount, 0);
  const segments = [
    ...top.map((category, index) => ({ key: category.name, label: category.name, amount: category.amount, color: CATEGORY_COLORS[index] ?? OTHER_COLOR })),
    ...(otherAmount > 0 ? [{ key: '__other', label: 'Other', amount: otherAmount, color: OTHER_COLOR }] : []),
  ];
  const barTotal = segments.reduce((sum, segment) => sum + segment.amount, 0);
  const biggest = top[0] ?? null;
  const biggestShare = biggest && barTotal > 0 ? Math.round((biggest.amount / barTotal) * 100) : null;
  const average = count > 0 ? total / count : 0;

  const changeNumber = changeLabel?.match(/^([+-]?)(\d+(?:\.\d+)?)%/);
  const changeText = changeNumber ? `${changeNumber[2]}% vs ${previousLabel}` : changeLabel ?? null;
  const changeColor = changeTone === 'positive' ? palette.limeOnSurface : changeTone === 'negative' ? palette.danger : palette.muted;
  const changeBg = changeTone === 'positive' ? palette.nudgeBg : changeTone === 'negative' ? palette.dangerBg : palette.softFill;
  // Spending going up is the "bad" direction, so the arrow follows the number, not the colour.
  const goingUp = changeNumber ? changeNumber[1] !== '-' : null;
  const ChangeIcon = goingUp === null || changeTone === 'neutral' ? null : goingUp ? ArrowUp : ArrowDown;

  const entriesBlock = (
    <View style={{ alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 6 }}>
      <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>Entries</Text>
      <MoneyText style={{ color: palette.text, fontSize: isMobile ? 20 : 28, letterSpacing: -0.6 }} numberOfLines={1}>{count.toLocaleString()}</MoneyText>
    </View>
  );

  return (
    <View
      style={{
        borderRadius: 26,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.card,
      }}
    >
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
            <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>
              Expenses · {periodLabel}
            </Text>
            {loading ? (
              <View style={{ width: 200, height: 44, borderRadius: 12, backgroundColor: palette.softFill }} />
            ) : (
              <MoneyText
                style={{ color: palette.text, fontSize: 40, lineHeight: 46, letterSpacing: -1.4 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatMoney(total)}
              </MoneyText>
            )}
            {loading ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {biggest && biggestShare !== null ? (
                  <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>
                    <Text style={{ color: palette.text, fontWeight: '700' }}>{biggest.name}</Text> took {biggestShare}% of it
                    {count > 0 ? `, about ${formatMoney(Math.round(average))} per entry.` : '.'}
                  </Text>
                ) : (
                  <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>No expenses recorded in this period.</Text>
                )}
                {changeText ? (
                  <View style={{ height: isMobile ? 26 : 30, paddingHorizontal: isMobile ? 10 : 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: changeBg }}>
                    {ChangeIcon ? <ChangeIcon size={13} color={changeColor} strokeWidth={2.6} /> : null}
                    <Text style={{ color: changeColor, fontSize: isMobile ? 10 : 12, fontWeight: '600' }}>{changeText}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
          {entriesBlock}
        </View>

        <View style={{ height: isMobile ? 22 : 30, flexDirection: 'row', gap: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
          {barTotal > 0
            ? segments.map((segment) => (
              <View key={segment.key} style={{ flexGrow: segment.amount, flexBasis: 0, backgroundColor: segment.color, minWidth: 4 }} />
            ))
            : null}
        </View>

        {segments.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: isMobile ? 14 : 28, rowGap: isMobile ? 8 : 10 }}>
            {segments.map((segment) => (
              <View key={segment.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                <View style={{ width: isMobile ? 9 : 10, height: isMobile ? 9 : 10, borderRadius: isMobile ? 3 : 4, backgroundColor: segment.color }} />
                <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12, flexShrink: 1 }} numberOfLines={1}>
                  {segment.label} <Text style={{ color: palette.textSoft }}>{formatMoney(segment.amount)}</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
