import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { BackButton, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

// Shared shell for the staff quote screens: sidebar on desktop, a back button with a title, then a
// scrolling column. `footer` stays pinned under the scroll (the create / send buttons).
export function QuoteScreenFrame({
  title,
  subtitle,
  onBack,
  right,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <View style={{ width: '100%', maxWidth: isDesktop ? 640 : undefined, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: isDesktop ? 22 : 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
              <BackButton onPress={onBack} palette={palette} label="Back" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
              {right}
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: palette.hairline, gap: 10 }}>{footer}</View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
