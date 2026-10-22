import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/lib/theme';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

// Public page: the "Reset your password" email links here. Supabase signs the visitor into a
// short-lived recovery session from the link, and this page uses it to set the new password.
type Stage = 'checking' | 'form' | 'invalid' | 'done';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setStage('form');
    });
    // The link's token is read from the URL on load; give it a moment before calling it invalid.
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage((current) => (current === 'checking' ? (data.session ? 'form' : 'invalid') : current));
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const goToLogin = () => router.replace('/login');

  const handleSave = async () => {
    if (password.length < 6) {
      setError('Your password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // End the temporary recovery session so they sign in normally with the new password.
      await supabase.auth.signOut();
      setStage('done');
    } catch (err) {
      const message = (err as { message?: string })?.message ?? '';
      setError(/same password/i.test(message)
        ? 'Choose a password you have not used before.'
        : 'Could not update your password. Open the link in your email again and retry.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: 16,
    color: colors.input.text,
    fontSize: 15,
  } as const;

  const primaryButton = (label: string, onPress: () => void, loading = false) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{ height: 50, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
    >
      {loading ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Text style={{ color: FYLL_LIME_INK, fontSize: 15.5, fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 24, gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(213,224,87,0.18)' }}>
            <KeyRound size={22} color={colors.text.primary} strokeWidth={2} />
          </View>

          {stage === 'checking' ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
              <ActivityIndicator color={colors.text.tertiary} />
              <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Checking your reset link…</Text>
            </View>
          ) : null}

          {stage === 'form' ? (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }}>Choose a new password</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 14, lineHeight: 20 }}>Use at least 6 characters. You will sign in with it straight after.</Text>
              </View>
              <View style={{ gap: 10 }}>
                <View>
                  <TextInput
                    value={password}
                    onChangeText={(value) => { setPassword(value); setError(''); }}
                    placeholder="New password"
                    placeholderTextColor={colors.input.placeholder}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    style={{ ...inputStyle, paddingRight: 48 }}
                  />
                  <Pressable onPress={() => setShowPassword((current) => !current)} hitSlop={8} style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
                    {showPassword ? <EyeOff size={18} color={colors.text.muted} strokeWidth={2} /> : <Eye size={18} color={colors.text.muted} strokeWidth={2} />}
                  </Pressable>
                </View>
                <TextInput
                  value={confirmPassword}
                  onChangeText={(value) => { setConfirmPassword(value); setError(''); }}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.input.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  onSubmitEditing={handleSave}
                  style={inputStyle}
                />
              </View>
              {error ? <Text style={{ color: '#DC2626', fontSize: 13, lineHeight: 18 }}>{error}</Text> : null}
              {primaryButton('Save new password', handleSave, isSaving)}
            </>
          ) : null}

          {stage === 'invalid' ? (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }}>This link has expired</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 14, lineHeight: 20 }}>Reset links work once and expire quickly. Go back to sign in and choose Forgot password to get a fresh one.</Text>
              </View>
              {primaryButton('Back to sign in', goToLogin)}
            </>
          ) : null}

          {stage === 'done' ? (
            <>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }}>Password updated</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 14, lineHeight: 20 }}>Sign in with your new password.</Text>
              </View>
              {primaryButton('Sign in', goToLogin)}
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
