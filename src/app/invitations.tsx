import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Alert, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Copy, Send, Mail, Shield, Clock3, CheckCircle2, Ban, Sparkles, RefreshCcw } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import useAuthStore, { type TeamRole, type InviteStatus } from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { buildFounderAccessLink } from '@/lib/fyll-app-url';

type InviteHistoryItem = {
  id: string;
  email: string;
  role: TeamRole;
  inviteCode: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  businessId: string;
  status: InviteStatus;
  joinedAt?: string;
  joinedUserId?: string;
  emailSentAt?: string;
};

const roleLabels: Record<TeamRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const roleColors: Record<TeamRole, string> = {
  admin: '#EF4444',
  manager: '#F59E0B',
  staff: '#3B82F6',
};

const normalizeInviteStatus = (invite: InviteHistoryItem): InviteStatus => {
  if (invite.status === 'joined' || invite.status === 'cancelled' || invite.status === 'expired') {
    return invite.status;
  }
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  return 'pending';
};

const mapInviteRow = (row: Record<string, unknown>): InviteHistoryItem => ({
  id: String(row.id ?? ''),
  email: String(row.email ?? row.recipient_email ?? ''),
  role: (['admin', 'manager', 'staff'].includes(String(row.role)) ? row.role : 'admin') as TeamRole,
  inviteCode: String(row.invite_code ?? row.inviteCode ?? row.access_code ?? row.accessCode ?? ''),
  invitedBy: String(row.invited_by ?? row.invitedBy ?? row.inviter_name ?? row.inviterName ?? 'Admin'),
  invitedAt: String(row.invited_at ?? row.invitedAt ?? row.created_at ?? row.createdAt ?? new Date().toISOString()),
  expiresAt: String(row.expires_at ?? row.expiresAt ?? new Date().toISOString()),
  businessId: String(row.business_id ?? row.businessId ?? ''),
  status: (String(row.status ?? 'pending') as InviteStatus),
  joinedAt: typeof row.joined_at === 'string' ? row.joined_at : (typeof row.joinedAt === 'string' ? row.joinedAt : undefined),
  joinedUserId: typeof row.joined_user_id === 'string' ? row.joined_user_id : (typeof row.joinedUserId === 'string' ? row.joinedUserId : undefined),
  emailSentAt: typeof row.email_sent_at === 'string' ? row.email_sent_at : (typeof row.emailSentAt === 'string' ? row.emailSentAt : undefined),
});

type InvitationsScreenProps = { embeddedInSettings?: boolean };

export default function InvitationsScreen({ embeddedInSettings = false }: InvitationsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark
    ? {
        ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84', lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00',
        edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)', input: 'rgba(255,255,255,0.055)', topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)', navButton: 'rgba(255,255,255,0.08)', limeWash: 'rgba(213,224,87,0.14)', limeBorder: 'rgba(213,224,87,0.25)', dangerWash: 'rgba(239,68,68,0.12)', successWash: 'rgba(34,197,94,0.12)',
      }
    : {
        ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C', lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400',
        edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)', input: '#F7F7F1', topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)', navButton: 'rgba(32,33,23,0.07)', limeWash: 'rgba(135,148,0,0.13)', limeBorder: 'rgba(102,112,0,0.22)', dangerWash: 'rgba(239,68,68,0.08)', successWash: 'rgba(34,197,94,0.08)',
      };
  const { isDesktop, isMobile } = useBreakpoint();
  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId);

  const [businessName, setBusinessName] = useState('Fyll Workspace');
  const [inviteLimitTotal, setInviteLimitTotal] = useState<number>(5);
  const [inviteHistory, setInviteHistory] = useState<InviteHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestInvite, setLatestInvite] = useState<InviteHistoryItem | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const openedFromSettings = Array.isArray(from) ? from[0] === 'settings' : from === 'settings';
  const showWebSettingsPanel = Platform.OS === 'web' && !isMobile && (openedFromSettings || embeddedInSettings);
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const useDesktopInviteTable = Platform.OS === 'web' && isDesktop;
  const desktopContentWrapStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: showWebSettingsPanel ? 1120 : 720, alignSelf: 'center' } as const)
      : undefined
  );
  const screenOuterStyle = {
    backgroundColor: palette.ground,
    paddingHorizontal: 0,
    paddingVertical: 0,
  } as const;
  const screenInnerStyle = {
    flex: 1,
    backgroundColor: palette.ground,
    ...(showWebSettingsPanel
      ? {
          width: '100%' as const,
          overflow: 'hidden' as const,
        }
      : {}),
  } as const;

  const usedInviteCount = useMemo(() => {
    return inviteHistory.filter((invite) => {
      const status = normalizeInviteStatus(invite);
      return status === 'pending' || status === 'joined';
    }).length;
  }, [inviteHistory]);
  const inviteRemaining = Math.max(0, inviteLimitTotal - usedInviteCount);
  const statusCounts = useMemo(() => {
    return inviteHistory.reduce<Record<InviteStatus, number>>((acc, invite) => {
      const status = normalizeInviteStatus(invite);
      acc[status] += 1;
      return acc;
    }, { pending: 0, joined: 0, cancelled: 0, expired: 0 });
  }, [inviteHistory]);

  const formatDateTime = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDate = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getJoinLink = useCallback((inviteCode: string) => {
    return buildFounderAccessLink(inviteCode);
  }, []);

  const loadInvitationsData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!businessId) {
      setIsLoading(false);
      return;
    }

    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setLoadError('');

    try {
      const [{ data: businessRow, error: businessError }, { data: inviteRows, error: invitesError }] = await Promise.all([
        supabase
          .from('businesses')
          .select('name, invite_limit_total')
          .eq('id', businessId)
          .maybeSingle(),
        supabase
          .from('founder_referral_invites')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false }),
      ]);

      if (businessError) {
        throw businessError;
      }
      if (invitesError) {
        throw invitesError;
      }

      setBusinessName((businessRow?.name as string | undefined)?.trim() || 'Fyll Workspace');
      setInviteLimitTotal(typeof businessRow?.invite_limit_total === 'number' ? businessRow.invite_limit_total : 5);
      setInviteHistory(((inviteRows ?? []) as Record<string, unknown>[]).map(mapInviteRow));
    } catch (error) {
      console.error('Failed to load invitations data:', error);
      setLoadError('Could not load founder invite data. Run the founder_referral_invites migration.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadInvitationsData('initial');
  }, [loadInvitationsData]);

  const findReusablePendingInvite = (normalizedEmail: string) =>
    inviteHistory.find((invite) =>
      invite.email.toLowerCase() === normalizedEmail && normalizeInviteStatus(invite) === 'pending'
    );

  const validateInviteForm = () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setFormError('Email is required');
      return null;
    }
    if (!normalizedEmail.includes('@')) {
      setFormError('Enter a valid email address');
      return null;
    }
    setFormError('');
    setFormSuccess('');
    return normalizedEmail;
  };

  const generateInviteForForm = async (): Promise<InviteHistoryItem> => {
    const normalizedEmail = validateInviteForm();
    if (!normalizedEmail) {
      throw new Error('Invalid form');
    }

    const existing = findReusablePendingInvite(normalizedEmail);
    if (existing) {
      return existing;
    }

    if (inviteRemaining <= 0) {
      setFormError(`Invite limit reached (${inviteLimitTotal} total)`);
      throw new Error('Invalid form');
    }

    const rpcPayload = {
      recipient_email_input: normalizedEmail,
      inviter_name_input: currentUser?.name ?? 'Admin',
    };

    let { data, error } = await supabase.rpc('create_founder_referral_invite', rpcPayload);

    const isRpcNotFound =
      !!error &&
      (error.code === 'PGRST202' ||
        /Could not find the function/i.test(error.message || '') ||
        /schema cache/i.test(error.details || ''));

    // Supabase/PostgREST can cache stale RPC signatures after repeated drop/create cycles.
    // Retry a fresh RPC name if the primary one is still hidden in cache.
    if (isRpcNotFound) {
      const fallback = await supabase.rpc('create_founder_referral_invite_v2', rpcPayload);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message || 'Could not create founder invite');
    }

    const createdRow = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!createdRow) {
      throw new Error('Founder invite could not be created');
    }

    await loadInvitationsData('refresh');

    const inviteFromStore: InviteHistoryItem = mapInviteRow(createdRow);

    return inviteFromStore;
  };

  const handleGenerateCode = async () => {
    if (!isAdmin) return;

    try {
      setIsGenerating(true);
      const invite = await generateInviteForForm();
      setLatestInvite(invite);
      setFormSuccess(`Invite code ready for ${invite.email}`);
      setInviteEmail('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Invalid form') {
        setFormError(error.message || 'Could not generate invite code');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = async (invite: Pick<InviteHistoryItem, 'inviteCode'>) => {
    await Clipboard.setStringAsync(invite.inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Invite code copied to clipboard');
  };

  const handleShareInvite = async (invite: InviteHistoryItem) => {
    try {
      const joinLink = getJoinLink(invite.inviteCode);
      await Share.share({
        message: `You've been invited to create your own FYLL workspace.\n\nUse this founder access link: ${joinLink}\n\nAccess code: ${invite.inviteCode}`,
      });
    } catch {
      // user cancelled share sheet
    }
  };

  const handleCancelPendingInvite = async (invite: InviteHistoryItem) => {
    if (normalizeInviteStatus(invite) !== 'pending') return;

    const executeCancel = async () => {
      try {
        const { data, error } = await supabase.rpc('cancel_founder_referral_invite', { referral_invite_id_input: invite.id });
        if (error || !data) {
          throw error ?? new Error('Cancel failed');
        }
        setLatestInvite((prev) => (prev?.id === invite.id ? null : prev));
        await loadInvitationsData('refresh');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('Cancel invite failed:', error);
        Alert.alert('Failed', 'Could not cancel invite');
      }
    };

    if (Platform.OS === 'web') {
      executeCancel();
      return;
    }

    Alert.alert('Cancel Invite', `Cancel invite for ${invite.email}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Invite',
        style: 'destructive',
        onPress: executeCancel,
      },
    ]);
  };

  if (!isAdmin) {
    return (
      <View className="flex-1" style={screenOuterStyle}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={screenInnerStyle}>
        <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.ground }}>
          {!showWebSettingsPanel ? <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }} /> : null}
          <View style={desktopContentWrapStyle}>
            <View
              className="flex-row items-center"
              style={{ minHeight: isMobile ? 66 : 58, paddingHorizontal: showWebSettingsPanel ? 20 : 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4 }}
            >
              <Pressable
                onPress={goBack}
                className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
                style={{ borderRadius: 20, backgroundColor: palette.navButton }}
              >
                <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
              </Pressable>
              <Text
                style={{
                  color: palette.ink,
                  fontSize: 17,
                  lineHeight: 21,
                  fontWeight: '600',
                }}
              >
                Invitations
              </Text>
            </View>
          </View>
          <View className="flex-1 items-center justify-center px-6">
            <View style={{ width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWash, borderWidth: 1, borderColor: palette.limeBorder }}><Shield size={29} color={palette.limeInk} strokeWidth={1.8} /></View>
            <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 22, fontWeight: '400' }} className="mt-4">Admin Access Required</Text>
            <Text style={{ color: palette.muted }} className="text-center mt-2">
              Only admins can generate founder VIP invites.
            </Text>
          </View>
        </SafeAreaView>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={screenOuterStyle}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={screenInnerStyle}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.ground }}>
        {!showWebSettingsPanel ? <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }} /> : null}
        <View>
          <View style={desktopContentWrapStyle}>
            <View
              className="flex-row items-center justify-between"
              style={{ minHeight: isMobile ? 66 : showWebSettingsPanel ? 58 : 56, paddingHorizontal: showWebSettingsPanel ? 20 : 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4 }}
            >
              <View className="flex-row items-center">
                <Pressable
                  onPress={goBack}
                  className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
                  style={{ borderRadius: 20, backgroundColor: palette.navButton }}
                >
                  <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
                </Pressable>
                <View>
                  <Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
                  <Text
                    style={{
                      color: palette.ink,
                      fontSize: 17,
                      lineHeight: 21,
                      fontWeight: '600',
                    }}
                  >
                    Invitation Settings
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => { void loadInvitationsData('refresh'); }}
                className="w-10 h-10 items-center justify-center active:opacity-80"
                style={{ borderRadius: 20, backgroundColor: palette.navButton, opacity: isRefreshing ? 0.6 : 1 }}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={palette.limeInk} />
                ) : (
                  <RefreshCcw size={17} color={palette.ink} strokeWidth={2} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={palette.limeInk} />
            <Text style={{ color: palette.faint }} className="text-sm mt-3">Loading invite controls...</Text>
          </View>
        ) : (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={desktopContentWrapStyle}>
              <View className={isWebDesktop ? 'pl-5 pr-7 pt-4' : 'px-5 pt-4'}>
                <LinearGradient
                  colors={[palette.surface, palette.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: 20, marginBottom: 28, borderWidth: 1, borderColor: palette.edge }}
                >
                  <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
                  <View className="flex-row items-start justify-between">
                    <View className="flex-row items-center flex-1 mr-3">
                      <View className="flex-1">
                        <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Founder referrals</Text>
                        <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 26, lineHeight: 31, letterSpacing: -0.7 }}>VIP Access</Text>
                        <Text style={{ color: palette.faint }} className="text-xs mt-1" numberOfLines={1}>{businessName}</Text>
                      </View>
                    </View>
                    <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: palette.limeWash, borderWidth: 1, borderColor: palette.limeBorder }}>
                      <Text style={{ color: palette.limeInk }} className="text-xs font-semibold">Admin only</Text>
                    </View>
                  </View>

              <View className="mt-4 flex-row" style={{ gap: 10 }}>
                <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edge }}>
                  <Text style={{ color: palette.faint }} className="text-[11px] uppercase">Invite limit</Text>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold' }} className="text-xl mt-1">{inviteLimitTotal}</Text>
                </View>
                <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edge }}>
                  <Text style={{ color: palette.faint }} className="text-[11px] uppercase">Used</Text>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold' }} className="text-xl mt-1">{usedInviteCount}</Text>
                </View>
                <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: palette.limeWash, borderWidth: 1, borderColor: palette.limeBorder }}>
                  <Text style={{ color: palette.limeInk }} className="text-[11px] uppercase">Remaining</Text>
                  <Text style={{ color: palette.limeInk, fontFamily: 'BricolageGrotesque_700Bold' }} className="text-xl mt-1">{inviteRemaining}</Text>
                </View>
              </View>

              <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
                <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: palette.input }}>
                  <Text style={{ color: palette.muted }} className="text-xs">Pending {statusCounts.pending}</Text>
                </View>
                <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                  <Text className="text-green-300 text-xs">Joined {statusCounts.joined}</Text>
                </View>
                <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                  <Text className="text-amber-300 text-xs">Expired {statusCounts.expired}</Text>
                </View>
                <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                  <Text className="text-red-300 text-xs">Cancelled {statusCounts.cancelled}</Text>
                </View>
              </View>
            </LinearGradient>

            {loadError ? (
              <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)' }}>
                <Text className="text-red-500 text-sm text-center">{loadError}</Text>
              </View>
            ) : null}

                <Text style={{ color: palette.faint, marginLeft: 6, marginBottom: 10, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>Create invitation</Text>
                <View className="p-4 mb-6" style={{ borderRadius: 26, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge }}>
              <View className="flex-row items-center mb-3">
                <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWash }}><Sparkles size={18} color={palette.limeInk} strokeWidth={2} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: palette.ink, fontSize: isMobile ? 14 : 15, fontWeight: '600' }}>Create founder invite</Text><Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>Generate secure admin access</Text></View>
              </View>

              <View className="mb-3">
                <Text style={{ color: palette.muted }} className="text-xs font-semibold uppercase mb-2 tracking-wider">Founder email</Text>
                <View className="rounded-xl px-4 flex-row items-center" style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: formError ? '#EF4444' : palette.edgeStrong, height: 52 }}>
                  <Mail size={17} color={palette.faint} strokeWidth={1.8} />
                  <TextInput
                    value={inviteEmail}
                    onChangeText={(text) => {
                      setInviteEmail(text);
                      setFormError('');
                      setFormSuccess('');
                    }}
                    placeholder="owner@brand.com"
                    placeholderTextColor={colors.input.placeholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ flex: 1, color: colors.input.text, fontSize: 14, marginLeft: 10 }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold uppercase mb-2 tracking-wider">Role (locked)</Text>
                <View
                  className="rounded-xl p-3 flex-row items-center justify-between"
                  style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)' }}
                >
                  <View className="flex-row items-center">
                    <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                      <Shield size={16} color="#EF4444" strokeWidth={2} />
                    </View>
                    <View>
                      <Text style={{ color: '#EF4444' }} className="text-sm font-semibold">Admin</Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                        VIP invites are for founder/admin access only.
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={{ color: colors.text.muted }} className="text-[11px] mt-2">
                  Invite Managers and Staff during onboarding or from Team Members.
                </Text>
              </View>

              <View className="flex-row" style={{ gap: 10 }}>
                <Pressable
                  onPress={handleGenerateCode}
                  disabled={isGenerating}
                  className="rounded-full items-center justify-center active:opacity-80"
                  style={{
                    backgroundColor: palette.lime,
                    height: 50,
                    width: '100%',
                    opacity: isGenerating ? 0.65 : 1,
                  }}
                >
                  {isGenerating ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator size="small" color="#202117" />
                      <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 16 }} className="ml-2">Generating...</Text>
                    </View>
                  ) : (
                    <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 16 }}>Generate invite code</Text>
                  )}
                </Pressable>
              </View>
              <Text style={{ color: colors.text.muted }} className="text-[11px] mt-2 text-center">
                Email invite is hidden for now. Generate a code, then copy or share the invite link below.
              </Text>

              {formError ? (
                <View className="mt-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                  <Text className="text-red-500 text-sm text-center">{formError}</Text>
                </View>
              ) : null}
              {formSuccess ? (
                <View className="mt-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(34,197,94,0.08)' }}>
                  <Text style={{ color: '#16A34A' }} className="text-sm text-center">{formSuccess}</Text>
                </View>
              ) : null}
                </View>

                {latestInvite ? (
                  <View className="p-4 mb-6" style={{ borderRadius: 26, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.limeBorder }}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 18, fontWeight: '400' }}>Latest invite code</Text>
                  <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${roleColors[latestInvite.role]}12` }}>
                    <Text style={{ color: roleColors[latestInvite.role] }} className="text-xs font-semibold">{roleLabels[latestInvite.role]}</Text>
                  </View>
                </View>
                <Text style={{ color: palette.faint }} className="text-xs">{latestInvite.email}</Text>
                <View className="mt-3 rounded-xl p-4" style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edge }}>
                  <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold' }} className="text-xl tracking-widest text-center">{latestInvite.inviteCode}</Text>
                </View>
                <View className="flex-row mt-3" style={{ gap: 10 }}>
                  <Pressable onPress={() => handleCopyCode(latestInvite)} className="flex-1 rounded-full items-center justify-center active:opacity-80" style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edgeStrong, height: 46 }}>
                    <View className="flex-row items-center">
                      <Copy size={15} color={palette.ink} strokeWidth={2} />
                      <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' }} className="text-sm ml-2">Copy</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => handleShareInvite(latestInvite)} className="flex-1 rounded-full items-center justify-center active:opacity-80" style={{ backgroundColor: palette.lime, height: 46 }}>
                    <View className="flex-row items-center">
                      <Send size={15} color="#202117" strokeWidth={2} />
                      <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' }} className="text-sm ml-2">Share</Text>
                    </View>
                  </Pressable>
                </View>
                  </View>
                ) : null}

                <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3">
                <View className="px-1">
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>Invite history</Text>
                  <Text style={{ color: palette.faint }} className="text-xs mt-1">
                    Pending, joined, cancelled, and expired invites.
                  </Text>
                </View>
                <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.limeWash }}>
                  <Text style={{ color: palette.limeInk }} className="text-xs font-semibold">{inviteHistory.length}</Text>
                </View>
              </View>

              {inviteHistory.length === 0 ? (
                <View className="p-5" style={{ borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge }}>
                  <Text style={{ color: palette.ink }} className="text-sm text-center font-medium">No invites yet</Text>
                  <Text style={{ color: palette.faint }} className="text-xs text-center mt-1">Create your first VIP invite above.</Text>
                </View>
              ) : (
                useDesktopInviteTable ? (
                  <View className="w-full overflow-hidden" style={{ borderRadius: 24, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        minHeight: 50,
                        borderTopWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: palette.edge,
                        backgroundColor: palette.surface,
                      }}
                    >
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 2.2, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Invitee
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.3, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Code
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Status
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 0.8, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Role
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', flex: 1.1, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Expires
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', width: 92, paddingHorizontal: 20, alignSelf: 'center' }}>
                        Action
                      </Text>
                    </View>

                    {inviteHistory.map((invite, index) => {
                      const status = normalizeInviteStatus(invite);
                      const statusColor = status === 'joined'
                        ? '#22C55E'
                        : status === 'pending'
                          ? '#F59E0B'
                          : status === 'cancelled'
                            ? '#EF4444'
                            : '#94A3B8';
                      const StatusIcon = status === 'joined'
                        ? CheckCircle2
                        : status === 'pending'
                          ? Clock3
                          : status === 'cancelled'
                            ? Ban
                            : Clock3;

                      return (
                        <View
                          key={invite.id}
                          style={{
                            flexDirection: 'row',
                            minHeight: 88,
                            alignItems: 'center',
                            borderBottomWidth: index < inviteHistory.length - 1 ? 1 : 0,
                            borderBottomColor: palette.edge,
                            backgroundColor: palette.surface,
                          }}
                        >
                          <View style={{ flex: 2.2, paddingHorizontal: 20, justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                              {invite.email}
                            </Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 4 }}>
                              Invited {formatDate(invite.invitedAt)}
                            </Text>
                            {invite.joinedAt ? (
                              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 4 }}>
                                Joined {formatDate(invite.joinedAt)}
                              </Text>
                            ) : null}
                          </View>

                          <View style={{ flex: 1.3, paddingHorizontal: 20, justifyContent: 'center' }}>
                            <View className="flex-row items-center">
                              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                                {invite.inviteCode}
                              </Text>
                              <Pressable onPress={() => handleCopyCode(invite)} className="ml-2 p-1 active:opacity-60">
                                <Copy size={14} color={colors.text.tertiary} strokeWidth={2} />
                              </Pressable>
                            </View>
                          </View>

                          <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center' }}>
                            <View className="self-start flex-row items-center px-2.5 py-1 rounded-full" style={{ backgroundColor: `${statusColor}14` }}>
                              <StatusIcon size={12} color={statusColor} strokeWidth={2.5} />
                              <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600', marginLeft: 4, textTransform: 'capitalize' }}>
                                {status}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flex: 0.8, paddingHorizontal: 20, justifyContent: 'center' }}>
                            <View className="self-start px-2.5 py-1 rounded-full" style={{ backgroundColor: `${roleColors[invite.role]}12` }}>
                              <Text style={{ color: roleColors[invite.role], fontSize: 11, fontWeight: '600' }}>
                                {roleLabels[invite.role]}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flex: 1.1, paddingHorizontal: 20, justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                              {formatDate(invite.expiresAt)}
                            </Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 4 }}>
                              {formatDateTime(invite.expiresAt)}
                            </Text>
                          </View>

                          <View style={{ width: 92, alignItems: 'flex-end', paddingHorizontal: 20 }}>
                            <Pressable
                              onPress={status === 'pending' ? () => handleCancelPendingInvite(invite) : () => handleShareInvite(invite)}
                              className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                              style={{
                                backgroundColor: colors.bg.card,
                                borderWidth: 1,
                                borderColor: status === 'pending' ? 'rgba(239,68,68,0.18)' : colors.border.light,
                              }}
                            >
                              {status === 'pending' ? (
                                <Ban size={14} color="#EF4444" strokeWidth={2} />
                              ) : (
                                <Send size={14} color={colors.text.secondary} strokeWidth={2} />
                              )}
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View>
                    {inviteHistory.map((invite) => {
                      const status = normalizeInviteStatus(invite);
                      const statusColor = status === 'joined'
                        ? '#22C55E'
                        : status === 'pending'
                          ? '#F59E0B'
                          : status === 'cancelled'
                            ? '#EF4444'
                            : '#94A3B8';
                      const StatusIcon = status === 'joined'
                        ? CheckCircle2
                        : status === 'pending'
                          ? Clock3
                          : status === 'cancelled'
                            ? Ban
                            : Clock3;

                      return (
                        <View
                          key={invite.id}
                          className="p-4 mb-3"
                          style={{ borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: status === 'pending' ? palette.limeBorder : palette.edge }}
                        >
                          <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: palette.ink, fontSize: isMobile ? 14 : 15, fontWeight: '600' }} numberOfLines={1}>
                                {invite.email}
                              </Text>
                              <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 6 }}>
                                Invited {formatDate(invite.invitedAt)}
                              </Text>
                              {invite.joinedAt ? (
                                <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', lineHeight: 16, marginTop: 6 }}>
                                  Joined {formatDate(invite.joinedAt)}
                                </Text>
                              ) : null}
                            </View>
                            <Pressable
                              onPress={status === 'pending' ? () => handleCancelPendingInvite(invite) : () => handleShareInvite(invite)}
                              className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                              style={{
                                backgroundColor: palette.input,
                                borderWidth: 1,
                                borderColor: status === 'pending' ? 'rgba(239,68,68,0.18)' : palette.edge,
                              }}
                            >
                              {status === 'pending' ? (
                                <Ban size={16} color="#EF4444" strokeWidth={2} />
                              ) : (
                                <Send size={16} color={colors.text.secondary} strokeWidth={2} />
                              )}
                            </Pressable>
                          </View>

                          <View className="flex-row items-center mt-3" style={{ gap: 8 }}>
                            <Text style={{ color: palette.ink, fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }}>
                              {invite.inviteCode}
                            </Text>
                            <Pressable onPress={() => handleCopyCode(invite)} className="p-1 active:opacity-60">
                              <Copy size={14} color={palette.faint} strokeWidth={2} />
                            </Pressable>
                          </View>

                          <View className="flex-row flex-wrap items-center mt-3" style={{ gap: 8 }}>
                            <View className="self-start flex-row items-center px-2.5 py-1 rounded-full" style={{ backgroundColor: `${statusColor}14` }}>
                              <StatusIcon size={12} color={statusColor} strokeWidth={2.5} />
                              <Text style={{ color: statusColor }} className="text-xs font-semibold ml-1 capitalize">
                                {status}
                              </Text>
                            </View>
                            <View className="self-start px-2.5 py-1 rounded-full" style={{ backgroundColor: `${roleColors[invite.role]}12` }}>
                              <Text style={{ color: roleColors[invite.role] }} className="text-[11px] font-semibold">
                                {roleLabels[invite.role]}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12, fontWeight: '400', lineHeight: 16, marginTop: 10 }}>
                            Expires {formatDateTime(invite.expiresAt)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )
              )}
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
      </View>
    </View>
  );
}
