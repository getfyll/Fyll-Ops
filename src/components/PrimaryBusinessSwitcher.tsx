import React, { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, Plus } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { PasswordEyeToggle } from '@/components/PasswordEyeToggle';
import useAuthStore from '@/lib/state/auth-store';
import { claimBusiness, fetchMyBusinesses, type MyBusiness } from '@/lib/primary-account';
import { switchPrimaryBusiness } from '@/lib/switch-business';
import { areBusinessIdsEquivalent } from '@/lib/business-id';

// Switch Business for a primary Fyll account: one sign-in, several businesses. Switching
// never asks for a password; claiming another business proves ownership once with that
// business's own admin login.
export function PrimaryBusinessSwitcher({ navigateHome }: { navigateHome: () => void }) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((s) => s.businessId);
  const userId = useAuthStore((s) => s.currentUser?.id);

  const [claiming, setClaiming] = useState<boolean>(false);
  const [workEmail, setWorkEmail] = useState<string>('');
  const [workPassword, setWorkPassword] = useState<string>('');
  const [showWorkPassword, setShowWorkPassword] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>('');

  const businessesQuery = useQuery({
    queryKey: ['primary-businesses', userId],
    enabled: Boolean(userId),
    queryFn: fetchMyBusinesses,
  });

  const switchTo = useMutation({
    mutationFn: (business: MyBusiness) => switchPrimaryBusiness(business.businessId, queryClient, navigateHome),
  });

  const claim = useMutation({
    mutationFn: async () => {
      Keyboard.dismiss();
      const password = workPassword;
      setWorkPassword('');
      return claimBusiness({ workEmail: workEmail.trim().toLowerCase(), workPassword: password });
    },
    onSuccess: async () => {
      setNotice('Business added. You can switch to it below.');
      setClaiming(false);
      setWorkEmail('');
      await queryClient.invalidateQueries({ queryKey: ['primary-businesses', userId] });
    },
  });

  const field = {
    color: colors.text.primary,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    fontSize: 16,
  };
  const businesses = businessesQuery.data ?? [];
  const errorText = switchTo.error?.message ?? claim.error?.message ?? '';

  if (claiming) {
    return (
      <View>
        <Text style={{ color: colors.text.tertiary, marginBottom: 20, lineHeight: 21 }} className="text-base">
          Sign in as the other business's admin once to prove it's yours. We only use this to link it to your primary account; the password isn't saved.
        </Text>
        <Text style={{ color: colors.text.primary }} className="font-medium mb-2">Business login email</Text>
        <TextInput
          accessibilityLabel="Business login email"
          value={workEmail}
          onChangeText={setWorkEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!claim.isPending}
          style={field}
          placeholder="admin@business.com"
          placeholderTextColor={colors.text.muted}
        />
        <Text style={{ color: colors.text.primary }} className="font-medium mt-5 mb-2">Password</Text>
        <View style={{ justifyContent: 'center' }}>
          <TextInput
            accessibilityLabel="Business login password"
            value={workPassword}
            onChangeText={setWorkPassword}
            secureTextEntry={!showWorkPassword}
            autoCapitalize="none"
            editable={!claim.isPending}
            style={[field, { paddingRight: 52 }]}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (workEmail.trim() && workPassword && !claim.isPending) claim.mutate();
            }}
          />
          <View style={{ position: 'absolute', right: 14 }}>
            <PasswordEyeToggle visible={showWorkPassword} onToggle={() => setShowWorkPassword((v) => !v)} />
          </View>
        </View>
        {errorText ? <Text accessibilityRole="alert" style={{ color: '#DC2626' }} className="mt-4 leading-5">{errorText}</Text> : null}
        <Pressable
          onPress={() => claim.mutate()}
          disabled={claim.isPending || !workEmail.trim() || !workPassword}
          accessibilityRole="button"
          style={{ backgroundColor: colors.text.primary, opacity: claim.isPending || !workEmail.trim() || !workPassword ? 0.45 : 1 }}
          className="rounded-full h-14 items-center justify-center flex-row mt-7"
        >
          {claim.isPending ? <ActivityIndicator color={colors.bg.primary} /> : (
            <>
              <Text style={{ color: colors.bg.primary }} className="font-semibold text-base mr-2">Claim business</Text>
              <ArrowRight size={18} color={colors.bg.primary} />
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            if (claim.isPending) return;
            claim.reset();
            setClaiming(false);
            setWorkPassword('');
          }}
          className="self-center p-4 mt-2"
        >
          <Text style={{ color: colors.text.secondary }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={{ color: colors.text.tertiary, marginBottom: 24, lineHeight: 21 }} className="text-base">
        You're signed in with your primary email. Switch between the businesses you own without signing in again.
      </Text>

      {businessesQuery.isLoading ? <ActivityIndicator style={{ marginBottom: 20 }} color={colors.text.primary} /> : null}
      {businessesQuery.isError ? <Text style={{ color: '#DC2626' }} className="mb-4">Could not load your businesses.</Text> : null}
      {notice ? <Text style={{ color: '#16A34A' }} className="mb-4">{notice}</Text> : null}

      {businesses.map((business) => {
        const active = areBusinessIdsEquivalent(business.businessId, activeBusinessId);
        const switching = switchTo.isPending && switchTo.variables?.businessId === business.businessId;
        return (
          <Pressable
            key={business.businessId}
            onPress={() => {
              if (active || switchTo.isPending) return;
              setNotice('');
              switchTo.mutate(business);
            }}
            disabled={active || switchTo.isPending}
            accessibilityRole="button"
            accessibilityLabel={active ? `${business.name}, current business` : `Switch to ${business.name}`}
            style={{ borderColor: active ? colors.text.primary : colors.border.light, backgroundColor: colors.bg.secondary }}
            className="border rounded-2xl mb-3 flex-row items-center p-5"
          >
            <Building2 size={25} color={colors.text.primary} />
            <View className="ml-4 flex-1">
              <Text style={{ color: colors.text.primary }} className="text-base font-semibold">{business.name}</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1 capitalize">{business.role}</Text>
              {active ? (
                <View className="self-start rounded-full px-2.5 py-1 mt-2" style={{ backgroundColor: 'rgba(34, 197, 94, 0.14)' }}>
                  <Text style={{ color: '#16A34A' }} className="text-xs font-semibold">Currently active</Text>
                </View>
              ) : null}
            </View>
            {switching
              ? <ActivityIndicator color={colors.text.primary} />
              : active ? <Check size={20} color={colors.text.primary} /> : <ArrowRight size={18} color={colors.text.muted} />}
          </Pressable>
        );
      })}

      {errorText ? <Text accessibilityRole="alert" style={{ color: '#DC2626' }} className="mb-3 leading-5">{errorText}</Text> : null}

      <Pressable
        onPress={() => {
          setNotice('');
          switchTo.reset();
          setClaiming(true);
        }}
        accessibilityRole="button"
        style={{ borderColor: colors.border.light }}
        className="border rounded-2xl flex-row items-center justify-center p-5 mt-3"
      >
        <Plus size={20} color={colors.text.primary} />
        <Text style={{ color: colors.text.primary }} className="ml-2 font-semibold text-base">Claim another business</Text>
      </Pressable>
    </View>
  );
}
