import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Banknote, Building2, Camera, Check, ChevronRight, Flag, Globe, MapPin, MessageCircle, Pencil, ShieldCheck, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
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
import { COUNTRIES, CURRENCIES, CURRENCY_CODES, getCountry, type CurrencyCode } from '@/lib/locale';
import { EditFieldModal } from '@/components/settings/EditFieldModal';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';

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
  ground: '#FFFFFF', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C',
  lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400', danger: '#C9574D',
  edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)',
  input: '#F7F7F1', inputDisabled: '#F1F1EB',
  topGlow: 'rgba(255,255,255,0)', topGlowEnd: 'rgba(255,255,255,0)', navButton: 'rgba(32,33,23,0.07)',
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
    <Text style={{ color: palette.faint, fontWeight: '700', fontSize: 10, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

type PickerOption = { value: string; label: string; hint?: string };

function PickerRow({
  label, valueLabel, icon: Icon, palette, onPress, help, showDivider = false,
}: {
  label: string; valueLabel: string; icon: typeof Building2; palette: BusinessPalette;
  onPress: () => void; help?: string; showDivider?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: 76, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: showDivider ? 1 : 0, borderBottomColor: palette.edge, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong }}>
        <Icon size={18} color={palette.limeInk} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>{label}</Text>
        <Text style={{ color: palette.ink, fontSize: 12, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>{valueLabel}</Text>
        {help ? <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 3 }}>{help}</Text> : null}
      </View>
      <ChevronRight size={18} color={palette.faint} />
    </Pressable>
  );
}

function OptionSheet({
  visible, title, options, selected, palette, onSelect, onClose,
}: {
  visible: boolean; title: string; options: PickerOption[]; selected: string; palette: BusinessPalette;
  onSelect: (value: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, maxHeight: '70%', backgroundColor: palette.surface, borderRadius: 28, paddingTop: 18, paddingBottom: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 8 }}>
            <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 18 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton }}>
              <X size={16} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView>
            {options.map((option) => {
              const isSelected = option.value === selected;
              return (
                <Pressable key={option.value} onPress={() => onSelect(option.value)} style={({ pressed }) => ({ paddingHorizontal: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: isSelected ? palette.limeWash : pressed ? palette.input : 'transparent' })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14 }}>{option.label}</Text>
                    {option.hint ? <Text style={{ color: palette.faint, fontSize: 12, marginTop: 1 }}>{option.hint}</Text> : null}
                  </View>
                  {isSelected ? <Check size={18} color={palette.limeInk} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  grouped?: boolean;
  showDivider?: boolean;
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
  grouped = false,
  showDivider = false,
}: BusinessFieldProps) {
  const [editing, setEditing] = useState<boolean>(false);
  if (grouped) {
    return (
      <View style={{ minHeight: multiline ? 112 : 92, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 14, borderBottomWidth: showDivider ? 1 : 0, borderBottomColor: palette.edge }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong }}>
          <Icon size={18} color={palette.limeInk} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>{label}</Text>
            {badge ? <Text style={{ color: badgeColor ?? palette.faint, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.55 }}>{badge}</Text> : null}
          </View>
          <Text
            numberOfLines={multiline ? 4 : 1}
            selectable
            style={{ color: value ? (editable ? palette.ink : palette.muted) : palette.faint, fontSize: 12, lineHeight: 18, marginTop: 2 }}
          >
            {value || placeholder}
          </Text>
          {help ? <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{help}</Text> : null}
        </View>
        {editable && onChangeText ? (
          <>
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${label}`}
              hitSlop={8}
              style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: multiline ? 'flex-start' : 'center', backgroundColor: palette.navButton, opacity: pressed ? 0.6 : 1 })}
            >
              <Pencil size={14} color={palette.muted} strokeWidth={2.2} />
            </Pressable>
            <EditFieldModal
              visible={editing}
              title={label}
              value={value}
              placeholder={placeholder}
              help={help}
              multiline={multiline}
              keyboardType={keyboardType}
              autoComplete={autoComplete}
              palette={palette}
              onClose={() => setEditing(false)}
              onSave={(next) => { onChangeText(next); setEditing(false); }}
            />
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon size={15} color={palette.faint} strokeWidth={2} />
        <Text style={{ color: palette.muted, fontWeight: '500', fontSize: 12 }}>{label}</Text>
        {badge ? <Text style={{ color: badgeColor ?? palette.faint, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.55 }}>{badge}</Text> : null}
      </View>
      <View style={{ minHeight: multiline ? 112 : 52, paddingHorizontal: 15, paddingVertical: multiline ? 13 : 0, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: editable ? palette.input : palette.inputDisabled, justifyContent: multiline ? 'flex-start' : 'center' }}>
        <TextInput
          className="settings-field-input"
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
                            fontSize: 12,
              lineHeight: multiline ? 21 : 19,
              paddingVertical: 0,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            webOutlineStyle,
          ]}
        />
      </View>
      {help ? <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15 }}>{help}</Text> : null}
    </View>
  );
}

export default function BusinessSettingsScreen({ embeddedInSettings = false }: BusinessSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const { isDesktop, isMobile } = useBreakpoint();
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
    country: savedCountry,
    currency: savedCurrency,
    businessWebsite,
    returnAddress,
    isLoading,
    saveSettings,
  } = useBusinessSettings();

  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });

  const [company, setCompany] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [logo, setLogo] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [country, setCountry] = useState<string>('NG');
  const [currency, setCurrency] = useState<CurrencyCode>('NGN');
  const [openPicker, setOpenPicker] = useState<'country' | 'currency' | null>(null);
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
      setCountry(savedCountry);
      setCurrency(savedCurrency);
      setWebsite(businessWebsite);
      setAddress(returnAddress);
    }
  }, [businessLogo, businessName, businessPhone, businessWebsite, companyName, isLoading, returnAddress, savedCountry, savedCurrency]);

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
        country,
        currency,
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
    || country !== savedCountry
    || currency !== savedCurrency
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

          {toast ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 16, right: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 }}>
              <View style={{ maxWidth: 420, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: toast.type === 'success' ? palette.lime : palette.danger }}>
                {toast.type === 'success' ? <Check size={15} color="#202117" strokeWidth={2.4} /> : <X size={15} color="#FFFFFF" strokeWidth={2.4} />}
                <Text style={{ color: toast.type === 'success' ? '#202117' : '#FFFFFF', fontWeight: '600', fontSize: 12 }}>{toast.message}</Text>
              </View>
            </View>
          ) : null}

          <InternalSettingsHeader
            title="Business Details"
            description="Manage your business identity, customer contact, and return information."
            isDesktop={isDesktop}
            onBack={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goBack(); }}
            rightElement={isDesktop ? (
              <View style={{ height: 30, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.limeWashStrong, borderWidth: 1, borderColor: palette.limeBorder }}>
                <Building2 size={13} color={palette.limeInk} strokeWidth={2.2} />
                <Text style={{ color: palette.limeInk, fontWeight: '700', fontSize: 11 }}>Business</Text>
              </View>
            ) : undefined}
          />

          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: isEmbeddedWeb ? 24 : 16, paddingTop: isEmbeddedWeb ? 18 : 12, paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={110}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ position: 'relative', overflow: 'hidden', minHeight: isDesktop ? 138 : undefined, marginBottom: 20, padding: isDesktop ? 24 : 20, borderRadius: 28, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface, justifyContent: 'center' }}>
              <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <View style={{ minWidth: 0 }}>
                  <Text style={{ color: palette.faint, fontWeight: '700', fontSize: 10, letterSpacing: 1.15, textTransform: 'uppercase', marginBottom: 4 }}>Business identity</Text>
                  <Text numberOfLines={1} style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: isDesktop ? 29 : 18, lineHeight: isDesktop ? 34 : 24, letterSpacing: isDesktop ? -0.8 : -0.4 }}>{displayName.trim() || 'Your business'}</Text>
                  <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{company.trim() || 'Company details'}</Text>
                  <View style={{ alignSelf: 'flex-start', maxWidth: '100%', minHeight: 27, marginTop: 10, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.limeWashStrong }}>
                    <ShieldCheck size={12} color={palette.limeInk} strokeWidth={2.2} />
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.limeInk, fontWeight: '700', fontSize: 11 }}>{trackingSlugLabel ? `/${trackingSlugLabel}/order-tracking` : 'Customer links ready'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {error ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: palette.dangerWash, borderWidth: 1, borderColor: palette.dangerBorder }}>
                <X size={17} color={palette.danger} />
                <Text style={{ flex: 1, color: palette.danger, fontWeight: '500', fontSize: 12, lineHeight: 18 }}>{error}</Text>
              </View>
            ) : null}

            <SectionLabel palette={palette}>Brand</SectionLabel>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              <View style={{ minHeight: 82, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong }}><Camera size={18} color={palette.limeInk} strokeWidth={2} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Business logo</Text>
                  <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>Square PNG or JPG · maximum 400 KB</Text>
                </View>
                <Pressable onPress={handlePickImage} style={({ pressed }) => ({ minWidth: 76, height: 36, paddingHorizontal: 13, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, opacity: pressed ? 0.72 : 1 })}>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 12 }}>{logo ? 'Change' : 'Upload'}</Text>
                </Pressable>
                {logo ? (
                  <Pressable onPress={handleRemoveLogo} accessibilityLabel="Remove business logo" style={({ pressed }) => ({ width: 32, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <X size={15} color={palette.danger} strokeWidth={2.2} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <SectionLabel palette={palette}>Business information</SectionLabel>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              <BusinessField grouped showDivider palette={palette} label="Company name" value={company} placeholder="Registered company name" icon={Building2} editable={false} badge="Fixed" help="Your legal or registered company name cannot be changed here." />
              <BusinessField grouped showDivider palette={palette} label="Business name" value={displayName} placeholder="Customer-facing business name" icon={Building2} editable={false} badge="Locked" help={trackingSlugLabel ? `Customer-facing identity · /${trackingSlugLabel}/order-tracking` : 'Used on customer links and the tracking page.'} />
              <Pressable onPress={() => setShowBusinessNameRequest(true)} style={({ pressed }) => ({ minHeight: 66, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: palette.edge, opacity: pressed ? 0.65 : 1 })}>
                <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong }}><ShieldCheck size={18} color={palette.limeInk} strokeWidth={2} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14 }}>Request a business-name change</Text>
                  <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>Submit a request to update the locked customer-facing name.</Text>
                </View>
              </Pressable>
              <BusinessField grouped palette={palette} label="Website" value={website} onChangeText={(value) => { setWebsite(value); clearError(); }} placeholder="e.g. www.yourbusiness.com" icon={Globe} keyboardType="url" />
            </View>

            <SectionLabel palette={palette}>Region</SectionLabel>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              <PickerRow palette={palette} label="Country" valueLabel={getCountry(country).name} icon={Flag} showDivider onPress={() => setOpenPicker('country')} />
              <PickerRow palette={palette} label="Currency" valueLabel={`${CURRENCIES[currency].name} (${CURRENCIES[currency].symbol.trim()})`} icon={Banknote} onPress={() => setOpenPicker('currency')} help="Prices across orders, invoices and your payment pages use this currency." />
            </View>

            <SectionLabel palette={palette}>Customer details</SectionLabel>
            <View style={cardStyle}>
              <BusinessField grouped showDivider palette={palette} label="WhatsApp number" value={phone} onChangeText={(value) => { setPhone(value); clearError(); }} placeholder="e.g. +234 800 123 4567" icon={MessageCircle} keyboardType="phone-pad" autoComplete="tel" badge="Required" badgeColor="#25A95B" help="Used from payment and tracking pages. Include the country code." />
              <BusinessField grouped palette={palette} label="Return address" value={address} onChangeText={(value) => { setAddress(value); clearError(); }} placeholder={'Enter your business return address\ne.g. 123 Main Street\nLagos, Nigeria'} icon={MapPin} multiline help="This address appears on shipping labels." />
            </View>
          </KeyboardAwareScrollView>

          <OptionSheet
            visible={openPicker === 'country'}
            title="Select country"
            palette={palette}
            selected={country}
            options={COUNTRIES.map((c) => ({ value: c.code, label: c.name, hint: CURRENCIES[c.currency].code }))}
            onClose={() => setOpenPicker(null)}
            onSelect={(value) => {
              void Haptics.selectionAsync();
              // Picking a country suggests its usual currency; it can still be changed.
              if (value !== country) setCurrency(getCountry(value).currency);
              setCountry(value);
              clearError();
              setOpenPicker(null);
            }}
          />
          <OptionSheet
            visible={openPicker === 'currency'}
            title="Select currency"
            palette={palette}
            selected={currency}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: CURRENCIES[code].name, hint: `${code} · ${CURRENCIES[code].symbol.trim()}` }))}
            onClose={() => setOpenPicker(null)}
            onSelect={(value) => {
              void Haptics.selectionAsync();
              setCurrency(value as CurrencyCode);
              clearError();
              setOpenPicker(null);
            }}
          />

          {hasChanges ? (
            <LinearGradient colors={[palette.topGlowEnd, palette.ground, palette.ground]} locations={[0, 0.35, 1]} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 16, paddingBottom: 18 }}>
              <Pressable onPress={handleSave} disabled={isSaving} style={({ pressed }) => ({ width: '100%', maxWidth: contentMaxWidth - 32, alignSelf: 'center', height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, shadowColor: palette.lime, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, opacity: isSaving ? 0.62 : pressed ? 0.78 : 1 })}>
                {isSaving ? <ActivityIndicator color="#202117" /> : <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Save changes</Text>}
              </Pressable>
            </LinearGradient>
          ) : null}

          <ChangeRequestModal visible={showBusinessNameRequest} kind="business_name" currentValue={displayName || businessName} onClose={() => setShowBusinessNameRequest(false)} />
        </SafeAreaView>
      </View>
    </View>
  );
}
