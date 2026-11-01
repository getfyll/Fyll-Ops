import React, { useEffect } from 'react';
import { Pressable, Text, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

interface FyllAiButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
  borderRadius?: number;
  iconSize?: number;
  textSize?: number;
  horizontalPadding?: number;
  disabled?: boolean;
  // Shows just the sparkle in a round button; the label is kept for screen readers.
  iconOnly?: boolean;
}

export function FyllAiButton({
  label,
  onPress,
  style,
  height = 44,
  borderRadius = 22,
  iconSize = 16,
  textSize = 14,
  horizontalPadding = 14,
  disabled = false,
  iconOnly = false,
}: FyllAiButtonProps) {
  const sweep = useSharedValue(-140);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sweep.value = -140;
    sweep.value = withRepeat(withTiming(420, { duration: 1250, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value }],
  }));

  const iconPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.86 + (pulse.value * 0.14),
    transform: [{ scale: 0.95 + (pulse.value * 0.05) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-80 overflow-hidden"
      style={[{ borderRadius, height, opacity: disabled ? 0.6 : 1 }, iconOnly ? { width: height } : null, style]}
    >
      <LinearGradient
        colors={['#8B5CF6', '#A855F7', '#C084FC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: iconOnly ? 0 : horizontalPadding, overflow: 'hidden' }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 140,
            },
            sweepStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View style={iconPulseStyle}>
          <Sparkles size={iconSize} color="#FFFFFF" strokeWidth={2.2} />
        </Animated.View>
        {iconOnly ? null : (
          <Text
            style={{ color: '#FFFFFF', fontSize: textSize }}
            className="font-semibold ml-1.5"
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}
