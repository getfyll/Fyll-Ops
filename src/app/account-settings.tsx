import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronDown, Lock, LogOut, Mail, ShieldCheck, User as UserIcon, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { PrimaryEmailCard } from '@/components/PrimaryEmailCard';
import { PasswordEyeToggle } from '@/components/PasswordEyeToggle';
import { useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';

type AccountSettingsScreenProps = { embeddedInSettings?: boolean };

type AccountPalette = {
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
  divider: string;
  input: string;
  topGlow: string;
  topGlowEnd: string;
  navButton: string;
  limeWash: string;
  limeWashStrong: string;
  limeBorder: string;
  dangerWash: string;
  dangerBorder: string;
  secondaryButton: string;
  overlay: string;
};

const DARK_PALETTE: AccountPalette = {
  ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84',
  lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00', danger: '#E5776D',
  edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.16)', divider: 'rgba(255,255,255,0.06)',
  input: 'rgba(255,255,255,0.055)', topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)',
  navButton: 'rgba(255,255,255,0.08)', limeWash: 'rgba(213,224,87,0.12)', limeWashStrong: 'rgba(213,224,87,0.14)',
  limeBorder: 'rgba(213,224,87,0.25)', dangerWash: 'rgba(229,119,109,0.14)', dangerBorder: 'rgba(229,119,109,0.28)',
  secondaryButton: 'rgba(255,255,255,0.06)', overlay: 'rgba(0,0,0,0.72)',
};

const LIGHT_PALETTE: AccountPalette = {
  ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C',
  lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400', danger: '#C9574D',
  edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.16)', divider: 'rgba(35,38,25,0.07)',
  input: '#F7F7F1', topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)',
  navButton: 'rgba(32,33,23,0.07)', limeWash: 'rgba(135,148,0,0.10)', limeWashStrong: 'rgba(135,148,0,0.13)',
  limeBorder: 'rgba(102,112,0,0.22)', dangerWash: 'rgba(201,87,77,0.10)', dangerBorder: 'rgba(201,87,77,0.22)',
  secondaryButton: 'rgba(32,33,23,0.045)', overlay: 'rgba(24,25,18,0.46)',
};

const webOutlineStyle = Platform.OS === 'web'
  ? ({ outlineStyle: 'none' } as unknown as TextStyle)
  : null;
const innerSettingsFont = (size: number) => Platform.OS === 'web'
  ? size
  : size === 15 ? 14 : size === 13.5 ? 12 : size === 13 ? 10 : size;

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: AccountPalette }) {
  return (
    <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: typeof UserIcon;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  trailing?: React.ReactNode;
  help?: string;
  palette: AccountPalette;
};

function AccountField({ label, value, onChangeText, placeholder, icon: Icon, secureTextEntry, keyboardType = 'default', trailing, help, palette }: FieldProps) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: palette.muted, fontFamily: 'DMSans_500Medium', fontSize: innerSettingsFont(13) }}>{label}</Text>
      <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.input, gap: 11 }}>
        <Icon size={18} color={palette.faint} strokeWidth={1.8} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'email-address'}
          selectionColor={palette.limeDeep}
          style={[{ flex: 1, minWidth: 0, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 15.5, paddingVertical: Platform.OS === 'web' ? 14 : 0 }, webOutlineStyle]}
        />
        {trailing}
      </View>
      {help ? <Text style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 }}>{help}</Text> : null}
    </View>
  );
}

export default function AccountSettingsScreen({ embeddedInSettings = false }: AccountSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const router = useRouter();
  const goBack = useSettingsBack();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const { isMobile } = useBreakpoint();
  const isEmbeddedWeb = Platform.OS === 'web' && (isFromSettingsRoute(from) || embeddedInSettings);
  const panelStyles = getSettingsWebPanelStyles(isEmbeddedWeb, palette.ground, palette.edge);
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const logout = useAuthStore((s) => s.logout);
  const { businessName } = useBusinessSettings();

  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });

  const [name, setName] = useState<string>(currentUser?.name ?? '');
  const [email, setEmail] = useState<string>(currentUser?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [passwordOpen, setPasswordOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [showSignOut, setShowSignOut] = useState<boolean>(false);

  const profileDirty = useMemo(
    () => name.trim() !== (currentUser?.name ?? '') || email.trim() !== (currentUser?.email ?? ''),
    [currentUser?.email, currentUser?.name, email, name]
  );
  const initial = (name.trim() || currentUser?.name || 'F').charAt(0).toUpperCase();
  const role = currentUser?.role ?? 'member';
  const roleLabel = `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  const businessLabel = businessName?.trim() || 'Fyll workspace';

  const clearFeedback = () => { setError(''); setNotice(''); };

  const handleUpdateProfile = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setIsLoading(true);
    clearFeedback();
    try {
      await updateProfile(name.trim(), email.trim());
      setNotice('Profile saved.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('We could not update your profile. Please try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Complete all three password fields.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setIsLoading(true);
    clearFeedback();
    try {
      const result = await updatePassword(currentPassword, newPassword);
      if (!result.success) {
        setError(result.error ?? 'We could not update your password.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordOpen(false);
      setNotice('Password updated securely.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('We could not update your password. Please try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setIsLoading(false);
      setShowSignOut(false);
    }
  };

  const contentMaxWidth = isEmbeddedWeb ? 1120 : 520;
  const cardStyle: ViewStyle = { overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.ground }} edges={['top']}>
          <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} locations={[0, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isEmbeddedWeb ? 250 : 300 }} />

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ minHeight: isMobile ? 66 : isEmbeddedWeb ? 78 : 56, paddingHorizontal: isEmbeddedWeb ? 20 : 10, paddingTop: isMobile ? 12 : isEmbeddedWeb ? 20 : 4, paddingBottom: isEmbeddedWeb ? 10 : 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={4} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton, opacity: pressed ? 0.62 : 1 })}>
                <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
              </Pressable>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 9.5, lineHeight: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Settings</Text>
                <Text style={{ color: palette.ink, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>My Account</Text>
              </View>
              <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.limeWashStrong, borderWidth: 1, borderColor: palette.limeBorder }}>
                <ShieldCheck size={13} color={palette.limeInk} strokeWidth={2.2} />
                <Text style={{ color: palette.limeInk, fontFamily: 'DMSans_700Bold', fontSize: 11 }}>Secure</Text>
              </View>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: isEmbeddedWeb ? 24 : 16, paddingTop: isEmbeddedWeb ? 18 : 12, paddingBottom: 140 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: isEmbeddedWeb ? 116 : 138,
                  marginBottom: isEmbeddedWeb ? 22 : 30,
                  padding: isEmbeddedWeb ? 18 : 20,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: palette.edge,
                  backgroundColor: palette.surface,
                  shadowColor: '#000000',
                  shadowOpacity: isDark ? 0.24 : 0.07,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 10 },
                }}
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={[palette.limeWashStrong, 'transparent']}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0.25, y: 1 }}
                  style={{ position: 'absolute', top: -45, right: -36, width: 190, height: 190, borderRadius: 95 }}
                />
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />

                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 17 }}>
                  <LinearGradient colors={[palette.lime, palette.limeDeep, palette.lime]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: isEmbeddedWeb ? 72 : 88, height: isEmbeddedWeb ? 72 : 88, borderRadius: isEmbeddedWeb ? 36 : 44, padding: 4 }}>
                    <View style={{ flex: 1, borderRadius: isEmbeddedWeb ? 32 : 40, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface }}>
                      <Text style={{ color: palette.limeInk, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: isEmbeddedWeb ? 30 : 36, lineHeight: isEmbeddedWeb ? 36 : 42 }}>{initial}</Text>
                    </View>
                    <View style={{ position: 'absolute', right: -1, bottom: 1, width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: palette.surface, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime }}>
                      <ShieldCheck size={14} color="#202117" strokeWidth={2.4} />
                    </View>
                  </LinearGradient>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 1.15, textTransform: 'uppercase', marginBottom: 4 }}>Account owner</Text>
                    <Text numberOfLines={1} style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 25, lineHeight: 29, letterSpacing: -0.55 }}>{name.trim() || 'Your name'}</Text>
                    <Text numberOfLines={1} style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: innerSettingsFont(13.5), lineHeight: 19, marginTop: 2 }}>{email.trim() || 'Add your email'}</Text>
                    <View style={{ alignSelf: 'flex-start', minHeight: 27, marginTop: 10, paddingHorizontal: 11, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: palette.limeWashStrong }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.limeInk }} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.limeInk, fontFamily: 'DMSans_700Bold', fontSize: 11.5 }}>{roleLabel} · {businessLabel}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {error || notice ? (
                <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: error ? palette.dangerWash : palette.limeWashStrong, borderWidth: 1, borderColor: error ? palette.dangerBorder : palette.limeBorder }}>
                  {error ? <X size={17} color={palette.danger} /> : <Check size={17} color={palette.limeInk} />}
                  <Text style={{ flex: 1, color: error ? palette.danger : palette.limeInk, fontFamily: 'DMSans_500Medium', fontSize: innerSettingsFont(13), lineHeight: 18 }}>{error || notice}</Text>
                </View>
              ) : null}

              <View style={isEmbeddedWeb ? { flexDirection: 'row', alignItems: 'flex-start', gap: 20 } : undefined}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <SectionLabel palette={palette}>Profile</SectionLabel>
                  <View style={[cardStyle, { padding: 18, gap: 14, marginBottom: 26 }]}>
                    <AccountField palette={palette} label="Name" value={name} onChangeText={(value) => { setName(value); clearFeedback(); }} placeholder="Your name" icon={UserIcon} />
                    <AccountField palette={palette} label="Email" value={email} onChangeText={(value) => { setEmail(value); clearFeedback(); }} placeholder="you@company.com" icon={Mail} keyboardType="email-address" help="We’ll send a link to confirm a new email address." />
                  </View>
                </View>
                <View style={{ flex: isEmbeddedWeb ? 1.15 : 1, minWidth: 0 }}>
                  <PrimaryEmailCard fieldBorderColor={palette.edgeStrong} appearance={isDark ? 'account-dark' : 'account-light'} />
                </View>
              </View>

              <View style={isEmbeddedWeb ? { flexDirection: 'row', alignItems: 'flex-start', gap: 20 } : undefined}>
              <View style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel palette={palette}>Security</SectionLabel>
              <View style={[cardStyle, { marginBottom: 26 }]}>
                <Pressable
                  onPress={() => { setPasswordOpen((value) => !value); clearFeedback(); void Haptics.selectionAsync(); }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: passwordOpen }}
                  style={({ pressed }) => ({ minHeight: 76, paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWash }}>
                    <Lock size={19} color={palette.limeInk} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ color: palette.ink, fontFamily: 'DMSans_600SemiBold', fontSize: 15.5 }}>Password</Text>
                    <Text style={{ color: palette.faint, fontFamily: 'DMSans_400Regular', fontSize: innerSettingsFont(13) }}>Change the password you sign in with</Text>
                  </View>
                  <View style={{ transform: [{ rotate: passwordOpen ? '180deg' : '0deg' }] }}><ChevronDown size={18} color={palette.faint} strokeWidth={2.2} /></View>
                </Pressable>

                {passwordOpen ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: palette.divider, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 18, gap: 13 }}>
                    <AccountField palette={palette} label="Current password" value={currentPassword} onChangeText={(value) => { setCurrentPassword(value); clearFeedback(); }} placeholder="Enter current password" icon={Lock} secureTextEntry={!showCurrentPassword} trailing={<PasswordEyeToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((value) => !value)} color={palette.faint} />} />
                    <AccountField palette={palette} label="New password" value={newPassword} onChangeText={(value) => { setNewPassword(value); clearFeedback(); }} placeholder="At least 6 characters" icon={Lock} secureTextEntry={!showNewPassword} trailing={<PasswordEyeToggle visible={showNewPassword} onToggle={() => setShowNewPassword((value) => !value)} color={palette.faint} />} />
                    <AccountField palette={palette} label="Confirm new password" value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); clearFeedback(); }} placeholder="Type it again" icon={Lock} secureTextEntry={!showConfirmPassword} trailing={<PasswordEyeToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} color={palette.faint} />} />
                    <Pressable onPress={handleUpdatePassword} disabled={isLoading} style={({ pressed }) => ({ height: 48, marginTop: 2, borderRadius: 999, borderWidth: 1, borderColor: palette.lime, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, shadowColor: palette.lime, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, opacity: isLoading ? 0.55 : pressed ? 0.72 : 1 })}>
                      {isLoading ? <ActivityIndicator color="#202117" /> : <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: innerSettingsFont(15) }}>Update password</Text>}
                    </Pressable>
                  </View>
                ) : null}
              </View>
              </View>

              <View style={isEmbeddedWeb ? { width: 320 } : undefined}>
              <SectionLabel palette={palette}>Session</SectionLabel>
              <View style={cardStyle}>
                <Pressable onPress={() => setShowSignOut(true)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.68 : 1 })}>
                  <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.dangerWash }}><LogOut size={19} color={palette.danger} strokeWidth={2} /></View>
                  <Text style={{ color: palette.danger, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 15.5 }}>Sign out</Text>
                </Pressable>
              </View>
              </View>
              </View>
            </ScrollView>

            {profileDirty ? (
              <LinearGradient colors={[palette.topGlowEnd, palette.ground, palette.ground]} locations={[0, 0.35, 1]} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 16, paddingBottom: 18 }}>
                <Pressable onPress={handleUpdateProfile} disabled={isLoading} style={({ pressed }) => ({ width: '100%', maxWidth: contentMaxWidth - 32, alignSelf: 'center', height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, shadowColor: palette.lime, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, opacity: isLoading ? 0.62 : pressed ? 0.78 : 1 })}>
                  {isLoading ? <ActivityIndicator color="#202117" /> : <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 17 }}>Save changes</Text>}
                </Pressable>
              </LinearGradient>
            ) : null}
          </KeyboardAvoidingView>

          <Modal visible={showSignOut} transparent animationType="fade" onRequestClose={() => setShowSignOut(false)}>
            <Pressable onPress={() => setShowSignOut(false)} style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.overlay }}>
              <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 390, borderRadius: 26, padding: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge, gap: 18 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 24, letterSpacing: -0.5 }}>Sign out of Fyll?</Text>
                  <Text style={{ color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 }}>You’ll need to enter your details again to access {businessLabel}.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={() => setShowSignOut(false)} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Cancel</Text></Pressable>
                  <Pressable onPress={handleSignOut} disabled={isLoading} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger, opacity: isLoading ? 0.6 : pressed ? 0.75 : 1 })}>
                    {isLoading ? <ActivityIndicator color={palette.surface} /> : <Text style={{ color: palette.surface, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Sign out</Text>}
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </View>
    </View>
  );
}
