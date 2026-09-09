import React from 'react';
import { Platform, View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, History } from 'lucide-react-native';
import type { AuditLog } from '@/lib/state/fyll-store';
import type { ThemeColors } from '@/lib/theme';
import { getAccuracyPercentage } from './utils';

interface AuditHistoryViewProps {
  isDark: boolean;
  colors: ThemeColors;
  sortedAuditLogs: AuditLog[];
  onBack: () => void;
  onSelectAudit: (auditId: string) => void;
}

const accuracyAccentColor = (discrepancies: number, accuracy: number): string => {
  if (discrepancies === 0) return '#16A34A';
  if (accuracy >= 80) return '#F59E0B';
  return '#EF4444';
};

export function AuditHistoryView({
  isDark,
  colors,
  sortedAuditLogs,
  onBack,
  onSelectAudit,
}: AuditHistoryViewProps) {
  const { width } = useWindowDimensions();
  const isLargeLayout = Platform.OS === 'web' || width >= 768;
  const contentMaxWidth = isLargeLayout ? 920 : undefined;
  const horizontalPadding = isLargeLayout ? 16 : 20;

  const pageBg = isDark ? '#0C0C0D' : colors.bg.primary;
  const surfaceBg = isDark ? '#111113' : colors.bg.secondary;
  const cardBg = isDark ? '#1A1A1E' : colors.bg.card;
  const cardBorder = isDark ? '#3A3A40' : colors.border.light;
  const insetBg = isDark ? '#151518' : colors.bg.secondary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: pageBg }}>
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: horizontalPadding,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={onBack}
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text style={{ color: colors.text.primary }} className="text-xl font-bold">Audit History</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: surfaceBg }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {sortedAuditLogs.length === 0 ? (
          <View
            className="rounded-3xl p-6 items-center"
            style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
          >
            <History size={28} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.primary }} className="font-bold mt-3">No audits yet</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm text-center mt-1">
              Your completed counts will appear here.
            </Text>
          </View>
        ) : (
          sortedAuditLogs.map((log) => {
            const accuracy = getAccuracyPercentage(log.items ?? []);
            const accentColor = accuracyAccentColor(log.discrepancies, accuracy);

            return (
              <Pressable
                key={log.id}
                onPress={() => onSelectAudit(log.id)}
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
                  <Text style={{ color: colors.text.primary }} className="font-bold">
                    {new Date(log.completedAt).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                    {log.itemsAudited} items · {log.performedBy ?? 'Team'}
                  </Text>
                </View>
                <View className="items-end pl-2 pr-1">
                  <Text style={{ color: colors.text.primary }} className="text-base font-bold">{accuracy}%</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                    {log.discrepancies === 0 ? 'no variance' : `${log.discrepancies} off`}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} style={{ marginLeft: 4, marginRight: 12 }} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
