import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { acceptPartnerInvite, lookupPartnerPortalByAuth } from '@/lib/supabase/partner-portal';

const FYLL_LOGO_XML = (fill: string) => `<svg width="72" height="24" viewBox="0 0 344 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M27.2814 190.462V91.8673H78.4995H79.4995V90.8673V70.5023V69.5023H78.4995H27.2814V58.7533C27.2814 48.4452 29.5154 40.4114 33.8725 34.546L33.8726 34.546L33.8804 34.5351C38.1419 28.6347 45.6793 25.5504 56.829 25.5504C62.3428 25.5504 66.9479 26.068 70.6648 27.0817L70.6854 27.0873L70.7063 27.0921C74.5027 27.9549 77.3729 28.8909 79.3577 29.8834L80.5143 30.4617L80.7831 29.1968L85.2217 8.30955L85.3942 7.4978L84.6281 7.17862C82.4396 6.26676 78.6987 5.2942 73.4771 4.24979C68.3435 3.18796 62.1805 2.66317 55.0014 2.66317C36.5665 2.66317 22.8382 7.49247 14.0498 17.3545C5.30253 26.9965 1 40.6716 1 58.2311V190.462V191.462H2H26.2814H27.2814V190.462ZM101.618 167.36L100.5 166.852L100.229 168.049L95.7903 187.631L95.617 188.396L96.3183 188.747C97.0819 189.128 98.2703 189.582 99.8435 190.106L99.8579 190.111L99.8724 190.115C101.641 190.646 103.494 191.088 105.432 191.441C107.547 191.968 109.665 192.322 111.785 192.5C113.908 192.852 115.951 193.03 117.914 193.03C125.128 193.03 131.583 192.15 137.267 190.375C143.129 188.598 148.378 185.841 153.006 182.103C157.625 178.372 161.782 173.591 165.483 167.778C169.351 162.149 173.032 155.396 176.529 147.528L176.533 147.519C185.423 126.948 193.702 104.9 201.369 81.3759L201.37 81.3738C209.036 57.6773 216.005 33.0244 222.277 7.41531L222.58 6.17744H221.306H196.241H195.444L195.266 6.95389C190.918 25.9141 186.308 44.3515 181.438 62.2663C176.774 79.422 171.312 96.739 165.051 114.217C161.251 106.035 157.597 97.5585 154.089 88.7884C150.266 79.2297 146.703 69.6713 143.401 60.1134C140.099 50.5532 137.057 41.2547 134.277 32.2179C131.67 23.1809 129.411 14.755 127.501 6.93999L127.315 6.17744H126.53H100.421H99.1265L99.4532 7.42986C105.73 31.4914 113.576 55.2903 122.99 78.8265L122.994 78.8348C132.512 102.024 142.718 124.014 153.614 144.802C149.35 154.066 144.629 160.632 139.494 164.608L139.486 164.614L139.479 164.62C134.318 168.782 127.084 170.926 117.653 170.926C114.793 170.926 111.837 170.505 108.782 169.657L108.763 169.651L108.744 169.647C105.823 168.959 103.453 168.194 101.618 167.36ZM280.241 193.029L281.108 193.049L281.251 192.194L284.645 171.829L284.814 170.813L283.794 170.674C280.004 170.157 276.838 169.557 274.285 168.879C271.801 168.046 269.867 166.902 268.439 165.474C267.022 164.057 265.965 162.136 265.304 159.658C264.638 157.161 264.293 153.948 264.293 149.994V3V1.81327L263.124 2.01448L238.842 6.19192L238.012 6.33479V7.17744V153.91C238.012 166.933 241.179 176.732 247.714 183.086C254.253 189.443 265.186 192.679 280.241 193.029ZM337.583 191.462L338.45 191.482L338.592 190.627L341.986 170.262L342.156 169.246L341.135 169.106C337.346 168.59 334.18 167.99 331.627 167.311C329.142 166.479 327.208 165.335 325.781 163.907C324.363 162.49 323.306 160.569 322.646 158.09C321.98 155.593 321.635 152.381 321.635 148.427V3.00075V1.81402L320.465 2.01523L296.184 6.19267L295.354 6.33554V7.17819V152.343C295.354 165.366 298.52 175.165 305.056 181.519C311.594 187.876 322.527 191.112 337.583 191.462Z" fill="${fill}" stroke="${fill}" stroke-width="2"/>
</svg>`;

export default function PartnerLoginScreen() {
  const colors = useThemeColors();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 380 }}>
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <SvgXml xml={FYLL_LOGO_XML(colors.text.primary)} width={72} height={24} />
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', marginTop: 16 }}>Partner Login</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Sign in with the account you were invited with.
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14 }}>
                <Mail size={16} color={colors.text.tertiary} strokeWidth={2} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={{ flex: 1, marginLeft: 10, color: colors.text.primary, fontSize: 14 }}
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14 }}>
                <Lock size={16} color={colors.text.tertiary} strokeWidth={2} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry={!showPassword}
                  style={{ flex: 1, marginLeft: 10, color: colors.text.primary, fontSize: 14 }}
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? <EyeOff size={16} color={colors.text.tertiary} strokeWidth={2} /> : <Eye size={16} color={colors.text.tertiary} strokeWidth={2} />}
                </Pressable>
              </View>

              {error ? (
                <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>{error}</Text>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                style={{ height: 48, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: isLoading ? 0.7 : 1, marginTop: 4 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bg.primary} size="small" />
                ) : (
                  <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '700' }}>Sign In</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
