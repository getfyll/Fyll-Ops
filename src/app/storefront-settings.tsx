import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ExternalLink, Globe, Store } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';

import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useThemeColors } from '@/lib/theme';
import {
  buildStorefrontDashboardUrl,
  buildStorefrontDiscoveryUrl,
  buildStorefrontSubdomainUrl,
  buildStorefrontUrl,
  buildSuggestedStorefrontUrls,
  resolveStorefrontSlug,
  STOREFRONT_PRIMARY_DOMAIN,
} from '@/lib/storefront-url';

export default function StorefrontSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const router = useRouter();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(
    openedFromSettings,
    colors.bg.primary,
    colors.border.light
  );
  const {
    businessName,
    companyName,
    storefrontEnabled,
    storefrontSlug,
    storefrontCustomDomain,
    isLoading,
    saveSettings,
  } = useBusinessSettings();

  const [storefrontLive, setStorefrontLive] = useState(false);
  const [storefrontHandle, setStorefrontHandle] = useState('');
  const [storefrontDomain, setStorefrontDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setStorefrontLive(storefrontEnabled);
      setStorefrontHandle(storefrontSlug);
      setStorefrontDomain(storefrontCustomDomain);
    }
  }, [isLoading, storefrontCustomDomain, storefrontEnabled, storefrontSlug]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  const storefrontSlugLabel = resolveStorefrontSlug({
    storefrontSlug: storefrontHandle,
    businessName,
    companyName,
  });
  const storefrontPrimaryUrl = buildStorefrontUrl({
    storefrontSlug: storefrontSlugLabel,
    businessName,
    companyName,
  });
  const storefrontDiscoveryUrl = buildStorefrontDiscoveryUrl({
    storefrontSlug: storefrontSlugLabel,
    businessName,
    companyName,
  });
  const storefrontPremiumUrl = buildStorefrontSubdomainUrl({
    storefrontSlug: storefrontSlugLabel,
    businessName,
    companyName,
  });
  const storefrontDashboardUrl = buildStorefrontDashboardUrl({
    storefrontSlug: storefrontSlugLabel,
    businessName,
    companyName,
  });
  const suggestedStorefrontUrls = buildSuggestedStorefrontUrls({
    storefrontSlug: storefrontSlugLabel,
    businessName,
    companyName,
  });
  const hasChanges = storefrontLive !== storefrontEnabled
    || storefrontHandle.trim() !== storefrontSlug
    || storefrontDomain.trim() !== storefrontCustomDomain;
  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    const justActivated = storefrontLive && !storefrontEnabled;

    try {
      const result = await saveSettings({
        storefrontEnabled: storefrontLive,
        storefrontSlug: storefrontHandle.trim(),
        storefrontCustomDomain: storefrontDomain.trim(),
      });

      if (result.success) {
        showToast('success', justActivated ? 'Storefront activated. Opening your dashboard…' : 'Storefront settings saved.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (justActivated) {
          Linking.openURL(storefrontDashboardUrl).catch(() => {});
        }

        goBack();
      } else {
        const message = result.error || 'Failed to save storefront settings.';
        setError(message);
        showToast('error', message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message
        ? `Failed to save storefront settings. ${saveError.message}`
        : 'Failed to save storefront settings.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={panelStyles.outer}>
        <View className="flex-1 items-center justify-center" style={panelStyles.inner}>
          <ActivityIndicator size="large" color={colors.text.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" edges={['top']}>
          <KeyboardAwareScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: openedFromSettings ? 28 : 20,
              paddingTop: openedFromSettings ? 28 : 16,
              paddingBottom: Platform.OS === 'web' ? 40 : 120,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={panelStyles.inner}
          >
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center flex-1">
                <Pressable
                  onPress={goBack}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: openedFromSettings ? 'transparent' : colors.bg.secondary }}
                >
                  <ArrowLeft size={22} color={colors.text.secondary} strokeWidth={2} />
                </Pressable>
                <View className="ml-3 flex-1">
                  <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">
                    Storefront
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                    Public shop links and storefront publishing.
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={handleSave}
                disabled={isSaving || !hasChanges}
                className="px-4 h-10 rounded-full items-center justify-center active:opacity-80"
                style={[
                  hasChanges ? primaryPillButtonStyle : { backgroundColor: colors.bg.secondary, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light },
                  { opacity: isSaving ? 0.7 : 1, minWidth: 96 },
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={hasChanges ? colors.bg.primary : colors.text.tertiary} />
                ) : (
                  <View className="flex-row items-center">
                    <Check size={16} color={hasChanges ? colors.bg.primary : colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: hasChanges ? colors.bg.primary : colors.text.tertiary }} className="font-semibold text-sm ml-1">Save</Text>
                  </View>
                )}
              </Pressable>
            </View>

            <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">Storefront</Text>

            <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center mb-2">
                    <Store size={16} color={colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Storefront Activation</Text>
                  </View>
                  <Text style={{ color: colors.text.muted }} className="text-xs leading-5">
                    Turn on your storefront to give this business a public shop link inside Fyll. Customers can discover stores on fyll.store and open this business directly on its own subdomain.
                  </Text>
                </View>

                <Switch
                  value={storefrontLive}
                  onValueChange={setStorefrontLive}
                  trackColor={{ false: colors.border.medium, true: colors.text.primary }}
                  thumbColor={colors.bg.primary}
                />
              </View>

              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <Globe size={16} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Storefront Handle</Text>
                </View>

                <View
                  className="rounded-xl px-4"
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    height: 50,
                    justifyContent: 'center',
                  }}
                >
                  <TextInput
                    value={storefrontHandle}
                    onChangeText={setStorefrontHandle}
                    placeholder="e.g. mint-eyewear"
                    placeholderTextColor={colors.input.placeholder}
                    autoCapitalize="none"
                    style={{ color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                </View>

                <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                  Live storefront: {storefrontPrimaryUrl}
                </Text>
              </View>

              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <Globe size={16} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Custom Domain</Text>
                  <Text style={{ color: colors.text.muted }} className="text-xs ml-2">Optional later</Text>
                </View>

                <View
                  className="rounded-xl px-4"
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    height: 50,
                    justifyContent: 'center',
                  }}
                >
                  <TextInput
                    value={storefrontDomain}
                    onChangeText={setStorefrontDomain}
                    placeholder="e.g. shop.yourbusiness.com"
                    placeholderTextColor={colors.input.placeholder}
                    autoCapitalize="none"
                    style={{ color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                </View>

                <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                  Launch first on {STOREFRONT_PRIMARY_DOMAIN}, then move to a custom domain later if needed.
                </Text>
              </View>

              <View className="rounded-2xl p-3 mb-4" style={{ backgroundColor: colors.bg.secondary }}>
                <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold mb-2">Suggested public links</Text>
                {suggestedStorefrontUrls.map((item, index) => (
                  <Text
                    key={item.id}
                    style={{ color: index === 0 ? colors.text.primary : colors.text.tertiary }}
                    className="text-xs mb-1"
                  >
                    {item.label}: {item.url}
                  </Text>
                ))}
                <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                  Discovery page: {storefrontDiscoveryUrl}
                </Text>
                <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                  Merchant subdomain: {storefrontPremiumUrl}
                </Text>
                {storefrontDomain.trim() ? (
                  <Text style={{ color: colors.text.primary }} className="text-xs mt-2">
                    Custom domain draft: https://{storefrontDomain.trim().replace(/^https?:\/\//, '')}
                  </Text>
                ) : null}
              </View>

              <View className="flex-row items-center justify-between">
                <Text style={{ color: storefrontEnabled ? '#16A34A' : colors.text.muted }} className="text-xs font-medium flex-1 pr-3">
                  {storefrontEnabled ? `Live on ${storefrontPrimaryUrl.replace(/^https?:\/\//, '')}.` : 'Storefront is currently hidden.'}
                </Text>

                {storefrontEnabled ? (
                  <Pressable
                    onPress={() => Linking.openURL(storefrontDashboardUrl).catch(() => {})}
                    className="flex-row items-center px-4 h-10 rounded-full active:opacity-80"
                    style={{ backgroundColor: colors.text.primary }}
                  >
                    <ExternalLink size={15} color={colors.bg.primary} strokeWidth={2} />
                    <Text style={{ color: colors.bg.primary }} className="text-sm font-semibold ml-2">Manage storefront</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.push('/storefront-prototype' as any)}
                    className="flex-row items-center px-4 h-10 rounded-full active:opacity-80"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <ExternalLink size={15} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold ml-2">Preview fyll.store</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {error ? (
              <Text className="text-red-500 text-xs text-center mb-4">{error}</Text>
            ) : null}

            {!openedFromSettings ? (
              <Pressable
                onPress={handleSave}
                disabled={isSaving || !hasChanges}
                className="rounded-full items-center active:opacity-80"
                style={{
                  backgroundColor: hasChanges ? colors.text.primary : colors.bg.secondary,
                  borderWidth: hasChanges ? 0 : 1,
                  borderColor: hasChanges ? 'transparent' : colors.border.light,
                  height: 54,
                  justifyContent: 'center',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={hasChanges ? colors.bg.primary : colors.text.tertiary} />
                ) : (
                  <Text
                    style={{ color: hasChanges ? colors.bg.primary : colors.text.tertiary }}
                    className="font-semibold text-base"
                  >
                    Save Changes
                  </Text>
                )}
              </Pressable>
            ) : null}

            <View className="h-24" />
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </View>

      {toast ? (
        <View
          className="absolute left-5 right-5 rounded-2xl px-4 py-3"
          style={{
            bottom: 24,
            backgroundColor: toast.type === 'success' ? '#111111' : '#DC2626',
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <Text className="text-white text-sm font-semibold text-center">{toast.message}</Text>
        </View>
      ) : null}
    </View>
  );
}
