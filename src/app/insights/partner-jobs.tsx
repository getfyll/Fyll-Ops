import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Banknote, Briefcase, CheckCircle2, ChevronRight, Clock, Tag, Wrench } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { SparklineChart } from '@/components/stats/SparklineChart';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

const countBy = <T,>(items: T[], getKey: (item: T) => string | null | undefined) => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item)?.trim();
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

export default function PartnerJobsInsightScreen({ inline }: { inline?: boolean }) {
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

  const dispatchedJobs = useMemo(() => (
    partnerJobs.filter((job) => job.status !== 'awaiting_dispatch')
  ), [partnerJobs]);

  const { start, end } = getDateRange(timeRange);
  const jobsInRange = useMemo(() => (
    dispatchedJobs.filter((job) => {
      const at = new Date(job.dispatchedAt ?? job.createdAt);
      return at >= start && at <= end;
    })
  ), [dispatchedJobs, start, end]);

  const categoryBreakdown = useMemo(() => countBy(jobsInRange, (job) => job.jobType), [jobsInRange]);
  const serviceBreakdown = useMemo(() => countBy(jobsInRange, (job) => job.jobService), [jobsInRange]);

  // Jobs by month — last 6 calendar months, independent of the time-range filter above.
  const jobsByMonth = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({
        key: `${monthStart.getFullYear()}-${monthStart.getMonth()}`,
        label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        start: monthStart,
        end: monthEnd,
      });
    }
    return months.map((month) => ({
      label: month.label,
      value: dispatchedJobs.filter((job) => {
        const at = new Date(job.dispatchedAt ?? job.createdAt);
        return at >= month.start && at < month.end;
      }).length,
    }));
  }, [dispatchedJobs]);

  // Bills — derived from partner jobs grouped by billId, same pattern as the Partners page.
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

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p] as const)), [partners]);
  const partnerBreakdown = useMemo(() => (
    countBy(jobsInRange, (job) => partnerById.get(job.partnerId)?.name ?? 'Unknown partner').slice(0, 8)
  ), [jobsInRange, partnerById]);
  const totalPartnerJobs = partnerBreakdown.reduce((sum, item) => sum + item.value, 0);
  const partnerRows = partnerBreakdown.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: Math.round((item.value / (totalPartnerJobs || 1)) * 100),
  }));

  const topCategory = categoryBreakdown[0];
  const topService = serviceBreakdown[0];

  const content = (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Partner Job Reports"
            subtitle="Category, service, and volume breakdown"
          />
        )}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: isDesktop ? 40 : insets.bottom + 140 }}
        >
          <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <Briefcase size={20} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.tertiary }} className="text-sm font-medium ml-2">
                    Total Jobs Sent
                  </Text>
                </View>
                <Text style={{ color: colors.text.primary }} className="text-4xl font-bold">
                  {jobsInRange.length}
                </Text>
                <View className="flex-row items-center mt-3">
                  <View className="flex-row items-center mr-4">
                    <Tag size={14} color={colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm ml-1.5">
                      {topCategory ? `Top category: ${topCategory.label}` : 'No categories yet'}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center mt-1">
                  <Wrench size={14} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary }} className="text-sm ml-1.5">
                    {topService ? `Top service: ${topService.label}` : 'No services yet'}
                  </Text>
                </View>
              </View>
              {jobsByMonth.some((m) => m.value > 0) && (
                <View className="ml-4">
                  <SparklineChart
                    data={jobsByMonth.map((m) => m.value)}
                    width={100}
                    height={50}
                    strokeColor={colors.bar}
                    strokeWidth={2}
                  />
                </View>
              )}
            </View>
          </View>

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

          {jobsByMonth.some((m) => m.value > 0) && (
            <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.primary }} className={` font-bold mb-4`}>
                Jobs by Month
              </Text>
              <SalesBarChart
                data={jobsByMonth}
                height={160}
                barColor={colors.bar}
                gridColor={colors.barBg}
                textColor={colors.text.tertiary}
                paddingLeft={30}
              />
            </View>
          )}

          <Pressable onPress={() => router.push('/insights/partner-services')} className="mt-4">
            <View className="rounded-2xl p-5" style={colors.getCardStyle()}>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <Tag size={18} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-bold ml-2">Category & Service Breakdown</Text>
                </View>
                <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
              </View>
              <View className="flex-row items-center justify-between py-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <View className="flex-1 mr-3">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>
                    {topCategory ? topCategory.label : 'No categories yet'}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">Top category • {topCategory?.value ?? 0} jobs</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between py-2">
                <View className="flex-1 mr-3">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium" numberOfLines={1}>
                    {topService ? topService.label : 'No services yet'}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">Top service • {topService?.value ?? 0} jobs</Text>
                </View>
              </View>
            </View>
          </Pressable>

          <View className="mt-4">
            <BreakdownTable
              title="Jobs by Partner"
              data={partnerRows}
              columns={{ label: 'Partner', value: 'Jobs', percentage: 'Share' }}
              showIndex
              emptyMessage="No partner jobs yet"
            />
          </View>

          <Pressable onPress={() => router.push('/insights/partner-bills')} className="mt-4">
            <View className="rounded-2xl p-5" style={colors.getCardStyle()}>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <Banknote size={18} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-bold ml-2">Bills & Payments</Text>
                </View>
                <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
              </View>
              <View className="flex-row items-center justify-between py-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Billed this period</Text>
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{formatCurrency(billStats.totalBilled)}</Text>
              </View>
              <View className="flex-row items-center justify-between py-2">
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Paid this period</Text>
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{formatCurrency(billStats.totalPaid)}</Text>
              </View>
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );

  if (isDesktop && !inline) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.screen }}>
        <DesktopSidebar />
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }

  return content;
}
