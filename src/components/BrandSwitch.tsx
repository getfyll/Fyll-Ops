import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;

type BrandSwitchProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** 'danger' is for destructive toggles such as "Mark as inactive". */
  tone?: 'brand' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * Fyll-branded switch: lime track with a dark-ink thumb when on,
 * a quiet outlined track when off. Replaces the stock platform Switch.
 */
export function BrandSwitch({ value, onValueChange, tone = 'brand', disabled, accessibilityLabel }: BrandSwitchProps) {
  const palette = usePaymentsPalette();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, progress]);

  const onTrack = tone === 'danger' ? palette.danger : FYLL_LIME;
  const onThumb = tone === 'danger' ? '#FFFFFF' : FYLL_LIME_INK;
  const offTrack = palette.softFill;
  const offThumb = palette.faint;

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
    borderColor: interpolateColor(progress.value, [0, 1], [palette.outline, onTrack]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offThumb, onThumb]),
    transform: [{ translateX: progress.value * (TRACK_W - THUMB - PAD * 2 - 2) }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onValueChange(!value);
      }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: 1, justifyContent: 'center', paddingHorizontal: PAD },
          trackStyle,
        ]}
      >
        <Animated.View style={[{ width: THUMB, height: THUMB, borderRadius: THUMB / 2 }, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

export default BrandSwitch;
