import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Modal, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText, Plus, ChevronLeft, Filter, Check, X, AlertCircle, ImagePlus, Trash2, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { useThemeColors } from '@/lib/theme';
import useFyllStore, {
  Case,
  CaseStatus,
  CaseType,
  CasePriority,
  CaseSource,
  CASE_TYPES,
  CASE_PRIORITIES,
  CASE_SOURCES,
  CASE_STATUS_COLORS,
  CASE_PRIORITY_COLORS,
  generateCaseId,
  generateCaseNumber,
} from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { CaseForm } from '@/components/CaseForm';
import useAuthStore from '@/lib/state/auth-store';
import { collaborationData } from '@/lib/supabase/collaboration';
import { FyllAiButton } from '@/components/FyllAiButton';
import { parseCaseDraft, type CaseDraftData } from '@/lib/ai-case-parser';
import { SearchClearButton } from '@/components/SearchClearButton';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

const getCaseDayKey = (caseItem: Case) => {
  const date = new Date(caseItem.createdAt);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getCaseDayLabel = (caseItem: Case) => {
  const date = new Date(caseItem.createdAt);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return `Yesterday · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
};

const withMutedAlpha = (hex: string, alpha = 0.12) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 'rgba(107,114,128,0.12)';
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};

export default function CasesScreen() {
  const CASE_AI_MAX_IMAGES = 4;
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_700Bold });
  const colors = useThemeColors();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const isDark = colors.bg.primary === '#111111';
  const openedFromSettings = Array.isArray(from) ? from[0] === 'settings' : from === 'settings';
  const settingsHeaderTopPadding = openedFromSettings ? 28 : 24;
  const separatorColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const cases = useFyllStore((s) => s.cases);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const addCase = useFyllStore((s) => s.addCase);
  const updateCase = useFyllStore((s) => s.updateCase);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CaseStatus | 'All'>('All');
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFyllAiModal, setShowFyllAiModal] = useState(false);
  const [aiCustomerName, setAiCustomerName] = useState('');
  const [aiOrderNumber, setAiOrderNumber] = useState('');
  const [aiMessageText, setAiMessageText] = useState('');
  const [aiIsParsing, setAiIsParsing] = useState(false);
  const [aiDraft, setAiDraft] = useState<CaseDraftData | null>(null);
  const [aiIssueSummary, setAiIssueSummary] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [aiCaseType, setAiCaseType] = useState<CaseType>('Other');
  const [aiPriority, setAiPriority] = useState<CasePriority>('Medium');
  const [aiSource, setAiSource] = useState<CaseSource>('Email');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiImageDataUrls, setAiImageDataUrls] = useState<string[]>([]);

  // Unread notification badges (clear after viewing thread)
  const threadCountsQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'case'],
    enabled: Boolean(businessId),
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId!, 'case'),
    refetchInterval: 15000,
  });
  const threadCounts = threadCountsQuery.data ?? {};

  const getStatusColor = (statusName: string) =>
    caseStatuses.find((status) => status.name === statusName)?.color
    ?? CASE_STATUS_COLORS[statusName]
    ?? colors.text.muted;

  // Filter cases
  const filteredCases = useMemo(() => {
    let filtered = [...cases];

    if (selectedStatus !== 'All') {
      filtered = filtered.filter((c) => c.status === selectedStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.caseNumber?.toLowerCase().includes(query) ||
          c.customerName?.toLowerCase().includes(query) ||
          (c.orderNumber ?? '').toLowerCase().includes(query) ||
          c.issueSummary?.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filtered;
  }, [cases, selectedStatus, searchQuery]);

  // Count open cases
  const openCasesCount = useMemo(() => {
    return cases.filter((c) => c.status !== 'Closed' && c.status !== 'Resolved').length;
  }, [cases]);

  const caseSummary = useMemo(() => {
    const now = new Date();
    return {
      total: cases.length,
      open: openCasesCount,
      highPriority: cases.filter((caseItem) => (caseItem.priority === 'High' || caseItem.priority === 'Critical') && caseItem.status !== 'Closed' && caseItem.status !== 'Resolved').length,
      resolvedThisMonth: cases.filter((caseItem) => {
        if (caseItem.status !== 'Resolved' && caseItem.status !== 'Closed') return false;
        const date = new Date(caseItem.updatedAt ?? caseItem.createdAt);
        return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [cases, openCasesCount]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: cases.length };
    caseStatuses.forEach((status) => {
      counts[status.name] = cases.filter((caseItem) => caseItem.status === status.name).length;
    });
    return counts;
  }, [cases, caseStatuses]);

  const handleCasePress = (caseId: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    router.push(`/cases/${caseId}`);
  };

  const handleCreateCase = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setEditingCase(null);
    setShowCaseForm(true);
  };

  const openCaseAi = () => {
    if (Platform.OS === 'web') {
      setShowFyllAiModal(true);
      return;
    }
    Haptics.selectionAsync();
    router.push('/ai-case');
  };

  const resetCaseAiModal = () => {
    setAiCustomerName('');
    setAiOrderNumber('');
    setAiMessageText('');
    setAiIsParsing(false);
    setAiDraft(null);
    setAiIssueSummary('');
    setAiContext('');
    setAiCaseType('Other');
    setAiPriority('Medium');
    setAiSource('Email');
    setAiError(null);
    setAiImageDataUrls([]);
  };

  const handlePickCaseAiImage = async () => {
    setAiError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setAiError('Please allow photo access to attach screenshots.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: CASE_AI_MAX_IMAGES,
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      const incomingImages = result.assets
        .map((asset) => {
          if (!asset.base64) return null;
          const mimeType = asset.mimeType || 'image/jpeg';
          return `data:${mimeType};base64,${asset.base64}`;
        })
        .filter((item): item is string => Boolean(item));

      if (incomingImages.length === 0) {
        setAiError('Could not read the selected screenshot. Try another image.');
        return;
      }

      setAiImageDataUrls((previous) => {
        const merged = [...previous, ...incomingImages];
        return Array.from(new Set(merged)).slice(0, CASE_AI_MAX_IMAGES);
      });
    } catch (error: any) {
      setAiError(error?.message || 'Could not attach screenshot right now.');
    }
  };

  const handleGenerateCaseDraftWithAi = async () => {
    if (!aiMessageText.trim() && aiImageDataUrls.length === 0) {
      setAiError('Add a customer message or screenshot before generating a draft.');
      return;
    }

    setAiIsParsing(true);
    setAiError(null);
    setAiDraft(null);

    try {
      const result = await parseCaseDraft({
        messageText: aiMessageText.trim() || undefined,
        imageDataUrls: aiImageDataUrls,
      });
      if (!result) {
        setAiError('Fyll AI could not generate a case draft from this message.');
        return;
      }

      setAiDraft(result);
      setAiIssueSummary(result.issueSummary);
      setAiContext(result.context);
      setAiCaseType(result.caseType);
      setAiPriority(result.priority);
      setAiSource(result.source);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      setAiError(error?.message || 'Fyll AI failed. Please try again.');
    } finally {
      setAiIsParsing(false);
    }
  };

  const handleCreateCaseFromAi = async () => {
    if (!aiCustomerName.trim()) {
      setAiError('Customer name is required before creating a case.');
      return;
    }
    if (!aiIssueSummary.trim()) {
      setAiError('Generate a draft first or type a heading.');
      return;
    }

    const now = new Date().toISOString();
    const status = caseStatuses[0]?.name ?? 'Open';
    const createdBy = currentUser?.name;

    const newCase: Case = {
      id: generateCaseId(),
      caseNumber: generateCaseNumber(),
      customerName: aiCustomerName.trim(),
      orderNumber: aiOrderNumber.trim() || undefined,
      type: aiCaseType,
      status,
      priority: aiPriority,
      source: aiSource,
      issueSummary: aiIssueSummary.trim(),
      originalCustomerMessage: aiContext.trim() || aiMessageText.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy,
      updatedBy: createdBy,
    };

    await addCase(newCase, businessId);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setShowFyllAiModal(false);
    resetCaseAiModal();
  };

  const handleBackToSettings = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    router.push('/settings');
  };

  const handleSaveCase = async (caseData: Case) => {
    if (editingCase) {
      await updateCase(caseData.id, caseData, businessId);
    } else {
      await addCase(caseData, businessId);
    }
  };

  // Status filter pills
  const statusFilters = ['All', ...caseStatuses.map((s) => s.name)];
  const activeFilterCount = selectedStatus === 'All' ? 0 : 1;

  const masterContent = (
    <>
      {isDesktop ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 0,
            paddingTop: isWebDesktop ? 0 : settingsHeaderTopPadding,
            paddingBottom: 40,
            width: '100%',
            alignSelf: 'stretch',
          }}
          showsVerticalScrollIndicator={false}
        >
            <View
              style={{
                width: '100%',
              }}
            >
              <View style={{
                width: '100%',
                maxWidth: 1456,
                alignSelf: 'flex-start',
                minHeight: desktopHeaderMinHeight,
                paddingLeft: 28,
                paddingRight: 28,
                paddingTop: 28,
                paddingBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}>
                {openedFromSettings ? (
                  <Pressable
                    onPress={handleBackToSettings}
                    className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                ) : null}

                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>
                      Cases
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 4 }}>
                      {openCasesCount} open case{openCasesCount !== 1 ? 's' : ''} requiring attention.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pressable
                      onPress={openCaseAi}
                      accessibilityRole="button"
                      accessibilityLabel="Open Fyll AI case assistant"
                      style={({ pressed }) => ({
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(17,17,17,0.14)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.72 : 1,
                      })}
                    >
                      <Sparkles size={16} color={isDark ? '#F2F2EE' : '#686862'} strokeWidth={2.3} />
                    </Pressable>
                    <Pressable
                      onPress={handleCreateCase}
                      accessibilityRole="button"
                      accessibilityLabel="Create new case"
                      className="flex-row items-center justify-center rounded-full active:opacity-80"
                      style={{ backgroundColor: FYLL_LIME, height: 40, paddingHorizontal: 15 }}
                    >
                      <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.6} />
                      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>New case</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ width: '100%', maxWidth: 1456, alignSelf: 'flex-start', paddingLeft: 28, paddingRight: 28, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, overflow: 'hidden', marginBottom: 18 }}>
              {[
                ['Open cases', `${caseSummary.open} cases`, 'Requiring attention', 1.3, null],
                ['High priority', String(caseSummary.highPriority), 'Open urgent cases', 1, '#DC2626'],
                ['Resolved', String(caseSummary.resolvedThisMonth), 'This month', 1, '#16A34A'],
                ['Total cases', String(caseSummary.total), 'All recorded cases', 1, colors.text.muted],
              ].map(([label, value, caption, flex, dot], index) => (
                <View key={String(label)} style={{ flex: Number(flex), paddingHorizontal: 22, paddingVertical: 18, gap: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: separatorColor }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} /> : null}
                    <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: index ? 22 : 28, fontWeight: index ? '600' : bricolageLoaded ? '400' : '700', fontFamily: !index && bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: index ? -0.5 : -0.9 }}>{value}</Text>
                  <Text style={{ color: colors.text.muted, fontSize: 13 }}>{caption}</Text>
                </View>
              ))}
            </View>
            {/* Search + Tabs (Web) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                className="flex-row items-center rounded-full px-4"
                style={{
                  height: 44,
                  width: '30%',
                  maxWidth: 420,
                  minWidth: 320,
                  backgroundColor: colors.input.bg,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search cases..."
                  placeholderTextColor={colors.input.placeholder}
                  style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
              >
                {statusFilters.map((status) => {
                  const isSelected = selectedStatus === status;
                  return (
                    <Pressable
                      key={status}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setSelectedStatus(status as CaseStatus | 'All');
                      }}
                      className="rounded-full active:opacity-70"
                      style={{
                        height: 36,
                        paddingHorizontal: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? colors.accent.primary : colors.bg.card,
                        borderWidth: isSelected ? 0 : 1,
                        borderColor: separatorColor,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
                        }}
                      >
                        {status}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Table */}
            <View
              style={{
                marginTop: 16,
                borderWidth: 1,
                borderColor: separatorColor,
                borderRadius: 18,
                overflow: 'hidden',
                backgroundColor: colors.bg.card,
              }}
            >
              <View style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 14, gap: 16 }}>
                  <Text style={{ color: colors.text.muted, width: 150, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>CASE</Text>
                  <Text style={{ color: colors.text.muted, flex: 1.2, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>CUSTOMER</Text>
                  <Text style={{ color: colors.text.muted, flex: 1.6, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>ISSUE</Text>
                  <Text style={{ color: colors.text.muted, width: 100, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>PRIORITY</Text>
                  <Text style={{ color: colors.text.muted, width: 150, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>STATUS</Text>
                  <View style={{ width: 18 }} />
                </View>
              </View>

              {filteredCases.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <View style={{ width: 80, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: colors.border.light }}>
                    <FileText size={36} color={colors.text.muted} strokeWidth={1.5} />
                  </View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 16, marginBottom: 4 }}>No cases found</Text>
                  <Text style={{ color: colors.text.muted, fontSize: 14, marginBottom: 16 }}>Create your first case to get started</Text>
                  <Pressable onPress={handleCreateCase} style={{ backgroundColor: colors.accent.primary, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>Create First Case</Text>
                  </Pressable>
                </View>
              ) : (
                filteredCases.map((caseItem, index) => {
                  const statusHex = getStatusColor(caseItem.status);
                  const priorityHex = CASE_PRIORITY_COLORS[caseItem.priority ?? 'Low'] || '#6B7280';
                  const previousCase = index > 0 ? filteredCases[index - 1] : null;
                  const isFirstInGroup = !previousCase || getCaseDayKey(previousCase) !== getCaseDayKey(caseItem);
                  return (
                    <React.Fragment key={caseItem.id}>
                    {isFirstInGroup ? (
                      <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, backgroundColor: isDark ? '#101010' : '#E9E9E6', borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{getCaseDayLabel(caseItem)}</Text>
                      </View>
                    ) : null}
                    <Pressable
                      onPress={() => handleCasePress(caseItem.id)}
                      style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg.secondary : colors.bg.card, borderTopWidth: isFirstInGroup ? 0 : 1, borderTopColor: separatorColor })}
                    >
                      <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 9, gap: 16 }}>
                        <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{caseItem.caseNumber}</Text>
                          {(threadCounts[caseItem.id] ?? 0) > 0 && (
                            <View style={{ backgroundColor: '#DC2626', minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{threadCounts[caseItem.id]}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: colors.text.primary, flex: 1.2, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{caseItem.customerName}</Text>
                        <View style={{ flex: 1.6 }}>
                          <Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{caseItem.issueSummary || 'No title'}</Text>
                          <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{caseItem.type}</Text>
                        </View>
                        <View style={{ width: 100 }}>
                          <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withMutedAlpha(priorityHex) }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: priorityHex }} />
                            <Text style={{ color: priorityHex, fontSize: 12, fontWeight: '500' }}>{caseItem.priority ?? 'Low'}</Text>
                          </View>
                        </View>
                        <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusHex }} />
                            <Text style={{ color: statusHex, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{caseItem.status}</Text>
                        </View>
                        <Text style={{ color: colors.text.muted, width: 18, fontSize: 18 }}>›</Text>
                      </View>
                    </Pressable>
                    </React.Fragment>
                  );
                })
              )}
            </View>
            </View>
          </ScrollView>
      ) : (
        // Mobile
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View className="px-5 pb-2" style={{ paddingTop: openedFromSettings ? 24 : 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              {openedFromSettings ? (
                <Pressable
                  onPress={handleBackToSettings}
                  className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              ) : null}

              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>
                    Cases
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm mt-1">
                    {openCasesCount} open case{openCasesCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable onPress={openCaseAi} accessibilityRole="button" accessibilityLabel="Fyll AI Case" style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 999, backgroundColor: 'transparent', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(17,17,17,0.14)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}>
                    <Sparkles size={15} color={isDark ? '#F2F2EE' : '#686862'} strokeWidth={2.2} />
                  </Pressable>
                  <Pressable
                    onPress={handleCreateCase}
                    accessibilityRole="button"
                    accessibilityLabel="Create new case"
                    className="flex-row items-center justify-center rounded-full active:opacity-80"
                    style={{ backgroundColor: FYLL_LIME, height: 40, paddingHorizontal: 14 }}
                  >
                    <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.5} />
                    <Text style={{ color: FYLL_LIME_INK, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>New case</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, padding: 18, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Open cases</Text>
              <Text style={{ color: colors.text.primary, fontSize: 32, lineHeight: 36, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -1 }}>{caseSummary.open} cases</Text>
              <Text style={{ color: colors.text.muted, fontSize: 13 }}>Currently requiring attention</Text>
            </View>
            <View style={{ height: 1, backgroundColor: separatorColor }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                ['High priority', caseSummary.highPriority, '#DC2626'],
                ['Resolved', caseSummary.resolvedThisMonth, '#16A34A'],
                ['Total', caseSummary.total, colors.text.muted],
              ].map(([label, value, dot]) => (
                <View key={String(label)} style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} />
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{label}</Text>
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '600' }}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Search + Filter */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                className="flex-1 flex-row items-center rounded-full px-4"
                style={{ height: 48, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Search size={18} color={colors.text.muted} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search cases..."
                  placeholderTextColor={colors.input.placeholder}
                  className="flex-1 ml-3"
                  style={{ color: colors.input.text }}
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowFilterMenu(true);
                }}
                className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
                style={{
                  height: 48,
                  backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.secondary,
                  borderWidth: activeFilterCount > 0 ? 0 : 0.5,
                  borderColor: separatorColor,
                }}
              >
                <Filter size={18} color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary} strokeWidth={2} />
                {activeFilterCount > 0 && (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
                    {activeFilterCount}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* List */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 }}>
            {filteredCases.length === 0 ? (
              <View className="items-center justify-center py-20">
                <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
                  <FileText size={36} color={colors.text.muted} strokeWidth={1.5} />
                </View>
                <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No cases found</Text>
                <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Create your first case to get started</Text>
                <Pressable onPress={handleCreateCase} className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center" style={{ backgroundColor: colors.accent.primary }}>
                  <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Create First Case</Text>
                </Pressable>
              </View>
            ) : (
              filteredCases.map((caseItem, index) => {
                const statusHexMobile = getStatusColor(caseItem.status);
                const priorityHexMobile = CASE_PRIORITY_COLORS[caseItem.priority ?? 'Low'] || '#6B7280';
                const previousCase = index > 0 ? filteredCases[index - 1] : null;
                const nextCase = index < filteredCases.length - 1 ? filteredCases[index + 1] : null;
                const isFirstInGroup = !previousCase || getCaseDayKey(previousCase) !== getCaseDayKey(caseItem);
                const isLastInGroup = !nextCase || getCaseDayKey(nextCase) !== getCaseDayKey(caseItem);
                return (
                  <View key={caseItem.id} style={{ marginTop: isFirstInGroup && index > 0 ? 18 : 0 }}>
                    {isFirstInGroup ? (
                      <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 8 }}>
                        {getCaseDayLabel(caseItem)}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => handleCasePress(caseItem.id)}
                      style={({ pressed }) => ({
                        minHeight: 96,
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderLeftWidth: 1,
                        borderRightWidth: 1,
                        borderTopWidth: isFirstInGroup ? 1 : 0,
                        borderBottomWidth: 1,
                        borderColor: separatorColor,
                        borderTopLeftRadius: isFirstInGroup ? 18 : 0,
                        borderTopRightRadius: isFirstInGroup ? 18 : 0,
                        borderBottomLeftRadius: isLastInGroup ? 18 : 0,
                        borderBottomRightRadius: isLastInGroup ? 18 : 0,
                        backgroundColor: pressed ? colors.bg.secondary : colors.bg.card,
                      })}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '600' }}>{getInitials(caseItem.customerName)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{caseItem.customerName}</Text>
                        <Text style={{ color: colors.text.secondary, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{caseItem.issueSummary || 'No title'}</Text>
                        <Text style={{ color: colors.text.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{caseItem.caseNumber} · {caseItem.type}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusHexMobile }} />
                            <Text style={{ color: statusHexMobile, fontSize: 10, fontWeight: '600' }}>{caseItem.status}</Text>
                          </View>
                          <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: withMutedAlpha(priorityHexMobile) }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: priorityHexMobile }} />
                            <Text style={{ color: priorityHexMobile, fontSize: 10, fontWeight: '500' }}>{caseItem.priority ?? 'Low'}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: 'center', gap: 8 }}>
                        {(threadCounts[caseItem.id] ?? 0) > 0 ? (
                          <View style={{ backgroundColor: '#DC2626', minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{threadCounts[caseItem.id]}</Text>
                          </View>
                        ) : null}
                        <Text style={{ color: colors.text.muted, fontSize: 20 }}>›</Text>
                      </View>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>

        </ScrollView>
      )}

      <CaseForm
        visible={showCaseForm}
        onClose={() => setShowCaseForm(false)}
        onSave={handleSaveCase}
        existingCase={editingCase || undefined}
        createdBy={currentUser?.name}
      />

      {isMobile && (
        <Modal
          visible={showFilterMenu}
          animationType="fade"
          transparent
          onRequestClose={() => setShowFilterMenu(false)}
        >
          <Pressable
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onPress={() => setShowFilterMenu(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="rounded-t-3xl"
              style={{ backgroundColor: colors.bg.primary, maxHeight: '70%' }}
            >
              <View className="items-center py-3">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
              </View>

              <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter Cases</Text>
                <Pressable
                  onPress={() => setShowFilterMenu(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="px-5 pt-4 pb-2">
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">
                    Status
                  </Text>

                  {statusFilters.map((status) => {
                    const isSelected = selectedStatus === status;
                    const count = statusCounts[status] ?? 0;
                    return (
                      <Pressable
                        key={status}
                        onPress={() => {
                          if (Platform.OS !== 'web') {
                            Haptics.selectionAsync();
                          }
                          setSelectedStatus(status as CaseStatus | 'All');
                        }}
                        className="flex-row items-center py-3 active:opacity-70"
                      >
                        {status === 'All' ? (
                          <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: colors.text.muted }} />
                        ) : (
                          <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: getStatusColor(status) }} />
                        )}
                        <View className="flex-1 flex-row items-center">
                          <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                            {status}
                          </Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-sm ml-1.5">
                            {count}
                          </Text>
                        </View>
                        {isSelected && (
                          <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                            <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <View className="px-5 py-4">
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }
                      setShowFilterMenu(false);
                    }}
                    className="rounded-full items-center justify-center active:opacity-80"
                    style={{ height: 50, backgroundColor: colors.accent.primary }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold">
                      Apply
                    </Text>
                  </Pressable>
                </View>

                <View className="h-8" />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Modal
        visible={showFyllAiModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowFyllAiModal(false);
          resetCaseAiModal();
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => {
            setShowFyllAiModal(false);
            resetCaseAiModal();
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '92%',
              maxWidth: 760,
              maxHeight: '88%',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              padding: 18,
            }}
          >
            <View className="flex-row items-start justify-between">
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
                  Fyll AI
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                  Draft and save a case without leaving this page.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowFyllAiModal(false);
                  resetCaseAiModal();
                }}
                className="rounded-full items-center justify-center"
                style={{ backgroundColor: colors.bg.secondary, width: 40, height: 40 }}
              >
                <X size={20} color={colors.text.tertiary} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView className="mt-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View
                className="rounded-xl p-3.5 flex-row"
                style={{ backgroundColor: isDark ? '#2E1065' : '#F3E8FF' }}
              >
                <AlertCircle size={18} color="#7C3AED" strokeWidth={2} style={{ marginTop: 1 }} />
                <Text
                  style={{ color: isDark ? '#DDD6FE' : '#6D28D9', flex: 1, marginLeft: 8, lineHeight: 18 }}
                  className="text-xs font-medium"
                >
                  Paste the customer complaint and let Fyll AI generate heading, context, type, priority, and source.
                </Text>
              </View>

              <View className="mt-4" style={{ gap: 10 }}>
                <View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mb-2">Customer Name *</Text>
                  <View className="rounded-xl px-3 py-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
                    <TextInput
                      value={aiCustomerName}
                      onChangeText={setAiCustomerName}
                      placeholder="Enter customer name"
                      placeholderTextColor={colors.input.placeholder}
                      style={{ color: colors.input.text, fontSize: 14 }}
                    />
                  </View>
                </View>

                <View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mb-2">Order Number (optional)</Text>
                  <View className="rounded-xl px-3 py-3" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
                    <TextInput
                      value={aiOrderNumber}
                      onChangeText={setAiOrderNumber}
                      placeholder="ORD-001"
                      placeholderTextColor={colors.input.placeholder}
                      style={{ color: colors.input.text, fontSize: 14 }}
                    />
                  </View>
                </View>

                <View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mb-2">Customer Message</Text>
                  <View
                    className="rounded-xl px-3 py-3"
                    style={{ minHeight: 160, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}
                  >
                    <TextInput
                      value={aiMessageText}
                      onChangeText={setAiMessageText}
                      placeholder="Paste the customer issue here..."
                      placeholderTextColor={colors.input.placeholder}
                      multiline
                      textAlignVertical="top"
                      style={{ color: colors.input.text, fontSize: 14, minHeight: 132 }}
                    />
                  </View>
                </View>

                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                      Screenshots (optional)
                    </Text>
                    {aiImageDataUrls.length > 0 ? (
                      <Pressable
                        onPress={() => setAiImageDataUrls([])}
                        className="flex-row items-center active:opacity-70"
                      >
                        <Trash2 size={13} color={colors.text.tertiary} strokeWidth={2.2} />
                        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold ml-1">
                          Clear
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={handlePickCaseAiImage}
                    className="rounded-2xl items-center justify-center active:opacity-75"
                    style={{
                      minHeight: 118,
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      borderStyle: 'dashed',
                    }}
                  >
                    <ImagePlus size={24} color={colors.text.tertiary} strokeWidth={2.1} />
                    <Text style={{ color: colors.text.secondary }} className="text-[17px] font-medium mt-2">
                      Upload screenshot
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-[11px] font-semibold mt-1">
                      {aiImageDataUrls.length}/{CASE_AI_MAX_IMAGES}
                    </Text>
                  </Pressable>

                  {aiImageDataUrls.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
                      {aiImageDataUrls.map((imageDataUrl, index) => (
                        <View
                          key={`${index}-${imageDataUrl.slice(0, 18)}`}
                          style={{ width: 68, height: 68, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <Image source={{ uri: imageDataUrl }} style={{ width: '100%', height: '100%' }} />
                          <Pressable
                            onPress={() => {
                              setAiImageDataUrls((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
                            }}
                            className="absolute right-1 top-1 w-5 h-5 rounded-full items-center justify-center"
                            style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
                          >
                            <X size={12} color="#FFFFFF" strokeWidth={2.5} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </View>

              {aiError ? (
                <View className="mt-3 rounded-xl px-3 py-2.5" style={{ borderWidth: 1, borderColor: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEE2E2' }}>
                  <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C' }} className="text-xs font-medium">
                    {aiError}
                  </Text>
                </View>
              ) : null}

              <View className="mt-4">
                <FyllAiButton
                  label={aiIsParsing ? 'Generating Draft...' : 'Generate Case Draft'}
                  onPress={handleGenerateCaseDraftWithAi}
                  disabled={aiIsParsing || (!aiMessageText.trim() && aiImageDataUrls.length === 0)}
                  height={48}
                  borderRadius={999}
                  textSize={14}
                />
              </View>

              {aiIsParsing ? (
                <View className="mt-3 flex-row items-center">
                  <ActivityIndicator size="small" color={colors.text.tertiary} />
                  <Text style={{ color: colors.text.tertiary }} className="text-xs ml-2">
                    Fyll AI is summarizing this case...
                  </Text>
                </View>
              ) : null}

              {(aiDraft || aiIssueSummary || aiContext) ? (
                <View className="mt-4 rounded-xl p-4" style={{ borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">Draft Review</Text>
                    {aiDraft ? (
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                        <Text style={{ color: '#16A34A' }} className="text-[10px] font-semibold">
                          {aiDraft.confidence.toUpperCase()} CONFIDENCE
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="mt-3">
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mb-1.5">Heading</Text>
                    <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
                      <TextInput
                        value={aiIssueSummary}
                        onChangeText={setAiIssueSummary}
                        placeholder="Case heading"
                        placeholderTextColor={colors.input.placeholder}
                        style={{ color: colors.input.text, fontSize: 13 }}
                      />
                    </View>
                  </View>

                  <View className="mt-3">
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mb-1.5">Context</Text>
                    <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
                      <TextInput
                        value={aiContext}
                        onChangeText={setAiContext}
                        placeholder="Case context"
                        placeholderTextColor={colors.input.placeholder}
                        multiline
                        textAlignVertical="top"
                        style={{ color: colors.input.text, fontSize: 13, minHeight: 90 }}
                      />
                    </View>
                  </View>

                  <View className="mt-3">
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mb-2">Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {CASE_TYPES.map((type) => {
                        const active = aiCaseType === type;
                        return (
                          <Pressable
                            key={type}
                            onPress={() => setAiCaseType(type)}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: active ? colors.accent.primary : colors.bg.card, borderWidth: 1, borderColor: active ? colors.accent.primary : colors.border.light }}
                          >
                            <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary }} className="text-xs font-semibold">{type}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View className="mt-3">
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mb-2">Priority</Text>
                    <View className="flex-row" style={{ gap: 8 }}>
                      {CASE_PRIORITIES.map((value) => {
                        const active = aiPriority === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => setAiPriority(value)}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: active ? colors.accent.primary : colors.bg.card, borderWidth: 1, borderColor: active ? colors.accent.primary : colors.border.light }}
                          >
                            <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary }} className="text-xs font-semibold">{value}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="mt-3">
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold mb-2">Source</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {CASE_SOURCES.map((value) => {
                        const active = aiSource === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => setAiSource(value)}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: active ? colors.accent.primary : colors.bg.card, borderWidth: 1, borderColor: active ? colors.accent.primary : colors.border.light }}
                          >
                            <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary }} className="text-xs font-semibold">{value}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View className="mt-4" style={{ gap: 8 }}>
                    <FyllAiButton
                      label="Create Case"
                      onPress={handleCreateCaseFromAi}
                      height={44}
                      borderRadius={999}
                      textSize={14}
                    />
                    <Pressable
                      onPress={resetCaseAiModal}
                      className="rounded-full items-center justify-center"
                      style={{ height: 40, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">Reset</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View className="h-3" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        <Stack.Screen options={{ headerShown: false, title: '' }} />
        {masterContent}
        {isMobile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open new case"
            onPress={handleCreateCase}
            style={(state) => [
              {
                position: 'absolute',
                right: 20,
                bottom: Math.max(96, tabBarHeight - 48),
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                transform: [{ scale: state.pressed ? 0.94 : 1 }],
                zIndex: 40,
              },
              Platform.OS === 'web'
                ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
                : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
            ]}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
