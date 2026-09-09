import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogIn, UserPlus, Mail } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { FyllLogo } from '@/components/FyllLogo';

const AUTH_HERO_LOCAL_URI = '/images/auth-hero.png';
const AUTH_HERO_FALLBACK_URI = 'https://images.unsplash.com/photo-1623177579166-7029cf1d4d7e?auto=format&fit=crop&w=2000&q=80';

export default function StartScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= 1200;
  const isDark = useResolvedThemeMode() === 'dark';
  const primaryActionBg = isDark ? '#FFFFFF' : '#111111';
  const primaryActionText = isDark ? '#111111' : '#FFFFFF';
  const [authHeroUri, setAuthHeroUri] = useState<string>(AUTH_HERO_LOCAL_URI);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={isWide ? { flexGrow: 1 } : { paddingBottom: 32, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View className={isWide ? 'flex-1 flex-row' : 'flex-1'}>
            <View className={isWide ? 'w-[52%] items-center justify-center' : 'flex-1 items-center justify-center'}>
              <View className={isWide ? 'w-full max-w-[480px] px-10 py-12' : 'w-full px-6 py-12'}>
                <View className="items-center mb-12">
                  <FyllLogo width={56} color={colors.text.primary} />
                  <Text style={{ color: colors.text.primary }} className="text-3xl font-bold mt-5 text-center">
                    Run your ops with clarity.
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-base text-center mt-3">
                    Inventory, orders, services, and cases — all in one focused workspace.
                  </Text>
                </View>

                <Pressable
                  onPress={() => router.push('/login')}
                  className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                  style={{ backgroundColor: primaryActionBg, height: 56 }}
                >
                  <LogIn size={18} color={primaryActionText} strokeWidth={2} style={{ marginRight: 8 }} />
                  <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                    Log In
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/login?signup=1')}
                  className="mt-4 rounded-xl items-center justify-center active:opacity-80 flex-row"
                  style={{ borderWidth: 1, borderColor: colors.border.light, height: 56 }}
                >
                  <UserPlus size={18} color={colors.text.primary} strokeWidth={2} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                    Sign Up
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/request-invite')}
                  className="mt-4 rounded-xl items-center justify-center active:opacity-80 flex-row"
                  style={{ borderWidth: 1, borderColor: colors.border.light, height: 56 }}
                >
                  <Mail size={18} color={colors.text.primary} strokeWidth={2} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                    Request an Invitation
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
                      Built for teams that ship.
                    </Text>
                    <Text className="text-white/80 text-sm mt-3">
                      Realtime insights, service tracking, and case management in one place.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
