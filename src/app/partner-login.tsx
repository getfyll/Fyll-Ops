import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { supabase } from '@/lib/supabase';
import { acceptPartnerInvite, lookupPartnerPortalByAuth } from '@/lib/supabase/partner-portal';

const fyllWordmarkPng = require('../../assets/fyll-wordmark-thick-light.png');

export default function PartnerLoginScreen() {
  const palette = usePaymentsPalette();
  const router = useRouter();
  const { email: emailParam, invite: inviteParam } = useLocalSearchParams<{ email?: string | string[]; invite?: string | string[] }>();
  const prefillEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam ?? '';
  const inviteCode = Array.isArray(inviteParam) ? inviteParam[0] : inviteParam ?? '';
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message.toLowerCase().includes('invalid') ? 'Incorrect email or password.' : signInError.message);
        setIsLoading(false);
        return;
      }

      let portal = await lookupPartnerPortalByAuth();
      if (!portal && inviteCode) {
        try {
          await acceptPartnerInvite(inviteCode);
          portal = await lookupPartnerPortalByAuth();
        } catch {
          // fall through to the generic "not linked" error below
        }
      }

      if (!portal) {
        setError("This account isn't linked to a partner portal.");
        await supabase.auth.signOut({ scope: 'local' });
        setIsLoading(false);
        return;
      }

      router.replace('/partner/_session');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setIsLoading(false);
    }
  };

  const inputShell = (focused: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: focused ? FYLL_LIME : palette.border,
    backgroundColor: palette.inputBg,
    paddingHorizontal: 16,
  });
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 400 }}>
            <View style={{ alignItems: 'flex-start', marginBottom: 32 }}>
              <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 30 * (900 / 493), height: 30, tintColor: palette.text }} />
              <View style={{ marginTop: 28, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Partner portal</Text>
              </View>
              <MoneyText style={{ color: palette.text, fontSize: 34, letterSpacing: -1.2, marginTop: 14 }}>Welcome back</MoneyText>
              <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
                Sign in with the account you were invited with.
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={inputShell(focusedField === 'email')}>
                <Mail size={17} color={palette.faint} strokeWidth={2} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Email"
                  placeholderTextColor={palette.faint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[{ flex: 1, marginLeft: 12, color: palette.text, fontSize: 15 }, webNoOutline]}
                />
              </View>

              <View style={inputShell(focusedField === 'password')}>
                <Lock size={17} color={palette.faint} strokeWidth={2} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Password"
                  placeholderTextColor={palette.faint}
                  secureTextEntry={!showPassword}
                  style={[{ flex: 1, marginLeft: 12, color: palette.text, fontSize: 15 }, webNoOutline]}
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={8}>
                  {showPassword ? <EyeOff size={17} color={palette.faint} strokeWidth={2} /> : <Eye size={17} color={palette.faint} strokeWidth={2} />}
                </Pressable>
              </View>

              {error ? (
                <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                  <Text style={{ color: palette.danger, fontSize: 13, fontWeight: '600' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                style={{ height: 54, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: isLoading ? 0.7 : 1, marginTop: 6 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={FYLL_LIME_INK} size="small" />
                ) : (
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 16 }}>Sign in</MoneyText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
