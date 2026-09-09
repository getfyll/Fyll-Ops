import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Building2, Camera, X, Check, Phone, Globe, MapPin } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { compressImage } from '@/lib/image-compression';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import useAuthStore from '@/lib/state/auth-store';
import { uploadBusinessPublicAsset } from '@/lib/storage-attachments';

const MAX_LOGO_PICK_SIZE_BYTES = 400 * 1024;
const MAX_LOGO_DATA_URL_BYTES = 400 * 1024;

const estimateDataUrlBytes = (value: string) => {
  const base64MarkerIndex = value.indexOf('base64,');
  if (base64MarkerIndex === -1) return value.length;
  const base64 = value.slice(base64MarkerIndex + 'base64,'.length);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

export default function BusinessSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(
    openedFromSettings,
    colors.bg.primary,
    colors.border.light
  );
  const {
    companyName,
    businessName,
    businessSlug,
    canEditBusinessName,
    businessNameNextEditableAt,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
    isLoading,
    saveSettings,
  } = useBusinessSettings();

  const [company, setCompany] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  // Initialize form with current values
  useEffect(() => {
    if (!isLoading) {
      setCompany(companyName);
      setDisplayName(businessName);
      setLogo(businessLogo);
      setPhone(businessPhone);
      setWebsite(businessWebsite);
      setAddress(returnAddress);
    }
  }, [
    isLoading,
    companyName,
    businessName,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
  ]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload a logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > MAX_LOGO_PICK_SIZE_BYTES) {
          const message = 'Logo is too large. Use an image under 400 KB.';
          setError(message);
          showToast('error', message);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const compressedUri = await compressImage(asset.uri, { maxDimension: 900, quality: 0.62, format: 'png' });
        if (compressedUri.startsWith('data:image/') && estimateDataUrlBytes(compressedUri) > MAX_LOGO_DATA_URL_BYTES) {
          const message = 'Logo is still too large after compression. Try a smaller image.';
          setError(message);
          showToast('error', message);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        setError(null);
        setLogo(compressedUri);
      }
    } catch (pickerError) {
      const message = pickerError instanceof Error && pickerError.message
        ? `Failed to pick logo. ${pickerError.message}`
        : 'Failed to pick logo.';
      setError(message);
      showToast('error', message);
      Alert.alert('Error', message);
    }
  };

  const handleRemoveLogo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogo(null);
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    try {
      let nextLogo = logo;

      if (
        businessId
        && nextLogo
        && /^(data:image\/|blob:|file:)/i.test(nextLogo)
      ) {
        const uploadedLogo = await uploadBusinessPublicAsset({
          businessId,
          folder: 'business-logo',
          uri: nextLogo,
          fileName: `${displayName.trim() || company.trim() || 'business'}-logo.png`,
          mimeType: 'image/png',
          compressImages: true,
        });
        nextLogo = uploadedLogo.publicUrl;
        setLogo(uploadedLogo.publicUrl);
      }

      const result = await saveSettings({
        companyName: company.trim(),
        businessName: displayName.trim(),
        businessLogo: nextLogo,
        businessPhone: phone.trim(),
        businessWebsite: website.trim(),
        returnAddress: address.trim(),
      });

      if (result.success) {
        showToast('success', 'Business settings saved.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        goBack();
      } else {
        const message = result.error || 'Failed to save settings.';
        setError(message);
        showToast('error', message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message
        ? `Failed to save settings. ${saveError.message}`
        : 'Failed to save settings.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const nextBusinessNameEditLabel = businessNameNextEditableAt
    ? new Date(businessNameNextEditableAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const trackingSlugLabel = businessSlug || displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const hasChanges = company.trim() !== companyName.trim()
    || displayName.trim() !== businessName.trim()
    || logo !== businessLogo
    || phone !== businessPhone
    || website !== businessWebsite
    || address !== returnAddress;
  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;

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
        {toast ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 18,
              left: 16,
              right: 16,
              alignItems: 'center',
              zIndex: 9999,
              elevation: 9999,
            }}
          >
            <View
              style={{
                maxWidth: 420,
                borderRadius: 999,
                backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                {toast.message}
              </Text>
            </View>
          </View>
        ) : null}
        {/* Header */}
        <View
          className="px-5 pt-4 pb-3 flex-row items-center justify-between"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
            ...(Platform.OS === 'web' ? { paddingTop: 10, paddingBottom: 10 } : {}),
          }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                goBack();
              }}
              className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
              style={{ backgroundColor: 'transparent' }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: Platform.OS === 'web' ? 14 : 20,
                lineHeight: Platform.OS === 'web' ? 18 : 24,
                fontWeight: '600',
              }}
            >
              Business Settings
            </Text>
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

        <KeyboardAwareScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={100}>
          {/* Business Logo */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">Business Logo</Text>

          <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
            <View className="items-center">
              {logo ? (
                <View className="relative">
                  <Image
                    source={{ uri: logo }}
                    className="w-24 h-24 rounded-2xl"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={handleRemoveLogo}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: '#EF4444' }}
                  >
                    <X size={14} color="#FFFFFF" strokeWidth={2.5} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickImage}
                  className="w-24 h-24 rounded-2xl items-center justify-center active:opacity-80"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.border.light, borderStyle: 'dashed' }}
                >
                  <Camera size={28} color={colors.text.tertiary} strokeWidth={1.5} />
                </Pressable>
              )}

              <Pressable
                onPress={handlePickImage}
                className="mt-3 px-4 py-2 rounded-lg active:opacity-70"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium">
                  {logo ? 'Change Logo' : 'Upload Logo'}
                </Text>
              </Pressable>

              <Text style={{ color: colors.text.muted }} className="text-xs mt-2 text-center">
                Optional. Square images work best. Max 400 KB. Large logos are compressed automatically.
              </Text>
            </View>
          </View>

          {/* Business Information */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">Business Information</Text>

          <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
            {/* Company Name */}
            <View className="mb-4">
              <View className="flex-row items-center mb-2">
                <Building2 size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Company Name</Text>
                <Text style={{ color: colors.text.muted }} className="text-xs ml-2">Fixed</Text>
              </View>

              <View
                className="rounded-xl px-4"
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  height: 50,
                  justifyContent: 'center'
                }}
              >
                <TextInput
                  value={company}
                  placeholder="Registered company name"
                  placeholderTextColor={colors.input.placeholder}
                  style={{ color: colors.text.primary, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>

              <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                This is your legal or registered company name and cannot be changed here.
              </Text>
            </View>

            {/* Business Name */}
            <View className="mb-4">
              <View className="flex-row items-center mb-2">
                <Building2 size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Business Name</Text>
                <Text style={{ color: colors.text.muted }} className="text-xs ml-2">
                  {canEditBusinessName ? 'Editable' : 'Locked'}
                </Text>
              </View>

              <View
                className="rounded-xl px-4"
                style={{
                  backgroundColor: canEditBusinessName ? colors.input.bg : colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  height: 50,
                  justifyContent: 'center'
                }}
              >
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Customer-facing business name"
                  placeholderTextColor={colors.input.placeholder}
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                  editable={canEditBusinessName}
                  autoCapitalize="words"
                />
              </View>

              <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
                This is used for your customer tracking URL and as the text fallback on the tracking page when no logo is set.
              </Text>
              {trackingSlugLabel ? (
                <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                  Tracking slug: /{trackingSlugLabel}/order-tracking
                </Text>
              ) : null}
              <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                {canEditBusinessName
                  ? 'You can change this business name once every 12 months.'
                  : `Business name can only be changed once every 12 months. Next edit available ${nextBusinessNameEditLabel}.`}
              </Text>
            </View>

            {/* Business Phone */}
            <View className="mb-4">
              <View className="flex-row items-center mb-2">
                <Phone size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Phone Number</Text>
              </View>

              <View
                className="rounded-xl px-4"
                style={{
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  height: 50,
                  justifyContent: 'center'
                }}
              >
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. +234 800 123 4567"
                  placeholderTextColor={colors.input.placeholder}
                  keyboardType="phone-pad"
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>

            {/* Business Website */}
            <View>
              <View className="flex-row items-center mb-2">
                <Globe size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Website</Text>
              </View>

              <View
                className="rounded-xl px-4"
                style={{
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  height: 50,
                  justifyContent: 'center'
                }}
              >
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="e.g. www.yourbusiness.com"
                  placeholderTextColor={colors.input.placeholder}
                  keyboardType="url"
                  autoCapitalize="none"
                  style={{ color: colors.input.text, fontSize: 14 }}
                  selectionColor={colors.text.primary}
                />
              </View>
            </View>
          </View>

          {/* Return Address (for Shipping Labels) */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">Return Address</Text>

          <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
            <View className="flex-row items-center mb-2">
              <MapPin size={16} color={colors.text.tertiary} strokeWidth={2} />
              <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Address for Shipping Labels</Text>
            </View>

            <View
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 100
              }}
            >
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Enter your business return address&#10;e.g. 123 Main Street&#10;Lagos, Nigeria"
                placeholderTextColor={colors.input.placeholder}
                multiline
                numberOfLines={4}
                style={{ color: colors.input.text, fontSize: 14, textAlignVertical: 'top' }}
                selectionColor={colors.text.primary}
              />
            </View>

            <Text style={{ color: colors.text.muted }} className="text-xs mt-2">
              This address will appear on shipping labels.
            </Text>
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
    </View>
  );
}
