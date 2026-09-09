import React, { useMemo } from 'react';
import { Platform, View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardCheck, History, Play } from 'lucide-react-native';
import type { AuditLog } from '@/lib/state/fyll-store';
import type { ThemeColors } from '@/lib/theme';
import { getAccuracyPercentage, getAuditSummary, getVarianceBreakdown } from './utils';
import { ProgressRing } from './ProgressRing';

interface AuditHomeViewProps {
  colors: ThemeColors;
  isDark: boolean;
  primaryActionBg: string;
  primaryActionText: string;
  skuCount: number;
  lastCompletedLabel: string | null;
  hasActiveAudit: boolean;
  countedItems: number;
  totalItems: number;
  discrepancyCount: number;
  auditStartedAt: string | null;
  performedBy: string;
  sortedAuditLogs: AuditLog[];
  onBack: () => void;
  onStartAudit: () => void;
  onResumeAudit: () => void;
  onDiscardAudit: () => void;
  onOpenHistory: (logId?: string) => void;
}

const formatStartedTime = (isoDate: string): string => {
  const parsedDate = new Date(isoDate);
  return parsedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const monthLabel = (isoDate: string): string => new Date(isoDate).toLocaleDateString('en-US', { month: 'short' });

const accuracyAccentColor = (discrepancies: number, accuracy: number): string => {
  if (discrepancies === 0) return '#16A34A';
  if (accuracy >= 80) return '#F59E0B';
  return '#EF4444';
};

const trendBarColor = (accuracy: number): string => {
  if (accuracy >= 90) return '#86EFAC';
  if (accuracy >= 70) return '#FCD34D';
  return '#FCA5A5';
};

export function AuditHomeView({
  colors,
  isDark,
  primaryActionBg,
  primaryActionText,
  skuCount,
  lastCompletedLabel,
  hasActiveAudit,
  countedItems,
  totalItems,
  discrepancyCount,
  auditStartedAt,
  performedBy,
  sortedAuditLogs,
  onBack,
  onStartAudit,
  onResumeAudit,
  onDiscardAudit,
  onOpenHistory,
}: AuditHomeViewProps) {
  const { width } = useWindowDimensions();
  const isLargeLayout = Platform.OS === 'web' || width >= 768;
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const contentMaxWidth = isDesktopWeb ? 1400 : isLargeLayout ? 920 : undefined;
  const contentAlign = isDesktopWeb ? 'flex-start' : 'center';
  const horizontalPadding = isDesktopWeb ? 20 : isLargeLayout ? 16 : 20;

  const pageBg = isDark ? '#0C0C0D' : '#FFFFFF';
  const surfaceBg = isDark ? '#111113' : '#FFFFFF';
  const cardBg = isDark ? '#1A1A1E' : colors.bg.card;
  const cardBorder = isDark ? '#3A3A40' : colors.border.light;
  const insetBg = isDark ? '#151518' : colors.bg.secondary;
  const progressRatio = totalItems > 0 ? countedItems / totalItems : 0;
  const progressColor = discrepancyCount > 0 ? '#F59E0B' : '#16A34A';

  const lastLog = sortedAuditLogs.length > 0 ? sortedAuditLogs[0] : null;
  const lastAudit = lastLog ? getAuditSummary(lastLog) : null;
  const lastBreakdown = lastLog ? getVarianceBreakdown(lastLog.items ?? []) : null;
  const recentAudits = sortedAuditLogs.slice(0, 6).map((log) => ({ log, summary: getAuditSummary(log) }));

  const previousLog = sortedAuditLogs.length > 1 ? sortedAuditLogs[1] : null;
  const previousAccuracy = previousLog ? getAccuracyPercentage(previousLog.items ?? []) : null;
  const accuracyDelta = lastAudit && previousAccuracy !== null ? lastAudit.accuracy - previousAccuracy : null;
  const skusOffCount = lastBreakdown ? lastBreakdown.short + lastBreakdown.over : 0;

  const neverCounted = useMemo(() => {
    const countedVariantIds = new Set<string>();
    sortedAuditLogs.forEach((log) => {
      (log.items ?? []).forEach((item) => countedVariantIds.add(item.variantId));
    });
    const count = Math.max(0, skuCount - countedVariantIds.size);
    const percent = skuCount > 0 ? Math.round((count / skuCount) * 100) : 0;
    return { count, percent };
  }, [sortedAuditLogs, skuCount]);

  const trend = useMemo(() => {
    return [...sortedAuditLogs]
      .slice(0, 5)
      .reverse()
      .map((log) => ({
        id: log.id,
        month: monthLabel(log.completedAt),
        accuracy: getAccuracyPercentage(log.items ?? []),
      }));
  }, [sortedAuditLogs]);

  const trendDrop = trend.length >= 2 ? trend[0].accuracy - trend[trend.length - 1].accuracy : 0;

  const handleExport = () => {
    const rows = [
      ['Date', 'Performed by', 'Items', 'Accuracy %', 'Units off'],
      ...sortedAuditLogs.map((log) => [
        new Date(log.completedAt).toLocaleDateString('en-US'),
        log.performedBy ?? 'Team',
        String(log.itemsAudited),
        String(getAccuracyPercentage(log.items ?? [])),
        String(log.discrepancies),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory-audit-history.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const desktopHeader = (
    <View>
      <View className="flex-row items-start justify-between">
        <View>
          <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">Inventory Audit</Text>
          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
            {skuCount} SKUs in catalogue{lastCompletedLabel ? ` · last completed ${lastCompletedLabel}` : ''}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Pressable
            onPress={handleExport}
            className="rounded-full items-center justify-center px-5"
            style={{ height: 44, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg }}
          >
            <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Export</Text>
          </Pressable>
          <Pressable
            onPress={onStartAudit}
            className="rounded-full items-center justify-center flex-row px-5"
            style={{ height: 44, backgroundColor: primaryActionBg }}
          >
            <ClipboardCheck size={16} color={primaryActionText} strokeWidth={2.25} />
            <Text style={{ color: primaryActionText }} className="font-bold text-sm ml-2">
              {hasActiveAudit ? 'Restart audit' : 'New audit'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center mt-5" style={{ gap: 24 }}>
        <View className="pb-3" style={{ borderBottomWidth: 2, borderBottomColor: colors.text.primary }}>
          <Text style={{ color: colors.text.primary }} className="text-sm font-bold">Overview</Text>
        </View>
        <Pressable onPress={onResumeAudit} className="pb-3" style={{ borderBottomWidth: 2, borderBottomColor: 'transparent' }}>
          <Text style={{ color: colors.text.tertiary }} className="text-sm font-semibold">Counting</Text>
        </Pressable>
      </View>
    </View>
  );

  const mobileHeader = (
    <View className="flex-row items-center">
      <Pressable
        onPress={onBack}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
      >
        <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
      </Pressable>
      <View>
        <Text style={{ color: colors.text.primary }} className="text-xl font-bold">Inventory Audit</Text>
        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{skuCount} SKUs ready</Text>
      </View>
    </View>
  );

  const headerContent = isDesktopWeb ? desktopHeader : mobileHeader;

  const inProgressCard = hasActiveAudit ? (
    <View
      className="rounded-3xl p-5 mb-4"
      style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2A2E' }}
    >
      <View className="flex-row items-center justify-between">
        <View>
          <Text style={{ color: '#9A9AA0' }} className="text-xs font-bold uppercase tracking-widest">In progress</Text>
          <Text style={{ color: '#FFFFFF' }} className="text-xl font-bold mt-1">{countedItems} of {totalItems} counted</Text>
          {auditStartedAt ? (
            <Text style={{ color: '#8A8A90' }} className="text-xs mt-1">
              Started {formatStartedTime(auditStartedAt)} · by {performedBy}
            </Text>
          ) : null}
        </View>
        <ProgressRing
          progress={progressRatio}
          progressColor={progressColor}
          trackColor="#2E2E32"
          label={`${Math.round(progressRatio * 100)}%`}
          labelColor="#FFFFFF"
        />
      </View>
      <View className="h-1.5 rounded-full mt-4" style={{ backgroundColor: '#2A2A2E' }}>
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${totalItems > 0 ? Math.min(100, Math.round((countedItems / totalItems) * 100)) : 0}%`,
            backgroundColor: progressColor,
          }}
        />
      </View>
      <View className="flex-row items-center mt-4" style={{ gap: 10 }}>
        <Pressable
          onPress={onResumeAudit}
          className="rounded-full items-center justify-center flex-row"
          style={{ height: 50, backgroundColor: '#FFFFFF', paddingHorizontal: 24 }}
        >
          <Play size={15} color="#111111" strokeWidth={2.25} />
          <Text style={{ color: '#111111' }} className="font-bold ml-2">Resume counting</Text>
        </Pressable>
        <Pressable
          onPress={onDiscardAudit}
          className="rounded-full items-center justify-center px-5"
          style={{ height: 50, borderWidth: 1, borderColor: '#3A3A40' }}
        >
          <Text style={{ color: '#D0D0D4' }} className="font-semibold">Discard</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const varianceRows = lastBreakdown ? [
    { label: 'Short — fewer on shelf', count: lastBreakdown.short, dot: '#EF4444' },
    { label: 'Over — more on shelf', count: lastBreakdown.over, dot: '#F59E0B' },
    { label: 'Matched exactly', count: lastBreakdown.matched, dot: '#22C55E' },
  ] : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: pageBg }}>
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: contentAlign,
            paddingHorizontal: horizontalPadding,
            paddingTop: isDesktopWeb ? 24 : 16,
            paddingBottom: isDesktopWeb ? 0 : 12,
          }}
        >
          {headerContent}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: surfaceBg }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: contentAlign,
          paddingHorizontal: horizontalPadding,
          paddingTop: 16,
          paddingBottom: 36,
        }}
        showsVerticalScrollIndicator={false}
      >
        {inProgressCard}

        {isDesktopWeb ? (
          lastAudit && lastBreakdown ? (
            <>
              <View className="flex-row mb-4" style={{ gap: 14 }}>
                <View className="flex-1 rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest">Last accuracy</Text>
                  <Text
                    className="text-3xl font-bold mt-2"
                    style={{ color: accuracyAccentColor(lastAudit.discrepancies, lastAudit.accuracy) }}
                  >
                    {lastAudit.accuracy}%
                  </Text>
                  {accuracyDelta !== null && previousLog ? (
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                      {accuracyDelta === 0 ? 'unchanged' : `${accuracyDelta > 0 ? 'up' : 'down'} ${Math.abs(accuracyDelta)} pts`} from {monthLabel(previousLog.completedAt)}
                    </Text>
                  ) : (
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">first recorded audit</Text>
                  )}
                </View>

                <View className="flex-1 rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest">Units off</Text>
                  <Text style={{ color: colors.text.primary }} className="text-3xl font-bold mt-2">{lastAudit.discrepancies}</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">across {skusOffCount} SKUs</Text>
                </View>

                <View className="flex-1 rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest">Never counted</Text>
                  <Text style={{ color: colors.text.primary }} className="text-3xl font-bold mt-2">{neverCounted.count}</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">{neverCounted.percent}% of catalogue</Text>
                </View>
              </View>

              <View className="flex-row mb-6 items-stretch" style={{ gap: 14 }}>
                <View style={{ flex: 1.5 }}>
                  <View style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, borderRadius: 16, padding: 20, flex: 1 }}>
                    <Text style={{ color: colors.text.primary }} className="text-base font-bold mb-4">Accuracy trend</Text>
                    {trend.length > 0 ? (
                      <>
                        <View className="flex-row items-end" style={{ height: 140, gap: 12 }}>
                          {trend.map((point) => (
                            <View key={point.id} className="flex-1 items-center">
                              <Text style={{ color: colors.text.primary }} className="text-xs font-bold mb-1.5">{point.accuracy}%</Text>
                              <View
                                style={{
                                  width: '100%',
                                  height: Math.max(8, Math.round((point.accuracy / 100) * 110)),
                                  borderTopLeftRadius: 8,
                                  borderTopRightRadius: 8,
                                  backgroundColor: trendBarColor(point.accuracy),
                                }}
                              />
                            </View>
                          ))}
                        </View>
                        <View className="flex-row mt-2" style={{ gap: 12 }}>
                          {trend.map((point) => (
                            <View key={point.id} className="flex-1 items-center">
                              <Text style={{ color: colors.text.tertiary }} className="text-xs">{point.month}</Text>
                            </View>
                          ))}
                        </View>
                        {trendDrop > 0 ? (
                          <View
                            className="rounded-2xl px-4 py-3 mt-4 flex-row items-start"
                            style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}
                          >
                            <AlertTriangle size={16} color="#B45309" strokeWidth={2} style={{ marginTop: 1 }} />
                            <Text style={{ color: '#B45309' }} className="text-xs font-semibold ml-2 flex-1">
                              Accuracy has dropped {trendDrop} points since {trend[0].month}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Text style={{ color: colors.text.tertiary }} className="text-sm">Not enough audits yet to chart a trend.</Text>
                    )}
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, borderRadius: 16, padding: 20, flex: 1 }}>
                    <Text style={{ color: colors.text.primary }} className="text-base font-bold mb-3">Last audit breakdown</Text>
                    {varianceRows.map((row, index) => (
                      <Pressable
                        key={row.label}
                        onPress={() => onOpenHistory(lastAudit.id)}
                        className="flex-row items-center justify-between py-2.5"
                        style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                      >
                        <View className="flex-row items-center">
                          <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: row.dot }} />
                          <Text style={{ color: colors.text.secondary }} className="text-sm">{row.label}</Text>
                        </View>
                        <View className="flex-row items-center">
                          <Text style={{ color: colors.text.primary }} className="text-sm font-bold mr-1">{row.count}</Text>
                          <ChevronRight size={14} color={colors.text.muted} strokeWidth={2} />
                        </View>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => onOpenHistory(lastAudit.id)}
                      className="rounded-full items-center justify-center mt-3"
                      style={{ height: 44, backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-bold">View full variance report</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <View
              className="rounded-2xl p-5 mb-6"
              style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <Text style={{ color: colors.text.primary }} className="text-lg font-bold">No audits yet</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">Start your first stock count to create a baseline.</Text>
            </View>
          )
        ) : lastAudit && lastBreakdown ? (
          <>
            <View
              className="rounded-3xl p-5 mb-4"
              style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <View className="flex-row items-center justify-between">
                <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest">Last completed audit</Text>
                {lastAudit.discrepancies > 0 ? (
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                    <Text className="text-xs font-bold" style={{ color: '#DC2626' }}>{lastAudit.discrepancies} units off</Text>
                  </View>
                ) : (
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                    <Text className="text-xs font-bold" style={{ color: '#15803D' }}>No variance</Text>
                  </View>
                )}
              </View>

              <Text style={{ color: colors.text.primary }} className="text-4xl font-bold mt-2">{lastAudit.accuracy}%</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                accuracy · {lastAudit.itemsAudited} items · {lastAudit.performedBy}
              </Text>

              <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: cardBorder }}>
                {varianceRows.map((row, index) => (
                  <Pressable
                    key={row.label}
                    onPress={() => onOpenHistory(lastAudit.id)}
                    className="flex-row items-center justify-between py-2.5"
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                  >
                    <View className="flex-row items-center">
                      <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: row.dot }} />
                      <Text style={{ color: colors.text.secondary }} className="text-sm">{row.label}</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-bold mr-1">{row.count} SKUs</Text>
                      <ChevronRight size={14} color={colors.text.muted} strokeWidth={2} />
                    </View>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => onOpenHistory(lastAudit.id)}
                className="flex-row items-center justify-between pt-3 mt-1"
                style={{ borderTopWidth: 1, borderTopColor: cardBorder }}
              >
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold">View full variance report</Text>
                <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
            </View>

            <View
              className="rounded-3xl p-5 mb-4"
              style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <Text style={{ color: colors.text.primary }} className="text-base font-bold mb-4">Accuracy trend</Text>
              {trend.length > 0 ? (
                <>
                  <View className="flex-row items-end" style={{ height: 104, gap: 8 }}>
                    {trend.map((point) => (
                      <View key={point.id} className="flex-1 items-center">
                        <Text style={{ color: colors.text.primary }} className="text-[11px] font-bold mb-1.5">{point.accuracy}%</Text>
                        <View
                          style={{
                            width: '100%',
                            height: Math.max(8, Math.round((point.accuracy / 100) * 78)),
                            borderTopLeftRadius: 7,
                            borderTopRightRadius: 7,
                            backgroundColor: trendBarColor(point.accuracy),
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  <View className="flex-row mt-2" style={{ gap: 8 }}>
                    {trend.map((point) => (
                      <View key={point.id} className="flex-1 items-center">
                        <Text style={{ color: colors.text.tertiary }} className="text-[11px]">{point.month}</Text>
                      </View>
                    ))}
                  </View>
                  {trendDrop > 0 ? (
                    <View
                      className="rounded-2xl px-3 py-2.5 mt-4 flex-row items-start"
                      style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.24)' }}
                    >
                      <AlertTriangle size={15} color="#B45309" strokeWidth={2} style={{ marginTop: 1 }} />
                      <Text style={{ color: '#B45309' }} className="text-xs font-semibold ml-2 flex-1">
                        Accuracy has dropped {trendDrop} points since {trend[0].month}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Not enough audits yet to chart a trend.</Text>
              )}
            </View>
          </>
        ) : (
          <View
            className="rounded-3xl p-5 mb-4"
            style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
          >
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold">No audits yet</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">Start your first stock count to create a baseline.</Text>
          </View>
        )}

        {!isDesktopWeb ? (
          <Pressable
            onPress={onStartAudit}
            className="rounded-2xl p-4 flex-row items-center mb-6"
            style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
          >
            <View
              className="w-11 h-11 rounded-xl items-center justify-center mr-3"
              style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <ClipboardCheck size={20} color={colors.text.primary} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.text.primary }} className="font-bold text-base">
                {hasActiveAudit ? 'Restart audit' : 'Start a new audit'}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">Full count, by category, or by location</Text>
            </View>
            <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} />
          </Pressable>
        ) : null}

        <View className="flex-row items-center justify-between mb-3">
          <Text style={{ color: colors.text.primary }} className="text-base font-bold">Recent audits</Text>
          {!isDesktopWeb ? (
            <Pressable onPress={() => onOpenHistory()}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold">View all</Text>
            </Pressable>
          ) : null}
        </View>

        {recentAudits.length === 0 ? (
          <View
            className="rounded-2xl p-4 flex-row items-center"
            style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
          >
            <History size={18} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.tertiary }} className="text-sm ml-2">Audit history appears here after first count.</Text>
          </View>
        ) : isDesktopWeb ? (
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
            <View className="flex-row px-5 py-3" style={{ borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: isDark ? cardBg : '#FFFFFF' }}>
              <Text style={{ color: colors.text.tertiary, flex: 2 }} className="text-xs font-bold uppercase tracking-wide">Date</Text>
              <Text style={{ color: colors.text.tertiary, flex: 1.4 }} className="text-xs font-bold uppercase tracking-wide">Performed by</Text>
              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-xs font-bold uppercase tracking-wide">Items</Text>
              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-xs font-bold uppercase tracking-wide text-right">Accuracy</Text>
              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-xs font-bold uppercase tracking-wide text-right">Off</Text>
            </View>
            {recentAudits.map(({ log, summary }, index) => {
              const accentColor = accuracyAccentColor(summary.discrepancies, summary.accuracy);
              return (
                <Pressable
                  key={log.id}
                  onPress={() => onOpenHistory(log.id)}
                  className="flex-row items-center px-5 py-3.5"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                >
                  <View style={{ flex: 2 }} className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: accentColor }} />
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{summary.dateLabel}</Text>
                  </View>
                  <Text style={{ color: colors.text.secondary, flex: 1.4 }} className="text-sm">{summary.performedBy}</Text>
                  <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm">{summary.itemsAudited}</Text>
                  <Text style={{ color: colors.text.primary, flex: 1 }} className="text-sm font-bold text-right">{summary.accuracy}%</Text>
                  <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-sm text-right">
                    {summary.discrepancies === 0 ? '—' : summary.discrepancies}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View>
            {recentAudits.map(({ log, summary }) => {
              const accentColor = accuracyAccentColor(summary.discrepancies, summary.accuracy);
              return (
                <Pressable
                  key={log.id}
                  onPress={() => onOpenHistory(log.id)}
                  className="flex-row items-center rounded-2xl mb-2.5"
                  style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <View
                    style={{
                      width: 4,
                      borderRadius: 2,
                      alignSelf: 'stretch',
                      marginVertical: 14,
                      marginLeft: 14,
                      backgroundColor: accentColor,
                    }}
                  />
                  <View className="flex-1 px-4 py-3.5">
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{summary.dateLabel}</Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                      {summary.itemsAudited} items · {summary.performedBy}
                    </Text>
                  </View>
                  <View className="items-end px-4">
                    <Text style={{ color: colors.text.primary }} className="text-base font-bold">{summary.accuracy}%</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                      {summary.discrepancies === 0 ? 'no variance' : `${summary.discrepancies} off`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
