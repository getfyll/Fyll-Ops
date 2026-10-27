import { formatPersonName } from '@/lib/display-format';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Clock, Wallet } from 'lucide-react-native';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { SkeletonBox } from '@/components/SkeletonLoader';
import { HOME_BUTTON_TEXT_STYLE, HomeCard, HomeCta, HomeLink } from '@/components/home/home-ui';
import { formatCurrency } from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';

// Home: how much has been collected, with the one action people come here for — a new payment.
export type RecentPaymentLine = { id: string; name: string; amount: number; status: string };

const toneFor = (status: string): 'verified' | 'awaiting' | 'rejected' | 'closed' => {
  const key = status.toLowerCase();
  if (['verified', 'confirmed', 'payment confirmed', 'paid'].includes(key)) return 'verified';
  if (['rejected', 'failed', 'declined'].includes(key)) return 'rejected';
  if (['cancelled', 'canceled', 'expired', 'closed', 'refunded'].includes(key)) return 'closed';
  return 'awaiting';
};

export function PaymentsCollectedCard({
  recentPayments,
  pendingCount = 0,
  collectedToday,
  collectedWeek,
  awaitingCount,
  loading = false,
  onNewPayment,
  onOpen,
  onReview,
}: {
  recentPayments?: RecentPaymentLine[];
  pendingCount?: number;
  collectedToday: number;
  collectedWeek: number;
  awaitingCount: number;
  loading?: boolean;
  onNewPayment: () => void;
  onOpen: () => void;
  onReview: () => void;
}) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const headlineSize = isMobile ? 28 : 24;

  return (
    <HomeCard style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
          <Wallet size={19} color={palette.limeOnSurface} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>Payments</Text>
          <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>Collected today</Text>
        </View>
        <Pressable
          onPress={onReview}
          accessibilityLabel={`${pendingCount} pending payments in the last 3 days`}
          className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: pendingCount > 0 ? palette.warnBorder : palette.border, backgroundColor: pendingCount > 0 ? palette.warnBg : palette.softFill }}
        >
          <Clock size={12} color={pendingCount > 0 ? palette.warn : palette.faint} strokeWidth={2.2} />
          <Text style={{ color: pendingCount > 0 ? palette.warn : palette.faint, fontSize: isMobile ? 10 : 12, fontWeight: '700' }}>{pendingCount} pending</Text>
        </Pressable>
        <HomeLink onPress={onOpen} />
      </View>

      <View style={{ gap: 4 }}>
        {loading ? (
          <SkeletonBox width="50%" height={headlineSize} rounded="md" />
        ) : (
          <MoneyText style={{ color: palette.text, fontSize: headlineSize, letterSpacing: -0.4 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(collectedToday)}
          </MoneyText>
        )}
        <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>
          {loading ? ' ' : `${formatCurrency(collectedWeek)} in the last 7 days`}
        </Text>
      </View>

      {recentPayments && recentPayments.length > 0 ? (
        <View style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          {recentPayments.map((payment, index) => {
            const tone = palette.tones[toneFor(payment.status)];
            return (
              <View
                key={payment.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: index === 0 ? 0 : 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
              >
                <Text style={{ flex: 1, minWidth: 0, color: palette.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{formatPersonName(payment.name)}</Text>
                <MoneyText style={{ color: palette.text, fontSize: 13 }} numberOfLines={1}>{formatCurrency(payment.amount)}</MoneyText>
                <Text style={{ width: 72, textAlign: 'right', color: tone.ink, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{payment.status}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {awaitingCount > 0 ? (
        <Pressable
          onPress={onReview}
          className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.warnBorder, backgroundColor: palette.warnBg }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warn }} />
          <Text style={[HOME_BUTTON_TEXT_STYLE, { color: palette.warn, flex: 1 }]} numberOfLines={1}>
            {awaitingCount} {awaitingCount === 1 ? 'payment' : 'payments'} waiting for your approval
          </Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <HomeCta label="New payment" onPress={onNewPayment} />
      </View>
    </HomeCard>
  );
}
