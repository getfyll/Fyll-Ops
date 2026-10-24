import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Plus, type LucideIcon } from 'lucide-react-native';
import { useFonts, BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

type EmptyStateProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  bordered?: boolean;
  // Centre the card in whatever space is left on the page (the standard list-page empty state).
  // The page's scroll content must be allowed to grow (flexGrow: 1) for this to centre vertically.
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = Plus,
  bordered = true,
  fill = false,
  style,
}: EmptyStateProps) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const [fontLoaded] = useFonts({ BricolageGrotesque_600SemiBold });

  const card = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: 440,
          alignSelf: 'center',
          alignItems: 'center',
          paddingHorizontal: isMobile ? 24 : 34,
          paddingVertical: isMobile ? 30 : 36,
          borderRadius: 20,
          borderWidth: bordered ? 1 : 0,
          borderColor: palette.border,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
        <Icon size={28} color={palette.limeOnSurface} strokeWidth={1.9} />
      </View>
      <Text
        maxFontSizeMultiplier={1}
        style={{
          color: palette.text,
          fontSize: 16,
          lineHeight: 20,
          textAlign: 'center',
          marginTop: 16,
          fontWeight: fontLoaded ? '400' : '600',
          fontFamily: fontLoaded ? 'BricolageGrotesque_600SemiBold' : undefined,
        }}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={1}
        style={{
          color: palette.faint,
          fontSize: isMobile ? 10 : 13,
          lineHeight: isMobile ? 15 : 19.5,
          textAlign: 'center',
          maxWidth: isMobile ? 210 : 300,
          marginTop: 6,
        }}
      >
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={(state) => ({
            height: 44,
            borderRadius: 999,
            paddingHorizontal: 20,
            marginTop: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
            opacity: state.pressed ? 0.86 : 1,
          })}
        >
          <ActionIcon size={17} color={FYLL_LIME_INK} strokeWidth={2.6} />
          <Text
            maxFontSizeMultiplier={1}
            style={{
              color: FYLL_LIME_INK,
              fontSize: 14,
              fontWeight: fontLoaded ? '400' : '600',
              fontFamily: fontLoaded ? 'BricolageGrotesque_600SemiBold' : undefined,
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!fill) return card;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: isMobile ? 36 : 56 }}>
      {card}
    </View>
  );
}
