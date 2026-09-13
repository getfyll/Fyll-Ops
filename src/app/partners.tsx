import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Ban,
  Building2,
  Banknote,
  BarChart3,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Glasses,
  Menu,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react-native';
import { AttachmentLink } from '@/components/AttachmentLink';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { PartnerJobFormModal } from '@/components/PartnerJobFormModal';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';
import { FYLL_PARTNER_PORTAL_ORIGIN } from '@/lib/partner-host';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  formatCurrency,
  type Partner,
  type PartnerBillingCycle,
  type PartnerBillStatus,
  type PartnerJob,
  type PartnerJobIssue,
  type PartnerJobStatus,
} from '@/lib/state/fyll-store';
import { createPartnerInvite, listPartnerInvites, type PartnerInviteRecord } from '@/lib/supabase/partner-invites';
import { getPartnerJobTaxonomy, savePartnerJobCategories, savePartnerJobServices } from '@/lib/supabase/partner-job-types';
import { notifyPartnerJobDispatched, notifyPartnerOfIssue, notifyPartnerOfIssueResolved } from '@/lib/notify-partner';
import { pickImageSimple } from '@/hooks/useImagePicker';
import { uploadBusinessAttachment } from '@/lib/storage-attachments';
import { SearchClearButton } from '@/components/SearchClearButton';

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type PartnerSection = 'jobs' | 'all' | 'bills' | 'issues';
type BillPeriod = 'week' | 'month' | 'year';
type JobPeriod = 'all' | 'week' | 'month' | 'year';
type StatusColorMap = Record<string, { bg: string; text: string }>;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  awaiting_dispatch: { label: 'Awaiting dispatch', bg: '#F4F4F0', text: '#6B7280' },
  sent: { label: 'Sent to partner', bg: '#F4F4F0', text: '#6B7280' },
  accepted: { label: 'Job accepted', bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  in_progress: { label: 'In progress', bg: 'rgba(202, 138, 4, 0.14)', text: '#A16207' },
  ready: { label: 'Ready for pickup', bg: '#E8F0FF', text: '#3B82F6' },
  pickup_requested: { label: 'Pickup requested', bg: '#E8F0FF', text: '#3B82F6' },
  received: { label: 'Received', bg: '#E6F7EC', text: '#16A34A' },
  sent_to_business: { label: 'Sent to business', bg: '#E6F7EC', text: '#16A34A' },
  collected: { label: 'Returned to business', bg: '#E6F7EC', text: '#16A34A' },
  billed: { label: 'Invoiced', bg: '#E6F7EC', text: '#16A34A' },
  cancelled: { label: 'Cancelled', bg: '#FEE9E9', text: '#DC2626' },
};

const BILL_STATUS_META: Record<PartnerBillStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  approved: { label: 'Approved', bg: '#E8F0FF', text: '#3B82F6' },
  rejected: { label: 'Rejected', bg: '#FEE9E9', text: '#DC2626' },
  queried: { label: 'Queried', bg: '#F3E8FF', text: '#7E22CE' },
  paid: { label: 'Paid', bg: '#E6F7EC', text: '#16A34A' },
};

type PartnerStatusFilter = 'all' | string;

const PARTNER_STATUS_OPTIONS: PartnerJobStatus[] = ['sent', 'in_progress', 'ready', 'pickup_requested', 'received', 'sent_to_business', 'collected', 'billed'];
const DEFAULT_BUSINESS_STATUSES: PartnerJobStatus[] = ['sent', 'pickup_requested', 'received', 'billed'];
const DEFAULT_PARTNER_STATUSES: PartnerJobStatus[] = ['in_progress', 'ready', 'sent_to_business'];
const STATUS_COLOR_OPTIONS = [
  { bg: '#F4F4F0', text: '#6B7280' },
  { bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  { bg: '#E8F0FF', text: '#3B82F6' },
  { bg: '#E6F7EC', text: '#16A34A' },
  { bg: '#FEE9E9', text: '#DC2626' },
  { bg: '#F3E8FF', text: '#7E22CE' },
];

const mergeStatuses = (...groups: PartnerJobStatus[][]) => (
  Array.from(new Set(groups.flat().map((status) => status.trim()).filter(Boolean)))
);

const getPartnerBusinessStatusFlow = (partner?: Partner) => (
  partner?.businessJobStatuses?.length
    ? partner.businessJobStatuses
    : partner?.allowedJobStatuses?.length
      ? partner.allowedJobStatuses
      : DEFAULT_BUSINESS_STATUSES
);

const getPartnerPortalStatusFlow = (partner?: Partner) => (
  partner?.partnerJobStatuses?.length ? partner.partnerJobStatuses : DEFAULT_PARTNER_STATUSES
);

const getPartnerStatusFlow = (partner?: Partner) => (
  mergeStatuses(getPartnerBusinessStatusFlow(partner), getPartnerPortalStatusFlow(partner))
);

const getStatusMeta = (status: PartnerJobStatus, businessName = 'business') => {
  if (status === 'collected') {
    return { label: 'Returned to Business', bg: '#E6F7EC', text: '#16A34A' };
  }
  if (status === 'sent_to_business') {
    return { label: 'Sent to Business', bg: '#E6F7EC', text: '#16A34A' };
  }
  if (status.toLowerCase().replace(/[_-]+/g, ' ') === 'sent to fyll') {
    return { label: 'Sent to Business', bg: '#F4F4F0', text: '#6B7280' };
  }
  const fallbackLabel = status
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bfyll\b/gi, businessName)
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return STATUS_META[status] ?? { label: fallbackLabel || 'Custom status', bg: '#F4F4F0', text: '#6B7280' };
};

const getPartnerStatusMeta = (status: PartnerJobStatus, businessName = 'business', partner?: Partner | null) => {
  const base = getStatusMeta(status, businessName);
  const customColor = partner?.statusColors?.[status];
  return customColor ? { ...base, ...customColor } : base;
};

const getDraftStatusMeta = (status: PartnerJobStatus, businessName: string, statusColors: StatusColorMap) => {
  const base = getStatusMeta(status, businessName);
  const customColor = statusColors[status];
  return customColor ? { ...base, ...customColor } : base;
};

const addUniqueStatus = (items: PartnerJobStatus[], value: string) => {
  const status = value.trim();
  if (!status || items.some((item) => item.toLowerCase() === status.toLowerCase())) return items;
  return [...items, status];
};

const assignStatusColor = (statusColors: StatusColorMap, status: string, color: { bg: string; text: string }) => {
  const key = status.trim();
  if (!key) return statusColors;
  return { ...statusColors, [key]: color };
};

const ageLabel = (iso?: string) => {
  if (!iso) return '-';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const hours = Math.max(1, Math.floor(ms / (1000 * 60 * 60)));
    return `${hours}h`;
  }
  return `${days}d`;
};

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatBillingCycle = (cycle?: PartnerBillingCycle) => {
  if (!cycle) return '';
  if (cycle === 'biweekly') return 'Biweekly';
  return cycle.charAt(0).toUpperCase() + cycle.slice(1);
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
};

const getBillPeriodRange = (period: BillPeriod) => {
  const now = new Date();
  const start = new Date(now);
  if (period === 'week') {
    const day = now.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start.setDate(now.getDate() - daysSinceMonday);
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

const isJobInPeriod = (job: PartnerJob, period: JobPeriod) => {
  if (period === 'all') return true;
  const { startMs, endMs } = getBillPeriodRange(period);
  const jobDate = new Date(job.dispatchedAt ?? job.createdAt).getTime();
  return Number.isFinite(jobDate) && jobDate >= startMs && jobDate < endMs;
};

export default function PartnersScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { businessName, companyName } = useBusinessSettings();
  const { partnerSection } = useLocalSearchParams<{ partnerSection?: string | string[] }>();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const headingStyle = getStandardPageHeadingStyle(isMobile);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? '');
  const statusBusinessName = businessName.trim() || companyName.trim() || 'business';

  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const orders = useFyllStore((s) => s.orders);
  const products = useFyllStore((s) => s.products);
  const addPartner = useFyllStore((s) => s.addPartner);
  const updatePartner = useFyllStore((s) => s.updatePartner);
  const deletePartner = useFyllStore((s) => s.deletePartner);
  const addPartnerJob = useFyllStore((s) => s.addPartnerJob);
  const updatePartnerJob = useFyllStore((s) => s.updatePartnerJob);
  const deletePartnerJob = useFyllStore((s) => s.deletePartnerJob);
  const partnerJobIssues = useFyllStore((s) => s.partnerJobIssues);
  const addPartnerJobIssue = useFyllStore((s) => s.addPartnerJobIssue);
  const updatePartnerJobIssue = useFyllStore((s) => s.updatePartnerJobIssue);

  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [reportIssueJobId, setReportIssueJobId] = useState<string | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueScreenshotUrl, setIssueScreenshotUrl] = useState<string | null>(null);
  const [issueScreenshotUploading, setIssueScreenshotUploading] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [issueEditDescription, setIssueEditDescription] = useState('');
  const [issueEditScreenshotUrl, setIssueEditScreenshotUrl] = useState<string | null>(null);
  const [issueEditScreenshotUploading, setIssueEditScreenshotUploading] = useState(false);
  const [issueResolutionNoteDraft, setIssueResolutionNoteDraft] = useState('');
  const [issueSaveState, setIssueSaveState] = useState<'idle' | 'saved'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<PartnerStatusFilter>('all');
  const [jobPeriod, setJobPeriod] = useState<JobPeriod>('all');
  const [billPeriod, setBillPeriod] = useState<BillPeriod>('month');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | PartnerBillStatus>('all');
  const [activeBillId, setActiveBillId] = useState<string | null>(null);
  const [billNoteDraft, setBillNoteDraft] = useState('');
  const [actionMenuJobId, setActionMenuJobId] = useState<string | null>(null);
  const [statusDropdownJobId, setStatusDropdownJobId] = useState<string | null>(null);
  const [showMobilePartnerMenu, setShowMobilePartnerMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showAddPartnerModal, setShowAddPartnerModal] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerContact, setNewPartnerContact] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [newPartnerEmail, setNewPartnerEmail] = useState('');
  const [newPartnerStatuses, setNewPartnerStatuses] = useState<PartnerJobStatus[]>(DEFAULT_BUSINESS_STATUSES);
  const [newPartnerStatusInput, setNewPartnerStatusInput] = useState('');
  const [newPartnerPortalStatuses, setNewPartnerPortalStatuses] = useState<PartnerJobStatus[]>(DEFAULT_PARTNER_STATUSES);
  const [newPartnerPortalStatusInput, setNewPartnerPortalStatusInput] = useState('');
  const [newPartnerBillingCycle, setNewPartnerBillingCycle] = useState<PartnerBillingCycle>('manual');
  const [newPartnerStatusColors, setNewPartnerStatusColors] = useState<StatusColorMap>({});
  const [newPartnerBusinessColor, setNewPartnerBusinessColor] = useState(STATUS_COLOR_OPTIONS[0]);
  const [newPartnerPortalColor, setNewPartnerPortalColor] = useState(STATUS_COLOR_OPTIONS[2]);
  const [lastCreatedPartnerLink, setLastCreatedPartnerLink] = useState<string | null>(null);
  const [lastCreatedPartnerId, setLastCreatedPartnerId] = useState<string | null>(null);
  const [lastCreatedPartnerName, setLastCreatedPartnerName] = useState<string | null>(null);
  const [partnerInvite, setPartnerInvite] = useState<PartnerInviteRecord | null>(null);
  const [isLoadingPartnerInvite, setIsLoadingPartnerInvite] = useState(false);
  const [inviteEmailDraft, setInviteEmailDraft] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [jobCategoryList, setJobCategoryList] = useState<string[]>([]);
  const [jobServiceList, setJobServiceList] = useState<string[]>([]);
  const [isLoadingJobTaxonomy, setIsLoadingJobTaxonomy] = useState(false);
  const [newJobCategoryDraft, setNewJobCategoryDraft] = useState('');
  const [newJobServiceDraft, setNewJobServiceDraft] = useState('');
  const [isSavingJobTaxonomy, setIsSavingJobTaxonomy] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    getPartnerJobTaxonomy(businessId)
      .then(({ categories, services }) => {
        setJobCategoryList(categories);
        setJobServiceList(services);
      })
      .catch(() => {});
  }, [businessId]);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [editPartnerName, setEditPartnerName] = useState('');
  const [editPartnerContact, setEditPartnerContact] = useState('');
  const [editPartnerPhone, setEditPartnerPhone] = useState('');
  const [editPartnerEmail, setEditPartnerEmail] = useState('');
  const [editPartnerNotes, setEditPartnerNotes] = useState('');
  const [editPartnerStatuses, setEditPartnerStatuses] = useState<PartnerJobStatus[]>(DEFAULT_BUSINESS_STATUSES);
  const [editPartnerStatusInput, setEditPartnerStatusInput] = useState('');
  const [editPartnerPortalStatuses, setEditPartnerPortalStatuses] = useState<PartnerJobStatus[]>(DEFAULT_PARTNER_STATUSES);
  const [editPartnerPortalStatusInput, setEditPartnerPortalStatusInput] = useState('');
  const [editPartnerBillingCycle, setEditPartnerBillingCycle] = useState<PartnerBillingCycle>('manual');
  const [editPartnerStatusColors, setEditPartnerStatusColors] = useState<StatusColorMap>({});
  const [editPartnerBusinessColor, setEditPartnerBusinessColor] = useState(STATUS_COLOR_OPTIONS[0]);
  const [editPartnerPortalColor, setEditPartnerPortalColor] = useState(STATUS_COLOR_OPTIONS[2]);
  const [editPartnerIsActive, setEditPartnerIsActive] = useState(true);
  const [partnerPendingDelete, setPartnerPendingDelete] = useState<Partner | null>(null);
  const [jobPendingDelete, setJobPendingDelete] = useState<PartnerJob | null>(null);

  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [activeMobileJobId, setActiveMobileJobId] = useState<string | null>(null);
  const [showMobileJobStatusOptions, setShowMobileJobStatusOptions] = useState(false);
  const [showMobileJobActionMenu, setShowMobileJobActionMenu] = useState(false);
  const [mobileJobFormReturnId, setMobileJobFormReturnId] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p] as const)), [partners]);
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o] as const)), [orders]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product] as const)), [products]);
  const getJobThumbnailUrl = (job: PartnerJob) => {
    if (job.imageUrl) return job.imageUrl;
    const order = job.orderId ? orderById.get(job.orderId) : null;
    const firstItem = order?.items?.[0];
    if (!firstItem) return null;
    const product = productById.get(firstItem.productId);
    const variantImage = product?.variants.find((variant) => variant.id === firstItem.variantId)?.imageUrl;
    return variantImage || product?.imageUrl || null;
  };
  const editingJob = useMemo(() => (
    editingJobId ? partnerJobs.find((job) => job.id === editingJobId) ?? null : null
  ), [editingJobId, partnerJobs]);

  const filteredJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return partnerJobs
      .filter((job) => {
        if (!isJobInPeriod(job, jobPeriod)) return false;
        if (partnerFilter !== 'all' && job.partnerId !== partnerFilter) return false;
        if (statusFilter !== 'all' && job.status !== statusFilter) return false;
        if (!query) return true;
        const partnerName = partnerById.get(job.partnerId)?.name ?? '';
        return [job.customerName, job.itemLabel, job.jobType, job.notes, partnerName]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [jobPeriod, partnerById, partnerFilter, partnerJobs, searchQuery, statusFilter]);

  const periodJobs = useMemo(() => (
    partnerJobs.filter((job) => isJobInPeriod(job, jobPeriod))
  ), [jobPeriod, partnerJobs]);

  const stats = useMemo(() => {
    const withPartners = periodJobs.filter((j) => j.status === 'sent' || j.status === 'accepted' || j.status === 'in_progress').length;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const pastDue = periodJobs.filter((j) => {
      if (j.status !== 'sent' && j.status !== 'accepted' && j.status !== 'in_progress') return false;
      const sentAt = new Date(j.dispatchedAt ?? j.createdAt).getTime();
      return Number.isFinite(sentAt) && sentAt < sevenDaysAgo;
    }).length;
    const unbilled = periodJobs
      .filter((j) => (j.status === 'ready' || j.status === 'collected') && (j.amount ?? 0) > 0)
      .reduce((sum, j) => sum + (j.amount ?? 0), 0);
    const activePartners = partners.filter((p) => p.isActive).length;
    return { withPartners, pastDue, unbilled, activePartners };
  }, [periodJobs, partners]);

  const statusCounts = useMemo(() => {
    const counts = new Map<PartnerJobStatus, number>();
    periodJobs.forEach((job) => {
      if (job.status === 'awaiting_dispatch' || job.status === 'cancelled') return;
      counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
    });
    return counts;
  }, [periodJobs]);

  const statusFilterChips = useMemo(() => {
    const orderedStatuses = new Set<PartnerJobStatus>();
    PARTNER_STATUS_OPTIONS.forEach((status) => orderedStatuses.add(status));
    partners.forEach((partner) => getPartnerStatusFlow(partner).forEach((status) => orderedStatuses.add(status)));
    partnerJobs.forEach((job) => {
      if (job.status !== 'awaiting_dispatch' && job.status !== 'cancelled') orderedStatuses.add(job.status);
    });
    return [
      { key: 'all' as const, label: 'All', count: periodJobs.length },
      ...Array.from(orderedStatuses).map((status) => ({
        key: status,
        label: getStatusMeta(status, statusBusinessName).label,
        count: statusCounts.get(status) ?? 0,
      })),
    ];
  }, [partnerJobs, partners, periodJobs.length, statusBusinessName, statusCounts]);

  const submittedBills = useMemo(() => {
    const byBillId = new Map<string, PartnerJob[]>();
    partnerJobs.forEach((job) => {
      if (!job.billId) return;
      const list = byBillId.get(job.billId) ?? [];
      list.push(job);
      byBillId.set(job.billId, list);
    });
    const bills: {
      billId: string;
      partner: Partner;
      jobIds: string[];
      jobCount: number;
      total: number;
      status: PartnerBillStatus;
      submittedAt: string;
      respondedAt?: string;
      respondedBy?: string;
      note?: string;
      paidAt?: string;
    }[] = [];
    byBillId.forEach((jobs, billId) => {
      const first = jobs[0];
      const partner = partnerById.get(first.partnerId);
      if (!partner) return;
      bills.push({
        billId,
        partner,
        jobIds: jobs.map((job) => job.id),
        jobCount: jobs.length,
        total: jobs.reduce((sum, job) => sum + (job.amount ?? 0), 0),
        status: first.billStatus ?? 'pending',
        submittedAt: first.billSubmittedAt ?? first.createdAt,
        respondedAt: first.billRespondedAt,
        respondedBy: first.billRespondedBy,
        note: first.billNote,
        paidAt: first.billPaidAt,
      });
    });
    return bills.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [partnerJobs, partnerById]);

  const billPeriodFilteredBills = useMemo(() => {
    const { startMs, endMs } = getBillPeriodRange(billPeriod);
    return submittedBills.filter((bill) => {
      const t = new Date(bill.submittedAt).getTime();
      return Number.isFinite(t) && t >= startMs && t < endMs;
    });
  }, [submittedBills, billPeriod]);

  const visibleBills = useMemo(() => (
    billStatusFilter === 'all' ? billPeriodFilteredBills : billPeriodFilteredBills.filter((bill) => bill.status === billStatusFilter)
  ), [billPeriodFilteredBills, billStatusFilter]);

  const billStats = useMemo(() => {
    const total = billPeriodFilteredBills.reduce((sum, bill) => sum + bill.total, 0);
    const pricedJobs = billPeriodFilteredBills.reduce((sum, bill) => sum + bill.jobCount, 0);
    const payablePartners = new Set(billPeriodFilteredBills.map((bill) => bill.partner.id)).size;
    const averageBill = billPeriodFilteredBills.length > 0 ? total / billPeriodFilteredBills.length : 0;
    return { total, pricedJobs, payablePartners, averageBill };
  }, [billPeriodFilteredBills]);

  const activeBill = useMemo(() => submittedBills.find((bill) => bill.billId === activeBillId) ?? null, [submittedBills, activeBillId]);
  const activeMobileJob = useMemo(
    () => partnerJobs.find((job) => job.id === activeMobileJobId) ?? null,
    [activeMobileJobId, partnerJobs]
  );

  const resetJobForm = () => {
    setEditingJobId(null);
  };

  const closeJobForm = () => {
    const returnId = mobileJobFormReturnId;
    setShowNewJobModal(false);
    resetJobForm();
    setMobileJobFormReturnId(null);
    if (isMobile && returnId && activeMobileJobId !== returnId) {
      setActiveMobileJobId(returnId);
      setShowMobileJobStatusOptions(false);
      setShowMobileJobActionMenu(false);
    }
  };

  const handleOpenEditJob = (job: PartnerJob) => {
    const shouldReturnToMobileDetail = isMobile && activeMobileJobId === job.id;
    setMobileJobFormReturnId(shouldReturnToMobileDetail ? job.id : null);
    if (!shouldReturnToMobileDetail) {
      setActiveMobileJobId(null);
    }
    setShowMobileJobStatusOptions(false);
    setShowMobileJobActionMenu(false);
    setEditingJobId(job.id);
    setShowNewJobModal(true);
    setActionMenuJobId(null);
    setStatusDropdownJobId(null);
  };

  const handleCreatePartner = () => {
    if (!newPartnerName.trim()) return;
    const token = generateId('ptok');
    const partner: Partner = {
      id: generateId('partner'),
      name: newPartnerName.trim(),
      contactName: newPartnerContact.trim() || undefined,
      phone: newPartnerPhone.trim() || undefined,
      email: newPartnerEmail.trim() || undefined,
      allowedJobStatuses: mergeStatuses(newPartnerStatuses, newPartnerPortalStatuses),
      businessJobStatuses: newPartnerStatuses,
      partnerJobStatuses: newPartnerPortalStatuses,
      statusColors: newPartnerStatusColors,
      billingCycle: newPartnerBillingCycle,
      magicLinkToken: token,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUserName || undefined,
    };
    addPartner(partner, businessId);
    setLastCreatedPartnerLink(token);
    setLastCreatedPartnerId(partner.id);
    setLastCreatedPartnerName(partner.name);
    setPartnerInvite(null);
    setInviteEmailDraft(partner.email ?? '');
    setNewPartnerName('');
    setNewPartnerContact('');
    setNewPartnerPhone('');
    setNewPartnerEmail('');
    setNewPartnerStatuses(DEFAULT_BUSINESS_STATUSES);
    setNewPartnerStatusInput('');
    setNewPartnerPortalStatuses(DEFAULT_PARTNER_STATUSES);
    setNewPartnerPortalStatusInput('');
    setNewPartnerStatusColors({});
    setNewPartnerBusinessColor(STATUS_COLOR_OPTIONS[0]);
    setNewPartnerPortalColor(STATUS_COLOR_OPTIONS[2]);
    setNewPartnerBillingCycle('manual');
    showToast(`${partner.name} added`);
  };

  const openPartnerEditor = (partner: Partner) => {
    setEditingPartner(partner);
    setEditPartnerName(partner.name);
    setEditPartnerContact(partner.contactName ?? '');
    setEditPartnerPhone(partner.phone ?? '');
    setEditPartnerEmail(partner.email ?? '');
    setEditPartnerNotes(partner.notes ?? '');
    setEditPartnerStatuses(getPartnerBusinessStatusFlow(partner));
    setEditPartnerStatusInput('');
    setEditPartnerPortalStatuses(getPartnerPortalStatusFlow(partner));
    setEditPartnerPortalStatusInput('');
    setEditPartnerStatusColors(partner.statusColors ?? {});
    setEditPartnerBusinessColor(STATUS_COLOR_OPTIONS[0]);
    setEditPartnerPortalColor(STATUS_COLOR_OPTIONS[2]);
    setEditPartnerBillingCycle(partner.billingCycle ?? 'manual');
    setEditPartnerIsActive(partner.isActive);
    setPartnerInvite(null);
    setInviteEmailDraft(partner.email ?? '');
    setNewJobCategoryDraft('');
    setNewJobServiceDraft('');
    if (!businessId) {
      setIsLoadingPartnerInvite(false);
      setIsLoadingJobTaxonomy(false);
      return;
    }
    setIsLoadingPartnerInvite(true);
    listPartnerInvites(businessId)
      .then((invites) => {
        const matching = invites
          .filter((invite) => invite.partnerId === partner.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPartnerInvite(matching[0] ?? null);
      })
      .catch(() => setPartnerInvite(null))
      .finally(() => setIsLoadingPartnerInvite(false));

    setIsLoadingJobTaxonomy(true);
    getPartnerJobTaxonomy(businessId)
      .then(({ categories, services }) => {
        setJobCategoryList(categories);
        setJobServiceList(services);
      })
      .catch(() => {
        setJobCategoryList([]);
        setJobServiceList([]);
      })
      .finally(() => setIsLoadingJobTaxonomy(false));
  };

  const closePartnerEditor = () => {
    setEditingPartner(null);
  };

  const handleSavePartner = () => {
    if (!editingPartner || !editPartnerName.trim()) return;
    updatePartner(editingPartner.id, {
      name: editPartnerName.trim(),
      contactName: editPartnerContact.trim() || undefined,
      phone: editPartnerPhone.trim() || undefined,
      email: editPartnerEmail.trim() || undefined,
      notes: editPartnerNotes.trim() || undefined,
      allowedJobStatuses: mergeStatuses(editPartnerStatuses, editPartnerPortalStatuses),
      businessJobStatuses: editPartnerStatuses,
      partnerJobStatuses: editPartnerPortalStatuses,
      statusColors: editPartnerStatusColors,
      billingCycle: editPartnerBillingCycle,
      isActive: editPartnerIsActive,
    }, businessId);
    showToast('Partner updated');
    closePartnerEditor();
  };

  const handleRequestDeletePartner = (partner: Partner) => {
    setPartnerPendingDelete(partner);
  };

  const handleConfirmDeletePartner = () => {
    if (!partnerPendingDelete) return;
    deletePartner(partnerPendingDelete.id, businessId);
    if (editingPartner?.id === partnerPendingDelete.id) closePartnerEditor();
    showToast(`${partnerPendingDelete.name} deleted`);
    setPartnerPendingDelete(null);
  };

  const handleCopyPartnerLink = async (token: string, partnerName?: string) => {
    const link = `${FYLL_PARTNER_PORTAL_ORIGIN}/partner/${token}`;
    const greeting = partnerName ? `Hi ${partnerName},` : 'Hi,';
    const message = `${greeting} ${statusBusinessName} added you as a partner on Fyll. Use this link to view and manage the jobs sent to you:\n${link}`;
    await Clipboard.setStringAsync(message);
    showToast('Message copied');
  };

  const handleCreatePartnerInvite = async (partnerId?: string) => {
    const targetPartnerId = partnerId ?? editingPartner?.id;
    if (!targetPartnerId || !businessId || !inviteEmailDraft.trim() || isCreatingInvite) return;
    setIsCreatingInvite(true);
    try {
      const invite = await createPartnerInvite(targetPartnerId, businessId, inviteEmailDraft.trim());
      setPartnerInvite(invite);
      showToast('Invite created');
    } catch {
      showToast('Could not create invite');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyPartnerInviteLink = async (inviteCode: string, partnerName?: string) => {
    const link = `${FYLL_PARTNER_PORTAL_ORIGIN}/partner-invite/${inviteCode}`;
    const greeting = partnerName ? `Hi ${partnerName},` : 'Hi,';
    const message = `${greeting} ${statusBusinessName} added you as a partner on Fyll. Tap this link to set up your account and start managing jobs:\n${link}`;
    await Clipboard.setStringAsync(message);
    showToast('Message copied');
  };

  const persistJobCategoryList = async (next: string[]) => {
    if (!businessId) return;
    setIsSavingJobTaxonomy(true);
    try {
      await savePartnerJobCategories(businessId, next);
      setJobCategoryList(next);
    } catch {
      showToast('Could not save job categories');
    } finally {
      setIsSavingJobTaxonomy(false);
    }
  };

  const persistJobServiceList = async (next: string[]) => {
    if (!businessId) return;
    setIsSavingJobTaxonomy(true);
    try {
      await savePartnerJobServices(businessId, next);
      setJobServiceList(next);
    } catch {
      showToast('Could not save services');
    } finally {
      setIsSavingJobTaxonomy(false);
    }
  };

  const handleAddJobCategory = async () => {
    const trimmed = newJobCategoryDraft.trim();
    if (!trimmed || !businessId || isSavingJobTaxonomy) return;
    if (jobCategoryList.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewJobCategoryDraft('');
      return;
    }
    await persistJobCategoryList([...jobCategoryList, trimmed]);
    setNewJobCategoryDraft('');
  };

  const handleDeleteJobCategory = async (category: string) => {
    if (isSavingJobTaxonomy) return;
    await persistJobCategoryList(jobCategoryList.filter((c) => c !== category));
  };

  const handleAddJobService = async () => {
    const trimmed = newJobServiceDraft.trim();
    if (!trimmed || !businessId || isSavingJobTaxonomy) return;
    if (jobServiceList.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setNewJobServiceDraft('');
      return;
    }
    await persistJobServiceList([...jobServiceList, trimmed]);
    setNewJobServiceDraft('');
  };

  const handleDeleteJobService = async (service: string) => {
    if (isSavingJobTaxonomy) return;
    await persistJobServiceList(jobServiceList.filter((s) => s !== service));
  };

  const handleJobSaved = () => {
    showToast(editingJobId ? 'Job updated' : 'Job created');
  };

  const handleDispatchJob = (job: PartnerJob) => {
    const firstPartnerStatus = getPartnerBusinessStatusFlow(partnerById.get(job.partnerId))[0] ?? 'sent';
    updatePartnerJob(job.id, { status: firstPartnerStatus, dispatchedAt: new Date().toISOString() }, businessId);
    setActionMenuJobId(null);
    setStatusDropdownJobId(null);
    showToast('Dispatched to partner');
    if (businessId) {
      notifyPartnerJobDispatched({
        businessId,
        partnerId: job.partnerId,
        jobId: job.id,
        customerName: job.customerName,
        itemLabel: job.itemLabel || job.jobType,
      });
    }
  };

  const handleSetJobStatus = (job: PartnerJob, status: PartnerJobStatus) => {
    const updates: Partial<PartnerJob> = { status };
    if (status === 'sent') updates.dispatchedAt = new Date().toISOString();
    if (status === 'collected') updates.collectedAt = new Date().toISOString();
    if (status === 'billed') updates.billedAt = new Date().toISOString();
    updatePartnerJob(job.id, updates, businessId);
    setActionMenuJobId(null);
    setStatusDropdownJobId(null);
  };

  const handleUpdateBillStatus = (jobIds: string[], status: PartnerBillStatus, note?: string) => {
    const nowIso = new Date().toISOString();
    jobIds.forEach((jobId) => {
      updatePartnerJob(jobId, {
        billStatus: status,
        billRespondedAt: nowIso,
        billRespondedBy: currentUserName || undefined,
        billNote: note,
        billPaidAt: status === 'paid' ? nowIso : undefined,
      }, businessId);
    });
    const labels: Record<PartnerBillStatus, string> = {
      pending: 'marked pending',
      approved: 'approved',
      rejected: 'rejected',
      queried: 'sent back with a query',
      paid: 'marked paid',
    };
    showToast(`Bill ${labels[status]}`);
  };

  const handleOpenReportIssue = (job: PartnerJob) => {
    closeJobMenus();
    setReportIssueJobId(job.id);
    setIssueDescription('');
    setIssueScreenshotUrl(null);
  };

  const handleCloseReportIssue = () => {
    setReportIssueJobId(null);
    setIssueDescription('');
    setIssueScreenshotUrl(null);
  };

  const handlePickIssueScreenshot = async () => {
    const uri = await pickImageSimple();
    if (!uri) return;
    setIssueScreenshotUploading(true);
    try {
      if (businessId) {
        const uploaded = await uploadBusinessAttachment({
          businessId,
          folder: 'partners/issues',
          uri,
          fileName: `issue-${Date.now()}.jpg`,
        });
        setIssueScreenshotUrl(uploaded.storagePath);
      } else {
        setIssueScreenshotUrl(uri);
      }
    } catch (error) {
      console.warn('Issue screenshot upload failed:', error);
      setIssueScreenshotUrl(uri);
    } finally {
      setIssueScreenshotUploading(false);
    }
  };

  const handleSubmitIssue = async () => {
    if (!reportIssueJobId || !issueDescription.trim() || isSubmittingIssue) return;
    const job = partnerJobs.find((j) => j.id === reportIssueJobId);
    if (!job) return;
    setIsSubmittingIssue(true);
    try {
      const issue: PartnerJobIssue = {
        id: generateId('issue'),
        partnerId: job.partnerId,
        jobId: job.id,
        orderId: job.orderId,
        description: issueDescription.trim(),
        screenshotUrl: issueScreenshotUrl ?? undefined,
        status: 'open',
        createdAt: new Date().toISOString(),
        createdBy: currentUserName || undefined,
      };
      // Await the remote write so a failure (e.g. the migration hasn't run
      // yet) surfaces here instead of silently leaving the partner with a
      // job flagged "on hold" but no issue row for the description to join
      // against.
      await addPartnerJobIssue(issue, businessId);
      updatePartnerJob(job.id, { hasOpenIssue: true }, businessId);
      if (businessId) {
        notifyPartnerOfIssue({
          businessId,
          partnerId: job.partnerId,
          jobId: job.id,
          issueId: issue.id,
          customerName: job.customerName,
          itemLabel: job.itemLabel || job.jobType,
        });
      }
      showToast('Issue reported — payment on hold');
      handleCloseReportIssue();
    } catch (error) {
      console.warn('Report issue failed:', error);
      showToast('Could not save the issue — check your connection and try again');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const handleResolveIssue = (issue: PartnerJobIssue) => {
    updatePartnerJobIssue(issue.id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: currentUserName || undefined,
    }, businessId);
    updatePartnerJob(issue.jobId, { hasOpenIssue: false }, businessId);
    if (businessId) {
      const job = partnerJobs.find((j) => j.id === issue.jobId);
      notifyPartnerOfIssueResolved({
        businessId,
        partnerId: issue.partnerId,
        jobId: issue.jobId,
        issueId: issue.id,
        customerName: job?.customerName,
        itemLabel: job?.itemLabel || job?.jobType,
      });
    }
    showToast('Issue resolved');
  };

  const openIssueDetail = (issue: PartnerJobIssue) => {
    setActiveIssueId(issue.id);
    setIssueEditDescription(issue.description);
    setIssueEditScreenshotUrl(issue.screenshotUrl ?? null);
    setIssueResolutionNoteDraft(issue.resolutionNote ?? '');
    setIssueSaveState('idle');
  };

  const closeIssueDetail = () => {
    setActiveIssueId(null);
    setIssueEditDescription('');
    setIssueEditScreenshotUrl(null);
    setIssueResolutionNoteDraft('');
    setIssueSaveState('idle');
  };

  const handlePickIssueEditScreenshot = async () => {
    const uri = await pickImageSimple();
    if (!uri) return;
    setIssueEditScreenshotUploading(true);
    try {
      if (businessId) {
        const uploaded = await uploadBusinessAttachment({
          businessId,
          folder: 'partners/issues',
          uri,
          fileName: `issue-${Date.now()}.jpg`,
        });
        setIssueEditScreenshotUrl(uploaded.storagePath);
      } else {
        setIssueEditScreenshotUrl(uri);
      }
    } catch (error) {
      console.warn('Issue screenshot upload failed:', error);
      setIssueEditScreenshotUrl(uri);
    } finally {
      setIssueEditScreenshotUploading(false);
    }
  };

  const handleSaveIssueEdits = (issue: PartnerJobIssue) => {
    if (!issueEditDescription.trim()) return;
    updatePartnerJobIssue(issue.id, {
      description: issueEditDescription.trim(),
      screenshotUrl: issueEditScreenshotUrl ?? undefined,
    }, businessId);
    setIssueSaveState('saved');
    showToast('Issue updated');
    setTimeout(() => setIssueSaveState('idle'), 1800);
  };

  const handleResolveIssueDetail = (issue: PartnerJobIssue) => {
    updatePartnerJobIssue(issue.id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: currentUserName || undefined,
      resolutionNote: issueResolutionNoteDraft.trim() || undefined,
    }, businessId);
    updatePartnerJob(issue.jobId, { hasOpenIssue: false }, businessId);
    if (businessId) {
      const job = partnerJobs.find((j) => j.id === issue.jobId);
      notifyPartnerOfIssueResolved({
        businessId,
        partnerId: issue.partnerId,
        jobId: issue.jobId,
        issueId: issue.id,
        customerName: job?.customerName,
        itemLabel: job?.itemLabel || job?.jobType,
      });
    }
    showToast('Issue resolved');
  };

  const handleReopenIssueDetail = (issue: PartnerJobIssue) => {
    updatePartnerJobIssue(issue.id, {
      status: 'open',
      resolvedAt: undefined,
      resolvedBy: undefined,
    }, businessId);
    updatePartnerJob(issue.jobId, { hasOpenIssue: true }, businessId);
    showToast('Issue reopened');
  };

  const openBillReview = (billId: string) => {
    closeJobMenus();
    router.push(`/partner-bills/${billId}` as never);
  };

  const closeBillReview = () => {
    setActiveBillId(null);
    setBillNoteDraft('');
  };

  const handleApproveActiveBill = () => {
    if (!activeBill) return;
    handleUpdateBillStatus(activeBill.jobIds, 'approved');
    closeBillReview();
  };

  const handleRejectActiveBill = () => {
    if (!activeBill) return;
    handleUpdateBillStatus(activeBill.jobIds, 'rejected', billNoteDraft.trim() || undefined);
    closeBillReview();
  };

  const handleQueryActiveBill = () => {
    if (!activeBill) return;
    handleUpdateBillStatus(activeBill.jobIds, 'queried', billNoteDraft.trim() || undefined);
    closeBillReview();
  };

  const handleMarkActiveBillPaid = () => {
    if (!activeBill) return;
    handleUpdateBillStatus(activeBill.jobIds, 'paid');
    closeBillReview();
  };

  const toggleJobActionMenu = (job: PartnerJob) => {
    if (job.status === 'awaiting_dispatch') return;
    setStatusDropdownJobId(null);
    setActionMenuJobId((current) => (current === job.id ? null : job.id));
  };

  const handleRequestDeleteJob = (job: PartnerJob) => {
    setActionMenuJobId(null);
    setShowMobileJobActionMenu(false);
    setJobPendingDelete(job);
  };

  const handleConfirmDeleteJob = () => {
    if (!jobPendingDelete) return;
    deletePartnerJob(jobPendingDelete.id, businessId);
    if (activeMobileJobId === jobPendingDelete.id) setActiveMobileJobId(null);
    if (editingJobId === jobPendingDelete.id) closeJobForm();
    showToast('Job deleted');
    setJobPendingDelete(null);
  };

  const toggleJobStatusDropdown = (job: PartnerJob) => {
    if (job.status === 'awaiting_dispatch') return;
    setActionMenuJobId(null);
    setStatusDropdownJobId((current) => (current === job.id ? null : job.id));
  };

  const closeJobMenus = () => {
    setActionMenuJobId(null);
    setStatusDropdownJobId(null);
  };

  const contentMaxWidth = isDesktop ? 1500 : undefined;
  const separatorColor = colors.border.light;
  const openPartnerIssueCount = useMemo(() => {
    return partnerJobIssues.filter((issue) => issue.status === 'open').length;
  }, [partnerJobIssues]);
  const rawPartnerSection = Array.isArray(partnerSection) ? partnerSection[0] : partnerSection;
  const activePartnerSection: PartnerSection = rawPartnerSection === 'all' ? 'all' : rawPartnerSection === 'bills' ? 'bills' : rawPartnerSection === 'issues' ? 'issues' : 'jobs';
  const partnerSectionItems: { key: PartnerSection; label: string }[] = [
    { key: 'jobs', label: 'Jobs' },
    { key: 'bills', label: 'Bills' },
    { key: 'issues', label: 'Issues' },
    { key: 'all', label: 'All partners' },
  ];
  const selectPartnerSection = (section: PartnerSection) => {
    setShowMobilePartnerMenu(false);
    closeJobMenus();
    router.replace(`/partners?partnerSection=${section}` as never);
  };
  const body = (
    <Pressable onPress={() => { closeJobMenus(); setShowMobilePartnerMenu(false); }} style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={isDesktop ? [] : ['top']}>
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
          <View
            style={{
              width: '100%',
              maxWidth: contentMaxWidth,
              alignSelf: isDesktop ? 'flex-start' : 'stretch',
              minHeight: isDesktop ? DESKTOP_PAGE_HEADER_MIN_HEIGHT : undefined,
              paddingHorizontal: 20,
              paddingTop: isDesktop ? 20 : 16,
              paddingBottom: isDesktop ? 16 : 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={isDesktop ? { color: colors.text.primary, fontSize: 26, fontWeight: '700', lineHeight: 32 } : [headingStyle, { color: colors.text.primary }]}>
                {activePartnerSection === 'jobs' ? 'Partner Jobs' : activePartnerSection === 'bills' ? 'Partner Bills' : activePartnerSection === 'issues' ? 'Issues' : 'Partners'}
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: isMobile ? 10 : 12, fontWeight: '400', marginTop: 4 }}>
                {activePartnerSection === 'jobs'
                  ? 'Glazing and fitting work sent out to opticians.'
                  : activePartnerSection === 'bills'
                    ? 'Priced jobs rolled up for partner payments.'
                    : activePartnerSection === 'issues'
                      ? 'Defects and complaints reported against partner jobs.'
                      : 'External business partners who work for you.'}
              </Text>
            </View>
            {!isMobile ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => router.push('/insights/partner-jobs' as never)}
                style={{ height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <BarChart3 size={15} color={colors.text.secondary} strokeWidth={2} />
                <Text style={{ color: colors.text.secondary, fontSize: 12.5, fontWeight: '600' }}>Reports</Text>
              </Pressable>
              {activePartnerSection === 'all' ? (
                <Pressable
                  onPress={() => setShowAddPartnerModal(true)}
                  style={{ height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Building2 size={15} color={colors.text.secondary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary, fontSize: 12.5, fontWeight: '600' }}>Add Partner</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { setMobileJobFormReturnId(null); resetJobForm(); setShowNewJobModal(true); }}
                disabled={partners.length === 0}
                style={{ height: 40, borderRadius: 999, backgroundColor: partners.length === 0 ? colors.bg.secondary : colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Plus size={16} color={partners.length === 0 ? colors.text.tertiary : colors.bg.primary} strokeWidth={2.5} />
                <Text style={{ color: partners.length === 0 ? colors.text.tertiary : colors.bg.primary, fontSize: 12.5, fontWeight: '600' }}>New Job</Text>
              </Pressable>
            </View>
            ) : (
              <Pressable
                onPress={() => { setMobileJobFormReturnId(null); resetJobForm(); setShowNewJobModal(true); }}
                disabled={partners.length === 0}
                style={{ height: 36, borderRadius: 999, backgroundColor: partners.length === 0 ? colors.bg.secondary : colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Plus size={15} color={partners.length === 0 ? colors.text.tertiary : colors.bg.primary} strokeWidth={2.5} />
                <Text style={{ color: partners.length === 0 ? colors.text.tertiary : colors.bg.primary, fontSize: 12, fontWeight: '600' }}>New Job</Text>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: (isDesktop ? 32 : 24) + tabBarHeight, maxWidth: contentMaxWidth, width: '100%', alignSelf: isDesktop ? 'flex-start' : 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          {activePartnerSection === 'jobs' ? (
            <View style={{ gap: isMobile ? 16 : 0 }}>
          {partners.length === 0 ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 24, alignItems: 'center', marginBottom: isMobile ? 0 : 16 }}>
              <Truck size={24} color={colors.text.tertiary} strokeWidth={1.8} />
              <Text style={{ color: colors.text.primary, fontWeight: '600', marginTop: 10 }}>No partners yet</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                Add an optician or vendor partner first, then dispatch jobs to them.
              </Text>
              <Pressable
                onPress={() => setShowAddPartnerModal(true)}
                style={{ marginTop: 14, height: 40, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.bg.primary, fontSize: 12.5, fontWeight: '600' }}>+ Add Partner</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: isMobile ? 0 : 14 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {[
              { key: 'all' as const, label: 'All time' },
              { key: 'week' as const, label: 'This week' },
              { key: 'month' as const, label: 'This month' },
              { key: 'year' as const, label: 'This year' },
            ].map((period) => {
              const selected = jobPeriod === period.key;
              return (
                <Pressable
                  key={period.key}
                  onPress={() => setJobPeriod(period.key)}
                  style={{
                    height: 40,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.text.primary : colors.bg.card,
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ color: selected ? colors.bg.primary : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{period.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', flexWrap: isDesktop ? 'nowrap' : 'wrap', gap: isDesktop ? 16 : 10, marginHorizontal: isDesktop ? 0 : 0, marginBottom: isMobile ? 0 : 20 }}>
            {[
              { label: 'WITH PARTNERS', value: String(stats.withPartners), caption: 'Jobs currently away with partners' },
              { label: 'PAST DUE', value: String(stats.pastDue), caption: 'Sent jobs older than seven days', valueColor: stats.pastDue > 0 ? '#DC2626' : undefined },
              { label: 'UNBILLED VALUE', value: formatCurrency(stats.unbilled), caption: 'Priced jobs awaiting invoicing' },
              { label: 'ACTIVE PARTNERS', value: String(stats.activePartners), caption: 'External partners available for work' },
            ].map((stat) => (
              <View
                key={stat.label}
                style={{
                  flex: isDesktop ? 1 : undefined,
                  flexBasis: isDesktop ? undefined : '48%',
                  width: isDesktop ? undefined : '48%',
                  minWidth: isDesktop ? 170 : 0,
                  paddingHorizontal: 0,
                  marginBottom: 0,
                }}
              >
                <View
                  style={{
                  minHeight: isMobile ? 104 : 138,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.card,
                  paddingHorizontal: isMobile ? 14 : 18,
                  paddingVertical: isMobile ? 12 : 18,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {stat.label}
                </Text>
                <Text style={{ color: stat.valueColor ?? colors.text.primary, fontSize: isMobile ? 20 : 26, fontWeight: '700', marginTop: 8 }}>
                  {stat.value}
                </Text>
                <Text style={{ color: colors.text.muted, fontSize: isMobile ? 8 : 12, fontWeight: '400', lineHeight: isMobile ? 11 : 18, marginTop: 6 }}>
                  {stat.caption}
                </Text>
              </View>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'stretch', gap: isMobile ? 16 : 10, marginBottom: isMobile ? 0 : 18 }}>
            <View
              style={{
                height: 44,
                width: isDesktop ? 340 : undefined,
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 14,
              }}
            >
              <Search size={17} color={colors.text.muted} strokeWidth={2} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search jobs, customers, partners"
                placeholderTextColor={colors.input.placeholder}
                style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                selectionColor={colors.text.primary}
              />
              <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
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

          {/* Jobs list */}
          {filteredJobs.length === 0 ? (
            <View style={{ padding: 44, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card }}>
              <Glasses size={28} color={colors.text.tertiary} strokeWidth={1.7} />
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginTop: 12 }}>No partner jobs found</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                Jobs you send to external partners will show up here.
              </Text>
            </View>
          ) : isDesktop ? (
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'visible', zIndex: actionMenuJobId || statusDropdownJobId ? 50 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.muted, flex: 0.55, minWidth: 76, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>GLASSES</Text>
                <Text style={{ color: colors.text.muted, flex: 1.2, minWidth: 150, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CUSTOMER NAME</Text>
                <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CATEGORY</Text>
                <Text style={{ color: colors.text.muted, flex: 1.4, minWidth: 180, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>SERVICE</Text>
                <Text style={{ color: colors.text.muted, flex: 1.15, minWidth: 150, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>DESCRIPTION</Text>
                <Text style={{ color: colors.text.muted, flex: 1.05, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>PARTNER</Text>
                <Text style={{ color: colors.text.muted, flex: 0.85, minWidth: 105, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>DATE SENT</Text>
                <Text style={{ color: colors.text.muted, flex: 1.25, minWidth: 165, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
                <Text style={{ color: colors.text.muted, flex: 0.95, minWidth: 132, paddingRight: 24, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>FEE</Text>
                <Text style={{ color: colors.text.muted, width: 84, paddingLeft: 18, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>ACTION</Text>
              </View>
              {filteredJobs.map((job, index) => {
                const partner = partnerById.get(job.partnerId);
                const meta = getPartnerStatusMeta(job.status, statusBusinessName, partner);
                const statusMenuOptions = getPartnerBusinessStatusFlow(partner).filter((status) => status !== job.status);
                const isRowElevated = statusDropdownJobId === job.id || actionMenuJobId === job.id;
                return (
                  <Pressable
                    key={job.id}
                    onPress={() => {
                      closeJobMenus();
                      setActiveMobileJobId(job.id);
                      setShowMobileJobStatusOptions(false);
                      setShowMobileJobActionMenu(false);
                    }}
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
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          closeJobMenus();
                          setActiveMobileJobId(job.id);
                          setShowMobileJobStatusOptions(false);
                          setShowMobileJobActionMenu(false);
                        }}
                        style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {job.imageUrl ? (
                          <ResolvedAttachmentImage imageUrl={job.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Glasses size={20} color={colors.text.tertiary} strokeWidth={1.8} />
                        )}
                      </Pressable>
                    </View>

                    <View style={{ flex: 1.2, minWidth: 150, paddingRight: 10 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                        {job.customerName}
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginTop: 2 }} numberOfLines={1}>
                        {job.orderId && orderById.get(job.orderId) ? orderById.get(job.orderId)?.orderNumber ?? job.orderId : job.id.slice(-6).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                        {job.jobType || '—'}
                      </Text>
                    </View>

                    <View style={{ flex: 1.4, minWidth: 180, paddingRight: 10 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={2}>
                        {job.jobService || '—'}
                      </Text>
                    </View>

                    <View style={{ flex: 1.15, minWidth: 150, paddingRight: 10 }}>
                      {job.documentUrl ? (
                        <AttachmentLink url={job.documentUrl} mimeType={job.documentMimeType} color={colors.text.secondary} />
                      ) : (
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} numberOfLines={2}>
                          {job.notes || '—'}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1.05, minWidth: 140, paddingRight: 10 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                      {partner?.name ?? 'Unknown partner'}
                      </Text>
                    </View>

                    <View style={{ flex: 0.85, minWidth: 105, paddingRight: 10 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                        {formatDate(job.dispatchedAt ?? job.createdAt)}
                      </Text>
                    </View>

                    <View style={{ flex: 1.25, minWidth: 165, paddingRight: 10, position: 'relative', zIndex: statusDropdownJobId === job.id ? 140 : 1 }}>
                      <Pressable onPress={(e) => { e.stopPropagation(); toggleJobStatusDropdown(job); }} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: meta.bg }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.text }} />
                        <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{meta.label}</Text>
                        {statusMenuOptions.length > 0 ? <ChevronDown size={13} color={meta.text} strokeWidth={2.2} /> : null}
                      </Pressable>
                      {statusDropdownJobId === job.id ? (
                        <View style={{ position: 'absolute', top: 30, left: 0, minWidth: 180, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden', zIndex: 220, shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
                          {statusMenuOptions.map((status) => {
                            const optionMeta = getPartnerStatusMeta(status, statusBusinessName, partner);
                            return (
                              <Pressable key={status} onPress={(e) => { e.stopPropagation(); handleSetJobStatus(job, status); }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                                <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 24, borderRadius: 999, backgroundColor: optionMeta.bg, paddingHorizontal: 10 }}>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: optionMeta.text }} />
                                  <Text style={{ color: optionMeta.text, fontSize: 12, fontWeight: '500' }}>{optionMeta.label}</Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>

                    <View style={{ flex: 0.95, minWidth: 132, alignItems: 'flex-end', paddingRight: 24 }}>
                      <Text style={{ color: job.amount ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>
                        {job.amount ? formatCurrency(job.amount) : '—'}
                      </Text>
                    </View>

                    <View style={{ width: 84, paddingLeft: 18, alignItems: 'flex-end', position: 'relative', zIndex: actionMenuJobId === job.id ? 100 : 1 }}>
                      {job.status === 'awaiting_dispatch' ? (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); handleDispatchJob(job); }}
                          style={{ height: 28, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Send</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); toggleJobActionMenu(job); }}
                          style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <MoreVertical size={14} color={colors.text.secondary} strokeWidth={2} />
                        </Pressable>
                      )}
                      {actionMenuJobId === job.id ? (
                        <View style={{ position: 'absolute', top: 36, right: 0, minWidth: 150, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden', zIndex: 200, shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
                          <Pressable onPress={(e) => { e.stopPropagation(); handleOpenEditJob(job); }} style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12.5, fontWeight: '600' }}>Edit Job</Text>
                          </Pressable>
                          {!job.hasOpenIssue ? (
                            <Pressable onPress={(e) => { e.stopPropagation(); handleOpenReportIssue(job); }} style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                              <Text style={{ color: '#B45309', fontSize: 12.5, fontWeight: '600' }}>Report Issue</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={(e) => { e.stopPropagation(); handleSetJobStatus(job, 'cancelled'); }} style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                            <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '600' }}>Cancel job</Text>
                          </Pressable>
                          <Pressable onPress={(e) => { e.stopPropagation(); handleRequestDeleteJob(job); }} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                            <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '600' }}>Delete job</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {filteredJobs.map((job) => {
                const partner = partnerById.get(job.partnerId);
                const meta = getPartnerStatusMeta(job.status, statusBusinessName, partner);
                const mobileStatusBg = hexToRgba(meta.text, 0.14);
                const orderNumber = job.orderId && orderById.get(job.orderId)
                  ? orderById.get(job.orderId)?.orderNumber
                  : job.id.slice(-6).toUpperCase();
                const createdAtMs = new Date(job.createdAt).getTime();
                const isNewJob = Number.isFinite(createdAtMs) && Date.now() - createdAtMs < 24 * 60 * 60 * 1000;
                return (
                  <Pressable
                    key={job.id}
                    onPress={() => {
                      closeJobMenus();
                      setActiveMobileJobId(job.id);
                      setShowMobileJobStatusOptions(false);
                    }}
                    onLongPress={() => handleOpenEditJob(job)}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      padding: 14,
                      zIndex: actionMenuJobId === job.id || statusDropdownJobId === job.id ? 60 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {job.orderId && orderById.get(job.orderId) ? (
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                              {orderNumber}
                            </Text>
                          ) : (
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                              JOB-{orderNumber}
                            </Text>
                          )}
                          {isNewJob ? (
                            <View
                              style={{
                                backgroundColor: '#3B82F6',
                                paddingHorizontal: 5,
                                paddingVertical: 2,
                                borderRadius: 5,
                                marginLeft: 6,
                              }}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>NEW</Text>
                            </View>
                          ) : null}
                          <View
                            style={{
                              marginLeft: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 6,
                              backgroundColor: mobileStatusBg,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <Text style={{ color: meta.text, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{meta.label}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <UserIcon size={12} color={colors.text.tertiary} strokeWidth={2} />
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginLeft: 4 }} numberOfLines={1}>
                            {job.customerName || 'Customer name'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: job.amount ? colors.text.primary : colors.text.tertiary, fontSize: 14, fontWeight: '700' }}>
                          {job.amount ? formatCurrency(job.amount) : '—'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.bg.secondary }}>
                            <Text style={{ color: colors.text.muted, fontSize: 10 }} numberOfLines={1}>
                              {partner?.name ?? 'partner'}
                            </Text>
                          </View>
                        </View>
                        {job.status === 'awaiting_dispatch' ? (
                          <Pressable
                            onPress={(e) => { e.stopPropagation(); handleDispatchJob(job); }}
                            style={{ marginTop: 8, height: 28, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Send</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, lineHeight: 14, marginBottom: 9 }} numberOfLines={1}>
                      {job.jobType || job.jobService ? [job.jobType, job.jobService].filter(Boolean).join(' · ') : job.itemLabel || 'Job'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border.light }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                        <Calendar size={12} color={colors.text.muted} strokeWidth={2} />
                        <Text style={{ color: colors.text.muted, fontSize: 10, marginLeft: 4 }}>
                          {formatDate(job.dispatchedAt ?? job.createdAt)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <ChevronRight size={16} color={colors.text.muted} strokeWidth={2} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
            </View>
          ) : null}

          {activePartnerSection === 'bills' ? (
            <View style={{ gap: isMobile ? 16 : 0 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: isMobile ? 0 : 10 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {[
                  { key: 'week' as const, label: 'This week' },
                  { key: 'month' as const, label: 'This month' },
                  { key: 'year' as const, label: 'This year' },
                ].map((period) => {
                  const selected = billPeriod === period.key;
                  return (
                    <Pressable
                      key={period.key}
                      onPress={() => setBillPeriod(period.key)}
                      style={{
                        height: 40,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.text.primary : colors.bg.card,
                        borderWidth: selected ? 0 : 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: selected ? colors.bg.primary : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{period.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ flexDirection: 'row', flexWrap: isDesktop ? 'nowrap' : 'wrap', gap: isDesktop ? 16 : 10, marginBottom: isMobile ? 0 : 20 }}>
                {[
                  { label: 'TOTAL BILLS', value: formatCurrency(billStats.total), caption: 'Submitted in this period' },
                  { label: 'PRICED JOBS', value: String(billStats.pricedJobs), caption: 'Jobs included in bills' },
                  { label: 'PAYABLE PARTNERS', value: String(billStats.payablePartners), caption: 'Partners with a bill' },
                  { label: 'AVERAGE BILL', value: formatCurrency(billStats.averageBill), caption: 'Average per submitted bill' },
                ].map((stat) => (
                  <View
                    key={stat.label}
                    style={{
                      flex: isDesktop ? 1 : undefined,
                      flexBasis: isDesktop ? undefined : '48%',
                      width: isDesktop ? undefined : '48%',
                      minWidth: isDesktop ? 170 : 0,
                      minHeight: isMobile ? 104 : 138,
                      borderRadius: 24,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      paddingHorizontal: isMobile ? 14 : 18,
                      paddingVertical: isMobile ? 12 : 18,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {stat.label}
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: isMobile ? 20 : 26, fontWeight: '700', marginTop: 8 }}>
                      {stat.value}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: isMobile ? 10 : 12, fontWeight: '400', lineHeight: isMobile ? 14 : 18, marginTop: 6 }}>
                      {stat.caption}
                    </Text>
                  </View>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: isMobile ? 0 : 14 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {([
                  { key: 'all' as const, label: 'All' },
                  { key: 'pending' as const, label: 'Pending' },
                  { key: 'approved' as const, label: 'Approved' },
                  { key: 'queried' as const, label: 'Queried' },
                  { key: 'rejected' as const, label: 'Rejected' },
                  { key: 'paid' as const, label: 'Paid' },
                ]).map((filter) => {
                  const selected = billStatusFilter === filter.key;
                  const count = filter.key === 'all'
                    ? billPeriodFilteredBills.length
                    : billPeriodFilteredBills.filter((bill) => bill.status === filter.key).length;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => setBillStatusFilter(filter.key)}
                      style={{
                        height: 36,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        backgroundColor: selected ? colors.text.primary : colors.bg.card,
                        borderWidth: selected ? 0 : 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: selected ? colors.bg.primary : colors.text.primary, fontSize: 12, fontWeight: '600' }}>{filter.label}</Text>
                      {count > 0 ? (
                        <Text style={{ color: selected ? colors.bg.primary : colors.text.muted, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{count}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={isDesktop ? { borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' } : { gap: 12 }}>
              {visibleBills.length === 0 ? (
                <View style={{ padding: 28, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card }}>
                  <Banknote size={26} color={colors.text.tertiary} strokeWidth={1.7} />
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 10 }}>No bills here</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                    Bills show up once a partner submits one from their portal.
                  </Text>
                </View>
              ) : (
                isDesktop ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                      <Text style={{ color: colors.text.muted, flex: 0.55, minWidth: 76, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>PARTNER</Text>
                      <Text style={{ color: colors.text.muted, flex: 1.35, minWidth: 180, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>PARTNER NAME</Text>
                      <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>JOBS</Text>
                      <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
                      <Text style={{ color: colors.text.muted, flex: 0.95, minWidth: 132, paddingRight: 16, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>TOTAL</Text>
                      <Text style={{ color: colors.text.muted, width: 110, paddingLeft: 10, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>ACTION</Text>
                    </View>
                    {visibleBills.map((bill, index) => {
                      const meta = BILL_STATUS_META[bill.status];
                      return (
                        <Pressable
                          key={bill.billId}
                          onPress={() => openBillReview(bill.billId)}
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
                          <View style={{ flex: 0.55, minWidth: 76, paddingRight: 10 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{getInitials(bill.partner.name)}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 1.35, minWidth: 180, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                              {bill.partner.name}
                            </Text>
                          </View>
                          <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                              {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'} · {formatDate(bill.submittedAt)}
                            </Text>
                          </View>
                          <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                            <View
                              style={{
                                alignSelf: 'flex-start',
                                paddingHorizontal: 10,
                                height: 24,
                                borderRadius: 999,
                                backgroundColor: meta.bg,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }}>{meta.label}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 0.95, minWidth: 132, paddingRight: 16, alignItems: 'flex-end' }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>
                              {formatCurrency(bill.total)}
                            </Text>
                          </View>
                          <View style={{ width: 110, paddingLeft: 10, alignItems: 'flex-end' }}>
                            <View
                              style={{
                                height: 30,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.text.primary,
                                backgroundColor: colors.text.primary,
                                paddingHorizontal: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: colors.bg.primary, fontSize: 11.5, fontWeight: '600' }}>
                                {bill.status === 'pending' ? 'Review' : bill.status === 'approved' ? 'Mark Paid' : 'View'}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                ) : (
                  visibleBills.map((bill, index) => {
                    const meta = BILL_STATUS_META[bill.status];
                    const mobileStatusBg = hexToRgba(meta.text, 0.14);
                    const actionLabel = bill.status === 'pending' ? 'Review' : bill.status === 'approved' ? 'Mark Paid' : 'View';
                    return (
                      <Pressable
                        key={bill.billId}
                        onPress={() => openBillReview(bill.billId)}
                        style={{
                          borderRadius: 18,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.card,
                          padding: 14,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                              {bill.partner.name}
                            </Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 10, lineHeight: 14, marginTop: 4 }} numberOfLines={1}>
                              {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'} {bill.partner.billingCycle ? `· ${formatBillingCycle(bill.partner.billingCycle)}` : ''}
                            </Text>
                            <View
                              style={{
                                marginTop: 10,
                                alignSelf: 'flex-start',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: mobileStatusBg,
                              }}
                            >
                              <Text style={{ color: meta.text, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{meta.label}</Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                              {formatCurrency(bill.total)}
                            </Text>
                            <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 4 }}>
                              {formatDate(bill.submittedAt)}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border.light }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                            <Calendar size={12} color={colors.text.muted} strokeWidth={2} />
                            <Text style={{ color: colors.text.muted, fontSize: 10, marginLeft: 4 }}>
                              {formatDate(bill.submittedAt)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }} />
                          <View style={{ height: 26, borderRadius: 999, backgroundColor: colors.bg.secondary, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '600' }}>
                              {actionLabel}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )
              )}
              </View>
            </View>
          ) : null}

          {activePartnerSection === 'issues' ? (
            <View style={{ marginTop: isMobile ? 16 : 0 }}>
              {partnerJobIssues.length === 0 ? (
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>No issues reported</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                    Report an issue from a job's menu if something's wrong with the work — it holds that job's payment until resolved.
                  </Text>
                </View>
              ) : isDesktop ? (
                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                    <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CUSTOMER NAME</Text>
                    <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CATEGORY</Text>
                    <Text style={{ color: colors.text.muted, flex: 0.9, minWidth: 110, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>SERVICE</Text>
                    <Text style={{ color: colors.text.muted, flex: 1.6, minWidth: 200, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>ISSUE DESCRIPTION</Text>
                    <Text style={{ color: colors.text.muted, flex: 0.8, minWidth: 100, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
                    <Text style={{ color: colors.text.muted, width: 130, paddingLeft: 10, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>ACTION</Text>
                  </View>
                  {[...partnerJobIssues]
                    .sort((a, b) => {
                      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
                      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    })
                    .map((issue, index) => {
                      const job = partnerJobs.find((j) => j.id === issue.jobId);
                      const isOpen = issue.status === 'open';
                      return (
                        <Pressable
                          key={issue.id}
                          onPress={() => openIssueDetail(issue)}
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
                              {job?.customerName ?? 'Unknown customer'}
                            </Text>
                          </View>
                          <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                              {job?.jobType || '—'}
                            </Text>
                          </View>
                          <View style={{ flex: 0.9, minWidth: 110, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                              {job?.jobService || '—'}
                            </Text>
                          </View>
                          <View style={{ flex: 1.6, minWidth: 200, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={2}>
                              {issue.description}
                            </Text>
                          </View>
                          <View style={{ flex: 0.8, minWidth: 100, paddingRight: 10 }}>
                            <View
                              style={{
                                alignSelf: 'flex-start',
                                paddingHorizontal: 10,
                                height: 24,
                                borderRadius: 999,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isOpen ? hexToRgba('#DC2626', 0.14) : hexToRgba('#16A34A', 0.14),
                              }}
                            >
                              <Text style={{ color: isOpen ? '#DC2626' : '#16A34A', fontSize: 11, fontWeight: '600' }}>
                                {isOpen ? 'Open' : 'Resolved'}
                              </Text>
                            </View>
                          </View>
                          <View style={{ width: 130, paddingLeft: 10, alignItems: 'flex-end' }}>
                            {isOpen ? (
                              <Pressable
                                onPress={(e) => { e.stopPropagation(); handleResolveIssue(issue); }}
                                style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Resolve</Text>
                              </Pressable>
                            ) : (
                              <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                                {issue.resolvedAt ? formatDate(issue.resolvedAt) : '—'}
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {[...partnerJobIssues]
                    .sort((a, b) => {
                      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
                      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    })
                    .map((issue) => {
                      const job = partnerJobs.find((j) => j.id === issue.jobId);
                      const isOpen = issue.status === 'open';
                      return (
                        <Pressable
                          key={issue.id}
                          onPress={() => openIssueDetail(issue)}
                          style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 14 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                                {job?.customerName ?? 'Unknown customer'}
                              </Text>
                              <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                                {job?.jobType || '—'} • {job?.jobService || '—'}
                              </Text>
                            </View>
                            <View
                              style={{
                                paddingHorizontal: 9,
                                height: 22,
                                borderRadius: 999,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isOpen ? hexToRgba('#DC2626', 0.14) : hexToRgba('#16A34A', 0.14),
                              }}
                            >
                              <Text style={{ color: isOpen ? '#DC2626' : '#16A34A', fontSize: 10, fontWeight: '600' }}>
                                {isOpen ? 'Open' : 'Resolved'}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 17, marginTop: 8 }} numberOfLines={3}>
                            {issue.description}
                          </Text>
                          {isOpen ? (
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); handleResolveIssue(issue); }}
                              style={{ height: 34, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Mark Resolved</Text>
                            </Pressable>
                          ) : null}
                        </Pressable>
                      );
                    })}
                </View>
              )}
            </View>
          ) : null}

          {/* Partner directory with portal links */}
          {activePartnerSection === 'all' ? (
            <View style={{ marginTop: 20 }}>
              {partners.length === 0 ? (
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 24, alignItems: 'center' }}>
                  <Truck size={24} color={colors.text.tertiary} strokeWidth={1.8} />
                  <Text style={{ color: colors.text.primary, fontWeight: '600', marginTop: 10 }}>No partners yet</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                    Add an external business partner before creating jobs.
                  </Text>
                  <Pressable
                    onPress={() => setShowAddPartnerModal(true)}
                    style={{ marginTop: 14, height: 40, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 12.5, fontWeight: '600' }}>+ Add Partner</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                  {isDesktop ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                        <Text style={{ color: colors.text.muted, flex: 0.55, minWidth: 76, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>PARTNER</Text>
                        <Text style={{ color: colors.text.muted, flex: 1.35, minWidth: 180, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>BUSINESS NAME</Text>
                        <Text style={{ color: colors.text.muted, flex: 1.1, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>CONTACT NAME</Text>
                        <Text style={{ color: colors.text.muted, flex: 1.05, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>PHONE</Text>
                        <Text style={{ color: colors.text.muted, flex: 1.05, minWidth: 140, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>EMAIL</Text>
                        <Text style={{ color: colors.text.muted, flex: 0.75, minWidth: 92, paddingRight: 10, fontSize: 10, fontWeight: '600' }}>STATUS</Text>
                        <Text style={{ color: colors.text.muted, flex: 0.85, minWidth: 105, paddingRight: 24, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>CREATED</Text>
                        <Text style={{ color: colors.text.muted, width: 140, paddingLeft: 18, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>ACTION</Text>
                      </View>
                      {partners.map((partner, index) => (
                        <Pressable
                          key={partner.id}
                          onPress={() => openPartnerEditor(partner)}
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
                          <View style={{ flex: 0.55, minWidth: 76, paddingRight: 10 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{getInitials(partner.name)}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 1.35, minWidth: 180, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{partner.name}</Text>
                          </View>
                          <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{partner.contactName || '—'}</Text>
                          </View>
                          <View style={{ flex: 1.05, minWidth: 140, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{partner.phone || '—'}</Text>
                          </View>
                          <View style={{ flex: 1.05, minWidth: 140, paddingRight: 10 }}>
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{partner.email || '—'}</Text>
                          </View>
                          <View style={{ flex: 0.75, minWidth: 92, paddingRight: 10 }}>
                            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: 999, backgroundColor: partner.isActive ? '#E6F7EC' : '#F4F4F0', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: partner.isActive ? '#16A34A' : colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>{partner.isActive ? 'Active' : 'Inactive'}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 0.85, minWidth: 105, paddingRight: 24, alignItems: 'flex-end' }}>
                            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{formatDate(partner.createdAt)}</Text>
                          </View>
                          <View style={{ width: 140, paddingLeft: 18, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); handleCopyPartnerLink(partner.magicLinkToken, partner.name); }}
                              style={{ height: 30, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            >
                              <Copy size={12} color={colors.text.secondary} strokeWidth={2} />
                              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Copy</Text>
                            </Pressable>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); handleRequestDeletePartner(partner); }}
                              style={{ width: 30, height: 30, borderRadius: 999, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Trash2 size={13} color="#DC2626" strokeWidth={2} />
                            </Pressable>
                          </View>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    partners.map((partner, index) => (
                      <Pressable
                        key={partner.id}
                        onPress={() => openPartnerEditor(partner)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{getInitials(partner.name)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{partner.name}</Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                            {[partner.contactName, partner.phone].filter(Boolean).join(' · ') || 'No contact info'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={(e) => { e.stopPropagation(); handleCopyPartnerLink(partner.magicLinkToken, partner.name); }}
                            style={{ height: 30, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                          >
                            <Copy size={12} color={colors.text.secondary} strokeWidth={2} />
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Copy</Text>
                          </Pressable>
                          <Pressable
                            onPress={(e) => { e.stopPropagation(); handleRequestDeletePartner(partner); }}
                            style={{ width: 30, height: 30, borderRadius: 999, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={13} color="#DC2626" strokeWidth={2} />
                          </Pressable>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>

        {toastMessage ? (
          <View style={{ position: 'absolute', bottom: 24 + tabBarHeight, alignSelf: 'center', borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{toastMessage}</Text>
          </View>
        ) : null}

        {isMobile ? (
          <>
            <Modal visible={showMobilePartnerMenu} transparent animationType="fade" onRequestClose={() => setShowMobilePartnerMenu(false)}>
              <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }} onPress={() => setShowMobilePartnerMenu(false)}>
                <View
                  style={{
                    position: 'absolute',
                    right: 16,
                    bottom: Math.max(84, tabBarHeight + 28),
                    width: 196,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.card,
                    overflow: 'hidden',
                    shadowColor: '#000000',
                    shadowOpacity: 0.18,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: 8,
                  }}
                >
                  <Pressable onPress={(event) => event.stopPropagation()}>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Partner Menu</Text>
                    </View>
                    {partnerSectionItems.map((item, index) => {
                      const selected = activePartnerSection === item.key;
                      const badgeCount = item.key === 'issues' ? openPartnerIssueCount : 0;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => selectPartnerSection(item.key)}
                          style={{
                            minHeight: 46,
                            paddingHorizontal: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTopWidth: index === 0 ? 0 : 1,
                            borderTopColor: colors.border.light,
                            backgroundColor: selected ? colors.bg.secondary : colors.bg.card,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: selected ? colors.text.primary : colors.text.secondary, fontSize: 13, fontWeight: selected ? '600' : '500' }}>
                              {item.label}
                            </Text>
                            {badgeCount > 0 ? (
                              <View
                                style={{
                                  minWidth: 18,
                                  height: 18,
                                  borderRadius: 9,
                                  backgroundColor: '#EF4444',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  paddingHorizontal: 5,
                                }}
                              >
                                <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' }}>
                                  {badgeCount > 99 ? '99+' : badgeCount}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {selected ? <Check size={14} color={colors.text.primary} strokeWidth={2.4} /> : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => { setShowMobilePartnerMenu(false); router.push('/insights/partner-jobs' as never); }}
                      style={{ minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border.light }}
                    >
                      <BarChart3 size={15} color={colors.text.secondary} strokeWidth={2} />
                      <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }}>Reports</Text>
                    </Pressable>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>

            <Pressable
              onPress={() => {
                closeJobMenus();
                setShowMobilePartnerMenu(true);
              }}
              style={{
                position: 'absolute',
                right: 18,
                bottom: Math.max(12, tabBarHeight - 30),
                width: 58,
                height: 58,
                borderRadius: 29,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.text.primary,
                shadowColor: '#000000',
                shadowOpacity: 0.22,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
                zIndex: 50,
              }}
            >
              <Menu size={24} color={colors.bg.primary} strokeWidth={2.6} />
            </Pressable>
          </>
        ) : null}
      </SafeAreaView>

      {/* Add partner modal */}
      <Modal visible={showAddPartnerModal} transparent animationType="fade" onRequestClose={() => setShowAddPartnerModal(false)}>
        <Pressable
          onPress={() => { setShowAddPartnerModal(false); setLastCreatedPartnerLink(null); setLastCreatedPartnerId(null); setLastCreatedPartnerName(null); setPartnerInvite(null); setInviteEmailDraft(''); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, maxHeight: '86%', borderRadius: 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Add partner</Text>
              <Pressable onPress={() => { setShowAddPartnerModal(false); setLastCreatedPartnerLink(null); setLastCreatedPartnerId(null); setLastCreatedPartnerName(null); setPartnerInvite(null); setInviteEmailDraft(''); }} style={{ padding: 4 }}>
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} showsVerticalScrollIndicator={false}>
            {lastCreatedPartnerLink ? (
              <View style={{ gap: 12 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12.5 }}>
                  Partner added. To get them into the app (including notifications on their phone), give them their own login instead of just a link.
                </Text>

                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Invite to portal</Text>
                    {partnerInvite ? (
                      <View style={{ paddingHorizontal: 10, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: partnerInvite.status === 'joined' ? '#E6F7EC' : '#FEF6E0' }}>
                        <Text style={{ color: partnerInvite.status === 'joined' ? '#16A34A' : '#B45309', fontSize: 10, fontWeight: '600' }}>
                          {partnerInvite.status === 'joined' ? 'Account created' : 'Invite sent'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                    They'll set their own password and be able to log in on their phone or computer.
                  </Text>
                  {partnerInvite ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{partnerInvite.email}</Text>
                      {partnerInvite.status === 'pending' ? (
                        <Pressable
                          onPress={() => handleCopyPartnerInviteLink(partnerInvite.inviteCode, lastCreatedPartnerName ?? undefined)}
                          style={{ height: 44, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                        >
                          <Copy size={14} color={colors.bg.primary} strokeWidth={2} />
                          <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '600' }}>Copy invite link</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        value={inviteEmailDraft}
                        onChangeText={setInviteEmailDraft}
                        placeholder="Partner's email"
                        placeholderTextColor={colors.text.tertiary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={{ height: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 16, color: colors.text.primary, fontSize: 13 }}
                      />
                      <Pressable
                        onPress={() => handleCreatePartnerInvite(lastCreatedPartnerId ?? undefined)}
                        disabled={!inviteEmailDraft.trim() || isCreatingInvite}
                        style={{ height: 44, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: !inviteEmailDraft.trim() || isCreatingInvite ? 0.5 : 1 }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '600' }}>
                          {isCreatingInvite ? 'Creating…' : 'Create invite & copy link'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => handleCopyPartnerLink(lastCreatedPartnerLink, lastCreatedPartnerName ?? undefined)}
                  style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                    Or copy a read-only link (no login, no notifications)
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => { setShowAddPartnerModal(false); setLastCreatedPartnerLink(null); setLastCreatedPartnerId(null); setLastCreatedPartnerName(null); setPartnerInvite(null); setInviteEmailDraft(''); }}
                  style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.text.secondary, fontSize: 12.5, fontWeight: '600' }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={newPartnerName}
                  onChangeText={setNewPartnerName}
                  placeholder="Business name (e.g. Vision Plus)"
                  placeholderTextColor={colors.text.tertiary}
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 14 }}
                />
                <TextInput
                  value={newPartnerContact}
                  onChangeText={setNewPartnerContact}
                  placeholder="Contact name (optional)"
                  placeholderTextColor={colors.text.tertiary}
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 14 }}
                />
                <TextInput
                  value={newPartnerPhone}
                  onChangeText={setNewPartnerPhone}
                  placeholder="Phone (optional)"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="phone-pad"
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 14 }}
                />
                <TextInput
                  value={newPartnerEmail}
                  onChangeText={setNewPartnerEmail}
                  placeholder="Email (optional)"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 14 }}
                />
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Billing cycle</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                    How this partner's jobs are grouped for billing in their portal.
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(['manual', 'weekly', 'biweekly', 'monthly'] as PartnerBillingCycle[]).map((cycle) => {
                      const selected = newPartnerBillingCycle === cycle;
                      return (
                        <Pressable
                          key={cycle}
                          onPress={() => setNewPartnerBillingCycle(cycle)}
                          style={{ height: 34, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.text.primary : colors.bg.secondary, borderWidth: 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                        >
                          <Text style={{ color: selected ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{cycle}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Business statuses</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                    Statuses your business can set for this partner. Partners will see these updates.
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {newPartnerStatuses.map((status) => {
                      const meta = getDraftStatusMeta(status, statusBusinessName, newPartnerStatusColors);
                      return (
                        <Pressable
                          key={status}
                          onPress={() => setNewPartnerStatuses((current) => current.length > 1 ? current.filter((item) => item !== status) : current)}
                          style={{ height: 34, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: meta.bg, borderWidth: 1, borderColor: meta.bg }}
                        >
                          <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }}>{meta.label} ×</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {PARTNER_STATUS_OPTIONS.filter((status) => !newPartnerStatuses.includes(status)).map((status) => {
                      const meta = getDraftStatusMeta(status, statusBusinessName, newPartnerStatusColors);
                      return (
                        <Pressable
                          key={status}
                          onPress={() => setNewPartnerStatuses((current) => [...current, status])}
                          style={{ height: 32, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>+ {meta.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {STATUS_COLOR_OPTIONS.map((color) => {
                      const selected = newPartnerBusinessColor.bg === color.bg && newPartnerBusinessColor.text === color.text;
                      return (
                        <Pressable
                          key={`new-business-${color.bg}`}
                          onPress={() => setNewPartnerBusinessColor(color)}
                          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.text, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                        />
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      value={newPartnerStatusInput}
                      onChangeText={setNewPartnerStatusInput}
                      onSubmitEditing={() => {
                        setNewPartnerStatuses((current) => addUniqueStatus(current, newPartnerStatusInput));
                        setNewPartnerStatusColors((current) => assignStatusColor(current, newPartnerStatusInput, newPartnerBusinessColor));
                        setNewPartnerStatusInput('');
                      }}
                      placeholder="Add custom status, e.g. Pickup requested"
                      placeholderTextColor={colors.text.tertiary}
                      style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 13 }}
                    />
                    <Pressable
                      onPress={() => {
                        setNewPartnerStatuses((current) => addUniqueStatus(current, newPartnerStatusInput));
                        setNewPartnerStatusColors((current) => assignStatusColor(current, newPartnerStatusInput, newPartnerBusinessColor));
                        setNewPartnerStatusInput('');
                      }}
                      style={{ height: 42, borderRadius: 10, backgroundColor: colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Add</Text>
                    </Pressable>
                  </View>
                </View>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Partner statuses</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                    Statuses this partner can set from their side. Your business will see these updates.
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {newPartnerPortalStatuses.map((status) => {
                      const meta = getDraftStatusMeta(status, statusBusinessName, newPartnerStatusColors);
                      return (
                        <Pressable
                          key={status}
                          onPress={() => setNewPartnerPortalStatuses((current) => current.length > 1 ? current.filter((item) => item !== status) : current)}
                          style={{ height: 34, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: meta.bg, borderWidth: 1, borderColor: meta.bg }}
                        >
                          <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }}>{meta.label} ×</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {PARTNER_STATUS_OPTIONS.filter((status) => !newPartnerPortalStatuses.includes(status)).map((status) => {
                      const meta = getDraftStatusMeta(status, statusBusinessName, newPartnerStatusColors);
                      return (
                        <Pressable
                          key={status}
                          onPress={() => setNewPartnerPortalStatuses((current) => [...current, status])}
                          style={{ height: 32, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>+ {meta.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {STATUS_COLOR_OPTIONS.map((color) => {
                      const selected = newPartnerPortalColor.bg === color.bg && newPartnerPortalColor.text === color.text;
                      return (
                        <Pressable
                          key={`new-portal-${color.bg}`}
                          onPress={() => setNewPartnerPortalColor(color)}
                          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.text, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                        />
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      value={newPartnerPortalStatusInput}
                      onChangeText={setNewPartnerPortalStatusInput}
                      onSubmitEditing={() => {
                        setNewPartnerPortalStatuses((current) => addUniqueStatus(current, newPartnerPortalStatusInput));
                        setNewPartnerStatusColors((current) => assignStatusColor(current, newPartnerPortalStatusInput, newPartnerPortalColor));
                        setNewPartnerPortalStatusInput('');
                      }}
                      placeholder="Add partner status, e.g. Ready for pickup"
                      placeholderTextColor={colors.text.tertiary}
                      style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 13 }}
                    />
                    <Pressable
                      onPress={() => {
                        setNewPartnerPortalStatuses((current) => addUniqueStatus(current, newPartnerPortalStatusInput));
                        setNewPartnerStatusColors((current) => assignStatusColor(current, newPartnerPortalStatusInput, newPartnerPortalColor));
                        setNewPartnerPortalStatusInput('');
                      }}
                      style={{ height: 42, borderRadius: 10, backgroundColor: colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Add</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable
                  onPress={handleCreatePartner}
                  disabled={!newPartnerName.trim()}
                  style={{ height: 46, borderRadius: 999, backgroundColor: newPartnerName.trim() ? colors.text.primary : colors.bg.secondary, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                >
                  <Text style={{ color: newPartnerName.trim() ? colors.bg.primary : colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Add partner</Text>
                </Pressable>
              </>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit partner modal */}
      <Modal
        visible={Boolean(editingPartner)}
        transparent={!isMobile}
        animationType="fade"
        presentationStyle={isMobile ? 'fullScreen' : 'overFullScreen'}
        onRequestClose={closePartnerEditor}
      >
        <Pressable
          onPress={closePartnerEditor}
          style={{
            flex: 1,
            backgroundColor: isMobile ? colors.bg.primary : 'rgba(0,0,0,0.28)',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: isMobile ? 'flex-start' : 'center',
            padding: isMobile ? 0 : 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: isMobile ? '100%' : undefined,
              maxWidth: isMobile ? undefined : 760,
              maxHeight: isMobile ? undefined : '88%',
              borderRadius: isMobile ? 0 : 22,
              backgroundColor: colors.bg.primary,
              borderWidth: isMobile ? 0 : 1,
              borderColor: colors.border.light,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOpacity: isMobile ? 0 : 0.16,
              shadowRadius: isMobile ? 0 : 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: isMobile ? 0 : 18,
            }}
          >
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={isMobile ? ['top', 'bottom'] : []}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: isMobile ? 18 : 22, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.card }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Partner settings</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginTop: 3 }}>
                  Manage profile, billing, and the statuses both sides can use.
                </Text>
              </View>
              <Pressable onPress={closePartnerEditor} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 20, gap: 14 }} showsVerticalScrollIndicator={false}>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Partner details</Text>
                <TextInput
                  value={editPartnerName}
                  onChangeText={setEditPartnerName}
                  placeholder="Business name"
                  placeholderTextColor={colors.text.tertiary}
                  style={{ height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, color: colors.text.primary, fontSize: 14, marginTop: 12 }}
                />
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, marginTop: 10 }}>
                  <TextInput
                    value={editPartnerContact}
                    onChangeText={setEditPartnerContact}
                    placeholder="Contact name"
                    placeholderTextColor={colors.text.tertiary}
                    style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, color: colors.text.primary, fontSize: 14 }}
                  />
                  <TextInput
                    value={editPartnerPhone}
                    onChangeText={setEditPartnerPhone}
                    placeholder="Phone"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="phone-pad"
                    style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, color: colors.text.primary, fontSize: 14 }}
                  />
                </View>
                <TextInput
                  value={editPartnerEmail}
                  onChangeText={setEditPartnerEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{ height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, color: colors.text.primary, fontSize: 14, marginTop: 10 }}
                />
                <TextInput
                  value={editPartnerNotes}
                  onChangeText={setEditPartnerNotes}
                  placeholder="Notes about what this partner handles"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 14, paddingVertical: 14, color: colors.text.primary, fontSize: 14, textAlignVertical: 'top', marginTop: 10 }}
                />
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Invite to portal</Text>
                  {partnerInvite ? (
                    <View style={{ paddingHorizontal: 10, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: partnerInvite.status === 'joined' ? '#E6F7EC' : '#FEF6E0' }}>
                      <Text style={{ color: partnerInvite.status === 'joined' ? '#16A34A' : '#B45309', fontSize: 10, fontWeight: '600' }}>
                        {partnerInvite.status === 'joined' ? 'Account created' : 'Invite sent'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Let this partner sign in with an email and password instead of only the portal link.
                </Text>
                {isLoadingPartnerInvite ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Loading…</Text>
                ) : partnerInvite ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{partnerInvite.email}</Text>
                    {partnerInvite.status === 'pending' ? (
                      <Pressable
                        onPress={() => handleCopyPartnerInviteLink(partnerInvite.inviteCode, editingPartner?.name)}
                        style={{ height: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Copy invite link</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={inviteEmailDraft}
                      onChangeText={setInviteEmailDraft}
                      placeholder="Partner's email"
                      placeholderTextColor={colors.text.tertiary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{ flex: 0.7, height: 52, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 16, color: colors.text.primary, fontSize: 13 }}
                    />
                    <Pressable
                      onPress={() => handleCreatePartnerInvite()}
                      disabled={!inviteEmailDraft.trim() || isCreatingInvite}
                      style={{ flex: 0.3, height: 52, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: !inviteEmailDraft.trim() || isCreatingInvite ? 0.5 : 1 }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>Invite</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Job category</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Shared across all partners. Choose from these instead of typing when sending a job.
                </Text>
                {isLoadingJobTaxonomy ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Loading…</Text>
                ) : (
                  <>
                    {jobCategoryList.length > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {jobCategoryList.map((category) => (
                          <View
                            key={category}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: 999, paddingLeft: 12, paddingRight: 8, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{category}</Text>
                            <Pressable
                              onPress={() => handleDeleteJobCategory(category)}
                              disabled={isSavingJobTaxonomy}
                              style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <X size={12} color={colors.text.tertiary} strokeWidth={2.4} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 10 }}>No categories yet.</Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={newJobCategoryDraft}
                        onChangeText={setNewJobCategoryDraft}
                        placeholder="e.g. Prescription"
                        placeholderTextColor={colors.text.tertiary}
                        onSubmitEditing={handleAddJobCategory}
                        style={{ flex: 0.7, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 16, color: colors.text.primary, fontSize: 13 }}
                      />
                      <Pressable
                        onPress={handleAddJobCategory}
                        disabled={!newJobCategoryDraft.trim() || isSavingJobTaxonomy}
                        style={{ flex: 0.3, height: 44, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: !newJobCategoryDraft.trim() || isSavingJobTaxonomy ? 0.5 : 1 }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>Add</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Services</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  A separate list to group the services you provide (e.g. Blue light, Photochromic, Antiglare). Not tied to a specific category.
                </Text>
                {isLoadingJobTaxonomy ? (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>Loading…</Text>
                ) : (
                  <>
                    {jobServiceList.length > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {jobServiceList.map((service) => (
                          <View
                            key={service}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: 999, paddingLeft: 12, paddingRight: 8, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{service}</Text>
                            <Pressable
                              onPress={() => handleDeleteJobService(service)}
                              disabled={isSavingJobTaxonomy}
                              style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <X size={12} color={colors.text.tertiary} strokeWidth={2.4} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 10 }}>No services yet.</Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={newJobServiceDraft}
                        onChangeText={setNewJobServiceDraft}
                        placeholder="e.g. Blue light"
                        placeholderTextColor={colors.text.tertiary}
                        onSubmitEditing={handleAddJobService}
                        style={{ flex: 0.7, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 16, color: colors.text.primary, fontSize: 13 }}
                      />
                      <Pressable
                        onPress={handleAddJobService}
                        disabled={!newJobServiceDraft.trim() || isSavingJobTaxonomy}
                        style={{ flex: 0.3, height: 44, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: !newJobServiceDraft.trim() || isSavingJobTaxonomy ? 0.5 : 1 }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>Add</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Billing cycle</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  How this partner's jobs are grouped for billing in their portal.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['manual', 'weekly', 'biweekly', 'monthly'] as PartnerBillingCycle[]).map((cycle) => {
                    const selected = editPartnerBillingCycle === cycle;
                    return (
                      <Pressable
                        key={cycle}
                        onPress={() => setEditPartnerBillingCycle(cycle)}
                        style={{ height: 34, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.text.primary : colors.bg.secondary, borderWidth: 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                      >
                        <Text style={{ color: selected ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{cycle}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Business statuses</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Statuses your business can set for this partner. Partners will see these updates.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {editPartnerStatuses.map((status) => {
                    const meta = getDraftStatusMeta(status, statusBusinessName, editPartnerStatusColors);
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setEditPartnerStatuses((current) => current.length > 1 ? current.filter((item) => item !== status) : current)}
                        style={{ height: 32, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: meta.bg, borderWidth: 1, borderColor: meta.text }}
                      >
                        <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }}>{meta.label} ×</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {PARTNER_STATUS_OPTIONS.filter((status) => !editPartnerStatuses.includes(status)).map((status) => {
                    const meta = getDraftStatusMeta(status, statusBusinessName, editPartnerStatusColors);
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setEditPartnerStatuses((current) => [...current, status])}
                        style={{ height: 32, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>+ {meta.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>New status colour</Text>
                    <View style={{ height: 24, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: editPartnerBusinessColor.bg, borderWidth: 1, borderColor: editPartnerBusinessColor.text }}>
                      <Text style={{ color: editPartnerBusinessColor.text, fontSize: 10, fontWeight: '600' }}>Preview</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {STATUS_COLOR_OPTIONS.map((color) => {
                      const selected = editPartnerBusinessColor.bg === color.bg && editPartnerBusinessColor.text === color.text;
                      return (
                        <Pressable
                          key={`edit-business-${color.bg}`}
                          onPress={() => setEditPartnerBusinessColor(color)}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color.text, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                        />
                      );
                    })}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TextInput
                    value={editPartnerStatusInput}
                    onChangeText={setEditPartnerStatusInput}
                    onSubmitEditing={() => {
                      setEditPartnerStatuses((current) => addUniqueStatus(current, editPartnerStatusInput));
                      setEditPartnerStatusColors((current) => assignStatusColor(current, editPartnerStatusInput, editPartnerBusinessColor));
                      setEditPartnerStatusInput('');
                    }}
                    placeholder="Add business status, e.g. Received"
                    placeholderTextColor={colors.text.tertiary}
                    style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 13 }}
                  />
                  <Pressable
                    onPress={() => {
                      setEditPartnerStatuses((current) => addUniqueStatus(current, editPartnerStatusInput));
                      setEditPartnerStatusColors((current) => assignStatusColor(current, editPartnerStatusInput, editPartnerBusinessColor));
                      setEditPartnerStatusInput('');
                    }}
                    style={{ height: 42, borderRadius: 10, backgroundColor: colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Add</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' }}>Partner statuses</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Statuses this partner can set from their side. Your business will see these updates.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {editPartnerPortalStatuses.map((status) => {
                    const meta = getDraftStatusMeta(status, statusBusinessName, editPartnerStatusColors);
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setEditPartnerPortalStatuses((current) => current.length > 1 ? current.filter((item) => item !== status) : current)}
                        style={{ height: 32, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: meta.bg, borderWidth: 1, borderColor: meta.text }}
                      >
                        <Text style={{ color: meta.text, fontSize: 12, fontWeight: '600' }}>{meta.label} ×</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {PARTNER_STATUS_OPTIONS.filter((status) => !editPartnerPortalStatuses.includes(status)).map((status) => {
                    const meta = getDraftStatusMeta(status, statusBusinessName, editPartnerStatusColors);
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setEditPartnerPortalStatuses((current) => [...current, status])}
                        style={{ height: 32, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>+ {meta.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>New status colour</Text>
                    <View style={{ height: 24, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: editPartnerPortalColor.bg, borderWidth: 1, borderColor: editPartnerPortalColor.text }}>
                      <Text style={{ color: editPartnerPortalColor.text, fontSize: 10, fontWeight: '600' }}>Preview</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {STATUS_COLOR_OPTIONS.map((color) => {
                      const selected = editPartnerPortalColor.bg === color.bg && editPartnerPortalColor.text === color.text;
                      return (
                        <Pressable
                          key={`edit-portal-${color.bg}`}
                          onPress={() => setEditPartnerPortalColor(color)}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color.text, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.text.primary : colors.border.light }}
                        />
                      );
                    })}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TextInput
                    value={editPartnerPortalStatusInput}
                    onChangeText={setEditPartnerPortalStatusInput}
                    onSubmitEditing={() => {
                      setEditPartnerPortalStatuses((current) => addUniqueStatus(current, editPartnerPortalStatusInput));
                      setEditPartnerStatusColors((current) => assignStatusColor(current, editPartnerPortalStatusInput, editPartnerPortalColor));
                      setEditPartnerPortalStatusInput('');
                    }}
                    placeholder="Add partner status, e.g. Ready for pickup"
                    placeholderTextColor={colors.text.tertiary}
                    style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 13 }}
                  />
                  <Pressable
                    onPress={() => {
                      setEditPartnerPortalStatuses((current) => addUniqueStatus(current, editPartnerPortalStatusInput));
                      setEditPartnerStatusColors((current) => assignStatusColor(current, editPartnerPortalStatusInput, editPartnerPortalColor));
                      setEditPartnerPortalStatusInput('');
                    }}
                    style={{ height: 42, borderRadius: 10, backgroundColor: colors.text.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>Add</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                <Pressable
                  onPress={() => setEditPartnerIsActive((value) => !value)}
                  style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Partner active</Text>
                  <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: editPartnerIsActive ? colors.text.primary : colors.border.light, padding: 3, alignItems: editPartnerIsActive ? 'flex-end' : 'flex-start' }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg.primary }} />
                  </View>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
                <Pressable
                  onPress={() => editingPartner ? handleRequestDeletePartner(editingPartner) : undefined}
                  style={{ width: 46, height: 46, borderRadius: 999, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={closePartnerEditor}
                  style={{ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSavePartner}
                  disabled={!editPartnerName.trim()}
                  style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: editPartnerName.trim() ? colors.text.primary : colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: editPartnerName.trim() ? colors.bg.primary : colors.text.tertiary, fontSize: 13, fontWeight: '600' }}>Save partner</Text>
                </Pressable>
              </View>
            </ScrollView>
            {toastMessage ? (
              <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center', borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{toastMessage}</Text>
              </View>
            ) : null}
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete partner confirmation */}
      <Modal visible={Boolean(partnerPendingDelete)} transparent animationType="fade" onRequestClose={() => setPartnerPendingDelete(null)}>
        <Pressable
          onPress={() => setPartnerPendingDelete(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 390, borderRadius: 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}
          >
            <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Delete partner?</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>
                {partnerPendingDelete ? `This will remove ${partnerPendingDelete.name} from your all partners list. Existing jobs stay in the job history.` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, padding: 18, borderTopWidth: 1, borderTopColor: colors.border.light }}>
              <Pressable
                onPress={() => setPartnerPendingDelete(null)}
                style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDeletePartner}
                style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(jobPendingDelete)} transparent animationType="fade" onRequestClose={() => setJobPendingDelete(null)}>
        <Pressable
          onPress={() => setJobPendingDelete(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 390, borderRadius: 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}
          >
            <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Delete job?</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>
                {jobPendingDelete ? `This will permanently remove ${jobPendingDelete.customerName || 'this job'} from the job history. This can't be undone.` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, padding: 18, borderTopWidth: 1, borderTopColor: colors.border.light }}>
              <Pressable
                onPress={() => setJobPendingDelete(null)}
                style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDeleteJob}
                style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bill review modal */}
      <Modal visible={Boolean(activeBill)} transparent animationType="fade" onRequestClose={closeBillReview}>
        <Pressable
          onPress={closeBillReview}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}
          >
            {activeBill ? (
              <>
                <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>{activeBill.partner.name}</Text>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        height: 24,
                        borderRadius: 999,
                        backgroundColor: BILL_STATUS_META[activeBill.status].bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: BILL_STATUS_META[activeBill.status].text, fontSize: 12, fontWeight: '600' }}>
                        {BILL_STATUS_META[activeBill.status].label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12.5, marginTop: 6 }}>
                    {activeBill.jobCount} {activeBill.jobCount === 1 ? 'job' : 'jobs'} · Submitted {formatDate(activeBill.submittedAt)}
                  </Text>
                  <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700', marginTop: 12 }}>
                    {formatCurrency(activeBill.total)}
                  </Text>
                  {activeBill.note ? (
                    <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.bg.secondary, padding: 12 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {activeBill.status === 'rejected' ? 'Rejection note' : 'Query note'}
                      </Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 4 }}>{activeBill.note}</Text>
                    </View>
                  ) : null}

                  {activeBill.status === 'pending' ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>
                        Note (required for reject or query)
                      </Text>
                      <TextInput
                        value={billNoteDraft}
                        onChangeText={setBillNoteDraft}
                        placeholder="Add a reason the partner will see..."
                        placeholderTextColor={colors.input.placeholder}
                        multiline
                        style={{
                          minHeight: 70,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.input.bg,
                          color: colors.input.text,
                          fontSize: 13,
                          padding: 12,
                          textAlignVertical: 'top',
                        }}
                      />
                    </View>
                  ) : null}
                </View>

                <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
                  {activeBill.status === 'pending' ? (
                    <>
                      <Pressable
                        onPress={handleApproveActiveBill}
                        style={{ height: 46, borderRadius: 12, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '700' }}>Approve Bill</Text>
                      </Pressable>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                          onPress={handleQueryActiveBill}
                          style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Query</Text>
                        </Pressable>
                        <Pressable
                          onPress={handleRejectActiveBill}
                          style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>Reject</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : activeBill.status === 'approved' ? (
                    <Pressable
                      onPress={handleMarkActiveBillPaid}
                      style={{ height: 46, borderRadius: 12, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '700' }}>Mark Paid</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={closeBillReview}
                    style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Close</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Job detail */}
      <Modal
        visible={!!activeMobileJob}
        transparent={!isMobile}
        animationType="none"
        presentationStyle={isMobile ? 'fullScreen' : 'overFullScreen'}
        onRequestClose={() => { setActiveMobileJobId(null); setShowMobileJobStatusOptions(false); setShowMobileJobActionMenu(false); }}
      >
        <Pressable
          onPress={() => { setActiveMobileJobId(null); setShowMobileJobStatusOptions(false); setShowMobileJobActionMenu(false); }}
          disabled={isMobile}
          style={{
            flex: 1,
            backgroundColor: isMobile ? colors.bg.primary : 'rgba(0,0,0,0.18)',
            alignItems: isMobile ? 'stretch' : 'flex-end',
            justifyContent: 'flex-start',
            padding: 0,
          }}
        >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            width: isMobile ? '100%' : 460,
            height: '100%',
            maxWidth: isMobile ? undefined : 560,
            maxHeight: undefined,
            borderRadius: 0,
            overflow: 'hidden',
            backgroundColor: colors.bg.primary,
            ...(isMobile
              ? { borderWidth: 0 }
              : {
                  borderLeftWidth: 1,
                  borderLeftColor: colors.border.light,
                }),
          }}
        >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={isMobile ? ['top', 'bottom'] : []}>
          {activeMobileJob ? (() => {
            const partner = partnerById.get(activeMobileJob.partnerId);
            const order = activeMobileJob.orderId ? orderById.get(activeMobileJob.orderId) : null;
            const meta = getPartnerStatusMeta(activeMobileJob.status, statusBusinessName, partner);
            const statusFlow = getPartnerBusinessStatusFlow(partner);
            const orderNumber = order?.orderNumber ?? activeMobileJob.id.slice(-6).toUpperCase();
            const currentStatusBg = hexToRgba(meta.text, 0.16);
            const currentStatusBorder = hexToRgba(meta.text, 0.32);
            const jobThumbnailUrl = getJobThumbnailUrl(activeMobileJob);
            const openIssue = partnerJobIssues.find((i) => i.jobId === activeMobileJob.id && i.status === 'open');
            const isImageAttachment = activeMobileJob.documentMimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(activeMobileJob.documentUrl ?? '');
            const inHouseActivity = [
              { label: 'Job created', value: activeMobileJob.createdAt, actor: activeMobileJob.createdBy || 'Team' },
              ...(activeMobileJob.dispatchedAt ? [{ label: 'Sent to partner', value: activeMobileJob.dispatchedAt, actor: activeMobileJob.createdBy || 'Team' }] : []),
              ...(activeMobileJob.collectedAt ? [{ label: 'Marked collected', value: activeMobileJob.collectedAt, actor: 'Team' }] : []),
              ...(activeMobileJob.billedAt ? [{ label: 'Marked billed', value: activeMobileJob.billedAt, actor: 'Team' }] : []),
              ...(activeMobileJob.billRespondedAt ? [{ label: `Bill ${activeMobileJob.billStatus ?? 'updated'}`, value: activeMobileJob.billRespondedAt, actor: activeMobileJob.billRespondedBy || 'Team' }] : []),
            ];
            const partnerActivity = [
              ...(activeMobileJob.acceptedAt ? [{ label: 'Accepted by partner', value: activeMobileJob.acceptedAt, actor: partner?.name ?? 'Partner' }] : []),
              ...(activeMobileJob.readyAt ? [{ label: 'Marked ready', value: activeMobileJob.readyAt, actor: partner?.name ?? 'Partner' }] : []),
              ...(activeMobileJob.billSubmittedAt ? [{ label: 'Bill submitted', value: activeMobileJob.billSubmittedAt, actor: partner?.name ?? 'Partner' }] : []),
            ];
            const jobActivityEntries = [...inHouseActivity, ...partnerActivity]
              .map((activity) => ({
                key: `${activity.label}-${activity.value}-${activity.actor}`,
                action: activity.label,
                user: activity.actor,
                date: activity.value,
              }))
              .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
            return (
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    position: 'relative',
                    zIndex: 500,
                    elevation: 500,
                    minHeight: 64,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Pressable
                    onPress={() => { setActiveMobileJobId(null); setShowMobileJobStatusOptions(false); setShowMobileJobActionMenu(false); }}
                    style={{ width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.primary} strokeWidth={2.2} />
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                      Partner job
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {order ? orderNumber : `JOB-${orderNumber}`}
                    </Text>
                  </View>
                  <View style={{ position: 'relative', zIndex: 600, elevation: 600 }}>
                    <Pressable
                      onPress={() => setShowMobileJobActionMenu((current) => !current)}
                      style={{ width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}
                    >
                      <MoreVertical size={18} color={colors.text.primary} strokeWidth={2.2} />
                    </Pressable>
                    {showMobileJobActionMenu ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 44,
                          right: 0,
                          minWidth: 156,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.card,
                          overflow: 'hidden',
                          zIndex: 700,
                          shadowColor: '#000000',
                          shadowOpacity: 0.14,
                          shadowRadius: 14,
                          shadowOffset: { width: 0, height: 8 },
                          elevation: 14,
                        }}
                      >
                        <Pressable
                          onPress={() => handleOpenEditJob(activeMobileJob)}
                          style={{ paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 12.5, fontWeight: '500' }}>Edit Job</Text>
                        </Pressable>
                        {!activeMobileJob.hasOpenIssue ? (
                          <Pressable
                            onPress={() => {
                              handleOpenReportIssue(activeMobileJob);
                              setShowMobileJobActionMenu(false);
                            }}
                            style={{ paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                          >
                            <Text style={{ color: '#B45309', fontSize: 12.5, fontWeight: '500' }}>Report Issue</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => {
                            handleSetJobStatus(activeMobileJob, 'cancelled');
                            setShowMobileJobActionMenu(false);
                          }}
                          style={{ paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                        >
                          <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '500' }}>Cancel job</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleRequestDeleteJob(activeMobileJob)}
                          style={{ paddingHorizontal: 14, paddingVertical: 13 }}
                        >
                          <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '500' }}>Delete job</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: 20, paddingBottom: tabBarHeight + 28, gap: 14 }}
                >
                  <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Pressable
                      onPress={() => jobThumbnailUrl && setLightboxImageUrl(jobThumbnailUrl)}
                      disabled={!jobThumbnailUrl}
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
                      {jobThumbnailUrl ? (
                        <ResolvedAttachmentImage imageUrl={jobThumbnailUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Glasses size={28} color={colors.text.tertiary} strokeWidth={1.6} />
                      )}
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>Item</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 3 }} numberOfLines={2}>
                        {activeMobileJob.itemLabel || activeMobileJob.jobType || 'No item name'}
                      </Text>
                    </View>
                  </View>

                  {openIssue ? (
                    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.3)', backgroundColor: hexToRgba('#DC2626', 0.08), padding: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '700' }}>Issue reported — payment on hold</Text>
                      </View>
                      <Text style={{ color: colors.text.primary, fontSize: 12.5, lineHeight: 18 }}>
                        {openIssue.description}
                      </Text>
                      {openIssue.screenshotUrl ? (
                        <Pressable
                          onPress={() => setLightboxImageUrl(openIssue.screenshotUrl ?? null)}
                          style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', marginTop: 10, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <ResolvedAttachmentImage imageUrl={openIssue.screenshotUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => handleResolveIssue(openIssue)}
                        style={{ height: 38, borderRadius: 999, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Mark Resolved</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' }}>
                      Update Status
                    </Text>
                    <Pressable
                      onPress={() => setShowMobileJobStatusOptions((current) => !current)}
                      style={{
                        minHeight: 48,
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: currentStatusBg,
                        borderWidth: 1,
                        borderColor: currentStatusBorder,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: currentStatusBg,
                          marginRight: 12,
                        }}
                      >
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: meta.text }} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>
                          Current status
                        </Text>
                        <Text style={{ color: meta.text, fontSize: 12, fontWeight: '500', marginTop: 2 }} numberOfLines={1}>
                          {meta.label}
                        </Text>
                      </View>
                      <ChevronDown size={18} color={meta.text} strokeWidth={2.2} />
                    </Pressable>
                    {showMobileJobStatusOptions ? (
                      <View style={{ gap: 8, marginTop: 10 }}>
                        {statusFlow.map((status) => {
                          const optionMeta = getPartnerStatusMeta(status, statusBusinessName, partner);
                          const selected = activeMobileJob.status === status;
                          return (
                            <Pressable
                              key={status}
                              onPress={() => {
                                handleSetJobStatus(activeMobileJob, status);
                                setShowMobileJobStatusOptions(false);
                              }}
                              style={{
                                minHeight: 46,
                                borderRadius: 999,
                                paddingHorizontal: 16,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                                backgroundColor: selected ? optionMeta.text : colors.bg.secondary,
                                borderWidth: selected ? 0 : 1,
                                borderColor: selected ? 'transparent' : colors.border.light,
                              }}
                            >
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: selected ? 'rgba(255,255,255,0.25)' : hexToRgba(optionMeta.text, 0.16),
                                }}
                              >
                                {selected ? (
                                  <Check size={13} color="#FFFFFF" strokeWidth={3} />
                                ) : (
                                  <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: optionMeta.text }} />
                                )}
                              </View>
                              <Text style={{ color: selected ? '#FFFFFF' : colors.text.primary, fontSize: 12, fontWeight: '500', flex: 1 }}>
                                {optionMeta.label}
                              </Text>
                              {selected ? <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '500' }}>Selected</Text> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    {activeMobileJob.status === 'awaiting_dispatch' ? (
                      <Pressable
                        onPress={() => handleDispatchJob(activeMobileJob)}
                        style={{ height: 44, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '600' }}>Send to partner</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', lineHeight: 20 }} numberOfLines={1}>
                          {activeMobileJob.customerName || 'Customer name'}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 5 }} numberOfLines={1}>
                          {order ? `Order ${orderNumber}` : `Job ${orderNumber}`}
                        </Text>
                        {activeMobileJob.itemLabel ? (
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>
                            {activeMobileJob.itemLabel}
                          </Text>
                        ) : null}
                        {activeMobileJob.jobType || activeMobileJob.jobService ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {activeMobileJob.jobType ? (
                              <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#3B82F6', 0.12) }}>
                                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{activeMobileJob.jobType}</Text>
                              </View>
                            ) : null}
                            {activeMobileJob.jobService ? (
                              <View style={{ height: 22, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#7E22CE', 0.12) }}>
                                <Text style={{ color: '#7E22CE', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{activeMobileJob.jobService}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: activeMobileJob.amount ? colors.text.primary : colors.text.tertiary, fontSize: 14, fontWeight: '700' }}>
                          {activeMobileJob.amount ? formatCurrency(activeMobileJob.amount) : '—'}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 4 }}>
                          partner fee
                        </Text>
                      </View>
                    </View>
                    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border.light, gap: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Partner</Text>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={1}>
                          {partner?.name ?? 'Unknown partner'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Date sent</Text>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                          {formatDate(activeMobileJob.dispatchedAt ?? activeMobileJob.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
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
                        {activeMobileJob.documentUrl && isImageAttachment ? (
                          <ResolvedAttachmentImage imageUrl={activeMobileJob.documentUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : jobThumbnailUrl ? (
                          <ResolvedAttachmentImage imageUrl={jobThumbnailUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : activeMobileJob.documentUrl ? (
                          <FileText size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                        ) : activeMobileJob.notes ? (
                          <FileText size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                        ) : (
                          <Wrench size={22} color={colors.text.tertiary} strokeWidth={1.8} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 20 }} numberOfLines={3}>
                          {activeMobileJob.notes || activeMobileJob.documentName || 'No notes or attachment added.'}
                        </Text>
                        {activeMobileJob.documentUrl ? (
                          <View style={{ marginTop: 8 }}>
                            <AttachmentLink url={activeMobileJob.documentUrl} mimeType={activeMobileJob.documentMimeType} color={colors.text.secondary} fontSize={12} />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 18, gap: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Activity</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>
                        {jobActivityEntries.length} event{jobActivityEntries.length === 1 ? '' : 's'}
                      </Text>
                    </View>

                    {jobActivityEntries.map((entry, index) => (
                      <View key={entry.key} style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 10, alignItems: 'center' }}>
                          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: index === 0 ? colors.text.primary : colors.text.tertiary, marginTop: 5 }} />
                          {index < jobActivityEntries.length - 1 ? (
                            <View style={{ width: 1, flex: 1, minHeight: 26, backgroundColor: colors.border.light, marginTop: 5 }} />
                          ) : null}
                        </View>
                        <View style={{ flex: 1, paddingBottom: index < jobActivityEntries.length - 1 ? 12 : 0 }}>
                          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{entry.action}</Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 3 }}>
                            {entry.user} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(entry.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            );
          })() : null}
        </SafeAreaView>
        </Pressable>
        </Pressable>
      </Modal>

      {/* Issue detail */}
      <Modal
        visible={!!activeIssueId}
        transparent={!isMobile}
        animationType="none"
        presentationStyle={isMobile ? 'fullScreen' : 'overFullScreen'}
        onRequestClose={closeIssueDetail}
      >
        <Pressable
          onPress={closeIssueDetail}
          disabled={isMobile}
          style={{
            flex: 1,
            backgroundColor: isMobile ? colors.bg.primary : 'rgba(0,0,0,0.18)',
            alignItems: isMobile ? 'stretch' : 'flex-end',
            justifyContent: 'flex-start',
            padding: 0,
          }}
        >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            width: isMobile ? '100%' : 460,
            height: '100%',
            maxWidth: isMobile ? undefined : 560,
            borderRadius: 0,
            overflow: 'hidden',
            backgroundColor: colors.bg.primary,
            ...(isMobile
              ? { borderWidth: 0 }
              : {
                  borderLeftWidth: 1,
                  borderLeftColor: colors.border.light,
                }),
          }}
        >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={isMobile ? ['top', 'bottom'] : []}>
          {(() => {
            const activeIssue = partnerJobIssues.find((i) => i.id === activeIssueId);
            if (!activeIssue) return null;
            const issueJob = partnerJobs.find((j) => j.id === activeIssue.jobId);
            const issuePartner = partnerById.get(activeIssue.partnerId);
            const issueThumbnailUrl = issueJob ? getJobThumbnailUrl(issueJob) : null;
            const isIssueOpen = activeIssue.status === 'open';
            const isDirty = issueEditDescription.trim() !== (activeIssue.description ?? '').trim()
              || (issueEditScreenshotUrl ?? '') !== (activeIssue.screenshotUrl ?? '');
            const issueOrderNumber = issueJob?.orderId ? orderById.get(issueJob.orderId)?.orderNumber : null;
            const issueJobStatusMeta = issueJob ? getPartnerStatusMeta(issueJob.status, statusBusinessName, issuePartner) : null;
            const issueActivityEntries: { label: string; at: string; actor: string; tone: 'primary' | 'muted' }[] = [
              { label: 'Issue reported', at: activeIssue.createdAt, actor: activeIssue.createdBy || 'Business', tone: (activeIssue.resolvedAt ? 'muted' : 'primary') as 'primary' | 'muted' },
              ...(activeIssue.resolvedAt
                ? [{ label: 'Issue resolved', at: activeIssue.resolvedAt, actor: activeIssue.resolvedBy || 'Business', tone: 'primary' as const }]
                : []),
            ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

            return (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700' }}>Issue Details</Text>
                  <Pressable
                    onPress={closeIssueDetail}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={16} color={colors.text.primary} strokeWidth={2.2} />
                  </Pressable>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 20, paddingBottom: tabBarHeight + 32, gap: 14 }}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
                        {issuePartner?.name ?? 'Unknown partner'}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 12,
                          height: 26,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isIssueOpen ? hexToRgba('#DC2626', 0.14) : hexToRgba('#16A34A', 0.14),
                        }}
                      >
                        <Text style={{ color: isIssueOpen ? '#DC2626' : '#16A34A', fontSize: 11, fontWeight: '700' }}>
                          {isIssueOpen ? 'Open' : 'Resolved'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 13, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                        {issueThumbnailUrl ? (
                          <ResolvedAttachmentImage imageUrl={issueThumbnailUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Glasses size={20} color={colors.text.tertiary} strokeWidth={1.8} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                          {issueJob?.customerName ?? 'Unknown customer'}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {issueJob?.jobType || '—'} · {issueJob?.jobService || '—'}{issueOrderNumber ? ` · ${issueOrderNumber}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {isIssueOpen ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.3)', backgroundColor: hexToRgba('#DC2626', 0.08), padding: 14 }}>
                      <Ban size={16} color="#DC2626" strokeWidth={2.2} />
                      <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '600', flex: 1 }}>
                        Payment on hold until this issue is resolved
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                    {[
                      { label: 'Job status', value: issueJobStatusMeta?.label ?? '—' },
                      ...(issueOrderNumber ? [{ label: 'Order', value: issueOrderNumber }] : []),
                      { label: 'Amount', value: issueJob?.amount ? formatCurrency(issueJob.amount) : '—' },
                      { label: 'Reported by', value: activeIssue.createdBy || 'Business' },
                      { label: 'Reported', value: formatDateTime(activeIssue.createdAt) },
                      ...(activeIssue.resolvedAt ? [{ label: 'Resolved by', value: activeIssue.resolvedBy || 'Business' }] : []),
                      ...(activeIssue.resolvedAt ? [{ label: 'Resolved', value: formatDateTime(activeIssue.resolvedAt) }] : []),
                    ].map((row, index) => (
                      <View
                        key={row.label}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{row.label}</Text>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{row.value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Activity
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                        {issueActivityEntries.length} {issueActivityEntries.length === 1 ? 'event' : 'events'}
                      </Text>
                    </View>
                    <View style={{ gap: 14 }}>
                      {issueActivityEntries.map((entry, index) => (
                        <View key={`${entry.label}-${entry.at}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
                          <View style={{ alignItems: 'center' }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: entry.tone === 'primary' ? colors.text.primary : colors.text.muted, marginTop: 4 }} />
                            {index < issueActivityEntries.length - 1 ? (
                              <View style={{ width: 1, flex: 1, backgroundColor: colors.border.light, marginTop: 6, minHeight: 28 }} />
                            ) : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                              {entry.label}
                            </Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                              {entry.actor} · {formatDateTime(entry.at)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                      Description
                    </Text>
                    <TextInput
                      value={issueEditDescription}
                      onChangeText={setIssueEditDescription}
                      placeholder="Describe the defect or complaint"
                      placeholderTextColor={colors.input.placeholder}
                      multiline
                      style={{
                        minHeight: 90,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        backgroundColor: colors.input.bg,
                        color: colors.input.text,
                        fontSize: 13,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        textAlignVertical: 'top',
                      }}
                    />

                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 }}>
                      Screenshot
                    </Text>
                    <Pressable
                      onPress={handlePickIssueEditScreenshot}
                      disabled={issueEditScreenshotUploading}
                      style={{ height: 110, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                    >
                      {issueEditScreenshotUrl ? (
                        <ResolvedAttachmentImage imageUrl={issueEditScreenshotUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <>
                          <Camera size={18} color={colors.text.tertiary} strokeWidth={1.8} />
                          <Text style={{ color: colors.text.tertiary, fontSize: 11.5, marginTop: 6 }}>
                            {issueEditScreenshotUploading ? 'Uploading…' : 'Tap to add a screenshot (optional)'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                    {issueEditScreenshotUrl ? (
                      <Pressable onPress={handlePickIssueEditScreenshot} disabled={issueEditScreenshotUploading} style={{ marginTop: 8 }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 11.5, fontWeight: '600', textAlign: 'center' }}>
                          Replace screenshot
                        </Text>
                      </Pressable>
                    ) : null}

                    {isDirty ? (
                      <Pressable
                        onPress={() => handleSaveIssueEdits(activeIssue)}
                        disabled={!issueEditDescription.trim()}
                        style={{
                          marginTop: 16,
                          height: 42,
                          borderRadius: 999,
                          backgroundColor: issueEditDescription.trim() ? colors.text.primary : colors.bg.secondary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: issueEditDescription.trim() ? colors.bg.primary : colors.text.tertiary, fontSize: 13, fontWeight: '700' }}>
                          Save changes
                        </Text>
                      </Pressable>
                    ) : issueSaveState === 'saved' ? (
                      <View style={{ marginTop: 16, height: 42, borderRadius: 999, backgroundColor: hexToRgba('#16A34A', 0.14), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                        <Check size={15} color="#16A34A" strokeWidth={2.4} />
                        <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '700' }}>Saved</Text>
                      </View>
                    ) : null}
                  </View>

                  {isIssueOpen ? (
                    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>Resolve this issue</Text>
                      <TextInput
                        value={issueResolutionNoteDraft}
                        onChangeText={setIssueResolutionNoteDraft}
                        placeholder="Resolution note (optional)"
                        placeholderTextColor={colors.input.placeholder}
                        multiline
                        style={{
                          minHeight: 70,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.input.bg,
                          color: colors.input.text,
                          fontSize: 13,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          textAlignVertical: 'top',
                        }}
                      />
                      <Pressable
                        onPress={() => handleResolveIssueDetail(activeIssue)}
                        style={{ marginTop: 14, height: 42, borderRadius: 999, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                      >
                        <Check size={15} color="#FFFFFF" strokeWidth={2.4} />
                        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Mark Resolved</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Resolution note
                      </Text>
                      <Text style={{ color: colors.text.primary, fontSize: 12.5, lineHeight: 18 }}>
                        {activeIssue.resolutionNote || 'No note added.'}
                      </Text>
                      <Pressable
                        onPress={() => handleReopenIssueDetail(activeIssue)}
                        style={{ marginTop: 14, height: 42, borderRadius: 999, backgroundColor: hexToRgba('#DC2626', 0.12), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                      >
                        <RotateCcw size={15} color="#DC2626" strokeWidth={2.2} />
                        <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '700' }}>Reopen issue</Text>
                      </Pressable>
                    </View>
                  )}
                </ScrollView>
              </>
            );
          })()}
        </SafeAreaView>
        </Pressable>
        </Pressable>
      </Modal>

      <PartnerJobFormModal
        visible={showNewJobModal}
        onClose={closeJobForm}
        editingJob={editingJob}
        onSaved={handleJobSaved}
      />

      <Modal visible={!!lightboxImageUrl} transparent animationType="fade" onRequestClose={() => setLightboxImageUrl(null)}>
        <Pressable
          onPress={() => setLightboxImageUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Pressable
            onPress={() => setLightboxImageUrl(null)}
            style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
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

      <Modal visible={!!reportIssueJobId} transparent animationType="fade" onRequestClose={handleCloseReportIssue}>
        <Pressable
          onPress={handleCloseReportIssue}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 18 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: isMobile ? undefined : 460, borderRadius: 18, borderTopLeftRadius: isMobile ? 18 : 18, borderTopRightRadius: 18, borderBottomLeftRadius: isMobile ? 0 : 18, borderBottomRightRadius: isMobile ? 0 : 18, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, padding: 20 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Report an Issue</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 16 }}>
              Payment for this job will be held until you mark the issue resolved. The partner is notified.
            </Text>
            <TextInput
              value={issueDescription}
              onChangeText={setIssueDescription}
              placeholder="Describe the defect or complaint…"
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              style={{
                minHeight: 100,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                fontSize: 13,
                padding: 12,
                textAlignVertical: 'top',
              }}
            />
            <Pressable
              onPress={handlePickIssueScreenshot}
              disabled={issueScreenshotUploading}
              style={{ height: 90, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 12 }}
            >
              {issueScreenshotUrl ? (
                <ResolvedAttachmentImage imageUrl={issueScreenshotUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <>
                  <Camera size={18} color={colors.text.tertiary} strokeWidth={1.8} />
                  <Text style={{ color: colors.text.tertiary, fontSize: 11.5, marginTop: 6 }}>
                    {issueScreenshotUploading ? 'Uploading…' : 'Tap to add a screenshot (optional)'}
                  </Text>
                </>
              )}
            </Pressable>
            {issueScreenshotUrl ? (
              <Pressable onPress={handlePickIssueScreenshot} disabled={issueScreenshotUploading} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 11.5, fontWeight: '600', textAlign: 'center' }}>
                  Replace screenshot
                </Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={handleCloseReportIssue}
                style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitIssue}
                disabled={!issueDescription.trim() || isSubmittingIssue}
                style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', opacity: !issueDescription.trim() || isSubmittingIssue ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{isSubmittingIssue ? 'Reporting…' : 'Report Issue'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View style={{ flex: 1 }}>{body}</View>
      </View>
    );
  }

  return body;
}
