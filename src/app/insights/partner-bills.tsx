import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { AlertTriangle, Banknote, CheckCircle2, Clock } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

const OVERDUE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

export default function PartnerBillsInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const partners = useFyllStore((s) => s.partners);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p] as const)), [partners]);

  const submittedBills = useMemo(() => {
    const byBillId = new Map<string, typeof partnerJobs>();
    partnerJobs.forEach((job) => {
      if (!job.billId) return;
      const list = byBillId.get(job.billId) ?? [];
      list.push(job);
      byBillId.set(job.billId, list);
    });
    const bills: { billId: string; partnerId: string; total: number; status: string; submittedAt: string; paidAt?: string }[] = [];
    byBillId.forEach((jobs, billId) => {
      const first = jobs[0];
      bills.push({
        billId,
        partnerId: first.partnerId,
        total: jobs.reduce((sum, job) => sum + (job.amount ?? 0), 0),
        status: first.billStatus ?? 'pending',
        submittedAt: first.billSubmittedAt ?? first.createdAt,
        paidAt: first.billPaidAt,
      });
    });
    return bills.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [partnerJobs]);

  const { start, end } = getDateRange(timeRange);
  const billsInRange = useMemo(() => (
    submittedBills.filter((bill) => {
      const at = new Date(bill.submittedAt);
      return at >= start && at <= end;
    })
  ), [submittedBills, start, end]);

  const billStats = useMemo(() => {
    const totalBilled = billsInRange.reduce((sum, bill) => sum + bill.total, 0);
    const paidBills = billsInRange.filter((bill) => bill.status === 'paid');
    const totalPaid = paidBills.reduce((sum, bill) => sum + bill.total, 0);
    const totalPending = totalBilled - totalPaid;
    return { totalBills: billsInRange.length, totalBilled, totalPaid, totalPending };
  }, [billsInRange]);

  const overdueBills = useMemo(() => (
    billsInRange.filter((bill) => (
      bill.status !== 'paid' && bill.status !== 'rejected'
      && Date.now() - new Date(bill.submittedAt).getTime() > OVERDUE_WINDOW_MS
    ))
  ), [billsInRange]);

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    billsInRange.forEach((bill) => counts.set(bill.status, (counts.get(bill.status) ?? 0) + 1));
    const total = billsInRange.length || 1;
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label: statusLabel(label), value, percentage: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [billsInRange]);

  // Bills by month — last 6 calendar months, independent of the time-range filter above.
  const billsByMonth = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({ label: monthStart.toLocaleDateString('en-US', { month: 'short' }), start: monthStart, end: monthEnd });
    }
    return months.map((month) => ({
      label: month.label,
      value: submittedBills
        .filter((bill) => {
          const at = new Date(bill.submittedAt);
          return at >= month.start && at < month.end;
        })
        .reduce((sum, bill) => sum + bill.total, 0),
    }));
  }, [submittedBills]);

  const billRows = billsInRange.map((bill) => ({
    label: partnerById.get(bill.partnerId)?.name ?? 'Unknown partner',
    value: formatCurrency(bill.total),
    subValue: `${statusLabel(bill.status)} • ${new Date(bill.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  }));

  const overdueRows = overdueBills.map((bill) => ({
    label: partnerById.get(bill.partnerId)?.name ?? 'Unknown partner',
    value: formatCurrency(bill.total),
    subValue: `${statusLabel(bill.status)} • submitted ${new Date(bill.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Bills & Payments"
            subtitle="Payment status, trends, and overdue bills"
          />
        )}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: isDesktop ? 40 : insets.bottom + 140 }}
        >
          <View className="flex-row mt-4">
            {timeRangeOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => setTimeRange(option.key)}
                className="mr-2 px-4 py-2 rounded-full"
                style={{ backgroundColor: timeRange === option.key ? colors.bar : colors.bg.input }}
              >
                <Text
                  style={{ color: timeRange === option.key ? colors.bg.screen : colors.text.tertiary, fontSize: 10 }}
                  className="font-semibold"
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row flex-wrap mt-4" style={{ gap: 12 }}>
            {[
              { label: 'Total Bills', value: String(billStats.totalBills), icon: Banknote },
              { label: 'Total Billed', value: formatCurrency(billStats.totalBilled), icon: Banknote },
              { label: 'Total Paid', value: formatCurrency(billStats.totalPaid), icon: CheckCircle2 },
              { label: 'Pending Payment', value: formatCurrency(billStats.totalPending), icon: Clock },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <View
                  key={stat.label}
                  className="rounded-2xl p-4"
                  style={[colors.getCardStyle(), { flexBasis: '47%', flexGrow: 1 }]}
                >
                  <View className="flex-row items-center mb-2">
                    <Icon size={16} color={colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium ml-1.5">
                      {stat.label}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>
                    {stat.value}
                  </Text>
                </View>
              );
            })}
          </View>

          {overdueBills.length > 0 && (
            <View className="rounded-2xl p-5 mt-4" style={[colors.getCardStyle(), { borderColor: colors.warning, borderWidth: 1 }]}>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <AlertTriangle size={18} color={colors.warning} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-bold ml-2">Overdue Bills</Text>
                </View>
                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: colors.warning + '20' }}>
                  <Text style={{ color: colors.warning }} className="text-xs font-bold">{overdueBills.length}</Text>
                </View>
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mb-2">
                Bills submitted more than 5 days ago that haven't been paid.
              </Text>
              {overdueRows.slice(0, 3).map((row, index) => (
                <View
                  key={`${row.label}-${index}`}
                  className="flex-row items-center justify-between py-2"
                  style={{ borderTopWidth: index === 0 ? 1 : 0, borderTopColor: colors.divider }}
                >
                  <View className="flex-1 mr-3">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>{row.label}</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{row.subValue}</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {billsByMonth.some((m) => m.value > 0) && (
            <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.primary }} className="font-bold mb-4">
                Bills by Month
              </Text>
              <SalesBarChart
                data={billsByMonth}
                height={160}
                barColor={colors.success}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
                paddingLeft={30}
              />
            </View>
          )}

          {statusBreakdown.length > 0 && (
            <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.primary }} className="font-bold mb-4">
                Bills by Status
              </Text>
              <HorizontalBarChart
                data={statusBreakdown}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
              />
            </View>
          )}

          <View className="mt-4">
            <BreakdownTable
              title="All Bills"
              data={billRows}
              columns={{ label: 'Partner', value: 'Amount' }}
              showIndex
              emptyMessage="No bills submitted yet"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
