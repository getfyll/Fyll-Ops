import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowDownUp, ChevronRight, Filter, Plus, RotateCcw, Search } from 'lucide-react-native';
import { CaseForm, type CaseReturnDetails } from '@/components/CaseForm';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  RETURN_STATUSES,
  generateCaseId,
  generateCaseNumber,
  type Case,
  type ReturnRequest,
  type ReturnStatus,
} from '@/lib/state/fyll-store';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { SearchClearButton } from '@/components/SearchClearButton';

type ReturnDateFilter = '7d' | 'month' | '30d' | 'year';
type ReturnSort = 'newest' | 'oldest';

const statusLabel = (status: ReturnStatus) => RETURN_STATUSES.find((item) => item.value === status)?.label ?? status;
const reasonLabel = (reason: ReturnRequest['reason']) => RETURN_REASONS.find((item) => item.value === reason)?.label ?? reason;
const returnReasonLabel = (item: ReturnRequest) => item.reason === 'other' && item.otherReason?.trim() ? item.otherReason.trim() : reasonLabel(item.reason);
const resolutionLabel = (resolution: ReturnRequest['resolution']) => RETURN_RESOLUTIONS.find((item) => item.value === resolution)?.label ?? resolution;
const returnDateFilters: Array<{ key: ReturnDateFilter; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This Year' },
];
const returnStatusFilters: Array<{ key: ReturnStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  ...RETURN_STATUSES.map((item) => ({ key: item.value, label: item.label })),
];
const makeReturnRef = () => `RET-${Math.floor(100000 + Math.random() * 900000)}`;
const makeReturnId = () => `return-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeReturnActivityId = () => `return-activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getDateFilterStartMs = (filter: ReturnDateFilter) => {
  const now = new Date();
  const start = new Date(now);
  if (filter === '7d') {
    start.setDate(now.getDate() - 7);
  } else if (filter === '30d') {
    start.setDate(now.getDate() - 30);
  } else if (filter === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return start.getTime();
};

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const statusColors: Record<ReturnStatus, { bg: string; text: string; border: string }> = {
  initiated: { bg: 'rgba(59,130,246,0.12)', text: '#2563EB', border: 'rgba(59,130,246,0.2)' },
  picked_up: { bg: '#FFF7ED', text: '#F59E0B', border: '#FED7AA' },
  received: { bg: 'rgba(16,185,129,0.12)', text: '#059669', border: 'rgba(16,185,129,0.22)' },
  processed: { bg: 'rgba(34,197,94,0.14)', text: '#16A34A', border: 'rgba(34,197,94,0.22)' },
};

export default function ReturnsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const headingStyle = getStandardPageHeadingStyle(isMobile);
  const returns = useFyllStore((s) => s.returns);
  const cases = useFyllStore((s) => s.cases);
  const addReturn = useFyllStore((s) => s.addReturn);
  const addCase = useFyllStore((s) => s.addCase);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<ReturnDateFilter>('30d');
  const [sortBy, setSortBy] = useState<ReturnSort>('newest');
  const [showReturnCaseForm, setShowReturnCaseForm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const periodReturns = useMemo(() => {
    const startMs = getDateFilterStartMs(dateFilter);
    return returns.filter((item) => {
      const value = new Date(item.updatedAt || item.createdAt).getTime();
      return Number.isFinite(value) && value >= startMs;
    });
  }, [dateFilter, returns]);

  const filteredReturns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...periodReturns]
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => {
        if (!query) return true;
        return [
          item.ref,
          item.orderNumber,
          item.customerName,
          item.customerEmail,
          item.customerPhone,
          item.itemSummary,
          returnReasonLabel(item),
          resolutionLabel(item.resolution),
        ].some((value) => String(value ?? '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt).getTime();
        return sortBy === 'newest' ? bDate - aDate : aDate - bDate;
      });
  }, [periodReturns, searchQuery, sortBy, statusFilter]);

  const counts = useMemo(() => ({
    all: periodReturns.length,
    initiated: periodReturns.filter((item) => item.status === 'initiated').length,
    picked_up: periodReturns.filter((item) => item.status === 'picked_up').length,
    received: periodReturns.filter((item) => item.status === 'received').length,
    processed: periodReturns.filter((item) => item.status === 'processed').length,
  }), [periodReturns]);

  const stats = useMemo(() => {
    const sellerShipping = periodReturns.filter((item) => item.shippingPayer === 'seller').length;
    const proofCount = periodReturns.filter((item) => (item.proofImages?.length ?? 0) > 0).length;
    return [
      {
        key: 'total',
        label: 'Returns made',
        value: counts.all.toLocaleString(),
        caption: 'Submitted in selected period',
      },
      {
        key: 'active',
        label: 'Active returns',
        value: (counts.initiated + counts.picked_up + counts.received).toLocaleString(),
        caption: 'Awaiting return workflow',
      },
      {
        key: 'seller',
        label: 'Seller shipping',
        value: sellerShipping.toLocaleString(),
        caption: 'Business covers pickup',
      },
      {
        key: 'proof',
        label: 'Proof attached',
        value: proofCount.toLocaleString(),
        caption: 'Returns with issue images',
      },
    ];
  }, [counts, periodReturns]);

  const openReturn = (item: ReturnRequest) => {
    router.push(`/return/${item.id}` as any);
  };

  const renderReturnRow = (item: ReturnRequest) => {
    const chip = statusColors[item.status];
    if (isMobile) {
      return (
        <Pressable
          key={item.id}
          onPress={() => openReturn(item)}
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.card,
            padding: 16,
            marginBottom: 12,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{item.ref}</Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 4 }} numberOfLines={1}>
                {item.orderNumber} · {item.customerName}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: chip.border, backgroundColor: chip.bg, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: chip.text, fontSize: 10, fontWeight: '500' }}>{statusLabel(item.status)}</Text>
            </View>
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', flexShrink: 0 }}>
              {formatDate(item.updatedAt || item.createdAt)}
            </Text>
          </View>
        </Pressable>
      );
    }

    const linkedCase = item.caseId ? cases.find((caseItem) => caseItem.id === item.caseId) : null;

    return (
      <Pressable
        key={item.id}
        onPress={() => openReturn(item)}
        style={{
          minHeight: isMobile ? 118 : 70,
          paddingHorizontal: isMobile ? 18 : 20,
          paddingVertical: isMobile ? 16 : 12,
          borderTopWidth: 0.5,
          borderTopColor: colors.border.light,
          gap: isMobile ? 10 : 0,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <View style={{ flex: 1.5, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{item.ref}</Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 3 }} numberOfLines={1}>
            {item.orderNumber} · {item.customerName}
          </Text>
        </View>
        <View style={{ flex: 1.35, minWidth: 0 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{returnReasonLabel(item)}</Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 3 }}>
            {resolutionLabel(item.resolution)} · {item.shippingPayer === 'seller' ? 'Seller shipping' : 'Customer shipping'}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: isMobile ? 'flex-start' : 'center' }}>
          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: chip.border, backgroundColor: chip.bg, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: chip.text, fontSize: 10, fontWeight: '500' }}>{statusLabel(item.status)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>{formatDate(item.updatedAt || item.createdAt)}</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 3 }}>
            {linkedCase?.caseNumber ?? 'No case link'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const contentPaddingBottom = (isDesktop ? 32 : 24) + tabBarHeight;
  const contentMaxWidth = isDesktop ? 1400 : undefined;
  const separatorColor = colors.border.light;
  const isDark = colors.bg.primary === '#111111';
  const activeFilterCount =
    (dateFilter !== '30d' ? 1 : 0)
    + (statusFilter !== 'all' ? 1 : 0)
    + (sortBy !== 'newest' ? 1 : 0);
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const openNewReturnForm = () => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
    setShowReturnCaseForm(true);
  };

  const saveBusinessReturn = async (caseData: Case, returnDetails?: CaseReturnDetails) => {
    if (!businessId) {
      showToast('Could not create return: no business selected.');
      return;
    }
    if (!returnDetails) {
      showToast('Choose return details first.');
      return;
    }

    const now = new Date().toISOString();
    const returnId = makeReturnId();
    const caseId = caseData.id || generateCaseId();
    const ref = makeReturnRef();
    const actor = currentUser?.name ?? caseData.createdBy ?? 'Business';
    const summary = caseData.issueSummary.trim() || 'Manual return created by business';
    const customerName = caseData.customerName.trim() || 'Customer';
    const orderNumber = caseData.orderNumber?.trim() || 'Manual return';
    const linkedCase: Case = {
      ...caseData,
      id: caseId,
      caseNumber: caseData.caseNumber || generateCaseNumber(),
      returnId,
      type: 'Return',
      customerName,
      orderNumber,
      issueSummary: summary,
      updatedAt: now,
      createdAt: caseData.createdAt || now,
      createdBy: caseData.createdBy || actor,
      updatedBy: actor,
      timeline: [
        ...(caseData.timeline ?? []),
        {
          id: makeReturnActivityId(),
          date: now,
          action: `Return ${ref} created from business`,
          user: actor,
        },
      ],
    };
    const returnItem: ReturnRequest = {
      id: returnId,
      ref,
      caseId,
      orderId: caseData.orderId || returnId,
      orderNumber,
      customerId: caseData.customerId,
      customerName,
      itemSummary: summary,
      reason: returnDetails.reason,
      otherReason: returnDetails.otherReason,
      resolution: returnDetails.resolution,
      shippingPayer: returnDetails.shippingPayer,
      status: 'initiated',
      notes: '',
      returnNotes: [],
      activity: [
        {
          id: makeReturnActivityId(),
          date: now,
          action: `Return ${ref} created from business`,
          user: actor,
        },
      ],
      customerMessage: caseData.originalCustomerMessage,
      proofImages: caseData.attachments?.map((attachment) => attachment.uri),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };

    try {
      await addReturn(returnItem, businessId);
      await addCase(linkedCase, businessId);
      setShowReturnCaseForm(false);
      showToast('Return created.');
    } catch (error) {
      console.warn('Failed to create business return:', error);
      showToast('Could not create return.');
    }
  };

  const body = (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
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
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={isDesktop ? { color: colors.text.primary, fontSize: 26, fontWeight: '700', lineHeight: 32 } : [headingStyle, { color: colors.text.primary }]}>
              Returns
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: isMobile ? 10 : 12, fontWeight: '400', marginTop: 4, lineHeight: isMobile ? 14 : 18, maxWidth: 520 }} numberOfLines={isMobile ? 2 : undefined}>
              Track return cases, customer shipping responsibility, and refund or exchange progress.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={openNewReturnForm}
              style={{
                height: isMobile ? 40 : 44,
                borderRadius: 999,
                paddingHorizontal: isMobile ? 14 : 18,
                backgroundColor: colors.text.primary,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Plus size={15} color={colors.bg.primary} strokeWidth={2.4} />
              <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '600' }}>
                {isMobile ? 'New' : 'New return'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: contentPaddingBottom,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
          width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: isDesktop ? 'flex-start' : 'stretch',
            paddingHorizontal: 20,
          }}
        >
          <View style={{ paddingTop: 16 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
              contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
            >
              {returnDateFilters.map((option) => {
                const active = dateFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setDateFilter(option.key)}
                    style={{
                      height: isMobile ? 34 : 38,
                      borderRadius: 999,
                      paddingHorizontal: isMobile ? 12 : 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? colors.accent.primary : colors.bg.card,
                      borderWidth: active ? 0 : 1,
                      borderColor: separatorColor,
                    }}
                  >
                    <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 10, fontWeight: '600' }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 12 }}>
              {stats.map((item) => (
                <View
                  key={item.key}
                  style={{
                    width: isDesktop ? '25%' : '50%',
                    paddingHorizontal: 6,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      borderRadius: 24,
                      padding: isMobile ? 14 : 18,
                      minHeight: isMobile ? 104 : 138,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {item.label}
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: isMobile ? 22 : 26, fontWeight: '700', marginTop: 8 }}>
                      {item.value}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: isMobile ? 10 : 12, fontWeight: '400', lineHeight: isMobile ? 14 : 18, marginTop: isMobile ? 4 : 6 }}>
                      {item.caption}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View
                style={{
                  height: isDesktop ? 44 : 46,
                  width: isDesktop ? '30%' : undefined,
                  maxWidth: isDesktop ? 420 : undefined,
                  minWidth: isDesktop ? 320 : undefined,
                  flex: isDesktop ? undefined : 1,
                  borderRadius: 999,
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search returns..."
                  placeholderTextColor={colors.input.placeholder}
                  style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14, outlineStyle: 'none' as any }}
                  selectionColor={colors.text.primary}
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>

              {isDesktop ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
                >
                  {returnStatusFilters.map((option) => {
                    const active = statusFilter === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setStatusFilter(option.key)}
                        style={{
                          height: 44,
                          borderRadius: 999,
                          paddingHorizontal: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: active ? colors.accent.primary : colors.bg.card,
                          borderWidth: active ? 0 : 1,
                          borderColor: separatorColor,
                        }}
                      >
                        <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <Pressable
                onPress={() => setSortBy((current) => current === 'newest' ? 'oldest' : 'newest')}
                style={{
                  width: isDesktop ? undefined : 46,
                  height: isDesktop ? 44 : 46,
                  borderRadius: 999,
                  paddingHorizontal: isDesktop ? 16 : 0,
                  backgroundColor: activeFilterCount > 0 ? colors.accent.primary : isDesktop ? colors.bg.card : colors.bg.secondary,
                  borderWidth: activeFilterCount > 0 ? 0 : isDesktop ? 1 : 0.5,
                  borderColor: separatorColor,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isDesktop ? (
                  <>
                    <ArrowDownUp size={15} color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary, fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
                      {sortBy === 'newest' ? 'Newest first' : 'Oldest first'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Filter size={18} color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                    {activeFilterCount > 0 ? (
                      <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{activeFilterCount}</Text>
                    ) : null}
                  </>
                )}
              </Pressable>
            </View>

            <View
              style={{
                backgroundColor: isDesktop ? colors.bg.card : 'transparent',
                borderWidth: isDesktop ? 1 : 0,
                borderColor: colors.border.light,
                borderRadius: isDesktop ? 16 : 0,
                overflow: isDesktop ? 'hidden' : 'visible',
              }}
            >
              {!isMobile && (
                <View style={{ minHeight: 44, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.border.light }}>
                  {['RETURN', 'REASON', 'STATUS', 'UPDATED'].map((heading, index) => (
                    <Text
                      key={heading}
                      className="text-xs font-semibold"
                      style={{
                        flex: index === 0 ? 1.5 : index === 1 ? 1.35 : 1,
                        color: colors.text.muted,
                        textAlign: index >= 2 ? (index === 2 ? 'center' : 'right') : 'left',
                      }}
                    >
                      {heading}
                    </Text>
                  ))}
                </View>
              )}

              {filteredReturns.length > 0 ? (
                filteredReturns.map(renderReturnRow)
              ) : (
                <View style={{ padding: 34, alignItems: 'center' }}>
                  <RotateCcw size={28} color={colors.text.tertiary} strokeWidth={1.8} />
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginTop: 12 }}>No returns found</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', textAlign: 'center', marginTop: 6, maxWidth: 280 }}>
                    Try another date range or status filter.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    {toastMessage ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: tabBarHeight + 16,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            borderRadius: 999,
            backgroundColor: colors.text.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '500' }}>{toastMessage}</Text>
        </View>
      </View>
    ) : null}
    <CaseForm
      visible={showReturnCaseForm}
      onClose={() => setShowReturnCaseForm(false)}
      onSave={saveBusinessReturn}
      createdBy={currentUser?.name}
      initialCaseType="Return"
      enableReturnDetails
    />
    </View>
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
