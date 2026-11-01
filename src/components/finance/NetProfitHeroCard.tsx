import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { FYLL_LIME, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

type Tone = 'positive' | 'negative' | 'neutral';

// Colours of the stacked bar. Profit is Fyll lime; the rest are muted so the profit stands out.
const EXPENSE_COLOR = '#6F7168';
const PROCUREMENT_COLOR = '#8A8F98';
const REFUND_COLOR = '#D9776D';
const FEES_COLOR = '#E8B04A';

// The headline card on Finance Overview: net profit for the period, how much of every naira was kept, and a bar that
// shows where the money went.
export function NetProfitHeroCard({
  periodLabel,
  previousLabel,
  formatMoney,
  netProfit,
  grossRevenue,
  totalCashIn,
  expenses,
  procurement,
  refunds,
  fees,
  otherIncome,
  changeLabel,
  changeTone,
  isMobile,
  loading = false,
  onPress,
}: {
  periodLabel: string;
  previousLabel: string;
  formatMoney: (amount: number) => string;
  netProfit: number;
  grossRevenue: number;
  totalCashIn: number;
  expenses: number;
  procurement: number;
  refunds: number;
  fees: number;
  otherIncome: number;
  changeLabel?: string;
  changeTone: Tone;
  isMobile: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  const palette = usePaymentsPalette();

  const profitPart = Math.max(0, netProfit);
  const segments = [
    { key: 'profit', label: 'Profit', amount: profitPart, color: FYLL_LIME },
    { key: 'expenses', label: 'Expenses', amount: expenses, color: EXPENSE_COLOR },
    { key: 'procurement', label: 'Procurement', amount: procurement, color: PROCUREMENT_COLOR },
    { key: 'refunds', label: 'Refunds', amount: refunds, color: REFUND_COLOR },
    { key: 'fees', label: 'Fees & stamp duty', amount: fees, color: FEES_COLOR },
  ];
  const visibleSegments = segments.filter((segment) => segment.amount > 0);
  const hiddenSegments = segments.filter((segment) => segment.amount <= 0 && segment.key !== 'profit' && segment.key !== 'fees' && segment.key !== 'refunds' && segment.key !== 'expenses');
  const barTotal = visibleSegments.reduce((sum, segment) => sum + segment.amount, 0);

  // "37p of every ₦1" — profit as a share of gross revenue (net profit does not include other income).
  const keptShare = grossRevenue > 0 ? netProfit / grossRevenue : null;
  const keptPence = keptShare !== null && keptShare > 0 ? Math.round(keptShare * 100) : null;

  const changeNumber = changeLabel?.match(/^([+-]?)(\d+(?:\.\d+)?)%/);
  const changeText = changeNumber ? `${changeNumber[2]}% vs ${previousLabel}` : changeLabel ?? null;
  const changeColor = changeTone === 'positive' ? palette.limeOnSurface : changeTone === 'negative' ? palette.danger : palette.muted;
  const changeBg = changeTone === 'positive' ? palette.nudgeBg : changeTone === 'negative' ? palette.dangerBg : palette.softFill;
  const ChangeIcon = changeTone === 'positive' ? ArrowUp : changeTone === 'negative' ? ArrowDown : null;

  const cashInBlock = (
    <View style={{ alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 6 }}>
      <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>Total cash in</Text>
      <MoneyText style={{ color: palette.text, fontSize: isMobile ? 20 : 28, letterSpacing: -0.6 }} numberOfLines={1}>{formatMoney(totalCashIn)}</MoneyText>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Net profit ${formatMoney(netProfit)}, ${periodLabel}`}
      style={(state) => ({
        borderRadius: 26,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: isHovered(state) ? palette.cardHover : palette.card,
      })}
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
              Net profit · {periodLabel}
            </Text>
            {loading ? (
              <View style={{ width: 200, height: 44, borderRadius: 12, backgroundColor: palette.softFill }} />
            ) : (
              <MoneyText
                style={{ color: netProfit < 0 ? palette.danger : palette.text, fontSize: 40, lineHeight: 46, letterSpacing: -1.4 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatMoney(netProfit)}
              </MoneyText>
            )}
            {loading ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {keptPence !== null ? (
                  <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>
                    You kept <Text style={{ color: palette.text, fontWeight: '700' }}>{keptPence}p of every {formatMoney(1)}</Text> that came in.
                  </Text>
                ) : netProfit < 0 ? (
                  <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>
                    You spent <Text style={{ color: palette.text, fontWeight: '700' }}>more than you earned</Text> in this period.
                  </Text>
                ) : (
                  <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>No sales in this period yet.</Text>
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
          {cashInBlock}
        </View>

        {/* Where the money went */}
        <View style={{ height: isMobile ? 22 : 30, flexDirection: 'row', gap: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
          {barTotal > 0
            ? visibleSegments.map((segment) => (
              <View key={segment.key} style={{ flexGrow: segment.amount, flexBasis: 0, backgroundColor: segment.color, minWidth: 4 }} />
            ))
            : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: isMobile ? 14 : 28, rowGap: isMobile ? 8 : 10 }}>
          {visibleSegments.map((segment) => (
            <View key={segment.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: isMobile ? 9 : 10, height: isMobile ? 9 : 10, borderRadius: isMobile ? 3 : 4, backgroundColor: segment.color }} />
              <Text style={{ color: palette.muted, fontSize: isMobile ? 10 : 12 }}>
                {segment.label} <Text style={{ color: palette.textSoft }}>{formatMoney(segment.amount)}</Text>
              </Text>
            </View>
          ))}
          <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12 }}>
            {hiddenSegments.map((segment) => `${segment.label} ${formatMoney(segment.amount)}`).join(' · ')}
            {hiddenSegments.length > 0 ? ' · ' : ''}Other income {formatMoney(otherIncome)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
