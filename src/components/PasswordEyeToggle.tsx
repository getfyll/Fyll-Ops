import React from 'react';
import { Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';

// The show/hide eye that sits at the end of a password field.
export function PasswordEyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const colors = useThemeColors();
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
        ? <EyeOff size={20} color={colors.text.tertiary} />
        : <Eye size={20} color={colors.text.tertiary} />}
    </Pressable>
  );
}
