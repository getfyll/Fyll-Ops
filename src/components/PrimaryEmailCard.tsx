import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Lock, Mail } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import { PasswordEyeToggle } from '@/components/PasswordEyeToggle';
import useAuthStore from '@/lib/state/auth-store';
import {
  fetchBusinessPrimaryLink,
  fetchIsPrimaryAccount,
  linkPrimaryEmail,
  resendPrimaryVerification,
  makeLoginEmailPrimary,
  verifyPrimaryEmail,
} from '@/lib/primary-account';

// Account settings: the founder's primary email. Work logins (like admin@mint.co) keep
// working; the primary email is one sign-in for every Fyll product and can own several
// businesses.
export function PrimaryEmailCard({ fieldBorderColor, appearance = 'default' }: { fieldBorderColor: string; appearance?: 'default' | 'account-dark' | 'account-light' }) {
  const themeColors = useThemeColors();
  const colors = appearance === 'account-dark'
    ? {
        ...themeColors,
        bg: { ...themeColors.bg, primary: '#141414', card: '#1E1E1E' },
        text: { ...themeColors.text, primary: '#F4F4EF', secondary: '#B9BAB0', tertiary: '#8C8D84', muted: '#73746D' },
        border: { ...themeColors.border, light: 'rgba(255,255,255,0.09)', medium: 'rgba(255,255,255,0.16)' },
        input: { ...themeColors.input, bg: 'rgba(255,255,255,0.055)', text: '#F4F4EF', placeholder: '#8C8D84' },
      }
    : appearance === 'account-light'
      ? {
          ...themeColors,
          bg: { ...themeColors.bg, primary: '#F4F3EB', card: '#FFFFFF' },
          text: { ...themeColors.text, primary: '#202117', secondary: '#5E6056', tertiary: '#85877C', muted: '#85877C' },
          border: { ...themeColors.border, light: 'rgba(35,38,25,0.09)', medium: 'rgba(35,38,25,0.16)' },
          input: { ...themeColors.input, bg: '#F7F7F1', text: '#202117', placeholder: '#85877C' },
        }
      : themeColors;
  const eyeColor = appearance === 'account-dark' ? '#8C8D84' : appearance === 'account-light' ? '#85877C' : undefined;
  const usesAccountAppearance = appearance === 'account-dark' || appearance === 'account-light';
  const actionBackgroundColor = usesAccountAppearance ? '#D5E057' : colors.text.primary;
  const actionTextColor = usesAccountAppearance ? '#202117' : colors.bg.primary;
  const actionFontStyle = usesAccountAppearance
    ? { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' as const }
    : { fontWeight: '600' as const };
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.businessId);
  const role = useAuthStore((s) => s.currentUser?.role);
  const isOffline = useAuthStore((s) => s.isOfflineMode);
  const loginEmail = useAuthStore((s) => s.currentUser?.email ?? '');

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [code, setCode] = useState<string>('');
  const [changing, setChanging] = useState<boolean>(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const accountQuery = useQuery({
    queryKey: ['is-primary-account'],
    enabled: !isOffline,
    queryFn: fetchIsPrimaryAccount,
    staleTime: 60_000,
  });
  const linkQuery = useQuery({
    queryKey: ['primary-link', businessId],
    enabled: Boolean(businessId) && !isOffline && role === 'admin' && accountQuery.data === false,
    queryFn: () => fetchBusinessPrimaryLink(businessId!),
  });

  const link = useMutation({
    mutationFn: () => linkPrimaryEmail({ email: email.trim().toLowerCase(), password }),
    onSuccess: async (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPassword('');
      setConfirmPassword('');
      setCode('');
      setChanging(false);
      setMessage({
        tone: 'success',
        text: result.status === 'active'
          ? 'Primary email linked.'
          : result.emailSent === false
            ? 'Primary email added, but we could not send the code. Tap "Resend code".'
            : `We sent a 6-digit code to ${result.email ?? 'that email'}. Enter it below to confirm.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['primary-link', businessId] });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add the primary email.' });
    },
  });

  const promote = useMutation({
    mutationFn: makeLoginEmailPrimary,
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage({ tone: 'success', text: 'Done. Your login email is now your primary email.' });
      await queryClient.invalidateQueries({ queryKey: ['is-primary-account'] });
      await queryClient.invalidateQueries({ queryKey: ['primary-link', businessId] });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not use your login email.' });
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyPrimaryEmail(code.replace(/\s+/g, '')),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCode('');
      setMessage({ tone: 'success', text: 'Primary email confirmed. It is now locked to this business.' });
      await queryClient.invalidateQueries({ queryKey: ['primary-link', businessId] });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not confirm the code.' });
    },
  });

  const resend = useMutation({
    mutationFn: resendPrimaryVerification,
    onSuccess: (result) => {
      setMessage({
        tone: result.emailSent === false ? 'error' : 'success',
        text: result.emailSent === false ? 'We could not send the email. Please try again shortly.' : 'A new code is on its way.',
      });
    },
    onError: (error) => {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not resend the email.' });
    },
  });

  // Only a business admin sees this; managers and staff never do.
  if (role !== 'admin' || accountQuery.data === undefined) return null;

  const messageBox = message ? (
    <View
      accessibilityRole="alert"
      style={{ marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: message.tone === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.12)' }}
    >
      <Text style={{ color: message.tone === 'error' ? '#EF4444' : '#16A34A', fontSize: 13, textAlign: 'center' }}>{message.text}</Text>
    </View>
  ) : null;

  // This login is already a primary account (it was made one, or signed up as one).
  if (accountQuery.data === true) {
    return (
      <View style={{ marginBottom: usesAccountAppearance ? 26 : 32 }}>
        <Text
          style={usesAccountAppearance
            ? { color: colors.text.tertiary, fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }
            : { color: colors.text.tertiary }}
          className={usesAccountAppearance ? undefined : 'text-xs font-semibold uppercase mb-3 tracking-wider'}
        >
          Primary email
        </Text>
        {messageBox}
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={20} color="#16A34A" strokeWidth={2} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{loginEmail}</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>
              You're signed in with your primary email. Use Switch Business to move between your businesses or claim another one.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const submit = () => {
    setMessage(null);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setMessage({ tone: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (normalized === loginEmail.trim().toLowerCase()) {
      setMessage({ tone: 'error', text: "That's the email you're signed in with. Use the button below to make it your primary email." });
      return;
    }
    if (password.length < 8) {
      setMessage({ tone: 'error', text: 'Use a password with at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'The passwords do not match.' });
      return;
    }
    link.mutate();
  };

  const existingLink = linkQuery.data;
  const field = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: colors.input.bg,
    borderWidth: 1,
    borderColor: fieldBorderColor,
  };
  const input = { flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 };

  return (
    <View style={{ marginBottom: usesAccountAppearance ? 26 : 32 }}>
      <Text
          style={usesAccountAppearance
            ? { color: colors.text.tertiary, fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }
            : { color: colors.text.tertiary }}
          className={usesAccountAppearance ? undefined : 'text-xs font-semibold uppercase mb-3 tracking-wider'}
        >
        Primary email
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 14, marginLeft: usesAccountAppearance ? 6 : 0 }}>
        Your primary email is the owner's own sign-in for every Fyll product, and can own more than one business. Your work login keeps working as it does today.
      </Text>

      {messageBox}

      {linkQuery.isLoading ? (
        <ActivityIndicator color={colors.text.primary} />
      ) : existingLink && !changing ? (
        <View
          style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, gap: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {existingLink.status === 'active'
              ? <CheckCircle2 size={20} color="#16A34A" strokeWidth={2} />
              : <Clock3 size={20} color="#D97706" strokeWidth={2} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{existingLink.primaryEmail}</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>
                {existingLink.status === 'active'
                  ? "Confirmed. This can't be changed. Sign in with it to open this business and your other Fyll products."
                  : 'Not confirmed yet. Enter the 6-digit code we emailed to this address.'}
              </Text>
            </View>
          </View>

          {existingLink.status === 'pending' ? (
            <>
              <View style={{ ...field, height: 52 }}>
                <TextInput
                  value={code}
                  onChangeText={(text) => {
                    setCode(text.replace(/[^0-9]/g, '').slice(0, 6));
                    setMessage(null);
                  }}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.input.placeholder}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  style={{ ...input, marginLeft: 0, letterSpacing: 6, fontWeight: '600' }}
                  selectionColor={colors.text.primary}
                  onSubmitEditing={() => {
                    if (code.length === 6 && !verify.isPending) verify.mutate();
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setMessage(null);
                    verify.mutate();
                  }}
                  disabled={code.length !== 6 || verify.isPending}
                  className="active:opacity-80"
                  style={{ height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: actionBackgroundColor, alignItems: 'center', justifyContent: 'center', opacity: code.length !== 6 || verify.isPending ? 0.5 : 1, ...(usesAccountAppearance ? { width: '100%' as const } : {}) }}
                >
                  {verify.isPending
                    ? <ActivityIndicator color={actionTextColor} />
                    : <Text style={{ color: actionTextColor, fontSize: 14, ...actionFontStyle }}>Confirm email</Text>}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMessage(null);
                    resend.mutate();
                  }}
                  disabled={resend.isPending}
                  className="active:opacity-80"
                  style={{ height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.border.medium, alignItems: 'center', justifyContent: 'center', opacity: resend.isPending ? 0.6 : 1 }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 14, ...actionFontStyle }}>{resend.isPending ? 'Sending…' : 'Resend code'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMessage(null);
                    setChanging(true);
                  }}
                  className="active:opacity-70"
                  style={{ height: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.text.tertiary, fontSize: 13, textDecorationLine: 'underline' }}>Wrong email?</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <View>
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Primary email</Text>
            <View style={field}>
              <Mail size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setMessage(null);
                }}
                placeholder="you@gmail.com"
                placeholderTextColor={colors.input.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={input}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Password for this email</Text>
            <View style={field}>
              <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setMessage(null);
                }}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.input.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={input}
                selectionColor={colors.text.primary}
              />
              <PasswordEyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} color={eyeColor} />
            </View>
          </View>
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Confirm password</Text>
            <View style={field}>
              <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setMessage(null);
                }}
                placeholder="Repeat the password"
                placeholderTextColor={colors.input.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={input}
                selectionColor={colors.text.primary}
                onSubmitEditing={submit}
              />
              <PasswordEyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} color={eyeColor} />
            </View>
          </View>
          <Pressable
            onPress={submit}
            disabled={link.isPending || isOffline}
            className="rounded-full items-center justify-center active:opacity-80 flex-row"
            style={{
              backgroundColor: actionBackgroundColor,
              height: 56,
              opacity: link.isPending || isOffline ? 0.6 : 1,
              ...(usesAccountAppearance
                ? { width: '100%' as const }
                : Platform.OS === 'web'
                  ? { width: '20%' as const, minWidth: 220, alignSelf: 'flex-start' as const }
                  : {}),
            }}
          >
            {link.isPending ? <ActivityIndicator color={actionTextColor} /> : (
              <Text style={{ color: actionTextColor, fontSize: 16, ...actionFontStyle }}>Add primary email</Text>
            )}
          </Pressable>
          <Text style={{ color: colors.text.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
            We'll email a 6-digit code to this address. Once confirmed, your primary email can't be changed. An email already used as a Fyll login can't be a primary email.
          </Text>
          {changing ? (
            <Pressable onPress={() => setChanging(false)} className="active:opacity-70" style={{ marginTop: 10, alignSelf: 'flex-start', height: 36, justifyContent: 'center' }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, textDecorationLine: 'underline' }}>Keep the current email</Text>
            </Pressable>
          ) : null}

          {loginEmail ? (
            <View style={{ marginTop: 22, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, gap: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Already signed in with your own email?</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 13, lineHeight: 19 }}>
                  Use {loginEmail} as your primary email. No code needed, because you're already signed in with it.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setMessage(null);
                  promote.mutate();
                }}
                disabled={promote.isPending || isOffline}
                className="active:opacity-80"
                style={{ alignSelf: 'flex-start', height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: colors.border.medium, alignItems: 'center', justifyContent: 'center', opacity: promote.isPending || isOffline ? 0.6 : 1 }}
              >
                {promote.isPending
                  ? <ActivityIndicator color={colors.text.primary} />
                  : <Text style={{ color: colors.text.primary, fontSize: 14, ...actionFontStyle }}>Use my login email</Text>}
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

    </View>
  );
}
