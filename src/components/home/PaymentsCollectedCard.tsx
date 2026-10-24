import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { SkeletonBox } from '@/components/SkeletonLoader';
import { HOME_BUTTON_TEXT_STYLE, HomeCard, HomeCta, HomeLink } from '@/components/home/home-ui';
import { formatCurrency } from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';

// Home: how much has been collected, with the one action people come here for — a new payment.
export function PaymentsCollectedCard({
  collectedToday,
  collectedWeek,
  awaitingCount,
  loading = false,
  onNewPayment,
  onOpen,
  onReview,
}: {
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
