import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Box, Briefcase, Check, ClipboardCheck, Menu, Package, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

type InventorySection = 'products' | 'services' | 'warehouse';
type InventoryMenuOption = InventorySection | 'audit';

type InventoryMobileFabProps = {
  currentSection: InventorySection;
  visible?: boolean;
  lowerBy?: number;
  onSelectProducts?: () => void;
  onSelectServices?: () => void;
  onSelectWarehouse?: () => void;
};

const OPEN = { duration: 300, easing: Easing.out(Easing.cubic) } as const;
const CLOSE = { duration: 200, easing: Easing.in(Easing.quad) } as const;
const FAB_SIZE = 56;

const OPTIONS: { key: InventoryMenuOption; label: string; subtitle: string; icon: LucideIcon }[] = [
  { key: 'products', label: 'Products', subtitle: 'Items you sell, with variants and stock', icon: Package },
  { key: 'services', label: 'Services', subtitle: 'Work you do for customers', icon: Briefcase },
  { key: 'warehouse', label: 'Warehouse', subtitle: 'Where your stock is kept', icon: Box },
  { key: 'audit', label: 'Audit', subtitle: 'Count stock and fix differences', icon: ClipboardCheck },
];

// The Inventory menu button. It shares the motion of Home's plus-button sheet: the sheet rises and the actions glide
// in one after another, the button turns into a close button, and the sheet can be dragged down to dismiss.
export function InventoryMobileFab({
  currentSection,
  visible = true,
  lowerBy = 0,
  onSelectProducts,
  onSelectServices,
  onSelectWarehouse,
}: InventoryMobileFabProps) {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const reduced = useReducedMotion();
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const [fontLoaded] = useFonts({ BricolageGrotesque_600SemiBold });
  const titleFont = fontLoaded ? ({ fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' } as const) : ({ fontWeight: '600' } as const);
  const [open, setOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Same spot as the plus buttons on Home and Orders.
  const fabBottom = Math.max(96 - lowerBy, tabBarHeight - 48 - lowerBy);

  const finishClose = useCallback(() => {
    setMounted(false);
    dragY.value = 0;
  }, [dragY]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = reduced ? 1 : withTiming(1, OPEN);
      return;
    }
    if (!mounted) return;
    if (reduced) {
      progress.value = 0;
      finishClose();
      return;
    }
    progress.value = withTiming(0, CLOSE, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    // `mounted` is deliberately not a dependency: this only reacts to opening or closing the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeMenu = useCallback(() => setOpen(false), []);

  // Only the grab area at the top of the sheet listens for the drag, so tapping the rows is never affected.
  const drag = Gesture.Pan()
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 70 || event.velocityY > 700) {
        runOnJS(closeMenu)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * (1 - Math.min(dragY.value / 400, 0.6)) }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 36 + dragY.value }, { scale: 0.96 + 0.04 * progress.value }],
  }));
  const menuIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));
  const closeIconStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ rotate: `${(1 - progress.value) * -90}deg` }],
  }));

  const options = useMemo(() => OPTIONS, []);

  if (!visible) return null;

  const handleSelect = (section: InventoryMenuOption) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen(false);

    if (section === currentSection) return;

    if (section === 'audit') {
      router.push('/inventory-audit');
      return;
    }

    if (section === 'products') {
      if (onSelectProducts) {
        onSelectProducts();
        return;
      }
      router.push('/inventory');
      return;
    }

    if (section === 'services') {
      if (onSelectServices) {
        onSelectServices();
        return;
      }
      router.push('/services');
      return;
    }

    if (onSelectWarehouse) {
      onSelectWarehouse();
      return;
    }
    router.push('/inventory/warehouse');
  };

  const sheetWidth = Math.min(width - 32, 380);
  const enter = (index: number) => (reduced ? undefined : FadeInDown.delay(60 + index * 45).duration(260).easing(Easing.out(Easing.cubic)));
  const fabShadow = Platform.OS === 'web'
    ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
    : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 };

  return (
    <>
      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={closeMenu}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: palette.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(20,20,20,0.38)' },
              Platform.OS === 'web' ? ({ backdropFilter: 'blur(6px)' } as object) : null,
              backdropStyle,
            ]}
          />
          <Pressable accessibilityLabel="Close inventory menu" onPress={closeMenu} style={StyleSheet.absoluteFill} />

          <Animated.View
            style={[
              {
                position: 'absolute',
                right: 16,
                bottom: fabBottom + FAB_SIZE + 14,
                width: sheetWidth,
                borderRadius: 28,
                padding: 10,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderColor: palette.border,
                ...(Platform.OS === 'web'
                  ? ({ boxShadow: '0 24px 60px rgba(0,0,0,0.45)' } as object)
                  : { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14 }),
              },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={drag}>
              <View style={{ alignItems: 'center', paddingTop: 2, paddingBottom: 10 }}>
                <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline }} />
                <Text style={{ alignSelf: 'flex-start', color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 10 }}>Inventory</Text>
              </View>
            </GestureDetector>

            <View style={{ gap: 8 }}>
              {options.map((option, index) => {
                const Icon = option.icon;
                const isActive = currentSection === option.key;
                return (
                  <Animated.View key={option.key} entering={enter(index)}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${option.label}. ${option.subtitle}`}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => handleSelect(option.key)}
                      style={(state) => ({
                        minHeight: 60,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 20,
                        borderWidth: isActive ? 0 : 1,
                        borderColor: palette.border,
                        backgroundColor: isActive ? FYLL_LIME : isHovered(state) || state.pressed ? palette.softFill : palette.inset,
                        opacity: isActive && state.pressed ? 0.9 : 1,
                      })}
                    >
                      <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? 'rgba(30,30,30,0.12)' : palette.nudgeBg }}>
                        <Icon size={20} color={isActive ? FYLL_LIME_INK : palette.limeOnSurface} strokeWidth={2.1} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={[{ color: isActive ? FYLL_LIME_INK : palette.text, fontSize: 14 }, titleFont]} numberOfLines={1}>{option.label}</Text>
                        <Text style={{ color: isActive ? 'rgba(30,30,30,0.7)' : palette.faint, fontSize: 12 }} numberOfLines={1}>{option.subtitle}</Text>
                      </View>
                      {isActive ? <Check size={17} color={FYLL_LIME_INK} strokeWidth={2.8} /> : null}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>

          {/* The menu button's twin: it sits exactly over the real one so the icon turns into a close button. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close inventory menu"
            onPress={closeMenu}
            style={{
              position: 'absolute',
              right: 20,
              bottom: fabBottom,
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: FYLL_LIME,
              ...fabShadow,
            }}
          >
            <Animated.View style={[{ position: 'absolute' }, menuIconStyle]}>
              <Menu size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute' }, closeIconStyle]}>
              <X size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
            </Animated.View>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>

      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Open inventory menu"
        style={{
          position: 'absolute',
          right: 20,
          bottom: fabBottom,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: FYLL_LIME,
          ...fabShadow,
          zIndex: 50,
        }}
      >
        <Menu size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
      </Pressable>
    </>
  );
}
