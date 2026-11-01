import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaymentsPalette } from '@/components/payments/payments-ui';

const OPEN = { duration: 320, easing: Easing.out(Easing.cubic) } as const;
const CLOSE = { duration: 220, easing: Easing.in(Easing.quad) } as const;

// A bottom sheet with the same motion as Home's quick-actions sheet: a blurred backdrop fades in, the sheet rises and
// settles, and it can be dragged down from the handle to dismiss. Motion is skipped for reduced motion.
export function FluidSheet({
  visible,
  onClose,
  children,
  heightFraction = 0.88,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  heightFraction?: number;
}) {
  const palette = usePaymentsPalette();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
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

  // Only the handle area listens for the drag, so scrolling the list inside the sheet is never affected.
  const drag = Gesture.Pan()
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 800) {
        runOnJS(dismissByDrag)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * (1 - Math.min(dragY.value / 500, 0.6)) }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ translateY: (1 - progress.value) * 120 + dragY.value }],
  }));

  if (!mounted) return null;

  const sheetHeight = Math.min(height * heightFraction, 760);

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
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />

        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Animated.View
            style={[
              {
                height: sheetHeight,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: palette.border,
                paddingBottom: Math.max(insets.bottom, 12),
                ...(Platform.OS === 'web'
                  ? ({ boxShadow: '0 -18px 60px rgba(0,0,0,0.4)' } as object)
                  : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: -10 }, elevation: 14 }),
              },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={drag}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 12 }}>
                <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline }} />
              </View>
            </GestureDetector>
            <View style={{ flex: 1, paddingHorizontal: 18 }}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
