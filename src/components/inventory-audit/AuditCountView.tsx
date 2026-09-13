import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SectionList,
  Modal,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, ClipboardCheck, EyeOff, Filter, Pause, Pencil, Search, X } from 'lucide-react-native';
import type { ThemeColors } from '@/lib/theme';
import type { AuditStatusFilter, CategoryAuditSection, ProductAuditGroup } from './types';
import { parseCount } from './utils';
import { ProgressRing } from './ProgressRing';
import { SearchClearButton } from '@/components/SearchClearButton';

interface AuditCountViewProps {
  isDark: boolean;
  colors: ThemeColors;
  primaryActionBg: string;
  primaryActionText: string;
  sections: CategoryAuditSection[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: AuditStatusFilter;
  onStatusFilterChange: (value: AuditStatusFilter) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: string[];
  totalItems: number;
  countedItems: number;
  discrepancyCount: number;
  catalogSkuCount: number;
  auditScope: 'products' | 'warehouse';
  lastCompletedLabel: string | null;
  auditStartedAt: string | null;
  performedBy: string;
  allSections: CategoryAuditSection[];
  liveBreakdown: { short: number; over: number; matched: number; pending: number };
  onBackToHome: () => void;
  onRestartAudit: () => void;
  onUpdateCount: (variantId: string, count: string) => void;
  onSetCategoryExpected: (categoryName: string, shouldMatchExpected: boolean) => void;
  onSaveDraft: () => Promise<void> | void;
  onPause: () => Promise<void> | void;
  onSubmit: () => void;
}

const statusFilterOptions: { value: AuditStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'uncounted', label: 'Uncounted' },
  { value: 'discrepancies', label: 'Discrepancies' },
];

const completionPercent = (countedItems: number, totalItems: number): number => {
  if (totalItems === 0) return 0;
  return Math.min(100, Math.round((countedItems / totalItems) * 100));
};

export function AuditCountView({
  isDark,
  colors,
  primaryActionBg,
  primaryActionText,
  sections,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  totalItems,
  countedItems,
  discrepancyCount,
  catalogSkuCount,
  auditScope,
  lastCompletedLabel,
  auditStartedAt,
  performedBy,
  allSections,
  liveBreakdown,
  onBackToHome,
  onRestartAudit,
  onUpdateCount,
  onSetCategoryExpected,
  onSaveDraft,
  onPause,
  onSubmit,
}: AuditCountViewProps) {
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);
  const [blindCountEnabled, setBlindCountEnabled] = React.useState(true);
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(new Set());
  const autoCollapsedSections = React.useRef<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isLargeLayout = Platform.OS === 'web' || width >= 768;
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const contentMaxWidth = isLargeLayout ? 980 : undefined;
  const horizontalPadding = isLargeLayout ? 16 : 20;

  const pageBg = isDark ? '#0C0C0D' : '#FFFFFF';
  const canvasBg = !isDark && isDesktopWeb ? '#F3F3F5' : pageBg;
  const mainBg = !isDark && isDesktopWeb ? '#FFFFFF' : pageBg;
  const onPrimaryBg = isDark ? '#0C0C0D' : '#FFFFFF';
  const surfaceBg = isDark ? '#111113' : '#FFFFFF';
  const cardBg = isDark ? '#1A1A1E' : colors.bg.card;
  const cardBorder = isDark ? '#3A3A40' : colors.border.light;
  const panelBorder = !isDark && isDesktopWeb ? '#E6E6E6' : cardBorder;
  const insetBg = isDark ? '#151518' : colors.bg.secondary;
  const searchBorder = colors.border.light;
  const searchBg = colors.input.bg;

  const canSubmit = totalItems > 0 && countedItems === totalItems;
  const progressPercent = completionPercent(countedItems, totalItems);
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (categoryFilter !== 'All categories' ? 1 : 0);
  const auditTitle = auditScope === 'warehouse' ? 'Warehouse Audit' : 'Inventory Audit';
  const countTitle = auditScope === 'warehouse' ? 'Warehouse Count' : 'Stock Count';
  const itemLabel = auditScope === 'warehouse' ? 'items' : 'SKUs';
  const searchPlaceholder = auditScope === 'warehouse'
    ? 'Search material, category or unit...'
    : 'Search product, variant or SKU...';
  const desktopStatusFilterOptions: { value: AuditStatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'uncounted', label: 'Pending' },
    { value: 'discrepancies', label: 'Variances' },
  ];
  const sectionMatchesExpected = (section: CategoryAuditSection): boolean => {
    const items = section.data.flatMap((product) => product.items);
    return items.length > 0 && items.every((item) => parseCount(item.physicalCount) === item.expectedStock);
  };
  const toggleSectionCollapsed = (sectionName: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionName)) {
        next.delete(sectionName);
        autoCollapsedSections.current.add(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  };
  const setSectionAllMatch = (sectionName: string, shouldMatchExpected: boolean) => {
    onSetCategoryExpected(sectionName, shouldMatchExpected);
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (shouldMatchExpected) {
        next.add(sectionName);
        autoCollapsedSections.current.add(sectionName);
      } else {
        next.delete(sectionName);
        autoCollapsedSections.current.delete(sectionName);
      }
      return next;
    });
  };
  React.useEffect(() => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      let changed = false;

      sections.forEach((section) => {
        const isComplete = sectionMatchesExpected(section);
        if (isComplete && !autoCollapsedSections.current.has(section.categoryName)) {
          next.add(section.categoryName);
          autoCollapsedSections.current.add(section.categoryName);
          changed = true;
        }
        if (!isComplete && autoCollapsedSections.current.has(section.categoryName)) {
          autoCollapsedSections.current.delete(section.categoryName);
          if (next.delete(section.categoryName)) {
            changed = true;
          }
        }
      });

      return changed ? next : current;
    });
  }, [sections]);

  const handleDesktopExport = () => {
    const rows = [
      ['Category', auditScope === 'warehouse' ? 'Item' : 'Product', auditScope === 'warehouse' ? 'Unit' : 'Variant', auditScope === 'warehouse' ? 'Unit' : 'SKU', 'Expected', 'Counted', 'Variance'],
      ...allSections.flatMap((section) =>
        section.data.flatMap((product) =>
          product.items.map((item) => {
            const actual = parseCount(item.physicalCount);
            const variance = actual === null ? '' : String(actual - item.expectedStock);
            return [
              section.categoryName,
              item.productName,
              item.variantName,
              item.sku,
              String(item.expectedStock),
              actual === null ? '' : String(actual),
              variance,
            ];
          })
        )
      ),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = auditScope === 'warehouse' ? 'warehouse-audit-count.csv' : 'inventory-audit-count.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  if (isDesktopWeb) {
    const remaining = Math.max(0, totalItems - countedItems);
    const startedTimeLabel = auditStartedAt
      ? new Date(auditStartedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '—';

    const liveRows = [
      { label: 'Short', count: liveBreakdown.short, dot: '#EF4444' },
      { label: 'Over', count: liveBreakdown.over, dot: '#F59E0B' },
      { label: 'Matched', count: liveBreakdown.matched, dot: '#22C55E' },
      { label: 'Pending', count: liveBreakdown.pending, dot: colors.text.muted },
    ];

    const keyboardShortcuts = [
      { keys: 'Enter', label: 'next item' },
      { keys: 'Shift + Enter', label: 'previous item' },
      { keys: 'Tab', label: 'move down' },
      { keys: 'Esc', label: 'clear field' },
    ];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
        <ScrollView
          style={{ flex: 1, backgroundColor: pageBg }}
          contentContainerStyle={{ width: '100%', maxWidth: 1400, alignSelf: 'flex-start', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-start justify-between">
            <View>
              <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">{auditTitle}</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                {catalogSkuCount} {itemLabel} ready{lastCompletedLabel ? ` · last completed ${lastCompletedLabel}` : ''}
              </Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <Pressable
                onPress={() => { void onPause(); }}
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg }}
              >
                <Pause size={16} color={colors.text.secondary} strokeWidth={2.25} />
              </Pressable>
              <Pressable
                onPress={handleDesktopExport}
                className="rounded-full items-center justify-center px-5"
                style={{ height: 44, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg }}
              >
                <Text style={{ color: colors.text.primary }} className="font-semibold text-sm">Export</Text>
              </Pressable>
              <Pressable
                onPress={onRestartAudit}
                className="rounded-full items-center justify-center flex-row px-5"
                style={{ height: 44, backgroundColor: primaryActionBg }}
              >
                <ClipboardCheck size={16} color={primaryActionText} strokeWidth={2.25} />
                <Text style={{ color: primaryActionText }} className="font-bold text-sm ml-2">Restart audit</Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row items-center mt-5 mb-6" style={{ gap: 24, borderBottomWidth: 1, borderBottomColor: cardBorder }}>
            <Pressable onPress={onBackToHome} className="pb-3" style={{ borderBottomWidth: 2, borderBottomColor: 'transparent' }}>
              <Text style={{ color: colors.text.tertiary }} className="text-sm font-semibold">Overview</Text>
            </Pressable>
            <View className="pb-3" style={{ borderBottomWidth: 2, borderBottomColor: colors.text.primary }}>
              <Text style={{ color: colors.text.primary }} className="text-sm font-bold">Counting</Text>
            </View>
          </View>

          <View className="flex-row items-start" style={{ gap: 16 }}>
            <View style={{ width: 240 }}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest mb-2 ml-1">Sections</Text>
              <View className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                {allSections.map((section, index) => {
                  const isActive = categoryFilter === section.categoryName;
                  return (
                    <Pressable
                      key={section.categoryName}
                      onPress={() => onCategoryFilterChange(isActive ? 'All categories' : section.categoryName)}
                      className="flex-row items-center justify-between px-4 py-3"
                      style={{
                        backgroundColor: isActive ? insetBg : 'transparent',
                        borderTopWidth: index > 0 ? 1 : 0,
                        borderTopColor: cardBorder,
                      }}
                    >
                      <Text style={{ color: isActive ? colors.text.primary : colors.text.secondary }} className={isActive ? 'text-sm font-bold' : 'text-sm font-medium'} numberOfLines={1}>
                        {section.categoryName}
                      </Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs">
                        {section.countedItems}/{section.totalItems}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.tertiary }} className="text-xs font-bold uppercase tracking-widest mb-3">This audit</Text>
                {[
                  { label: 'Scope', value: `${allSections.length} categories` },
                  { label: itemLabel, value: String(totalItems) },
                  { label: 'Counted by', value: performedBy },
                  { label: 'Started', value: startedTimeLabel },
                ].map((row) => (
                  <View key={row.label} className="flex-row items-center justify-between py-1.5">
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">{row.label}</Text>
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <View className="flex-row items-center mb-4" style={{ gap: 10 }}>
                <View
                  className="flex-row items-center rounded-full px-4 flex-1"
                  style={{ height: 46, backgroundColor: searchBg, borderWidth: 1, borderColor: searchBorder }}
                >
                  <Search size={16} color={colors.text.muted} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={onSearchQueryChange}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={colors.input.placeholder}
                    style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 13 }}
                    selectionColor={colors.text.primary}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => onSearchQueryChange('')} />
                </View>

                <View className="flex-row items-center rounded-full p-1" style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}>
                  {desktopStatusFilterOptions.map((option) => {
                    const active = statusFilter === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => onStatusFilterChange(option.value)}
                        className="rounded-full px-3.5"
                        style={{ height: 36, justifyContent: 'center', backgroundColor: active ? colors.text.primary : 'transparent' }}
                      >
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.secondary }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View
                  className="flex-row items-center rounded-full px-3.5"
                  style={{ height: 46, backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder, gap: 8 }}
                >
                  <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">Blind count</Text>
                  <Switch
                    value={blindCountEnabled}
                    onValueChange={setBlindCountEnabled}
                    trackColor={{ false: cardBorder, true: colors.text.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {sections.length === 0 ? (
                <View
                  className="rounded-2xl p-8 items-center"
                  style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <AlertTriangle size={24} color={colors.text.muted} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold mt-3">No matching items</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1 text-center">Adjust search or filters to see more inventory items.</Text>
                </View>
              ) : (
                <View>
                  {sections.map((section) => {
                    const isCollapsed = collapsedSections.has(section.categoryName);
                    return (
                      <View
                        key={section.categoryName}
                        className="rounded-2xl overflow-hidden mb-3"
                        style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                      >
                        <Pressable
                          onPress={() => toggleSectionCollapsed(section.categoryName)}
                          className="flex-row items-center justify-between px-4 py-3"
                          style={{ backgroundColor: surfaceBg, borderBottomWidth: isCollapsed ? 0 : 1, borderBottomColor: cardBorder }}
                        >
                          <View className="flex-row items-center flex-1 pr-3">
                            {isCollapsed ? (
                              <ChevronRight size={15} color={colors.text.tertiary} strokeWidth={2.25} />
                            ) : (
                              <ChevronDown size={15} color={colors.text.tertiary} strokeWidth={2.25} />
                            )}
                            <Text style={{ color: colors.text.secondary }} className="text-xs font-bold uppercase tracking-wide ml-2" numberOfLines={1}>
                              {section.categoryName}
                            </Text>
                            <View className="rounded-full px-2 py-0.5 ml-2" style={{ backgroundColor: insetBg }}>
                              <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold">
                                {section.countedItems}/{section.totalItems}
                              </Text>
                            </View>
                          </View>
                          <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">All match</Text>
                            <Switch
                              value={sectionMatchesExpected(section)}
                              onValueChange={(value) => setSectionAllMatch(section.categoryName, value)}
                              trackColor={{ false: cardBorder, true: colors.text.primary }}
                              thumbColor="#FFFFFF"
                            />
                          </View>
                        </Pressable>

                        {!isCollapsed ? (
                          <>
                            <View className="flex-row px-4 py-2.5" style={{ backgroundColor: insetBg, borderBottomWidth: 1, borderBottomColor: cardBorder }}>
                              <Text style={{ color: colors.text.tertiary, flex: 2.4 }} className="text-[10px] font-bold uppercase tracking-wide">
                                {auditScope === 'warehouse' ? 'Item' : 'Product'}
                              </Text>
                              <Text style={{ color: colors.text.tertiary, flex: 1.4 }} className="text-[10px] font-bold uppercase tracking-wide">
                                {auditScope === 'warehouse' ? 'Unit' : 'SKU'}
                              </Text>
                              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-[10px] font-bold uppercase tracking-wide">Counted</Text>
                              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-[10px] font-bold uppercase tracking-wide">Expected</Text>
                              <Text style={{ color: colors.text.tertiary, flex: 1 }} className="text-[10px] font-bold uppercase tracking-wide">Variance</Text>
                              <View style={{ width: 32 }} />
                            </View>

                            {section.data.flatMap((product) =>
                              product.items.map((item) => {
                          const parsedCount = parseCount(item.physicalCount);
                          const isCounted = parsedCount !== null;
                          const isMatch = isCounted && parsedCount === item.expectedStock;
                          const hasDiscrepancy = isCounted && parsedCount !== item.expectedStock;
                          const delta = isCounted ? parsedCount - item.expectedStock : 0;
                          const rowTint = hasDiscrepancy ? (isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.05)') : 'transparent';

                          return (
                            <View
                              key={item.variantId}
                              className="flex-row items-center px-4 py-2.5"
                              style={{ backgroundColor: rowTint, borderBottomWidth: 1, borderBottomColor: cardBorder }}
                            >
                              <View style={{ flex: 2.4 }}>
                                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{product.productName}</Text>
                                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5" numberOfLines={1}>{item.variantName}</Text>
                              </View>
                              <Text style={{ color: colors.text.muted, flex: 1.4 }} className="text-xs">{item.sku}</Text>
                              <View style={{ flex: 1 }}>
                                <View
                                  className="rounded-lg items-center justify-center"
                                  style={{ height: 34, width: 56, backgroundColor: insetBg }}
                                >
                                  <TextInput
                                    keyboardType="number-pad"
                                    value={item.physicalCount}
                                    onChangeText={(text) => onUpdateCount(item.variantId, text.replace(/[^0-9]/g, ''))}
                                    placeholder="—"
                                    placeholderTextColor={colors.text.muted}
                                    style={{
                                      color: colors.text.primary,
                                      fontWeight: '700',
                                      fontSize: 13,
                                      width: '100%',
                                      textAlign: 'center',
                                      paddingHorizontal: 0,
                                    }}
                                    selectionColor={colors.text.primary}
                                  />
                                </View>
                              </View>
                              <View style={{ flex: 1 }}>
                                {blindCountEnabled && !isCounted ? (
                                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">•••</Text>
                                ) : (
                                  <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">{item.expectedStock}</Text>
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                {hasDiscrepancy ? (
                                  <Text className="text-xs font-bold" style={{ color: delta >= 0 ? '#15803D' : '#B91C1C' }}>
                                    {delta >= 0 ? '+' : ''}{delta}
                                  </Text>
                                ) : isMatch ? (
                                  <Text style={{ color: '#22C55E' }} className="text-xs font-bold">✓</Text>
                                ) : (
                                  <Text style={{ color: colors.text.muted }} className="text-xs">—</Text>
                                )}
                              </View>
                              <View style={{ width: 32, alignItems: 'center' }}>
                                <Pencil size={13} color={colors.text.muted} strokeWidth={2} />
                              </View>
                            </View>
                          );
                              })
                            )}
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ width: 280 }}>
              <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold mb-3">Progress</Text>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text style={{ color: colors.text.primary }} className="text-2xl font-bold">{countedItems}/{totalItems}</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">counted</Text>
                  </View>
                  <ProgressRing
                    progress={totalItems > 0 ? countedItems / totalItems : 0}
                    progressColor={discrepancyCount > 0 ? '#F59E0B' : '#16A34A'}
                    trackColor={cardBorder}
                    label={`${progressPercent}%`}
                    labelColor={colors.text.primary}
                    size={52}
                    strokeWidth={5}
                  />
                </View>
                <View className="h-1.5 rounded-full mt-3" style={{ backgroundColor: insetBg }}>
                  <View
                    className="h-1.5 rounded-full"
                    style={{ width: `${progressPercent}%`, backgroundColor: discrepancyCount > 0 ? '#F59E0B' : '#16A34A' }}
                  />
                </View>
                <Pressable
                  onPress={onSubmit}
                  disabled={!canSubmit}
                  className="rounded-full items-center justify-center mt-4"
                  style={{
                    height: 46,
                    backgroundColor: canSubmit ? primaryActionBg : insetBg,
                    opacity: canSubmit ? 1 : 0.7,
                  }}
                >
                  <Text style={{ color: canSubmit ? primaryActionText : colors.text.muted }} className="font-bold text-sm">
                    {canSubmit ? 'Complete audit' : `Complete audit · ${remaining} left`}
                  </Text>
                </Pressable>
              </View>

              <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold mb-3">Live variance</Text>
                {liveRows.map((row, index) => (
                  <View
                    key={row.label}
                    className="flex-row items-center justify-between py-2"
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                  >
                    <View className="flex-row items-center">
                      <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: row.dot }} />
                      <Text style={{ color: colors.text.secondary }} className="text-sm">{row.label}</Text>
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{row.count}</Text>
                  </View>
                ))}
              </View>

              <View className="rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold mb-3">Keyboard</Text>
                {keyboardShortcuts.map((shortcut, index) => (
                  <View
                    key={shortcut.keys}
                    className="flex-row items-center justify-between py-2"
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                  >
                    <View className="rounded-md px-2 py-1" style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}>
                      <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold">{shortcut.keys}</Text>
                    </View>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs">{shortcut.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: canvasBg }}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: canvasBg }}>
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            backgroundColor: mainBg,
            borderWidth: !isDark && isDesktopWeb ? 1 : 0,
            borderColor: panelBorder,
            borderRadius: !isDark && isDesktopWeb ? 18 : 0,
            overflow: 'hidden',
            marginVertical: !isDark && isDesktopWeb ? 12 : 0,
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
            <View style={{ borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: mainBg }}>
              <View
                style={{
                  paddingHorizontal: horizontalPadding,
                  paddingTop: 30,
                  paddingBottom: 22,
                }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={onBackToHome}
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                    >
                      <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                    <View>
                      <Text style={{ color: colors.text.primary }} className="text-xl font-bold">{countTitle}</Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                        {countedItems} of {totalItems} counted
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        void onPause();
                      }}
                      className="h-10 rounded-full items-center justify-center flex-row px-3.5"
                      style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                    >
                      <Pause size={14} color={colors.text.secondary} strokeWidth={2.25} />
                      <Text className="ml-1.5 text-xs font-semibold" style={{ color: colors.text.secondary }}>
                        Pause
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={onSubmit}
                      disabled={!canSubmit}
                      className="h-10 rounded-full items-center justify-center flex-row px-3.5"
                      style={{
                        backgroundColor: canSubmit ? primaryActionBg : insetBg,
                        borderWidth: canSubmit ? 0 : 1,
                        borderColor: cardBorder,
                        opacity: canSubmit ? 1 : 0.6,
                      }}
                    >
                      <Check size={14} color={canSubmit ? primaryActionText : colors.text.muted} strokeWidth={2.5} />
                      <Text className="ml-1.5 text-xs font-semibold" style={{ color: canSubmit ? primaryActionText : colors.text.muted }}>
                        Complete
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View className="flex-row items-center gap-2 mb-3">
                  <View
                    className="flex-row items-center rounded-full px-4"
                    style={{ flex: 1, height: 52, backgroundColor: searchBg, borderWidth: 1, borderColor: searchBorder }}
                  >
                    <Search size={18} color={colors.text.muted} strokeWidth={2} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={onSearchQueryChange}
                      placeholder={auditScope === 'warehouse' ? 'Search by material, category, or unit' : 'Search by product, variant, or SKU'}
                      placeholderTextColor={colors.input.placeholder}
                      style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                      selectionColor={colors.text.primary}
                    />
                    <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => onSearchQueryChange('')} />
                  </View>
                  <Pressable
                    onPress={() => setShowFilterMenu(true)}
                    className="w-[52px] h-[52px] rounded-full items-center justify-center"
                    style={{
                      backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.secondary,
                      borderWidth: activeFilterCount > 0 ? 0 : 1,
                      borderColor: searchBorder,
                    }}
                  >
                    <Filter
                      size={18}
                      color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary}
                      strokeWidth={2}
                    />
                    {activeFilterCount > 0 ? (
                      <View
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full items-center justify-center px-1"
                        style={{ backgroundColor: '#F59E0B' }}
                      >
                        <Text className="text-[10px] font-bold text-white">{activeFilterCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>

                <View
                  className="flex-row items-center rounded-2xl px-4 py-3 mt-3"
                  style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: cardBg }}
                  >
                    <EyeOff size={15} color={colors.text.secondary} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Blind count</Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">Expected qty hidden until you enter</Text>
                  </View>
                  <Switch
                    value={blindCountEnabled}
                    onValueChange={setBlindCountEnabled}
                    trackColor={{ false: cardBorder, true: colors.text.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </View>

            <SectionList
              sections={sections}
              keyExtractor={(item, index) => `${item.productId}-${index}`}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1, backgroundColor: surfaceBg }}
              contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 14, paddingBottom: 150 }}
              showsVerticalScrollIndicator={false}
              renderSectionHeader={({ section }) => (
                <Pressable
                  onPress={() => toggleSectionCollapsed(section.categoryName)}
                  className="mb-3 py-2.5 flex-row items-center justify-between"
                  style={{
                    backgroundColor: surfaceBg,
                    marginHorizontal: -horizontalPadding,
                    paddingHorizontal: horizontalPadding,
                    borderBottomWidth: 1,
                    borderBottomColor: cardBorder,
                  }}
                >
                  <View className="flex-row items-center flex-1 pr-3">
                    {collapsedSections.has(section.categoryName) ? (
                      <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2.25} />
                    ) : (
                      <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2.25} />
                    )}
                    <View className="ml-2">
                      <Text style={{ color: colors.text.primary }} className="text-sm font-bold uppercase tracking-widest">
                        {section.categoryName}
                      </Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                        {section.countedItems}/{section.totalItems} counted
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold">All match</Text>
                    <Switch
                      value={sectionMatchesExpected(section)}
                      onValueChange={(value) => setSectionAllMatch(section.categoryName, value)}
                      trackColor={{ false: cardBorder, true: colors.text.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </Pressable>
              )}
              renderSectionFooter={({ section }) => (
                collapsedSections.has(section.categoryName) ? (
                  <View className="mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                      Section closed
                    </Text>
                  </View>
                ) : null
              )}
              renderItem={({ item, section }) => (
                collapsedSections.has(section.categoryName) ? null : (
                  <ProductCard
                    product={item}
                    colors={colors}
                    isDark={isDark}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    insetBg={insetBg}
                    blindCountEnabled={blindCountEnabled}
                    onUpdateCount={onUpdateCount}
                  />
                )
              )}
              ListEmptyComponent={
                <View
                  className="rounded-3xl p-6 items-center mt-4"
                  style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <AlertTriangle size={24} color={colors.text.muted} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary }} className="font-semibold mt-3">No matching items</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1 text-center">
                    Adjust search or filters to see more inventory items.
                  </Text>
                </View>
              }
            />

            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                paddingHorizontal: horizontalPadding,
                paddingTop: 14,
                paddingBottom: 30,
                borderTopWidth: 1,
                borderTopColor: cardBorder,
                backgroundColor: mainBg,
              }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold">
                  {countedItems} of {totalItems} counted
                </Text>
                <Text style={{ color: colors.text.tertiary }} className="text-xs">{progressPercent}%</Text>
              </View>
              <Text
                className="text-xs mb-3"
                style={{ color: discrepancyCount > 0 ? '#B45309' : '#15803D' }}
              >
                {discrepancyCount > 0
                  ? `${discrepancyCount} discrepancy${discrepancyCount > 1 ? 'ies' : ''} found`
                  : 'All matched so far'}
              </Text>
              <View className="h-2 rounded-full mb-4" style={{ backgroundColor: insetBg }}>
                <View
                  className="h-2 rounded-full"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: discrepancyCount > 0 ? '#F59E0B' : '#16A34A',
                  }}
                />
              </View>
              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit}
                className="rounded-full items-center justify-center"
                style={{
                  height: 54,
                  backgroundColor: canSubmit ? primaryActionBg : isDark ? '#222227' : colors.bg.tertiary,
                  opacity: canSubmit ? 1 : 0.6,
                }}
              >
                <Text style={{ color: canSubmit ? primaryActionText : colors.text.muted }} className="font-bold text-base">
                  Complete Audit
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>

      <Modal
        visible={showFilterMenu}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          className="flex-1"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: isWeb ? 'center' : 'flex-end',
            alignItems: 'center',
          }}
          onPress={() => setShowFilterMenu(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="overflow-hidden"
            style={{
              backgroundColor: mainBg,
              width: isWeb ? Math.min(520, width - 24) : '100%',
              maxHeight: isWeb ? '80%' : '75%',
              borderRadius: isWeb ? 20 : 24,
              borderWidth: isWeb ? 1 : 0,
              borderColor: isWeb ? cardBorder : 'transparent',
            }}
          >
            {!isWeb ? (
              <View className="items-center py-3">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: cardBorder }} />
              </View>
            ) : null}

            <View
              className="flex-row items-center justify-between px-5"
              style={{
                paddingTop: isWeb ? 18 : 0,
                paddingBottom: 14,
                borderBottomWidth: 0.5,
                borderBottomColor: cardBorder,
              }}
            >
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filters</Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: insetBg }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-5 pt-4">
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Status</Text>
                {statusFilterOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => onStatusFilterChange(option.value)}
                    className="flex-row items-center py-3"
                  >
                    <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                    </View>
                    {statusFilter === option.value ? (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.text.primary }}>
                        <Check size={12} color={onPrimaryBg} strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: cardBorder, marginTop: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Category</Text>
                {categoryOptions.map((categoryName) => (
                  <Pressable
                    key={categoryName}
                    onPress={() => onCategoryFilterChange(categoryName)}
                    className="flex-row items-center py-3"
                  >
                    <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{categoryName}</Text>
                    </View>
                    {categoryFilter === categoryName ? (
                      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.text.primary }}>
                        <Check size={12} color={onPrimaryBg} strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View className="px-5 py-4 gap-2">
                <Pressable
                  onPress={() => {
                    onStatusFilterChange('all');
                    onCategoryFilterChange('All categories');
                  }}
                  className="rounded-full items-center justify-center"
                  style={{ height: 44, backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <Text style={{ color: colors.text.secondary }} className="font-semibold text-sm">Clear filters</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowFilterMenu(false)}
                  className="rounded-full items-center justify-center"
                  style={{ height: 50, backgroundColor: colors.text.primary }}
                >
                  <Text style={{ color: onPrimaryBg }} className="font-semibold">Apply</Text>
                </Pressable>
              </View>

              <View className="h-6" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProductCard({
  product,
  colors,
  isDark,
  cardBg,
  cardBorder,
  insetBg,
  blindCountEnabled,
  onUpdateCount,
}: {
  product: ProductAuditGroup;
  colors: ThemeColors;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  insetBg: string;
  blindCountEnabled: boolean;
  onUpdateCount: (variantId: string, count: string) => void;
}) {
  const matchBorder = isDark ? '#3F6212' : '#86EFAC';
  const matchBg = isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.05)';
  const discrepancyBorder = '#F59E0B';
  const discrepancyBg = isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.05)';

  return (
    <View className="mb-3">
      {product.items.length > 1 ? (
        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400' }} className="mb-2 ml-1">
          {product.productName}
        </Text>
      ) : null}

      {product.items.map((item) => {
        const parsedCount = parseCount(item.physicalCount);
        const isCounted = parsedCount !== null;
        const isMatch = parsedCount === item.expectedStock && parsedCount !== null;
        const hasDiscrepancy = parsedCount !== null && parsedCount !== item.expectedStock;
        const delta = parsedCount !== null ? parsedCount - item.expectedStock : 0;

        const itemBorderColor = isMatch ? matchBorder : hasDiscrepancy ? discrepancyBorder : cardBorder;
        const itemBg = isMatch ? matchBg : hasDiscrepancy ? discrepancyBg : cardBg;

        return (
          <View
            key={item.variantId}
            className="rounded-2xl px-4 py-3 mb-2.5 flex-row items-center"
            style={{ backgroundColor: itemBg, borderWidth: 1, borderColor: itemBorderColor }}
          >
            <View className="flex-1 pr-3">
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                {product.items.length > 1 ? item.variantName : product.productName}
              </Text>
              {product.items.length > 1 ? (
                <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{item.variantName}</Text>
              ) : null}
              <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">{item.sku}</Text>
            </View>

            <View
              className="rounded-xl items-center justify-center mr-3"
              style={{
                height: 48,
                width: 64,
                backgroundColor: insetBg,
              }}
            >
              <TextInput
                keyboardType="number-pad"
                value={item.physicalCount}
                onChangeText={(text) => onUpdateCount(item.variantId, text.replace(/[^0-9]/g, ''))}
                placeholder="—"
                placeholderTextColor={colors.text.muted}
                textAlign="center"
                style={{
                  color: colors.text.primary,
                  fontWeight: '700',
                  fontSize: 16,
                  width: '100%',
                  textAlign: 'center',
                  paddingHorizontal: 0,
                }}
                selectionColor={colors.text.primary}
              />
            </View>

            <View className="items-end" style={{ minWidth: 56 }}>
              <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold uppercase">Expected</Text>
              {blindCountEnabled && !isCounted ? (
                <Text style={{ color: colors.text.muted }} className="text-sm font-bold mt-0.5">•••</Text>
              ) : (
                <Text style={{ color: colors.text.primary }} className="text-sm font-bold mt-0.5">{item.expectedStock}</Text>
              )}
              {hasDiscrepancy ? (
                <Text className="text-xs font-bold mt-0.5" style={{ color: delta >= 0 ? '#15803D' : '#B91C1C' }}>
                  {delta >= 0 ? '+' : ''}{delta}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
