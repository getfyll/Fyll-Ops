import React from 'react';
import { View, Text, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { useInsightsColors } from '@/lib/insights-theme';
import { MoneyText } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

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
  const colors = useInsightsColors();
  const { isMobile } = useBreakpoint();
  const rowSize = isMobile ? 12 : 14;
  const subSize = isMobile ? 10 : 12;

  if (data.length === 0) {
    return (
      <View
        className="rounded-[26px] p-5"
        style={[colors.getCardStyle(), containerStyle]}
      >
        {title && (
          <MoneyText style={{ color: colors.text.primary, fontSize: isMobile ? 16 : 18, letterSpacing: -0.3, marginBottom: 16 }}>{title}</MoneyText>
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
      className="rounded-[26px] p-5"
      style={[colors.getCardStyle(), containerStyle]}
    >
      {title && (
        <MoneyText style={{ color: colors.text.primary, fontSize: isMobile ? 16 : 18, letterSpacing: -0.3, marginBottom: 16 }}>{title}</MoneyText>
      )}

      {/* Table Header */}
      <View
        className="flex-row items-center pb-3 mb-2"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}
      >
        {showIndex && (
          <Text
            style={{ color: colors.text.tertiary, fontSize: subSize }}
            className="font-medium w-8"
          >
            #
          </Text>
        )}
        <Text
          style={{ color: colors.text.tertiary, fontSize: subSize }}
          className="font-medium flex-1"
        >
          {columns.label}
        </Text>
        <Text
          style={{ color: colors.text.tertiary, fontSize: subSize }}
          className="font-medium text-right"
          numberOfLines={1}
        >
          {columns.value}
        </Text>
        {columns.percentage && (
          <Text
            style={{ color: colors.text.tertiary, fontSize: subSize }}
            className="font-medium text-right w-14 ml-3"
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
                style={{ color: colors.text.tertiary, fontSize: rowSize }}
                className="font-medium w-8"
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
                  style={{ color: colors.text.primary, fontSize: rowSize }}
                  className="font-medium"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
              </View>
              {row.subValue && (
                <Text
                  style={{ color: colors.text.tertiary, fontSize: subSize }}
                  className="mt-0.5"
                  numberOfLines={1}
                >
                  {row.subValue}
                </Text>
              )}
            </View>
            <Text
              style={{ color: colors.text.primary, fontSize: rowSize }}
              className="font-semibold text-right"
            >
              {typeof row.value === 'number' ? row.value.toLocaleString() : row.value}
            </Text>
            {row.percentage !== undefined && (
              <View
                className="ml-3 w-14 items-end"
              >
                <View
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: colors.bg.input }}
                >
                  <Text
                    style={{ color: colors.text.secondary, fontSize: subSize }}
                    className="font-medium"
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
