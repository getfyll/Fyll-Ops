import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { WhatsAppAlertsCard } from '@/components/WhatsAppAlertsCard';
import { useThemeColors } from '@/lib/theme';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';

type WhatsAppSettingsScreenProps = { embeddedInSettings?: boolean };

export default function WhatsAppSettingsScreen({ embeddedInSettings = false }: WhatsAppSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const tabBarHeight = useTabBarHeight();
  const panelStyles = getSettingsWebPanelStyles(isFromSettingsRoute(from), colors.bg.primary, colors.border.light);

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }} edges={embeddedInSettings && isWebDesktop ? [] : ['top']}>
          <InternalSettingsHeader
            title="WhatsApp Alerts"
            description="Receive order and payment alerts directly on WhatsApp."
            isDesktop={isWebDesktop}
            onBack={goBack}
          />

          <ScrollView contentContainerStyle={{ paddingHorizontal: isWebDesktop ? 28 : 16, paddingTop: isWebDesktop ? 24 : 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 40 }} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: isWebDesktop ? 960 : 720, alignSelf: 'center' }}>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.75, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Alert settings</Text>
              <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
                <WhatsAppAlertsCard />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
