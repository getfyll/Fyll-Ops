import React from 'react';
import { Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';

export function GlobalFloatingActions() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const buttonBg = isDark ? '#F4F4F5' : '#111111';
  const iconColor = isDark ? '#111111' : '#FFFFFF';

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/settings' as any)}
      accessibilityLabel="More"
      style={{
        position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
        right: 28,
        bottom: 28,
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: buttonBg,
        shadowColor: '#000000',
        shadowOpacity: isDark ? 0.28 : 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        boxShadow: Platform.OS === 'web' ? (isDark ? '0 8px 22px rgba(255,255,255,0.10)' : '0 8px 22px rgba(17,17,17,0.14)') : undefined,
        elevation: 8,
        zIndex: 9998,
      }}
    >
      <MoreVertical size={22} color={iconColor} strokeWidth={2.8} />
    </Pressable>
  );
}
