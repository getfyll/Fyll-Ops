import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, Mail, Shield, ArrowRight, Building2, KeyRound } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { FyllLogo } from '@/components/FyllLogo';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';

export default function PlatformAdminLoginScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/platform-admin');
    }
  }, [isAuthenticated, router]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await login(email.trim(), password);
      if (result.success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/platform-admin');
        return;
      }

      setError(result.error || 'Sign in failed.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (error) {
      console.error('Platform admin login failed:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#09090B' }}>
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-1 items-center justify-center px-6 py-10">
              <View style={{ width: '100%', maxWidth: 1120, flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 18 }}>
                <LinearGradient
                  colors={['#0F172A', '#111827', '#0B1220']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    flex: 1,
                    minHeight: 540,
                    borderRadius: 32,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    paddingHorizontal: 28,
                    paddingVertical: 30,
                    justifyContent: 'space-between',
                  }}
                >
                  <View>
                    <View
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 18,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Shield size={28} color="#F8FAFC" strokeWidth={1.8} />
                    </View>
                    <Text style={{ color: '#F8FAFC', fontSize: 34, fontWeight: '700', marginTop: 22 }}>
                      Fyll Platform Console
                    </Text>
                    <Text style={{ color: 'rgba(248,250,252,0.72)', fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 420 }}>
                      Internal control room for onboarding businesses, issuing founder access, and managing invite-only growth.
                    </Text>
                  </View>

                  <View style={{ gap: 12 }}>
                    {[
                      {
                        icon: <Building2 size={18} color="#93C5FD" strokeWidth={1.8} />,
                        title: 'Business directory',
                        copy: 'View every onboarded business without weakening tenant isolation.',
                      },
                      {
                        icon: <KeyRound size={18} color="#C4B5FD" strokeWidth={1.8} />,
                        title: 'Founder invite controls',
                        copy: 'Create, copy, share, and revoke founder access codes from one place.',
                      },
                      {
                        icon: <ArrowRight size={18} color="#86EFAC" strokeWidth={1.8} />,
                        title: 'Private rollout',
                        copy: 'Built for stealth mode. No public signup path, no open self-serve exposure.',
                      },
                    ].map((item) => (
                      <View
                        key={item.title}
                        style={{
                          borderRadius: 18,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.08)',
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          {item.icon}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '700' }}>
                            {item.title}
                          </Text>
                          <Text style={{ color: 'rgba(248,250,252,0.68)', fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                            {item.copy}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </LinearGradient>

                <View
                  style={{
                    width: Platform.OS === 'web' ? 420 : '100%',
                    borderRadius: 32,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    backgroundColor: '#FFFFFF',
                    paddingHorizontal: 24,
                    paddingVertical: 28,
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      backgroundColor: '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    <Shield size={24} color="#111111" strokeWidth={1.8} />
                  </View>

                  <FyllLogo width={82} color="#111111" />
                  <Text style={{ color: '#111111', fontSize: 28, fontWeight: '700', marginTop: 18 }}>
                    Admin Sign In
                  </Text>
                  <Text style={{ color: '#6B7280', fontSize: 14, lineHeight: 21, marginTop: 8 }}>
                    Use your internal Supabase account. This is separate from the regular Fyll workspace login experience.
                  </Text>

                  <View style={{ marginTop: 24 }}>
                    <Text style={{ color: '#374151', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
                      Work Email
                    </Text>
                    <View
                      style={{
                        height: 54,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        backgroundColor: '#F9FAFB',
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                      }}
                    >
                      <Mail size={18} color="#6B7280" strokeWidth={1.8} />
                      <TextInput
                        value={email}
                        onChangeText={(text) => {
                          setEmail(text);
                          setError('');
                        }}
                        placeholder="admin@fyll.com"
                        placeholderTextColor="#9CA3AF"
                        style={{ flex: 1, marginLeft: 10, color: '#111111', fontSize: 15 }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        selectionColor="#111111"
                      />
                    </View>
                  </View>

                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: '#374151', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
                      Password
                    </Text>
                    <View
                      style={{
                        height: 54,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        backgroundColor: '#F9FAFB',
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                      }}
                    >
                      <Lock size={18} color="#6B7280" strokeWidth={1.8} />
                      <TextInput
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          setError('');
                        }}
                        placeholder="Enter your password"
                        placeholderTextColor="#9CA3AF"
                        style={{ flex: 1, marginLeft: 10, color: '#111111', fontSize: 15 }}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        selectionColor="#111111"
                        onSubmitEditing={() => {
                          void handleLogin();
                        }}
                      />
                      <Pressable onPress={() => setShowPassword((value) => !value)} className="active:opacity-70">
                        {showPassword ? (
                          <EyeOff size={18} color="#6B7280" strokeWidth={1.8} />
                        ) : (
                          <Eye size={18} color="#6B7280" strokeWidth={1.8} />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  {error ? (
                    <View
                      style={{
                        marginTop: 16,
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        borderWidth: 1,
                        borderColor: 'rgba(239,68,68,0.16)',
                      }}
                    >
                      <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={() => { void handleLogin(); }}
                    disabled={isLoading}
                    className="active:opacity-80"
                    style={{
                      height: 56,
                      borderRadius: 999,
                      backgroundColor: '#111111',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 22,
                      opacity: isLoading ? 0.72 : 1,
                    }}
                  >
                    {isLoading ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginLeft: 10 }}>
                          Signing in...
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                          Enter platform console
                        </Text>
                        <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.2} style={{ marginLeft: 8 }} />
                      </View>
                    )}
                  </Pressable>

                  <Text style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 19, marginTop: 18 }}>
                    No signup here. Access is limited to existing internal accounts that are also allowlisted in `platform_admins`.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
