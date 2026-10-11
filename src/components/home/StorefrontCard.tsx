import React from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { ArrowUpRight, Store } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { HOME_BODY_SIZE, HOME_TITLE_SIZE, HomeCard } from '@/components/home/home-ui';
import { buildStorefrontDashboardUrl, buildStorefrontSubdomainUrl } from '@/lib/storefront-url';

const openExternal = (url: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
};

// Takes the owner to their Fyll Store dashboard (businessname.fyll.store/dashboard): to manage the
// storefront when it is live, or to set one up (or connect a website) when it is not.
export function StorefrontCard({
  enabled,
  storefrontSlug,
  businessName,
  onConnectWebsite,
}: {
  enabled: boolean;
  storefrontSlug?: string | null;
  businessName?: string | null;
  onConnectWebsite: () => void;
}) {
  const palette = usePaymentsPalette();
  const urlInput = { storefrontSlug, businessName };
  const dashboardUrl = buildStorefrontDashboardUrl(urlInput);
  const storeUrl = buildStorefrontSubdomainUrl(urlInput);
  const host = storeUrl.replace(/^https?:\/\//, '');

  const title = enabled ? 'Your storefront' : 'Set up your storefront';
  const subtitle = enabled
    ? host
    : 'Create your Fyll storefront or connect your website to start selling online.';

  return (
    <HomeCard>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
          <Store size={18} color={palette.text} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: HOME_TITLE_SIZE, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: palette.faint, fontSize: HOME_BODY_SIZE, lineHeight: 17 }} numberOfLines={2}>{subtitle}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={enabled ? 'Open storefront dashboard' : 'Set up your storefront'}
          onPress={() => openExternal(dashboardUrl)}
          style={(state) => ({ height: 38, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME, opacity: state.pressed ? 0.85 : 1 })}
        >
          <Text style={{ color: FYLL_LIME_INK, fontSize: HOME_BODY_SIZE + 1, fontWeight: '700' }}>{enabled ? 'Open dashboard' : 'Set up storefront'}</Text>
          <ArrowUpRight size={14} color={FYLL_LIME_INK} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          accessibilityRole={enabled ? 'link' : 'button'}
          onPress={() => (enabled ? openExternal(storeUrl) : onConnectWebsite())}
          style={(state) => ({ height: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent', opacity: state.pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: palette.text, fontSize: HOME_BODY_SIZE + 1, fontWeight: '600' }}>{enabled ? 'View store' : 'Connect website'}</Text>
        </Pressable>
      </View>
    </HomeCard>
  );
}
