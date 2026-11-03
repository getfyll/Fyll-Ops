import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LayoutDashboard } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/lib/theme';

export type FocusNavItem = {
  key: string;
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  onPress: () => void;
};

// The bottom nav for pages that are a task of their own (Fyll Print, Finance): a round Home button on the left, then a
// pill with that area's places. The page you are on is highlighted like on the main nav.
export function FocusBottomNav({ items, onHome }: { items: FocusNavItem[]; onHome: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isLight = colors.bg.primary === '#FFFFFF';
  const activeBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)';
  const tabBarHeight = Platform.OS === 'ios' ? 82 : 76;
  const glassStyle = {
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.12)',
    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(24, 24, 24, 0.9)',
    shadowColor: '#000000',
    shadowOpacity: isLight ? 0.14 : 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  };
  const blurIntensity = Platform.OS === 'ios' ? 38 : 26;
  const noWebFocus = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' } as any) : null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 28,
        zIndex: 200,
        elevation: 200,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingBottom: Math.max(14, insets.bottom + 6),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Home"
        onPress={onHome}
        style={{ width: tabBarHeight, height: tabBarHeight, borderRadius: tabBarHeight / 2, ...glassStyle }}
      >
        <BlurView
          intensity={blurIntensity}
          tint={isLight ? 'light' : 'dark'}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 12 : 8 }}
        >
          <View style={{ width: 54, height: 40, marginTop: 2, alignItems: 'center', justifyContent: 'center' }}>
            <LayoutDashboard size={23} color={colors.tabBar.inactive} strokeWidth={2} />
          </View>
          <Text style={{ color: colors.tabBar.inactive, fontSize: 10, fontWeight: '600', lineHeight: 12, height: 12 }}>Home</Text>
        </BlurView>
      </Pressable>
      <View style={{ flex: 1, height: tabBarHeight, borderRadius: 999, ...glassStyle }}>
        <BlurView
          intensity={blurIntensity}
          tint={isLight ? 'light' : 'dark'}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 12 : 8, paddingHorizontal: 6 }}
        >
          {items.map((item) => {
            const color = item.active ? colors.tabBar.active : colors.tabBar.inactive;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: Boolean(item.active) }}
                onPress={item.onPress}
                style={{ flex: 1, height: 62, alignItems: 'center', justifyContent: 'center', ...(noWebFocus ?? {}) }}
              >
                <View style={{ width: 54, height: 40, marginTop: 2, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: item.active ? activeBg : 'transparent' }}>
                  <item.Icon size={23} color={color} strokeWidth={item.active ? 2.5 : 2} />
                </View>
                <Text style={{ color, fontSize: 10, fontWeight: item.active ? '700' : '600', lineHeight: 12, height: 12 }}>{item.label}</Text>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}
