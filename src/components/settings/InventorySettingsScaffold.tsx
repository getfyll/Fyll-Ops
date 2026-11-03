import React, { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { FYLL_LIME, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

type InventorySettingsHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  isDesktop: boolean;
};

export function InventorySettingsHero({ eyebrow, title, description, isDesktop }: InventorySettingsHeroProps) {
  const palette = usePaymentsPalette();

  return (
    <View
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: isDesktop ? 138 : 150,
        marginBottom: 20,
        padding: 20,
        justifyContent: 'center',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.card,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 28,
          right: 28,
          height: 3,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          backgroundColor: FYLL_LIME,
        }}
      />
      <Text
        style={{
          color: palette.faint,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1.15,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </Text>
      <MoneyText
        style={{
          color: palette.text,
          fontSize: isDesktop ? 28 : 24,
          lineHeight: isDesktop ? 34 : 29,
          letterSpacing: -0.7,
          marginTop: 2,
        }}
      >
        {title}
      </MoneyText>
      <Text style={{ color: palette.faint, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>
        {description}
      </Text>
    </View>
  );
}

export function SettingsDetailHero(props: InventorySettingsHeroProps) {
  return <InventorySettingsHero {...props} />;
}

export function InventorySettingsContent({ isDesktop, children }: { isDesktop: boolean; children: ReactNode }) {
  return (
    <View
      style={isDesktop
        ? { width: '100%', maxWidth: 1440, alignSelf: 'flex-start' }
        : { width: '100%', maxWidth: 720, alignSelf: 'center' }}
    >
      {children}
    </View>
  );
}
