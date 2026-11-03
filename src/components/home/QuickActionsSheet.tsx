import React, { useCallback, useEffect, useState } from 'react';
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
import { ChevronRight, Package, Plus, Receipt, RotateCcw, Scan, ShoppingCart, Sparkles, Truck, Wallet } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import type { QuickActionDef, QuickActionKey } from '@/lib/quick-actions';

const ICONS: Record<QuickActionKey, LucideIcon> = {
  order: ShoppingCart,
  payment: Wallet,
  scan: Scan,
  product: Package,
  expense: Receipt,
  refund: RotateCcw,
  procurement: Truck,
  ai: Sparkles,
};

const OPEN = { duration: 300, easing: Easing.out(Easing.cubic) } as const;
const CLOSE = { duration: 200, easing: Easing.in(Easing.quad) } as const;
const FAB_SIZE = 56;

// The sheet behind Home's plus button. The plus turns into a close button as the sheet rises above it, the actions
// glide in one after another, and the sheet can be dragged down to dismiss. Motion is skipped for reduced motion.
export function QuickActionsSheet({
  visible,
  onClose,
  actions,
  onSelect,
  fabBottom,
  heading = 'Create',
}: {
  visible: boolean;
  onClose: () => void;
  actions: QuickActionDef[];
  onSelect: (route: string) => void;
  // Distance of the plus button from the bottom of the screen, so the close button lands exactly on top of it.
  fabBottom: number;
  heading?: string;
}) {
  const palette = usePaymentsPalette();
  const reduced = useReducedMotion();
  const [fontLoaded] = useFonts({ BricolageGrotesque_600SemiBold });
  // Titles are Bricolage SemiBold (a step lighter than the bold used for big numbers).
  const titleFont = fontLoaded ? ({ fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' } as const) : ({ fontWeight: '600' } as const);
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [mounted, setMounted] = useState<boolean>(visible);

  const finishClose = useCallback(() => {
    setMounted(false);
    dragY.value = 0;
  }, [dragY]);

  useEffect(() => {
    if (visible) {
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
    // `mounted` is deliberately not a dependency: this only reacts to the parent opening or closing the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismissByDrag = useCallback(() => onClose(), [onClose]);

  // Only the grab area at the top of the sheet listens for the drag, so tapping the rows is never affected.
  const drag = Gesture.Pan()
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 70 || event.velocityY > 700) {
        runOnJS(dismissByDrag)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * (1 - Math.min(dragY.value / 400, 0.6)) }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 36 + dragY.value }, { scale: 0.96 + 0.04 * progress.value }],
  }));
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 45}deg` }] }));

  if (!mounted) return null;

  const sheetWidth = Math.min(width - 32, 380);
  const enter = (index: number) => (reduced ? undefined : FadeInDown.delay(60 + index * 45).duration(260).easing(Easing.out(Easing.cubic)));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
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
        <Pressable accessibilityLabel="Close quick actions" onPress={onClose} style={StyleSheet.absoluteFill} />

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
              <Text style={{ alignSelf: 'flex-start', color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 10 }}>{heading}</Text>
            </View>
          </GestureDetector>

          <View style={{ gap: 8 }}>
            {actions.map((action, index) => {
              const Icon = ICONS[action.key];
              const primary = Boolean(action.primary);
              return (
                <Animated.View key={action.key} entering={enter(index)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${action.title}. ${action.subtitle}`}
                    onPress={() => {
                      onClose();
                      onSelect(action.route);
                    }}
                    style={(state) => ({
                      minHeight: 60,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: primary ? 0 : 1,
                      borderColor: palette.border,
                      backgroundColor: primary ? FYLL_LIME : isHovered(state) || state.pressed ? palette.softFill : palette.inset,
                      opacity: primary && state.pressed ? 0.9 : 1,
                    })}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? 'rgba(30,30,30,0.12)' : palette.nudgeBg }}>
                      <Icon size={20} color={primary ? FYLL_LIME_INK : palette.limeOnSurface} strokeWidth={2.1} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[{ color: primary ? FYLL_LIME_INK : palette.text, fontSize: 14 }, titleFont]} numberOfLines={1}>{action.title}</Text>
                      <Text style={{ color: primary ? 'rgba(30,30,30,0.7)' : palette.faint, fontSize: 12 }} numberOfLines={1}>{action.subtitle}</Text>
                    </View>
                    <ChevronRight size={17} color={primary ? FYLL_LIME_INK : palette.faint} strokeWidth={2.2} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* The plus button's twin: it sits exactly over the real one and turns into a close button. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close quick actions"
          onPress={onClose}
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
            ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object) : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }),
          }}
        >
          <Animated.View style={plusStyle}>
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
          </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
