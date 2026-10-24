import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ShieldOff } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessDisabled } from '@/hooks/useBusinessDisabled';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

const SUPPORT_EMAIL = 'getfyll@gmail.com';

// Shown to everyone in a business that Fyll has disabled. Nothing is deleted; once Fyll turns the
// account back on, signing in again works exactly as before.
export default function AccountDisabledScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const logout = useAuthStore((s) => s.logout);
  const { reason } = useBusinessDisabled();

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 24, gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,0.12)' }}>
            <ShieldOff size={22} color="#DC2626" strokeWidth={2} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700' }}>This account has been disabled</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 14, lineHeight: 20 }}>
            Access to this business on Fyll is paused. Your data is safe and nothing has been deleted. Contact us and we will help you get back in.
          </Text>
          {reason ? (
            <View style={{ borderRadius: 14, backgroundColor: colors.bg.secondary, padding: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>Note from Fyll</Text>
              <Text style={{ color: colors.text.secondary, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>{reason}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('My Fyll account is disabled')}`); }}
            style={{ height: 48, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Contact {SUPPORT_EMAIL}</Text>
          </Pressable>
          <Pressable onPress={handleSignOut} style={{ height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
