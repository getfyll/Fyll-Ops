import React from 'react';
import { Pressable, Text, View, ActivityIndicator, Platform } from 'react-native';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  /** Button text label */
  children: string;
  /** Click handler */
  onPress: () => void;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state - shows spinner */
  loading?: boolean;
  /** Loading text (optional, defaults to children) */
  loadingText?: string;
  /** Full width button */
  fullWidth?: boolean;
  /** Additional className for container */
  className?: string;
  /** Icon to show before text */
  icon?: React.ReactNode;
  /** Haptic feedback on press */
  haptic?: boolean;
  /** Override the label font size (defaults to the size preset's fontSize) */
  fontSize?: number;
}

const variantStyles: Record<ButtonVariant, { bg: string; bgDisabled: string; text: string; textDisabled: string; border?: string }> = {
  primary: {
    bg: '#111111',
    bgDisabled: '#CCCCCC',
    text: '#FFFFFF',
    textDisabled: '#FFFFFF',
  },
  secondary: {
    bg: '#F3F4F6',
    bgDisabled: '#F9FAFB',
    text: '#111111',
    textDisabled: '#9CA3AF',
    border: '#E5E7EB',
  },
  danger: {
    bg: '#EF4444',
    bgDisabled: '#FCA5A5',
    text: '#FFFFFF',
    textDisabled: '#FFFFFF',
  },
  ghost: {
    bg: 'transparent',
    bgDisabled: 'transparent',
    text: '#111111',
    textDisabled: '#9CA3AF',
    border: '#E5E7EB',
  },
  'danger-ghost': {
    bg: 'rgba(239, 68, 68, 0.15)',
    bgDisabled: 'rgba(239, 68, 68, 0.08)',
    text: '#EF4444',
    textDisabled: '#FCA5A5',
  },
};

const sizeStyles: Record<ButtonSize, { height: number; paddingX: number; fontSize: number; iconSize: number }> = {
  sm: { height: 40, paddingX: 16, fontSize: 14, iconSize: 16 },
  md: { height: 48, paddingX: 20, fontSize: 15, iconSize: 18 },
  lg: { height: 52, paddingX: 24, fontSize: 16, iconSize: 20 },
};

/**
 * Unified Button component for the FYLL design system.
 *
 * @example
 * // Primary CTA
 * <Button onPress={handleSubmit}>Create Product</Button>
 *
 * // With loading state
 * <Button onPress={handleSubmit} loading={isLoading} loadingText="Creating...">Create</Button>
 *
 * // Secondary variant
 * <Button variant="secondary" onPress={handleCancel}>Cancel</Button>
 *
 * // Danger variant
 * <Button variant="danger" onPress={handleDelete}>Delete</Button>
 *
 * // Ghost variant
 * <Button variant="ghost" onPress={handleClose}>Close</Button>
 *
 * // With icon
 * <Button icon={<Plus size={18} color="#FFF" />} onPress={handleAdd}>Add Item</Button>
 */
export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  loadingText,
  fullWidth = true,
  className,
  icon,
  haptic = true,
  fontSize,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];
  const labelFontSize = fontSize ?? sizes.fontSize;

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const backgroundColor = isDisabled ? styles.bgDisabled : styles.bg;
  const textColor = isDisabled ? styles.textDisabled : styles.text;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      className={cn(
        'rounded-full items-center justify-center flex-row',
        fullWidth ? 'w-full' : '',
        className
      )}
      style={[
        {
          height: sizes.height,
          paddingHorizontal: sizes.paddingX,
          backgroundColor,
          opacity: isDisabled ? 0.7 : 1,
        },
        styles.border ? { borderWidth: 1, borderColor: styles.border } : {},
      ]}
    >
      {loading ? (
        <View className="flex-row items-center">
          <ActivityIndicator
            color={textColor}
            size="small"
          />
          <Text
            className="font-semibold ml-2"
            style={{ color: textColor, fontSize: labelFontSize }}
          >
            {loadingText || children}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center">
          {icon && <View className="mr-2">{icon}</View>}
          <Text
            className="font-semibold"
            style={{ color: textColor, fontSize: labelFontSize }}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Sticky bottom CTA container for full-screen forms.
 * Handles safe area insets automatically.
 */
interface StickyButtonContainerProps {
  children: React.ReactNode;
  /** Bottom inset from useSafeAreaInsets */
  bottomInset?: number;
  /** Optional surface color for themed screens */
  backgroundColor?: string;
  /** Optional top border color for themed screens */
  borderColor?: string;
}

export function StickyButtonContainer({
  children,
  bottomInset = 0,
  backgroundColor = '#FFFFFF',
  borderColor = '#E5E7EB',
}: StickyButtonContainerProps) {
  return (
    <View
      className="absolute left-0 right-0 px-5"
      style={{
        bottom: 0,
        paddingBottom: bottomInset > 0 ? bottomInset : 16,
        paddingTop: 16,
        backgroundColor,
        borderTopWidth: 1,
        borderTopColor: borderColor,
      }}
    >
      {children}
    </View>
  );
}

export default Button;
