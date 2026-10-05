import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { AlertTriangle, ClipboardCheck, Package } from 'lucide-react-native';
import type { AuditLog, Order, Product } from '@/lib/state/fyll-store';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette, BackButton } from '@/components/payments/payments-ui';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { formatCompactNaira, formatNaira } from '@/components/inventory/inventory-ui';
import { isAuditableProduct } from '@/components/inventory-audit/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_COUNT_SIZE = 12;
const ACCURACY_TARGET = 95;
const SECONDS_PER_SKU = 50;

type ReasonTone = 'danger' | 'warn' | 'muted';
type PickReason = { key: 'zero' | 'short' | 'over' | 'value' | 'stale' | 'seller'; text: string; tone: ReasonTone; score: number };

export type DailyPick = {
  variantId: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl?: string;
  reason: PickReason;
  lastCounted: string | null;
};

type AuditOverviewProps = {
  products: Product[];
  orders: Order[];
  logs: AuditLog[]; // newest first
  hasActiveAudit: boolean;
  countedItems: number;
  totalItems: number;
  onBack: () => void;
  onStartDaily: (variantIds: string[]) => void;
  onFullCount: () => void;
  onResume: () => void;
  onDiscard: () => void;
  onOpenLog: (logId: string) => void;
  onOpenHistory: () => void;
  onViewOrders: () => void;
};

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Stable per-day tie-break so the daily list rotates instead of repeating.
const dailyHash = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

export const getLogStats = (log: AuditLog, priceByVariant: Map<string, number>) => {
  let shortCount = 0;
  let overCount = 0;
  let shortValue = 0;
  let overValue = 0;
  let unitsOff = 0;
  let suspicious = false;
  log.items.forEach((item) => {
    const off = Math.abs(item.discrepancy);
    unitsOff += off;
    const price = priceByVariant.get(item.variantId) ?? 0;
    if (item.discrepancy < 0) {
      shortCount += 1;
      shortValue += off * price;
    } else if (item.discrepancy > 0) {
      overCount += 1;
      overValue += off * price;
    }
    if (off >= 100 && off >= Math.max(10, item.expectedStock * 10, item.actualStock * 10)) suspicious = true;
  });
  const total = log.items.length || log.itemsAudited || 0;
  const matched = Math.max(0, total - shortCount - overCount);
  const accuracy = total > 0 ? Math.round((matched / total) * 100) : 100;
  return { shortCount, overCount, shortValue, overValue, unitsOff, matched, total, accuracy, suspicious };
};

export function AuditOverview({
  products, orders, logs, hasActiveAudit, countedItems, totalItems,
  onBack, onStartDaily, onFullCount, onResume, onDiscard, onOpenLog, onOpenHistory, onViewOrders,
}: AuditOverviewProps) {
  const palette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const { isMobile, width } = useBreakpoint();
  const isWide = Platform.OS === 'web' && width >= 1100;
  const [dismissedReviews, setDismissedReviews] = useState<string[]>([]);
  const [showAllPicks, setShowAllPicks] = useState<boolean>(false);
  const fs = (size: number) => (isMobile && size < 16 ? (size >= 14 ? 14 : size >= 12 ? 12 : 10) : size);

  const productLogs = useMemo(() => logs.filter((log) => (log.scope ?? 'products') === 'products'), [logs]);
  const auditable = useMemo(() => products.filter(isAuditableProduct), [products]);
  const variantRows = useMemo(() => auditable.flatMap((product) => product.variants.map((variant) => ({
    product,
    variant,
    name: `${product.name}${Object.values(variant.variableValues ?? {}).join(' / ') ? ` · ${Object.values(variant.variableValues ?? {}).join(' / ')}` : ''}`,
  }))), [auditable]);
  const totalSkus = variantRows.length;
  const priceByVariant = useMemo(() => new Map(variantRows.map((row) => [row.variant.id, row.variant.sellingPrice || 0])), [variantRows]);

  const logStats = useMemo(() => productLogs.map((log) => ({ log, stats: getLogStats(log, priceByVariant) })), [productLogs, priceByVariant]);
  const latest = logStats[0] ?? null;
  const previous = logStats[1] ?? null;

  const lastCountedByVariant = useMemo(() => {
    const map = new Map<string, string>();
    [...productLogs].reverse().forEach((log) => log.items.forEach((item) => map.set(item.variantId, log.completedAt)));
    return map;
  }, [productLogs]);
  const recentDiscrepancies = useMemo(() => {
    const map = new Map<string, number[]>();
    productLogs.slice(0, 4).forEach((log) => log.items.forEach((item) => {
      const list = map.get(item.variantId) ?? [];
      list.push(item.discrepancy);
      map.set(item.variantId, list);
    }));
    return map;
  }, [productLogs]);

  // Ordered in the last 14 days but showing 0 in stock now.
  const orderedAtZero = useMemo(() => {
    const since = Date.now() - 14 * DAY_MS;
    const ordered = new Map<string, string>();
    orders.forEach((order) => {
      const at = new Date(order.orderDate || order.createdAt).getTime();
      const status = (order.status || '').toLowerCase();
      if (!Number.isFinite(at) || at < since || status.includes('cancel') || status.includes('refund')) return;
      order.items?.forEach((item) => {
        const previousAt = ordered.get(item.variantId);
        const iso = new Date(at).toISOString();
        if (!previousAt || previousAt < iso) ordered.set(item.variantId, iso);
      });
    });
    return variantRows.filter((row) => row.variant.stock <= 0 && ordered.has(row.variant.id))
      .map((row) => ({ ...row, orderedAt: ordered.get(row.variant.id) ?? '' }));
  }, [orders, variantRows]);

  const monthSales = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sold = new Map<string, number>();
    orders.forEach((order) => {
      const at = new Date(order.orderDate || order.createdAt).getTime();
      if (!Number.isFinite(at) || at < start || (order.status || '').toLowerCase().includes('cancel')) return;
      order.items?.forEach((item) => sold.set(item.variantId, (sold.get(item.variantId) ?? 0) + item.quantity));
    });
    return sold;
  }, [orders]);

  const dailyPicks = useMemo<DailyPick[]>(() => {
    if (totalSkus === 0) return [];
    const prices = variantRows.map((row) => row.variant.sellingPrice || 0).filter((price) => price > 0).sort((a, b) => b - a);
    const highValueCutoff = prices.length ? prices[Math.max(0, Math.floor(prices.length * 0.1) - 1)] : Infinity;
    const topSellers = new Set(Array.from(monthSales.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id));
    const zeroIds = new Set(orderedAtZero.map((row) => row.variant.id));
    const today = new Date().toDateString();
    return variantRows.map((row): { pick: DailyPick; score: number } | null => {
      const id = row.variant.id;
      const last = lastCountedByVariant.get(id) ?? null;
      const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY_MS) : null;
      const recent = recentDiscrepancies.get(id) ?? [];
      const reasons: PickReason[] = [];
      if (zeroIds.has(id)) {
        const at = orderedAtZero.find((entry) => entry.variant.id === id)?.orderedAt;
        reasons.push({ key: 'zero', text: `Ordered${at ? ` on ${shortDate(at)}` : ''} with 0 in stock`, tone: 'danger', score: 100 });
      }
      const shorts = recent.filter((value) => value < 0).length;
      if (recent[0] !== undefined && recent[0] < 0) {
        reasons.push({ key: 'short', text: shorts >= 2 ? `Short in the last ${shorts} counts` : `Short by ${Math.abs(recent[0])} last count`, tone: 'warn', score: 60 + shorts * 10 });
      } else if (recent[0] !== undefined && recent[0] > 0) {
        reasons.push({ key: 'over', text: `Over by ${recent[0]} last count`, tone: 'warn', score: 45 });
      }
      const price = row.variant.sellingPrice || 0;
      if (price > 0 && price >= highValueCutoff && row.variant.stock > 0) {
        reasons.push({ key: 'value', text: `High value · ${formatNaira(price)} each`, tone: 'muted', score: 30 });
      }
      if (topSellers.has(id)) reasons.push({ key: 'seller', text: 'Best seller this month', tone: 'muted', score: 28 });
      if (days === null || days >= 30) {
        reasons.push({ key: 'stale', text: days === null ? 'Never counted' : `Not counted in ${days} days`, tone: 'muted', score: 20 + Math.min(20, (days ?? 60) / 3) });
      }
      const top = reasons.sort((a, b) => b.score - a.score)[0];
      if (!top) return null;
      return {
        pick: { variantId: id, productId: row.product.id, name: row.name, sku: row.variant.sku?.toUpperCase() || '—', imageUrl: row.variant.imageUrl ?? row.product.imageUrl, reason: top, lastCounted: last },
        score: top.score + (dailyHash(`${today}:${id}`) % 10) / 10,
      };
    })
      .filter((entry): entry is { pick: DailyPick; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, DAILY_COUNT_SIZE)
      .map((entry) => entry.pick);
  }, [variantRows, totalSkus, monthSales, orderedAtZero, lastCountedByVariant, recentDiscrepancies]);

  const pickWhy = useMemo(() => {
    const labels: Record<PickReason['key'], string> = { zero: 'ordered at 0 stock', short: 'short last time', over: 'over last time', value: 'high value', seller: 'best sellers', stale: 'not counted in 30+ days' };
    const counts = new Map<PickReason['key'], number>();
    dailyPicks.forEach((pick) => counts.set(pick.reason.key, (counts.get(pick.reason.key) ?? 0) + 1));
    return Array.from(counts.entries()).map(([key, n]) => ({ key, n, label: labels[key] }));
  }, [dailyPicks]);

  const counted30 = useMemo(() => {
    const since = Date.now() - 30 * DAY_MS;
    const ids = new Set<string>();
    productLogs.forEach((log) => {
      if (new Date(log.completedAt).getTime() >= since) log.items.forEach((item) => ids.add(item.variantId));
    });
    return variantRows.filter((row) => ids.has(row.variant.id)).length;
  }, [productLogs, variantRows]);

  const reviews = useMemo(() => {
    const items: { id: string; title: string; body: string; primary: { label: string; onPress: () => void }; secondary: { label: string; onPress: () => void } }[] = [];
    const odd = logStats.find((entry) => entry.stats.suspicious);
    if (odd) {
      const worst = [...odd.log.items].sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy))[0];
      items.push({
        id: `odd-${odd.log.id}`,
        title: `${shortDate(odd.log.completedAt)} count looks wrong`,
        body: worst
          ? `${odd.stats.unitsOff.toLocaleString('en-NG')} units off in one count. ${worst.productName}${worst.variantName ? ` ${worst.variantName}` : ''} went from ${worst.expectedStock} to ${worst.actualStock.toLocaleString('en-NG')}: likely a typo. Stock was updated to that count, so recount it.`
          : 'One count is far off what was expected. Recount to be sure.',
        primary: { label: 'Recount', onPress: () => onStartDaily(odd.log.items.filter((item) => Math.abs(item.discrepancy) >= 100).map((item) => item.variantId)) },
        secondary: { label: 'Open count', onPress: () => onOpenLog(odd.log.id) },
      });
    }
    if (orderedAtZero.length > 0) {
      const names = orderedAtZero.slice(0, 3).map((row) => row.name.replace(' · ', ' '));
      items.push({
        id: 'zero',
        title: `${orderedAtZero.length} ${orderedAtZero.length === 1 ? 'item was' : 'items were'} ordered at 0 stock`,
        body: `${names.join(', ')}${orderedAtZero.length > 3 ? ` and ${orderedAtZero.length - 3} more` : ''} ${orderedAtZero.length === 1 ? 'shows' : 'show'} none in Fyll but had orders in the last 14 days. Either the count is wrong or the order can't be filled.`,
        primary: { label: 'Count these', onPress: () => onStartDaily(orderedAtZero.map((row) => row.variant.id)) },
        secondary: { label: 'View orders', onPress: onViewOrders },
      });
    }
    const byDay = new Map<string, typeof logStats>();
    logStats.forEach((entry) => {
      const key = `${dayKey(entry.log.completedAt)}:${entry.log.itemsAudited}:${entry.log.discrepancies}`;
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    });
    const dup = Array.from(byDay.values()).find((group) => group.length > 1);
    if (dup) {
      items.push({
        id: `dup-${dup[0].log.id}`,
        title: 'Same day counted twice',
        body: `${shortDate(dup[0].log.completedAt)} has ${dup.length} identical counts (${dup[0].stats.total} SKUs, ${dup[0].stats.accuracy}%). They're both in the trend below, so it may be skewed.`,
        primary: { label: 'Open count', onPress: () => onOpenLog(dup[1].log.id) },
        secondary: { label: 'Dismiss', onPress: () => setDismissedReviews((prev) => [...prev, `dup-${dup[0].log.id}`]) },
      });
    }
    return items.filter((item) => !dismissedReviews.includes(item.id));
  }, [logStats, orderedAtZero, dismissedReviews, onStartDaily, onOpenLog, onViewOrders]);

  const trend = logStats.slice(0, 5).reverse();
  const toneInk = (tone: ReasonTone) => (tone === 'danger' ? palette.danger : tone === 'warn' ? palette.warn : palette.muted);
  const card = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const label = { color: palette.muted, fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const h2 = { color: palette.text, fontSize: 16, fontWeight: '600' as const };
  const th = { color: palette.faint, fontSize: 11.5, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const minutes = Math.max(1, Math.round((dailyPicks.length * SECONDS_PER_SKU) / 60));
  const visiblePicks = showAllPicks || !isWide ? dailyPicks : dailyPicks.slice(0, 6);

  const ghost = (text: string, onPress: () => void, extra: object = {}) => (
    <Pressable onPress={onPress} style={(state) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) ? palette.softFill : 'transparent', opacity: state.pressed ? 0.75 : 1, ...extra })}>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
  const lime = (text: string, onPress: () => void, disabled = false, icon = false) => (
    <Pressable onPress={onPress} disabled={disabled} style={(state) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME, opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1 })}>
      {icon ? <ClipboardCheck size={15} color={FYLL_LIME_INK} strokeWidth={2.2} /> : null}
      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );

  const startToday = () => onStartDaily(dailyPicks.map((pick) => pick.variantId));
  const accuracyDelta = latest && previous ? latest.stats.accuracy - previous.stats.accuracy : null;
  const stats = [
    {
      key: 'acc',
      label: 'Accuracy',
      value: latest ? `${latest.stats.accuracy}%` : '—',
      sub: !latest ? 'No counts yet' : accuracyDelta === null ? `Last count ${shortDate(latest.log.completedAt)}` : accuracyDelta === 0 ? `Same as ${shortDate(previous!.log.completedAt)}` : `${accuracyDelta < 0 ? 'Down' : 'Up'} from ${previous!.stats.accuracy}% on ${shortDate(previous!.log.completedAt)}`,
      dot: latest && latest.stats.accuracy >= ACCURACY_TARGET ? palette.tones.verified.dot : palette.warn,
    },
    {
      key: 'value',
      label: 'Value off',
      value: latest ? (latest.stats.suspicious ? 'Check count' : formatCompactNaira(latest.stats.shortValue + latest.stats.overValue)) : '—',
      sub: latest ? `${latest.stats.unitsOff.toLocaleString('en-NG')} units across ${latest.stats.shortCount + latest.stats.overCount} SKUs` : 'At selling price',
      dot: palette.danger,
    },
    { key: 'cov', label: 'Counted in 30 days', value: `${counted30} / ${totalSkus}`, sub: totalSkus - counted30 > 0 ? `${totalSkus - counted30} SKUs not counted yet` : 'Every SKU counted', dot: palette.faint },
    { key: 'zero', label: 'Ordered at 0 stock', value: String(orderedAtZero.length), sub: 'Last 14 days, Fyll shows none', dot: orderedAtZero.length ? palette.danger : palette.faint },
  ];

  const header = (
    <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 14, paddingBottom: isMobile ? 0 : 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {isMobile ? (
          <BackButton onPress={onBack} palette={palette} label="Back to inventory" />
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: palette.text, fontSize: isMobile ? 26 : 30, fontWeight: '700', letterSpacing: -0.6 }}>Stock audit</Text>
          <Text style={{ color: palette.faint, fontSize: fs(14) }}>
            {totalSkus} SKUs{latest ? ` · last count ${shortDate(latest.log.completedAt)}${latest.log.performedBy ? ` by ${latest.log.performedBy}` : ''}` : ' · no counts yet'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {ghost('History', onOpenHistory, isMobile ? { flex: 1 } : {})}
        {ghost('Full count', onFullCount, isMobile ? { flex: 1 } : {})}
        {!isMobile ? lime("Start today's count", startToday, dailyPicks.length === 0 || hasActiveAudit, true) : null}
      </View>
    </View>
  );

  const resumeCard = hasActiveAudit ? (
    <View style={{ ...card, padding: 16, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12, borderColor: palette.nudgeBorder, backgroundColor: palette.nudgeBg }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>Count in progress</Text>
        <Text style={{ color: palette.nudgeSub, fontSize: fs(13) }}>{countedItems} of {totalItems} SKUs counted. Pick up where you left off.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ghost('Discard', onDiscard, isMobile ? { flex: 1 } : {})}
        <View style={isMobile ? { flex: 1 } : undefined}>{lime('Resume count', onResume)}</View>
      </View>
    </View>
  ) : null;

  const summary = (
    <View style={{ ...card, borderRadius: 20, flexDirection: isMobile ? 'row' : 'row', flexWrap: 'wrap' }}>
      {stats.map((stat, index) => (
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stat.dot }} />
            <Text style={[label, { fontSize: fs(12), flexShrink: 1 }]} numberOfLines={1}>{stat.label}</Text>
          </View>
          <MoneyText style={{ color: palette.text, fontSize: isMobile ? 22 : 28, letterSpacing: -0.6 }} numberOfLines={1}>{stat.value}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: fs(13) }} numberOfLines={2}>{stat.sub}</Text>
        </View>
      ))}
    </View>
  );

  const todayCard = (
    <View style={{ ...card, flexGrow: isWide ? 1 : 0, paddingVertical: 20, paddingHorizontal: isMobile ? 16 : 22, borderColor: palette.nudgeBorder, overflow: 'hidden' }}>
      <LinearGradient pointerEvents="none" colors={[palette.nudgeBg, 'rgba(213,224,87,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 180 }} />
      <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 14 : 20 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[label, { color: palette.limeOnSurface, fontSize: fs(12) }]}>Today's count</Text>
          <Text style={{ color: palette.text, fontSize: isMobile ? 20 : 22, fontWeight: '700', letterSpacing: -0.4 }}>
            {dailyPicks.length > 0 ? `${dailyPicks.length} SKUs · about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : 'Nothing to count'}
          </Text>
          <Text style={{ color: palette.muted, fontSize: fs(13.5), lineHeight: 20 }}>
            Picked by risk, so you count a little every day instead of everything once a month.
          </Text>
        </View>
        {lime('Start counting', startToday, dailyPicks.length === 0 || hasActiveAudit)}
      </View>
      {pickWhy.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 16, paddingBottom: 6 }}>
          {pickWhy.map((why) => (
            <View key={why.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: palette.softFill }}>
              <Text style={{ color: palette.text, fontSize: fs(12.5), fontWeight: '600' }}>{why.n}</Text>
              <Text style={{ color: palette.textSoft, fontSize: fs(12.5) }}>{why.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {visiblePicks.map((pick) => (
          <View key={pick.variantId} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <View style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', backgroundColor: pick.imageUrl ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
              {pick.imageUrl ? <ResolvedAttachmentImage imageUrl={pick.imageUrl} style={{ width: 40, height: 40 }} resizeMode="cover" /> : <Package size={17} color={palette.faint} strokeWidth={1.6} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: isMobile ? 12 : 14.5, fontWeight: '500' }} numberOfLines={1}>{pick.name}</Text>
              <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12.5 }} numberOfLines={1}>{pick.sku}{isMobile ? '' : ''}</Text>
              {isMobile ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneInk(pick.reason.tone) }} />
                  <Text style={{ color: toneInk(pick.reason.tone), fontSize: 10 }} numberOfLines={1}>{pick.reason.text}</Text>
                </View>
              ) : null}
            </View>
            {!isMobile ? (
              <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneInk(pick.reason.tone) }} />
                <Text style={{ color: toneInk(pick.reason.tone), fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{pick.reason.text}</Text>
              </View>
            ) : null}
            <Text style={{ width: isMobile ? undefined : 70, textAlign: 'right', color: palette.faint, fontSize: fs(12.5) }}>{pick.lastCounted ? shortDate(pick.lastCounted) : 'Never'}</Text>
          </View>
        ))}
        {dailyPicks.length > visiblePicks.length ? (
          <Pressable onPress={() => setShowAllPicks(true)} style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <Text style={{ color: palette.faint, fontSize: fs(13) }}>+ {dailyPicks.length - visiblePicks.length} more · rotates daily so every SKU gets counted</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const maxBar = 140;
  const accuracyCard = (
    <View style={{ ...card, paddingTop: 18, paddingBottom: 16, paddingHorizontal: isMobile ? 16 : 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <Text style={h2}>Accuracy</Text>
        <Text style={{ color: palette.faint, fontSize: fs(13) }} numberOfLines={1}>Share of SKUs that matched exactly</Text>
      </View>
      {trend.length === 0 ? (
        <Text style={{ color: palette.faint, fontSize: fs(13.5), paddingTop: 16 }}>Your accuracy trend appears after the first count.</Text>
      ) : (
        <View style={{ height: 190, marginTop: 18, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'flex-end', gap: isMobile ? 12 : 22 }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 26 + (ACCURACY_TARGET / 100) * maxBar, borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.outline }} />
          <Text style={{ position: 'absolute', right: 0, bottom: 30 + (ACCURACY_TARGET / 100) * maxBar, color: palette.muted, fontSize: fs(11.5) }}>Target {ACCURACY_TARGET}%</Text>
          {trend.map((entry, index) => {
            const value = entry.stats.accuracy;
            const isLast = index === trend.length - 1;
            const fill = isLast ? palette.text : value >= ACCURACY_TARGET ? palette.tones.verified.dot : value < 70 ? palette.dangerBorder : palette.isDark ? '#3A3B35' : '#DADAD2';
            const ink = value >= ACCURACY_TARGET ? palette.tones.verified.ink : value < 70 ? palette.danger : palette.textSoft;
            return (
              <Pressable key={entry.log.id} onPress={() => onOpenLog(entry.log.id)} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Text style={{ color: ink, fontSize: fs(12.5), fontWeight: '600' }}>{value}%</Text>
                <View style={{ width: '100%', height: Math.max(4, (value / 100) * maxBar), borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: fill }} />
                <Text style={{ color: palette.faint, fontSize: fs(12), height: 14 }} numberOfLines={1}>{shortDate(entry.log.completedAt)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const reviewCard = reviews.length > 0 ? (
    <View style={{ ...card, paddingVertical: 18, paddingHorizontal: isMobile ? 16 : 20, gap: 12, borderColor: palette.warnBorder }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={h2}>Needs your review</Text>
        <Text style={{ color: palette.warn, fontSize: fs(13), fontWeight: '600' }}>{reviews.length}</Text>
      </View>
      {reviews.map((review) => (
        <View key={review.id} style={{ flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <AlertTriangle size={15} color={palette.warn} strokeWidth={2.2} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{review.title}</Text>
            <Text style={{ color: palette.muted, fontSize: fs(12.5), lineHeight: 18 }}>{review.body}</Text>
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6 }}>
              <Pressable onPress={review.primary.onPress} style={(state) => ({ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.inverseBg, opacity: state.pressed ? 0.8 : 1 })}>
                <Text style={{ color: palette.inverseText, fontSize: fs(13), fontWeight: '600' }}>{review.primary.label}</Text>
              </Pressable>
              <Pressable onPress={review.secondary.onPress} style={(state) => ({ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Text style={{ color: palette.textSoft, fontSize: fs(13), fontWeight: '600' }}>{review.secondary.label}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </View>
  ) : null;

  const lastCountCard = latest ? (
    <View style={{ ...card, paddingVertical: 18, paddingHorizontal: isMobile ? 16 : 20, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={h2}>Last count · {shortDate(latest.log.completedAt)}</Text>
        <Text style={{ color: palette.faint, fontSize: fs(13) }}>{latest.stats.total} SKUs</Text>
      </View>
      {[
        { key: 'short', label: 'Short: fewer on shelf', n: latest.stats.shortCount, money: latest.stats.shortValue ? `−${formatNaira(latest.stats.shortValue)}` : '', color: palette.danger },
        { key: 'over', label: 'Over: more on shelf', n: latest.stats.overCount, money: latest.stats.overValue ? `+${formatNaira(latest.stats.overValue)}` : '', color: palette.warn },
        { key: 'match', label: 'Matched exactly', n: latest.stats.matched, money: '', color: palette.tones.verified.dot },
      ].map((row) => (
        <View key={row.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.color }} />
            <Text style={{ color: palette.text, fontSize: fs(14) }}>{row.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {row.money ? <Text style={{ color: palette.faint, fontSize: fs(14) }}>{latest.stats.suspicious ? 'Check count' : row.money}</Text> : null}
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600', minWidth: 28, textAlign: 'right' }}>{row.n}</Text>
          </View>
        </View>
      ))}
      {ghost('View variance report', () => onOpenLog(latest.log.id), { marginTop: 4 })}
    </View>
  ) : null;

  const pastCard = (
    <View style={{ ...card, paddingTop: 6, paddingBottom: 6, paddingHorizontal: isMobile ? 16 : 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 10 }}>
        <Text style={h2}>Past counts</Text>
        {logStats.length > 8 ? (
          <Pressable onPress={onOpenHistory}><Text style={{ color: palette.muted, fontSize: fs(13), fontWeight: '600' }}>View all</Text></Pressable>
        ) : null}
      </View>
      {logStats.length === 0 ? (
        <Text style={{ color: palette.faint, fontSize: fs(13.5), paddingVertical: 14 }}>No counts yet. Start today's count to begin.</Text>
      ) : (
        <>
          {!isMobile ? (
            <View style={{ flexDirection: 'row', gap: 14, paddingTop: 6, paddingBottom: 10 }}>
              <Text style={[th, { width: 150 }]}>Date</Text>
              <Text style={[th, { width: 140 }]}>Counted by</Text>
              <Text style={[th, { width: 110 }]}>Type</Text>
              <Text style={[th, { flex: 1, textAlign: 'right' }]}>SKUs</Text>
              <Text style={[th, { width: 110, textAlign: 'right' }]}>Accuracy</Text>
              <Text style={[th, { width: 120, textAlign: 'right' }]}>Units off</Text>
              <Text style={[th, { width: 140, textAlign: 'right' }]}>Value off</Text>
            </View>
          ) : null}
          {logStats.slice(0, 8).map(({ log, stats: s }) => {
            const type = totalSkus > 0 && s.total >= totalSkus * 0.8 ? 'Full' : 'Daily';
            const accInk = s.accuracy >= ACCURACY_TARGET ? palette.tones.verified.ink : s.accuracy < 70 ? palette.danger : palette.textSoft;
            const valueOff = s.suspicious ? 'Check count' : s.unitsOff === 0 ? '—' : formatCompactNaira(s.shortValue + s.overValue);
            return isMobile ? (
              <Pressable key={log.id} onPress={() => onOpenLog(log.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{shortDate(log.completedAt)} · {type}</Text>
                  <Text style={{ color: palette.faint, fontSize: 10 }} numberOfLines={1}>{log.performedBy || 'Team'} · {s.total} SKUs · {s.unitsOff.toLocaleString('en-NG')} off</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ color: accInk, fontSize: 12, fontWeight: '600' }}>{s.accuracy}%</Text>
                  <Text style={{ color: s.suspicious ? palette.warn : palette.faint, fontSize: 10 }}>{valueOff}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable key={log.id} onPress={() => onOpenLog(log.id)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, height: 50, borderTopWidth: 1, borderTopColor: palette.hairline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
                <Text style={{ width: 150, color: palette.text, fontSize: 14, fontWeight: '600' }}>{shortDate(log.completedAt)}</Text>
                <Text style={{ width: 140, color: palette.textSoft, fontSize: 14 }} numberOfLines={1}>{log.performedBy || 'Team'}</Text>
                <Text style={{ width: 110, color: palette.muted, fontSize: 14 }}>{type}</Text>
                <Text style={{ flex: 1, textAlign: 'right', color: palette.textSoft, fontSize: 14 }}>{s.total.toLocaleString('en-NG')}</Text>
                <Text style={{ width: 110, textAlign: 'right', color: accInk, fontSize: 14, fontWeight: '600' }}>{s.accuracy}%</Text>
                <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                  {s.suspicious ? <AlertTriangle size={15} color={palette.warn} strokeWidth={2.2} /> : null}
                  <Text style={{ color: s.suspicious ? palette.warn : s.unitsOff ? palette.textSoft : palette.faint, fontSize: 14 }}>{s.unitsOff ? s.unitsOff.toLocaleString('en-NG') : '—'}</Text>
                </View>
                <Text style={{ width: 140, textAlign: 'right', color: palette.muted, fontSize: 14 }}>{valueOff}</Text>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ width: '100%', maxWidth: isWide ? 1456 : 760, alignSelf: isWide ? 'flex-start' : 'center', paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 10 : 36, paddingBottom: isMobile ? 32 + tabBarHeight : 60, gap: 18 }}
      >
        {header}
        {resumeCard}
        {summary}
        {isWide ? (
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'stretch' }}>
            <View style={{ flex: 1, minWidth: 0, gap: 18 }}>
              {todayCard}
            </View>
            <View style={{ width: 440, gap: 18, alignSelf: 'flex-start' }}>
              {reviewCard}
              {lastCountCard}
            </View>
          </View>
        ) : null}
        {isWide ? accuracyCard : null}
        {isWide ? null : (
          <>
            {todayCard}
            {reviewCard}
            {lastCountCard}
            {accuracyCard}
          </>
        )}
        {pastCard}
      </ScrollView>
    </View>
  );
}
