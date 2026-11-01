import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ExternalLink, Globe, Link2, LockKeyhole, ShieldCheck, Store, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';

import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { ChangeRequestModal } from '@/components/ChangeRequestModal';
import { MilestoneBadgeSetting } from '@/components/milestones/MilestoneBadgeSetting';
import { LimeToggle } from '@/components/settings/LimeToggle';
import { buildStorefrontDashboardUrl, buildStorefrontDiscoveryUrl, buildStorefrontSubdomainUrl, buildStorefrontUrl, buildSuggestedStorefrontUrls, resolveStorefrontSlug } from '@/lib/storefront-url';

type StorefrontSettingsScreenProps = { embeddedInSettings?: boolean };
type StorefrontPalette = {
  ground: string; surface: string; ink: string; muted: string; faint: string; lime: string; limeInk: string;
  limeDeep: string; edge: string; edgeStrong: string; input: string; topGlow: string; topGlowEnd: string;
  navButton: string; limeWash: string; limeWashStrong: string; limeBorder: string; danger: string;
  dangerWash: string; dangerBorder: string;
};

const DARK_PALETTE: StorefrontPalette = {
  ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84', lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00',
  edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)', input: 'rgba(255,255,255,0.055)', topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)', navButton: 'rgba(255,255,255,0.08)',
  limeWash: 'rgba(213,224,87,0.10)', limeWashStrong: 'rgba(213,224,87,0.14)', limeBorder: 'rgba(213,224,87,0.25)', danger: '#E5776D', dangerWash: 'rgba(229,119,109,0.14)', dangerBorder: 'rgba(229,119,109,0.28)',
};
const LIGHT_PALETTE: StorefrontPalette = {
  ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C', lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400',
  edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)', input: '#F7F7F1', topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)', navButton: 'rgba(32,33,23,0.07)',
  limeWash: 'rgba(135,148,0,0.09)', limeWashStrong: 'rgba(135,148,0,0.13)', limeBorder: 'rgba(102,112,0,0.22)', danger: '#C9574D', dangerWash: 'rgba(201,87,77,0.10)', dangerBorder: 'rgba(201,87,77,0.22)',
};

const webOutlineStyle = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;
const compactFont = (size: number, compact: boolean) => {
  if (!compact) return size;
  if (size >= 15 && size < 16) return 14;
  if (size === 13.5) return 12;
  if (size === 13) return 10;
  return size;
};

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: StorefrontPalette }) {
  return <Text style={{ color: palette.faint, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>{children}</Text>;
}

export default function StorefrontSettingsScreen({ embeddedInSettings = false }: StorefrontSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const router = useRouter();
  const goBack = useSettingsBack();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const { isDesktop, isMobile } = useBreakpoint();
  const compactTypography = !isDesktop;
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from) || embeddedInSettings;
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, palette.ground, palette.edge);
  const { businessName, companyName, storefrontEnabled, storefrontSlug, isLoading, saveSettings } = useBusinessSettings();

  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const [storefrontLive, setStorefrontLive] = useState<boolean>(false);
  const [storefrontHandle, setStorefrontHandle] = useState<string>('');
  const [showHandleRequest, setShowHandleRequest] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) { setStorefrontLive(storefrontEnabled); setStorefrontHandle(storefrontSlug); }
  }, [isLoading, storefrontEnabled, storefrontSlug]);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  const storefrontSlugLabel = resolveStorefrontSlug({ storefrontSlug: storefrontHandle, businessName, companyName });
  const storefrontPrimaryUrl = buildStorefrontUrl({ storefrontSlug: storefrontSlugLabel, businessName, companyName });
  const storefrontDiscoveryUrl = buildStorefrontDiscoveryUrl({ storefrontSlug: storefrontSlugLabel, businessName, companyName });
  const storefrontPremiumUrl = buildStorefrontSubdomainUrl({ storefrontSlug: storefrontSlugLabel, businessName, companyName });
  const storefrontDashboardUrl = buildStorefrontDashboardUrl({ storefrontSlug: storefrontSlugLabel, businessName, companyName });
  const suggestedStorefrontUrls = buildSuggestedStorefrontUrls({ storefrontSlug: storefrontSlugLabel, businessName, companyName });
  const hasChanges = storefrontLive !== storefrontEnabled || storefrontHandle.trim() !== storefrontSlug;
  const contentMaxWidth = openedFromSettings ? 720 : 520;
  const cardStyle: ViewStyle = { borderRadius: 26, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface };
  const displayHost = storefrontPrimaryUrl.replace(/^https?:\/\//, '');

  const openUrl = (url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url).catch(() => showToast('error', 'Could not open that link.'));
  };

  const handleSave = async () => {
    setError(null); setIsSaving(true);
    const justActivated = storefrontLive && !storefrontEnabled;
    try {
      const result = await saveSettings({ storefrontEnabled: storefrontLive, storefrontSlug: storefrontHandle.trim() });
      if (!result.success) {
        const message = result.error || 'Failed to save storefront settings.';
        setError(message); showToast('error', message); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return;
      }
      showToast('success', justActivated ? 'Storefront activated. Opening your dashboard…' : 'Storefront settings saved.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (justActivated) Linking.openURL(storefrontDashboardUrl).catch(() => {});
      goBack();
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message ? `Failed to save storefront settings. ${saveError.message}` : 'Failed to save storefront settings.';
      setError(message); showToast('error', message); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setIsSaving(false); }
  };

  if (isLoading) return (
    <View style={panelStyles.outer}><View style={[panelStyles.inner, { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ground }]}><ActivityIndicator size="large" color={palette.limeInk} /></View></View>
  );

  return (
    <View style={panelStyles.outer}>
      <SafeAreaView style={[panelStyles.inner, { flex: 1, backgroundColor: palette.ground }]} edges={['top']}>
        <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} locations={[0, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: openedFromSettings ? 390 : 300 }} />

        {toast ? <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 16, right: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 }}><View style={{ maxWidth: 430, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: toast.type === 'success' ? palette.lime : palette.danger }}>{toast.type === 'success' ? <Check size={15} color="#202117" strokeWidth={2.4} /> : <X size={15} color="#FFFFFF" strokeWidth={2.4} />}<Text style={{ color: toast.type === 'success' ? '#202117' : '#FFFFFF', fontSize: compactFont(13, compactTypography), fontWeight: '600' }}>{toast.message}</Text></View></View> : null}

        <View style={{ minHeight: isMobile ? 66 : openedFromSettings ? 58 : 56, paddingHorizontal: openedFromSettings ? 20 : 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goBack(); }} accessibilityRole="button" accessibilityLabel="Back" hitSlop={4} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton, opacity: pressed ? 0.62 : 1 })}><ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} /></Pressable>
          <View style={{ flex: 1, gap: 1 }}><Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Settings</Text><Text style={{ color: palette.ink, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Storefront Settings</Text></View>
          <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: storefrontLive ? palette.limeWashStrong : palette.input, borderWidth: 1, borderColor: storefrontLive ? palette.limeBorder : palette.edge }}><Store size={13} color={storefrontLive ? palette.limeInk : palette.faint} strokeWidth={2.2} /><Text style={{ color: storefrontLive ? palette.limeInk : palette.faint, fontSize: 11, fontWeight: '700' }}>{storefrontLive ? 'Live' : 'Hidden'}</Text></View>
        </View>

        <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: openedFromSettings ? 22 : 12, paddingBottom: isDesktop ? 64 : tabBarHeight + 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={110}>
          <View style={{ position: 'relative', overflow: 'hidden', minHeight: 194, marginBottom: 28, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface, shadowColor: '#000000', shadowOpacity: isDark ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
            <LinearGradient pointerEvents="none" colors={[palette.limeWashStrong, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
            <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}><LinearGradient colors={[palette.lime, palette.limeDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Store size={28} color="#202117" strokeWidth={2.1} /></LinearGradient><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Your public shop</Text><Text numberOfLines={1} style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 26, lineHeight: 31, letterSpacing: -0.7, marginTop: 2 }}>{storefrontLive ? 'Open for business' : 'Ready to publish'}</Text><Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12.5, marginTop: 3 }}>{displayHost}</Text></View></View>
            <Pressable onPress={() => storefrontEnabled ? openUrl(storefrontDashboardUrl) : router.push('/storefront-prototype' as never)} style={({ pressed }) => ({ height: 44, marginTop: 20, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: palette.lime, opacity: pressed ? 0.78 : 1 })}><ExternalLink size={16} color="#202117" strokeWidth={2.5} /><Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: compactFont(15, compactTypography) }}>{storefrontEnabled ? 'Manage storefront' : 'Preview fyll.store'}</Text></Pressable>
          </View>

          {error ? <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: palette.dangerWash, borderWidth: 1, borderColor: palette.dangerBorder }}><X size={17} color={palette.danger} /><Text style={{ flex: 1, color: palette.danger, fontSize: compactFont(13, compactTypography), lineHeight: 18, fontWeight: '500' }}>{error}</Text></View> : null}

          <SectionLabel palette={palette}>Publishing</SectionLabel>
          <View style={[cardStyle, { padding: 18, marginBottom: 26 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}><View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong }}><Store size={20} color={palette.limeInk} strokeWidth={2} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: palette.ink, fontSize: compactFont(15, compactTypography), fontWeight: '600' }}>Public storefront</Text><Text style={{ color: palette.faint, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{storefrontLive ? 'Visible to customers on Fyll' : 'Hidden from customers'}</Text></View><LimeToggle value={storefrontLive} onValueChange={(value) => { void Haptics.selectionAsync(); setStorefrontLive(value); }} accessibilityLabel="Public storefront" activeColor={palette.lime} inactiveColor={palette.input} inactiveBorderColor={palette.edgeStrong} /></View>
            <View style={{ height: 1, backgroundColor: palette.edge, marginVertical: 16 }} /><Text style={{ color: palette.muted, fontSize: 12.5, lineHeight: 19 }}>Publish a public shop link for this business. Customers can discover it on fyll.store or visit the dedicated merchant address.</Text>
          </View>

          <SectionLabel palette={palette}>Store address</SectionLabel>
          <View style={[cardStyle, { padding: 18, gap: 13, marginBottom: 26 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.input }}><Globe size={18} color={palette.limeInk} strokeWidth={2} /></View><View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: compactFont(15, compactTypography), fontWeight: '600' }}>Storefront handle</Text><Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>Used in every public storefront URL</Text></View><View style={{ height: 25, paddingHorizontal: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.input }}><LockKeyhole size={11} color={palette.faint} strokeWidth={2.2} /><Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Locked</Text></View></View>
            <View style={{ height: 52, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.input, justifyContent: 'center' }}><TextInput value={storefrontHandle} placeholder="e.g. mint-eyewear" placeholderTextColor={palette.faint} autoCapitalize="none" editable={false} selectionColor={palette.limeDeep} style={[{ color: palette.muted, fontSize: compactFont(15, compactTypography), paddingVertical: 0 }, webOutlineStyle]} /></View>
            <View style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.limeWash }}><ShieldCheck size={15} color={palette.limeInk} strokeWidth={2.2} /><Text numberOfLines={1} style={{ flex: 1, color: palette.limeInk, fontSize: 12, fontWeight: '600' }}>{storefrontPrimaryUrl}</Text></View>
            <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17 }}>The handle is locked because changing it also changes every storefront address.</Text>
            <Pressable onPress={() => setShowHandleRequest(true)} style={({ pressed }) => ({ height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.input, opacity: pressed ? 0.72 : 1 })}><Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Request a handle change</Text></Pressable>
          </View>

          <SectionLabel palette={palette}>Public links</SectionLabel>
          <View style={[cardStyle, { padding: 10, marginBottom: 26 }]}>
            {suggestedStorefrontUrls.map((item, index) => <Pressable key={item.id} onPress={() => openUrl(item.url)} style={({ pressed }) => ({ minHeight: 62, paddingHorizontal: 9, paddingVertical: 10, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? palette.input : 'transparent', borderBottomWidth: index < suggestedStorefrontUrls.length - 1 ? 1 : 0, borderBottomColor: palette.edge })}><View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: index === 0 ? palette.limeWashStrong : palette.input }}><Link2 size={16} color={index === 0 ? palette.limeInk : palette.faint} strokeWidth={2.1} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: palette.ink, fontSize: compactFont(13.5, compactTypography), fontWeight: '600' }}>{item.label}</Text><Text numberOfLines={1} style={{ color: palette.faint, fontSize: 11.5, marginTop: 3 }}>{item.url.replace(/^https?:\/\//, '')}</Text></View><ExternalLink size={15} color={palette.faint} strokeWidth={2} /></Pressable>)}
            <View style={{ marginTop: 8, padding: 12, borderRadius: 16, backgroundColor: palette.input, gap: 7 }}><Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11.5 }}>Discovery · {storefrontDiscoveryUrl.replace(/^https?:\/\//, '')}</Text><Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11.5 }}>Subdomain · {storefrontPremiumUrl.replace(/^https?:\/\//, '')}</Text></View>
          </View>

          <SectionLabel palette={palette}>Milestone badge</SectionLabel><MilestoneBadgeSetting />

          <Pressable onPress={handleSave} disabled={isSaving || !hasChanges} style={({ pressed }) => ({ height: 54, marginTop: 2, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: hasChanges ? palette.lime : palette.input, borderWidth: hasChanges ? 0 : 1, borderColor: palette.edgeStrong, opacity: isSaving ? 0.65 : pressed ? 0.78 : 1 })}>{isSaving ? <ActivityIndicator size="small" color={hasChanges ? '#202117' : palette.faint} /> : <Check size={17} color={hasChanges ? '#202117' : palette.faint} strokeWidth={2.5} />}{!isSaving ? <Text style={{ color: hasChanges ? '#202117' : palette.faint, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: compactFont(15, compactTypography) }}>{hasChanges ? 'Save storefront settings' : 'Storefront settings saved'}</Text> : null}</Pressable>
        </KeyboardAwareScrollView>

        <ChangeRequestModal visible={showHandleRequest} kind="storefront_handle" currentValue={storefrontHandle} onClose={() => setShowHandleRequest(false)} />
      </SafeAreaView>
    </View>
  );
}
