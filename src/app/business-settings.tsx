import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Building2, Camera, Check, Globe, MapPin, MessageCircle, ShieldCheck, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ChangeRequestModal } from '@/components/ChangeRequestModal';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { compressImage } from '@/lib/image-compression';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import useAuthStore from '@/lib/state/auth-store';
import { uploadBusinessPublicAsset } from '@/lib/storage-attachments';

const MAX_LOGO_PICK_SIZE_BYTES = 400 * 1024;
const MAX_LOGO_DATA_URL_BYTES = 400 * 1024;

type BusinessPalette = {
  ground: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  lime: string;
  limeInk: string;
  limeDeep: string;
  danger: string;
  edge: string;
  edgeStrong: string;
  input: string;
  inputDisabled: string;
  topGlow: string;
  topGlowEnd: string;
  navButton: string;
  limeWash: string;
  limeWashStrong: string;
  limeBorder: string;
  dangerWash: string;
  dangerBorder: string;
};

const DARK_PALETTE: BusinessPalette = {
  ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84',
  lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00', danger: '#E5776D',
  edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)',
  input: 'rgba(255,255,255,0.055)', inputDisabled: 'rgba(255,255,255,0.025)',
  topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)', navButton: 'rgba(255,255,255,0.08)',
  limeWash: 'rgba(213,224,87,0.12)', limeWashStrong: 'rgba(213,224,87,0.14)', limeBorder: 'rgba(213,224,87,0.25)',
  dangerWash: 'rgba(229,119,109,0.14)', dangerBorder: 'rgba(229,119,109,0.28)',
};

const LIGHT_PALETTE: BusinessPalette = {
  ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C',
  lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400', danger: '#C9574D',
  edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)',
  input: '#F7F7F1', inputDisabled: '#F1F1EB',
  topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)', navButton: 'rgba(32,33,23,0.07)',
  limeWash: 'rgba(135,148,0,0.10)', limeWashStrong: 'rgba(135,148,0,0.13)', limeBorder: 'rgba(102,112,0,0.22)',
  dangerWash: 'rgba(201,87,77,0.10)', dangerBorder: 'rgba(201,87,77,0.22)',
};

const webOutlineStyle = Platform.OS === 'web'
  ? ({ outlineStyle: 'none' } as unknown as TextStyle)
  : null;
const innerSettingsFont = (size: number) => Platform.OS === 'web'
  ? size
  : size === 15 ? 14 : size === 13.5 ? 12 : size === 13 ? 10 : size;

type BusinessSettingsScreenProps = { embeddedInSettings?: boolean };

const estimateDataUrlBytes = (value: string) => {
  const base64MarkerIndex = value.indexOf('base64,');
  if (base64MarkerIndex === -1) return value.length;
  const base64 = value.slice(base64MarkerIndex + 'base64,'.length);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: BusinessPalette }) {
  return (
    <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

type BusinessFieldProps = {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder: string;
  icon: typeof Building2;
  palette: BusinessPalette;
  keyboardType?: 'default' | 'url' | 'phone-pad';
  autoComplete?: 'tel';
  editable?: boolean;
  badge?: string;
  badgeColor?: string;
  help?: string;
  multiline?: boolean;
};

function BusinessField({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  palette,
  keyboardType = 'default',
  autoComplete,
  editable = true,
  badge,
  badgeColor,
  help,
  multiline = false,
}: BusinessFieldProps) {
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon size={15} color={palette.faint} strokeWidth={2} />
        <Text style={{ color: palette.muted, fontFamily: 'DMSans_500Medium', fontSize: innerSettingsFont(13) }}>{label}</Text>
        {badge ? <Text style={{ color: badgeColor ?? palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.55 }}>{badge}</Text> : null}
      </View>
      <View style={{ minHeight: multiline ? 112 : 52, paddingHorizontal: 15, paddingVertical: multiline ? 13 : 0, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: editable ? palette.input : palette.inputDisabled, justifyContent: multiline ? 'flex-start' : 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'url'}
          editable={editable}
          selectTextOnFocus={editable}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          selectionColor={palette.limeDeep}
          style={[
            {
              color: editable ? palette.ink : palette.muted,
              fontFamily: 'DMSans_400Regular',
              fontSize: innerSettingsFont(15),
              lineHeight: multiline ? 21 : 19,
              paddingVertical: 0,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            webOutlineStyle,
          ]}
        />
      </View>
      {help ? <Text style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 }}>{help}</Text> : null}
    </View>
  );
}

export default function BusinessSettingsScreen({ embeddedInSettings = false }: BusinessSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const { isMobile } = useBreakpoint();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const openedFromSettings = isFromSettingsRoute(from);
  const isEmbeddedWeb = Platform.OS === 'web' && (openedFromSettings || embeddedInSettings) && !isMobile;
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings || embeddedInSettings, palette.ground, palette.edge);
  const {
    companyName,
    businessName,
    businessSlug,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
    isLoading,
    saveSettings,
  } = useBusinessSettings();

  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });

  const [company, setCompany] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [logo, setLogo] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showBusinessNameRequest, setShowBusinessNameRequest] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    if (!isLoading) {
      setCompany(companyName);
      setDisplayName(businessName);
      setLogo(businessLogo);
      setPhone(businessPhone);
      setWebsite(businessWebsite);
      setAddress(returnAddress);
    }
  }, [businessLogo, businessName, businessPhone, businessWebsite, companyName, isLoading, returnAddress]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const clearError = () => setError(null);

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        const message = 'Allow photo-library access to upload a business logo.';
        setError(message);
        showToast('error', message);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;

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
      clearError();
      setLogo(compressedUri);
    } catch (pickerError) {
      const message = pickerError instanceof Error && pickerError.message ? `Failed to pick logo. ${pickerError.message}` : 'Failed to pick logo.';
      setError(message);
      showToast('error', message);
    }
  };

  const handleRemoveLogo = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogo(null);
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      let nextLogo = logo;
      if (businessId && nextLogo && /^(data:image\/|blob:|file:)/i.test(nextLogo)) {
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

      if (!result.success) {
        const message = result.error ?? 'Failed to save settings.';
        setError(message);
        showToast('error', message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      showToast('success', 'Business settings saved.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goBack();
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message ? `Failed to save settings. ${saveError.message}` : 'Failed to save settings.';
      setError(message);
      showToast('error', message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const trackingSlugLabel = businessSlug || displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const hasChanges = company.trim() !== companyName.trim()
    || displayName.trim() !== businessName.trim()
    || logo !== businessLogo
    || phone !== businessPhone
    || website !== businessWebsite
    || address !== returnAddress;
  const contentMaxWidth = isEmbeddedWeb ? 1120 : 520;
  const cardStyle: ViewStyle = { overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface };

  if (isLoading) {
    return (
      <View style={panelStyles.outer}>
        <View style={[panelStyles.inner, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={palette.limeInk} />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.ground }} edges={['top']}>
          {!isEmbeddedWeb ? <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} locations={[0, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }} /> : null}

          {toast ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 16, right: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 }}>
              <View style={{ maxWidth: 420, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: toast.type === 'success' ? palette.lime : palette.danger }}>
                {toast.type === 'success' ? <Check size={15} color="#202117" strokeWidth={2.4} /> : <X size={15} color="#FFFFFF" strokeWidth={2.4} />}
                <Text style={{ color: toast.type === 'success' ? '#202117' : '#FFFFFF', fontFamily: 'DMSans_600SemiBold', fontSize: innerSettingsFont(13) }}>{toast.message}</Text>
              </View>
            </View>
          ) : null}

          <View style={{ minHeight: isMobile ? 66 : isEmbeddedWeb ? 78 : 56, paddingHorizontal: isEmbeddedWeb ? 20 : 10, paddingTop: isMobile ? 12 : isEmbeddedWeb ? 20 : 4, paddingBottom: isEmbeddedWeb ? 10 : 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goBack(); }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={4}
              style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton, opacity: pressed ? 0.62 : 1 })}
            >
              <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 9.5, lineHeight: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Settings</Text>
              <Text style={{ color: palette.ink, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Business Settings</Text>
            </View>
            <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.limeWashStrong, borderWidth: 1, borderColor: palette.limeBorder }}>
              <Building2 size={13} color={palette.limeInk} strokeWidth={2.2} />
              <Text style={{ color: palette.limeInk, fontFamily: 'DMSans_700Bold', fontSize: 11 }}>Business</Text>
            </View>
          </View>

          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: isEmbeddedWeb ? 24 : 16, paddingTop: isEmbeddedWeb ? 18 : 12, paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={110}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ position: 'relative', overflow: 'hidden', minHeight: isEmbeddedWeb ? 116 : 144, marginBottom: isEmbeddedWeb ? 22 : 30, padding: isEmbeddedWeb ? 18 : 20, borderRadius: 28, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface, shadowColor: '#000000', shadowOpacity: isDark ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
              <LinearGradient pointerEvents="none" colors={[palette.limeWashStrong, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 1 }} style={{ position: 'absolute', top: -45, right: -36, width: 190, height: 190, borderRadius: 95 }} />
              <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <View style={{ minWidth: 0 }}>
                  <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 1.15, textTransform: 'uppercase', marginBottom: 4 }}>Business identity</Text>
                  <Text numberOfLines={1} style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 24, lineHeight: 29, letterSpacing: -0.55 }}>{displayName.trim() || 'Your business'}</Text>
                  <Text numberOfLines={1} style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: innerSettingsFont(13), lineHeight: 18, marginTop: 2 }}>{company.trim() || 'Company details'}</Text>
                  <View style={{ alignSelf: 'flex-start', maxWidth: '100%', minHeight: 27, marginTop: 10, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.limeWashStrong }}>
                    <ShieldCheck size={12} color={palette.limeInk} strokeWidth={2.2} />
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.limeInk, fontFamily: 'DMSans_700Bold', fontSize: 11 }}>{trackingSlugLabel ? `/${trackingSlugLabel}/order-tracking` : 'Customer links ready'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {error ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: palette.dangerWash, borderWidth: 1, borderColor: palette.dangerBorder }}>
                <X size={17} color={palette.danger} />
                <Text style={{ flex: 1, color: palette.danger, fontFamily: 'DMSans_500Medium', fontSize: innerSettingsFont(13), lineHeight: 18 }}>{error}</Text>
              </View>
            ) : null}

            <View>
            <View>
            <SectionLabel palette={palette}>Brand</SectionLabel>
            <View style={[cardStyle, { padding: 18, gap: 12, marginBottom: 26 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWash }}><Camera size={19} color={palette.limeInk} strokeWidth={2} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.ink, fontFamily: 'DMSans_600SemiBold', fontSize: innerSettingsFont(15) }}>Business logo</Text>
                  <Text style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: 12.5, lineHeight: 17 }}>Square PNG or JPG · maximum 400 KB</Text>
                </View>
                <Pressable onPress={handlePickImage} style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.input, opacity: pressed ? 0.72 : 1 })}>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: innerSettingsFont(13) }}>{logo ? 'Change' : 'Upload'}</Text>
                </Pressable>
                {logo ? (
                  <Pressable onPress={handleRemoveLogo} style={({ pressed }) => ({ height: 38, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.dangerWash, opacity: pressed ? 0.72 : 1 })}>
                    <Text style={{ color: palette.danger, fontFamily: 'DMSans_600SemiBold', fontSize: innerSettingsFont(12) }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            </View>

            <View>
            <SectionLabel palette={palette}>Business information</SectionLabel>
            <View style={[cardStyle, { padding: 18, gap: 17, marginBottom: 26 }]}>
              <BusinessField palette={palette} label="Company name" value={company} placeholder="Registered company name" icon={Building2} editable={false} badge="Fixed" help="Your legal or registered company name cannot be changed here." />
              <BusinessField palette={palette} label="Business name" value={displayName} placeholder="Customer-facing business name" icon={Building2} editable={false} badge="Locked" help="Used on customer links and as the tracking-page fallback when no logo is set." />
              {trackingSlugLabel ? <Text style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: -9 }}>Tracking slug: /{trackingSlugLabel}/order-tracking</Text> : null}
              <Pressable onPress={() => setShowBusinessNameRequest(true)} hitSlop={6} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
                <Text style={{ color: palette.limeInk, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: innerSettingsFont(13), textDecorationLine: 'underline' }}>Request a business-name change</Text>
              </Pressable>
              <BusinessField palette={palette} label="Website" value={website} onChangeText={(value) => { setWebsite(value); clearError(); }} placeholder="e.g. www.yourbusiness.com" icon={Globe} keyboardType="url" />
            </View>
            </View>
            </View>

            <View>
            <View>
            <SectionLabel palette={palette}>Customer contact</SectionLabel>
            <View style={[cardStyle, { padding: 18, marginBottom: 26 }]}>
              <BusinessField palette={palette} label="WhatsApp number" value={phone} onChangeText={(value) => { setPhone(value); clearError(); }} placeholder="e.g. +234 800 123 4567" icon={MessageCircle} keyboardType="phone-pad" autoComplete="tel" badge="Required" badgeColor="#25A95B" help="Customers use this from payment and tracking pages. Include the country code." />
            </View>
            </View>

            <View>
            <SectionLabel palette={palette}>Return address</SectionLabel>
            <View style={[cardStyle, { padding: 18 }]}>
              <BusinessField palette={palette} label="Address for shipping labels" value={address} onChangeText={(value) => { setAddress(value); clearError(); }} placeholder={'Enter your business return address\ne.g. 123 Main Street\nLagos, Nigeria'} icon={MapPin} multiline help="This address appears on shipping labels." />
            </View>
            </View>
            </View>
          </KeyboardAwareScrollView>

          {hasChanges ? (
            <LinearGradient colors={[palette.topGlowEnd, palette.ground, palette.ground]} locations={[0, 0.35, 1]} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 16, paddingBottom: 18 }}>
              <Pressable onPress={handleSave} disabled={isSaving} style={({ pressed }) => ({ width: '100%', maxWidth: contentMaxWidth - 32, alignSelf: 'center', height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, shadowColor: palette.lime, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, opacity: isSaving ? 0.62 : pressed ? 0.78 : 1 })}>
                {isSaving ? <ActivityIndicator color="#202117" /> : <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 17 }}>Save changes</Text>}
              </Pressable>
            </LinearGradient>
          ) : null}

          <ChangeRequestModal visible={showBusinessNameRequest} kind="business_name" currentValue={displayName || businessName} onClose={() => setShowBusinessNameRequest(false)} />
        </SafeAreaView>
      </View>
    </View>
  );
}
