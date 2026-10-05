import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronRight, History } from 'lucide-react-native';
import type { AuditLog, Product } from '@/lib/state/fyll-store';
import { MoneyText, isHovered, usePaymentsPalette, BackButton } from '@/components/payments/payments-ui';
import { FilterPill, formatCompactNaira } from '@/components/inventory/inventory-ui';
import { getLogStats } from '@/components/inventory-audit/AuditOverview';
import { isAuditableProduct } from '@/components/inventory-audit/utils';
import { useBreakpoint } from '@/lib/useBreakpoint';

const ACCURACY_TARGET = 95;

interface AuditHistoryViewProps {
  products: Product[];
  sortedAuditLogs: AuditLog[];
  onBack: () => void;
  onSelectAudit: (auditId: string) => void;
}

type HistoryFilter = 'all' | 'full' | 'daily' | 'warehouse' | 'flagged';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function AuditHistoryView({ products, sortedAuditLogs, onBack, onSelectAudit }: AuditHistoryViewProps) {
  const palette = usePaymentsPalette();
  const { isMobile, width } = useBreakpoint();
  const isWide = Platform.OS === 'web' && width >= 1100;
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const variants = useMemo(() => products.filter(isAuditableProduct).flatMap((product) => product.variants), [products]);
  const totalSkus = variants.length;
  const priceByVariant = useMemo(() => new Map(variants.map((variant) => [variant.id, variant.sellingPrice || 0])), [variants]);

  const rows = useMemo(() => sortedAuditLogs.map((log) => {
    const stats = getLogStats(log, priceByVariant);
    const isWarehouse = log.scope === 'warehouse';
    const type = isWarehouse ? 'Warehouse' : totalSkus > 0 && stats.total >= totalSkus * 0.8 ? 'Full' : 'Daily';
    return { log, stats, type, isWarehouse };
  }), [sortedAuditLogs, priceByVariant, totalSkus]);

  const counts = useMemo(() => ({
    all: rows.length,
    full: rows.filter((row) => row.type === 'Full').length,
    daily: rows.filter((row) => row.type === 'Daily').length,
    warehouse: rows.filter((row) => row.isWarehouse).length,
    flagged: rows.filter((row) => row.stats.suspicious).length,
  }), [rows]);

  const visible = rows.filter((row) => {
    if (filter === 'full') return row.type === 'Full';
    if (filter === 'daily') return row.type === 'Daily';
    if (filter === 'warehouse') return row.isWarehouse;
    if (filter === 'flagged') return row.stats.suspicious;
    return true;
  });

  const productRows = rows.filter((row) => !row.isWarehouse);
  const avgAccuracy = productRows.length ? Math.round(productRows.reduce((sum, row) => sum + row.stats.accuracy, 0) / productRows.length) : null;
  const totalUnitsOff = productRows.filter((row) => !row.stats.suspicious).reduce((sum, row) => sum + row.stats.unitsOff, 0);
  const totalValueOff = productRows.filter((row) => !row.stats.suspicious).reduce((sum, row) => sum + row.stats.shortValue + row.stats.overValue, 0);

  const pills: { key: HistoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'full', label: 'Full' },
    { key: 'daily', label: 'Daily' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'flagged', label: 'Check count' },
  ];
  const card = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const th = { color: palette.faint, fontSize: 11.5, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const label = { color: palette.muted, fontSize: isMobile ? 10 : 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const summary = [
    { key: 'counts', label: 'Counts', value: String(rows.length), sub: rows[0] ? `Latest ${shortDate(rows[0].log.completedAt)}` : 'None yet' },
    { key: 'acc', label: 'Average accuracy', value: avgAccuracy === null ? '—' : `${avgAccuracy}%`, sub: `Target ${ACCURACY_TARGET}%` },
    { key: 'units', label: 'Units off', value: totalUnitsOff.toLocaleString('en-NG'), sub: counts.flagged ? `Excludes ${counts.flagged} flagged ${counts.flagged === 1 ? 'count' : 'counts'}` : 'Across all product counts' },
    { key: 'value', label: 'Value off', value: formatCompactNaira(totalValueOff), sub: 'At selling price' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ width: '100%', maxWidth: isWide ? 1456 : 760, alignSelf: isWide ? 'flex-start' : 'center', paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 10 : 32, paddingBottom: 60, gap: 18 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton onPress={onBack} palette={palette} label="Back to stock audit" />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: palette.text, fontSize: isMobile ? 26 : 30, fontWeight: '700', letterSpacing: -0.6 }}>Audit history</Text>
            <Text style={{ color: palette.faint, fontSize: isMobile ? 12 : 14 }}>Every completed count, newest first.</Text>
          </View>
        </View>

        <View style={{ ...card, borderRadius: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
          {summary.map((stat, index) => (
            <View
              key={stat.key}
              style={{
                width: isMobile ? '50%' : undefined,
                flex: isMobile ? undefined : 1,
                minWidth: 0,
                gap: 4,
                paddingVertical: isMobile ? 14 : 18,
                paddingHorizontal: isMobile ? 16 : 22,
                borderLeftWidth: (isMobile ? index % 2 === 1 : index > 0) ? 1 : 0,
                borderTopWidth: isMobile && index > 1 ? 1 : 0,
                borderColor: palette.hairline,
              }}
            >
              <Text style={label} numberOfLines={1}>{stat.label}</Text>
              <MoneyText style={{ color: palette.text, fontSize: isMobile ? 22 : 28, letterSpacing: -0.6 }} numberOfLines={1}>{stat.value}</MoneyText>
              <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 13 }} numberOfLines={1}>{stat.sub}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, ...(isMobile ? { marginRight: -16 } : {}) }} contentContainerStyle={{ gap: 8, paddingRight: isMobile ? 16 : 0 }}>
          {pills.filter((pill) => pill.key === 'all' || counts[pill.key] > 0).map((pill) => (
            <FilterPill key={pill.key} label={pill.label} count={counts[pill.key]} active={filter === pill.key} onPress={() => setFilter(pill.key)} palette={palette} />
          ))}
        </ScrollView>

        <View style={{ ...card, paddingHorizontal: isMobile ? 14 : 22, paddingVertical: 6 }}>
          {visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
              <History size={26} color={palette.faint} strokeWidth={1.8} />
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>{rows.length === 0 ? 'No audits yet' : 'Nothing here'}</Text>
              <Text style={{ color: palette.faint, fontSize: 13 }}>{rows.length === 0 ? 'Completed counts will appear here.' : 'Try another filter.'}</Text>
            </View>
          ) : (
            <>
              {!isMobile ? (
                <View style={{ flexDirection: 'row', gap: 14, paddingTop: 12, paddingBottom: 10 }}>
                  <Text style={[th, { width: 210 }]}>Date</Text>
                  <Text style={[th, { width: 150 }]}>Counted by</Text>
                  <Text style={[th, { width: 110 }]}>Type</Text>
                  <Text style={[th, { flex: 1, textAlign: 'right' }]}>SKUs</Text>
                  <Text style={[th, { width: 100, textAlign: 'right' }]}>Accuracy</Text>
                  <Text style={[th, { width: 110, textAlign: 'right' }]}>Units off</Text>
                  <Text style={[th, { width: 130, textAlign: 'right' }]}>Value off</Text>
                  <View style={{ width: 16 }} />
                </View>
              ) : null}
              {visible.map(({ log, stats, type, isWarehouse }, index) => {
                const accInk = stats.accuracy >= ACCURACY_TARGET ? palette.tones.verified.ink : stats.accuracy < 70 ? palette.danger : palette.textSoft;
                const valueOff = isWarehouse ? '—' : stats.suspicious ? 'Check count' : stats.unitsOff === 0 ? '—' : formatCompactNaira(stats.shortValue + stats.overValue);
                return isMobile ? (
                  <Pressable key={log.id} onPress={() => onSelectAudit(log.id)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, opacity: state.pressed ? 0.7 : 1 })}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{shortDate(log.completedAt)} · {type}</Text>
                      <Text style={{ color: palette.faint, fontSize: 10 }} numberOfLines={1}>{log.performedBy || 'Team'} · {stats.total} SKUs · {stats.unitsOff.toLocaleString('en-NG')} off</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ color: accInk, fontSize: 12, fontWeight: '600' }}>{stats.accuracy}%</Text>
                      <Text style={{ color: stats.suspicious ? palette.warn : palette.faint, fontSize: 10 }}>{valueOff}</Text>
                    </View>
                    <ChevronRight size={15} color={palette.faint} strokeWidth={2.2} />
                  </Pressable>
                ) : (
                  <Pressable key={log.id} onPress={() => onSelectAudit(log.id)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, height: 58, borderTopWidth: 1, borderTopColor: palette.hairline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
                    <View style={{ width: 210, gap: 2 }}>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{longDate(log.completedAt)}</Text>
                      <Text style={{ color: palette.faint, fontSize: 12.5 }}>{timeOf(log.completedAt)}</Text>
                    </View>
                    <Text style={{ width: 150, color: palette.textSoft, fontSize: 14 }} numberOfLines={1}>{log.performedBy || 'Team'}</Text>
                    <Text style={{ width: 110, color: palette.muted, fontSize: 14 }}>{type}</Text>
                    <Text style={{ flex: 1, textAlign: 'right', color: palette.textSoft, fontSize: 14 }}>{stats.total.toLocaleString('en-NG')}</Text>
                    <Text style={{ width: 100, textAlign: 'right', color: accInk, fontSize: 14, fontWeight: '600' }}>{stats.accuracy}%</Text>
                    <View style={{ width: 110, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                      {stats.suspicious ? <AlertTriangle size={15} color={palette.warn} strokeWidth={2.2} /> : null}
                      <Text style={{ color: stats.suspicious ? palette.warn : stats.unitsOff ? palette.textSoft : palette.faint, fontSize: 14 }}>{stats.unitsOff ? stats.unitsOff.toLocaleString('en-NG') : '—'}</Text>
                    </View>
                    <Text style={{ width: 130, textAlign: 'right', color: stats.suspicious ? palette.warn : palette.muted, fontSize: 14 }}>{valueOff}</Text>
                    <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
