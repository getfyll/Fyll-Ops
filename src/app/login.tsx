import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, UserPlus, ChevronLeft, User as UserIcon, Key } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { AuthField, AuthHeader, AuthNote, AuthPrimaryButton, AuthShell } from '@/components/auth/AuthShell';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
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
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= 1200;
  const isDark = useResolvedThemeMode() === 'dark';
  const primaryActionBg = FYLL_LIME;
  const primaryActionText = FYLL_LIME_INK;
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

  const loginLink = (
    <Pressable
      onPress={() => {
        setMode('login');
        resetInviteForm();
        resetSignupForm();
      }}
      className="active:opacity-70"
    >
      <Text style={{ color: palette.muted, fontSize: 14 }}>
        Already have an account? <Text style={{ color: palette.limeOnSurface, fontWeight: '700' }}>Log in</Text>
      </Text>
    </Pressable>
  );

  if (mode === 'invite') {
    return (
      <AuthShell
        isWide={isWide}
        topRight={loginLink}
        hero={{
          uri: teamHeroUri,
          onError: () => {
            if (teamHeroUri !== AUTH_HERO_FALLBACK_URI) {
              setTeamHeroUri(AUTH_HERO_FALLBACK_URI);
            }
          },
          title: 'Welcome to the team.',
          body: 'Join your workspace and start collaborating on orders, services, and cases.',
          chips: ['Shared customers', 'Live order updates', 'Thread collaboration'],
        }}
      >
        {/* Back Button */}
                <Pressable
                  onPress={() => {
                    setMode('login');
                    resetInviteForm();
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center mb-6 active:opacity-50"
                  style={{ backgroundColor: palette.softFill }}
                >
                  <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

                {/* Header */}
<AuthHeader title="Join your team." subtitle="Enter your invite code to create an account" />

{!inviteEmail ? (
                  // Step 1: Enter invite code
                  <View>
                    <View className="mb-4">
                      <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                        Invite Code
                      </Text>
                      <AuthField error={Boolean(inviteError)}>
                        <TextInput
                          value={inviteCode}
                          onChangeText={(text) => {
                            setInviteCode(text.toUpperCase());
                            setInviteError('');
                          }}
                          placeholder="Enter code (e.g. ABC123XY)"
                          placeholderTextColor={palette.faint}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          style={{
                            flex: 1,
                            color: palette.text,
                            fontSize: 16,
                            marginLeft: 0,
                            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                            letterSpacing: 2,
                          }}
                          selectionColor={colors.text.primary}
                        />
                      </AuthField>
                    </View>

                    {inviteError ? (
                      <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: palette.dangerBg }}>
                        <Text style={{ color: palette.danger }} className="text-sm text-center">{inviteError}</Text>
                      </View>
                    ) : null}

                    <AuthPrimaryButton label="Verify code" onPress={handleVerifyCode} />
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
                      <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                        Your Name
                      </Text>
                      <AuthField>
                        <TextInput
                          value={inviteName}
                          onChangeText={(text) => {
                            setInviteName(text);
                            setInviteError('');
                          }}
                          placeholder="Enter your full name"
                          placeholderTextColor={palette.faint}
                          style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                          selectionColor={colors.text.primary}
                        />
                      </AuthField>
                    </View>

                    {/* Password Input */}
                    <View className="mb-4">
                      <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                        Create Password
                      </Text>
                      <AuthField error={Boolean(inviteError)}>
                        <TextInput
                          value={invitePassword}
                          onChangeText={(text) => {
                            setInvitePassword(text);
                            setInviteError('');
                          }}
                          placeholder="Create a password"
                          placeholderTextColor={palette.faint}
                          secureTextEntry={!showInvitePassword}
                          style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                          selectionColor={colors.text.primary}
                        />
                        <Pressable onPress={() => setShowInvitePassword(!showInvitePassword)}>
                          {showInvitePassword ? (
                            <EyeOff size={20} color={colors.text.tertiary} />
                          ) : (
                            <Eye size={20} color={colors.text.tertiary} />
                          )}
                        </Pressable>
                      </AuthField>
                    </View>

                    {/* Confirm Password */}
                    <View className="mb-6">
                      <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                        Confirm Password
                      </Text>
                      <AuthField error={Boolean(inviteError)}>
                        <TextInput
                          value={inviteConfirmPassword}
                          onChangeText={(text) => {
                            setInviteConfirmPassword(text);
                            setInviteError('');
                          }}
                          placeholder="Confirm password"
                          placeholderTextColor={palette.faint}
                          secureTextEntry={!showInvitePassword}
                          style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                          selectionColor={colors.text.primary}
                        />
                      </AuthField>
                    </View>

                    {inviteError ? (
                      <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: palette.dangerBg }}>
                        <Text style={{ color: palette.danger }} className="text-sm text-center">{inviteError}</Text>
                      </View>
                    ) : null}

                    <AuthPrimaryButton label={isLoading ? 'Creating account...' : 'Create account'} onPress={handleCreateAccount} loading={isLoading} />
                  </View>
                )}
      </AuthShell>
    );
  }

  if (mode === 'signup') {
    return (
      <AuthShell
        isWide={isWide}
        topRight={loginLink}
        hero={{
          uri: authHeroUri,
          onError: () => {
            if (authHeroUri !== AUTH_HERO_FALLBACK_URI) {
              setAuthHeroUri(AUTH_HERO_FALLBACK_URI);
            }
          },
          title: 'Start with a clean setup.',
          body: 'Build your catalog, services, and cases with a focused workflow.',
          chips: ['Fast onboarding', 'Service management', 'Case tracking'],
        }}
      >
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
                      className="w-10 h-10 rounded-full items-center justify-center mb-6 active:opacity-50"
                      style={{ backgroundColor: palette.softFill }}
                    >
                      <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>

                    {/* Header */}
<AuthHeader title={signupAccessCodeVerified ? 'Create your account.' : 'VIP founder access.'} subtitle={signupAccessCodeVerified ? 'Set up your business in minutes' : 'Enter your access code to unlock founder signup'} />

{!signupAccessCodeVerified ? (
                      <View>
                        <View className="mb-4">
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Access Code
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={signupAccessCode}
                              onChangeText={(text) => {
                                setSignupAccessCode(text.toUpperCase());
                                setSignupError('');
                                setSignupAccessCodeMessage('');
                              }}
                              placeholder="Enter VIP code (e.g. MINT2026)"
                              placeholderTextColor={palette.faint}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              style={{
                                flex: 1,
                                color: palette.text,
                                fontSize: 16,
                                marginLeft: 0,
                                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                                letterSpacing: 1.5,
                              }}
                              selectionColor={colors.text.primary}
                            />
                          </AuthField>
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
                          <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: palette.dangerBg }}>
                            <Text style={{ color: palette.danger }} className="text-sm text-center">{signupError}</Text>
                          </View>
                        ) : null}

                        <AuthPrimaryButton label={isVerifyingSignupAccessCode ? 'Checking access...' : 'Unlock signup'} onPress={handleVerifySignupAccessCode} loading={isVerifyingSignupAccessCode} />
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
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Business Name
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={businessName}
                              onChangeText={(text) => {
                                setBusinessName(text);
                                setSignupError('');
                              }}
                              placeholder="Business name"
                              placeholderTextColor={palette.faint}
                              style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                              selectionColor={colors.text.primary}
                            />
                          </AuthField>
                        </View>

                        {/* Name */}
                        <View className="mb-4">
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Your Name
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={signupName}
                              onChangeText={(text) => {
                                setSignupName(text);
                                setSignupError('');
                              }}
                              placeholder="Your full name"
                              placeholderTextColor={palette.faint}
                              style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                              selectionColor={colors.text.primary}
                            />
                          </AuthField>
                        </View>

                        {/* Email */}
                        <View className="mb-4">
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Email Address
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={signupEmail}
                              onChangeText={(text) => {
                                setSignupEmail(text);
                                setSignupError('');
                              }}
                              placeholder="you@business.com"
                              placeholderTextColor={palette.faint}
                              keyboardType="email-address"
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                              selectionColor={colors.text.primary}
                            />
                          </AuthField>
                        </View>

                        {/* Password */}
                        <View className="mb-4">
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Password
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={signupPassword}
                              onChangeText={(text) => {
                                setSignupPassword(text);
                                setSignupError('');
                              }}
                              placeholder="Create a password"
                              placeholderTextColor={palette.faint}
                              secureTextEntry={!showPassword}
                              style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                              selectionColor={colors.text.primary}
                            />
                            <Pressable onPress={() => setShowPassword(!showPassword)}>
                              {showPassword ? (
                                <EyeOff size={20} color={colors.text.tertiary} />
                              ) : (
                                <Eye size={20} color={colors.text.tertiary} />
                              )}
                            </Pressable>
                          </AuthField>
                        </View>

                        {/* Confirm Password */}
                        <View className="mb-6">
                          <Text style={{ color: palette.textSoft }} className="text-sm font-medium mb-2">
                            Confirm Password
                          </Text>
                          <AuthField error={Boolean(signupError)}>
                            <TextInput
                              value={signupConfirmPassword}
                              onChangeText={(text) => {
                                setSignupConfirmPassword(text);
                                setSignupError('');
                              }}
                              placeholder="Confirm password"
                              placeholderTextColor={palette.faint}
                              secureTextEntry={!showPassword}
                              style={{ flex: 1, color: palette.text, fontSize: 16, marginLeft: 0 }}
                              selectionColor={colors.text.primary}
                            />
                          </AuthField>
                        </View>

                        {signupError ? (
                          <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: palette.dangerBg }}>
                            <Text style={{ color: palette.danger }} className="text-sm text-center">{signupError}</Text>
                          </View>
                        ) : null}

                        <AuthPrimaryButton label={isLoading ? 'Creating account...' : 'Create account'} onPress={handleSignup} loading={isLoading} />
                      </>
                    )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      isWide={isWide}
      hero={{
        uri: authHeroUri,
        onError: () => {
          if (authHeroUri !== AUTH_HERO_FALLBACK_URI) {
            setAuthHeroUri(AUTH_HERO_FALLBACK_URI);
          }
        },
        title: 'Run your ops with clarity.',
        body: 'Inventory, orders, services, and cases — all in one focused workspace.',
        chips: ['Realtime insights', 'Track services', 'Case management'],
      }}
    >
      <AuthHeader title="Log in to your business" subtitle="Orders, stock, payments and your team, in one place." />

      {/* Email Input */}
      <View className="mb-5">
        <Text style={{ color: palette.textSoft, fontSize: 15, fontWeight: '500', marginBottom: 8 }}>Business email</Text>
        <AuthField error={Boolean(error)}>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError('');
            }}
            placeholder="you@business.com"
            placeholderTextColor={palette.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: palette.text, fontSize: 16 }}
            selectionColor={colors.text.primary}
          />
        </AuthField>
      </View>

      {/* Password Input */}
      <View className="mb-6">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ color: palette.textSoft, fontSize: 15, fontWeight: '500' }}>Password</Text>
          <Pressable onPress={handlePasswordReset} disabled={isResetting} className="active:opacity-70">
            <Text style={{ color: palette.limeOnSurface, fontSize: 14.5, fontWeight: '700' }}>
              {isResetting ? 'Sending reset email...' : 'Forgot password?'}
            </Text>
          </Pressable>
        </View>
        <AuthField error={Boolean(error)}>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            placeholder="Your password"
            placeholderTextColor={palette.faint}
            secureTextEntry={!showPassword}
            style={{ flex: 1, color: palette.text, fontSize: 16 }}
            selectionColor={colors.text.primary}
            onSubmitEditing={handleLogin}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
            {showPassword ? (
              <EyeOff size={20} color={colors.text.tertiary} />
            ) : (
              <Eye size={20} color={colors.text.tertiary} />
            )}
          </Pressable>
        </AuthField>
      </View>

      {/* Error */}
      {error ? (
        <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: palette.dangerBg }}>
          <Text style={{ color: palette.danger }} className="text-sm text-center">{error}</Text>
        </View>
      ) : null}

      {resetMessage ? (
        <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
          <Text style={{ color: '#22C55E' }} className="text-sm text-center">{resetMessage}</Text>
        </View>
      ) : null}

      <AuthPrimaryButton label={isLoading ? 'Logging in...' : 'Log in'} onPress={handleLogin} loading={isLoading} />

      <AuthNote
        compact={!isWide}
        rows={[
          { label: 'Joining a team?', action: 'Use your invite code', onPress: () => { setMode('invite'); resetInviteForm(); } },
          { label: 'Starting a business?', action: 'Use your founder access code', onPress: () => { setMode('signup'); resetSignupForm(); } },
        ]}
      />
    </AuthShell>
  );
}
