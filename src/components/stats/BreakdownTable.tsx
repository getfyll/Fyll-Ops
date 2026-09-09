import React from 'react';
import { View, Text, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { useStatsColors } from '@/lib/theme';

interface BreakdownRow {
  label: string;
  value: string | number;
  subValue?: string;
  percentage?: number;
  color?: string;
}

interface BreakdownTableProps {
  title?: string;
  data: BreakdownRow[];
  columns?: {
    label: string;
    value: string;
    subValue?: string;
    percentage?: string;
  };
  showIndex?: boolean;
  emptyMessage?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function BreakdownTable({
  title,
  data,
  columns = {
    label: 'Name',
    value: 'Value',
    percentage: 'Share',
  },
  showIndex = false,
  emptyMessage = 'No data available',
  containerStyle,
}: BreakdownTableProps) {
  const colors = useStatsColors();

  if (data.length === 0) {
    return (
      <View
        className="rounded-2xl p-5"
        style={[colors.getCardStyle(), containerStyle]}
      >
        {title && (
          <Text
            style={{ color: colors.text.primary }}
            className="text-lg font-bold mb-4"
          >
            {title}
          </Text>
        )}
        <Text
          style={{ color: colors.text.tertiary }}
          className="text-sm text-center py-8"
        >
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="rounded-2xl p-5"
      style={[colors.getCardStyle(), containerStyle]}
    >
      {title && (
        <Text
          style={{ color: colors.text.primary }}
          className="text-lg font-bold mb-4"
        >
          {title}
        </Text>
      )}

      {/* Table Header */}
      <View
        className="flex-row items-center pb-3 mb-2"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}
      >
        {showIndex && (
          <Text
            style={{ color: colors.text.tertiary }}
            className="text-xs font-medium w-8"
          >
            #
          </Text>
        )}
        <Text
          style={{ color: colors.text.tertiary }}
          className="text-xs font-medium flex-1"
        >
          {columns.label}
        </Text>
        <Text
          style={{ color: colors.text.tertiary }}
          className="text-xs font-medium text-right"
          numberOfLines={1}
        >
          {columns.value}
        </Text>
        {columns.percentage && (
          <Text
            style={{ color: colors.text.tertiary }}
            className="text-xs font-medium text-right w-14 ml-3"
          >
            {columns.percentage}
          </Text>
        )}
      </View>

      {/* Table Rows */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 400 }}
      >
        {data.map((row, index) => (
          <View
            key={`${row.label}-${index}`}
            className="flex-row items-center py-3"
            style={{
              borderBottomWidth: index < data.length - 1 ? 1 : 0,
              borderBottomColor: colors.divider,
            }}
          >
            {showIndex && (
              <Text
                style={{ color: colors.text.tertiary }}
                className="text-sm font-medium w-8"
              >
                {index + 1}
              </Text>
            )}
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                {row.color && (
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                <Text
                  style={{ color: colors.text.primary }}
                  className="text-sm font-medium"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
              </View>
              {row.subValue && (
                <Text
                  style={{ color: colors.text.tertiary }}
                  className="text-xs mt-0.5"
                  numberOfLines={1}
                >
                  {row.subValue}
                </Text>
              )}
            </View>
            <Text
              style={{ color: colors.text.primary }}
              className="text-sm font-semibold text-right"
            >
              {typeof row.value === 'number' ? row.value.toLocaleString() : row.value}
            </Text>
            {row.percentage !== undefined && (
              <View
                className="ml-3 w-14 items-end"
              >
                <View
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: colors.bg.input }}
                >
                  <Text
                    style={{ color: colors.text.secondary }}
                    className="text-xs font-medium"
                  >
                    {row.percentage}%
                  </Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
