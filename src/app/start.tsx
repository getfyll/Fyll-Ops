import React, { useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Mail, UserPlus } from 'lucide-react-native';
import { AuthHeader, AuthPrimaryButton, AuthShell } from '@/components/auth/AuthShell';
import { MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

const AUTH_HERO_LOCAL_URI = '/images/auth-hero.png';
const AUTH_HERO_FALLBACK_URI = 'https://images.unsplash.com/photo-1623177579166-7029cf1d4d7e?auto=format&fit=crop&w=2000&q=80';

// A quiet outline row for the secondary choices under the main "Log in" button.
function OptionRow({ icon: Icon, title, hint, onPress }: { icon: typeof Mail; title: string; hint: string; onPress: () => void }) {
  const palette = usePaymentsPalette();
  return (
    <Pressable
      onPress={onPress}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 68,
        paddingHorizontal: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: palette.outline,
        backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent',
      })}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
        <Icon size={18} color={palette.textSoft} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <MoneyText style={{ color: palette.text, fontSize: 15 }}>{title}</MoneyText>
        <Text style={{ color: palette.muted, fontSize: 13, marginTop: 2 }}>{hint}</Text>
      </View>
      <ArrowRight size={18} color={palette.faint} strokeWidth={2} />
    </Pressable>
  );
}

export default function StartScreen() {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 1200;
  const [authHeroUri, setAuthHeroUri] = useState<string>(AUTH_HERO_LOCAL_URI);

  return (
    <AuthShell
      isWide={isWide}
      hero={{
        uri: authHeroUri,
        onError: () => {
          if (authHeroUri !== AUTH_HERO_FALLBACK_URI) setAuthHeroUri(AUTH_HERO_FALLBACK_URI);
        },
        title: 'Run your ops with clarity.',
        body: 'Inventory, orders, services, payments and cases, all in one focused workspace.',
        chips: ['Realtime insights', 'Track services', 'Case management'],
      }}
    >
      <AuthHeader title="Welcome to Fyll." subtitle="Orders, stock, payments and your team, in one place." />

      <AuthPrimaryButton label="Log in" onPress={() => router.push('/login')} />

      <View style={{ marginTop: 22, gap: 12 }}>
        <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>New to Fyll?</Text>
        <OptionRow icon={UserPlus} title="Sign up" hint="Create your business with an access code" onPress={() => router.push('/login?signup=1')} />
        <OptionRow icon={Mail} title="Request an invitation" hint="Tell us about your business and we'll be in touch" onPress={() => router.push('/request-invite')} />
      </View>
    </AuthShell>
  );
}
