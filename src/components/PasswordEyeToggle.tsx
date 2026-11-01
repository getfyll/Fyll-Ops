import React from 'react';
import { Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';

// The show/hide eye that sits at the end of a password field.
export function PasswordEyeToggle({ visible, onToggle, color }: { visible: boolean; onToggle: () => void; color?: string }) {
  const colors = useThemeColors();
  const iconColor = color ?? colors.text.tertiary;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      hitSlop={10}
      className="active:opacity-60"
      style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
    >
      {visible
        ? <EyeOff size={20} color={iconColor} />
        : <Eye size={20} color={iconColor} />}
    </Pressable>
  );
}
