import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, Modal, Platform, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search, ChevronLeft, FileText, Plus, Filter, Check, X, AlertCircle, ImagePlus, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
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
  generateCaseId,
  generateCaseNumber,
} from '@/lib/state/fyll-store';
import { CaseListItem } from '@/components/CaseListItem';
import { CaseDetailPanel } from '@/components/CaseDetailPanel';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { CaseForm } from '@/components/CaseForm';
import useAuthStore from '@/lib/state/auth-store';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { FyllAiButton } from '@/components/FyllAiButton';
import { parseCaseDraft, type CaseDraftData } from '@/lib/ai-case-parser';
import { SearchClearButton } from '@/components/SearchClearButton';

export default function CasesScreen() {
  const CASE_AI_MAX_IMAGES = 4;
  const colors = useThemeColors();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const { isDesktop, isTablet } = useBreakpoint();
  const panelStyles = getSettingsWebPanelStyles(isFromSettingsRoute(from), colors.bg.primary, colors.border.light);
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const cases = useFyllStore((s) => s.cases);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const addCase = useFyllStore((s) => s.addCase);
  const updateCase = useFyllStore((s) => s.updateCase);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const getStatusColor = (statusName: string) =>
    caseStatuses.find((status) => status.name === statusName)?.color
    ?? CASE_STATUS_COLORS[statusName]
    ?? colors.text.muted;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CaseStatus | 'All'>('All');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
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

  // Filter cases
  const filteredCases = useMemo(() => {
    let filtered = [...cases];

    // Filter by status
    if (selectedStatus !== 'All') {
      filtered = filtered.filter((c) => c.status === selectedStatus);
    }

    // Filter by search
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

    // Sort by created date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return filtered;
  }, [cases, selectedStatus, searchQuery]);

  // Count cases by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: cases.length };
    caseStatuses.forEach((status) => {
      counts[status.name] = cases.filter((c) => c.status === status.name).length;
    });
    return counts;
  }, [cases, caseStatuses]);

  const handleCasePress = (caseId: string) => {
    Haptics.selectionAsync();
    if (isDesktop || isTablet) {
      setSelectedCaseId(caseId);
    } else {
      router.push(`/case/${caseId}`);
    }
  };

  const handleCreateCase = () => {
    Haptics.selectionAsync();
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
        setAiError('Fyll AI could not generate a draft from this message.');
        return;
      }
      setAiDraft(result);
      setAiIssueSummary(result.issueSummary);
      setAiContext(result.context);
      setAiCaseType(result.caseType);
      setAiPriority(result.priority);
      setAiSource(result.source);
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
    setShowFyllAiModal(false);
    resetCaseAiModal();
  };

  const handleSaveCase = async (caseData: Case) => {
    if (editingCase) {
      await updateCase(caseData.id, caseData, businessId);
    } else {
      await addCase(caseData, businessId);
    }
  };

  const renderStatusFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-4"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center' }}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setSelectedStatus('All');
        }}
        className="px-4 py-2 rounded-full border active:opacity-80"
        style={{
          borderColor: selectedStatus === 'All' ? colors.accent.primary : colors.border.light,
          backgroundColor: selectedStatus === 'All' ? colors.accent.primary : colors.bg.secondary,
        }}
      >
        <Text
          style={{ color: selectedStatus === 'All' ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary }}
          className="font-medium text-xs"
        >
          All ({statusCounts.All})
        </Text>
      </Pressable>
      {caseStatuses.map((status) => {
        const count = statusCounts[status.name] || 0;
        if (count === 0) return null;
        const statusColor = getStatusColor(status.name);
        const isSelected = selectedStatus === status.name;
        return (
          <Pressable
            key={status.id}
            onPress={() => {
              Haptics.selectionAsync();
              setSelectedStatus(status.name);
            }}
            className="px-4 py-2 rounded-full border active:opacity-80"
            style={{
              borderColor: isSelected ? statusColor : colors.border.light,
              backgroundColor: isSelected ? statusColor : colors.bg.secondary,
            }}
          >
            <Text
              style={{ color: isSelected ? '#fff' : statusColor }}
              className="font-medium text-xs"
            >
              {status.name} ({count})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center py-20"
    >
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: colors.bg.secondary }}
      >
        <FileText size={40} color={colors.text.muted} strokeWidth={1} />
      </View>
      <Text style={{ color: colors.text.primary }} className="text-xl font-bold mb-2">
        No Cases Found
      </Text>
      <Text style={{ color: colors.text.muted }} className="text-center px-10">
        {searchQuery || selectedStatus !== 'All'
          ? 'Try adjusting your filters or search query'
          : 'Cases will appear here when created from orders'}
      </Text>
    </View>
  );

  const renderList = () => (
    <FlatList
      data={filteredCases}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <CaseListItem
          caseItem={item}
          onPress={() => handleCasePress(item.id)}
          index={index}
          compact
        />
      )}
      ListEmptyComponent={renderEmptyState}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: 20,
        flexGrow: filteredCases.length === 0 ? 1 : undefined,
      }}
      showsVerticalScrollIndicator={false}
    />
  );

  const activeFilterCount = selectedStatus === 'All' ? 0 : 1;

  const renderWebTable = () => (
    <View
      style={{
        width: '100%',
        borderWidth: 1,
        borderColor: separatorColor,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: colors.bg.card,
      }}
    >
      <View style={{ backgroundColor: colors.bg.card, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12 }}>
          <Text style={{ color: colors.text.muted, flex: 1.6 }} className="text-xs font-semibold">
            CUSTOMER
          </Text>
          <Text style={{ color: colors.text.muted, flex: 1 }} className="text-xs font-semibold">
            CASE ID
          </Text>
          <Text style={{ color: colors.text.muted, width: 140 }} className="text-xs font-semibold">
            DATE
          </Text>
          <Text style={{ color: colors.text.muted, flex: 1, textAlign: 'right' }} className="text-xs font-semibold">
            STATUS
          </Text>
        </View>
      </View>

      {filteredCases.map((caseItem, index) => {
        const statusColor = getStatusColor(caseItem.status);
        const dateLabel = new Date(caseItem.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const isSelected = selectedCaseId === caseItem.id;

        return (
          <Pressable
            key={caseItem.id}
            onPress={() => handleCasePress(caseItem.id)}
            className="active:opacity-70"
            style={{
              backgroundColor: isSelected
                ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                : colors.bg.card,
              borderBottomWidth: index === filteredCases.length - 1 ? 0 : 1,
              borderBottomColor: separatorColor,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 }}>
              <Text style={{ color: colors.text.primary, flex: 1.6 }} className="text-sm font-semibold" numberOfLines={1}>
                {caseItem.customerName}
              </Text>
              <Text style={{ color: colors.text.secondary, flex: 1 }} className="text-sm" numberOfLines={1}>
                {caseItem.caseNumber}
              </Text>
              <Text style={{ color: colors.text.tertiary, width: 140 }} className="text-sm" numberOfLines={1}>
                {dateLabel}
              </Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <View
                  className="px-3 py-1 rounded-full"
                  style={{ backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '30' }}
                >
                  <Text style={{ color: statusColor }} className="text-xs font-semibold" numberOfLines={1}>
                    {caseItem.status}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  // Desktop/Tablet: Split view
  if (isDesktop || isTablet) {
    return (
      <View style={panelStyles.outer}>
        <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        {/* Header */}
        <View
          className="flex-row items-center justify-between px-5 py-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                goBack();
              }}
              className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-70"
              style={{ backgroundColor: colors.bg.secondary }}
            >
              <ChevronLeft size={24} color={colors.text.primary} strokeWidth={1.5} />
            </Pressable>
            <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
              All Cases
            </Text>
          </View>
        <View className="flex-row items-center gap-2">
          <FyllAiButton
            label="Fyll AI Case"
            onPress={openCaseAi}
            height={44}
            borderRadius={22}
            iconSize={16}
            textSize={14}
          />
            <Pressable
              onPress={handleCreateCase}
              className="flex-row items-center px-4 rounded-full active:opacity-80"
              style={{ backgroundColor: colors.accent.primary, height: 44 }}
            >
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="text-sm font-semibold ml-2">
                New Case
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-1 flex-row">
          {/* List Panel */}
          <View
            className="flex-1"
            style={{
              borderRightWidth: 1,
              borderRightColor: colors.border.light,
            }}
          >
            {/* Search */}
            <View className="px-6 py-4">
              <View
                className="flex-row items-center px-4 py-3 rounded-xl"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Search size={20} color={colors.text.muted} strokeWidth={1.5} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search cases..."
                  placeholderTextColor={colors.text.muted}
                  className="flex-1 ml-3"
                  style={{ color: colors.text.primary }}
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>
            </View>

            {/* Status Filters */}
            {renderStatusFilter()}

            {/* List */}
            <View className="px-6 pb-6">
              {isDesktop ? renderWebTable() : renderList()}
            </View>
          </View>

          {/* Detail Panel */}
          <View
            style={{
              width: isDesktop ? 420 : 320,
              borderLeftWidth: 1,
              borderLeftColor: colors.border.light,
              backgroundColor: colors.bg.primary,
            }}
          >
            {selectedCaseId ? (
              <CaseDetailPanel
                caseId={selectedCaseId}
                onClose={() => setSelectedCaseId(null)}
                onNavigateToOrder={(orderId) => router.push(`/order/${orderId}`)}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <FileText size={48} color={colors.text.muted} strokeWidth={1} />
                <Text style={{ color: colors.text.muted }} className="mt-4 text-lg">
                  Select a case to view details
                </Text>
                <Pressable
                  onPress={handleCreateCase}
                  className="mt-4 px-4 py-2 rounded-full active:opacity-80"
                  style={{ backgroundColor: colors.accent.primary }}
                >
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="text-sm font-semibold">
                    Create New Case
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <CaseForm
          visible={showCaseForm}
          onClose={() => setShowCaseForm(false)}
          onSave={handleSaveCase}
          existingCase={editingCase || undefined}
          createdBy={currentUser?.name}
        />
      </SafeAreaView>
        </View>
      </View>
    );
  }

  // Mobile: Full-width list
  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 py-4"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              goBack();
            }}
            className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-70"
            style={{ backgroundColor: colors.bg.secondary }}
          >
            <ChevronLeft size={24} color={colors.text.primary} strokeWidth={1.5} />
          </Pressable>
          <Text style={{ color: colors.text.primary }} className="text-xl font-bold">
            All Cases
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <FyllAiButton
            label="Fyll AI Case"
            onPress={openCaseAi}
            height={44}
            borderRadius={22}
            iconSize={16}
            textSize={14}
          />
          <Pressable
            onPress={handleCreateCase}
            className="flex-row items-center px-4 rounded-full active:opacity-80"
            style={{ backgroundColor: colors.accent.primary, height: 44 }}
          >
            <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />
            <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="text-sm font-semibold ml-2">
              New Case
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Search + Filter (Mobile) */}
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View
            className="flex-1 flex-row items-center rounded-full px-4"
            style={{
              height: 52,
              backgroundColor: colors.input.bg,
              borderWidth: 1,
              borderColor: colors.input.border,
            }}
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFilterMenu(true);
            }}
            className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
            style={{
              height: 52,
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
      {renderList()}

      <CaseForm
        visible={showCaseForm}
        onClose={() => setShowCaseForm(false)}
        onSave={handleSaveCase}
        existingCase={editingCase || undefined}
        createdBy={currentUser?.name}
      />

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

                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedStatus('All');
                  }}
                  className="flex-row items-center py-3 active:opacity-70"
                >
                  <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: colors.text.muted }} />
                  <View className="flex-1 flex-row items-center">
                    <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                      All
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm ml-1.5">
                      {statusCounts.All ?? 0}
                    </Text>
                  </View>
                  {selectedStatus === 'All' && (
                    <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                      <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                    </View>
                  )}
                </Pressable>

                {caseStatuses.map((status) => {
                  const count = statusCounts[status.name] ?? 0;
                  const isSelected = selectedStatus === status.name;
                  return (
                    <Pressable
                      key={status.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedStatus(status.name);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: getStatusColor(status.name) }} />
                      <View className="flex-1 flex-row items-center">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                          {status.name}
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                <Text style={{ color: isDark ? '#DDD6FE' : '#6D28D9', flex: 1, marginLeft: 8, lineHeight: 18 }} className="text-xs font-medium">
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
                  <View className="rounded-xl px-3 py-3" style={{ minHeight: 160, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border }}>
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
                  <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C' }} className="text-xs font-medium">{aiError}</Text>
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
                  <Text style={{ color: colors.text.tertiary }} className="text-xs ml-2">Fyll AI is summarizing this case...</Text>
                </View>
              ) : null}

              {(aiDraft || aiIssueSummary || aiContext) ? (
                <View className="mt-4 rounded-xl p-4" style={{ borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">Draft Review</Text>
                    {aiDraft ? (
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                        <Text style={{ color: '#16A34A' }} className="text-[10px] font-semibold">{aiDraft.confidence.toUpperCase()} CONFIDENCE</Text>
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
                      {CASE_TYPES.map((value) => {
                        const active = aiCaseType === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => setAiCaseType(value)}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: active ? colors.accent.primary : colors.bg.card, borderWidth: 1, borderColor: active ? colors.accent.primary : colors.border.light }}
                          >
                            <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary }} className="text-xs font-semibold">{value}</Text>
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
    </SafeAreaView>
      </View>
    </View>
  );
}
