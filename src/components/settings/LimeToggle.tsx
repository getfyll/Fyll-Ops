import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type LimeToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  activeColor?: string;
  inactiveColor?: string;
  inactiveBorderColor?: string;
  compact?: boolean;
};

const TRACK_WIDTH = 56;
const TRACK_HEIGHT = 32;
const THUMB_SIZE = 24;
const TRACK_INSET = 4;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - TRACK_INSET * 2;

export function LimeToggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  activeColor = '#D5E057',
  inactiveColor = 'rgba(255,255,255,0.04)',
  inactiveBorderColor = 'rgba(255,255,255,0.16)',
  compact = false,
}: LimeToggleProps) {
  const trackWidth = compact ? 50 : TRACK_WIDTH;
  const trackHeight = compact ? 28 : TRACK_HEIGHT;
  const thumbSize = compact ? 22 : THUMB_SIZE;
  const trackInset = compact ? 3 : TRACK_INSET;
  const thumbTravel = compact ? trackWidth - thumbSize - trackInset * 2 : THUMB_TRAVEL;
  const position = useSharedValue(value ? thumbTravel : 0);

  useEffect(() => {
    position.value = withSpring(value ? thumbTravel : 0, {
      damping: 18,
      stiffness: 240,
      mass: 0.72,
    });
  }, [position, thumbTravel, value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => ({
        width: trackWidth,
        height: trackHeight,
        padding: trackInset,
        borderRadius: trackHeight / 2,
        justifyContent: 'center',
        backgroundColor: value ? activeColor : inactiveColor,
        borderWidth: value ? 0 : 1,
        borderColor: inactiveBorderColor,
        opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
      })}
    >
      <Animated.View
        style={[
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            backgroundColor: '#1D1D1D',
          },
          thumbStyle,
        ]}
      />
    </Pressable>
  );
}
