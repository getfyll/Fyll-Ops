import React from 'react';
import { View, Text, type StyleProp, type TextStyle, type ViewProps } from 'react-native';
import { useThemeColors } from '@/lib/theme';

export function WebPageHeader({
  title,
  subtitle,
  actions,
  titleTextStyle,
  style,
  ...props
}: ViewProps & {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  titleTextStyle?: StyleProp<TextStyle>;
}) {
  const colors = useThemeColors();

  return (
    <View
      {...props}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          position: 'relative',
          zIndex: 1000,
          elevation: 1000,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[{ color: colors.text.primary }, titleTextStyle]}
          className="text-3xl font-bold tracking-tight"
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ color: colors.text.tertiary }}
            className="text-sm mt-1"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', gap: 10, position: 'relative', zIndex: 1001, elevation: 1001 }}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}
