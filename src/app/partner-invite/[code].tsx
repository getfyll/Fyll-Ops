import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Eye, EyeOff, Lock } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { acceptPartnerInvite, getPartnerInvite, type PartnerInvite } from '@/lib/supabase/partner-portal';

export default function PartnerInviteScreen() {
  const colors = useThemeColors();
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.text.primary} />
      </SafeAreaView>
    );
  }

  if (inviteError || !invite) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Building2 size={28} color={colors.text.tertiary} strokeWidth={1.7} />
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
            This invite isn't working
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            {inviteError || 'Ask the business to send you a new invite.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 380 }}>
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={24} color={colors.text.primary} strokeWidth={1.8} />
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
                Join {invite.businessName} on Fyll
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Create a password for {invite.email} to access your partner portal.
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 14 }} numberOfLines={1}>{invite.email}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14 }}>
                <Lock size={16} color={colors.text.tertiary} strokeWidth={2} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password"
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry={!showPassword}
                  style={{ flex: 1, marginLeft: 10, color: colors.text.primary, fontSize: 14 }}
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? <EyeOff size={16} color={colors.text.tertiary} strokeWidth={2} /> : <Eye size={16} color={colors.text.tertiary} strokeWidth={2} />}
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14 }}>
                <Lock size={16} color={colors.text.tertiary} strokeWidth={2} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry={!showPassword}
                  style={{ flex: 1, marginLeft: 10, color: colors.text.primary, fontSize: 14 }}
                  onSubmitEditing={handleCreateAccount}
                />
              </View>

              {formError ? (
                <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>{formError}</Text>
              ) : null}

              {alreadyRegistered ? (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, padding: 14 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12.5, fontWeight: '600' }}>
                    You already have an account for this email.
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                    Log in with your existing password instead of creating a new one.
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/partner-login?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(invite.inviteCode)}`)}
                    style={{ height: 40, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 12.5, fontWeight: '700' }}>Log In</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleCreateAccount}
                  disabled={isSubmitting}
                  style={{ height: 48, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: isSubmitting ? 0.7 : 1, marginTop: 4 }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.bg.primary} size="small" />
                  ) : (
                    <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '700' }}>Create Account</Text>
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
