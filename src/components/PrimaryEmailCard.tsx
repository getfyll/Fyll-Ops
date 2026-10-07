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
export function PrimaryEmailCard({ fieldBorderColor }: { fieldBorderColor: string }) {
  const colors = useThemeColors();
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
      <View style={{ marginBottom: 32 }}>
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
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
    <View style={{ marginBottom: 32 }}>
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
        Primary email
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
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
                  style={{ height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: code.length !== 6 || verify.isPending ? 0.5 : 1 }}
                >
                  {verify.isPending
                    ? <ActivityIndicator color={colors.bg.primary} />
                    : <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '600' }}>Confirm email</Text>}
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
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{resend.isPending ? 'Sending…' : 'Resend code'}</Text>
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
              <PasswordEyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
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
              <PasswordEyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </View>
          </View>
          <Pressable
            onPress={submit}
            disabled={link.isPending || isOffline}
            className="rounded-full items-center justify-center active:opacity-80 flex-row"
            style={{
              backgroundColor: colors.text.primary,
              height: 56,
              opacity: link.isPending || isOffline ? 0.6 : 1,
              ...(Platform.OS === 'web' ? { width: '20%', minWidth: 220, alignSelf: 'flex-start' } : {}),
            }}
          >
            {link.isPending ? <ActivityIndicator color={colors.bg.primary} /> : (
              <Text style={{ color: colors.bg.primary }} className="font-semibold text-base">Add primary email</Text>
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
                  : <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Use my login email</Text>}
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

    </View>
  );
}
