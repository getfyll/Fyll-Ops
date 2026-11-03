import React from 'react';
import { Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered } from '@/components/payments/payments-ui';

export function GlobalFloatingActions() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/settings' as any)}
      accessibilityLabel="More"
      style={(state) => ({
        position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
        right: 28,
        bottom: 28,
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME,
        shadowColor: '#000000',
        shadowOpacity: isDark ? 0.35 : 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        boxShadow: Platform.OS === 'web' ? '0 10px 28px rgba(0,0,0,0.35)' : undefined,
        elevation: 8,
        zIndex: 9998,
      })}
    >
      <MoreVertical size={22} color={FYLL_LIME_INK} strokeWidth={2.8} />
    </Pressable>
  );
}
