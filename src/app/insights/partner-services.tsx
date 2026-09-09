import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Tag, Wrench } from 'lucide-react-native';
import { DetailHeader } from '@/components/stats/DetailHeader';
import { BreakdownTable } from '@/components/stats/BreakdownTable';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

interface Breakdown {
  label: string;
  jobs: number;
  revenue: number;
}

const groupBy = (items: { key?: string; amount?: number }[]) => {
  const map = new Map<string, { jobs: number; revenue: number }>();
  items.forEach((item) => {
    const key = item.key?.trim();
    if (!key) return;
    const existing = map.get(key) ?? { jobs: 0, revenue: 0 };
    existing.jobs += 1;
    existing.revenue += item.amount ?? 0;
    map.set(key, existing);
  });
  return Array.from(map.entries())
    .map(([label, { jobs, revenue }]) => ({ label, jobs, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
};

export default function PartnerServicesInsightScreen({ inline }: { inline?: boolean }) {
  const colors = useStatsColors();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const partnerJobs = useFyllStore((s) => s.partnerJobs);

  const timeRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'year', label: 'This Year' },
  ];

  const { start, end } = getDateRange(timeRange);
  const jobsInRange = useMemo(() => (
    partnerJobs.filter((job) => {
      if (job.status === 'awaiting_dispatch') return false;
      const at = new Date(job.dispatchedAt ?? job.createdAt);
      return at >= start && at <= end;
    })
  ), [partnerJobs, start, end]);

  const categoryBreakdown: Breakdown[] = useMemo(() => (
    groupBy(jobsInRange.map((job) => ({ key: job.jobType, amount: job.amount })))
  ), [jobsInRange]);

  const serviceBreakdown: Breakdown[] = useMemo(() => (
    groupBy(jobsInRange.map((job) => ({ key: job.jobService, amount: job.amount })))
  ), [jobsInRange]);

  const totalCategoryJobs = categoryBreakdown.reduce((sum, item) => sum + item.jobs, 0);
  const totalServiceJobs = serviceBreakdown.reduce((sum, item) => sum + item.jobs, 0);

  const categoryChartData = categoryBreakdown.slice(0, 8).map((item) => ({
    label: item.label,
    value: item.jobs,
    percentage: Math.round((item.jobs / (totalCategoryJobs || 1)) * 100),
  }));
  const serviceChartData = serviceBreakdown.slice(0, 8).map((item) => ({
    label: item.label,
    value: item.jobs,
    percentage: Math.round((item.jobs / (totalServiceJobs || 1)) * 100),
  }));

  const categoryRows = categoryBreakdown.map((item) => ({
    label: item.label,
    value: formatCurrency(item.revenue),
    subValue: `${item.jobs} ${item.jobs === 1 ? 'job' : 'jobs'} • avg ${formatCurrency(item.jobs ? item.revenue / item.jobs : 0)}`,
  }));
  const serviceRows = serviceBreakdown.map((item) => ({
    label: item.label,
    value: formatCurrency(item.revenue),
    subValue: `${item.jobs} ${item.jobs === 1 ? 'job' : 'jobs'} • avg ${formatCurrency(item.jobs ? item.revenue / item.jobs : 0)}`,
  }));

  const topCategory = categoryBreakdown[0];
  const topService = serviceBreakdown[0];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        {!inline && (
          <DetailHeader
            title="Category & Service Breakdown"
            subtitle="Job volume and revenue by category and service"
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
            <View className="rounded-2xl p-4" style={[colors.getCardStyle(), { flexBasis: '47%', flexGrow: 1 }]}>
              <View className="flex-row items-center mb-2">
                <Tag size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium ml-1.5">Top Category</Text>
              </View>
              <Text style={{ color: colors.text.primary }} className="text-lg font-bold" numberOfLines={1}>
                {topCategory ? topCategory.label : '—'}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                {topCategory ? `${formatCurrency(topCategory.revenue)} • ${topCategory.jobs} jobs` : 'No data yet'}
              </Text>
            </View>
            <View className="rounded-2xl p-4" style={[colors.getCardStyle(), { flexBasis: '47%', flexGrow: 1 }]}>
              <View className="flex-row items-center mb-2">
                <Wrench size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.tertiary }} className="text-xs font-medium ml-1.5">Top Service</Text>
              </View>
              <Text style={{ color: colors.text.primary }} className="text-lg font-bold" numberOfLines={1}>
                {topService ? topService.label : '—'}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                {topService ? `${formatCurrency(topService.revenue)} • ${topService.jobs} jobs` : 'No data yet'}
              </Text>
            </View>
          </View>

          {categoryChartData.length > 0 && (
            <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.primary }} className="font-bold mb-4">
                Jobs by Category
              </Text>
              <HorizontalBarChart
                data={categoryChartData}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
              />
            </View>
          )}

          {serviceChartData.length > 0 && (
            <View className="rounded-2xl p-5 mt-4" style={colors.getCardStyle()}>
              <Text style={{ color: colors.text.primary }} className="font-bold mb-4">
                Jobs by Service
              </Text>
              <HorizontalBarChart
                data={serviceChartData}
                barColor={colors.bar}
                backgroundColor={colors.barBg}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
              />
            </View>
          )}

          <View className="mt-4">
            <BreakdownTable
              title="Categories by Revenue"
              data={categoryRows}
              columns={{ label: 'Category', value: 'Revenue' }}
              showIndex
              emptyMessage="No category data yet"
            />
          </View>

          <View className="mt-4">
            <BreakdownTable
              title="Services by Revenue"
              data={serviceRows}
              columns={{ label: 'Service', value: 'Revenue' }}
              showIndex
              emptyMessage="No service data yet"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
