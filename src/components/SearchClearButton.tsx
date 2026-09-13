import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';

interface SearchClearButtonProps {
  visible: boolean;
  onPress: () => void;
  color?: string;
  backgroundColor?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function SearchClearButton({
  visible,
  onPress,
  color = '#6B7280',
  backgroundColor = 'rgba(107, 114, 128, 0.12)',
  size = 15,
  style,
}: SearchClearButtonProps) {
  if (!visible) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Clear search"
      hitSlop={8}
      onPress={onPress}
      className="items-center justify-center active:opacity-70"
      style={[
        {
          width: 28,
          height: 28,
          borderRadius: 14,
          marginLeft: 6,
          backgroundColor,
        },
        style,
      ]}
    >
      <X size={size} color={color} strokeWidth={2.4} />
    </Pressable>
  );
}
