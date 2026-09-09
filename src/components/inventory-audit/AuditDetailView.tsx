import React from 'react';
import { Platform, View, Text, ScrollView, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Pencil, RotateCcw, User, X } from 'lucide-react-native';
import type { AuditLog, AuditLogActivity, AuditLogActivityChange, AuditLogItem } from '@/lib/state/fyll-store';
import type { ThemeColors } from '@/lib/theme';
import { getAccuracyPercentage, getVarianceBreakdown } from './utils';

interface AuditDetailViewProps {
  isDark: boolean;
  colors: ThemeColors;
  log: AuditLog | null;
  excludedProductIds?: Set<string>;
  excludedProductNames?: Set<string>;
  performedBy: string;
  onBack: () => void;
  onSave: (logId: string, updates: Partial<AuditLog>) => void;
  onRestart?: (scope: 'products' | 'warehouse') => void;
}

const parseAuditEditCount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
};

export function AuditDetailView({ isDark, colors, log, excludedProductIds, excludedProductNames, performedBy, onBack, onSave, onRestart }: AuditDetailViewProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftCounts, setDraftCounts] = React.useState<Record<string, string>>({});
  const [draftExpectedCounts, setDraftExpectedCounts] = React.useState<Record<string, string>>({});
  const { width } = useWindowDimensions();
  const isLargeLayout = Platform.OS === 'web' || width >= 768;
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const contentMaxWidth = isDesktopWeb ? 1400 : isLargeLayout ? 920 : undefined;
  const contentAlign = isDesktopWeb ? 'flex-start' : 'center';
  const horizontalPadding = isDesktopWeb ? 20 : isLargeLayout ? 16 : 20;

  const pageBg = isDark ? '#0C0C0D' : '#FFFFFF';
  const surfaceBg = isDark ? '#111113' : '#FFFFFF';
  const cardBg = isDark ? '#1A1A1E' : colors.bg.card;
  const cardBorder = isDark ? '#3A3A40' : colors.border.light;
  const insetBg = isDark ? '#151518' : colors.bg.secondary;

  const isWarehouseAudit = log?.scope === 'warehouse';
  const items = (log?.items ?? []).filter((item) => {
    if (isWarehouseAudit) return true;
    return !excludedProductIds?.has(item.productId) && !excludedProductNames?.has(item.productName.trim().toLowerCase());
  });
  const auditTitle = isWarehouseAudit ? 'Warehouse Audit' : 'Audit Details';
  const itemLabel = isWarehouseAudit ? 'items' : 'SKUs';
  const accuracy = log ? getAccuracyPercentage(items) : 0;
  const breakdown = getVarianceBreakdown(items);
  const sortedItems = [...items].sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));

  const dateLabel = log
    ? new Date(log.completedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const timeLabel = log
    ? new Date(log.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const activityLog = log?.activityLog ?? [];
  const hasInvalidDraft = isEditing && sortedItems.some((item) => (
    parseAuditEditCount(draftCounts[item.variantId] ?? String(item.actualStock)) === null ||
    parseAuditEditCount(draftExpectedCounts[item.variantId] ?? String(item.expectedStock)) === null
  ));

  const startEditing = () => {
    if (!log) return;
    setDraftCounts(Object.fromEntries(log.items.map((item) => [item.variantId, String(item.actualStock)])));
    setDraftExpectedCounts(Object.fromEntries(log.items.map((item) => [item.variantId, String(item.expectedStock)])));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftCounts({});
    setDraftExpectedCounts({});
    setIsEditing(false);
  };

  const saveEditing = () => {
    if (!log || hasInvalidDraft) return;

    const nextItems: AuditLogItem[] = log.items.map((item) => {
      const nextActualStock = parseAuditEditCount(draftCounts[item.variantId] ?? String(item.actualStock)) ?? item.actualStock;
      const nextExpectedStock = parseAuditEditCount(draftExpectedCounts[item.variantId] ?? String(item.expectedStock)) ?? item.expectedStock;
      return {
        ...item,
        expectedStock: nextExpectedStock,
        actualStock: nextActualStock,
        discrepancy: nextActualStock - nextExpectedStock,
      };
    });

    const changes = nextItems
      .map((nextItem): AuditLogActivityChange | null => {
        const previousItem = log.items.find((item) => item.variantId === nextItem.variantId);
        if (!previousItem || (previousItem.actualStock === nextItem.actualStock && previousItem.expectedStock === nextItem.expectedStock)) {
          return null;
        }
        return {
          variantId: nextItem.variantId,
          productName: nextItem.productName,
          variantName: nextItem.variantName,
          sku: nextItem.sku,
          previousExpectedStock: previousItem.expectedStock,
          nextExpectedStock: nextItem.expectedStock,
          previousActualStock: previousItem.actualStock,
          nextActualStock: nextItem.actualStock,
          previousDiscrepancy: previousItem.discrepancy,
          nextDiscrepancy: nextItem.discrepancy,
        };
      })
      .filter((change): change is AuditLogActivity['changes'][number] => change !== null);

    if (changes.length === 0) {
      cancelEditing();
      return;
    }

    const activity: AuditLogActivity = {
      id: `audit-edit-${Date.now()}`,
      action: 'Edited completed audit',
      performedBy,
      createdAt: new Date().toISOString(),
      changes,
    };

    onSave(log.id, {
      items: nextItems,
      itemsAudited: nextItems.length,
      discrepancies: nextItems.reduce((sum, item) => sum + Math.abs(item.discrepancy), 0),
      activityLog: [...activityLog, activity],
    });
    cancelEditing();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: pageBg }}>
        <View
          style={{
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: contentAlign,
            paddingHorizontal: horizontalPadding,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
            <Pressable
              onPress={onBack}
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text style={{ color: colors.text.primary }} className="text-xl font-bold">{auditTitle}</Text>
            </View>
            {log ? (
              isEditing ? (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Pressable
                    onPress={cancelEditing}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                  >
                    <X size={17} color={colors.text.secondary} strokeWidth={2.25} />
                  </Pressable>
                  <Pressable
                    onPress={saveEditing}
                    disabled={hasInvalidDraft}
                    className="h-10 rounded-full items-center justify-center flex-row px-3.5"
                    style={{ backgroundColor: hasInvalidDraft ? insetBg : colors.text.primary, opacity: hasInvalidDraft ? 0.55 : 1 }}
                  >
                    <Check size={15} color={hasInvalidDraft ? colors.text.muted : pageBg} strokeWidth={2.5} />
                    <Text className="ml-1.5 text-xs font-bold" style={{ color: hasInvalidDraft ? colors.text.muted : pageBg }}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => onRestart?.(isWarehouseAudit ? 'warehouse' : 'products')}
                    className="h-10 rounded-full items-center justify-center flex-row px-3.5"
                    style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                  >
                    <RotateCcw size={14} color={colors.text.secondary} strokeWidth={2.25} />
                    <Text className="ml-1.5 text-xs font-semibold" style={{ color: colors.text.secondary }}>Recount</Text>
                  </Pressable>
                  <Pressable
                    onPress={startEditing}
                    className="h-10 rounded-full items-center justify-center flex-row px-3.5"
                    style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
                  >
                    <Pencil size={14} color={colors.text.secondary} strokeWidth={2.25} />
                    <Text className="ml-1.5 text-xs font-semibold" style={{ color: colors.text.secondary }}>Edit</Text>
                  </Pressable>
                </View>
              )
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: surfaceBg }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: contentAlign,
          paddingHorizontal: horizontalPadding,
          paddingTop: 16,
          paddingBottom: 36,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!log ? (
          <View className="rounded-3xl p-6 items-center" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
            <Text style={{ color: colors.text.primary }} className="font-bold">Audit not found</Text>
          </View>
        ) : (
          <>
            <View
              className="rounded-3xl p-5 mb-4"
              style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
            >
              <View className="flex-row items-center justify-between">
                <Text style={{ color: colors.text.primary }} className="text-4xl font-bold">{accuracy}%</Text>
                {log.discrepancies > 0 ? (
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                    <Text className="text-xs font-bold" style={{ color: '#DC2626' }}>{log.discrepancies} units off</Text>
                  </View>
                ) : (
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                    <Text className="text-xs font-bold" style={{ color: '#15803D' }}>No variance</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">accuracy · {items.length} {itemLabel}</Text>

              <View
                className="flex-row items-center rounded-2xl px-4 py-3 mt-4"
                style={{ backgroundColor: insetBg, borderWidth: 1, borderColor: cardBorder }}
              >
                <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: cardBg }}>
                  <User size={16} color={colors.text.secondary} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    Counted by {log.performedBy ?? 'Team'}
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{dateLabel} · {timeLabel}</Text>
                </View>
              </View>

              <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: cardBorder }}>
                {[
                  { label: 'Short — fewer on shelf', count: breakdown.short, dot: '#EF4444' },
                  { label: 'Over — more on shelf', count: breakdown.over, dot: '#F59E0B' },
                  { label: 'Matched exactly', count: breakdown.matched, dot: '#22C55E' },
                ].map((row, index) => (
                  <View
                    key={row.label}
                    className="flex-row items-center justify-between py-2.5"
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: cardBorder } : undefined}
                  >
                    <View className="flex-row items-center">
                      <View className="w-2 h-2 rounded-full mr-2.5" style={{ backgroundColor: row.dot }} />
                      <Text style={{ color: colors.text.secondary }} className="text-sm">{row.label}</Text>
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{row.count} {itemLabel}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={{ color: colors.text.primary }} className="text-base font-bold mb-3">Item variance</Text>

            {sortedItems.length === 0 ? (
              <View className="rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm">No item-level details recorded.</Text>
              </View>
            ) : (
              sortedItems.map((item) => {
                const draftValue = draftCounts[item.variantId] ?? String(item.actualStock);
                const draftExpectedValue = draftExpectedCounts[item.variantId] ?? String(item.expectedStock);
                const draftActual = parseAuditEditCount(draftValue);
                const draftExpected = parseAuditEditCount(draftExpectedValue);
                const displayActual = isEditing && draftActual !== null ? draftActual : item.actualStock;
                const displayExpected = isEditing && draftExpected !== null ? draftExpected : item.expectedStock;
                const displayDiscrepancy = displayActual - displayExpected;
                return (
                <View
                  key={item.variantId}
                  className="rounded-2xl px-4 py-3 mb-2.5 flex-row items-center justify-between"
                  style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <View className="flex-1 pr-3">
                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5" numberOfLines={1}>
                      {item.variantName} · SKU {item.sku}
                    </Text>
                  </View>
                  <View className="items-end">
                    {isEditing ? (
                      <View className="flex-row items-center" style={{ gap: 8 }}>
                        <View className="items-center">
                          <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold mb-1">Counted</Text>
                          <TextInput
                            value={draftValue}
                            onChangeText={(value) => setDraftCounts((current) => ({ ...current, [item.variantId]: value.replace(/[^\d]/g, '') }))}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            selectTextOnFocus
                            style={{
                              width: 72,
                              height: 38,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: draftActual === null ? '#DC2626' : cardBorder,
                              backgroundColor: insetBg,
                              color: colors.text.primary,
                              textAlign: 'center',
                              fontSize: 14,
                              fontWeight: '700',
                            }}
                          />
                        </View>
                        <View className="items-center">
                          <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold mb-1">Expected</Text>
                          <TextInput
                            value={draftExpectedValue}
                            onChangeText={(value) => setDraftExpectedCounts((current) => ({ ...current, [item.variantId]: value.replace(/[^\d]/g, '') }))}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            selectTextOnFocus
                            style={{
                              width: 72,
                              height: 38,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: draftExpected === null ? '#DC2626' : cardBorder,
                              backgroundColor: insetBg,
                              color: colors.text.primary,
                              textAlign: 'center',
                              fontSize: 14,
                              fontWeight: '700',
                            }}
                          />
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row items-center" style={{ gap: 8 }}>
                        <View className="items-center">
                          <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold mb-1">Counted</Text>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{item.actualStock}</Text>
                        </View>
                        <View className="items-center">
                          <Text style={{ color: colors.text.tertiary }} className="text-[10px] font-semibold mb-1">Expected</Text>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{item.expectedStock}</Text>
                        </View>
                      </View>
                    )}
                    <Text
                      className="text-xs font-semibold mt-1"
                      style={{ color: displayDiscrepancy === 0 ? '#15803D' : displayDiscrepancy > 0 ? '#B45309' : '#B91C1C' }}
                    >
                      {displayDiscrepancy === 0 ? 'Match' : `${displayDiscrepancy >= 0 ? '+' : ''}${displayDiscrepancy}`}
                    </Text>
                  </View>
                </View>
              );
              })
            )}

            <Text style={{ color: colors.text.primary }} className="text-base font-bold mt-5 mb-3">Activity log</Text>
            {activityLog.length === 0 ? (
              <View className="rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm">No edits recorded.</Text>
              </View>
            ) : (
              [...activityLog].reverse().map((activity) => (
                <View
                  key={activity.id}
                  className="rounded-2xl px-4 py-3 mb-2.5"
                  style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-bold">{activity.action}</Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                    {activity.performedBy ?? 'Team'} · {new Date(activity.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <View className="mt-2">
                    {activity.changes.slice(0, 4).map((change) => (
                      <Text key={`${activity.id}-${change.variantId}`} style={{ color: colors.text.secondary }} className="text-xs mt-1" numberOfLines={1}>
                        {change.productName} · {change.variantName}: counted {change.previousActualStock} to {change.nextActualStock}
                        {change.previousExpectedStock !== undefined && change.nextExpectedStock !== undefined && change.previousExpectedStock !== change.nextExpectedStock
                          ? `, expected ${change.previousExpectedStock} to ${change.nextExpectedStock}`
                          : ''}
                      </Text>
                    ))}
                    {activity.changes.length > 4 ? (
                      <Text style={{ color: colors.text.tertiary }} className="text-xs mt-1">
                        +{activity.changes.length - 4} more changes
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
