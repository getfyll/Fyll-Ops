import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { ArrowUpRight, Check, Copy, Globe, Store } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { HOME_BODY_SIZE, HOME_BUTTON_TEXT_STYLE, HOME_TITLE_SIZE, HomeCard } from '@/components/home/home-ui';
import { buildStorefrontSubdomainUrl } from '@/lib/storefront-url';

// The link field and the Open store button share this height so they always line up.
const LINK_ROW_HEIGHT = 50;

const openExternal = (url: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
};

// Live: the store link with Copy and Open store, like the Fyll Store dashboard.
// Not live yet: one button that takes the owner to Settings to activate their storefront.
export function StorefrontCard({
  enabled,
  storefrontSlug,
  businessName,
  onSetUp,
}: {
  enabled: boolean;
  storefrontSlug?: string | null;
  businessName?: string | null;
  onSetUp: () => void;
}) {
  const palette = usePaymentsPalette();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold });
  // On a phone the Copy button shows just its icon (no room for the word), and Open store takes a full-width row.
  const isPhone = useWindowDimensions().width < 440;
  const [copied, setCopied] = useState<boolean>(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlInput = { storefrontSlug, businessName };
  const storeUrl = buildStorefrontSubdomainUrl(urlInput);
  const host = storeUrl.replace(/^https?:\/\//, '');
  const semiBold = fontsLoaded ? ({ fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' } as const) : ({ fontWeight: '600' } as const);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(storeUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Copying is a convenience; if the device refuses, the link is still shown and can be selected.
    }
  };

  if (enabled) {
    return (
      <HomeCard style={{ borderRadius: 26, gap: 12, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' }}>Your store link</Text>
          <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.limeOnSurface }} />
            <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '700' }}>Live</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              flex: 1,
              flexBasis: 330,
              minWidth: 0,
              height: LINK_ROW_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingLeft: 14,
              paddingRight: 8,
              paddingVertical: 0,
              borderRadius: 999,
              backgroundColor: palette.inset,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <Globe size={19} color={palette.muted} strokeWidth={1.8} />
            <Text
              style={[{ flex: 1, minWidth: 0, color: palette.text, fontSize: 16 }, fontsLoaded ? { fontFamily: 'BricolageGrotesque_500Medium', fontWeight: '400' } : { fontWeight: '500' }]}
              numberOfLines={1}
              selectable
            >
              {host}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy store link"
              onPress={handleCopy}
              style={(state) => ({ height: 38, minWidth: 38, paddingHorizontal: isPhone ? 0 : 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
            >
              {copied ? <Check size={16} color={FYLL_LIME_INK} strokeWidth={2.6} /> : <Copy size={16} color={FYLL_LIME_INK} strokeWidth={2.2} />}
              {isPhone ? null : <Text style={[{ color: FYLL_LIME_INK, fontSize: 15 }, semiBold]}>{copied ? 'Copied' : 'Copy'}</Text>}
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open store"
            onPress={() => openExternal(storeUrl)}
            style={(state) => ({
              height: LINK_ROW_HEIGHT,
              ...(isPhone ? { width: '100%' as const } : null),
              paddingHorizontal: 22,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: palette.isDark ? FYLL_LIME : palette.limeOnSurface,
              backgroundColor: isHovered(state) || state.pressed ? palette.nudgeBg : 'transparent',
            })}
          >
            <Text style={[{ color: palette.text, fontSize: 16 }, semiBold]}>Open store</Text>
            <ArrowUpRight size={16} color={palette.text} strokeWidth={2.4} />
          </Pressable>
        </View>
      </HomeCard>
    );
  }

  return (
    <HomeCard style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
          <Store size={18} color={palette.text} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: HOME_TITLE_SIZE, fontWeight: '600' }}>Set up your storefront</Text>
          <Text style={{ color: palette.faint, fontSize: HOME_BODY_SIZE, lineHeight: 17 }} numberOfLines={2}>
            Turn on your Fyll storefront in Settings to start selling online.
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set up your storefront"
          onPress={onSetUp}
          style={(state) => ({ height: 38, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}
        >
          <Text style={[HOME_BUTTON_TEXT_STYLE, { color: FYLL_LIME_INK }]}>Set up storefront</Text>
        </Pressable>
      </View>
    </HomeCard>
  );
}
