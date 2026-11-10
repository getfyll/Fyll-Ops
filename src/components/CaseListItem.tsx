import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useThemeColors } from '@/lib/theme';
import useFyllStore, { CASE_STATUS_COLORS } from '@/lib/state/fyll-store';
import type { Case } from '@/lib/state/fyll-store';

interface CaseListItemProps {
  caseItem: Case;
  onPress: () => void;
  index?: number;
  compact?: boolean;
}

export function CaseListItem({ caseItem, onPress, index = 0, compact = false }: CaseListItemProps) {
  const colors = useThemeColors();
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const matchedStatus = caseStatuses.find((status) => status.name === caseItem.status);
  const statusColor = matchedStatus?.color ?? CASE_STATUS_COLORS[caseItem.status] ?? colors.text.muted;

  const formattedDate = new Date(caseItem.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: compact ? undefined : 'numeric',
  });

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        className="rounded-xl px-5 py-4 mb-3 border active:opacity-80"
        style={{
          backgroundColor: colors.bg.card,
          borderColor: colors.border.light,
        }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text.primary }} className="text-base font-bold">
              {caseItem.customerName}
            </Text>
            <View className="flex-row items-center gap-3 mt-2">
              <Text style={{ color: colors.text.primary, fontWeight: '700' }} className="text-xs">
                {caseItem.caseNumber}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold">
                {formattedDate}
              </Text>
            </View>
          </View>
          <View
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '30' }}
          >
            <Text style={{ color: statusColor }} className="text-[10px] font-bold uppercase tracking-wider">
              {caseItem.status}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View>
      <Pressable
        onPress={onPress}
        className="rounded-xl px-5 py-4 mb-3 active:opacity-80"
        style={{
          backgroundColor: colors.bg.card,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold">
              {caseItem.customerName}
            </Text>
            <View className="flex-row items-center gap-3 mt-2">
              <Text style={{ color: colors.text.primary, fontWeight: '700' }} className="text-xs">
                {caseItem.caseNumber}
              </Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold">
                {formattedDate}
              </Text>
            </View>
          </View>
          <View
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '30' }}
          >
            <Text style={{ color: statusColor }} className="text-[10px] font-bold uppercase tracking-wider">
              {caseItem.status}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default CaseListItem;
