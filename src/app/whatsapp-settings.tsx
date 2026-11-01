import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { WhatsAppAlertsCard } from '@/components/WhatsAppAlertsCard';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { FYLL_LIME, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';

export default function WhatsAppSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const resolvedThemeMode = useResolvedThemeMode();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const tabBarHeight = useTabBarHeight();
  const panelStyles = getSettingsWebPanelStyles(isFromSettingsRoute(from), colors.bg.primary, colors.border.light);

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }} edges={['top']}>
          <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isWebDesktop ? 250 : 360 }} />
          <View style={{ minHeight: isMobile ? 66 : isWebDesktop ? 78 : 58, paddingHorizontal: isWebDesktop ? 20 : 10, paddingTop: isMobile ? 12 : isWebDesktop ? 20 : 4, paddingBottom: isWebDesktop ? 10 : 4, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                goBack();
              }}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, marginRight: 12 }}
            >
              <ArrowLeft size={20} color={palette.text} strokeWidth={2} />
            </Pressable>
            <View>
              <Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
              <Text style={{ color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>WhatsApp Alerts</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 40 }} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: isWebDesktop ? 960 : 720, alignSelf: 'center' }}>
              <View style={{ position: 'relative', overflow: 'hidden', minHeight: isWebDesktop ? 124 : 156, marginBottom: 24, padding: isWebDesktop ? 18 : 20, justifyContent: 'center', borderRadius: 28, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, shadowColor: '#000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
                <LinearGradient pointerEvents="none" colors={[palette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
                <View>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Business alerts</Text>
                  <MoneyText style={{ color: palette.text, fontSize: 26, lineHeight: 31 }}>Never miss an order</MoneyText>
                  <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 3 }}>Orders and payments sent to WhatsApp</Text>
                </View>
              </View>

              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Alert settings</Text>
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
