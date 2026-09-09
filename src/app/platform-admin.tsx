import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import {
  ArrowUpRight,
  Building2,
  Calendar,
  ChevronLeft,
  Clock3,
  Copy,
  Crown,
  ExternalLink,
  LayoutGrid,
  Link2,
  LogOut,
  Mail,
  MoreHorizontal,
  MoreVertical,
  RefreshCcw,
  Search,
  Send,
  Shield,
  Slash,
  Ticket,
  Users,
  X,
} from 'lucide-react-native';

import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { buildFounderAccessLink, getFyllPublicAppOrigin } from '@/lib/fyll-app-url';
import { FYLL_TRACKING_ORIGIN } from '@/lib/tracking-host';
import {
  BUSINESS_FEATURES,
  normalizeBusinessFeatureAccess,
  type BusinessFeatureAccess,
  type BusinessFeatureKey,
} from '@/lib/feature-access';

type PlatformAdminStatus = {
  email: string;
  is_admin: boolean;
};

type PlatformBusiness = {
  business_id: string;
  company_name: string;
  business_name: string;
  business_slug: string;
  business_logo: string | null;
  business_phone: string | null;
  business_website: string | null;
  owner_id: string | null;
  owner_email: string | null;
  created_at: string;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  invite_limit_total: number | null;
  invite_used_count: number | null;
  pending_invite_count: number | null;
  joined_invite_count: number | null;
  feature_access: Partial<Record<BusinessFeatureKey, boolean>> | null;
};

type PlatformInvite = {
  id: string;
  business_id: string | null;
  recipient_email: string;
  access_code: string;
  inviter_name: string;
  status: string;
  created_at: string;
  expires_at: string;
  cancelled_at: string | null;
  joined_at: string | null;
  joined_business_id: string | null;
  joined_user_id: string | null;
  email_sent_at: string | null;
};

type AdminTab = 'overview' | 'businesses' | 'invites';
type BusinessFilter = 'all' | 'active' | 'inactive';
type BusinessState = 'active' | 'inactive';

type BusinessViewModel = PlatformBusiness & {
  state: BusinessState;
  plan: 'Stealth' | 'Starter' | 'Pro';
  lastActiveAt: string;
  joinedAgoLabel: string;
};

type ActivityItem = {
  id: string;
  label: string;
  meta: string;
  createdAt: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCurrency = (value: number) => (
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value)
);

const daysBetween = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

const formatRelativeDays = (value?: string | null) => {
  const days = daysBetween(value);
  if (days === null) return 'N/A';
  if (days === 0) return 'Today';
  if (days < 30) return `${days}d ago`;
  const months = Math.max(1, Math.floor(days / 30));
  return `${months}mo ago`;
};

const getJoinLink = (inviteCode: string) => {
  return buildFounderAccessLink(inviteCode);
};

const getTrackingPageUrl = (businessSlug: string) => {
  const path = `/${businessSlug}`;
  return Platform.OS === 'web' ? `${FYLL_TRACKING_ORIGIN}${path}` : Linking.createURL(path);
};

const DEFAULT_INVITE_EXPIRY_DAYS = '14';

const normalizeStatusLabel = (status: string) => {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'joined') return 'Joined';
  if (normalized === 'cancelled') return 'Cancelled';
  if (normalized === 'expired') return 'Expired';
  return 'Pending';
};

const statusPillStyle = (status: string) => {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'joined') {
    return { borderColor: 'rgba(34,197,94,0.28)', textColor: '#22C55E', bgColor: 'rgba(34,197,94,0.08)' };
  }
  if (normalized === 'cancelled') {
    return { borderColor: 'rgba(239,68,68,0.28)', textColor: '#F87171', bgColor: 'rgba(239,68,68,0.08)' };
  }
  if (normalized === 'expired') {
    return { borderColor: 'rgba(148,163,184,0.24)', textColor: '#94A3B8', bgColor: 'rgba(148,163,184,0.08)' };
  }
  return { borderColor: 'rgba(245,158,11,0.24)', textColor: '#F59E0B', bgColor: 'rgba(245,158,11,0.08)' };
};

const statusCardStyle = (state: BusinessState) => {
  if (state === 'active') {
    return { borderColor: 'rgba(34,197,94,0.18)', textColor: '#22C55E', bgColor: 'rgba(34,197,94,0.08)', label: 'ACTIVE' };
  }
  return { borderColor: 'rgba(148,163,184,0.24)', textColor: '#94A3B8', bgColor: 'rgba(148,163,184,0.08)', label: 'INACTIVE' };
};

const weekBucketsFromBusinesses = (items: BusinessViewModel[]) => {
  const today = new Date();
  const buckets: Array<{ label: string; count: number }> = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const end = new Date(today);
    end.setDate(today.getDate() - offset * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const count = items.filter((business) => {
      const created = new Date(business.created_at);
      return created >= start && created <= end;
    }).length;
    buckets.push({
      label: start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      count,
    });
  }
  return buckets;
};

export default function PlatformAdminScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const isEmbeddedInSettings = (Array.isArray(from) ? from[0] : from) === 'settings';
  const goBack = useSettingsBack();
  const logout = useAuthStore((s) => s.logout);
  const colors = useThemeColors();
  const resolvedTheme = useResolvedThemeMode();
  const isDark = resolvedTheme === 'dark';

  const screenBg = isDark ? '#0B0B0C' : colors.bg.primary;
  const headerBg = isDark ? '#09090A' : colors.bg.card;
  const cardBg = isDark ? '#171717' : colors.bg.card;
  const elevatedCardBg = isDark ? '#1D1D1F' : colors.bg.secondary;
  const panelBg = isDark ? '#131314' : colors.bg.card;
  const menuBg = isDark ? '#18181B' : '#FFFFFF';
  const controlBg = isDark ? '#1E1E21' : colors.bg.secondary;
  const borderColor = isDark ? 'rgba(255,255,255,0.09)' : '#E5E7EB';
  const softBorderColor = isDark ? 'rgba(255,255,255,0.06)' : '#ECECEC';
  const textPrimary = isDark ? '#FAFAFA' : colors.text.primary;
  const textSecondary = isDark ? '#D4D4D8' : colors.text.secondary;
  const textMuted = isDark ? '#A1A1AA' : colors.text.tertiary;
  const textFaint = isDark ? '#71717A' : '#6B7280';
  const iconMuted = isDark ? '#A1A1AA' : '#6B7280';
  const primaryButtonBg = isDark ? '#FAFAFA' : '#111111';
  const primaryButtonText = isDark ? '#111111' : '#FFFFFF';
  const activeTabBg = isDark ? '#FAFAFA' : '#111111';
  const activeTabFg = isDark ? '#111111' : '#FFFFFF';
  const inactiveTabFg = textMuted;
  const wordmarkTint = isDark ? '#FAFAFA' : '#111111';
  const shellMaxWidth = 1440;

  const [tab, setTab] = useState<AdminTab>('overview');
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdminStatus | null>(null);
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [invites, setInvites] = useState<PlatformInvite[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessFilter, setBusinessFilter] = useState<BusinessFilter>('all');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteExpiryDays, setInviteExpiryDays] = useState(DEFAULT_INVITE_EXPIRY_DAYS);
  const [inviteLimitDraft, setInviteLimitDraft] = useState('5');
  const [featureAccessDraft, setFeatureAccessDraft] = useState<BusinessFeatureAccess>(() => normalizeBusinessFeatureAccess(null));
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [isSavingLimit, setIsSavingLimit] = useState(false);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [openInviteMenuId, setOpenInviteMenuId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const businessRows = useMemo<BusinessViewModel[]>(() => {
    const rowsByBusinessId = new Map<string, PlatformBusiness>();
    businesses.forEach((business) => {
      if (business.business_id) rowsByBusinessId.set(business.business_id, business);
    });

    invites.forEach((invite) => {
      if (invite.status !== 'joined') return;
      const businessId = (invite.joined_business_id ?? invite.business_id ?? '').trim();
      if (!businessId || rowsByBusinessId.has(businessId)) return;
      const emailName = invite.recipient_email.split('@')[0] || 'Joined business';
      rowsByBusinessId.set(businessId, {
        business_id: businessId,
        company_name: emailName,
        business_name: emailName,
        business_slug: emailName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        business_logo: null,
        business_phone: null,
        business_website: null,
        owner_id: invite.joined_user_id,
        owner_email: invite.recipient_email,
        created_at: invite.joined_at ?? invite.created_at,
        onboarding_step: 0,
        onboarding_completed_at: invite.joined_at,
        invite_limit_total: 5,
        invite_used_count: 1,
        pending_invite_count: 0,
        joined_invite_count: 1,
        feature_access: null,
      });
    });

    return Array.from(rowsByBusinessId.values()).map((business) => {
      const lastActiveAt = business.onboarding_completed_at ?? business.created_at;
      const activeAgeDays = daysBetween(lastActiveAt);
      const state: BusinessState = activeAgeDays !== null && activeAgeDays <= 365 ? 'active' : 'inactive';
      const joinedCount = business.joined_invite_count ?? 0;
      const plan: BusinessViewModel['plan'] = joinedCount >= 2 ? 'Pro' : 'Starter';
      return {
        ...business,
        state,
        plan,
        lastActiveAt,
        joinedAgoLabel: formatRelativeDays(business.created_at),
      };
    });
  }, [businesses, invites]);

  const selectedBusiness = useMemo(
    () => businessRows.find((business) => business.business_id === selectedBusinessId) ?? null,
    [businessRows, selectedBusinessId]
  );

  const filteredBusinesses = useMemo(() => {
    const query = businessSearch.trim().toLowerCase();
    return businessRows.filter((business) => {
      const matchesFilter = businessFilter === 'all' ? true : business.state === businessFilter;
      const matchesQuery = query === ''
        ? true
        : [
            business.business_name,
            business.company_name,
            business.business_slug,
            business.business_phone,
            business.business_website,
            business.business_id,
            business.owner_id,
            business.owner_email,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
      return matchesFilter && matchesQuery;
    });
  }, [businessFilter, businessRows, businessSearch]);

  const businessMetrics = useMemo(() => {
    return businessRows.reduce(
      (acc, business) => {
        acc.total += 1;
        acc.pendingInvites += business.pending_invite_count ?? 0;
        acc.joinedInvites += business.joined_invite_count ?? 0;
        if (business.state === 'active') acc.active += 1;
        if (business.state === 'inactive') acc.inactive += 1;
        return acc;
      },
      { total: 0, active: 0, inactive: 0, pendingInvites: 0, joinedInvites: 0 }
    );
  }, [businessRows]);

  const newThisMonth = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return businessRows.filter((business) => new Date(business.created_at) >= threshold).length;
  }, [businessRows]);

  const signupsSeries = useMemo(() => weekBucketsFromBusinesses(businessRows), [businessRows]);

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const businessEvents = businessRows.map((business) => ({
      id: `business-${business.business_id}`,
      label: `${business.business_name || business.company_name} onboarded`,
      meta: `${business.plan} plan`,
      createdAt: business.created_at,
    }));
    const inviteEvents = invites.map((invite) => ({
      id: `invite-${invite.id}`,
      label: `${normalizeStatusLabel(invite.status)} invite for ${invite.recipient_email}`,
      meta: `Code ${invite.access_code}`,
      createdAt: invite.joined_at ?? invite.cancelled_at ?? invite.created_at,
    }));
    return [...businessEvents, ...inviteEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [businessRows, invites]);

  const loadPlatformAdmin = useCallback(async () => {
    setIsLoadingAccess(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_me');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setPlatformAdmin({
        email: String(row?.email ?? ''),
        is_admin: Boolean(row?.is_admin),
      });
    } catch (error) {
      console.error('Failed to load platform admin access:', error);
      setLoadError('Platform admin console is not ready yet. Run the platform_admin_console SQL migration first.');
      setPlatformAdmin({ email: '', is_admin: false });
    } finally {
      setIsLoadingAccess(false);
    }
  }, []);

  const loadBusinesses = useCallback(async (mode: 'load' | 'refresh' = 'load') => {
    if (!platformAdmin?.is_admin) return;
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoadingBusinesses(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_list_businesses', {
        search_input: null,
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as PlatformBusiness[];
      setBusinesses(rows);
      setSelectedBusinessId((current) => {
        if (current && rows.some((row) => row.business_id === current)) return current;
        return null;
      });
    } catch (error) {
      console.error('Failed to load businesses:', error);
      setLoadError('Could not load businesses for the platform console.');
    } finally {
      setIsLoadingBusinesses(false);
      setIsRefreshing(false);
    }
  }, [platformAdmin?.is_admin]);

  const loadInvites = useCallback(async (businessId?: string | null) => {
    if (!platformAdmin?.is_admin) return;
    setIsLoadingInvites(true);
    setActionError('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_list_business_invites', {
        business_id_input: businessId ?? null,
      });
      if (error) throw error;
      setInvites((Array.isArray(data) ? data : []) as PlatformInvite[]);
    } catch (error) {
      console.error('Failed to load platform invites:', error);
      setActionError('Could not load founder invite history.');
      setInvites([]);
    } finally {
      setIsLoadingInvites(false);
    }
  }, [platformAdmin?.is_admin]);

  useEffect(() => {
    void loadPlatformAdmin();
  }, [loadPlatformAdmin]);

  useEffect(() => {
    if (!platformAdmin?.is_admin) return;
    void loadBusinesses();
    void loadInvites();
  }, [loadBusinesses, loadInvites, platformAdmin?.is_admin]);

  useEffect(() => {
    if (!selectedBusiness) return;
    setInviteLimitDraft(String(selectedBusiness.invite_limit_total ?? 5));
    setFeatureAccessDraft(normalizeBusinessFeatureAccess(selectedBusiness.feature_access));
  }, [selectedBusiness]);

  const handleRefresh = async () => {
    await loadBusinesses('refresh');
    await loadInvites(selectedBusinessId ?? null);
  };

  const handleCreateInvite = async () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const parsedExpiryDays = Number.parseInt(inviteExpiryDays.trim(), 10);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setActionError('Enter a valid founder email.');
      return;
    }
    if (!Number.isFinite(parsedExpiryDays) || parsedExpiryDays < 1) {
      setActionError('Enter expiry as number of days.');
      return;
    }
    setIsCreatingInvite(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_create_founder_invite', {
        business_id_input: null,
        recipient_email_input: normalizedEmail,
        expiry_days_input: parsedExpiryDays,
      });
      if (error) throw error;
      const createdInvite = (Array.isArray(data) ? data[0] : data) as PlatformInvite | null;
      if (!createdInvite?.id) throw new Error('Invite was not created.');
      setInviteEmail('');
      setInviteExpiryDays(DEFAULT_INVITE_EXPIRY_DAYS);
      setSuccessMessage(`Invite ready for ${createdInvite.recipient_email}.`);
      await loadBusinesses('refresh');
      await loadInvites();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to create founder invite:', error);
      setActionError(error instanceof Error ? error.message : 'Could not create founder invite.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleSaveInviteLimit = async () => {
    if (!selectedBusiness) return;
    const parsedLimit = Number.parseInt(inviteLimitDraft.trim(), 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      setActionError('Invite limit must be at least 1.');
      return;
    }
    setIsSavingLimit(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_update_business_invite_limit', {
        business_id_input: selectedBusiness.business_id,
        invite_limit_total_input: parsedLimit,
      });
      if (error) throw error;
      setInviteLimitDraft(String(Number(data ?? parsedLimit)));
      setSuccessMessage(`Invite limit updated to ${parsedLimit}.`);
      await loadBusinesses('refresh');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to update invite limit:', error);
      setActionError(error instanceof Error ? error.message : 'Could not update invite limit.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSavingLimit(false);
    }
  };

  const saveFeatureAccess = async (nextFeatureAccess: BusinessFeatureAccess) => {
    if (!selectedBusiness || isSavingFeatures) return;
    setIsSavingFeatures(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const { data, error } = await supabase.rpc('platform_admin_update_business_feature_access', {
        business_id_input: selectedBusiness.business_id,
        feature_access_input: nextFeatureAccess,
      });
      if (error) throw error;
      const normalizedFeatureAccess = normalizeBusinessFeatureAccess(data);
      setFeatureAccessDraft(normalizedFeatureAccess);
      setBusinesses((current) => current.map((business) => (
        business.business_id === selectedBusiness.business_id
          ? { ...business, feature_access: normalizedFeatureAccess }
          : business
      )));
      setSuccessMessage('Feature access updated.');
      await loadBusinesses('refresh');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to update feature access:', error);
      setActionError(error instanceof Error ? error.message : 'Could not update feature access.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const handleToggleFeature = (feature: BusinessFeatureKey) => {
    if (isSavingFeatures) return;
    const nextFeatureAccess = normalizeBusinessFeatureAccess({
      ...featureAccessDraft,
      [feature]: !featureAccessDraft[feature],
    });
    setFeatureAccessDraft(nextFeatureAccess);
    void saveFeatureAccess(nextFeatureAccess);
  };

  const handleSaveFeatureAccess = async () => {
    await saveFeatureAccess(featureAccessDraft);
  };

  const handleCopyCode = async (invite: PlatformInvite) => {
    await Clipboard.setStringAsync(invite.access_code);
    setSuccessMessage(`Copied ${invite.access_code}.`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCopyLink = async (invite: PlatformInvite) => {
    await Clipboard.setStringAsync(getJoinLink(invite.access_code));
    setSuccessMessage(`Invite link copied for ${invite.recipient_email}.`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleShareInvite = async (invite: PlatformInvite) => {
    try {
      await Share.share({
        message: `Create your FYLL workspace with this founder link: ${getJoinLink(invite.access_code)}\n\nAccess code: ${invite.access_code}`,
      });
    } catch {}
  };

  const handleCancelInvite = async (invite: PlatformInvite) => {
    if (invite.status !== 'pending') return;
    const executeCancel = async () => {
      try {
        const { data, error } = await supabase.rpc('platform_admin_cancel_founder_invite', {
          referral_invite_id_input: invite.id,
        });
        if (error || !data) throw error ?? new Error('Invite could not be cancelled.');
        setSuccessMessage(`Cancelled ${invite.recipient_email}.`);
        await loadBusinesses('refresh');
        await loadInvites(selectedBusinessId ?? null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('Failed to cancel platform invite:', error);
        setActionError(error instanceof Error ? error.message : 'Could not cancel invite.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };
    if (Platform.OS === 'web') {
      await executeCancel();
      return;
    }
    Alert.alert('Cancel Invite', `Cancel founder invite for ${invite.recipient_email}?`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel Invite', style: 'destructive', onPress: () => { void executeCancel(); } },
    ]);
  };

  const tabs: Array<{ key: AdminTab; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <LayoutGrid size={16} color={tab === 'overview' ? activeTabFg : inactiveTabFg} strokeWidth={2} /> },
    { key: 'businesses', label: 'Businesses', icon: <Building2 size={16} color={tab === 'businesses' ? activeTabFg : inactiveTabFg} strokeWidth={2} /> },
    { key: 'invites', label: 'Invites', icon: <Ticket size={16} color={tab === 'invites' ? activeTabFg : inactiveTabFg} strokeWidth={2} /> },
  ];

  const renderTopMetric = (title: string, value: string | number, subtitle: string, icon: React.ReactNode) => (
    <View
      key={title}
      style={{
        flex: 1,
        minWidth: 240,
        borderRadius: 24,
        borderWidth: 1,
        borderColor,
        backgroundColor: cardBg,
        paddingHorizontal: 24,
        paddingVertical: 22,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: textFaint, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</Text>
          <Text style={{ color: textPrimary, fontSize: 24, fontWeight: '600', marginTop: 16 }}>{value}</Text>
          <Text style={{ color: textMuted, fontSize: 13, marginTop: 10 }}>{subtitle}</Text>
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: elevatedCardBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
      </View>
    </View>
  );

  const renderOverview = () => {
    const maxSignups = Math.max(1, ...signupsSeries.map((entry) => entry.count));
    return (
      <View style={{ gap: 28 }}>
        <View>
          <Text style={{ color: textPrimary, fontSize: 28, fontWeight: '600' }}>Overview</Text>
          <Text style={{ color: textMuted, fontSize: 15, marginTop: 8 }}>A quieter look across every business on Fyll.</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          {renderTopMetric('Active', businessMetrics.active, `${businessMetrics.inactive} inactive`, <Building2 size={18} color={iconMuted} strokeWidth={2} />)}
          {renderTopMetric('Total Businesses', businessMetrics.total, `${businessMetrics.active} active accounts`, <Crown size={18} color={iconMuted} strokeWidth={2} />)}
          {renderTopMetric('New (30d)', newThisMonth, `${businessMetrics.joinedInvites} founder joins`, <ArrowUpRight size={18} color={iconMuted} strokeWidth={2} />)}
          {renderTopMetric('Pending Invites', businessMetrics.pendingInvites, 'Awaiting redemption', <Ticket size={18} color={iconMuted} strokeWidth={2} />)}
        </View>

        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor,
            backgroundColor: cardBg,
            padding: 24,
            gap: 18,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600' }}>Signups · last 12 weeks</Text>
              <Text style={{ color: textMuted, fontSize: 14, marginTop: 6 }}>Weekly business onboarding volume.</Text>
            </View>
            <Text style={{ color: textFaint, fontSize: 14 }}>Total {businessRows.length}</Text>
          </View>

          <View style={{ height: 170, justifyContent: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, height: 118 }}>
              {signupsSeries.map((entry) => {
                const height = Math.max(10, Math.round((entry.count / maxSignups) * 98));
                return (
                  <View key={entry.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <View style={{ width: '100%', maxWidth: 72, alignItems: 'center' }}>
                      <View
                        style={{
                          width: 8,
                          height,
                          borderRadius: 999,
                          backgroundColor: textPrimary,
                          opacity: entry.count === 0 ? 0.15 : 1,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
              {signupsSeries.map((entry) => (
                <Text key={`${entry.label}-label`} style={{ flex: 1, color: textFaint, fontSize: 11, textAlign: 'center' }}>
                  {entry.label}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 18 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 24,
              borderWidth: 1,
              borderColor,
              backgroundColor: cardBg,
              overflow: 'hidden',
            }}
          >
            <View style={{ paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: borderColor, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '600' }}>Recently joined</Text>
              <Text style={{ color: textFaint, fontSize: 13 }}>{Math.min(5, businessRows.length)} of {businessRows.length}</Text>
            </View>
            {businessRows.slice(0, 5).map((business, index) => {
              const statusStyle = statusCardStyle(business.state);
              return (
                <View
                  key={business.business_id}
                  style={{
                    paddingHorizontal: 24,
                    paddingVertical: 18,
                    borderBottomWidth: index === Math.min(5, businessRows.length) - 1 ? 0 : 1,
                    borderBottomColor: softBorderColor,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '600' }}>{business.business_name || business.company_name}</Text>
                    <Text style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
                      {business.business_website || business.business_phone || `/${business.business_slug}`}
                    </Text>
                    <Text style={{ color: textFaint, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                      {business.owner_email || business.business_id}
                    </Text>
                  </View>
                  <Text style={{ color: textFaint, fontSize: 14 }}>{business.joinedAgoLabel}</Text>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: statusStyle.borderColor, backgroundColor: statusStyle.bgColor }}>
                    <Text style={{ color: statusStyle.textColor, fontSize: 11, letterSpacing: 1 }}>{statusStyle.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View
            style={{
              flex: 1,
              borderRadius: 24,
              borderWidth: 1,
              borderColor,
              backgroundColor: cardBg,
              overflow: 'hidden',
            }}
          >
            <View style={{ paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: borderColor, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '600' }}>Activity</Text>
              <Text style={{ color: textFaint, fontSize: 13 }}>Last {activityFeed.length}</Text>
            </View>
            {activityFeed.map((item, index) => (
              <View
                key={item.id}
                style={{
                  paddingHorizontal: 24,
                  paddingVertical: 18,
                  borderBottomWidth: index === activityFeed.length - 1 ? 0 : 1,
                  borderBottomColor: softBorderColor,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: elevatedCardBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Clock3 size={16} color={iconMuted} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textPrimary, fontSize: 15, fontWeight: '500' }}>{item.label}</Text>
                  <Text style={{ color: textMuted, fontSize: 13, marginTop: 4 }}>{item.meta}</Text>
                </View>
                <Text style={{ color: textFaint, fontSize: 12 }}>{formatRelativeDays(item.createdAt)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderBusinessFilterPill = (key: BusinessFilter, label: string, count: number) => {
    const selected = businessFilter === key;
    return (
      <Pressable
        key={key}
        onPress={() => setBusinessFilter(key)}
        style={{
          height: 34,
          paddingHorizontal: 14,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? activeTabBg : controlBg,
          borderWidth: selected ? 0 : 1,
          borderColor: selected ? 'transparent' : borderColor,
        }}
      >
        <Text style={{ color: selected ? activeTabFg : textMuted, fontSize: 12, fontWeight: selected ? '600' : '500' }}>
          {label} {count > 0 ? `· ${count}` : ''}
        </Text>
      </Pressable>
    );
  };

  const renderSelectedBusinessPanel = () => {
    if (!selectedBusiness) return null;

    const displayName = selectedBusiness.business_name || selectedBusiness.company_name;
    const secondaryName = selectedBusiness.company_name && selectedBusiness.company_name !== displayName
      ? selectedBusiness.company_name
      : '';

    return (
      <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor }}>
              <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '500' }}>{selectedBusiness.state === 'active' ? 'ACTIVE' : 'INACTIVE'}</Text>
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor }}>
              <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '500' }}>{selectedBusiness.plan}</Text>
            </View>
          </View>
          <Pressable onPress={() => setSelectedBusinessId(null)}>
            <X size={24} color={textMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600', marginTop: 24 }}>
          {displayName}
        </Text>
        {secondaryName ? (
          <Text style={{ color: textMuted, fontSize: 14, fontWeight: '400', marginTop: 8 }}>
            {secondaryName}
          </Text>
        ) : null}

        <View style={{ gap: 14, marginTop: 22 }}>
          {[
            { icon: <Mail size={18} color={iconMuted} strokeWidth={2} />, value: selectedBusiness.owner_email || 'No owner email' },
            { icon: <Calendar size={18} color={iconMuted} strokeWidth={2} />, value: `Joined ${selectedBusiness.joinedAgoLabel}` },
            { icon: <Clock3 size={18} color={iconMuted} strokeWidth={2} />, value: `Last active ${formatRelativeDays(selectedBusiness.lastActiveAt)}` },
          ].map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {item.icon}
              <Text style={{ color: textSecondary, fontSize: 14, fontWeight: '400' }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 14, marginTop: 24 }}>
          <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: headerBg, padding: 18 }}>
            <Text style={{ color: textFaint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Pending invites</Text>
            <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600', marginTop: 16 }}>{selectedBusiness.pending_invite_count ?? 0}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: headerBg, padding: 18 }}>
            <Text style={{ color: textFaint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Joined founders</Text>
            <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600', marginTop: 16 }}>{selectedBusiness.joined_invite_count ?? 0}</Text>
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ color: textFaint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Workspace</Text>
          <View style={{ gap: 12 }}>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: headerBg, padding: 16 }}>
              <Text style={{ color: textMuted, fontSize: 12, fontWeight: '400' }}>Tracking page</Text>
              <Text style={{ color: textPrimary, fontSize: 13, fontWeight: '500', marginTop: 8 }}>
                {selectedBusiness.business_slug ? getTrackingPageUrl(selectedBusiness.business_slug) : 'No slug yet'}
              </Text>
            </View>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: headerBg, padding: 16 }}>
              <Text style={{ color: textMuted, fontSize: 12, fontWeight: '400' }}>Invite limit</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <TextInput
                  value={inviteLimitDraft}
                  onChangeText={setInviteLimitDraft}
                  keyboardType="number-pad"
                  style={{
                    width: 90,
                    height: 40,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor: isDark ? '#111111' : '#FFFFFF',
                    color: textPrimary,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: '500',
                  }}
                  selectionColor={textPrimary}
                />
                <Pressable
                  onPress={() => { void handleSaveInviteLimit(); }}
                  style={{
                    height: 40,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    backgroundColor: primaryButtonBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isSavingLimit ? 0.75 : 1,
                  }}
                >
                  {isSavingLimit ? (
                    <ActivityIndicator size="small" color={primaryButtonText} />
                  ) : (
                    <Text style={{ color: primaryButtonText, fontSize: 12, fontWeight: '600' }}>Save limit</Text>
                  )}
                </Pressable>
              </View>
            </View>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor, backgroundColor: headerBg, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textMuted, fontSize: 12, fontWeight: '400' }}>Feature access</Text>
                  <Text style={{ color: textFaint, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                    Disable features for this business without affecting other onboarded businesses.
                  </Text>
                </View>
                <Pressable
                  onPress={() => { void handleSaveFeatureAccess(); }}
                  disabled={isSavingFeatures}
                  style={{
                    height: 36,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: primaryButtonBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isSavingFeatures ? 0.75 : 1,
                  }}
                >
                  {isSavingFeatures ? (
                    <ActivityIndicator size="small" color={primaryButtonText} />
                  ) : (
                    <Text style={{ color: primaryButtonText, fontSize: 12, fontWeight: '600' }}>Save</Text>
                  )}
                </Pressable>
              </View>

              <View style={{ gap: 10, marginTop: 14 }}>
                {BUSINESS_FEATURES.map((feature) => {
                  const enabled = featureAccessDraft[feature.key];
                  return (
                    <Pressable
                      key={feature.key}
                      onPress={() => handleToggleFeature(feature.key)}
                      disabled={isSavingFeatures}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: enabled ? 'rgba(34,197,94,0.26)' : 'rgba(239,68,68,0.26)',
                        backgroundColor: enabled ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        opacity: isSavingFeatures ? 0.72 : 1,
                      }}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 24,
                          borderRadius: 999,
                          padding: 3,
                          backgroundColor: enabled ? '#22C55E' : '#71717A',
                          alignItems: enabled ? 'flex-end' : 'flex-start',
                          justifyContent: 'center',
                        }}
                      >
                        <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: '#FFFFFF' }} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: textPrimary, fontSize: 13, fontWeight: '600' }}>{feature.label}</Text>
                        <Text style={{ color: textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{feature.description}</Text>
                      </View>
                      <Text style={{ color: enabled ? '#22C55E' : '#F87171', fontSize: 11, fontWeight: '700' }}>
                        {enabled ? 'ON' : 'OFF'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </>
    );
  };

  const renderBusinesses = () => (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', justifyContent: 'space-between', gap: 18, alignItems: Platform.OS === 'web' ? 'flex-end' : 'stretch' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: textPrimary, fontSize: 28, fontWeight: '600' }}>Businesses</Text>
          <Text style={{ color: textMuted, fontSize: 15, marginTop: 8 }}>All accounts using Fyll.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
            {renderBusinessFilterPill('all', 'All', businessRows.length)}
            {renderBusinessFilterPill('active', 'Active', businessMetrics.active)}
            {renderBusinessFilterPill('inactive', 'Inactive', businessMetrics.inactive)}
          </View>
        </View>

        <View
          style={{
            width: Platform.OS === 'web' ? 340 : '100%',
            height: 46,
            borderRadius: 999,
            borderWidth: 1,
            borderColor,
            backgroundColor: controlBg,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Search size={17} color={textMuted} strokeWidth={2} />
          <TextInput
            value={businessSearch}
            onChangeText={setBusinessSearch}
            placeholder="Search businesses..."
            placeholderTextColor={textMuted}
            style={{ flex: 1, marginLeft: 10, color: textPrimary, fontSize: 14 }}
            selectionColor={textPrimary}
          />
        </View>
      </View>

      <View
        style={{
          width: '100%',
          borderRadius: 24,
          borderWidth: 1,
          borderColor,
          backgroundColor: panelBg,
          overflow: 'hidden',
        }}
      >
          <View style={{ paddingHorizontal: 26, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: borderColor, flexDirection: 'row' }}>
            {['Business', 'Plan', 'Last active', 'Used invites', 'Pending', 'Status'].map((label, index) => (
              <Text
                key={label}
                style={{
                  width: index === 0 ? '28%' : index === 1 ? '12%' : index === 2 ? '18%' : index === 3 ? '12%' : index === 4 ? '13%' : '12%',
                  color: textFaint,
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {label}
              </Text>
            ))}
          </View>

          {isLoadingBusinesses ? (
            <View style={{ padding: 36, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={textPrimary} />
            </View>
          ) : filteredBusinesses.length === 0 ? (
            <View style={{ padding: 36, alignItems: 'center' }}>
              <Slash size={18} color={textMuted} strokeWidth={2} />
              <Text style={{ color: textFaint, marginTop: 12 }}>No businesses match this filter.</Text>
            </View>
          ) : (
            filteredBusinesses.map((business, index) => {
              const selected = business.business_id === selectedBusinessId;
              const statusStyle = statusCardStyle(business.state);
              return (
                <Pressable
                  key={business.business_id}
                  onPress={() => setSelectedBusinessId(business.business_id)}
                  style={{
                    paddingHorizontal: 26,
                    paddingVertical: 18,
                    borderBottomWidth: index === filteredBusinesses.length - 1 ? 0 : 1,
                    borderBottomColor: softBorderColor,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: selected ? elevatedCardBg : panelBg,
                  }}
                >
                  <View style={{ width: '28%', paddingRight: 18 }}>
                    <Text style={{ color: textPrimary, fontSize: 14, fontWeight: selected ? '600' : '500' }}>
                      {business.business_name || business.company_name}
                    </Text>
                    <Text style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
                      {business.business_website || business.business_phone || `/${business.business_slug}`}
                    </Text>
                  </View>
                  <Text style={{ width: '12%', color: textSecondary, fontSize: 13, fontWeight: '400' }}>{business.plan}</Text>
                  <Text style={{ width: '18%', color: textSecondary, fontSize: 13, fontWeight: '400' }}>{formatRelativeDays(business.lastActiveAt)}</Text>
                  <Text style={{ width: '12%', color: textSecondary, fontSize: 13, fontWeight: '400' }}>{business.invite_used_count ?? 0}</Text>
                  <Text style={{ width: '13%', color: textSecondary, fontSize: 13, fontWeight: '400' }}>{business.pending_invite_count ?? 0}</Text>
                  <View style={{ width: '12%' }}>
                    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: statusStyle.borderColor, backgroundColor: statusStyle.bgColor }}>
                      <Text style={{ color: statusStyle.textColor, fontSize: 10, fontWeight: '500', letterSpacing: 0.8 }}>{statusStyle.label}</Text>
                    </View>
                  </View>
                  <View style={{ width: '5%', alignItems: 'flex-end' }}>
                    <MoreHorizontal size={16} color={textFaint} strokeWidth={2} />
                  </View>
                </Pressable>
              );
            })
          )}
      </View>
    </View>
  );

  const renderInvites = () => (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={{ color: textPrimary, fontSize: 28, fontWeight: '600' }}>Invites</Text>
        <Text style={{ color: textMuted, fontSize: 15, marginTop: 8 }}>Invite fresh founders onto the platform and manage every founder invite in one place.</Text>
      </View>

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor,
          backgroundColor: controlBg,
          paddingHorizontal: 14,
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Building2 size={16} color={iconMuted} strokeWidth={2} />
        <Text style={{ color: textMuted, fontSize: 14, marginLeft: 10 }}>
          Founder invites here are platform-wide. Businesses are created after the founder redeems the invite.
        </Text>
      </View>

      <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 18 }}>
        <View
          style={{
            flex: Platform.OS === 'web' ? 0.8 : 1,
            borderRadius: 24,
            borderWidth: 1,
            borderColor,
            backgroundColor: cardBg,
            padding: 24,
          }}
        >
          <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600' }}>New invite</Text>
          <Text style={{ color: textMuted, fontSize: 14, marginTop: 8 }}>Generate a founder code for a new business owner.</Text>

          <Text style={{ color: textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 24 }}>Founder email</Text>
          <View
            style={{
              marginTop: 10,
              height: 46,
              borderRadius: 16,
              borderWidth: 1,
              borderColor,
              backgroundColor: controlBg,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Mail size={16} color={textMuted} strokeWidth={2} />
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="founder@business.com"
              placeholderTextColor={textMuted}
              style={{ flex: 1, marginLeft: 10, color: textPrimary, fontSize: 14 }}
              selectionColor={textPrimary}
              autoCapitalize="none"
            />
          </View>

          <Text style={{ color: textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 18 }}>Expires in days</Text>
          <View
            style={{
              marginTop: 10,
              height: 46,
              borderRadius: 16,
              borderWidth: 1,
              borderColor,
              backgroundColor: controlBg,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Calendar size={16} color={textMuted} strokeWidth={2} />
            <TextInput
              value={inviteExpiryDays}
              onChangeText={setInviteExpiryDays}
              placeholder="14"
              placeholderTextColor={textMuted}
              style={{ flex: 1, marginLeft: 10, color: textPrimary, fontSize: 14 }}
              selectionColor={textPrimary}
              keyboardType="number-pad"
            />
          </View>

          <Pressable
            onPress={() => { void handleCreateInvite(); }}
            disabled={isCreatingInvite}
            style={{
              height: 46,
              borderRadius: 999,
              backgroundColor: primaryButtonBg,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 22,
              opacity: isCreatingInvite ? 0.55 : 1,
            }}
          >
            {isCreatingInvite ? (
              <ActivityIndicator size="small" color={primaryButtonText} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Send size={15} color={primaryButtonText} strokeWidth={2} />
                <Text style={{ color: primaryButtonText, fontSize: 14, fontWeight: '600', marginLeft: 8 }}>Create invite</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View
          style={{
            flex: Platform.OS === 'web' ? 1.5 : 1,
            maxHeight: Platform.OS === 'web' ? 400 : 400,
            borderRadius: 24,
            borderWidth: 1,
            borderColor,
            backgroundColor: panelBg,
            overflow: 'visible',
          }}
        >
          <View style={{ paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: borderColor, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600' }}>All invites</Text>
            <Text style={{ color: textFaint, fontSize: 13 }}>{invites.length}</Text>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ flexGrow: invites.length === 0 ? 1 : 0 }}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {isLoadingInvites ? (
              <View style={{ padding: 36, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={textPrimary} />
              </View>
            ) : invites.length === 0 ? (
              <View style={{ padding: 36, alignItems: 'center' }}>
                <Text style={{ color: textFaint }}>No founder invites yet.</Text>
              </View>
            ) : (
              invites.map((invite, index) => {
                const pill = statusPillStyle(invite.status);
                const isMenuOpen = openInviteMenuId === invite.id;
                return (
                  <View
                    key={invite.id}
                    style={{
                      paddingHorizontal: 24,
                      paddingVertical: 18,
                      borderBottomWidth: index === invites.length - 1 ? 0 : 1,
                      borderBottomColor: softBorderColor,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      zIndex: isMenuOpen ? 50 : 1,
                      elevation: isMenuOpen ? 20 : 0,
                      overflow: 'visible',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '600' }}>{invite.access_code}</Text>
                        <Pressable onPress={() => { void handleCopyCode(invite); }} style={{ marginLeft: 8 }}>
                          <Copy size={14} color={textMuted} strokeWidth={2} />
                        </Pressable>
                      </View>
                      <Text style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
                        {invite.recipient_email} · expires {formatDate(invite.expires_at)}
                      </Text>
                    </View>

                    <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: pill.borderColor, backgroundColor: pill.bgColor }}>
                      <Text style={{ color: pill.textColor, fontSize: 11, letterSpacing: 1 }}>{normalizeStatusLabel(invite.status).toUpperCase()}</Text>
                    </View>

                    <View style={{ position: 'relative' }}>
                      <Pressable
                        onPress={() => setOpenInviteMenuId((current) => (current === invite.id ? null : invite.id))}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MoreVertical size={16} color={textMuted} strokeWidth={2} />
                      </Pressable>

                      {isMenuOpen ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 32,
                            right: 0,
                            minWidth: 150,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor,
                            backgroundColor: '#FFFFFF',
                            overflow: 'hidden',
                            zIndex: 200,
                            elevation: 12,
                            shadowColor: '#000000',
                            shadowOpacity: 0.08,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 8 },
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setOpenInviteMenuId(null);
                              void handleCopyLink(invite);
                            }}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: softBorderColor,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <Link2 size={14} color={textMuted} strokeWidth={2} />
                            <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '500' }}>Copy link</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setOpenInviteMenuId(null);
                              void handleShareInvite(invite);
                            }}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderBottomWidth: invite.status === 'pending' ? 1 : 0,
                              borderBottomColor: softBorderColor,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <Send size={14} color={textMuted} strokeWidth={2} />
                            <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '500' }}>Share invite</Text>
                          </Pressable>

                          {invite.status === 'pending' ? (
                            <Pressable
                              onPress={() => {
                                setOpenInviteMenuId(null);
                                void handleCancelInvite(invite);
                              }}
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 12,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                              }}
                            >
                              <X size={14} color="#F87171" strokeWidth={2} />
                              <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '500' }}>Delete invite</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  if (isLoadingAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: screenBg }}>
        <SafeAreaView className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={textPrimary} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: borderColor, backgroundColor: headerBg }}>
          <View
            style={{
              width: '100%',
              paddingHorizontal: 24,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              {isEmbeddedInSettings ? (
                <Pressable
                  onPress={goBack}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: controlBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronLeft size={18} color={textSecondary} strokeWidth={2} />
                </Pressable>
              ) : null}

              <Image
                source={require('../../assets/fyllfyll wordmark.png')}
                style={{ width: 68, height: 28, tintColor: wordmarkTint }}
                resizeMode="contain"
              />
              <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor }}>
                <Text style={{ color: textMuted, fontSize: 11, letterSpacing: 1 }}>ADMIN</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {tabs.map((item) => {
                  const selected = tab === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setTab(item.key)}
                      style={{
                        height: 40,
                        paddingHorizontal: 16,
                        borderRadius: 999,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: selected ? activeTabBg : 'transparent',
                        borderWidth: selected ? 0 : 1,
                        borderColor: selected ? 'transparent' : borderColor,
                      }}
                    >
                      {item.icon}
                      <Text style={{ color: selected ? activeTabFg : inactiveTabFg, fontSize: 13, fontWeight: selected ? '600' : '500', marginLeft: 8 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Text style={{ color: textMuted, fontSize: 14 }}>{platformAdmin?.email || ''}</Text>
              <Pressable onPress={() => { void handleRefresh(); }}>
                <RefreshCcw size={16} color={iconMuted} strokeWidth={2} />
              </Pressable>
              <Pressable onPress={() => { void logout(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LogOut size={16} color={textSecondary} strokeWidth={2} />
                <Text style={{ color: textSecondary, fontSize: 14 }}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {!platformAdmin?.is_admin ? (
          <View className="flex-1 items-center justify-center px-6">
            <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor }}>
              <Shield size={32} color={iconMuted} strokeWidth={1.8} />
            </View>
            <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '600', marginTop: 18 }}>Access locked</Text>
            <Text style={{ color: textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 460, marginTop: 10 }}>
              Add your email to `platform_admins`, then reload this console. Standard business admins should not have cross-business visibility.
            </Text>
            {loadError ? (
              <Text style={{ color: '#FCA5A5', fontSize: 13, marginTop: 18, textAlign: 'center' }}>{loadError}</Text>
            ) : null}
          </View>
        ) : (
          <View style={{ flex: 1, position: 'relative' }}>
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <View
                style={{
                  width: '100%',
                  maxWidth: shellMaxWidth,
                  alignSelf: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 34,
                  paddingBottom: 42,
                }}
              >
                {successMessage ? (
                  <View style={{ marginBottom: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)', backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: '#22C55E', fontSize: 13 }}>{successMessage}</Text>
                  </View>
                ) : null}
                {actionError ? (
                  <View style={{ marginBottom: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)', backgroundColor: 'rgba(239,68,68,0.08)', paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: '#F87171', fontSize: 13 }}>{actionError}</Text>
                  </View>
                ) : null}

                {tab === 'overview' ? renderOverview() : null}
                {tab === 'businesses' ? renderBusinesses() : null}
                {tab === 'invites' ? renderInvites() : null}
              </View>
            </ScrollView>

            {tab === 'businesses' && selectedBusiness ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  justifyContent: 'flex-start',
                  alignItems: Platform.OS === 'web' ? 'flex-end' : 'stretch',
                }}
              >
                <Pressable
                  onPress={() => setSelectedBusinessId(null)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.56)' : 'rgba(15, 23, 42, 0.14)',
                  }}
                />
                <View
                  style={{
                    width: Platform.OS === 'web' ? 500 : '100%',
                    maxWidth: '100%',
                    height: '100%',
                    borderRadius: Platform.OS === 'web' ? 0 : 28,
                    borderTopLeftRadius: Platform.OS === 'web' ? 0 : 28,
                    borderTopRightRadius: Platform.OS === 'web' ? 0 : 28,
                    borderBottomLeftRadius: Platform.OS === 'web' ? 0 : 0,
                    borderBottomRightRadius: Platform.OS === 'web' ? 0 : 0,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor: cardBg,
                    paddingHorizontal: 24,
                    paddingTop: 24,
                    paddingBottom: Platform.OS === 'web' ? 24 : 0,
                  }}
                >
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 32 }}
                  >
                    {renderSelectedBusinessPanel()}
                  </ScrollView>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
