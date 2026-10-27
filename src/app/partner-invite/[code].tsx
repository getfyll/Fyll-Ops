import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Eye, EyeOff, Lock } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { supabase } from '@/lib/supabase';
import { acceptPartnerInvite, getPartnerInvite, type PartnerInvite } from '@/lib/supabase/partner-portal';

const fyllWordmarkPng = require('../../../assets/fyll-wordmark-thick-light.png');

export default function PartnerInviteScreen() {
  const palette = usePaymentsPalette();
  const router = useRouter();
  const { code: rawCode } = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode ?? '';

  const [invite, setInvite] = useState<PartnerInvite | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  useEffect(() => {
    let active = true;
    if (!code) {
      setIsLoadingInvite(false);
      setInviteError('This invite link is invalid.');
      return;
    }
    getPartnerInvite(code)
      .then((result) => {
        if (!active) return;
        if (!result) {
          setInviteError('This invite is invalid or has already been used.');
        } else {
          setInvite(result);
        }
        setIsLoadingInvite(false);
      })
      .catch((err) => {
        if (!active) return;
        setInviteError(err instanceof Error ? err.message : 'Something went wrong.');
        setIsLoadingInvite(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  const handleCreateAccount = async () => {
    if (!invite) return;
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    setFormError('');
    setAlreadyRegistered(false);
    setIsSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
      });
      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setAlreadyRegistered(true);
        } else {
          setFormError(signUpError.message);
        }
        setIsSubmitting(false);
        return;
      }

      const linked = await acceptPartnerInvite(invite.inviteCode);
      if (!linked) {
        setFormError('Could not link your account. Ask the business to send a new invite.');
        setIsSubmitting(false);
        return;
      }

      router.replace('/partner/_session');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setIsSubmitting(false);
    }
  };

  if (isLoadingInvite) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={FYLL_LIME} />
      </SafeAreaView>
    );
  }

  if (inviteError || !invite) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
            <Building2 size={24} color={palette.danger} strokeWidth={1.8} />
          </View>
          <MoneyText style={{ color: palette.text, fontSize: 24, letterSpacing: -0.6, marginTop: 18, textAlign: 'center' }}>
            This invite isn't working
          </MoneyText>
          <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center', maxWidth: 320 }}>
            {inviteError || 'Ask the business to send you a new invite.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const inputShell = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.inputBg,
    paddingHorizontal: 16,
  };
  const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 400 }}>
            <View style={{ alignItems: 'flex-start', marginBottom: 30 }}>
              <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 30 * (900 / 493), height: 30, tintColor: palette.text }} />
              <View style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
                <Building2 size={12} color={palette.limeOnSurface} strokeWidth={2.2} />
                <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{invite.businessName}</Text>
              </View>
              <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -1.1, lineHeight: 38, marginTop: 14 }}>
                You're invited to join {invite.businessName}
              </MoneyText>
              <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20, marginTop: 8 }}>
                Create a password for {invite.email} to open your partner portal.
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ ...inputShell, backgroundColor: palette.softFill }}>
                <Text style={{ flex: 1, color: palette.muted, fontSize: 15 }} numberOfLines={1}>{invite.email}</Text>
              </View>

              <View style={inputShell}>
                <Lock size={17} color={palette.faint} strokeWidth={2} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password"
                  placeholderTextColor={palette.faint}
                  secureTextEntry={!showPassword}
                  style={[{ flex: 1, marginLeft: 12, color: palette.text, fontSize: 15 }, webNoOutline]}
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={8}>
                  {showPassword ? <EyeOff size={17} color={palette.faint} strokeWidth={2} /> : <Eye size={17} color={palette.faint} strokeWidth={2} />}
                </Pressable>
              </View>

              <View style={inputShell}>
                <Lock size={17} color={palette.faint} strokeWidth={2} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={palette.faint}
                  secureTextEntry={!showPassword}
                  style={[{ flex: 1, marginLeft: 12, color: palette.text, fontSize: 15 }, webNoOutline]}
                  onSubmitEditing={handleCreateAccount}
                />
              </View>

              {formError ? (
                <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                  <Text style={{ color: palette.danger, fontSize: 13, fontWeight: '600' }}>{formError}</Text>
                </View>
              ) : null}

              {alreadyRegistered ? (
                <View style={{ borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
                    You already have an account for this email.
                  </Text>
                  <Text style={{ color: palette.faint, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                    Log in with your existing password instead of creating a new one.
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/partner-login?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(invite.inviteCode)}`)}
                    style={{ height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}
                  >
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 15 }}>Log in</MoneyText>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleCreateAccount}
                  disabled={isSubmitting}
                  style={{ height: 54, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: isSubmitting ? 0.7 : 1, marginTop: 6 }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={FYLL_LIME_INK} size="small" />
                  ) : (
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 16 }}>Create account</MoneyText>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
