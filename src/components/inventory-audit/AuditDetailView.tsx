import React from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, Pencil, RotateCcw, User, X } from 'lucide-react-native';
import {
  BackButton,
  FYLL_LIME,
  FYLL_LIME_HOVER,
  FYLL_LIME_INK,
  MoneyText,
  isHovered,
  usePaymentsPalette,
} from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
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

export function AuditDetailView({
  log,
  excludedProductIds,
  excludedProductNames,
  performedBy,
  onBack,
  onSave,
  onRestart,
}: AuditDetailViewProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftCounts, setDraftCounts] = React.useState<Record<string, string>>({});
  const [draftExpectedCounts, setDraftExpectedCounts] = React.useState<Record<string, string>>({});
  const palette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const { isMobile, width } = useBreakpoint();
  const isWide = Platform.OS === 'web' && width >= 1100;
  const fs = (size: number) => (isMobile && size < 16 ? (size >= 13 ? 12 : 10) : size);

  const isWarehouseAudit = log?.scope === 'warehouse';
  const items = (log?.items ?? []).filter((item) => {
    if (isWarehouseAudit) return true;
    return !excludedProductIds?.has(item.productId) && !excludedProductNames?.has(item.productName.trim().toLowerCase());
  });
  const itemLabel = isWarehouseAudit ? 'items' : 'SKUs';
  const accuracy = log ? getAccuracyPercentage(items) : 0;
  const breakdown = getVarianceBreakdown(items);
  const unitsOff = items.reduce((sum, item) => sum + Math.abs(item.discrepancy), 0);
  const sortedItems = [...items].sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
  const accuracyTone = accuracy >= 95 ? palette.tones.verified : accuracy < 70 ? palette.tones.rejected : palette.tones.awaiting;

  const dateLabel = log
    ? new Date(log.completedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const shortDateLabel = log
    ? new Date(log.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const timeLabel = log
    ? new Date(log.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const activityLog = log?.activityLog ?? [];
  const hasInvalidDraft = isEditing && sortedItems.some((item) => (
    parseAuditEditCount(draftCounts[item.variantId] ?? String(item.actualStock)) === null
    || parseAuditEditCount(draftExpectedCounts[item.variantId] ?? String(item.expectedStock)) === null
  ));

  const card = {
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  } as const;
  const sectionLabel = {
    color: palette.muted,
    fontSize: fs(12),
    fontWeight: '600' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  };
  const tableLabel = {
    color: palette.faint,
    fontSize: fs(11.5),
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  };

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
      return { ...item, expectedStock: nextExpectedStock, actualStock: nextActualStock, discrepancy: nextActualStock - nextExpectedStock };
    });

    const changes = nextItems
      .map((nextItem): AuditLogActivityChange | null => {
        const previousItem = log.items.find((item) => item.variantId === nextItem.variantId);
        if (!previousItem || (previousItem.actualStock === nextItem.actualStock && previousItem.expectedStock === nextItem.expectedStock)) return null;
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

  const ghostButton = (label: string, icon: React.ReactNode, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => ({
        height: 40,
        paddingHorizontal: isMobile ? 13 : 16,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.outline,
        backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
      })}
    >
      {icon}
      <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  const editActions = (fullWidth: boolean) => (
    <>
      <View style={fullWidth ? { flex: 1 } : undefined}>
        {ghostButton('Cancel', <X size={15} color={palette.text} strokeWidth={2.2} />, cancelEditing)}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save audit changes"
        onPress={saveEditing}
        disabled={hasInvalidDraft}
        style={(state) => ({
          height: 40,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: hasInvalidDraft ? palette.softFill : state.pressed || isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
          flex: fullWidth ? 1 : undefined,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          opacity: hasInvalidDraft ? 0.6 : 1,
        })}
      >
        <Check size={15} color={hasInvalidDraft ? palette.faint : FYLL_LIME_INK} strokeWidth={2.4} />
        <Text style={{ color: hasInvalidDraft ? palette.faint : FYLL_LIME_INK, fontSize: fs(14), fontWeight: '600' }}>Save changes</Text>
      </Pressable>
    </>
  );

  const summaryStats = [
    { label: 'Accuracy', value: `${accuracy}%`, sub: accuracy >= 95 ? 'Healthy result' : 'Needs review', dot: accuracyTone.dot },
    { label: 'Counted', value: String(items.length), sub: itemLabel, dot: palette.tones.review.dot },
    { label: 'Units off', value: String(unitsOff), sub: unitsOff === 0 ? 'No variance' : 'Across this count', dot: unitsOff === 0 ? palette.tones.verified.dot : palette.tones.rejected.dot },
    { label: 'Exact matches', value: String(breakdown.matched), sub: `of ${items.length} ${itemLabel}`, dot: palette.tones.verified.dot },
  ];

  const CountDetailsCard = () => (
    <View style={{ ...card, padding: isMobile ? 16 : 20 }}>
      <Text style={sectionLabel}>Count details</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.avatarBg }}>
          <User size={17} color={palette.avatarText} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, marginLeft: 11 }}>
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{log?.performedBy ?? 'Team'}</Text>
          <Text style={{ color: palette.muted, fontSize: fs(12), marginTop: 2 }}>{dateLabel}</Text>
        </View>
        <Text style={{ color: palette.faint, fontSize: fs(12), fontVariant: ['tabular-nums'] }}>{timeLabel}</Text>
      </View>
    </View>
  );

  const BreakdownCard = () => (
    <View style={card}>
      <View style={{ paddingHorizontal: isMobile ? 16 : 20, paddingTop: isMobile ? 16 : 20, paddingBottom: 10 }}>
        <Text style={sectionLabel}>Result breakdown</Text>
      </View>
      {[
        { label: 'Short', description: 'Fewer on shelf', count: breakdown.short, dot: palette.tones.rejected.dot },
        { label: 'Over', description: 'More on shelf', count: breakdown.over, dot: palette.tones.awaiting.dot },
        { label: 'Matched', description: 'Exact stock count', count: breakdown.matched, dot: palette.tones.verified.dot },
      ].map((row, index) => (
        <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: isMobile ? 16 : 20, paddingVertical: 13, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.dot, marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.textSoft, fontSize: fs(13), fontWeight: '600' }}>{row.label}</Text>
            <Text style={{ color: palette.faint, fontSize: fs(11.5), marginTop: 1 }}>{row.description}</Text>
          </View>
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{row.count}</Text>
        </View>
      ))}
    </View>
  );

  const ActivityCard = () => (
    <View style={card}>
      <View style={{ paddingHorizontal: isMobile ? 16 : 20, paddingTop: isMobile ? 16 : 20, paddingBottom: 12 }}>
        <Text style={sectionLabel}>Activity</Text>
        <Text style={{ color: palette.faint, fontSize: fs(12), marginTop: 4 }}>Changes made after the count was completed</Text>
      </View>
      {activityLog.length === 0 ? (
        <View style={{ paddingHorizontal: isMobile ? 16 : 20, paddingVertical: 18, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>No edits recorded.</Text>
        </View>
      ) : [...activityLog].reverse().map((activity) => (
        <View key={activity.id} style={{ paddingHorizontal: isMobile ? 16 : 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Text style={{ color: palette.text, fontSize: fs(13), fontWeight: '600' }}>{activity.action}</Text>
          <Text style={{ color: palette.faint, fontSize: fs(11.5), marginTop: 3 }}>
            {activity.performedBy ?? 'Team'} · {new Date(activity.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
          <View style={{ marginTop: 8, gap: 5 }}>
            {activity.changes.slice(0, 4).map((change) => (
              <Text key={`${activity.id}-${change.variantId}`} style={{ color: palette.textSoft, fontSize: fs(11.5), lineHeight: fs(17) }} numberOfLines={2}>
                {change.productName} · {change.variantName}: counted {change.previousActualStock} to {change.nextActualStock}
                {change.previousExpectedStock !== undefined && change.nextExpectedStock !== undefined && change.previousExpectedStock !== change.nextExpectedStock
                  ? `, expected ${change.previousExpectedStock} to ${change.nextExpectedStock}` : ''}
              </Text>
            ))}
            {activity.changes.length > 4 ? <Text style={{ color: palette.faint, fontSize: fs(11.5) }}>+{activity.changes.length - 4} more changes</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );

  const VarianceCard = () => (
    <View style={card}>
      <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', paddingHorizontal: isMobile ? 16 : 20, paddingTop: isMobile ? 16 : 20, paddingBottom: 14, gap: 4 }}>
        <View>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>Variance report</Text>
          <Text style={{ color: palette.faint, fontSize: fs(12), marginTop: 4 }}>Largest differences are shown first</Text>
        </View>
        <Text style={{ color: palette.muted, fontSize: fs(12), alignSelf: isMobile ? 'flex-start' : 'center' }}>{items.length} {itemLabel}</Text>
      </View>

      {!isMobile && sortedItems.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 38, paddingHorizontal: 20, backgroundColor: palette.inset, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.hairline }}>
          <Text style={[tableLabel, { flex: 1 }]}>Product</Text>
          <Text style={[tableLabel, { width: 100, textAlign: 'center' }]}>Counted</Text>
          <Text style={[tableLabel, { width: 100, textAlign: 'center' }]}>Expected</Text>
          <Text style={[tableLabel, { width: 92, textAlign: 'right' }]}>Variance</Text>
        </View>
      ) : null}

      {sortedItems.length === 0 ? (
        <View style={{ padding: isMobile ? 16 : 20, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>No item-level details recorded.</Text>
        </View>
      ) : sortedItems.map((item, index) => {
        const draftValue = draftCounts[item.variantId] ?? String(item.actualStock);
        const draftExpectedValue = draftExpectedCounts[item.variantId] ?? String(item.expectedStock);
        const draftActual = parseAuditEditCount(draftValue);
        const draftExpected = parseAuditEditCount(draftExpectedValue);
        const displayActual = isEditing && draftActual !== null ? draftActual : item.actualStock;
        const displayExpected = isEditing && draftExpected !== null ? draftExpected : item.expectedStock;
        const displayDiscrepancy = displayActual - displayExpected;
        const varianceTone = displayDiscrepancy === 0 ? palette.tones.verified : displayDiscrepancy > 0 ? palette.tones.awaiting : palette.tones.rejected;
        const countInput = (value: string, parsedValue: number | null, update: React.Dispatch<React.SetStateAction<Record<string, string>>>) => (
          <TextInput
            value={value}
            onChangeText={(nextValue) => update((current) => ({ ...current, [item.variantId]: nextValue.replace(/[^\d]/g, '') }))}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            style={{ width: isMobile ? 62 : 72, height: 38, borderRadius: 10, borderWidth: 1, borderColor: parsedValue === null ? palette.danger : palette.outline, backgroundColor: palette.inset, color: palette.text, textAlign: 'center', fontSize: fs(14), fontWeight: '600', fontVariant: ['tabular-nums'] }}
          />
        );

        return (
          <Pressable key={item.variantId} style={(state) => ({ paddingHorizontal: isMobile ? 16 : 20, paddingVertical: isMobile ? 14 : 13, borderTopWidth: isMobile || index > 0 ? 1 : 0, borderTopColor: palette.hairline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
            {isMobile ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.text, fontSize: fs(13), fontWeight: '600' }} numberOfLines={1}>{item.productName}</Text>
                    <Text style={{ color: palette.faint, fontSize: fs(11.5), marginTop: 3 }} numberOfLines={1}>{item.variantName} · SKU {item.sku}</Text>
                  </View>
                  <View style={{ minWidth: 48, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: varianceTone.bg }}>
                    <Text style={{ color: varianceTone.ink, fontSize: fs(11.5), fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] }}>
                      {displayDiscrepancy === 0 ? 'Match' : `${displayDiscrepancy > 0 ? '+' : ''}${displayDiscrepancy}`}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', marginTop: 12, gap: 22 }}>
                  <View>
                    <Text style={tableLabel}>Counted</Text>
                    <View style={{ marginTop: 5 }}>{isEditing ? countInput(draftValue, draftActual, setDraftCounts) : <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{item.actualStock}</Text>}</View>
                  </View>
                  <View>
                    <Text style={tableLabel}>Expected</Text>
                    <View style={{ marginTop: 5 }}>{isEditing ? countInput(draftExpectedValue, draftExpected, setDraftExpectedCounts) : <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{item.expectedStock}</Text>}</View>
                  </View>
                </View>
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 18 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.productName}</Text>
                  <Text style={{ color: palette.faint, fontSize: 11.5, marginTop: 3 }} numberOfLines={1}>{item.variantName} · SKU {item.sku}</Text>
                </View>
                <View style={{ width: 100, alignItems: 'center' }}>{isEditing ? countInput(draftValue, draftActual, setDraftCounts) : <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{item.actualStock}</Text>}</View>
                <View style={{ width: 100, alignItems: 'center' }}>{isEditing ? countInput(draftExpectedValue, draftExpected, setDraftExpectedCounts) : <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{item.expectedStock}</Text>}</View>
                <View style={{ width: 92, alignItems: 'flex-end' }}>
                  <View style={{ minWidth: 52, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: varianceTone.bg }}>
                    <Text style={{ color: varianceTone.ink, fontSize: 11.5, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{displayDiscrepancy === 0 ? 'Match' : `${displayDiscrepancy > 0 ? '+' : ''}${displayDiscrepancy}`}</Text>
                  </View>
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ width: '100%', maxWidth: isWide ? 1456 : 820, alignSelf: isWide ? 'flex-start' : 'center', paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 10 : 36, paddingBottom: isMobile ? (isEditing ? 104 : 32) + tabBarHeight : 60, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <BackButton onPress={onBack} palette={palette} label="Back to audit" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: isMobile ? 26 : 30, lineHeight: isMobile ? 31 : 36, fontWeight: '700', letterSpacing: -0.6 }}>{isWarehouseAudit ? 'Warehouse count' : 'Count details'}</Text>
              <Text style={{ color: palette.muted, fontSize: fs(13), marginTop: 3 }} numberOfLines={1}>
                {log ? `${shortDateLabel} · ${log.performedBy ?? 'Team'} · ${items.length} ${itemLabel}` : 'Review a completed stock count'}
              </Text>
            </View>
          </View>

          {log && (!isEditing || !isMobile) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              {isEditing ? (
                editActions(false)
              ) : (
                <>
                  {onRestart ? ghostButton('Recount', <RotateCcw size={15} color={palette.text} strokeWidth={2.2} />, () => onRestart(isWarehouseAudit ? 'warehouse' : 'products')) : null}
                  {ghostButton('Edit count', <Pencil size={15} color={palette.text} strokeWidth={2.2} />, startEditing)}
                </>
              )}
            </View>
          ) : null}
        </View>

        {!log ? (
          <View style={{ ...card, padding: 28, alignItems: 'center' }}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>Audit not found</Text>
            <Text style={{ color: palette.muted, fontSize: fs(13), marginTop: 6, textAlign: 'center' }}>This count may have been removed or is no longer available.</Text>
          </View>
        ) : (
          <>
            <View style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }}>
              {summaryStats.map((stat, index) => {
                const mobileColumn = index % 2;
                const mobileRow = Math.floor(index / 2);
                return (
                  <View key={stat.label} style={{ width: isMobile ? '50%' : '25%', minHeight: isMobile ? 116 : 126, paddingHorizontal: isMobile ? 15 : 20, paddingVertical: isMobile ? 16 : 20, borderLeftWidth: isMobile ? (mobileColumn === 1 ? 1 : 0) : (index > 0 ? 1 : 0), borderTopWidth: isMobile && mobileRow > 0 ? 1 : 0, borderColor: palette.hairline }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stat.dot }} />
                      <Text style={sectionLabel}>{stat.label}</Text>
                    </View>
                    <MoneyText style={{ color: palette.text, fontSize: isMobile ? 25 : 29, lineHeight: isMobile ? 31 : 36, marginTop: 10 }}>{stat.value}</MoneyText>
                    <Text style={{ color: palette.faint, fontSize: fs(11.5), marginTop: 3 }}>{stat.sub}</Text>
                  </View>
                );
              })}
            </View>

            {isWide ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
                <View style={{ flex: 1, minWidth: 0 }}>{VarianceCard()}</View>
                <View style={{ width: 360, gap: 18 }}>{CountDetailsCard()}{BreakdownCard()}{ActivityCard()}</View>
              </View>
            ) : (
              <>{CountDetailsCard()}{BreakdownCard()}{VarianceCard()}{ActivityCard()}</>
            )}
          </>
        )}
      </ScrollView>
      {log && isEditing && isMobile ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
            backgroundColor: palette.card,
            borderTopWidth: 1,
            borderTopColor: palette.outline,
          }}
        >
          {editActions(true)}
        </View>
      ) : null}
    </View>
  );
}
