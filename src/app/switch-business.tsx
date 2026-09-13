import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, Check, Plus, X } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessSwitcherStore, type SavedBusiness, type SavedBusinessSession } from '@/lib/state/business-switcher-store';
import { supabase } from '@/lib/supabase';
import { switchBusiness, switchToSavedBusiness } from '@/lib/switch-business';
import { useBreakpoint } from '@/lib/useBreakpoint';

export default function SwitchBusinessScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.businessId);
  const userId = useAuthStore((s) => s.currentUser?.id);
  const currentEmail = useAuthStore((s) => s.currentUser?.email ?? '');
  const businesses = useBusinessSwitcherStore((s) => s.businesses);
  const remember = useBusinessSwitcherStore((s) => s.remember);
  const forget = useBusinessSwitcherStore((s) => s.forget);
  const [adding, setAdding] = useState<boolean>(false);
  const [selected, setSelected] = useState<SavedBusiness | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [formMessage, setFormMessage] = useState<string>('');
  const [removing, setRemoving] = useState<SavedBusiness | null>(null);
  const returnSource = Array.isArray(from) ? from[0] : from;
  const returnRoute = returnSource === 'settings' ? '/(tabs)/settings' : '/(tabs)';

  const currentBusiness = useQuery({
    queryKey: ['switcher-current-business', businessId, userId],
    enabled: Boolean(businessId && userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('businesses').select('id, name').eq('id', businessId!).single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });
  useEffect(() => {
    let mounted = true;
    const saveCurrentBusiness = async () => {
      if (!currentBusiness.data?.name || !businessId || !userId || !currentEmail || currentBusiness.data.id !== businessId) return;
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session ? ({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      } satisfies SavedBusinessSession) : undefined;
      remember({ businessId, userId, email: currentEmail, name: currentBusiness.data.name, session });
    };
    saveCurrentBusiness().catch(() => undefined);
    return () => { mounted = false; };
  }, [businessId, currentBusiness.data, currentEmail, remember, userId]);

  const login = useMutation({
    mutationFn: async () => {
      Keyboard.dismiss();
      setFormMessage('');
      const enteredPassword = password;
      setPassword('');
      await switchBusiness({ email, password: enteredPassword, expectedBusinessId: selected?.businessId }, queryClient,
        () => router.replace('/(tabs)'));
    },
  });
  const quickSwitch = useMutation({
    mutationFn: async (business: SavedBusiness) => {
      await switchToSavedBusiness(business, queryClient, () => router.replace('/(tabs)'));
    },
    onError: (error, business) => {
      login.reset();
      setSelected(business);
      setAdding(true);
      setEmail(business.email);
      setPassword('');
      const message = error instanceof Error ? error.message : 'Please sign in once to refresh this saved business.';
      setFormMessage(message.includes('saved sign-in') || message.includes('save this business')
        ? 'Your saved sign-in needs refreshing. Enter the password once and future switches will be instant again.'
        : message);
    },
  });
  const openLogin = (business: SavedBusiness | null) => {
    login.reset();
    quickSwitch.reset();
    setFormMessage('');
    setSelected(business);
    setAdding(true);
    setEmail(business?.email ?? '');
    setPassword('');
  };
  const closeLogin = () => {
    if (login.isPending || quickSwitch.isPending) return;
    setAdding(false);
    setSelected(null);
    setPassword('');
    login.reset();
    quickSwitch.reset();
    setFormMessage('');
  };
  const goBack = () => router.replace(returnRoute as never);
  const fieldStyle = {
    color: colors.text.primary, backgroundColor: colors.bg.secondary,
    borderWidth: 1, borderColor: colors.border.light, borderRadius: 14,
    paddingHorizontal: 16, height: 54, fontSize: 16,
  };
  const visibleBusinesses = [...businesses].sort((a, b) => {
    const aActive = a.businessId === businessId && a.userId === userId;
    const bActive = b.businessId === businessId && b.userId === userId;
    return Number(bActive) - Number(aActive);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
      <View
        className="px-5 pt-4 pb-3 flex-row items-center justify-between"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          ...(Platform.OS === 'web' ? { paddingTop: 10, paddingBottom: 10 } : {}),
        }}
      >
        <View className="flex-row items-center">
          <Pressable
            accessibilityLabel="Back"
            onPress={() => adding ? closeLogin() : goBack()}
            disabled={login.isPending || quickSwitch.isPending}
            className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
            style={{ backgroundColor: 'transparent' }}
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text
            style={{
              color: colors.text.primary,
              fontSize: Platform.OS === 'web' ? 14 : 20,
              lineHeight: Platform.OS === 'web' ? 18 : 24,
              fontWeight: '600',
            }}
          >
            Switch Business
          </Text>
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: isMobile ? 20 : 24,
          paddingTop: isMobile ? 14 : 24,
          paddingBottom: 24,
        }}
      >
        <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', paddingVertical: isMobile ? 0 : 16 }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-2 tracking-wider">
            {adding ? selected ? 'Sign in' : 'Add business' : 'Your businesses'}
          </Text>
          <Text
            style={{
              color: colors.text.tertiary,
              marginBottom: isMobile ? 22 : 32,
              lineHeight: isMobile ? 21 : 24,
            }}
            className="text-base mt-2"
          >
            {adding
              ? 'Use the existing login once. After it is saved on this device, switching back will not ask for the password again.'
              : 'Manage your independent Fyll businesses from one place. Each workspace keeps its own data, team and permissions.'}
          </Text>

          {adding ? (
            <View>
              {selected && <View style={{ backgroundColor: colors.bg.secondary }} className="rounded-2xl p-4 mb-6 flex-row items-center">
                <Building2 size={24} color={colors.text.primary} />
                <Text style={{ color: colors.text.primary }} className="ml-3 text-base font-semibold flex-1">{selected.name}</Text>
              </View>}
              <Text style={{ color: colors.text.primary }} className="font-medium mb-2">Login email</Text>
              <TextInput accessibilityLabel="Login email" value={email} onChangeText={setEmail}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email"
                editable={!login.isPending} style={fieldStyle} placeholder="you@business.com" placeholderTextColor={colors.text.muted} />
              <Text style={{ color: colors.text.primary }} className="font-medium mt-5 mb-2">Password</Text>
              <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword}
                secureTextEntry autoCapitalize="none" autoComplete="current-password"
                editable={!login.isPending} style={fieldStyle} returnKeyType="go"
                onSubmitEditing={() => { if (email.trim() && password && !login.isPending) login.mutate(); }} />
              {(login.error || formMessage) && <Text accessibilityRole="alert" style={{ color: '#DC2626' }} className="mt-4 leading-5">{login.error?.message ?? formMessage}</Text>}
              <Pressable onPress={() => login.mutate()} disabled={login.isPending || !email.trim() || !password}
                accessibilityRole="button"
                style={{ backgroundColor: colors.text.primary, opacity: login.isPending || !email.trim() || !password ? 0.45 : 1 }}
                className="rounded-full h-14 items-center justify-center flex-row mt-7">
                {login.isPending ? <ActivityIndicator color={colors.bg.primary} /> :
                  <><Text style={{ color: colors.bg.primary }} className="font-semibold text-base mr-2">
                    {selected ? 'Sign in and switch' : 'Add and open business'}
                  </Text><ArrowRight size={18} color={colors.bg.primary} /></>}
              </Pressable>
              <Text style={{ color: colors.text.muted }} className="text-sm mt-4 leading-5">
                Only businesses already set up in Fyll can be added. Passwords are never saved; this device keeps a saved sign-in for fast switching.
              </Text>
              <Pressable onPress={closeLogin} disabled={login.isPending} className="self-center p-4 mt-2">
                <Text style={{ color: colors.text.secondary }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {currentBusiness.isLoading && <ActivityIndicator style={{ marginBottom: 20 }} color={colors.text.primary} />}
              {currentBusiness.isError && <Text style={{ color: '#DC2626' }} className="mb-4">
                Could not load your current business name.
              </Text>}
              {visibleBusinesses.map((business) => {
                const active = business.businessId === businessId && business.userId === userId;
                return <View key={business.businessId + ':' + business.userId}
                  style={{ borderColor: active ? colors.text.primary : colors.border.light, backgroundColor: colors.bg.secondary }}
                  className="border rounded-2xl mb-3 flex-row items-center">
                  <Pressable onPress={() => !active && (business.session ? quickSwitch.mutate(business) : openLogin(business))} disabled={active || quickSwitch.isPending}
                    accessibilityRole="button" accessibilityLabel={active ? business.name + ', current business' : 'Switch to ' + business.name}
                    className="flex-1 flex-row items-center p-5">
                    <Building2 size={25} color={colors.text.primary} />
                    <View className="ml-4 flex-1">
                      <Text style={{ color: colors.text.primary }} className="text-base font-semibold">{business.name}</Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">{business.email}</Text>
                      <View className="flex-row flex-wrap items-center mt-2">
                        {active && (
                        <View
                          className="self-start rounded-full px-2.5 py-1 mr-2 mb-1"
                          style={{ backgroundColor: 'rgba(34, 197, 94, 0.14)' }}
                        >
                          <Text style={{ color: '#16A34A' }} className="text-xs font-semibold">
                            Currently active
                          </Text>
                        </View>
                        )}
                        {!active && business.session && (
                          <View
                            className="self-start rounded-full px-2.5 py-1 mb-1"
                            style={{ backgroundColor: 'rgba(17, 24, 39, 0.08)' }}
                          >
                            <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">
                              Saved sign-in
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {quickSwitch.isPending && quickSwitch.variables?.businessId === business.businessId && quickSwitch.variables?.userId === business.userId
                      ? <ActivityIndicator color={colors.text.primary} />
                      : active ? <Check size={20} color={colors.text.primary} /> : <ArrowRight size={18} color={colors.text.muted} />}
                  </Pressable>
                  {!active && <Pressable accessibilityLabel={'Remove ' + business.name + ' from this device'} disabled={quickSwitch.isPending} onPress={() => setRemoving(business)}
                    className="p-4"><X size={18} color={colors.text.muted} /></Pressable>}
                </View>;
              })}
              {removing && <View style={{ borderColor: colors.border.light }} className="border rounded-2xl p-5 my-3">
                <Text style={{ color: colors.text.primary }} className="font-semibold">Remove {removing.name} from this device?</Text>
                <Text style={{ color: colors.text.tertiary }} className="mt-2 leading-5">The business and its data will remain intact. You can add it again using its login.</Text>
                <View className="flex-row mt-4">
                  <Pressable onPress={() => { forget(removing.businessId, removing.userId); setRemoving(null); }} className="py-3 pr-6">
                    <Text style={{ color: '#DC2626' }} className="font-semibold">Remove</Text>
                  </Pressable>
                  <Pressable onPress={() => setRemoving(null)} className="p-3"><Text style={{ color: colors.text.primary }}>Cancel</Text></Pressable>
                </View>
              </View>}
              <Pressable onPress={() => openLogin(null)} accessibilityRole="button"
                style={{ borderColor: colors.border.light }} className="border rounded-2xl flex-row items-center justify-center p-5 mt-3">
                <Plus size={20} color={colors.text.primary} />
                <Text style={{ color: colors.text.primary }} className="ml-2 font-semibold text-base">Add existing business</Text>
              </Pressable>
              <Text style={{ color: colors.text.muted }} className="text-sm mt-5 leading-5">
                Saved on this device. Businesses with saved sign-in switch instantly without asking for the password.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
