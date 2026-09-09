import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SvgXml } from 'react-native-svg';
import { AlertTriangle, Banknote, BarChart3, Bell, Briefcase, Building2, Check, ChevronDown, ChevronRight, DollarSign, FileText, Glasses, Home, Laptop, LogOut, Moon, Plus, RefreshCw, Search, Send, Sun, User, Wrench, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AttachmentLink } from '@/components/AttachmentLink';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { HorizontalBarChart } from '@/components/stats/HorizontalBarChart';
import { InteractiveLineChart } from '@/components/stats/InteractiveLineChart';
import { SalesBarChart } from '@/components/stats/SalesBarChart';
import { BlurView } from 'expo-blur';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { getDateRange, type TimeRange } from '@/lib/analytics-utils';
import { notifyBusinessOfPartnerJobEvent } from '@/lib/notify-partner';
import { sendPartnerTestPush, useWebPushNotifications } from '@/hooks/useWebPushNotifications';
import { useBreakpoint } from '@/lib/useBreakpoint';
import useFyllStore, { formatCurrency, type ThemeMode } from '@/lib/state/fyll-store';
import { supabase } from '@/lib/supabase';
import {
  lookupPartnerPortal,
  lookupPartnerPortalByAuth,
  submitPartnerBill,
  updatePartnerBillJobs,
  updatePartnerPortalJobFee,
  updatePartnerPortalJobStatus,
  type PartnerBillingCycle,
  type PartnerPortalJob,
} from '@/lib/supabase/partner-portal';

const SESSION_TOKEN_SEGMENT = '_session';

const FYLL_LOGO_XML = (fill: string) => `<svg width="72" height="24" viewBox="0 0 344 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M27.2814 190.462V91.8673H78.4995H79.4995V90.8673V70.5023V69.5023H78.4995H27.2814V58.7533C27.2814 48.4452 29.5154 40.4114 33.8725 34.546L33.8726 34.546L33.8804 34.5351C38.1419 28.6347 45.6793 25.5504 56.829 25.5504C62.3428 25.5504 66.9479 26.068 70.6648 27.0817L70.6854 27.0873L70.7063 27.0921C74.5027 27.9549 77.3729 28.8909 79.3577 29.8834L80.5143 30.4617L80.7831 29.1968L85.2217 8.30955L85.3942 7.4978L84.6281 7.17862C82.4396 6.26676 78.6987 5.2942 73.4771 4.24979C68.3435 3.18796 62.1805 2.66317 55.0014 2.66317C36.5665 2.66317 22.8382 7.49247 14.0498 17.3545C5.30253 26.9965 1 40.6716 1 58.2311V190.462V191.462H2H26.2814H27.2814V190.462ZM101.618 167.36L100.5 166.852L100.229 168.049L95.7903 187.631L95.617 188.396L96.3183 188.747C97.0819 189.128 98.2703 189.582 99.8435 190.106L99.8579 190.111L99.8724 190.115C101.641 190.646 103.494 191.088 105.432 191.441C107.547 191.968 109.665 192.322 111.785 192.5C113.908 192.852 115.951 193.03 117.914 193.03C125.128 193.03 131.583 192.15 137.267 190.375C143.129 188.598 148.378 185.841 153.006 182.103C157.625 178.372 161.782 173.591 165.483 167.778C169.351 162.149 173.032 155.396 176.529 147.528L176.533 147.519C185.423 126.948 193.702 104.9 201.369 81.3759L201.37 81.3738C209.036 57.6773 216.005 33.0244 222.277 7.41531L222.58 6.17744H221.306H196.241H195.444L195.266 6.95389C190.918 25.9141 186.308 44.3515 181.438 62.2663C176.774 79.422 171.312 96.739 165.051 114.217C161.251 106.035 157.597 97.5585 154.089 88.7884C150.266 79.2297 146.703 69.6713 143.401 60.1134C140.099 50.5532 137.057 41.2547 134.277 32.2179C131.67 23.1809 129.411 14.755 127.501 6.93999L127.315 6.17744H126.53H100.421H99.1265L99.4532 7.42986C105.73 31.4914 113.576 55.2903 122.99 78.8265L122.994 78.8348C132.512 102.024 142.718 124.014 153.614 144.802C149.35 154.066 144.629 160.632 139.494 164.608L139.486 164.614L139.479 164.62C134.318 168.782 127.084 170.926 117.653 170.926C114.793 170.926 111.837 170.505 108.782 169.657L108.763 169.651L108.744 169.647C105.823 168.959 103.453 168.194 101.618 167.36ZM280.241 193.029L281.108 193.049L281.251 192.194L284.645 171.829L284.814 170.813L283.794 170.674C280.004 170.157 276.838 169.557 274.285 168.879C271.801 168.046 269.867 166.902 268.439 165.474C267.022 164.057 265.965 162.136 265.304 159.658C264.638 157.161 264.293 153.948 264.293 149.994V3V1.81327L263.124 2.01448L238.842 6.19192L238.012 6.33479V7.17744V153.91C238.012 166.933 241.179 176.732 247.714 183.086C254.253 189.443 265.186 192.679 280.241 193.029ZM337.583 191.462L338.45 191.482L338.592 190.627L341.986 170.262L342.156 169.246L341.135 169.106C337.346 168.59 334.18 167.99 331.627 167.311C329.142 166.479 327.208 165.335 325.781 163.907C324.363 162.49 323.306 160.569 322.646 158.09C321.98 155.593 321.635 152.381 321.635 148.427V3.00075V1.81402L320.465 2.01523L296.184 6.19267L295.354 6.33554V7.17819V152.343C295.354 165.366 298.52 175.165 305.056 181.519C311.594 187.876 322.527 191.112 337.583 191.462Z" fill="${fill}" stroke="${fill}" stroke-width="2"/>
</svg>`;

const STATUS_LABELS: Record<string, string> = {
  awaiting_dispatch: 'Awaiting dispatch',
  sent: 'Sent to you',
  accepted: 'Job accepted',
  in_progress: 'In progress',
  ready: 'Ready for pickup',
  pickup_requested: 'Pickup requested',
  received: 'Received',
  sent_to_business: 'Sent back to business',
  collected: 'Returned to business',
  billed: 'Invoiced',
  cancelled: 'Cancelled',
};

const DEFAULT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  awaiting_dispatch: { bg: '#F4F4F0', text: '#6B7280' },
  sent: { bg: '#F4F4F0', text: '#6B7280' },
  accepted: { bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  in_progress: { bg: 'rgba(202, 138, 4, 0.14)', text: '#A16207' },
  ready: { bg: '#E8F0FF', text: '#3B82F6' },
  pickup_requested: { bg: '#E8F0FF', text: '#3B82F6' },
  received: { bg: '#E6F7EC', text: '#16A34A' },
  sent_to_business: { bg: '#E6F7EC', text: '#16A34A' },
  collected: { bg: '#E6F7EC', text: '#16A34A' },
  billed: { bg: '#E6F7EC', text: '#16A34A' },
  cancelled: { bg: '#FEE9E9', text: '#DC2626' },
};

const getStatusColorMeta = (status: string, customColors?: Record<string, { bg: string; text: string }>) => (
  customColors?.[status] ?? DEFAULT_STATUS_COLORS[status] ?? { bg: '#F4F4F0', text: '#6B7280' }
);

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return hex;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const BILL_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  approved: { label: 'Approved', bg: '#E8F0FF', text: '#3B82F6' },
  rejected: { label: 'Rejected', bg: '#FEE9E9', text: '#DC2626' },
  queried: { label: 'Queried', bg: '#F3E8FF', text: '#7E22CE' },
  paid: { label: 'Paid', bg: '#E6F7EC', text: '#16A34A' },
};

const JOB_DUE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isJobInFlight = (job: PartnerPortalJob) => job.status === 'sent' || job.status === 'accepted' || job.status === 'in_progress';

const isJobPastDue = (job: PartnerPortalJob) => {
  if (!isJobInFlight(job)) return false;
  const sentAt = new Date(job.dispatchedAt ?? job.createdAt ?? '').getTime();
  return Number.isFinite(sentAt) && sentAt < Date.now() - JOB_DUE_WINDOW_MS;
};

const statusLabel = (status: string) => (
  STATUS_LABELS[status]
  ?? status.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (m) => m.toUpperCase())
);

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

type SimplePeriod = 'all' | 'week' | 'month' | 'year';

const getSimplePeriodRange = (period: Exclude<SimplePeriod, 'all'>) => {
  const now = new Date();
  const start = new Date(now);
  if (period === 'week') {
    start.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  if (period === 'week') end.setDate(start.getDate() + 7);
  if (period === 'month') end.setMonth(start.getMonth() + 1);
  if (period === 'year') end.setFullYear(start.getFullYear() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
};

const isJobInSimplePeriod = (job: PartnerPortalJob, period: SimplePeriod) => {
  if (period === 'all') return true;
  const { startMs, endMs } = getSimplePeriodRange(period);
  const jobDate = new Date(job.dispatchedAt ?? job.createdAt ?? '').getTime();
  return Number.isFinite(jobDate) && jobDate >= startMs && jobDate < endMs;
};

type PortalSection = 'home' | 'jobs' | 'bills' | 'issues' | 'insights' | 'account';

export default function PartnerPortalScreen() {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const isDarkMode = themeMode === 'dark';
  const appearanceMode = useFyllStore((s) => s.themeMode);
  const setAppearanceMode = useFyllStore((s) => s.setThemeMode);
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const router = useRouter();
  const { token: rawToken } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken ?? '';
  const mode: 'token' | 'session' = token === SESSION_TOKEN_SEGMENT ? 'session' : 'token';
  const mutationToken = mode === 'session' ? null : token;
  const queryClient = useQueryClient();
  const { isReady: isPushReady, loginUser: loginPushUser, promptForPermission: promptForPushPermission } = useWebPushNotifications();
  const [statusMenuJobId, setStatusMenuJobId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<PortalSection>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [selectedBillJobIds, setSelectedBillJobIds] = useState<Set<string>>(new Set());
  const [newBillJobPool, setNewBillJobPool] = useState<PartnerPortalJob[]>([]);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [newBillFilterPeriod, setNewBillFilterPeriod] = useState<SimplePeriod>('all');
  const [viewingBillId, setViewingBillId] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [insightsRange, setInsightsRange] = useState<TimeRange>('month');
  const [jobStatusExpanded, setJobStatusExpanded] = useState(false);
  const [notifSeenAt, setNotifSeenAt] = useState('1970-01-01T00:00:00.000Z');
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notificationEnableStatus, setNotificationEnableStatus] = useState<'idle' | 'loading' | 'enabled' | 'blocked'>('idle');
  const [testPushStatus, setTestPushStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['partner-portal', mode, token],
    queryFn: () => (mode === 'session' ? lookupPartnerPortalByAuth() : lookupPartnerPortal(token)),
    enabled: mode === 'session' || !!token,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (vars: { jobId: string; status: string; event?: 'accepted' | 'rejected' | 'status_updated' }) => updatePartnerPortalJobStatus({ token: mutationToken, jobId: vars.jobId, status: vars.status }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal', mode, token] });

      // "Accepted" is the partner's first explicit response. Every later
      // status change (in progress, ready, collected, custom statuses, etc.)
      // still notifies the business with a generic "updated to X" heading.
      if (data?.businessId) {
        const job = jobs.find((j) => j.id === vars.jobId);
        notifyBusinessOfPartnerJobEvent({
          businessId: data.businessId,
          partnerToken: mutationToken,
          jobId: vars.jobId,
          event: vars.event ?? (vars.status === 'cancelled' ? 'rejected' : 'status_updated'),
          customerName: job?.customerName,
          itemLabel: job?.itemLabel || job?.jobType || undefined,
          statusLabel: statusLabel(vars.status),
        });
      }
    },
  });

  const updateFeeMutation = useMutation({
    mutationFn: (vars: { jobId: string; amount: number }) => updatePartnerPortalJobFee({ token: mutationToken, jobId: vars.jobId, amount: vars.amount }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal', mode, token] });
      setFeeDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.jobId];
        return next;
      });
    },
  });

  const submitBillMutation = useMutation({
    mutationFn: (jobIds: string[]) => submitPartnerBill(mutationToken, jobIds),
    onSuccess: (result, jobIds) => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal', mode, token] });
      setShowNewBillModal(false);
      if (result.billId) {
        Alert.alert('Bill sent', `Sent ${formatCurrency(result.total)} across ${result.jobCount} ${result.jobCount === 1 ? 'job' : 'jobs'}.`);
        if (data?.businessId) {
          const job = jobs.find((j) => jobIds.includes(j.id));
          notifyBusinessOfPartnerJobEvent({
            businessId: data.businessId,
            partnerToken: mutationToken,
            jobId: jobIds[0],
            event: 'bill_submitted',
            customerName: job?.customerName,
            itemLabel: job?.itemLabel || job?.jobType || undefined,
            amount: String(result.total),
          });
        }
      }
    },
  });

  const updateBillJobsMutation = useMutation({
    mutationFn: (vars: { billId: string; jobIds: string[] }) => updatePartnerBillJobs(mutationToken, vars.billId, vars.jobIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['partner-portal', mode, token] });
      setShowNewBillModal(false);
      setEditingBillId(null);
      if (result.jobCount > 0) {
        Alert.alert('Bill updated', `Now ${formatCurrency(result.total)} across ${result.jobCount} ${result.jobCount === 1 ? 'job' : 'jobs'}.`);
      } else {
        Alert.alert('Bill removed', 'All jobs were removed, so the bill was cleared.');
      }
    },
  });

  const jobs = data?.jobs ?? [];

  // Web push only works for session-mode partners (a real Supabase Auth
  // session to tag device subscriptions with); token-only partners have no
  // stable identity to target, so they rely on the in-app bell above.
  useEffect(() => {
    if (mode !== 'session' || !data) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data: authData }) => {
      if (cancelled) return;
      const uid = authData.user?.id;
      if (uid) {
        loginPushUser(uid);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode, data, loginPushUser]);

  const notifStorageKey = data?.partnerId ? `partner_notif_seen_at:${data.partnerId}` : null;

  const handleEnablePartnerNotifications = async () => {
    if (!isPushReady) {
      setNotificationEnableStatus('loading');
      setTimeout(() => setNotificationEnableStatus('idle'), 2500);
      return;
    }

    setNotificationEnableStatus('loading');
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (uid) {
        loginPushUser(uid);
      }
      const granted = await promptForPushPermission();
      setNotificationEnableStatus(granted ? 'enabled' : 'blocked');
    } catch (error) {
      console.warn('Partner notification permission failed:', error);
      setNotificationEnableStatus('blocked');
    }
  };

  useEffect(() => {
    if (!notifStorageKey) return;
    AsyncStorage.getItem(notifStorageKey).then((stored) => {
      if (stored) setNotifSeenAt(stored);
    }).catch(() => {});
  }, [notifStorageKey]);

  // Derived purely from job timestamps already in `jobs` — no separate
  // notifications table needed, and this works for both magic-link and
  // session-mode partners since it's just reading data they already fetch.
  const partnerNotifications = useMemo(() => {
    const entries: { id: string; timestamp: string; kind: 'dispatched' | 'bill_responded' | 'past_due'; job: PartnerPortalJob }[] = [];
    jobs.forEach((job) => {
      if (job.dispatchedAt) {
        entries.push({ id: `${job.id}:dispatched`, timestamp: job.dispatchedAt, kind: 'dispatched', job });
      }
      if (job.billId && job.billRespondedAt) {
        entries.push({ id: `${job.id}:bill:${job.billRespondedAt}`, timestamp: job.billRespondedAt, kind: 'bill_responded', job });
      }
      if (isJobPastDue(job)) {
        // Timestamped at the moment the job actually crossed the 7-day
        // threshold (not when it was dispatched), so it surfaces as its
        // own fresh unread notification right when it becomes overdue.
        const dueAtMs = new Date(job.dispatchedAt ?? job.createdAt ?? '').getTime() + JOB_DUE_WINDOW_MS;
        if (Number.isFinite(dueAtMs)) {
          entries.push({ id: `${job.id}:past_due`, timestamp: new Date(dueAtMs).toISOString(), kind: 'past_due', job });
        }
      }
    });
    return entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [jobs]);

  const unreadNotifCount = useMemo(() => (
    partnerNotifications.filter((n) => new Date(n.timestamp).getTime() > new Date(notifSeenAt).getTime()).length
  ), [partnerNotifications, notifSeenAt]);

  const handleOpenNotifDropdown = () => {
    setShowNotifDropdown((prev) => !prev);
    if (!showNotifDropdown) {
      const nowIso = new Date().toISOString();
      setNotifSeenAt(nowIso);
      if (notifStorageKey) {
        AsyncStorage.setItem(notifStorageKey, nowIso).catch(() => {});
      }
    }
  };

  const sortedJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...jobs]
      .filter((job) => {
        if (statusFilter !== 'all' && job.status !== statusFilter) return false;
        if (!query) return true;
        return [job.customerName, job.itemLabel, job.jobType, job.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }, [jobs, searchQuery, statusFilter]);

  const jobStats = useMemo(() => {
    const withBusiness = jobs.filter((job) => isJobInFlight(job)).length;
    const pastDueCount = jobs.filter((job) => isJobPastDue(job)).length;
    return { withBusiness, pastDueCount, totalJobs: jobs.length };
  }, [jobs]);

  const pastDueJobs = useMemo(() => (
    jobs.filter((job) => isJobPastDue(job)).sort((a, b) => new Date(a.dispatchedAt ?? a.createdAt ?? 0).getTime() - new Date(b.dispatchedAt ?? b.createdAt ?? 0).getTime())
  ), [jobs]);

  const openIssueJobs = useMemo(() => (
    jobs.filter((job) => job.hasOpenIssue).sort((a, b) => new Date(b.dispatchedAt ?? b.createdAt ?? 0).getTime() - new Date(a.dispatchedAt ?? a.createdAt ?? 0).getTime())
  ), [jobs]);

  // Newly dispatched jobs the partner hasn't accepted/rejected yet.
  const newJobsCount = useMemo(() => (
    jobs.filter((job) => job.status === 'sent').length
  ), [jobs]);

  const issuesEntryCard = (
    <Pressable
      onPress={() => setActiveSection('issues')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.bg.card,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: hexToRgba('#DC2626', 0.12), alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={20} color="#DC2626" strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>Issues</Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {openIssueJobs.length > 0 ? 'Jobs flagged with a problem' : 'No issues reported'}
        </Text>
      </View>
      {openIssueJobs.length > 0 ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#EF4444',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 6,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>
            {openIssueJobs.length > 99 ? '99+' : openIssueJobs.length}
          </Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
    </Pressable>
  );

  const statusFilterChips = useMemo(() => {
    const statuses = new Set<string>();
    (data?.partnerJobStatuses ?? []).forEach((status) => statuses.add(status));
    jobs.forEach((job) => {
      if (job.status !== 'awaiting_dispatch' && job.status !== 'cancelled') statuses.add(job.status);
    });
    return [
      { key: 'all' as const, label: 'All', count: jobs.length },
      ...Array.from(statuses).map((status) => ({
        key: status,
        label: statusLabel(status),
        count: jobs.filter((job) => job.status === status).length,
      })),
    ];
  }, [data?.partnerJobStatuses, jobs]);

  const billSummary = useMemo(() => {
    const priced = jobs.filter((job) => (job.amount ?? 0) > 0);
    const total = priced.reduce((sum, job) => sum + (job.amount ?? 0), 0);
    const unbilled = priced.filter((job) => !job.billId && job.status !== 'cancelled');
    const unbilledTotal = unbilled.reduce((sum, job) => sum + (job.amount ?? 0), 0);
    return { total, unbilledTotal, unbilledCount: unbilled.length };
  }, [jobs]);

  const billableJobs = useMemo(() => (
    jobs.filter((job) => !job.billId && (job.amount ?? 0) > 0 && job.status !== 'cancelled' && !job.hasOpenIssue)
  ), [jobs]);

  const billingCycle: PartnerBillingCycle = data?.billingCycle ?? 'manual';

  const selectedBillTotal = useMemo(() => (
    newBillJobPool.filter((job) => selectedBillJobIds.has(job.id)).reduce((sum, job) => sum + (job.amount ?? 0), 0)
  ), [newBillJobPool, selectedBillJobIds]);

  const visibleNewBillJobPool = useMemo(() => (
    newBillJobPool.filter((job) => isJobInSimplePeriod(job, newBillFilterPeriod))
  ), [newBillJobPool, newBillFilterPeriod]);

  const submittedBills = useMemo(() => {
    const byBillId = new Map<string, PartnerPortalJob[]>();
    jobs.forEach((job) => {
      if (!job.billId) return;
      const list = byBillId.get(job.billId) ?? [];
      list.push(job);
      byBillId.set(job.billId, list);
    });
    const bills: { billId: string; jobCount: number; total: number; status: string; submittedAt: string | null; note: string | null }[] = [];
    byBillId.forEach((billJobs, billId) => {
      const first = billJobs[0];
      bills.push({
        billId,
        jobCount: billJobs.length,
        total: billJobs.reduce((sum, job) => sum + (job.amount ?? 0), 0),
        status: first.billStatus ?? 'pending',
        submittedAt: first.billSubmittedAt,
        note: first.billNote,
      });
    });
    return bills.sort((a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime());
  }, [jobs]);

  const recentJobs = useMemo(() => (
    [...jobs]
      .filter((job) => job.status !== 'awaiting_dispatch')
      .sort((a, b) => new Date(b.dispatchedAt ?? b.createdAt ?? 0).getTime() - new Date(a.dispatchedAt ?? a.createdAt ?? 0).getTime())
      .slice(0, 5)
  ), [jobs]);

  const pendingBillsForHome = useMemo(() => (
    submittedBills.filter((bill) => bill.status === 'pending').slice(0, 3)
  ), [submittedBills]);

  const insightsRangeJobs = useMemo(() => {
    const { start, end } = getDateRange(insightsRange);
    return jobs.filter((job) => {
      const at = new Date(job.dispatchedAt ?? job.createdAt ?? '');
      return at >= start && at <= end;
    });
  }, [jobs, insightsRange]);

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    insightsRangeJobs.forEach((job) => {
      const key = job.jobType?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [insightsRangeJobs]);

  const serviceBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    insightsRangeJobs.forEach((job) => {
      const key = job.jobService?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [insightsRangeJobs]);

  const topServices = useMemo(() => {
    const entries = new Map<string, { count: number; revenue: number }>();
    insightsRangeJobs.forEach((job) => {
      const key = job.jobService?.trim();
      if (!key) return;
      const existing = entries.get(key) ?? { count: 0, revenue: 0 };
      existing.count += 1;
      existing.revenue += job.amount ?? 0;
      entries.set(key, existing);
    });
    return Array.from(entries.entries())
      .map(([name, { count, revenue }]) => ({ name, count, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [insightsRangeJobs]);

  const insightsStats = useMemo(() => {
    const totalJobs = insightsRangeJobs.length;
    const totalRevenue = insightsRangeJobs.reduce((sum, job) => sum + (job.amount ?? 0), 0);
    const avgJobValue = totalJobs > 0 ? totalRevenue / totalJobs : 0;
    const completedJobs = insightsRangeJobs.filter((job) => (
      job.status === 'collected' || job.status === 'sent_to_business' || job.status === 'billed'
    )).length;
    return { totalJobs, totalRevenue, avgJobValue, completedJobs };
  }, [insightsRangeJobs]);

  // Bucketing granularity adapts to the selected insights date filter, so
  // the chart actually reflects "7 Days" (by day), "This Month" (by week),
  // "30 Days" (by week), or "This Year" (by month) instead of always
  // showing a fixed last-6-months window regardless of the tab. Jobs and
  // Revenue charts share these exact buckets so they never fall out of
  // sync with each other or with the selected tab.
  const insightsBuckets = useMemo(() => {
    const now = new Date();

    if (insightsRange === '7d') {
      const days: { label: string; start: Date; end: Date }[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        days.push({ label: start.toLocaleDateString('en-US', { weekday: 'short' }), start, end });
      }
      return { granularity: 'Day', ranges: days };
    }

    if (insightsRange === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const weekCount = Math.ceil(daysInMonth / 7);
      const weeks: { label: string; start: Date; end: Date }[] = [];
      for (let w = 0; w < weekCount; w += 1) {
        const startDay = w * 7 + 1;
        const endDay = Math.min(startDay + 7, daysInMonth + 1);
        const start = new Date(now.getFullYear(), now.getMonth(), startDay);
        const end = new Date(now.getFullYear(), now.getMonth(), endDay);
        weeks.push({ label: `Wk${w + 1}`, start, end });
      }
      return { granularity: 'Week', ranges: weeks };
    }

    if (insightsRange === '30d') {
      const weeks: { label: string; start: Date; end: Date }[] = [];
      for (let i = 4; i >= 0; i -= 1) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7 + 1);
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
        weeks.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start, end });
      }
      return { granularity: 'Week', ranges: weeks };
    }

    const months: { label: string; start: Date; end: Date }[] = [];
    for (let m = 0; m < 12; m += 1) {
      const start = new Date(now.getFullYear(), m, 1);
      const end = new Date(now.getFullYear(), m + 1, 1);
      months.push({ label: start.toLocaleDateString('en-US', { month: 'short' }).charAt(0).toUpperCase(), start, end });
    }
    return { granularity: 'Month', ranges: months };
  }, [insightsRange]);

  const insightsJobsChart = useMemo(() => ({
    title: `Jobs by ${insightsBuckets.granularity}`,
    data: insightsBuckets.ranges.map((r) => ({
      label: r.label,
      value: jobs.filter((job) => {
        const at = new Date(job.dispatchedAt ?? job.createdAt ?? '');
        return at >= r.start && at < r.end;
      }).length,
    })),
  }), [insightsBuckets, jobs]);

  const insightsRevenueChart = useMemo(() => ({
    title: `Revenue by ${insightsBuckets.granularity}`,
    data: insightsBuckets.ranges.map((r) => ({
      label: r.label,
      value: jobs
        .filter((job) => {
          const at = new Date(job.dispatchedAt ?? job.createdAt ?? '');
          return at >= r.start && at < r.end;
        })
        .reduce((sum, job) => sum + (job.amount ?? 0), 0),
    })),
  }), [insightsBuckets, jobs]);

  const weeklyRanges = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const currentMonday = new Date(now);
    currentMonday.setHours(0, 0, 0, 0);
    currentMonday.setDate(now.getDate() - diffToMonday);

    const ranges: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(currentMonday);
      start.setDate(currentMonday.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      ranges.push({ key: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start, end });
    }
    return ranges;
  }, []);

  const jobsByWeek = useMemo(() => (
    weeklyRanges.map((range) => ({
      key: range.key,
      label: range.label,
      value: jobs.filter((job) => {
        const at = new Date(job.dispatchedAt ?? job.createdAt ?? '');
        return at >= range.start && at < range.end;
      }).length,
    }))
  ), [jobs, weeklyRanges]);

  const thisWeekJobs = useMemo(() => {
    const currentWeek = weeklyRanges[weeklyRanges.length - 1];
    if (!currentWeek) return [];
    return jobs.filter((job) => {
      const at = new Date(job.dispatchedAt ?? job.createdAt ?? '');
      return at >= currentWeek.start && at < currentWeek.end;
    });
  }, [jobs, weeklyRanges]);

  const weeklyCategoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    thisWeekJobs.forEach((job) => {
      const key = job.jobType?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [thisWeekJobs]);

  const weeklyServiceBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    thisWeekJobs.forEach((job) => {
      const key = job.jobService?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [thisWeekJobs]);

  const thisMonthBillSummary = useMemo(() => {
    const now = new Date();
    const monthBills = submittedBills.filter((bill) => {
      if (!bill.submittedAt) return false;
      const d = new Date(bill.submittedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const sumFor = (statuses: string[]) => monthBills.filter((bill) => statuses.includes(bill.status)).reduce((sum, bill) => sum + bill.total, 0);
    return {
      total: monthBills.reduce((sum, bill) => sum + bill.total, 0),
      pending: sumFor(['pending', 'queried']),
      approved: sumFor(['approved']),
      paid: sumFor(['paid']),
    };
  }, [submittedBills]);

  const viewingBill = useMemo(() => {
    if (!viewingBillId) return null;
    const billJobs = jobs.filter((job) => job.billId === viewingBillId);
    if (billJobs.length === 0) return null;
    const first = billJobs[0];
    return {
      billId: viewingBillId,
      jobs: billJobs,
      jobCount: billJobs.length,
      total: billJobs.reduce((sum, job) => sum + (job.amount ?? 0), 0),
      status: first.billStatus ?? 'pending',
      submittedAt: first.billSubmittedAt,
      respondedAt: first.billRespondedAt,
      paidAt: first.billPaidAt,
      note: first.billNote,
    };
  }, [viewingBillId, jobs]);

  const viewingJob = useMemo(() => (
    jobs.find((job) => job.id === viewingJobId) ?? null
  ), [viewingJobId, jobs]);

  const handleSelectStatus = (job: PartnerPortalJob, status: string) => {
    setStatusMenuJobId(null);
    if (status === job.status) return;
    updateStatusMutation.mutate({ jobId: job.id, status });
  };

  const canAcceptJob = (job: PartnerPortalJob) => job.status === 'sent';

  const handleAcceptJob = (job: PartnerPortalJob) => {
    updateStatusMutation.mutate({ jobId: job.id, status: 'accepted', event: 'accepted' });
  };

  const handleRejectJob = (job: PartnerPortalJob) => {
    updateStatusMutation.mutate({ jobId: job.id, status: 'cancelled', event: 'rejected' });
  };

  const handleOpenNewBillModal = (jobPool: PartnerPortalJob[]) => {
    setEditingBillId(null);
    setNewBillJobPool(jobPool);
    setSelectedBillJobIds(new Set(jobPool.map((job) => job.id)));
    setNewBillFilterPeriod('all');
    setShowNewBillModal(true);
  };

  const handleOpenEditBillModal = (billId: string) => {
    const jobsInBill = jobs.filter((job) => job.billId === billId);
    const pool = [...jobsInBill, ...billableJobs];
    setEditingBillId(billId);
    setNewBillJobPool(pool);
    setSelectedBillJobIds(new Set(jobsInBill.map((job) => job.id)));
    setNewBillFilterPeriod('all');
    setShowNewBillModal(true);
  };

  const toggleBillJobSelection = (jobId: string) => {
    setSelectedBillJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleConfirmNewBill = () => {
    if (submitBillMutation.isPending || updateBillJobsMutation.isPending || selectedBillJobIds.size === 0) return;
    if (editingBillId) {
      updateBillJobsMutation.mutate({ billId: editingBillId, jobIds: Array.from(selectedBillJobIds) });
    } else {
      submitBillMutation.mutate(Array.from(selectedBillJobIds));
    }
  };

  const getFeeDraftValue = (job: PartnerPortalJob) => (
    feeDrafts[job.id] ?? (job.amount != null ? String(job.amount) : '')
  );

  const canCommitFee = (job: PartnerPortalJob) => {
    const raw = feeDrafts[job.id];
    if (raw === undefined) return false;
    const trimmed = raw.trim();
    if (trimmed === '') return false;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 && parsed !== job.amount && !updateFeeMutation.isPending;
  };

  const handleCommitFee = (job: PartnerPortalJob) => {
    const raw = feeDrafts[job.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === job.amount) return;
    updateFeeMutation.mutate({ jobId: job.id, amount: parsed });
  };

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Invalid link</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Building2 size={28} color={colors.text.tertiary} strokeWidth={1.7} />
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
            {mode === 'session' ? "This account isn't linked to a partner portal" : "This link isn't working"}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            {mode === 'session'
              ? 'Sign in with the account you were invited with, or ask the business for a new invite.'
              : 'Ask the business to send you a new portal link.'}
          </Text>
          {mode === 'session' ? (
            <Pressable
              onPress={async () => {
                try {
                  await supabase.auth.signOut({ scope: 'local' });
                } catch (error) {
                  console.warn('Partner sign out failed:', error);
                }
                router.replace('/partner-login');
              }}
              style={{ marginTop: 16, height: 40, borderRadius: 999, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Back to login</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const navItems: { key: PortalSection; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'bills', label: 'Bills' },
    { key: 'issues', label: 'Issues' },
    { key: 'insights', label: 'Insights' },
    { key: 'account', label: 'Account' },
  ];

  const jobStatCards: { label: string; value: string; caption: string; valueColor?: string }[] = [
    { label: 'WITH BUSINESS', value: String(jobStats.withBusiness), caption: 'Jobs currently in progress' },
    { label: 'PAST DUE', value: String(jobStats.pastDueCount), caption: 'Sent jobs older than seven days', valueColor: jobStats.pastDueCount > 0 ? '#DC2626' : undefined },
    { label: 'UNBILLED VALUE', value: formatCurrency(billSummary.unbilledTotal), caption: 'Priced jobs awaiting invoicing' },
    { label: 'TOTAL JOBS', value: String(jobStats.totalJobs), caption: 'All jobs from this business' },
  ];

  const renderStatCard = (stat: { label: string; value: string; caption: string; valueColor?: string }) => (
    <View
      key={stat.label}
      style={{
        flex: 1,
        minHeight: 104,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.bg.card,
        paddingHorizontal: 16,
        paddingVertical: 14,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
        {stat.label}
      </Text>
      <Text style={{ color: stat.valueColor ?? colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 6 }}>
        {stat.value}
      </Text>
      <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '400', lineHeight: 15, marginTop: 4 }} numberOfLines={2}>
        {stat.caption}
      </Text>
    </View>
  );

  const jobsSection = (
    <>
      {openIssueJobs.length > 0 ? issuesEntryCard : null}
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
          {jobStatCards.map(renderStatCard)}
        </View>
      ) : (
        <View style={{ gap: 10, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {jobStatCards.slice(0, 2).map(renderStatCard)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {jobStatCards.slice(2, 4).map(renderStatCard)}
          </View>
        </View>
      )}

      <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', gap: 10, marginBottom: 18 }}>
        <View
          style={{
            height: 44,
            width: isDesktop ? 280 : undefined,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.secondary,
            paddingHorizontal: 14,
          }}
        >
          <Search size={16} color={colors.text.muted} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search jobs"
            placeholderTextColor={colors.text.muted}
            style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 12 }}
            selectionColor={colors.text.primary}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {statusFilterChips.map((chip) => {
            const selected = statusFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setStatusFilter(chip.key)}
                style={{
                  height: 40,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  backgroundColor: selected ? colors.text.primary : colors.bg.card,
                  borderWidth: selected ? 0 : 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: selected ? colors.bg.primary : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{chip.label}</Text>
                {chip.count > 0 ? (
                  <Text style={{ color: selected ? colors.bg.primary : colors.text.muted, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{chip.count}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {sortedJobs.length === 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 28, alignItems: 'center' }}>
          <Glasses size={26} color={colors.text.tertiary} strokeWidth={1.7} />
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 10 }}>No jobs yet</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            Jobs sent to you will show up here.
          </Text>
        </View>
      ) : isDesktop ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'visible', zIndex: statusMenuJobId ? 50 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <Text style={{ color: colors.text.muted, flex: 0.55, minWidth: 76, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>GLASSES</Text>
            <Text style={{ color: colors.text.muted, flex: 0.75, minWidth: 92, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>ORDER</Text>
            <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CUSTOMER NAME</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CATEGORY</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>SERVICE</Text>
            <Text style={{ color: colors.text.muted, flex: 1.3, minWidth: 170, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>JOB DESCRIPTION</Text>
            <Text style={{ color: colors.text.muted, flex: 0.85, minWidth: 105, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>DATE</Text>
            <Text style={{ color: colors.text.muted, flex: 1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 120, paddingRight: 10, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>FEE</Text>
            <Text style={{ color: colors.text.muted, width: 150, paddingLeft: 10, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>ACTION</Text>
          </View>
          {sortedJobs.map((job, index) => {
            const isMenuOpen = statusMenuJobId === job.id;
            const canChangeStatus = data.partnerJobStatuses.length > 0 && job.status !== 'awaiting_dispatch' && job.status !== 'cancelled';
            const statusColor = getStatusColorMeta(job.status, data.statusColors);
            const badgeBg = statusColor.bg;
            const badgeText = statusColor.text;
            const isLocked = job.billStatus === 'approved' || job.billStatus === 'paid';
            const isRowElevated = isMenuOpen;

            return (
              <Pressable
                key={job.id}
                onPress={() => { setStatusMenuJobId(null); setJobStatusExpanded(false); setViewingJobId(job.id); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 56,
                  paddingHorizontal: 18,
                  paddingVertical: 8,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border.light,
                  position: 'relative',
                  zIndex: isRowElevated ? 150 : 1,
                }}
              >
                <View style={{ flex: 0.55, minWidth: 76, paddingRight: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    {job.imageUrl ? (
                      <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Glasses size={20} color={colors.text.tertiary} strokeWidth={1.8} />
                    )}
                  </View>
                </View>

                <View style={{ flex: 0.75, minWidth: 92, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {job.orderNumber ?? job.id.slice(-6).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {job.customerName}
                  </Text>
                </View>

                <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10, alignItems: 'flex-start' }}>
                  {job.jobType ? (
                    <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#3B82F6', 0.12), maxWidth: '100%' }}>
                      <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{job.jobType}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>—</Text>
                  )}
                </View>

                <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10, alignItems: 'flex-start' }}>
                  {job.jobService ? (
                    <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#7E22CE', 0.12), maxWidth: '100%' }}>
                      <Text style={{ color: '#7E22CE', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{job.jobService}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>—</Text>
                  )}
                </View>

                <View style={{ flex: 1.3, minWidth: 170, paddingRight: 10 }}>
                  {job.documentUrl ? (
                    <AttachmentLink url={job.documentUrl} mimeType={job.documentMimeType} color={colors.text.secondary} />
                  ) : (
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} numberOfLines={2}>
                      {job.notes || '—'}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 0.85, minWidth: 105, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                    {job.status === 'awaiting_dispatch' ? '—' : formatDate(job.dispatchedAt ?? job.createdAt)}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 140, paddingRight: 10, position: 'relative', zIndex: isMenuOpen ? 140 : 1 }}>
                  <Pressable
                    disabled={!canChangeStatus}
                    onPress={(e) => { e.stopPropagation(); setStatusMenuJobId(isMenuOpen ? null : job.id); }}
                    style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: badgeBg }}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: badgeText }} />
                    <Text style={{ color: badgeText, fontSize: 12, fontWeight: '600' }}>{statusLabel(job.status)}</Text>
                    {canChangeStatus ? <ChevronDown size={13} color={badgeText} strokeWidth={2.2} /> : null}
                  </Pressable>
                  {isMenuOpen ? (
                    <View style={{ position: 'absolute', top: 30, left: 0, minWidth: 180, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden', zIndex: 220, shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
                      {data.partnerJobStatuses.map((status) => {
                        const selected = status === job.status;
                        const optionColor = getStatusColorMeta(status, data.statusColors);
                        return (
                          <Pressable key={status} onPress={(e) => { e.stopPropagation(); handleSelectStatus(job, status); }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.light, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: optionColor.text }} />
                              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: selected ? '700' : '400' }}>{statusLabel(status)}</Text>
                            </View>
                            {selected ? <Check size={14} color={colors.text.primary} strokeWidth={2.4} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                <View style={{ flex: 0.9, minWidth: 120, paddingRight: 10, alignItems: 'flex-end' }}>
                  {isLocked ? (
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>
                      {job.amount ? formatCurrency(job.amount) : '—'}
                    </Text>
                  ) : (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 8 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>₦</Text>
                      <TextInput
                        value={getFeeDraftValue(job)}
                        onChangeText={(value) => setFeeDrafts((prev) => ({ ...prev, [job.id]: value }))}
                        onBlur={() => handleCommitFee(job)}
                        onSubmitEditing={() => handleCommitFee(job)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                        style={{ width: 64, marginLeft: 4, color: colors.text.primary, fontSize: 12, fontWeight: '600', textAlign: 'right' }}
                      />
                    </Pressable>
                  )}
                </View>

                <View style={{ width: 150, paddingLeft: 10, alignItems: 'flex-end' }}>
                  {canAcceptJob(job) ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); handleRejectJob(job); }}
                        style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(220, 38, 38, 0.1)', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Reject</Text>
                      </Pressable>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); handleAcceptJob(job); }}
                        style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Accept</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {sortedJobs.map((job) => {
            const statusColor = getStatusColorMeta(job.status, data.statusColors);
            const badgeText = statusColor.text;
            const pastDue = isJobPastDue(job);

            return (
              <Pressable
                key={job.id}
                onPress={() => { setJobStatusExpanded(false); setViewingJobId(job.id); }}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 14 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.secondary,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {job.imageUrl ? (
                      <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Glasses size={20} color={colors.text.tertiary} strokeWidth={1.6} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                      {job.customerName}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
                      Order {job.orderNumber ?? job.id.slice(-6).toUpperCase()}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                      {job.itemLabel || job.jobType || 'Job'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: job.amount ? colors.text.primary : colors.text.tertiary, fontSize: 14, fontWeight: '600' }}>
                      {job.amount ? formatCurrency(job.amount) : '—'}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 4 }}>
                      {job.status === 'awaiting_dispatch' ? 'Not sent' : formatDate(job.dispatchedAt ?? job.createdAt)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 22, borderRadius: 999, backgroundColor: hexToRgba(badgeText, 0.12) }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: badgeText }} />
                    <Text style={{ color: badgeText, fontSize: 10, fontWeight: '600' }}>{statusLabel(job.status)}</Text>
                  </View>
                  {pastDue ? (
                    <View style={{ paddingHorizontal: 9, height: 22, borderRadius: 999, backgroundColor: 'rgba(220, 38, 38, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '600' }}>Past due</Text>
                    </View>
                  ) : null}
                </View>

                {canAcceptJob(job) ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); handleRejectJob(job); }}
                      style={{ flex: 1, height: 34, borderRadius: 999, backgroundColor: 'rgba(220, 38, 38, 0.1)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '600' }}>Reject</Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); handleAcceptJob(job); }}
                      style={{ flex: 1, height: 34, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>Accept Job</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  const billsSection = (
    <>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
          <Banknote size={18} color={colors.text.tertiary} strokeWidth={1.8} />
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>
            TOTAL BILLED
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
            {formatCurrency(billSummary.total)}
          </Text>
        </View>
        <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: billSummary.unbilledTotal > 0 ? '#FEF6E0' : '#E6F7EC', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: billSummary.unbilledTotal > 0 ? '#B45309' : '#16A34A' }} />
          </View>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>
            READY TO SUBMIT
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
            {formatCurrency(billSummary.unbilledTotal)}
          </Text>
        </View>
      </View>

      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 16 }}>Your Bills</Text>

      {submittedBills.length === 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 28, alignItems: 'center' }}>
          <Banknote size={26} color={colors.text.tertiary} strokeWidth={1.7} />
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 10 }}>No bills sent yet</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            {billableJobs.length === 0
              ? 'Priced jobs will show up here, ready to bill.'
              : billingCycle === 'manual'
                ? 'Tap New Bill to send your priced jobs.'
                : 'Use Send Bill above to submit a period.'}
          </Text>
        </View>
      ) : isDesktop ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <Text style={{ color: colors.text.muted, flex: 1, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>SUBMITTED</Text>
            <Text style={{ color: colors.text.muted, flex: 0.8, minWidth: 90, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>JOBS</Text>
            <Text style={{ color: colors.text.muted, flex: 1, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
            <Text style={{ color: colors.text.muted, flex: 2, minWidth: 200, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>NOTE FROM BUSINESS</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 120, paddingRight: 24, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>TOTAL</Text>
          </View>
          {submittedBills.map((bill, index) => {
            const meta = BILL_STATUS_META[bill.status] ?? BILL_STATUS_META.pending;
            return (
              <Pressable
                key={bill.billId}
                onPress={() => setViewingBillId(bill.billId)}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
              >
                <View style={{ flex: 1, minWidth: 110, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{formatDate(bill.submittedAt)}</Text>
                </View>
                <View style={{ flex: 0.8, minWidth: 90, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 110, paddingRight: 10 }}>
                  <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: meta.text, fontSize: 10, fontWeight: '600' }}>{meta.label}</Text>
                  </View>
                </View>
                <View style={{ flex: 2, minWidth: 200, paddingRight: 10 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }} numberOfLines={2}>{bill.note || '—'}</Text>
                </View>
                <View style={{ flex: 0.9, minWidth: 120, paddingRight: 24, alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{formatCurrency(bill.total)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {submittedBills.map((bill) => {
            const meta = BILL_STATUS_META[bill.status] ?? BILL_STATUS_META.pending;
            return (
              <Pressable
                key={bill.billId}
                onPress={() => setViewingBillId(bill.billId)}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 14 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{formatCurrency(bill.total)}</Text>
                  <View style={{ paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: meta.text, fontSize: 10, fontWeight: '600' }}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'} · Sent {formatDate(bill.submittedAt)}
                </Text>
                {bill.note ? (
                  <View style={{ marginTop: 8, borderRadius: 10, backgroundColor: colors.bg.secondary, padding: 10 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{bill.note}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  const recentJobsCard = (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Recent Jobs</Text>
          <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 1 }}>Last {recentJobs.length} {recentJobs.length === 1 ? 'job' : 'jobs'}</Text>
        </View>
        <Pressable onPress={() => setActiveSection('jobs')} style={{ flexDirection: 'row', alignItems: 'center', gap: 1, paddingVertical: 4, paddingLeft: 8 }}>
          <Text style={{ color: colors.text.primary, fontSize: 10, fontWeight: '600' }}>View All</Text>
          <ChevronRight size={12} color={colors.text.primary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {recentJobs.length === 0 ? (
        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 14 }}>No jobs yet.</Text>
      ) : (
        recentJobs.map((job, jobIndex) => {
          const statusColor = getStatusColorMeta(job.status, data.statusColors);
          return (
            <Pressable
              key={job.id}
              onPress={() => setViewingJobId(job.id)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderTopWidth: jobIndex === 0 ? 0 : 1, borderTopColor: colors.border.light, marginTop: jobIndex === 0 ? 8 : 0 }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                  {job.customerName}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
                  {job.jobType || job.itemLabel || 'Job'} · {formatDate(job.dispatchedAt ?? job.createdAt)}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 999, backgroundColor: hexToRgba(statusColor.text, 0.12) }}>
                <Text style={{ color: statusColor.text, fontSize: 10, fontWeight: '600', lineHeight: 26 }} numberOfLines={1}>{statusLabel(job.status)}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );

  const homeSection = (
    <>
      {openIssueJobs.length > 0 ? issuesEntryCard : null}

      {jobStats.pastDueCount > 0 ? (
        <Pressable
          onPress={() => setActiveSection('jobs')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: 'rgba(220, 38, 38, 0.3)',
            backgroundColor: hexToRgba('#DC2626', 0.1),
            padding: 16,
            marginBottom: 20,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: hexToRgba('#DC2626', 0.16), alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} color="#DC2626" strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '700' }}>
              {jobStats.pastDueCount} {jobStats.pastDueCount === 1 ? 'job is' : 'jobs are'} past due
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {pastDueJobs[0]?.customerName ? `${pastDueJobs[0].customerName} sent ${formatDate(pastDueJobs[0].dispatchedAt ?? pastDueJobs[0].createdAt)}` : 'Sent more than 7 days ago and still waiting on you'}
            </Text>
          </View>
          <ChevronRight size={18} color="#DC2626" strokeWidth={2} />
        </Pressable>
      ) : null}

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>Total Billed</Text>
        </View>
        <Text style={{ color: colors.text.primary, fontSize: 40, fontWeight: '700', marginTop: 10 }}>
          {formatCurrency(thisMonthBillSummary.total)}
        </Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 4 }}>This month</Text>

        <View style={{ height: 1, backgroundColor: colors.border.light, marginVertical: 14 }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600' }}>Pending</Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
              {formatCurrency(thisMonthBillSummary.pending)}
            </Text>
          </View>
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600' }}>Approved</Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
              {formatCurrency(thisMonthBillSummary.approved)}
            </Text>
          </View>
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600' }}>Paid</Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
              {formatCurrency(thisMonthBillSummary.paid)}
            </Text>
          </View>
        </View>
      </View>

      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
          {jobStatCards.map(renderStatCard)}
        </View>
      ) : (
        <View style={{ gap: 10, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {jobStatCards.slice(0, 2).map(renderStatCard)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {jobStatCards.slice(2, 4).map(renderStatCard)}
          </View>
        </View>
      )}

      {jobsByWeek.some((w) => w.value > 0) ? (
        <View style={{ marginBottom: 14 }}>
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>Jobs by Week</Text>
            <InteractiveLineChart
              data={jobsByWeek}
              height={140}
              lineColor={colors.text.primary}
              gridColor={colors.border.light}
              textColor={colors.text.tertiary}
              maxXLabels={4}
              paddingLeft={isDesktop ? 52 : 30}
            />
          </View>
        </View>
      ) : null}

      {!isDesktop ? recentJobsCard : null}

      {weeklyCategoryBreakdown.length > 0 || weeklyServiceBreakdown.length > 0 ? (
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 14, marginBottom: 14 }}>
          {weeklyCategoryBreakdown.length > 0 ? (
            <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>Jobs by Category (This Week)</Text>
              <HorizontalBarChart
                data={weeklyCategoryBreakdown}
                barColor={colors.text.primary}
                backgroundColor={colors.bg.secondary}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                showPercentage={false}
              />
            </View>
          ) : null}

          {weeklyServiceBreakdown.length > 0 ? (
            <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>Jobs by Service (This Week)</Text>
              <HorizontalBarChart
                data={weeklyServiceBreakdown}
                barColor={colors.text.primary}
                backgroundColor={colors.bg.secondary}
                textColor={colors.text.primary}
                secondaryTextColor={colors.text.tertiary}
                showPercentage={false}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {isDesktop ? recentJobsCard : null}

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Pending Bills</Text>
            <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 1 }} numberOfLines={1}>Awaiting review from {data.businessName}</Text>
          </View>
          <Pressable onPress={() => setActiveSection('bills')} style={{ flexDirection: 'row', alignItems: 'center', gap: 1, paddingVertical: 4, paddingLeft: 8 }}>
            <Text style={{ color: colors.text.primary, fontSize: 10, fontWeight: '600' }}>View All</Text>
            <ChevronRight size={12} color={colors.text.primary} strokeWidth={2.2} />
          </Pressable>
        </View>

        {pendingBillsForHome.length === 0 ? (
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 14 }}>No pending bills.</Text>
        ) : (
          pendingBillsForHome.map((bill, billIndex) => (
            <Pressable
              key={bill.billId}
              onPress={() => setViewingBillId(bill.billId)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderTopWidth: billIndex === 0 ? 0 : 1, borderTopColor: colors.border.light, marginTop: billIndex === 0 ? 8 : 0 }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                  {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', marginTop: 2 }}>
                  Submitted {formatDate(bill.submittedAt)}
                </Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{formatCurrency(bill.total)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </>
  );

  const insightsRangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: '7 Days' },
    { key: 'month', label: 'This Month' },
    { key: '30d', label: '30 Days' },
    { key: 'year', label: 'This Year' },
  ];

  const issuesSection = (
    <>
      {openIssueJobs.length === 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 28, alignItems: 'center' }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>No open issues</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            Jobs {data.businessName} flags with a problem will show up here, with payment held until it's resolved.
          </Text>
        </View>
      ) : isDesktop ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CUSTOMER NAME</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CATEGORY</Text>
            <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>SERVICE</Text>
            <Text style={{ color: colors.text.muted, flex: 1.8, minWidth: 220, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>ISSUE DESCRIPTION</Text>
            <Text style={{ color: colors.text.muted, width: 90, paddingLeft: 10, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>STATUS</Text>
          </View>
          {openIssueJobs.map((job, index) => (
            <Pressable
              key={job.id}
              onPress={() => setViewingJobId(job.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 56,
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border.light,
              }}
            >
              <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                  {job.customerName}
                </Text>
              </View>
              <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                  {job.jobType || '—'}
                </Text>
              </View>
              <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                  {job.jobService || '—'}
                </Text>
              </View>
              <View style={{ flex: 1.8, minWidth: 220, paddingRight: 10 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={2}>
                  {job.openIssueDescription || 'The business flagged a problem with this job.'}
                </Text>
              </View>
              <View style={{ width: 90, paddingLeft: 10, alignItems: 'flex-end' }}>
                <View style={{ paddingHorizontal: 9, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#DC2626', 0.14) }}>
                  <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '600' }}>Open</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {openIssueJobs.map((job) => (
            <Pressable
              key={job.id}
              onPress={() => setViewingJobId(job.id)}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.3)', backgroundColor: hexToRgba('#DC2626', 0.06), padding: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {job.customerName}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                    {job.jobType || '—'} • {job.jobService || '—'}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 9, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#DC2626', 0.14) }}>
                  <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '600' }}>Open</Text>
                </View>
              </View>
              <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 17, marginTop: 8 }} numberOfLines={3}>
                {job.openIssueDescription || 'The business flagged a problem with this job.'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );

  const insightsSection = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row' }}>
          {insightsRangeOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setInsightsRange(option.key)}
              style={{
                marginRight: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: insightsRange === option.key ? colors.text.primary : colors.bg.card,
                borderWidth: 1,
                borderColor: insightsRange === option.key ? colors.text.primary : colors.border.light,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: insightsRange === option.key ? colors.bg.primary : colors.text.tertiary,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Total Jobs', value: String(insightsStats.totalJobs) },
          { label: 'Total Revenue', value: formatCurrency(insightsStats.totalRevenue) },
          { label: 'Avg Job Value', value: formatCurrency(insightsStats.avgJobValue) },
          { label: 'Completed Jobs', value: String(insightsStats.completedJobs) },
        ].map((stat) => (
          <View
            key={stat.label}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              padding: 16,
            }}
          >
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>{stat.label}</Text>
            <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700', marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>

      {insightsJobsChart.data.some((m) => m.value > 0) ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>{insightsJobsChart.title}</Text>
          <SalesBarChart
            data={insightsJobsChart.data}
            height={160}
            barColor={colors.text.primary}
            gridColor={colors.border.light}
            textColor={colors.text.tertiary}
            paddingLeft={isDesktop ? 50 : 30}
          />
        </View>
      ) : null}

      {insightsRangeJobs.length > 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>{insightsRevenueChart.title}</Text>
          <SalesBarChart
            data={insightsRevenueChart.data}
            height={160}
            barColor={colors.text.primary}
            gridColor={colors.border.light}
            textColor={colors.text.tertiary}
            paddingLeft={isDesktop ? 50 : 30}
          />
        </View>
      ) : null}

      {categoryBreakdown.length > 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>Jobs by Category</Text>
          <HorizontalBarChart
            data={categoryBreakdown}
            barColor={colors.text.primary}
            backgroundColor={colors.bg.secondary}
            textColor={colors.text.primary}
            secondaryTextColor={colors.text.tertiary}
            showPercentage={false}
          />
        </View>
      ) : null}

      {serviceBreakdown.length > 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>Jobs by Service</Text>
          <HorizontalBarChart
            data={serviceBreakdown}
            barColor={colors.text.primary}
            backgroundColor={colors.bg.secondary}
            textColor={colors.text.primary}
            secondaryTextColor={colors.text.tertiary}
            showPercentage={false}
          />
        </View>
      ) : null}

      {topServices.length > 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <DollarSign size={18} color={colors.text.tertiary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', marginLeft: 8 }}>Top Services</Text>
            </View>
            <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
          </View>
          {topServices.map((service, index) => (
            <View
              key={service.name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: index < topServices.length - 1 ? 1 : 0,
                borderBottomColor: colors.border.light,
              }}
            >
              <View>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{service.name}</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>{service.count} {service.count === 1 ? 'job' : 'jobs'}</Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>{formatCurrency(service.revenue)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {insightsJobsChart.data.every((m) => m.value === 0) && insightsRevenueChart.data.every((w) => w.value === 0) && categoryBreakdown.length === 0 && serviceBreakdown.length === 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 28, alignItems: 'center' }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>No data yet</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            Once jobs come in with a category or service, you'll see trends here.
          </Text>
        </View>
      ) : null}
    </>
  );

  const accountSection = (
    <View style={{ width: '100%', maxWidth: isDesktop ? 500 : undefined, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}>
      <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 4 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
          <User size={30} color={colors.text.tertiary} strokeWidth={1.8} />
        </View>
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 12 }}>{data.partnerName}</Text>
        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>Partner account</Text>
      </View>

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden', marginBottom: 16 }}>
        {[
          ...(data.email ? [{ label: 'Email', value: data.email }] : []),
          { label: 'Business', value: data.businessName },
          { label: 'Billing cycle', value: billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1) },
        ].map((row, rowIndex) => (
          <View
            key={row.label}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: rowIndex === 0 ? 0 : 1, borderTopColor: colors.border.light }}
          >
            <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            {appearanceMode === 'system' ? (
              <Laptop size={17} color="#6366F1" strokeWidth={2} />
            ) : isDarkMode ? (
              <Moon size={17} color="#8B5CF6" strokeWidth={2} />
            ) : (
              <Sun size={17} color="#F59E0B" strokeWidth={2} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Appearance</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
              {appearanceMode === 'system'
                ? `Following device: ${isDarkMode ? 'Dark' : 'Light'}`
                : `Manually set: ${appearanceMode === 'dark' ? 'Dark' : 'Light'}`}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, padding: 4, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
          {([{ mode: 'system', label: 'System' }, { mode: 'light', label: 'Light' }, { mode: 'dark', label: 'Dark' }] as { mode: ThemeMode; label: string }[]).map((option) => {
            const selected = appearanceMode === option.mode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => setAppearanceMode(option.mode)}
                style={{ flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.bg.card : 'transparent', borderWidth: selected ? 1 : 0, borderColor: colors.border.light }}
              >
                <Text style={{ color: selected ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === 'session' ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Bell size={17} color={colors.text.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Notifications</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                Enable push, then test it reaches this device
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleEnablePartnerNotifications}
            disabled={notificationEnableStatus === 'loading'}
            style={{
              height: 40,
              borderRadius: 999,
              backgroundColor: colors.text.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              opacity: notificationEnableStatus === 'loading' ? 0.65 : 1,
            }}
          >
            {notificationEnableStatus === 'loading' ? (
              <ActivityIndicator size="small" color={colors.bg.primary} />
            ) : (
              <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>
                {notificationEnableStatus === 'enabled' ? 'Notifications enabled' : 'Enable Notifications'}
              </Text>
            )}
          </Pressable>
          {notificationEnableStatus === 'blocked' ? (
            <Text style={{ color: '#DC2626', fontSize: 10, marginBottom: 10, lineHeight: 14 }}>
              Permission did not open or was blocked. Check this browser's notification settings, then try again.
            </Text>
          ) : !isPushReady ? (
            <Text style={{ color: colors.text.tertiary, fontSize: 10, marginBottom: 10, lineHeight: 14 }}>
              Notifications are still loading. Try again in a few seconds.
            </Text>
          ) : null}
          <Text style={{ color: colors.text.tertiary, fontSize: 10, marginBottom: 10, lineHeight: 14 }}>
            On iPhone: add this page to your Home Screen first (Share → Add to Home Screen), then open it from that icon — iOS only allows notifications for installed apps, not Safari tabs.
          </Text>
          <Pressable
            onPress={async () => {
              setTestPushStatus('sending');
              try {
                await sendPartnerTestPush();
                setTestPushStatus('sent');
              } catch {
                setTestPushStatus('error');
              }
              setTimeout(() => setTestPushStatus('idle'), 4000);
            }}
            disabled={testPushStatus === 'sending'}
            style={{ height: 40, borderRadius: 999, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', opacity: testPushStatus === 'sending' ? 0.6 : 1 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
              {testPushStatus === 'sending' ? 'Sending…' : testPushStatus === 'sent' ? 'Sent — check your notifications' : testPushStatus === 'error' ? 'Failed to send' : 'Send test notification'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {mode === 'session' ? (
        <Pressable
          onPress={async () => {
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch (error) {
              console.warn('Partner sign out failed:', error);
            }
            router.replace('/partner-login');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light }}
        >
          <LogOut size={16} color={colors.text.primary} strokeWidth={2} />
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Log out</Text>
        </Pressable>
      ) : (
        <Pressable
          disabled
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, opacity: 0.4 }}
        >
          <LogOut size={16} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={{ color: colors.text.tertiary, fontSize: 14, fontWeight: '600' }}>Log out</Text>
        </Pressable>
      )}

      <View style={{ alignItems: 'center', marginTop: 32 }}>
        <SvgXml xml={FYLL_LOGO_XML(colors.text.tertiary)} width={48} height={16} />
      </View>
    </View>
  );

  const sectionTitle: Record<PortalSection, string> = { home: 'Home', jobs: 'Jobs', bills: 'Bills', issues: 'Issues', insights: 'Insights', account: 'Account' };
  const sectionSubtitle: Record<PortalSection, string> = {
    home: `Your work with ${data.businessName}.`,
    jobs: `Work sent to you by ${data.businessName}.`,
    bills: `Your bill history with ${data.businessName}.`,
    issues: `Jobs ${data.businessName} has flagged with a problem.`,
    insights: 'Your job trends by category, service, and month.',
    account: 'Your partner account details.',
  };
  const hideHeaderNotificationsOnMobile = activeSection === 'jobs' || activeSection === 'bills' || activeSection === 'insights' || activeSection === 'account';
  const showHeaderNotifications = isDesktop || !hideHeaderNotificationsOnMobile;

  const content = (
    <ScrollView
      style={{ flex: 1, width: '100%' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.text.primary} />}
      contentContainerStyle={{ padding: isDesktop ? 28 : 20, paddingBottom: isDesktop ? 28 : insets.bottom + 160, maxWidth: isDesktop ? 1500 : undefined, width: '100%', alignSelf: isDesktop ? 'flex-start' : 'stretch' }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, position: 'relative', zIndex: 500 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {activeSection !== 'home' ? (
            <>
              <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }}>
                {sectionTitle[activeSection]}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                {sectionSubtitle[activeSection]}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>Welcome back</Text>
              <Text style={{ color: colors.text.primary, fontSize: 32, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                {data.partnerName}
              </Text>
            </>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, position: 'relative', zIndex: 500 }}>
          {activeSection === 'account' ? (
            <Pressable
              onPress={() => refetch()}
              disabled={isRefetching}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                paddingHorizontal: 12,
                opacity: isRefetching ? 0.65 : 1,
              }}
            >
              {isRefetching ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <RefreshCw size={15} color={colors.text.primary} strokeWidth={2} />
              )}
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                {isRefetching ? 'Refreshing' : 'Refresh'}
              </Text>
            </Pressable>
          ) : null}
          {showHeaderNotifications ? (
          <View style={{ position: 'relative', zIndex: 500 }}>
            <Pressable
              onPress={handleOpenNotifDropdown}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bell size={17} color={colors.text.primary} strokeWidth={2} />
              {unreadNotifCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    backgroundColor: '#DC2626',
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            {showNotifDropdown ? (
              <>
                <Pressable
                  onPress={() => setShowNotifDropdown(false)}
                  style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 44,
                    right: 0,
                    width: isDesktop ? 340 : 300,
                    maxHeight: 400,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.card,
                    shadowColor: '#000000',
                    shadowOpacity: 0.15,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 12,
                    zIndex: 999,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>Notifications</Text>
                  </View>
                  <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                    {partnerNotifications.length === 0 ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>No notifications yet</Text>
                      </View>
                    ) : (
                      partnerNotifications.map((n, index) => (
                        <Pressable
                          key={n.id}
                          onPress={() => {
                            setShowNotifDropdown(false);
                            setViewingJobId(n.job.id);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 10,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: index < partnerNotifications.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border.light,
                          }}
                        >
                          <View
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              backgroundColor: n.kind === 'past_due' ? hexToRgba('#DC2626', 0.14) : colors.bg.secondary,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {n.kind === 'dispatched' ? (
                              <Briefcase size={14} color={colors.text.primary} strokeWidth={2} />
                            ) : n.kind === 'past_due' ? (
                              <AlertTriangle size={14} color="#DC2626" strokeWidth={2} />
                            ) : (
                              <Banknote size={14} color={colors.text.primary} strokeWidth={2} />
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: n.kind === 'past_due' ? '#DC2626' : colors.text.primary, fontSize: 12.5, fontWeight: '600' }} numberOfLines={2}>
                              {n.kind === 'dispatched'
                                ? `New job: ${n.job.customerName || 'a customer'}`
                                : n.kind === 'past_due'
                                  ? `Past due: ${n.job.customerName || 'a customer'}`
                                  : `Bill ${n.job.billStatus ?? 'reviewed'}: ${n.job.customerName || 'a customer'}`}
                            </Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }}>
                              {n.kind === 'past_due' ? 'Sent more than 7 days ago' : formatDate(n.timestamp)}
                            </Text>
                          </View>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              </>
            ) : null}
          </View>
          ) : null}

          {activeSection === 'bills' ? (
            <Pressable
              onPress={() => handleOpenNewBillModal(billableJobs)}
              disabled={billableJobs.length === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                height: 38,
                borderRadius: 999,
                paddingHorizontal: 16,
                backgroundColor: billableJobs.length === 0 ? '#E5E7EB' : '#000000',
              }}
            >
              <Plus size={15} color={billableJobs.length === 0 ? '#6B7280' : '#FFFFFF'} strokeWidth={2.4} />
              <Text style={{ color: billableJobs.length === 0 ? '#6B7280' : '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                New Bill
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {activeSection === 'home' ? homeSection : activeSection === 'jobs' ? jobsSection : activeSection === 'bills' ? billsSection : activeSection === 'issues' ? issuesSection : activeSection === 'insights' ? insightsSection : accountSection}
    </ScrollView>
  );

  const mobileNavItems: { key: PortalSection; label: string; icon: typeof Home }[] = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'jobs', label: 'Jobs', icon: Briefcase },
    { key: 'bills', label: 'Bills', icon: Banknote },
    { key: 'insights', label: 'Insights', icon: BarChart3 },
    { key: 'account', label: 'Account', icon: User },
  ];

  const mobileFloatingNav = (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: (insets.bottom || 12) + 28, alignItems: 'center' }} pointerEvents="box-none">
      <BlurView
        intensity={60}
        tint={isDarkMode ? 'dark' : 'light'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
          overflow: 'hidden',
          paddingHorizontal: 8,
          paddingVertical: 8,
          shadowColor: '#000000',
          shadowOpacity: 0.04,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        {mobileNavItems.map((item) => {
          const active = activeSection === item.key;
          const Icon = item.icon;
          const badgeCount = item.key === 'issues' ? openIssueJobs.length : item.key === 'jobs' ? newJobsCount : 0;
          return (
            <Pressable
              key={item.key}
              onPress={() => setActiveSection(item.key)}
              style={{
                width: 68,
                height: 60,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? (isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)') : 'transparent',
              }}
            >
              <View>
                <Icon size={22} color={active ? colors.text.primary : colors.text.tertiary} strokeWidth={2} />
                {badgeCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' }}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ marginTop: 4, fontSize: 10, fontWeight: '700', color: active ? colors.text.primary : colors.text.tertiary }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );

  const renderBillJobRow = (job: PartnerPortalJob) => {
    const selected = selectedBillJobIds.has(job.id);
    return (
      <Pressable
        key={job.id}
        onPress={() => toggleBillJobSelection(job.id)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: selected ? colors.bg.secondary : 'transparent',
          padding: 10,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 1.5,
            borderColor: selected ? '#E0E0E0' : colors.border.light,
            backgroundColor: selected ? '#FFFFFF' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check size={15} color="#000000" strokeWidth={3} /> : null}
        </View>
        <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {job.imageUrl ? (
            <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Glasses size={20} color={colors.text.tertiary} strokeWidth={1.8} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
            {job.customerName}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {job.jobType || job.itemLabel || 'No glasses name'}
          </Text>
        </View>
        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>
          {formatCurrency(job.amount ?? 0)}
        </Text>
      </Pressable>
    );
  };

  const billPeriodChips: { key: SimplePeriod; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'year', label: 'This year' },
  ];

  const newBillModal = (
    <Modal visible={showNewBillModal} transparent animationType="none" onRequestClose={() => { setShowNewBillModal(false); setEditingBillId(null); }}>
      {isDesktop ? (
        <Pressable
          onPress={() => { setShowNewBillModal(false); setEditingBillId(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, maxHeight: '86%', borderRadius: 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}
          >
            <View style={{ paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{editingBillId ? 'Edit Bill' : 'New Bill'}</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                {editingBillId
                  ? "Add or remove jobs while the business hasn't reviewed this bill yet."
                  : "Everything's checked by default. Uncheck anything you don't want to send yet."}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 14, gap: 8 }} showsVerticalScrollIndicator={false}>
              {newBillJobPool.map(renderBillJobRow)}
            </ScrollView>

            <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
                  {selectedBillJobIds.size} {selectedBillJobIds.size === 1 ? 'job' : 'jobs'} selected
                </Text>
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                  {formatCurrency(selectedBillTotal)}
                </Text>
              </View>
              <Pressable
                onPress={handleConfirmNewBill}
                disabled={submitBillMutation.isPending || updateBillJobsMutation.isPending || selectedBillJobIds.size === 0}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: selectedBillJobIds.size === 0 ? colors.bg.secondary : colors.text.primary,
                  opacity: (submitBillMutation.isPending || updateBillJobsMutation.isPending) ? 0.6 : 1,
                }}
              >
                {submitBillMutation.isPending || updateBillJobsMutation.isPending ? (
                  <ActivityIndicator color={colors.bg.primary} size="small" />
                ) : !editingBillId ? (
                  <Send size={15} color={selectedBillJobIds.size === 0 ? colors.text.tertiary : colors.bg.primary} strokeWidth={2.2} />
                ) : null}
                <Text style={{ color: selectedBillJobIds.size === 0 ? colors.text.tertiary : colors.bg.primary, fontSize: 14, fontWeight: '700' }}>
                  {editingBillId ? 'Save Changes' : 'Send Bill'}
                </Text>
              </Pressable>
              <Pressable onPress={() => { setShowNewBillModal(false); setEditingBillId(null); }} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <Pressable
              onPress={() => { setShowNewBillModal(false); setEditingBillId(null); }}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{editingBillId ? 'Edit Bill' : 'New Bill'}</Text>
            <View style={{ width: 34 }} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          >
            {billPeriodChips.map((chip) => {
              const selected = newBillFilterPeriod === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => setNewBillFilterPeriod(chip.key)}
                  style={{ height: 34, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.text.primary : colors.bg.secondary }}
                >
                  <Text style={{ color: selected ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>{chip.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }} showsVerticalScrollIndicator={false}>
            {visibleNewBillJobPool.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>No jobs in this period.</Text>
              </View>
            ) : (
              visibleNewBillJobPool.map(renderBillJobRow)
            )}
          </ScrollView>

          <View style={{ padding: 18, paddingBottom: insets.bottom + 130, borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
                {selectedBillJobIds.size} {selectedBillJobIds.size === 1 ? 'job' : 'jobs'} selected
              </Text>
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                {formatCurrency(selectedBillTotal)}
              </Text>
            </View>
            <Pressable
              onPress={handleConfirmNewBill}
              disabled={submitBillMutation.isPending || updateBillJobsMutation.isPending || selectedBillJobIds.size === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                height: 48,
                borderRadius: 999,
                backgroundColor: selectedBillJobIds.size === 0 ? colors.bg.secondary : colors.text.primary,
                opacity: (submitBillMutation.isPending || updateBillJobsMutation.isPending) ? 0.6 : 1,
              }}
            >
              {submitBillMutation.isPending || updateBillJobsMutation.isPending ? (
                <ActivityIndicator color={colors.bg.primary} size="small" />
              ) : !editingBillId ? (
                <Send size={15} color={selectedBillJobIds.size === 0 ? colors.text.tertiary : colors.bg.primary} strokeWidth={2.2} />
              ) : null}
              <Text style={{ color: selectedBillJobIds.size === 0 ? colors.text.tertiary : colors.bg.primary, fontSize: 14, fontWeight: '700' }}>
                {editingBillId ? 'Save Changes' : 'Send Bill'}
              </Text>
            </Pressable>
          </View>

          {mobileFloatingNav}
        </View>
      )}
    </Modal>
  );

  const viewingBillStatusMeta = viewingBill ? (BILL_STATUS_META[viewingBill.status] ?? BILL_STATUS_META.pending) : null;

  const billDetailsPanel = (
    <Modal visible={!!viewingBillId} transparent animationType="none" onRequestClose={() => setViewingBillId(null)}>
      <Pressable
        onPress={() => setViewingBillId(null)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', flexDirection: 'row', justifyContent: isDesktop ? 'flex-end' : undefined }}
      >
        {viewingBill && viewingBillStatusMeta ? (
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: isDesktop ? 420 : '100%',
              height: '100%',
              backgroundColor: colors.bg.primary,
              borderLeftWidth: isDesktop ? 1 : 0,
              borderLeftColor: colors.border.light,
            }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: isDesktop ? 20 : insets.top + 16, paddingBottom: isDesktop ? 24 : insets.bottom + 240 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 18 }}>
                <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }}>Bill Details</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {viewingBill.status === 'pending' ? (
                    <Pressable
                      onPress={() => {
                        const billId = viewingBill.billId;
                        setViewingBillId(null);
                        handleOpenEditBillModal(billId);
                      }}
                      style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Edit</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setViewingBillId(null)}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={16} color={colors.text.primary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
                    {data.businessName}
                  </Text>
                  <View style={{ paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: viewingBillStatusMeta.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: viewingBillStatusMeta.text, fontSize: 10, fontWeight: '600' }}>{viewingBillStatusMeta.label}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 40, fontWeight: '700', marginTop: 8 }}>
                  {formatCurrency(viewingBill.total)}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                  {viewingBill.jobCount} {viewingBill.jobCount === 1 ? 'job' : 'jobs'} · Submitted {formatDate(viewingBill.submittedAt)}
                </Text>
              </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, marginBottom: 16, overflow: 'hidden' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                  DETAILS
                </Text>
                {[
                  { label: 'Submitted', value: formatDate(viewingBill.submittedAt) },
                  { label: 'Status', value: viewingBillStatusMeta.label },
                  ...(viewingBill.respondedAt ? [{ label: 'Responded', value: formatDate(viewingBill.respondedAt) }] : []),
                  ...(viewingBill.paidAt ? [{ label: 'Paid', value: formatDate(viewingBill.paidAt) }] : []),
                ].map((row, rowIndex) => (
                  <View
                    key={row.label}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: rowIndex === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{row.label}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{row.value}</Text>
                  </View>
                ))}
                {viewingBill.note ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border.light }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 4 }}>Note from business</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, lineHeight: 18 }}>{viewingBill.note}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                  {viewingBill.jobCount} {viewingBill.jobCount === 1 ? 'JOB' : 'JOBS'}
                </Text>
                {viewingBill.jobs.map((job, jobIndex) => (
                  <View
                    key={job.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: jobIndex === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {job.imageUrl ? (
                        <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Glasses size={17} color={colors.text.tertiary} strokeWidth={1.8} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                        {job.customerName}
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {job.jobType || job.itemLabel || 'Job'} · {job.orderNumber ?? job.id.slice(-6).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>
                      {formatCurrency(job.amount ?? 0)}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            {!isDesktop ? mobileFloatingNav : null}
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );

  const jobDetailsPanel = (() => {
    if (!viewingJob) {
      return (
        <Modal visible={!!viewingJobId} transparent animationType="none" onRequestClose={() => setViewingJobId(null)}>
          <Pressable onPress={() => setViewingJobId(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)' }} />
        </Modal>
      );
    }

    const job = viewingJob;
    const statusColor = getStatusColorMeta(job.status, data.statusColors);
    const canChangeStatus = data.partnerJobStatuses.length > 0 && job.status !== 'awaiting_dispatch' && job.status !== 'cancelled';
    const isLocked = job.billStatus === 'approved' || job.billStatus === 'paid';
    const billMeta = job.billId ? (BILL_STATUS_META[job.billStatus ?? 'pending'] ?? BILL_STATUS_META.pending) : null;
    const showAcceptReject = canAcceptJob(job);
    const isImageAttachment = job.documentMimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(job.documentUrl ?? '');

    type ActivityEntry = { label: string; at: string; actor: 'Business' | 'Partner' };
    const activityEntries: ActivityEntry[] = ([
      job.createdAt ? { label: 'Job created', at: job.createdAt, actor: 'Business' } : null,
      job.dispatchedAt ? { label: 'Sent to partner', at: job.dispatchedAt, actor: 'Business' } : null,
      job.acceptedAt ? { label: 'Accepted by partner', at: job.acceptedAt, actor: 'Partner' } : null,
      job.rejectedAt ? { label: 'Rejected by partner', at: job.rejectedAt, actor: 'Partner' } : null,
      job.readyAt ? { label: 'Marked ready', at: job.readyAt, actor: 'Partner' } : null,
      job.collectedAt ? { label: 'Collected by business', at: job.collectedAt, actor: 'Business' } : null,
      job.billSubmittedAt ? { label: 'Bill submitted', at: job.billSubmittedAt, actor: 'Partner' } : null,
      job.billRespondedAt
        ? {
            label: job.billStatus === 'approved' ? 'Bill approved' : job.billStatus === 'rejected' ? 'Bill rejected' : job.billStatus === 'queried' ? 'Bill queried' : 'Bill reviewed',
            at: job.billRespondedAt,
            actor: 'Business',
          }
        : null,
      job.billPaidAt ? { label: 'Bill paid', at: job.billPaidAt, actor: 'Business' } : null,
      job.billedAt ? { label: 'Marked billed', at: job.billedAt, actor: 'Business' } : null,
    ].filter(Boolean) as ActivityEntry[]).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return (
      <Modal visible={!!viewingJobId} transparent animationType="none" onRequestClose={() => setViewingJobId(null)}>
        <Pressable
          onPress={() => setViewingJobId(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', flexDirection: 'row', justifyContent: isDesktop ? 'flex-end' : undefined }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: isDesktop ? 420 : '100%',
              height: '100%',
              backgroundColor: colors.bg.primary,
              borderLeftWidth: isDesktop ? 1 : 0,
              borderLeftColor: colors.border.light,
            }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: isDesktop ? 20 : insets.top + 16, paddingBottom: isDesktop ? 24 : insets.bottom + 170 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 18 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>Job details</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {job.orderNumber ?? `JOB-${job.id.slice(-6).toUpperCase()}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setViewingJobId(null)}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={16} color={colors.text.primary} strokeWidth={2.2} />
                </Pressable>
              </View>

              {showAcceptReject ? (
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 }}>
                  <Pressable
                    onPress={() => handleRejectJob(job)}
                    style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: 'rgba(220, 38, 38, 0.1)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Reject Job</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleAcceptJob(job)}
                    style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Accept Job</Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', paddingHorizontal: 20, marginBottom: 10 }}>
                {job.status === 'awaiting_dispatch' ? 'Not sent yet' : `Sent ${formatDate(job.dispatchedAt ?? job.createdAt)}`}
              </Text>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable
                  onPress={() => job.imageUrl && setLightboxImageUrl(job.imageUrl)}
                  disabled={!job.imageUrl}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.secondary,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {job.imageUrl ? (
                    <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Glasses size={28} color={colors.text.tertiary} strokeWidth={1.6} />
                  )}
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>Item</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 3 }} numberOfLines={2}>
                    {job.itemLabel || job.jobType || 'No item name'}
                  </Text>
                </View>
              </View>

              {job.hasOpenIssue ? (
                <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.3)', backgroundColor: hexToRgba('#DC2626', 0.08), padding: 16, marginBottom: 16 }}>
                  <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '700', marginBottom: 6 }}>Issue reported — payment on hold</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 12.5, lineHeight: 18 }}>
                    {job.openIssueDescription || 'The business flagged a problem with this job. It will be excluded from billing until resolved.'}
                  </Text>
                </View>
              ) : null}

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, marginBottom: 16, overflow: 'hidden' }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                  Update Status
                </Text>
                <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                  <Pressable
                    disabled={!canChangeStatus}
                    onPress={() => setJobStatusExpanded((prev) => !prev)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderRadius: 999, paddingHorizontal: 14, backgroundColor: hexToRgba(statusColor.text, 0.12) }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: hexToRgba(statusColor.text, 0.2), alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor.text }} />
                      </View>
                      <View>
                        <Text style={{ color: statusColor.text, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 }}>Current Status</Text>
                        <Text style={{ color: statusColor.text, fontSize: 12, fontWeight: '600', marginTop: 1 }}>{statusLabel(job.status)}</Text>
                      </View>
                    </View>
                    {canChangeStatus ? (
                      <ChevronDown
                        size={16}
                        color={statusColor.text}
                        strokeWidth={2.2}
                        style={{ transform: [{ rotate: jobStatusExpanded ? '180deg' : '0deg' }] }}
                      />
                    ) : null}
                  </Pressable>
                </View>
                {canChangeStatus && jobStatusExpanded ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light, padding: 10, gap: 6 }}>
                    {data.partnerJobStatuses.map((status) => {
                      const selected = status === job.status;
                      const optionColor = getStatusColorMeta(status, data.statusColors);
                      return (
                        <Pressable
                          key={status}
                          onPress={() => { handleSelectStatus(job, status); setJobStatusExpanded(false); }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            height: 44,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            backgroundColor: selected ? optionColor.text : 'transparent',
                            borderWidth: selected ? 0 : 1,
                            borderColor: colors.border.light,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected ? '#FFFFFF' : optionColor.text }} />
                            <Text style={{ color: selected ? '#FFFFFF' : colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                              {statusLabel(status)}
                            </Text>
                          </View>
                          {selected ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>Selected</Text>
                              <Check size={13} color="#FFFFFF" strokeWidth={2.6} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, marginBottom: 16 }}>
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', lineHeight: 20 }} numberOfLines={1}>
                  {job.customerName || 'Customer name'}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 5 }} numberOfLines={1}>
                  Order {job.orderNumber ?? job.id.slice(-6).toUpperCase()}
                </Text>
                {job.itemLabel ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>
                    {job.itemLabel}
                  </Text>
                ) : null}
                {job.jobType || job.jobService ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {job.jobType ? (
                      <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#3B82F6', 0.12) }}>
                        <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{job.jobType}</Text>
                      </View>
                    ) : null}
                    {job.jobService ? (
                      <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#7E22CE', 0.12) }}>
                        <Text style={{ color: '#7E22CE', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{job.jobService}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Business</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={1}>
                      {data.businessName}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Date sent</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                      {formatDate(job.dispatchedAt ?? job.createdAt)}
                    </Text>
          </View>
        </View>
      </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, marginBottom: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Details
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.secondary,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {job.documentUrl && isImageAttachment ? (
                      <ResolvedAttachmentImage imageUrl={job.documentUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : job.imageUrl ? (
                      <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : job.documentUrl ? (
                      <FileText size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                    ) : job.notes ? (
                      <FileText size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                    ) : (
                      <Wrench size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 20 }} numberOfLines={3}>
                      {job.notes || job.documentName || 'No notes or attachment added.'}
                    </Text>
                    {job.documentUrl ? (
                      <View style={{ marginTop: 8 }}>
                        <AttachmentLink url={job.documentUrl} mimeType={job.documentMimeType} color={colors.text.secondary} fontSize={12} />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: billMeta ? 10 : 0 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Partner fee
                  </Text>
                  {billMeta ? (
                    <View style={{ paddingHorizontal: 10, height: 20, borderRadius: 999, backgroundColor: billMeta.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: billMeta.text, fontSize: 10, fontWeight: '600' }}>{billMeta.label}</Text>
                    </View>
                  ) : null}
                </View>
                {isLocked ? (
                  <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700', marginTop: 8 }}>
                    {job.amount ? formatCurrency(job.amount) : '—'}
                  </Text>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 32, marginTop: 8 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 16 }}>₦</Text>
                      <TextInput
                        value={getFeeDraftValue(job)}
                        onChangeText={(value) => setFeeDrafts((prev) => ({ ...prev, [job.id]: value }))}
                        onSubmitEditing={() => handleCommitFee(job)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                        style={{ width: 120, marginLeft: 4, color: colors.text.primary, fontSize: 20, fontWeight: '700' }}
                      />
                    </View>
                    <Pressable
                      onPress={() => handleCommitFee(job)}
                      disabled={!canCommitFee(job)}
                      style={{
                        height: 42,
                        borderRadius: 999,
                        backgroundColor: canCommitFee(job) ? colors.text.primary : colors.bg.secondary,
                        borderWidth: canCommitFee(job) ? 0 : 1,
                        borderColor: colors.border.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 14,
                        opacity: updateFeeMutation.isPending ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: canCommitFee(job) ? colors.bg.primary : colors.text.tertiary, fontSize: 12, fontWeight: '700' }}>
                        {updateFeeMutation.isPending ? 'Saving...' : 'Save'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>

              {activityEntries.length > 0 ? (
                <View style={{ marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16, marginBottom: isDesktop ? 0 : 48 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                    Activity
                  </Text>
                  {activityEntries.map((entry, entryIndex) => {
                    const isMostRecent = entryIndex === 0;
                    return (
                      <View key={`${entry.label}-${entry.at}`} style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ alignItems: 'center', width: 10 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isMostRecent ? colors.text.primary : colors.text.tertiary, marginTop: 3 }} />
                          {entryIndex < activityEntries.length - 1 ? (
                            <View style={{ width: 1, flex: 1, backgroundColor: colors.border.light, marginTop: 3 }} />
                          ) : null}
                        </View>
                        <View style={{ flex: 1, minWidth: 0, paddingBottom: entryIndex < activityEntries.length - 1 ? 14 : 0 }}>
                          <Text style={{ color: isMostRecent ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                            {entry.label}
                          </Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }}>
                            {entry.actor} · {formatDate(entry.at)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>
            {!isDesktop ? mobileFloatingNav : null}
          </Pressable>
        </Pressable>
      </Modal>
    );
  })();

  const imageLightbox = (
    <Modal visible={!!lightboxImageUrl} transparent animationType="fade" onRequestClose={() => setLightboxImageUrl(null)}>
      <Pressable
        onPress={() => setLightboxImageUrl(null)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <Pressable
          onPress={() => setLightboxImageUrl(null)}
          style={{ position: 'absolute', top: insets.top + 16, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        {lightboxImageUrl ? (
          <ResolvedAttachmentImage
            imageUrl={lightboxImageUrl}
            style={{ width: '100%', maxWidth: 720, height: isDesktop ? 600 : 420 }}
            resizeMode="contain"
          />
        ) : null}
      </Pressable>
    </Modal>
  );

  if (isDesktop) {
    return (
      <Pressable onPress={() => setStatusMenuJobId(null)} style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
        <View
          style={{
            width: 240,
            backgroundColor: colors.bg.primary,
            borderRightWidth: 1,
            borderRightColor: colors.border.light,
            paddingTop: insets.top || 20,
            paddingBottom: insets.bottom || 20,
          }}
        >
          <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light, marginBottom: 8 }}>
            <SvgXml xml={FYLL_LOGO_XML(colors.text.primary)} width={72} height={24} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
            {navItems.map((item) => {
              const active = activeSection === item.key;
              const badgeCount = item.key === 'issues' ? openIssueJobs.length : item.key === 'jobs' ? newJobsCount : 0;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setActiveSection(item.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    marginBottom: 4,
                    backgroundColor: active ? colors.bg.secondary : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? colors.text.primary : colors.text.secondary }}>
                    {item.label}
                  </Text>
                  {badgeCount > 0 ? (
                    <View
                      style={{
                        marginLeft: 'auto',
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: '#EF4444',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light, paddingTop: 12, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <User size={17} color={colors.text.tertiary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                  {data.partnerName}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.muted }} numberOfLines={1}>{data.email || 'Partner account'}</Text>
              </View>
            </View>
            {mode === 'session' ? (
              <Pressable
                onPress={async () => {
                  try {
                    await supabase.auth.signOut({ scope: 'local' });
                  } catch (error) {
                    console.warn('Partner sign out failed:', error);
                  }
                  router.replace('/partner-login');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 }}
              >
                <LogOut size={17} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary, marginLeft: 12 }}>
                  Log out
                </Text>
              </Pressable>
            ) : (
              <Pressable
                disabled
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, opacity: 0.4 }}
              >
                <LogOut size={17} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.tertiary, marginLeft: 12 }}>
                  Log out
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ flex: 1, alignItems: 'flex-start' }}>{content}</View>
        {newBillModal}
        {billDetailsPanel}
        {jobDetailsPanel}
        {imageLightbox}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <Pressable onPress={() => setStatusMenuJobId(null)} style={{ flex: 1 }}>
      {content}
      {newBillModal}
      {billDetailsPanel}
      {jobDetailsPanel}
      {imageLightbox}
      {mobileFloatingNav}
      </Pressable>
    </SafeAreaView>
  );
}
