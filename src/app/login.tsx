import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, UserPlus, ChevronLeft, User as UserIcon, Key } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { FyllLogo } from '@/components/FyllLogo';
import { supabase } from '@/lib/supabase';
import { isPartnerPortalHostname } from '@/lib/partner-host';
import PartnerLoginScreen from './partner-login';

type AuthMode = 'login' | 'invite' | 'signup';
const AUTH_HERO_LOCAL_URI = '/images/auth-hero.png';
const AUTH_TEAM_HERO_LOCAL_URI = '/images/fyll-auth-team.png';
const AUTH_HERO_FALLBACK_URI = 'https://images.unsplash.com/photo-1623177579166-7029cf1d4d7e?auto=format&fit=crop&w=2000&q=80';

export default function LoginScreen() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && isPartnerPortalHostname(window.location.hostname)) {
    return <PartnerLoginScreen />;
  }

  const router = useRouter();
  const { invite: inviteParam, access: accessParam, signup: signupParam, returnTo: returnToParam } = useLocalSearchParams<{ invite?: string; access?: string; signup?: string; returnTo?: string | string[] }>();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= 1200;
  const isDark = useResolvedThemeMode() === 'dark';
  const primaryActionBg = isDark ? '#FFFFFF' : '#111111';
  const primaryActionText = isDark ? '#111111' : '#FFFFFF';
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const getInviteByCode = useAuthStore((s) => s.getInviteByCode);
  const acceptInvite = useAuthStore((s) => s.acceptInvite);
  const returnTo = Array.isArray(returnToParam) ? returnToParam[0] : returnToParam;
  const loginRedirectPath = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/(tabs)';

  const [mode, setMode] = useState<AuthMode>('login');
  const [authHeroUri, setAuthHeroUri] = useState<string>(AUTH_HERO_LOCAL_URI);
  const [teamHeroUri, setTeamHeroUri] = useState<string>(AUTH_TEAM_HERO_LOCAL_URI);

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Invite form state
  const [inviteCode, setInviteCode] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  // Signup form state
  const [businessName, setBusinessName] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupAccessCode, setSignupAccessCode] = useState('');
  const [signupAccessCodeVerified, setSignupAccessCodeVerified] = useState(false);
  const [signupAccessCodeMessage, setSignupAccessCodeMessage] = useState('');
  const [isVerifyingSignupAccessCode, setIsVerifyingSignupAccessCode] = useState(false);

  useEffect(() => {
    if (!inviteParam || typeof inviteParam !== 'string') return;
    const trimmed = inviteParam.trim();
    if (!trimmed) return;
    setMode('invite');
    setInviteCode(trimmed.toUpperCase());
  }, [inviteParam]);

  useEffect(() => {
    if (signupParam === '1' || signupParam === 'true') {
      setMode('signup');
    }
  }, [signupParam]);

  useEffect(() => {
    if (!accessParam || typeof accessParam !== 'string') return;
    const trimmed = accessParam.trim();
    if (!trimmed) return;
    setMode('signup');
    setSignupAccessCode(trimmed.toUpperCase());
    setSignupAccessCodeVerified(false);
    setSignupAccessCodeMessage('');
    setSignupError('');
  }, [accessParam]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setError('');
    setResetMessage('');

    try {
      const result = await login(email.trim(), password);

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(loginRedirectPath);
      } else {
        setError(result.error || 'Login failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      const message = (error as { message?: string })?.message ?? 'Login failed';
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsResetting(true);
    setError('');
    setResetMessage('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
      if (resetError) {
        throw resetError;
      }
      setResetMessage('Password reset email sent. Check your inbox.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Password reset failed:', err);
      setError('Failed to send reset email. Check your email and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!inviteCode.trim()) {
      setInviteError('Please enter the invite code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setInviteError('');

    try {
      const invite = await Promise.race([
        getInviteByCode(inviteCode.trim().toUpperCase()),
        new Promise<undefined>((_, reject) =>
          setTimeout(() => reject(new Error('Invite lookup timeout')), 10000)
        ),
      ]);

      if (!invite) {
        setInviteError('Invalid or expired invite code');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setInviteEmail(invite.email);
        setInviteError('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Invite verification error:', error);
      setInviteError('Could not verify invite code. Please check your connection and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!inviteName.trim()) {
      setInviteError('Please enter your name');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!invitePassword.trim()) {
      setInviteError('Please create a password');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (invitePassword.length < 6) {
      setInviteError('Password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (invitePassword !== inviteConfirmPassword) {
      setInviteError('Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setInviteError('');

    const result = await acceptInvite(inviteCode.trim().toUpperCase(), inviteName.trim(), invitePassword);

    setIsLoading(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(loginRedirectPath);
    } else {
      setInviteError(result.error || 'Failed to create account');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const resetInviteForm = () => {
    setInviteCode('');
    setInviteName('');
    setInvitePassword('');
    setInviteConfirmPassword('');
    setInviteEmail('');
    setInviteError('');
  };

  const resetSignupForm = () => {
    setBusinessName('');
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
    setSignupError('');
    setSignupAccessCode('');
    setSignupAccessCodeVerified(false);
    setSignupAccessCodeMessage('');
  };

  const handleVerifySignupAccessCode = async () => {
    const normalizedCode = signupAccessCode.trim().toUpperCase();
    if (!normalizedCode) {
      setSignupError('Enter your access code to continue');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsVerifyingSignupAccessCode(true);
    setSignupError('');
    setSignupAccessCodeMessage('');

    try {
      const { data, error: codeError } = await supabase.rpc('validate_access_code', {
        access_code_input: normalizedCode,
      });

      if (codeError) {
        throw codeError;
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | { is_valid?: boolean; valid?: boolean; message?: string | null }
        | null;
      const isValid = row?.is_valid ?? row?.valid ?? false;

      if (!isValid) {
        setSignupError(row?.message ?? 'Invalid or inactive access code');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setSignupAccessCode(normalizedCode);
      setSignupAccessCodeVerified(true);
      setSignupAccessCodeMessage('VIP access confirmed. Complete your founder setup.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Access code verification failed:', err);
      setSignupError('Could not verify access code. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsVerifyingSignupAccessCode(false);
    }
  };

  const handleSignup = async () => {
    if (!signupAccessCodeVerified) {
      setSignupError('Verify your access code first');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!businessName.trim() || !signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setSignupError('Please fill all fields');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!signupEmail.includes('@')) {
      setSignupError('Invalid email address');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (signupPassword.length < 6) {
      setSignupError('Password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError('Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setSignupError('');

    const result = await signup({
      businessName: businessName.trim(),
      name: signupName.trim(),
      email: signupEmail.trim(),
      password: signupPassword,
      accessCode: signupAccessCode.trim(),
    });

    setIsLoading(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(loginRedirectPath === '/(tabs)' ? '/welcome' : loginRedirectPath);
    } else {
      setSignupError(result.error || 'Failed to create account');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (mode === 'invite') {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={isWide ? { flexGrow: 1 } : { paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className={isWide ? 'flex-1 flex-row' : 'flex-1'}>
                <View className={isWide ? 'w-[52%] items-center justify-center' : undefined}>
                  <View className={isWide ? 'w-full max-w-[520px] px-10 py-12' : 'flex-1 px-6 pt-4'}>
                {/* Back Button */}
                <Pressable
                  onPress={() => {
                    setMode('login');
                    resetInviteForm();
                  }}
                  className="w-10 h-10 rounded-xl items-center justify-center mb-6 active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

                {/* Header */}
                <View className={isWide ? 'mb-8' : 'items-center mb-8'}>
                  <FyllLogo width={50} color={colors.text.primary} />
                  <Text style={{ color: colors.text.primary }} className={isWide ? 'text-2xl font-bold mt-4' : 'text-2xl font-bold mt-4 text-center'}>
                    Join Your Team
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className={isWide ? 'text-base mt-2' : 'text-base text-center mt-2'}>
                    Enter your invite code to create an account
                  </Text>
                </View>

                {!inviteEmail ? (
                  // Step 1: Enter invite code
                  <View>
                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Invite Code
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: inviteError ? '#EF4444' : colors.input.border,
                          height: 56,
                        }}
                      >
                        <Key size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={inviteCode}
                          onChangeText={(text) => {
                            setInviteCode(text.toUpperCase());
                            setInviteError('');
                          }}
                          placeholder="Enter code (e.g. ABC123XY)"
                          placeholderTextColor={colors.input.placeholder}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          style={{
                            flex: 1,
                            color: colors.input.text,
                            fontSize: 16,
                            marginLeft: 12,
                            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                            letterSpacing: 2,
                          }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    {inviteError ? (
                      <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                        <Text className="text-red-500 text-sm text-center">{inviteError}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={handleVerifyCode}
                      className="rounded-xl items-center justify-center active:opacity-80"
                      style={{ backgroundColor: primaryActionBg, height: 56 }}
                    >
                      <Text style={{ color: primaryActionText }} className="font-semibold text-base">Verify Code</Text>
                    </Pressable>
                  </View>
                ) : (
                  // Step 2: Create account
                  <View>
                    {/* Email display */}
                    <View className="mb-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)' }}>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mb-1">Your email</Text>
                      <Text style={{ color: '#22C55E' }} className="font-semibold">{inviteEmail}</Text>
                    </View>

                    {/* Name Input */}
                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Your Name
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: colors.input.border,
                          height: 56,
                        }}
                      >
                        <UserIcon size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={inviteName}
                          onChangeText={(text) => {
                            setInviteName(text);
                            setInviteError('');
                          }}
                          placeholder="Enter your full name"
                          placeholderTextColor={colors.input.placeholder}
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    {/* Password Input */}
                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Create Password
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: inviteError ? '#EF4444' : colors.input.border,
                          height: 56,
                        }}
                      >
                        <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={invitePassword}
                          onChangeText={(text) => {
                            setInvitePassword(text);
                            setInviteError('');
                          }}
                          placeholder="Create a password"
                          placeholderTextColor={colors.input.placeholder}
                          secureTextEntry={!showInvitePassword}
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                        <Pressable onPress={() => setShowInvitePassword(!showInvitePassword)}>
                          {showInvitePassword ? (
                            <EyeOff size={20} color={colors.text.tertiary} />
                          ) : (
                            <Eye size={20} color={colors.text.tertiary} />
                          )}
                        </Pressable>
                      </View>
                    </View>

                    {/* Confirm Password */}
                    <View className="mb-6">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Confirm Password
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{
                          backgroundColor: colors.input.bg,
                          borderWidth: 1,
                          borderColor: inviteError ? '#EF4444' : colors.input.border,
                          height: 56,
                        }}
                      >
                        <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={inviteConfirmPassword}
                          onChangeText={(text) => {
                            setInviteConfirmPassword(text);
                            setInviteError('');
                          }}
                          placeholder="Confirm password"
                          placeholderTextColor={colors.input.placeholder}
                          secureTextEntry={!showInvitePassword}
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    {inviteError ? (
                      <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                        <Text className="text-red-500 text-sm text-center">{inviteError}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={handleCreateAccount}
                      disabled={isLoading}
                      className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                      style={{ backgroundColor: primaryActionBg, height: 56, opacity: isLoading ? 0.7 : 1 }}
                    >
                      {isLoading && (
                        <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                      )}
                      <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                        {isLoading ? 'Creating Account...' : 'Create Account'}
                      </Text>
                    </Pressable>
                  </View>
                )}
                  </View>
                </View>

                {isWide && (
                  <View className="flex-1 px-10 py-12">
                    <View
                      className="flex-1 rounded-[32px] overflow-hidden border"
                      style={{ borderColor: colors.border.light }}
                    >
                      <Image
                        source={{ uri: teamHeroUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                        onError={() => {
                          if (teamHeroUri !== AUTH_HERO_FALLBACK_URI) {
                            setTeamHeroUri(AUTH_HERO_FALLBACK_URI);
                          }
                        }}
                      />
                      <View
                        className="absolute inset-0"
                        style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.22)' }}
                      />
                      <View className="absolute bottom-8 left-8 right-8">
                        <Text className="text-white text-3xl font-semibold">
                          Welcome to the team.
                        </Text>
                        <Text className="text-white/80 text-sm mt-3">
                          Join your workspace and start collaborating on orders, services, and cases.
                        </Text>
                        <View className="mt-5 flex-row gap-2">
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Shared customers</Text>
                          </View>
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Live order updates</Text>
                          </View>
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Thread collaboration</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'signup') {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={isWide ? { flexGrow: 1 } : { paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className={isWide ? 'flex-1 flex-row' : 'flex-1'}>
                <View className={isWide ? 'w-[52%] items-center justify-center' : undefined}>
                  <View className={isWide ? 'w-full max-w-[520px] px-10 py-12' : 'px-6 pt-4'}>
                    {/* Back Button */}
                    <Pressable
                      onPress={() => {
                        if (signupAccessCodeVerified) {
                          setSignupAccessCodeVerified(false);
                          setSignupAccessCodeMessage('');
                          setSignupError('');
                        } else {
                          setMode('login');
                          resetSignupForm();
                        }
                      }}
                      className="w-10 h-10 rounded-xl items-center justify-center mb-6 active:opacity-50"
                      style={{ backgroundColor: colors.bg.secondary }}
                    >
                      <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>

                    {/* Header */}
                    <View className="items-center mb-8">
                      <FyllLogo width={50} color={colors.text.primary} />
                      <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-4">
                        {signupAccessCodeVerified ? 'Create Your Account' : 'VIP Founder Access'}
                      </Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-base text-center mt-2">
                        {signupAccessCodeVerified ? 'Set up your business in minutes' : 'Enter your access code to unlock founder signup'}
                      </Text>
                    </View>

                    {!signupAccessCodeVerified ? (
                      <View>
                        <View className="mb-4">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Access Code
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <Key size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={signupAccessCode}
                              onChangeText={(text) => {
                                setSignupAccessCode(text.toUpperCase());
                                setSignupError('');
                                setSignupAccessCodeMessage('');
                              }}
                              placeholder="Enter VIP code (e.g. MINT2026)"
                              placeholderTextColor={colors.input.placeholder}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              style={{
                                flex: 1,
                                color: colors.input.text,
                                fontSize: 16,
                                marginLeft: 12,
                                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                letterSpacing: 1.5,
                              }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>

                        <View className="mb-6 p-4 rounded-xl" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                            Private beta access only
                          </Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1 leading-5">
                            Founder signup is invite-only. Existing team members should use the invite-code flow instead.
                          </Text>
                        </View>

                        {signupError ? (
                          <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                            <Text className="text-red-500 text-sm text-center">{signupError}</Text>
                          </View>
                        ) : null}

                        <Pressable
                          onPress={handleVerifySignupAccessCode}
                          disabled={isVerifyingSignupAccessCode}
                          className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                          style={{ backgroundColor: primaryActionBg, height: 56, opacity: isVerifyingSignupAccessCode ? 0.7 : 1 }}
                        >
                          {isVerifyingSignupAccessCode ? (
                            <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                          ) : null}
                          <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                            {isVerifyingSignupAccessCode ? 'Checking Access...' : 'Unlock Signup'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        {signupAccessCodeMessage ? (
                          <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)' }}>
                            <Text style={{ color: '#22C55E' }} className="text-sm text-center">{signupAccessCodeMessage}</Text>
                          </View>
                        ) : null}

                        {/* Business Name */}
                        <View className="mb-4">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Business Name
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <UserPlus size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={businessName}
                              onChangeText={(text) => {
                                setBusinessName(text);
                                setSignupError('');
                              }}
                              placeholder="Business name"
                              placeholderTextColor={colors.input.placeholder}
                              style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>

                        {/* Name */}
                        <View className="mb-4">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Your Name
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <UserIcon size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={signupName}
                              onChangeText={(text) => {
                                setSignupName(text);
                                setSignupError('');
                              }}
                              placeholder="Your full name"
                              placeholderTextColor={colors.input.placeholder}
                              style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>

                        {/* Email */}
                        <View className="mb-4">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Email Address
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <Mail size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={signupEmail}
                              onChangeText={(text) => {
                                setSignupEmail(text);
                                setSignupError('');
                              }}
                              placeholder="you@business.com"
                              placeholderTextColor={colors.input.placeholder}
                              keyboardType="email-address"
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>

                        {/* Password */}
                        <View className="mb-4">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Password
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={signupPassword}
                              onChangeText={(text) => {
                                setSignupPassword(text);
                                setSignupError('');
                              }}
                              placeholder="Create a password"
                              placeholderTextColor={colors.input.placeholder}
                              secureTextEntry={!showPassword}
                              style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                              selectionColor={colors.text.primary}
                            />
                            <Pressable onPress={() => setShowPassword(!showPassword)}>
                              {showPassword ? (
                                <EyeOff size={20} color={colors.text.tertiary} />
                              ) : (
                                <Eye size={20} color={colors.text.tertiary} />
                              )}
                            </Pressable>
                          </View>
                        </View>

                        {/* Confirm Password */}
                        <View className="mb-6">
                          <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                            Confirm Password
                          </Text>
                          <View
                            className="flex-row items-center rounded-xl px-4"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: signupError ? '#EF4444' : colors.input.border,
                              height: 56,
                            }}
                          >
                            <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                            <TextInput
                              value={signupConfirmPassword}
                              onChangeText={(text) => {
                                setSignupConfirmPassword(text);
                                setSignupError('');
                              }}
                              placeholder="Confirm password"
                              placeholderTextColor={colors.input.placeholder}
                              secureTextEntry={!showPassword}
                              style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>

                        {signupError ? (
                          <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                            <Text className="text-red-500 text-sm text-center">{signupError}</Text>
                          </View>
                        ) : null}

                        <Pressable
                          onPress={handleSignup}
                          disabled={isLoading}
                          className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                          style={{ backgroundColor: primaryActionBg, height: 56, opacity: isLoading ? 0.7 : 1 }}
                        >
                          {isLoading && (
                            <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                          )}
                          <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                            {isLoading ? 'Creating Account...' : 'Create Account'}
                          </Text>
                        </Pressable>
                      </>
                    )}

                  </View>
                </View>

                {isWide && (
                  <View className="flex-1 px-10 py-12">
                    <View
                      className="flex-1 rounded-[32px] overflow-hidden border"
                      style={{ borderColor: colors.border.light }}
                    >
                      <Image
                        source={{ uri: authHeroUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                        onError={() => {
                          if (authHeroUri !== AUTH_HERO_FALLBACK_URI) {
                            setAuthHeroUri(AUTH_HERO_FALLBACK_URI);
                          }
                        }}
                      />
                      <View
                        className="absolute inset-0"
                        style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.22)' }}
                      />
                      <View className="absolute bottom-8 left-8 right-8">
                        <Text className="text-white text-3xl font-semibold">
                          Start with a clean setup.
                        </Text>
                        <Text className="text-white/80 text-sm mt-3">
                          Build your catalog, services, and cases with a focused workflow.
                        </Text>
                        <View className="mt-5 flex-row gap-2">
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Fast onboarding</Text>
                          </View>
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Service management</Text>
                          </View>
                          <View className="px-3 py-1.5 rounded-full border border-white/40">
                            <Text className="text-white text-xs">Case tracking</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={isWide ? { flexGrow: 1 } : { paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className={isWide ? 'flex-1 flex-row' : 'flex-1'}>
              <View className={isWide ? 'w-[52%] items-center justify-center' : undefined}>
                <View className={isWide ? 'w-full max-w-[520px] px-10 py-12' : 'px-6 pt-10'}>
              {/* Logo */}
              <View className="items-center mb-10">
                <FyllLogo width={50} color={colors.text.primary} />
                <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-4">
                  Welcome Back
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-base text-center mt-2">
                  Sign in to manage your business
                </Text>
              </View>

              {/* Email Input */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                  Email Address
                </Text>
                <View
                  className="flex-row items-center rounded-xl px-4"
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: error ? '#EF4444' : colors.input.border,
                    height: 56,
                  }}
                >
                  <Mail size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                  <TextInput
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      setError('');
                    }}
                    placeholder="you@business.com"
                    placeholderTextColor={colors.input.placeholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View className="mb-3">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                  Password
                </Text>
                <View
                  className="flex-row items-center rounded-xl px-4"
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: error ? '#EF4444' : colors.input.border,
                    height: 56,
                  }}
                >
                  <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                  <TextInput
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setError('');
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.input.placeholder}
                    secureTextEntry={!showPassword}
                    style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                    selectionColor={colors.text.primary}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <EyeOff size={20} color={colors.text.tertiary} />
                    ) : (
                      <Eye size={20} color={colors.text.tertiary} />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Error */}
              {error ? (
                <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                  <Text className="text-red-500 text-sm text-center">{error}</Text>
                </View>
              ) : null}

              {resetMessage ? (
                <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                  <Text style={{ color: '#22C55E' }} className="text-sm text-center">{resetMessage}</Text>
                </View>
              ) : null}

              {/* Login Button */}
              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                style={{ backgroundColor: primaryActionBg, height: 56, opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading && (
                  <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Text>
              </Pressable>

              {/* Reset Password */}
              <Pressable
                onPress={handlePasswordReset}
                disabled={isResetting}
                className="mt-4 items-center"
              >
                <Text style={{ color: colors.text.tertiary }} className="text-sm">
                  {isResetting ? 'Sending reset email...' : 'Forgot password?'}
                </Text>
              </Pressable>

              <View className="my-6" />

              {/* Founder Access (invite-only) */}
              <Pressable
                onPress={() => {
                  setMode('signup');
                  resetSignupForm();
                }}
                className="rounded-xl items-center justify-center active:opacity-80"
                style={{ borderWidth: 1, borderColor: colors.border.light, height: 56 }}
              >
                <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                  Founder Access Code
                </Text>
              </Pressable>

              {/* Invite */}
              <Pressable
                onPress={() => {
                  setMode('invite');
                  resetInviteForm();
                }}
                className="mt-4 rounded-xl items-center justify-center active:opacity-80"
                style={{ borderWidth: 1, borderColor: colors.border.light, height: 56 }}
              >
                <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                  Join With Invite Code
                </Text>
              </Pressable>
                </View>
              </View>

              {isWide && (
                <View className="flex-1 px-10 py-12">
                  <View
                    className="flex-1 rounded-[32px] overflow-hidden border"
                    style={{ borderColor: colors.border.light }}
                  >
                    <Image
                      source={{ uri: authHeroUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                      onError={() => {
                        if (authHeroUri !== AUTH_HERO_FALLBACK_URI) {
                          setAuthHeroUri(AUTH_HERO_FALLBACK_URI);
                        }
                      }}
                    />
                    <View
                      className="absolute inset-0"
                      style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.22)' }}
                    />
                    <View className="absolute bottom-8 left-8 right-8">
                      <Text className="text-white text-3xl font-semibold">
                        Run your ops with clarity.
                      </Text>
                      <Text className="text-white/80 text-sm mt-3">
                        Inventory, orders, services, and cases — all in one focused workspace.
                      </Text>
                      <View className="mt-5 flex-row gap-2">
                        <View className="px-3 py-1.5 rounded-full border border-white/40">
                          <Text className="text-white text-xs">Realtime insights</Text>
                        </View>
                        <View className="px-3 py-1.5 rounded-full border border-white/40">
                          <Text className="text-white text-xs">Track services</Text>
                        </View>
                        <View className="px-3 py-1.5 rounded-full border border-white/40">
                          <Text className="text-white text-xs">Case management</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
