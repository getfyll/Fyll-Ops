import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, Modal, Platform, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Archive, ArrowLeft, Check, CheckCheck, ChevronDown, ChevronUp, Copy, Filter, Hash, MessageSquare, MoreHorizontal, Pin, Plus, Search, X } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import type { Order } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { collaborationData, type CollaborationThreadSummary } from '@/lib/supabase/collaboration';
import { storage } from '@/lib/storage';
import { createOrderStatusColorMap, getOrderStatusChipColors } from '@/lib/order-status-colors';
import { CollaborationThreadPanel } from '@/components/CollaborationThreadPanel';
import { getTabBarStyle } from '@/lib/tab-bar-style';
import { OrderDetailPanel } from '@/components/OrderDetailPanel';
import { SearchClearButton } from '@/components/SearchClearButton';
import {
  buildCustomTeamThreadEntityId,
  getTeamThreadDisplayNameFromEntityId,
  getTeamThreadSubtitleFromEntityId,
  isTeamThreadEntityId,
} from '@/lib/team-threads';

interface ThreadListItem {
  threadId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  orderStatus: string;
  isClosed: boolean;
}

interface TeamThreadListItem {
  threadRecordId: string | null;
  entityId: string;
  id: string;
  name: string;
  subtitle: string;
  preview: string;
  updatedAt: string | null;
  unreadCount: number;
}

type CreateThreadPickerItem =
  | { type: 'order'; item: Order }
  | { type: 'team'; item: TeamThreadListItem };

interface WebThreadMenuState {
  item: ThreadListItem;
  x: number;
  y: number;
}

let lastThreadListOffset = 0;

const formatOrderReference = (orderNumber: string) => {
  const normalized = orderNumber.trim().replace(/^ORD[-\s]*/i, '').replace(/^#/, '').trim();
  return normalized.length > 0 ? `#${normalized}` : '#';
};

const normalizeSystemOrderStatus = (value?: string | null) => (
  String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
);
const toSystemOrderStatusLabel = (value?: string | null) => {
  const normalized = normalizeSystemOrderStatus(value);
  if (!normalized) return 'Status';
  return normalized.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};
const SYSTEM_ORDER_STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'awaiting payment': { label: 'Awaiting Payment', color: '#D97706', bg: 'rgba(217,119,6,0.14)', border: 'rgba(217,119,6,0.25)' },
  'payment approval': { label: 'Payment Approval', color: '#D97706', bg: 'rgba(217,119,6,0.14)', border: 'rgba(217,119,6,0.25)' },
  verified: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  paid: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  confirmed: { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  'payment confirmed': { label: 'Payment Confirmed', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  processing: { label: 'Processing', color: '#D97706', bg: 'rgba(217,119,6,0.14)', border: 'rgba(217,119,6,0.25)' },
  preparing: { label: 'Preparing', color: '#2563EB', bg: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.25)' },
  packed: { label: 'Packed', color: '#7C3AED', bg: 'rgba(124,58,237,0.14)', border: 'rgba(124,58,237,0.25)' },
  dispatched: { label: 'Dispatched', color: '#2563EB', bg: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.25)' },
  dispatch: { label: 'Dispatch', color: '#2563EB', bg: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.25)' },
  shipped: { label: 'Shipped', color: '#2563EB', bg: 'rgba(37,99,235,0.14)', border: 'rgba(37,99,235,0.25)' },
  delivered: { label: 'Delivered', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  completed: { label: 'Completed', color: '#059669', bg: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.25)' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.14)', border: 'rgba(220,38,38,0.25)' },
  canceled: { label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.14)', border: 'rgba(220,38,38,0.25)' },
  failed: { label: 'Failed', color: '#DC2626', bg: 'rgba(220,38,38,0.14)', border: 'rgba(220,38,38,0.25)' },
  refunded: { label: 'Refunded', color: '#DC2626', bg: 'rgba(220,38,38,0.14)', border: 'rgba(220,38,38,0.25)' },
};
const getThreadOrderStatusDisplay = (
  status: string,
  fallbackColors: { text: string; bg: string; border: string }
) => {
  const normalized = normalizeSystemOrderStatus(status);
  const known = SYSTEM_ORDER_STATUS_MAP[normalized];
  if (known) {
    return { label: known.label, text: known.color, bg: known.bg, border: known.border };
  }
  return { label: toSystemOrderStatusLabel(status), ...fallbackColors };
};

const formatThreadTitle = (customerName: string, orderNumber: string) => {
  const customer = customerName.trim();
  const orderRef = formatOrderReference(orderNumber);
  return customer.length > 0 ? `${orderRef} - ${customer}` : orderRef;
};

const getCustomerInitials = (customerName: string) => {
  const trimmed = customerName.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '??';
};

const parseStoredThreadIds = (rawValue: string | null): string[] => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
};

const parseStoredNameOverrides = (rawValue: string | null): Record<string, string> => {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      next[key] = trimmed;
    });
    return next;
  } catch {
    return {};
  }
};

const toSingleThreadId = (threadIds: string[]): string[] => (threadIds.length > 0 ? [threadIds[0]] : []);

const formatThreadTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay = now.toDateString() === date.toDateString();
  if (isSameDay) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getStatusChipColors = (status: string, isDark: boolean) => {
  const normalized = status.trim().toLowerCase();

  if (normalized.includes('complete') || normalized.includes('deliver') || normalized.includes('done')) {
    return {
      bg: isDark ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.14)',
      text: '#16A34A',
      border: isDark ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.25)',
    };
  }

  if (normalized.includes('cancel') || normalized.includes('refund')) {
    return {
      bg: isDark ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.14)',
      text: '#DC2626',
      border: isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.25)',
    };
  }

  if (normalized.includes('process') || normalized.includes('progress') || normalized.includes('pending')) {
    return {
      bg: isDark ? 'rgba(245,158,11,0.22)' : 'rgba(245,158,11,0.14)',
      text: '#D97706',
      border: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.25)',
    };
  }

  return {
    bg: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.14)',
    text: '#2563EB',
    border: isDark ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.25)',
  };
};

export default function ThreadsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isMobile, isDesktop } = useBreakpoint();
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const isDark = colors.bg.primary === '#111111';
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const showSplitView = !isMobile;
  const splitShellBackground = isDark ? '#101010' : '#F3F4F6';
  const leftPaneBackground = isDark ? '#111111' : '#FFFFFF';
  const rightPaneBackground = isDark ? '#161616' : '#F3F4F6';
  const selectedRowBackground = isDark ? 'rgba(255,255,255,0.06)' : '#EEF0F3';
  const hoverRowBackground = isDark ? 'rgba(255,255,255,0.03)' : '#F5F6F8';
  const searchBackground = isDark ? '#161616' : '#FFFFFF';
  const subtleDivider = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
  const companyCardBackground = isDark ? '#0D1A34' : '#0C1933';
  const companyCardBorder = isDark ? 'rgba(148,163,184,0.26)' : 'rgba(15,23,42,0.14)';
  const companyCardAvatar = 'rgba(148,163,184,0.2)';
  const companyCardTextPrimary = '#F8FAFC';
  const companyCardTextSecondary = 'rgba(226,232,240,0.82)';
  const companyCardTextMuted = 'rgba(226,232,240,0.72)';

  const orders = useFyllStore((state) => state.orders);
  const orderStatuses = useFyllStore((state) => state.orderStatuses);
  const cases = useFyllStore((state) => state.cases);
  const currentUser = useAuthStore((state) => state.currentUser);
  const teamMembers = useAuthStore((state) => state.teamMembers);
  const userRole = useAuthStore((state) => state.currentUser?.role ?? 'staff');
  const businessId = useAuthStore((state) => state.businessId ?? state.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((state) => state.isOfflineMode);
  const isAdmin = userRole === 'admin';
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTeamThreadEntityId, setSelectedTeamThreadEntityId] = useState<string | null>(null);
  const [selectedCaseThreadEntityId, setSelectedCaseThreadEntityId] = useState<string | null>(null);

  // On mobile, an open thread takes over the full screen — hide the floating
  // bottom tab bar while one is open so it doesn't sit over the message
  // composer (same approach as threads/team.tsx, which is always "open").
  // Restoring must use the app's actual tab bar style, not `undefined` —
  // React Navigation's options merge treats an explicit `undefined` as an
  // override, which falls back to its plain default bar instead of the
  // screenOptions-level floating pill style.
  const isThreadOpen = Boolean(selectedOrderId || selectedTeamThreadEntityId || selectedCaseThreadEntityId);
  useEffect(() => {
    if (!isMobile) return;
    const parent = navigation.getParent();
    if (!parent) return;
    const restoredStyle = getTabBarStyle(colors, isDesktop, isMobile);
    parent.setOptions({ tabBarStyle: isThreadOpen ? { display: 'none' } : restoredStyle });
    return () => {
      parent.setOptions({ tabBarStyle: restoredStyle });
    };
  }, [navigation, colors, isDesktop, isMobile, isThreadOpen]);

  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [showCreateThreadPicker, setShowCreateThreadPicker] = useState(false);
  const [createThreadQuery, setCreateThreadQuery] = useState('');
  const [newTeamThreadName, setNewTeamThreadName] = useState('');
  const [createThreadMode, setCreateThreadMode] = useState<'order' | 'team'>('order');
  const [showOrderDetailOverlay, setShowOrderDetailOverlay] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [threadVisibilityFilter, setThreadVisibilityFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [isTeamThreadsCollapsed, setIsTeamThreadsCollapsed] = useState(false);
  const [closedThreadIds, setClosedThreadIds] = useState<string[]>([]);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [manualUnreadThreadIds, setManualUnreadThreadIds] = useState<string[]>([]);
  const [teamThreadNameOverrides, setTeamThreadNameOverrides] = useState<Record<string, string>>({});
  const [didLoadThreadPrefs, setDidLoadThreadPrefs] = useState(false);
  const [didLoadTeamThreadNames, setDidLoadTeamThreadNames] = useState(false);
  const [threadActionsTarget, setThreadActionsTarget] = useState<ThreadListItem | null>(null);
  const [teamThreadActionsTarget, setTeamThreadActionsTarget] = useState<TeamThreadListItem | null>(null);
  const [teamThreadDraftName, setTeamThreadDraftName] = useState('');
  const [webThreadMenu, setWebThreadMenu] = useState<WebThreadMenuState | null>(null);
  const [showTeamInfo, setShowTeamInfo] = useState(false);
  const [showTeamSearch, setShowTeamSearch] = useState(false);
  const hasMobileChatHistoryEntryRef = useRef(false);
  const threadListRef = useRef<FlatList<ThreadListItem>>(null);

  const params = useLocalSearchParams<{ orderId?: string | string[]; teamEntityId?: string | string[]; caseEntityId?: string | string[] }>();
  const requestedOrderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const requestedTeamThreadEntityIdRaw = Array.isArray(params.teamEntityId) ? params.teamEntityId[0] : params.teamEntityId;
  const requestedCaseThreadEntityIdRaw = Array.isArray(params.caseEntityId) ? params.caseEntityId[0] : params.caseEntityId;
  const requestedTeamThreadEntityId = useMemo(() => {
    if (!requestedTeamThreadEntityIdRaw) return null;
    try {
      return decodeURIComponent(requestedTeamThreadEntityIdRaw);
    } catch {
      return requestedTeamThreadEntityIdRaw;
    }
  }, [requestedTeamThreadEntityIdRaw]);
  const requestedCaseThreadEntityId = useMemo(() => {
    if (!requestedCaseThreadEntityIdRaw) return null;
    try {
      return decodeURIComponent(requestedCaseThreadEntityIdRaw);
    } catch {
      return requestedCaseThreadEntityIdRaw;
    }
  }, [requestedCaseThreadEntityIdRaw]);

  const threadSummariesQuery = useQuery({
    queryKey: ['collaboration-order-threads', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.listThreadsByEntityType(businessId!, 'order'),
    refetchInterval: 10000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const unreadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'order'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'order'),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  const teamThreadSummariesQuery = useQuery({
    queryKey: ['collaboration-team-threads', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.listThreadsByEntityType(businessId!, 'case'),
    refetchInterval: 10000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  const teamUnreadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'case'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'case'),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const unreadCounts = useMemo(
    () => unreadCountsQuery.data ?? {},
    [unreadCountsQuery.data]
  );
  const teamUnreadCounts = useMemo(
    () => teamUnreadCountsQuery.data ?? {},
    [teamUnreadCountsQuery.data]
  );

  const closedThreadsStorageKey = useMemo(
    () => (businessId ? `threads:closed:${businessId}:order` : null),
    [businessId]
  );
  const pinnedThreadsStorageKey = useMemo(
    () => (businessId ? `threads:pinned:${businessId}:order` : null),
    [businessId]
  );
  const manualUnreadThreadsStorageKey = useMemo(
    () => (businessId ? `threads:manual-unread:${businessId}:order` : null),
    [businessId]
  );
  const teamThreadNamesStorageKey = useMemo(
    () => (businessId ? `threads:team-name-overrides:${businessId}` : null),
    [businessId]
  );

  const ordersById = useMemo(() => {
    const map = new Map<string, (typeof orders)[number]>();
    orders.forEach((order) => map.set(order.id, order));
    return map;
  }, [orders]);
  const casesById = useMemo(() => {
    const map = new Map<string, (typeof cases)[number]>();
    cases.forEach((caseItem) => map.set(caseItem.id, caseItem));
    return map;
  }, [cases]);

  const allThreadItems = useMemo<ThreadListItem[]>(() => {
    const summaries = threadSummariesQuery.data ?? [];
    const mappedItems = summaries.flatMap((summary) => {
        const order = ordersById.get(summary.thread.entity_id);
        if (!order) return [];
        return [{
          threadId: summary.thread.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName || 'Unknown customer',
          preview: summary.latestComment?.body?.trim() || 'No messages yet. Start the conversation.',
          updatedAt: summary.latestComment?.created_at ?? summary.thread.updated_at,
          unreadCount: unreadCounts[order.id] ?? 0,
          orderStatus: (order.status ?? 'Pending').trim() || 'Pending',
          isClosed: Boolean(summary.thread.is_closed),
        }];
      });
    return mappedItems.sort((left, right) => {
        const leftPinned = pinnedThreadIds.includes(left.threadId);
        const rightPinned = pinnedThreadIds.includes(right.threadId);
        if (leftPinned && !rightPinned) return -1;
        if (!leftPinned && rightPinned) return 1;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [threadSummariesQuery.data, ordersById, pinnedThreadIds, unreadCounts]);

  const isThreadClosed = useCallback(
    (item: ThreadListItem) => Boolean(item.isClosed) || closedThreadIds.includes(item.threadId),
    [closedThreadIds]
  );

  const statusFilterOptions = useMemo(() => {
    const uniqueStatuses = Array.from(
      new Set(
        allThreadItems
          .map((item) => item.orderStatus.trim())
          .filter((status) => status.length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));
    return ['all', ...uniqueStatuses];
  }, [allThreadItems]);

  const filteredThreadItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const searchedItems = !query
      ? allThreadItems
      : allThreadItems.filter((item) => (
      item.orderNumber.toLowerCase().includes(query)
      || formatOrderReference(item.orderNumber).toLowerCase().includes(query)
      || item.customerName.toLowerCase().includes(query)
      || item.preview.toLowerCase().includes(query)
      ));

    const statusFiltered = statusFilter === 'all'
      ? searchedItems
      : searchedItems.filter((item) => item.orderStatus.toLowerCase() === statusFilter.toLowerCase());

    if (threadVisibilityFilter === 'all') return statusFiltered;
    if (threadVisibilityFilter === 'closed') {
      return statusFiltered.filter((item) => isThreadClosed(item));
    }
    return statusFiltered.filter((item) => !isThreadClosed(item));
  }, [allThreadItems, isThreadClosed, searchQuery, statusFilter, threadVisibilityFilter]);

  useEffect(() => {
    if (showSplitView && showCreateThreadPicker) return;
    if (!threadListRef.current) return;
    requestAnimationFrame(() => {
      threadListRef.current?.scrollToOffset({
        offset: lastThreadListOffset,
        animated: false,
      });
    });
  }, [filteredThreadItems.length, showCreateThreadPicker, showSplitView]);

  const openThreadCount = useMemo(
    () => allThreadItems.filter((item) => !isThreadClosed(item)).length,
    [allThreadItems, isThreadClosed]
  );

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (threadVisibilityFilter !== 'open' ? 1 : 0);
  const teamMemberNameById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((member) => {
      if (!member.id) return;
      const trimmedName = member.name.trim();
      map.set(member.id, trimmedName.length > 0 ? trimmedName : member.email);
    });
    if (currentUser?.id) {
      const trimmedCurrentUserName = currentUser.name.trim();
      map.set(currentUser.id, trimmedCurrentUserName.length > 0 ? trimmedCurrentUserName : currentUser.email);
    }
    return map;
  }, [currentUser, teamMembers]);
  const teamThreadSummaryByEntityId = useMemo(() => {
    const map = new Map<string, CollaborationThreadSummary>();
    (teamThreadSummariesQuery.data ?? []).forEach((summary) => {
      if (!isTeamThreadEntityId(summary.thread.entity_id)) return;
      map.set(summary.thread.entity_id, summary);
    });
    return map;
  }, [teamThreadSummariesQuery.data]);
  const allTeamThreadItems = useMemo<TeamThreadListItem[]>(() => {
    const itemsByEntityId = new Map<string, TeamThreadListItem>();

    teamThreadSummaryByEntityId.forEach((summary, entityId) => {
      const overrideName = teamThreadNameOverrides[entityId]?.trim();
      const latestMessageBody = summary.latestComment?.body?.trim().replace(/\s+/g, ' ') ?? '';
      const latestMessageAuthorId = summary.latestComment?.author_user_id ?? '';
      const latestMessageAuthorName = teamMemberNameById.get(latestMessageAuthorId) ?? 'Team';
      const previewText = latestMessageBody.length > 0
        ? `${latestMessageAuthorName}: ${latestMessageBody}`
        : getTeamThreadSubtitleFromEntityId(entityId);
      itemsByEntityId.set(entityId, {
        threadRecordId: summary.thread.id,
        entityId,
        id: entityId,
        name: overrideName || getTeamThreadDisplayNameFromEntityId(entityId),
        subtitle: getTeamThreadSubtitleFromEntityId(entityId),
        preview: previewText,
        updatedAt: summary.latestComment?.created_at ?? summary.thread.updated_at ?? null,
        unreadCount: teamUnreadCounts[entityId] ?? 0,
      });
    });

    return [...itemsByEntityId.values()].sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.name.localeCompare(right.name);
    });
  }, [teamMemberNameById, teamThreadNameOverrides, teamThreadSummaryByEntityId, teamUnreadCounts]);
  const teamThreadUnreadTotal = useMemo(
    () => allTeamThreadItems.reduce((sum, item) => sum + item.unreadCount, 0),
    [allTeamThreadItems]
  );

  const existingThreadOrderIds = useMemo(() => {
    const ids = new Set<string>();
    allThreadItems.forEach((item) => ids.add(item.orderId));
    return ids;
  }, [allThreadItems]);
  const threadByOrderId = useMemo(() => {
    const map = new Map<string, ThreadListItem>();
    allThreadItems.forEach((item) => map.set(item.orderId, item));
    return map;
  }, [allThreadItems]);

  const createThreadCandidates = useMemo(() => {
    const query = createThreadQuery.trim().toLowerCase();
    const sortedOrders = [...orders]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    if (!query) return sortedOrders;
    return sortedOrders.filter((order) => {
      const customerName = (order.customerName ?? '').toLowerCase();
      const orderNumber = (order.orderNumber ?? '').toLowerCase();
      const orderRef = formatOrderReference(order.orderNumber ?? '').toLowerCase();
      return customerName.includes(query) || orderNumber.includes(query) || orderRef.includes(query);
    });
  }, [createThreadQuery, orders]);
  const createTeamThreadCandidates = useMemo(() => {
    const query = createThreadQuery.trim().toLowerCase();
    if (!query) return allTeamThreadItems;
    return allTeamThreadItems.filter((channel) => {
      return (
        channel.name.toLowerCase().includes(query)
        || channel.subtitle.toLowerCase().includes(query)
        || channel.preview.toLowerCase().includes(query)
      );
    });
  }, [allTeamThreadItems, createThreadQuery]);
  const createThreadPickerData = useMemo<CreateThreadPickerItem[]>(() => {
    if (createThreadMode === 'order') {
      return createThreadCandidates
        .slice(0, 80)
        .map((item) => ({ type: 'order', item }));
    }
    return createTeamThreadCandidates
      .slice(0, 80)
      .map((item) => ({ type: 'team', item }));
  }, [createThreadCandidates, createTeamThreadCandidates, createThreadMode]);

  const closeCreateThreadPicker = () => {
    setShowCreateThreadPicker(false);
    setCreateThreadQuery('');
    setNewTeamThreadName('');
    setCreateThreadMode('order');
  };

  const openTeamThread = (entityId: string) => {
    setSelectedTeamThreadEntityId(entityId);
    setSelectedCaseThreadEntityId(null);
    setSelectedOrderId(null);
    setThreadActionsTarget(null);
    setTeamThreadActionsTarget(null);
    setWebThreadMenu(null);
  };

  const closeMobileThreadView = () => {
    if (Platform.OS === 'web' && !showSplitView && hasMobileChatHistoryEntryRef.current && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    setSelectedOrderId(null);
    setSelectedTeamThreadEntityId(null);
    setSelectedCaseThreadEntityId(null);
    setShowOrderDetailOverlay(false);
  };

  const handleSelectOrderThreadCandidate = (order: (typeof orders)[number]) => {
    const existingThread = threadByOrderId.get(order.id);
    if (existingThread) {
      if (isThreadClosed(existingThread)) {
        setClosedThreadIds((previous) => previous.filter((threadId) => threadId !== existingThread.threadId));
      }
      setSelectedOrderId(order.id);
      setSelectedTeamThreadEntityId(null);
      setSelectedCaseThreadEntityId(null);
      closeCreateThreadPicker();
      return;
    }
    createThreadMutation.mutate(order.id);
  };

  const handleSelectTeamThreadCandidate = (entityId: string) => {
    closeCreateThreadPicker();
    openTeamThread(entityId);
  };

  const openTeamThreadActions = (teamThread: TeamThreadListItem) => {
    if (!isAdmin) return;
    setTeamThreadActionsTarget(teamThread);
    setTeamThreadDraftName(teamThread.name);
  };

  const closeTeamThreadActions = () => {
    setTeamThreadActionsTarget(null);
    setTeamThreadDraftName('');
  };

  const saveTeamThreadName = () => {
    if (!teamThreadActionsTarget || !isAdmin) return;
    const nextName = teamThreadDraftName.trim();
    if (nextName.length < 2) return;
    const defaultName = getTeamThreadDisplayNameFromEntityId(teamThreadActionsTarget.entityId);
    setTeamThreadNameOverrides((previous) => {
      const next = { ...previous };
      if (nextName === defaultName) {
        delete next[teamThreadActionsTarget.entityId];
      } else {
        next[teamThreadActionsTarget.entityId] = nextName;
      }
      return next;
    });
    closeTeamThreadActions();
  };

  const copyTeamThreadId = async (teamThread: TeamThreadListItem) => {
    await Clipboard.setStringAsync(teamThread.entityId);
    closeTeamThreadActions();
  };

  const openThread = (item: ThreadListItem) => {
    setSelectedOrderId(item.orderId);
    setSelectedTeamThreadEntityId(null);
    setSelectedCaseThreadEntityId(null);
    setManualUnreadThreadIds((previous) => previous.filter((threadId) => threadId !== item.threadId));
    setThreadActionsTarget(null);
    setTeamThreadActionsTarget(null);
    setWebThreadMenu(null);
  };

  const closeThread = (item: ThreadListItem) => {
    setClosedThreadIds((previous) => (
      previous.includes(item.threadId) ? previous : [...previous, item.threadId]
    ));
    setManualUnreadThreadIds((previous) => previous.filter((threadId) => threadId !== item.threadId));
    if (selectedOrderId === item.orderId) {
      setSelectedOrderId(null);
    }
    setThreadActionsTarget(null);
    setWebThreadMenu(null);

    void collaborationData.closeThread(item.threadId)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['collaboration-order-threads', businessId] });
      })
      .catch((error) => {
        console.warn('Close thread failed:', error);
        setClosedThreadIds((previous) => previous.filter((threadId) => threadId !== item.threadId));
      });
  };

  const reopenThread = (item: ThreadListItem) => {
    setClosedThreadIds((previous) => previous.filter((threadId) => threadId !== item.threadId));
    setThreadActionsTarget(null);
    setWebThreadMenu(null);

    void collaborationData.reopenThread(item.threadId)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['collaboration-order-threads', businessId] });
      })
      .catch((error) => {
        console.warn('Reopen thread failed:', error);
        setClosedThreadIds((previous) => (previous.includes(item.threadId) ? previous : [...previous, item.threadId]));
      });
  };

  const togglePinnedThread = (item: ThreadListItem) => {
    setPinnedThreadIds((previous) => (
      previous.includes(item.threadId)
        ? []
        : [item.threadId]
    ));
    setThreadActionsTarget(null);
    setWebThreadMenu(null);
  };

  const markThreadAsUnread = (item: ThreadListItem) => {
    setManualUnreadThreadIds((previous) => (
      previous.includes(item.threadId) ? previous : [...previous, item.threadId]
    ));
    setThreadActionsTarget(null);
    setWebThreadMenu(null);
  };

  const copyOrderId = async (item: ThreadListItem) => {
    const orderReference = formatOrderReference(item.orderNumber);
    await Clipboard.setStringAsync(orderReference);
    setThreadActionsTarget(null);
    setWebThreadMenu(null);
  };

  const openWebMenu = (item: ThreadListItem, pageX: number, pageY: number) => {
    if (Platform.OS !== 'web') return;
    setWebThreadMenu({ item, x: pageX, y: pageY });
  };

  const createThreadMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (!businessId || isOfflineMode) {
        throw new Error('Threads are unavailable in offline mode.');
      }
      await collaborationData.getOrCreateThread(businessId, 'order', orderId);
      return orderId;
    },
    onSuccess: async (orderId) => {
      setSelectedOrderId(orderId);
      setSelectedTeamThreadEntityId(null);
      setSelectedCaseThreadEntityId(null);
      closeCreateThreadPicker();
      await threadSummariesQuery.refetch();
    },
    onError: (error) => {
      console.warn('Could not create thread from picker:', error);
    },
  });

  const createTeamThreadMutation = useMutation({
    mutationFn: async (threadName: string) => {
      if (!businessId || isOfflineMode) {
        throw new Error('Threads are unavailable in offline mode.');
      }
      if (!isAdmin) {
        throw new Error('Only admins can create team threads.');
      }
      const trimmedName = threadName.trim();
      if (trimmedName.length < 2) {
        throw new Error('Thread name must be at least 2 characters.');
      }
      const entityId = buildCustomTeamThreadEntityId(
        trimmedName,
        allTeamThreadItems.map((item) => item.entityId)
      );
      await collaborationData.getOrCreateThread(businessId, 'case', entityId);
      return { entityId, name: trimmedName };
    },
    onSuccess: async ({ entityId, name }) => {
      setTeamThreadNameOverrides((previous) => ({
        ...previous,
        [entityId]: name,
      }));
      openTeamThread(entityId);
      closeCreateThreadPicker();
      await teamThreadSummariesQuery.refetch();
    },
    onError: (error) => {
      console.warn('Could not create team thread:', error);
    },
  });

  const deleteTeamThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      if (!businessId || isOfflineMode) {
        throw new Error('Threads are unavailable in offline mode.');
      }
      if (!isAdmin) {
        throw new Error('Only admins can delete team threads.');
      }
      await collaborationData.deleteThread(threadId);
      return threadId;
    },
    onSuccess: async (_threadId) => {
      if (teamThreadActionsTarget?.entityId) {
        setTeamThreadNameOverrides((previous) => {
          const next = { ...previous };
          delete next[teamThreadActionsTarget.entityId];
          return next;
        });
      }
      if (selectedTeamThreadEntityId && selectedTeamThreadEntityId === teamThreadActionsTarget?.entityId) {
        setSelectedTeamThreadEntityId(null);
      }
      closeTeamThreadActions();
      await teamThreadSummariesQuery.refetch();
      await teamUnreadCountsQuery.refetch();
    },
    onError: (error) => {
      console.warn('Could not delete team thread:', error);
    },
  });

  useEffect(() => {
    if (requestedOrderId) {
      setSelectedOrderId(requestedOrderId);
      setSelectedTeamThreadEntityId(null);
      setSelectedCaseThreadEntityId(null);
    }
  }, [requestedOrderId]);
  useEffect(() => {
    if (requestedTeamThreadEntityId && isTeamThreadEntityId(requestedTeamThreadEntityId)) {
      setSelectedTeamThreadEntityId(requestedTeamThreadEntityId);
      setSelectedOrderId(null);
      setSelectedCaseThreadEntityId(null);
    }
  }, [requestedTeamThreadEntityId]);
  useEffect(() => {
    if (requestedCaseThreadEntityId && !isTeamThreadEntityId(requestedCaseThreadEntityId)) {
      setSelectedCaseThreadEntityId(requestedCaseThreadEntityId);
      setSelectedOrderId(null);
      setSelectedTeamThreadEntityId(null);
    }
  }, [requestedCaseThreadEntityId]);

  useEffect(() => {
    if (!showSplitView) return;
    if (selectedCaseThreadEntityId) return;
    if (selectedTeamThreadEntityId && isTeamThreadEntityId(selectedTeamThreadEntityId)) return;
    if (selectedOrderId && filteredThreadItems.some((item) => item.orderId === selectedOrderId)) return;
    if (filteredThreadItems.length > 0) {
      setSelectedOrderId(filteredThreadItems[0].orderId);
    }
  }, [showSplitView, filteredThreadItems, selectedOrderId, selectedCaseThreadEntityId, selectedTeamThreadEntityId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || showSplitView || typeof window === 'undefined') {
      hasMobileChatHistoryEntryRef.current = false;
      return;
    }

    const hasSelectedThread = Boolean(selectedOrderId || selectedTeamThreadEntityId || selectedCaseThreadEntityId);
    if (!hasSelectedThread) {
      hasMobileChatHistoryEntryRef.current = false;
      return;
    }

    if (!hasMobileChatHistoryEntryRef.current) {
      window.history.pushState({ fyllThreadsPanel: 'chat' }, '', window.location.href);
      hasMobileChatHistoryEntryRef.current = true;
    }

    const handlePopState = (event: PopStateEvent) => {
      // Only clear the thread selection when popping back past our own history entry
      // (NOT when returning from router.push to an order/detail screen)
      if (event.state && typeof event.state === 'object' && 'fyllThreadsPanel' in event.state) {
        // We arrived back at our own history entry — thread is still open, don't clear
        return;
      }
      setSelectedOrderId(null);
      setSelectedTeamThreadEntityId(null);
      setSelectedCaseThreadEntityId(null);
      setShowOrderDetailOverlay(false);
      hasMobileChatHistoryEntryRef.current = false;
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedCaseThreadEntityId, selectedOrderId, selectedTeamThreadEntityId, showSplitView]);

  useEffect(() => {
    setShowOrderDetailOverlay(false);
  }, [selectedCaseThreadEntityId, selectedOrderId, selectedTeamThreadEntityId]);

  useEffect(() => {
    if (!closedThreadsStorageKey || !pinnedThreadsStorageKey || !manualUnreadThreadsStorageKey) {
      setClosedThreadIds([]);
      setPinnedThreadIds([]);
      setManualUnreadThreadIds([]);
      setDidLoadThreadPrefs(true);
      return;
    }

    let isActive = true;
    setDidLoadThreadPrefs(false);

    void (async () => {
      try {
        const [closedRaw, pinnedRaw, manualUnreadRaw] = await Promise.all([
          storage.getItem(closedThreadsStorageKey),
          storage.getItem(pinnedThreadsStorageKey),
          storage.getItem(manualUnreadThreadsStorageKey),
        ]);
        if (!isActive) return;

        setClosedThreadIds(parseStoredThreadIds(closedRaw));
        setPinnedThreadIds(toSingleThreadId(parseStoredThreadIds(pinnedRaw)));
        setManualUnreadThreadIds(parseStoredThreadIds(manualUnreadRaw));
      } catch (error) {
        console.warn('Could not restore thread preferences:', error);
        setClosedThreadIds([]);
        setPinnedThreadIds([]);
        setManualUnreadThreadIds([]);
      } finally {
        if (isActive) {
          setDidLoadThreadPrefs(true);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [closedThreadsStorageKey, manualUnreadThreadsStorageKey, pinnedThreadsStorageKey]);

  useEffect(() => {
    if (
      !didLoadThreadPrefs
      || !closedThreadsStorageKey
      || !pinnedThreadsStorageKey
      || !manualUnreadThreadsStorageKey
    ) return;

    void Promise.all([
      storage.setItem(closedThreadsStorageKey, JSON.stringify(closedThreadIds)),
      storage.setItem(pinnedThreadsStorageKey, JSON.stringify(pinnedThreadIds)),
      storage.setItem(manualUnreadThreadsStorageKey, JSON.stringify(manualUnreadThreadIds)),
    ]).catch((error) => {
      console.warn('Could not persist thread preferences:', error);
    });
  }, [
    closedThreadIds,
    closedThreadsStorageKey,
    didLoadThreadPrefs,
    manualUnreadThreadIds,
    manualUnreadThreadsStorageKey,
    pinnedThreadIds,
    pinnedThreadsStorageKey,
  ]);

  useEffect(() => {
    if (!teamThreadNamesStorageKey) {
      setTeamThreadNameOverrides({});
      setDidLoadTeamThreadNames(true);
      return;
    }

    let isActive = true;
    setDidLoadTeamThreadNames(false);

    void (async () => {
      try {
        const rawValue = await storage.getItem(teamThreadNamesStorageKey);
        if (!isActive) return;
        setTeamThreadNameOverrides(parseStoredNameOverrides(rawValue));
      } catch (error) {
        console.warn('Could not restore team thread names:', error);
        if (isActive) setTeamThreadNameOverrides({});
      } finally {
        if (isActive) setDidLoadTeamThreadNames(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [teamThreadNamesStorageKey]);

  useEffect(() => {
    if (!didLoadTeamThreadNames || !teamThreadNamesStorageKey) return;
    storage.setItem(teamThreadNamesStorageKey, JSON.stringify(teamThreadNameOverrides)).catch((error) => {
      console.warn('Could not persist team thread names:', error);
    });
  }, [didLoadTeamThreadNames, teamThreadNameOverrides, teamThreadNamesStorageKey]);

  const selectedThreadFromData = useMemo(
    () => allThreadItems.find((item) => item.orderId === selectedOrderId) ?? null,
    [allThreadItems, selectedOrderId]
  );
  const selectedThread = selectedThreadFromData;

  const selectedThreadOrder = useMemo(
    () => (selectedThread ? ordersById.get(selectedThread.orderId) ?? null : null),
    [ordersById, selectedThread]
  );
  const selectedTeamThread = useMemo<TeamThreadListItem | null>(() => {
    if (!selectedTeamThreadEntityId || !isTeamThreadEntityId(selectedTeamThreadEntityId)) return null;
    const existing = allTeamThreadItems.find((item) => item.entityId === selectedTeamThreadEntityId);
    if (existing) return existing;
    return {
      threadRecordId: null,
      entityId: selectedTeamThreadEntityId,
      id: selectedTeamThreadEntityId,
      name: getTeamThreadDisplayNameFromEntityId(selectedTeamThreadEntityId),
      subtitle: getTeamThreadSubtitleFromEntityId(selectedTeamThreadEntityId),
      preview: getTeamThreadSubtitleFromEntityId(selectedTeamThreadEntityId),
      updatedAt: null,
      unreadCount: teamUnreadCounts[selectedTeamThreadEntityId] ?? 0,
    };
  }, [allTeamThreadItems, selectedTeamThreadEntityId, teamUnreadCounts]);
  const selectedCaseThread = useMemo(() => {
    if (!selectedCaseThreadEntityId || isTeamThreadEntityId(selectedCaseThreadEntityId)) return null;
    const caseItem = casesById.get(selectedCaseThreadEntityId);
    if (caseItem) {
      return {
        entityId: selectedCaseThreadEntityId,
        title: caseItem.caseNumber ? `#${caseItem.caseNumber}` : 'Case thread',
        subtitle: caseItem.issueSummary?.trim() || 'Case conversation',
        status: caseItem.status || 'Open',
        displayEntityId: caseItem.caseNumber || selectedCaseThreadEntityId,
      };
    }
    return {
      entityId: selectedCaseThreadEntityId,
      title: 'Case thread',
      subtitle: 'Case conversation',
      status: 'Open',
      displayEntityId: selectedCaseThreadEntityId,
    };
  }, [casesById, selectedCaseThreadEntityId]);
  const orderStatusColorMap = useMemo(
    () => createOrderStatusColorMap(orderStatuses),
    [orderStatuses]
  );
  const selectedThreadStatusRaw = selectedThreadOrder?.status ?? 'Pending';
  const selectedThreadStatusColors = getOrderStatusChipColors(selectedThreadStatusRaw, orderStatusColorMap, isDark);
  const selectedThreadStatusDisplay = getThreadOrderStatusDisplay(selectedThreadStatusRaw, selectedThreadStatusColors);
  const selectedCaseStatusColors = getStatusChipColors(selectedCaseThread?.status ?? 'Open', isDark);

  const openOrderDetails = (_orderId: string) => {
    setShowOrderDetailOverlay(true);
  };

  const renderThreadRow = ({ item }: { item: ThreadListItem }) => {
    const isSelected = item.orderId === selectedOrderId;
    const isHovered = hoveredOrderId === item.orderId;
    const isClosed = isThreadClosed(item);
    const isPinned = pinnedThreadIds.includes(item.threadId);
    const hasManualUnread = manualUnreadThreadIds.includes(item.threadId);
    const displayUnreadCount = hasManualUnread ? Math.max(item.unreadCount, 1) : item.unreadCount;
    const standardTextSize = 14;
    const standardTextWeight = '600' as const;
    const orderTextSize = standardTextSize;
    const customerTextSize = isMobile ? 12 : 13;
    const previewTextWeight = '500' as const;
    const dateTextSize = isMobile ? 10 : 12;
    const unreadSize = showSplitView ? 24 : 22;
    const showDesktopHoverMenu = showSplitView && Platform.OS === 'web';
    const showTabletInlineMenu = showSplitView && Platform.OS !== 'web';
    const orderReference = formatOrderReference(item.orderNumber);
    const rowStatusColorsRaw = getOrderStatusChipColors(item.orderStatus, orderStatusColorMap, isDark);
    const rowStatusColors = getThreadOrderStatusDisplay(item.orderStatus, rowStatusColorsRaw);
    const customerInitial = getCustomerInitials(item.customerName);
    const avatarBackground = isDark ? '#D1D5DB' : '#0B0B0B';
    const avatarTextColor = isDark ? '#0B0B0B' : '#FFFFFF';
    return (
      <View
        style={{
          marginHorizontal: 12,
          marginBottom: 4,
          borderBottomWidth: isDark ? 0 : 0.5,
          borderBottomColor: isDark ? 'transparent' : 'rgba(15,23,42,0.08)',
        }}
      >
        <Pressable
          onPress={() => openThread(item)}
          onLongPress={() => {
            // Web desktop uses hover menus; skip long-press there
            if (showSplitView && Platform.OS === 'web') return;
            setThreadActionsTarget(item);
          }}
          onHoverIn={() => {
            if (Platform.OS !== 'web') return;
            setHoveredOrderId(item.orderId);
          }}
          onHoverOut={() => {
            if (Platform.OS !== 'web') return;
            setHoveredOrderId((current) => (current === item.orderId ? null : current));
          }}
          className="active:opacity-80 focus:outline-none"
          focusable={Platform.OS !== 'web'}
          style={{
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: isSelected ? colors.border.light : 'transparent',
            backgroundColor: isSelected
              ? selectedRowBackground
              : (isHovered ? hoverRowBackground : 'transparent'),
          }}
        >
          <View className="flex-row items-center">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: avatarBackground,
                marginRight: 10,
              }}
            >
              <Text style={{ color: avatarTextColor, fontSize: 16, fontWeight: '700' }}>
                {customerInitial}
              </Text>
            </View>

            <View className="flex-1" style={{ minHeight: 44, justifyContent: 'center' }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-2">
                  <Text
                    style={{ color: colors.text.primary, fontSize: orderTextSize, fontWeight: standardTextWeight }}
                    numberOfLines={1}
                  >
                    {item.customerName}
                  </Text>
                  {isPinned ? (
                    <Pin size={12} color={colors.text.muted} strokeWidth={2.2} style={{ marginLeft: 6 }} />
                  ) : null}
                </View>
                <View className="flex-row items-center">
                  {showDesktopHoverMenu || showTabletInlineMenu ? (
                    <Pressable
                      onPress={(event) => {
                        if (showDesktopHoverMenu) {
                          event.stopPropagation();
                          const pageX = event.nativeEvent.pageX ?? 0;
                          const pageY = event.nativeEvent.pageY ?? 0;
                          openWebMenu(item, pageX, pageY);
                          return;
                        }
                        setThreadActionsTarget(item);
                      }}
                      className="items-center justify-center active:opacity-70"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        marginRight: 4,
                        opacity: showDesktopHoverMenu
                          ? (isHovered || webThreadMenu?.item.threadId === item.threadId ? 1 : 0)
                          : 1,
                      }}
                    >
                      <MoreHorizontal size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                    </Pressable>
                  ) : null}
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: rowStatusColors.border,
                      backgroundColor: rowStatusColors.bg,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: rowStatusColors.text,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                      numberOfLines={1}
                    >
                      {rowStatusColors.label}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.tertiary, fontSize: dateTextSize, fontWeight: standardTextWeight, marginLeft: 8 }}>
                    {formatThreadTime(item.updatedAt)}
                  </Text>
                  {!showSplitView ? (
                    <Pressable
                      onPress={() => setThreadActionsTarget(item)}
                      className="items-center justify-center active:opacity-70"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        marginLeft: 6,
                      }}
                    >
                      <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2.2} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: '600',
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {orderReference}
              </Text>

              <View className="flex-row items-center justify-between mt-1">
                <Text
                  style={{ color: colors.text.secondary, fontSize: customerTextSize, fontWeight: previewTextWeight }}
                  className="flex-1 mr-2"
                  numberOfLines={1}
                >
                  {item.preview}
                </Text>
                {displayUnreadCount > 0 ? (
                  <View style={{ backgroundColor: '#EF4444', minWidth: unreadSize, height: unreadSize, borderRadius: unreadSize / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <Text className="text-xs font-bold text-white">{displayUnreadCount > 99 ? '99+' : displayUnreadCount}</Text>
                  </View>
                ) : isClosed ? (
                  <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700' }}>
                      Closed
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
        {isDark ? (
          <View
            style={{
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.06)',
              marginHorizontal: 12,
              marginTop: 4,
            }}
          />
        ) : null}
      </View>
    );
  };

  const renderCreateThreadCandidate = (order: (typeof orders)[number], index: number, length: number) => {
    const hasExistingThread = existingThreadOrderIds.has(order.id);
    return (
    <Pressable
      key={order.id}
      onPress={() => handleSelectOrderThreadCandidate(order)}
      disabled={createThreadMutation.isPending}
      className="active:opacity-80"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        borderBottomWidth: index === length - 1 ? 0 : 1,
        borderBottomColor: colors.border.light,
        opacity: createThreadMutation.isPending ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#D1D5DB' : '#0B0B0B',
          marginRight: 12,
        }}
      >
        <Text style={{ color: isDark ? '#0B0B0B' : '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
          {getCustomerInitials(order.customerName ?? 'Unknown customer')}
        </Text>
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {order.customerName ?? 'Unknown customer'}
        </Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
          {formatOrderReference(order.orderNumber ?? '')}
        </Text>
        <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {hasExistingThread ? 'Open existing thread' : 'Tap to start thread'}
        </Text>
      </View>
    </Pressable>
    );
  };

  const renderCreateTeamThreadCandidate = (
    channel: TeamThreadListItem,
    index: number,
    length: number
  ) => (
    <Pressable
      key={channel.entityId}
      onPress={() => handleSelectTeamThreadCandidate(channel.entityId)}
      className="active:opacity-80"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        borderBottomWidth: index === length - 1 ? 0 : 1,
        borderBottomColor: colors.border.light,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#D1D5DB' : '#0B0B0B',
          marginRight: 12,
        }}
      >
        <Hash size={18} color={isDark ? '#0B0B0B' : '#FFFFFF'} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
          {channel.preview || channel.subtitle}
        </Text>
      </View>
      {channel.unreadCount > 0 ? (
        <View style={{ backgroundColor: '#EF4444', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  const createThreadPanel = (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <View className="flex-row items-center">
          {showSplitView ? (
            <Pressable
              onPress={closeCreateThreadPicker}
              className="items-center justify-center active:opacity-80 mr-2"
              style={{ width: 28, height: 28 }}
            >
              <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700' }}>
            New thread
          </Text>
        </View>
        <Pressable
          onPress={closeCreateThreadPicker}
          className="items-center justify-center active:opacity-80"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            backgroundColor: colors.bg.secondary,
            borderWidth: 1,
            borderColor: colors.border.light,
          }}
        >
          <X size={18} color={colors.text.muted} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View
        className="flex-row items-center rounded-full px-4"
        style={{
          height: 46,
          backgroundColor: searchBackground,
          borderWidth: 1.5,
          borderColor: colors.accent.primary,
          marginBottom: 12,
        }}
      >
        <Search size={18} color={colors.text.muted} strokeWidth={2} />
        <TextInput
          value={createThreadQuery}
          onChangeText={setCreateThreadQuery}
          placeholder={createThreadMode === 'order' ? 'Search order or customer' : 'Search team thread'}
          placeholderTextColor={colors.input.placeholder}
          style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
          selectionColor={colors.text.primary}
        />
        <SearchClearButton visible={Boolean(createThreadQuery.trim())} onPress={() => setCreateThreadQuery('')} />
      </View>

      <View className="flex-row items-center" style={{ marginBottom: 12 }}>
        <Pressable
          onPress={() => setCreateThreadMode('order')}
          className="active:opacity-80"
          style={{
            height: 34,
            paddingHorizontal: 14,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: createThreadMode === 'order' ? 0 : 1,
            borderColor: colors.border.light,
            backgroundColor: createThreadMode === 'order' ? colors.accent.primary : colors.bg.secondary,
            marginRight: 8,
          }}
        >
          <Text style={{ color: createThreadMode === 'order' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 13, fontWeight: '700' }}>
            Order thread
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setCreateThreadMode('team')}
          disabled={!isAdmin}
          className="active:opacity-80"
          style={{
            height: 34,
            paddingHorizontal: 14,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: createThreadMode === 'team' ? 0 : 1,
            borderColor: colors.border.light,
            backgroundColor: createThreadMode === 'team' ? colors.accent.primary : colors.bg.secondary,
            opacity: isAdmin ? 1 : 0.45,
          }}
        >
          <Text style={{ color: createThreadMode === 'team' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 13, fontWeight: '700' }}>
            Team thread
          </Text>
        </Pressable>
      </View>

      {createThreadMode === 'team' ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.secondary,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>
            Create team thread
          </Text>
          {!isAdmin ? (
            <Text style={{ color: colors.text.muted, fontSize: 12, marginBottom: 8 }}>
              Only admins can create team threads.
            </Text>
          ) : null}
          <View className="flex-row items-center">
            <TextInput
              value={newTeamThreadName}
              onChangeText={setNewTeamThreadName}
              placeholder="Enter thread name"
              placeholderTextColor={colors.input.placeholder}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                paddingHorizontal: 12,
                color: colors.input.text,
                fontSize: 13,
                fontWeight: '500',
              }}
              selectionColor={colors.text.primary}
            />
            <Pressable
              onPress={() => createTeamThreadMutation.mutate(newTeamThreadName)}
              disabled={!isAdmin || createTeamThreadMutation.isPending || newTeamThreadName.trim().length < 2}
              className="active:opacity-80"
              style={{
                height: 40,
                paddingHorizontal: 14,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 8,
                backgroundColor: colors.accent.primary,
                opacity: !isAdmin || createTeamThreadMutation.isPending || newTeamThreadName.trim().length < 2 ? 0.5 : 1,
              }}
            >
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                Create
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {(createThreadMode === 'order' ? createThreadCandidates.length === 0 : createTeamThreadCandidates.length === 0) ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text style={{ color: colors.text.muted, fontSize: 14, textAlign: 'center' }}>
              {createThreadMode === 'order'
                ? 'No orders found for this search.'
                : 'No team threads found for this search.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.text.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
              {createThreadMode === 'order' ? 'Customers & Orders' : 'Team channels'}
            </Text>
            <FlatList<CreateThreadPickerItem>
              data={createThreadPickerData}
              keyExtractor={(entry) => `${entry.type}:${entry.item.id}`}
              renderItem={({ item, index }) => (
                item.type === 'order'
                  ? renderCreateThreadCandidate(item.item, index, Math.min(createThreadCandidates.length, 80))
                  : renderCreateTeamThreadCandidate(item.item, index, Math.min(createTeamThreadCandidates.length, 80))
              )}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>
    </View>
  );

  const emptyState = (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.bg.secondary }}>
        <MessageSquare size={28} color={colors.text.muted} strokeWidth={1.8} />
      </View>
      <Text style={{ color: colors.text.primary }} className="text-base font-semibold text-center">No threads yet</Text>
      <Text style={{ color: colors.text.muted }} className="text-sm text-center mt-1">
        Start a thread from any order to see it here.
      </Text>
    </View>
  );

  const threadListHeader = (
    <View>
      <View
        style={{
          backgroundColor: isWebDesktop ? colors.bg.card : colors.bg.primary,
          borderBottomWidth: isWebDesktop ? 0 : 0.5,
          borderBottomColor: colors.border.light,
        }}
      >
        <View
          style={[
            {
              paddingHorizontal: isWebDesktop ? 22 : 20,
              paddingTop: isWebDesktop ? 0 : 16,
              paddingBottom: isWebDesktop ? 12 : 8,
            },
            isWebDesktop ? { maxWidth: 1456, width: '100%', alignSelf: 'flex-start' } : undefined,
          ]}
        >
          <View
            className={isWebDesktop ? 'flex-row items-center justify-between' : undefined}
            style={isWebDesktop ? {
              minHeight: desktopHeaderMinHeight,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
              marginBottom: 12,
              marginHorizontal: -22,
              paddingHorizontal: 22,
            } : {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View className="flex-1 mr-3">
              <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>Threads</Text>
            </View>
            <Pressable
              onPress={() => setShowCreateThreadPicker(true)}
              disabled={!businessId || isOfflineMode}
              className="active:opacity-80"
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: colors.border.light,
                opacity: !businessId || isOfflineMode ? 0.5 : 1,
              }}
            >
              <Plus size={18} color="#111111" strokeWidth={2.5} />
              <Text style={{ color: '#111111', fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
                New thread
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View
        style={[
          {
            paddingHorizontal: isWebDesktop ? 22 : 20,
            paddingTop: 12,
          },
          isWebDesktop ? { maxWidth: 1456, width: '100%', alignSelf: 'flex-start' } : undefined,
        ]}
      >
        <View className="flex-row items-center">
          <View
            className="flex-row items-center rounded-full px-4"
            style={{ flex: 1, height: 46, backgroundColor: searchBackground, borderWidth: 1, borderColor: colors.border.light }}
          >
            <Search size={18} color={colors.text.muted} strokeWidth={2} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by order or customer"
              placeholderTextColor={colors.input.placeholder}
              style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
              selectionColor={colors.text.primary}
            />
            <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
          </View>
          <Pressable
            onPress={() => setShowFilterMenu(true)}
            className="items-center justify-center active:opacity-80"
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.card,
              borderWidth: activeFilterCount > 0 ? 0 : 1,
              borderColor: colors.border.light,
              marginLeft: 8,
            }}
          >
            <Filter size={18} color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
            {activeFilterCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 17,
                  height: 17,
                  borderRadius: 8.5,
                  backgroundColor: '#EF4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isTeamThreadsCollapsed ? 0 : 8 }}>
            <Pressable
              onPress={() => setIsTeamThreadsCollapsed((prev) => !prev)}
              className="active:opacity-80"
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Text
                style={{
                  color: colors.text.muted,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                }}
              >
                Team Threads
              </Text>
              {teamThreadUnreadTotal > 0 ? (
                <View
                  style={{
                    marginLeft: 8,
                    minWidth: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                    {teamThreadUnreadTotal > 99 ? '99+' : teamThreadUnreadTotal}
                  </Text>
                </View>
              ) : null}
              {isTeamThreadsCollapsed ? (
                <ChevronUp size={16} color={colors.text.muted} strokeWidth={2.2} style={{ marginLeft: 8 }} />
              ) : (
                <ChevronDown size={16} color={colors.text.muted} strokeWidth={2.2} style={{ marginLeft: 8 }} />
              )}
            </Pressable>
            <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700' }}>
              {allTeamThreadItems.length} Thread{allTeamThreadItems.length === 1 ? '' : 's'}
            </Text>
          </View>

          {!isTeamThreadsCollapsed ? (
            allTeamThreadItems.length > 0 ? (
              <View style={{ gap: 10 }}>
                {allTeamThreadItems.map((teamItem) => {
                  const isSelected = selectedTeamThreadEntityId === teamItem.entityId;
                  const unreadCount = teamItem.unreadCount;
                  return (
                    <Pressable
                      key={teamItem.entityId}
                      onPress={() => openTeamThread(teamItem.entityId)}
                      disabled={!businessId || isOfflineMode}
                      className="active:opacity-85"
                      style={{
                        borderRadius: 24,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        minHeight: 86,
                        backgroundColor: companyCardBackground,
                        borderWidth: 1,
                        borderColor: isSelected ? '#2563EB' : companyCardBorder,
                        overflow: 'hidden',
                        shadowColor: '#020617',
                        shadowOpacity: isDark ? 0.26 : 0.1,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 8,
                        opacity: !businessId || isOfflineMode ? 0.55 : 1,
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          right: -10,
                          top: -8,
                          width: 170,
                          height: 120,
                          pointerEvents: 'none',
                        }}
                      >
                        <View
                          style={{
                            position: 'absolute',
                            right: 14,
                            top: 12,
                            width: 90,
                            height: 20,
                            borderRadius: 999,
                            backgroundColor: 'rgba(148,163,184,0.12)',
                          }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            right: -2,
                            top: 40,
                            width: 110,
                            height: 16,
                            borderRadius: 999,
                            backgroundColor: 'rgba(148,163,184,0.09)',
                          }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            right: 40,
                            top: -12,
                            width: 14,
                            height: 140,
                            borderRadius: 999,
                            backgroundColor: 'rgba(148,163,184,0.1)',
                            transform: [{ rotate: '8deg' }],
                          }}
                        />
                      </View>

                      <View className="flex-row items-center">
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: companyCardAvatar,
                            borderWidth: 1,
                            borderColor: 'rgba(148,163,184,0.24)',
                            marginRight: 12,
                          }}
                        >
                          <Hash size={24} color={companyCardTextPrimary} strokeWidth={2.2} />
                        </View>

                        <View className="flex-1">
                          <Text style={{ color: companyCardTextPrimary, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                            {teamItem.name}
                          </Text>
                          <Text style={{ color: companyCardTextSecondary, fontSize: 13, fontWeight: '500', marginTop: 3 }} numberOfLines={1}>
                            {teamItem.preview}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                          <Text style={{ color: companyCardTextMuted, fontSize: 11, fontWeight: '700' }}>
                            {teamItem.updatedAt ? formatThreadTime(teamItem.updatedAt) : ''}
                          </Text>
                          {unreadCount > 0 ? (
                            <View
                              style={{
                                marginTop: 6,
                                minWidth: 24,
                                height: 24,
                                borderRadius: 12,
                                backgroundColor: '#EF4444',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingHorizontal: 6,
                              }}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </Text>
                            </View>
                          ) : (
                            <View style={{ marginTop: 6, minWidth: 24, height: 24 }} />
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  if (!isAdmin) return;
                  setCreateThreadMode('team');
                  setShowCreateThreadPicker(true);
                }}
                disabled={!businessId || isOfflineMode || !isAdmin}
                className="active:opacity-80"
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.card,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: !businessId || isOfflineMode || !isAdmin ? 0.55 : 1,
                }}
              >
                <Plus size={16} color={colors.text.primary} strokeWidth={2.4} />
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600', marginLeft: 8 }}>
                  Create first team thread
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 6,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            color: colors.text.muted,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Order Threads
        </Text>
        <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700' }}>
          {filteredThreadItems.length} Thread{filteredThreadItems.length === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );

  const listPane = showSplitView && showCreateThreadPicker ? (
    <View
      style={{
        flex: 1,
        backgroundColor: leftPaneBackground,
        paddingHorizontal: 16,
        paddingTop: isWebDesktop ? 18 : 12,
        paddingBottom: 8,
      }}
    >
      {createThreadPanel}
    </View>
  ) : (
    <View style={{ flex: 1, backgroundColor: leftPaneBackground }}>
      <FlatList
        ref={threadListRef}
        data={filteredThreadItems}
        keyExtractor={(item) => item.threadId}
        ListHeaderComponent={threadListHeader}
        renderItem={renderThreadRow}
        ListEmptyComponent={emptyState}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          lastThreadListOffset = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      />
    </View>
  );

  const chatPane = selectedThread ? (
    <View style={{ flex: 1, backgroundColor: rightPaneBackground }}>
      <View
        className="flex-row items-center justify-between px-5 py-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.card }}
      >
        {!showSplitView ? (
          <Pressable
            onPress={closeMobileThreadView}
            className="items-center justify-center mr-3 active:opacity-70"
            style={{ width: 28, height: 28 }}
          >
            <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View className="flex-1 flex-row items-center">
          <Pressable
            onPress={() => openOrderDetails(selectedThread.orderId)}
            className="flex-1 flex-row items-center justify-between active:opacity-70"
          >
            <View className="flex-row items-center flex-1 mr-2">
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? '#D1D5DB' : '#0B0B0B',
                  marginRight: 10,
                }}
              >
                <Text style={{ color: isDark ? '#0B0B0B' : '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                  {getCustomerInitials(selectedThread.customerName)}
                </Text>
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                  {formatThreadTitle(selectedThread.customerName, selectedThread.orderNumber)}
                </Text>
              </View>
            </View>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: selectedThreadStatusDisplay.border,
                backgroundColor: selectedThreadStatusDisplay.bg,
              }}
            >
              <Text
                style={{
                  color: selectedThreadStatusDisplay.text,
                  fontSize: 11,
                  fontWeight: '700',
                }}
                numberOfLines={1}
              >
                {selectedThreadStatusDisplay.label}
              </Text>
            </View>
          </Pressable>
          {!showSplitView ? (
            <Pressable
              onPress={() => setThreadActionsTarget(selectedThread)}
              className="items-center justify-center active:opacity-70"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                marginLeft: 8,
              }}
            >
              <ChevronDown size={20} color={colors.text.tertiary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <CollaborationThreadPanel
        businessId={businessId}
        entityType="order"
        entityId={selectedThread.orderId}
        displayEntityId={formatOrderReference(selectedThread.orderNumber)}
        isOfflineMode={isOfflineMode}
        variant="pane"
        showHeader={false}
      />

      {showOrderDetailOverlay ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: colors.bg.primary,
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
              backgroundColor: colors.bg.card,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
              Order details
            </Text>
            <Pressable
              onPress={() => setShowOrderDetailOverlay(false)}
              className="items-center justify-center active:opacity-80"
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <X size={16} color={colors.text.muted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            <OrderDetailPanel
              orderId={selectedThread.orderId}
              onClose={() => setShowOrderDetailOverlay(false)}
              disableRootFlex
            />
          </ScrollView>
        </View>
      ) : null}
    </View>
  ) : selectedTeamThread ? (
    <View style={{ flex: 1, backgroundColor: rightPaneBackground }}>
      <View
        className="flex-row items-center px-5 py-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.card }}
      >
        {!showSplitView ? (
          <Pressable
            onPress={closeMobileThreadView}
            className="items-center justify-center mr-3 active:opacity-70"
            style={{ width: 28, height: 28 }}
          >
            <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View className="flex-1 flex-row items-center">
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#D1D5DB' : '#0B0B0B',
              marginRight: 10,
            }}
          >
            <Hash size={18} color={isDark ? '#0B0B0B' : '#FFFFFF'} strokeWidth={2.2} />
          </View>
          <Pressable className="flex-1" onPress={() => setShowTeamInfo(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                {selectedTeamThread.name}
              </Text>
              <ChevronDown size={13} color={colors.text.muted} strokeWidth={2.5} />
            </View>
            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              Team thread · tap for info
            </Text>
          </Pressable>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.secondary,
            }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '700' }}>
                Team
              </Text>
            </View>
          <Pressable
            onPress={() => setShowTeamSearch(true)}
            className="items-center justify-center active:opacity-70"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              marginLeft: 8,
            }}
          >
            <Search size={17} color={colors.text.tertiary} strokeWidth={2.2} />
          </Pressable>
          {isAdmin ? (
            <Pressable
              onPress={() => openTeamThreadActions(selectedTeamThread)}
              className="items-center justify-center active:opacity-70"
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                marginLeft: 4,
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <MoreHorizontal size={17} color={colors.text.tertiary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <CollaborationThreadPanel
        businessId={businessId}
        entityType="case"
        entityId={selectedTeamThread.entityId}
        displayEntityId={selectedTeamThread.name}
        isOfflineMode={isOfflineMode}
        variant="pane"
        showHeader={false}
        forceShowInfo={showTeamInfo}
        onInfoModalDismiss={() => setShowTeamInfo(false)}
        forceShowSearch={showTeamSearch}
        onSearchDismiss={() => setShowTeamSearch(false)}
      />
    </View>
  ) : selectedCaseThread ? (
    <View style={{ flex: 1, backgroundColor: rightPaneBackground }}>
      <View
        className="flex-row items-center px-5 py-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, backgroundColor: colors.bg.card }}
      >
        {!showSplitView ? (
          <Pressable
            onPress={closeMobileThreadView}
            className="items-center justify-center mr-3 active:opacity-70"
            style={{ width: 28, height: 28 }}
          >
            <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View className="flex-1 flex-row items-center">
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#D1D5DB' : '#0B0B0B',
              marginRight: 10,
            }}
          >
            <MessageSquare size={17} color={isDark ? '#0B0B0B' : '#FFFFFF'} strokeWidth={2.2} />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
              {selectedCaseThread.title}
            </Text>
            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {selectedCaseThread.subtitle}
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: selectedCaseStatusColors.border,
              backgroundColor: selectedCaseStatusColors.bg,
              marginLeft: 8,
            }}
          >
            <Text
              style={{
                color: selectedCaseStatusColors.text,
                fontSize: 11,
                fontWeight: '700',
              }}
              numberOfLines={1}
            >
              {selectedCaseThread.status}
            </Text>
          </View>
        </View>
      </View>

      <CollaborationThreadPanel
        businessId={businessId}
        entityType="case"
        entityId={selectedCaseThread.entityId}
        displayEntityId={selectedCaseThread.displayEntityId}
        isOfflineMode={isOfflineMode}
        variant="pane"
        showHeader={false}
      />
    </View>
  ) : (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: rightPaneBackground }}>
      <MessageSquare size={28} color={colors.text.muted} strokeWidth={1.8} />
      <Text style={{ color: colors.text.primary }} className="text-base font-semibold mt-3">
        Select a thread
      </Text>
      <Text style={{ color: colors.text.muted }} className="text-sm text-center mt-1">
        Choose a conversation to open the chat panel.
      </Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']} style={{ backgroundColor: showSplitView ? splitShellBackground : colors.bg.primary }}>
      {showSplitView ? (
        <View className="flex-1 flex-row" style={{ backgroundColor: splitShellBackground }}>
          <View
            style={{
              width: isWebDesktop ? 430 : 350,
              borderRightWidth: 1,
              borderRightColor: colors.border.light,
              backgroundColor: leftPaneBackground,
            }}
          >
            {listPane}
          </View>
          <View className="flex-1" style={{ backgroundColor: rightPaneBackground }}>
            {chatPane}
          </View>
        </View>
      ) : (selectedOrderId || selectedTeamThreadEntityId || selectedCaseThreadEntityId) ? (
        chatPane
      ) : (
        listPane
      )}

      {!showSplitView ? (
        <Modal
          visible={showCreateThreadPicker}
          animationType="slide"
          onRequestClose={closeCreateThreadPicker}
          presentationStyle="fullScreen"
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.bg.card,
              paddingHorizontal: 14,
              paddingTop: Math.max(12, insets.top + 6),
              paddingBottom: Math.max(12, insets.bottom + 6),
            }}
          >
            {createThreadPanel}
          </View>
        </Modal>
      ) : null}

      <Modal
        visible={showFilterMenu}
        transparent
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          onPress={() => setShowFilterMenu(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: (Platform.OS === 'web' && showSplitView) ? 'center' : 'flex-end',
            paddingHorizontal: (Platform.OS === 'web' && showSplitView) ? 16 : 10,
            paddingTop: (Platform.OS === 'web' && showSplitView) ? 20 : 0,
            paddingBottom: (Platform.OS === 'web' && showSplitView) ? 16 : 8,
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: colors.bg.card,
              borderTopLeftRadius: (Platform.OS === 'web' && showSplitView) ? 18 : 24,
              borderTopRightRadius: (Platform.OS === 'web' && showSplitView) ? 18 : 24,
              borderBottomLeftRadius: (Platform.OS === 'web' && showSplitView) ? 18 : 24,
              borderBottomRightRadius: (Platform.OS === 'web' && showSplitView) ? 18 : 24,
              borderWidth: 1,
              borderColor: colors.border.light,
              paddingHorizontal: 0,
              paddingTop: 8,
              paddingBottom: Math.max(22, insets.bottom + 14),
              maxHeight: '80%',
              width: (Platform.OS === 'web' && showSplitView) ? 430 : '100%',
              alignSelf: 'center',
            }}
          >
            {!(Platform.OS === 'web' && showSplitView) ? (
              <View className="items-center py-3">
                <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border.light }} />
              </View>
            ) : null}

            <View className="flex-row items-center justify-between px-6 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: subtleDivider }}>
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700' }}>
                Filter & Sort
              </Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="items-center justify-center active:opacity-80"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-6 pt-5">
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Thread state
                </Text>
                {[
                  { key: 'open', label: 'Open threads' },
                  { key: 'closed', label: 'Closed threads' },
                  { key: 'all', label: 'All threads' },
                ].map((option, index, arr) => {
                  const isActive = threadVisibilityFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setThreadVisibilityFilter(option.key as 'open' | 'closed' | 'all')}
                      className="active:opacity-80"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        borderBottomWidth: index === arr.length - 1 ? 0 : 0.5,
                        borderBottomColor: subtleDivider,
                      }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                        {option.label}
                      </Text>
                      {isActive ? (
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.accent.primary,
                          }}
                        >
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-6 pt-5" style={{ borderTopWidth: 0.5, borderTopColor: subtleDivider, marginTop: 10 }}>
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Order status
                </Text>
                {statusFilterOptions.map((statusKey, index, arr) => {
                  const isActive = statusFilter === statusKey;
                  const label = statusKey === 'all' ? 'All statuses' : statusKey;
                  return (
                    <Pressable
                      key={statusKey}
                      onPress={() => setStatusFilter(statusKey)}
                      className="active:opacity-80"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        borderBottomWidth: index === arr.length - 1 ? 0 : 0.5,
                        borderBottomColor: subtleDivider,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text.primary,
                          fontSize: 14,
                          fontWeight: statusKey === 'all' ? '600' : '700',
                          textTransform: statusKey === 'all' ? 'none' : 'capitalize',
                        }}
                      >
                        {label}
                      </Text>
                      {isActive ? (
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.accent.primary,
                          }}
                        >
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-6 py-5" style={{ borderTopWidth: 0.5, borderTopColor: subtleDivider, marginTop: 10 }}>
                <View className="flex-row items-center" style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      setStatusFilter('all');
                      setThreadVisibilityFilter('open');
                    }}
                    className="active:opacity-80 items-center justify-center"
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 999,
                      backgroundColor: colors.bg.secondary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                      Clear
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowFilterMenu(false)}
                    className="active:opacity-80 items-center justify-center"
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 999,
                      backgroundColor: colors.accent.primary,
                    }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                      Apply
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={threadActionsTarget !== null}
        transparent
        animationType={showSplitView ? 'fade' : 'none'}
        onRequestClose={() => setThreadActionsTarget(null)}
      >
        <Pressable
          onPress={() => setThreadActionsTarget(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.42)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: colors.bg.primary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 0,
              paddingTop: 0,
              paddingBottom: Math.max(14, insets.bottom + 8),
            }}
          >
            <View className="items-center py-3">
              <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border.light }} />
            </View>

            <View className="px-6 pb-3" style={{ borderBottomWidth: 0.5, borderBottomColor: subtleDivider }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {threadActionsTarget ? `${formatOrderReference(threadActionsTarget.orderNumber)} options` : 'Thread options'}
              </Text>
            </View>

            <View className="px-5">
              <Pressable
                onPress={() => {
                  if (!threadActionsTarget) return;
                  markThreadAsUnread(threadActionsTarget);
                }}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 15,
                  borderBottomWidth: 0.5,
                  borderBottomColor: subtleDivider,
                }}
              >
                <CheckCheck size={22} color={colors.text.tertiary} strokeWidth={1.9} />
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginLeft: 12 }}>
                  Mark as unread
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!threadActionsTarget) return;
                  togglePinnedThread(threadActionsTarget);
                }}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 15,
                  borderBottomWidth: 0.5,
                  borderBottomColor: subtleDivider,
                }}
              >
                <Pin size={22} color={colors.text.tertiary} strokeWidth={1.9} />
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginLeft: 12 }}>
                  {threadActionsTarget && pinnedThreadIds.includes(threadActionsTarget.threadId) ? 'Unpin thread' : 'Pin thread'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!threadActionsTarget) return;
                  void copyOrderId(threadActionsTarget);
                }}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 15,
                }}
              >
                <Copy size={22} color={colors.text.tertiary} strokeWidth={1.9} />
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginLeft: 12 }}>
                  Copy order ID
                </Text>
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: subtleDivider, marginHorizontal: 24, marginTop: 4 }} />

            <View className="px-5">
              <Pressable
                onPress={() => {
                  if (!threadActionsTarget) return;
                  if (isThreadClosed(threadActionsTarget)) {
                    reopenThread(threadActionsTarget);
                  } else {
                    closeThread(threadActionsTarget);
                  }
                }}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 16,
                }}
              >
                <Archive size={22} color="#DC2626" strokeWidth={1.9} />
                <Text style={{ color: '#DC2626', fontSize: 15, fontWeight: '700', marginLeft: 12 }}>
                  {threadActionsTarget && isThreadClosed(threadActionsTarget) ? 'Reopen thread' : 'Close thread'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={teamThreadActionsTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeTeamThreadActions}
      >
        <Pressable
          onPress={closeTeamThreadActions}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.42)',
            justifyContent: 'flex-start',
            alignItems: 'flex-end',
            paddingTop: Math.max(insets.top + 66, 82),
            paddingHorizontal: 14,
            paddingBottom: Math.max(insets.bottom + 18, 24),
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: showSplitView ? 320 : '92%',
              maxWidth: 360,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              paddingHorizontal: 14,
              paddingVertical: 16,
              shadowColor: '#000000',
              shadowOpacity: isDark ? 0.32 : 0.12,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
            }}
          >
            <View
              className="flex-row items-center justify-between"
              style={{ paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: subtleDivider }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 }} numberOfLines={1}>
                {teamThreadActionsTarget?.name ?? 'Team thread options'}
              </Text>
              <Pressable
                onPress={closeTeamThreadActions}
                className="items-center justify-center active:opacity-80"
                style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg.secondary }}
              >
                <X size={14} color={colors.text.muted} strokeWidth={2.4} />
              </Pressable>
            </View>

            <View style={{ paddingTop: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Rename thread
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={teamThreadDraftName}
                  onChangeText={setTeamThreadDraftName}
                  placeholder="Thread name"
                  placeholderTextColor={colors.input.placeholder}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.secondary,
                    color: colors.input.text,
                    paddingHorizontal: 12,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                  editable={isAdmin}
                />
                <Pressable
                  onPress={saveTeamThreadName}
                  disabled={!isAdmin || teamThreadDraftName.trim().length < 2}
                  className="items-center justify-center active:opacity-80"
                  style={{
                    height: 40,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: colors.accent.primary,
                    marginLeft: 8,
                    opacity: !isAdmin || teamThreadDraftName.trim().length < 2 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <Pressable
                onPress={() => {
                  if (!teamThreadActionsTarget) return;
                  void copyTeamThreadId(teamThreadActionsTarget);
                }}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 42,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Copy size={18} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>
                  Copy thread ID
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!teamThreadActionsTarget?.threadRecordId || !isAdmin) return;
                  deleteTeamThreadMutation.mutate(teamThreadActionsTarget.threadRecordId);
                }}
                disabled={!isAdmin || !teamThreadActionsTarget?.threadRecordId || deleteTeamThreadMutation.isPending}
                className="active:opacity-80"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 42,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  backgroundColor: isDark ? 'rgba(220,38,38,0.16)' : 'rgba(220,38,38,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(220,38,38,0.28)',
                  marginTop: 10,
                  opacity: !isAdmin || !teamThreadActionsTarget?.threadRecordId || deleteTeamThreadMutation.isPending ? 0.5 : 1,
                }}
              >
                <Archive size={18} color="#DC2626" strokeWidth={2} />
                <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '700', marginLeft: 10 }}>
                  Delete thread
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={webThreadMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setWebThreadMenu(null)}
      >
        <Pressable
          onPress={() => setWebThreadMenu(null)}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        >
          {webThreadMenu ? (
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                position: 'absolute',
                top: (() => {
                  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
                  const estimatedMenuHeight = 224;
                  const preferredTop = webThreadMenu.y - estimatedMenuHeight - 8;
                  return Math.max(8, Math.min(viewportHeight - estimatedMenuHeight - 8, preferredTop));
                })(),
                left: (() => {
                  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
                  return Math.max(8, Math.min(viewportWidth - 244, webThreadMenu.x - 210));
                })(),
                width: 236,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                shadowColor: '#000000',
                shadowOpacity: isDark ? 0.34 : 0.12,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 10 },
                elevation: 18,
                overflow: 'hidden',
              }}
            >
              <Pressable
                onPress={() => markThreadAsUnread(webThreadMenu.item)}
                className="active:opacity-80"
                style={{ height: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}
              >
                <CheckCheck size={17} color={colors.text.tertiary} strokeWidth={2.1} />
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginLeft: 10 }}>
                  Mark as unread
                </Text>
              </Pressable>
              <Pressable
                onPress={() => togglePinnedThread(webThreadMenu.item)}
                className="active:opacity-80"
                style={{ height: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}
              >
                <Pin size={17} color={colors.text.tertiary} strokeWidth={2.1} />
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginLeft: 10 }}>
                  {pinnedThreadIds.includes(webThreadMenu.item.threadId) ? 'Unpin thread' : 'Pin thread'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void copyOrderId(webThreadMenu.item);
                }}
                className="active:opacity-80"
                style={{ height: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}
              >
                <Copy size={17} color={colors.text.tertiary} strokeWidth={2.1} />
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginLeft: 10 }}>
                  Copy order ID
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: 14 }} />
              <Pressable
                onPress={() => {
                  if (isThreadClosed(webThreadMenu.item)) {
                    reopenThread(webThreadMenu.item);
                  } else {
                    closeThread(webThreadMenu.item);
                  }
                }}
                className="active:opacity-80"
                style={{ height: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}
              >
                <Archive size={17} color="#DC2626" strokeWidth={2.1} />
                <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '600', marginLeft: 10 }}>
                  {isThreadClosed(webThreadMenu.item) ? 'Reopen thread' : 'Close thread'}
                </Text>
              </Pressable>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
