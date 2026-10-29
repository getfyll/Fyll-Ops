import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Boxes, Building2, CreditCard, FileText, LayoutGrid, Link2, Package, Shield, ShoppingCart, Sun, Upload, UserCircle, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { FyllLogo } from '@/components/FyllLogo';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useThemeColors } from '@/lib/theme';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import { SETTINGS_NAV, SETTINGS_NAV_GROUPS, type SettingsNavKey } from '@/lib/settings-nav';
import useSettingsNavStore from '@/lib/state/settings-nav-store';

const ICONS: Record<SettingsNavKey, typeof UserCircle> = {
  profile: UserCircle,
  notifications: Bell,
  appearance: Sun,
  'business-details': Building2,
  team: Users,
  payments: CreditCard,
  links: Link2,
  'all-features': LayoutGrid,
  orders: ShoppingCart,
  inventory: Package,
  cases: FileText,
  'import-export': Upload,
  integrations: Boxes,
  system: Shield,
};

// While Settings is open this replaces the main sidebar's contents. It is built to match the main sidebar
// exactly: same width, logo header, item size, spacing and lime selected pill, so switching feels seamless.
export function SettingsSidebar() {
  const colors = useThemeColors();
  const navPalette = usePaymentsPalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeKey = useSettingsNavStore((s) => s.activeKey);
  const lastPath = useSettingsNavStore((s) => s.lastPath);
  const setActiveKey = useSettingsNavStore((s) => s.setActiveKey);
  const { featureAccess } = useBusinessSettings();

  // Pages that depend on a feature that is off are left out of the menu rather than linking to something hidden.
  const visible = SETTINGS_NAV.filter((item) => {
    if (item.key === 'cases') return isBusinessFeatureEnabled(featureAccess, 'cases');
    if (item.key === 'team') return isBusinessFeatureEnabled(featureAccess, 'teamMembers');
    return true;
  });

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push((lastPath && !lastPath.startsWith('/settings') ? lastPath : '/(tabs)') as never);
  };

  const itemBase = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 2,
  };

  return (
    <View
      style={{
        width: 260,
        flexShrink: 0,
        backgroundColor: colors.bg.primary,
        borderRightWidth: 1,
        borderRightColor: colors.border.light,
        paddingTop: insets.top || 20,
        paddingBottom: insets.bottom || 20,
      }}
    >
      {/* Same logo header as the main sidebar */}
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
        <FyllLogo color={colors.text.primary} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
        <Pressable accessibilityRole="link" onPress={goBack} className="active:opacity-70" style={itemBase}>
          <View style={{ width: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <ArrowLeft size={17} color={colors.text.tertiary} strokeWidth={1.9} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text.secondary }}>Back to Fyll Ops</Text>
        </Pressable>

        <MoneyText style={{ color: colors.text.primary, fontSize: 22, letterSpacing: -0.6, paddingHorizontal: 28, paddingTop: 14 }}>Settings</MoneyText>

        {SETTINGS_NAV_GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group}>
              <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 28, marginTop: 18, marginBottom: 4 }}>{group}</Text>
              {items.map((item) => {
                const active = activeKey === item.key;
                const Icon = ICONS[item.key];
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveKey(item.key);
                      router.replace({ pathname: '/settings', params: { menu: item.key } } as never);
                    }}
                    className="active:opacity-80"
                    style={{ ...itemBase, backgroundColor: active ? navPalette.nudgeBg : 'transparent' }}
                  >
                    <View style={{ width: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon size={17} color={active ? navPalette.limeOnSurface : colors.text.tertiary} strokeWidth={active ? 2.2 : 1.9} />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: active ? '600' : '500', color: active ? navPalette.limeOnSurface : colors.text.secondary }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <Text style={{ color: colors.text.muted, fontSize: 12.5, paddingHorizontal: 28, paddingTop: 12 }}>Need help? support@fyll.app</Text>
    </View>
  );
}
