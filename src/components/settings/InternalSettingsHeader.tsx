import React, { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

type InternalSettingsHeaderProps = {
  title: string;
  description: string;
  isDesktop: boolean;
  onBack: () => void;
  rightElement?: ReactNode;
};

export function InternalSettingsHeader({ title, description, isDesktop, onBack, rightElement }: InternalSettingsHeaderProps) {
  const palette = usePaymentsPalette();

  if (!isDesktop) {
    return (
      <View style={{ minHeight: 66, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.card }}>
        <Pressable onPress={onBack} className="active:opacity-60" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, marginRight: 12 }}>
          <ArrowLeft size={18} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
          <Text style={{ color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: 120, paddingHorizontal: 28, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.card }}>
      <Pressable onPress={onBack} className="active:opacity-60" style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <ArrowLeft size={20} color={palette.text} strokeWidth={2.2} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <MoneyText style={{ color: palette.text, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 }} numberOfLines={1}>{title}</MoneyText>
        <Text style={{ color: palette.faint, fontSize: 13, lineHeight: 18, marginTop: 4 }} numberOfLines={2}>{description}</Text>
      </View>
      {rightElement ? <View style={{ marginLeft: 16 }}>{rightElement}</View> : null}
    </View>
  );
}
