import React from 'react';
import { Text, type TextProps } from 'react-native';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

// A big figure on an Insights card: Bricolage, with its own (usually smaller) size on phones.
export function FigureText({ desktop, mobile, style, children, ...rest }: TextProps & { desktop: number; mobile?: number }) {
  const { isMobile } = useBreakpoint();
  const size = isMobile ? (mobile ?? desktop) : desktop;
  return (
    <MoneyText {...rest} style={[{ fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -0.6 }, style]}>
      {children}
    </MoneyText>
  );
}

// The small coloured line under a big figure (the trend, or "13 orders (39%)"): 10px on phones.
export function FigureCaption({ desktop = 14, mobile = 10, style, children, ...rest }: TextProps & { desktop?: number; mobile?: number }) {
  const { isMobile } = useBreakpoint();
  return (
    <Text {...rest} style={[{ fontSize: isMobile ? mobile : desktop }, style]}>
      {children}
    </Text>
  );
}

// One plain sentence under the top figure of an Insights page: the key part in bold, the rest in grey (14px, 12px on phones).
export function InsightSentence({ parts }: { parts: { bold: string; rest: string } | null }) {
  const { isMobile } = useBreakpoint();
  const palette = usePaymentsPalette();
  if (!parts) return null;
  return (
    <Text style={{ marginTop: 12, color: palette.muted, fontSize: isMobile ? 12 : 14, lineHeight: isMobile ? 18 : 21 }}>
      <Text style={{ color: palette.text, fontWeight: '700' }}>{parts.bold}</Text>
      {parts.rest}
    </Text>
  );
}
