import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import * as Haptics from 'expo-haptics';
import { Check, ClipboardList, Minus, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react-native';
import useFyllStore, { type Product, type ProductVariant } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { usePageHeadingStyle } from '@/lib/page-heading';
import { useThemeColors } from '@/lib/theme';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette, type PaymentsPalette } from '@/components/payments/payments-ui';
import {
  RESTOCK_STATUS_LABELS,
  isRestockRequestOpen,
  sortRestockRequests,
  totalRequestedQuantity,
  uniqueRequesters,
  useRestockRequestActions,
  useRestockRequests,
  type RestockRequest,
  type RestockRequestStatus,
} from '@/lib/restock-requests';

type Filter = 'open' | 'ordered' | 'done';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'To buy' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'done', label: 'Done' },
];

type PickedItem = { productId?: string; variantId?: string; itemName: string; variantLabel?: string };
// Lime button labels: Bricolage SemiBold, 14px.
function ButtonText({ style, children }: { style?: { color: string }; children: React.ReactNode }) {
  const [loaded] = useFonts({ BricolageGrotesque_600SemiBold });
  return (
    <Text style={[{ fontSize: 14, fontWeight: '600' }, style, loaded ? { fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' } : null]}>{children}</Text>
  );
}

type Pick = { key: string; item: PickedItem; quantity: number };
const pickKey = (item: PickedItem) => (item.productId ? `${item.productId}:${item.variantId ?? ''}` : `new:${item.itemName.trim().toLowerCase()}`);

const variantLabelOf = (variant: ProductVariant) => Object.values(variant.variableValues ?? {}).filter(Boolean).join(' / ');

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function statusTone(status: RestockRequestStatus, palette: PaymentsPalette) {
  if (status === 'requested') return palette.tones.awaiting;
  if (status === 'ordered') return palette.tones.review;
  if (status === 'received') return palette.tones.verified;
  return palette.tones.closed;
}

export default function RestockRequestsScreen() {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const tableHeaderColor = useThemeColors().text.muted;
  const insets = useSafeAreaInsets();
  const { isMobile } = useBreakpoint();
  const pageHeadingStyle = usePageHeadingStyle(isMobile);
  const params = useLocalSearchParams<{ productId?: string; variantId?: string }>();

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const userName = useAuthStore((s) => s.currentUser?.name ?? '');
  const userRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const canManage = userRole === 'admin' || userRole === 'manager';
  const products = useFyllStore((s) => s.products);

  const requestsQuery = useRestockRequests(businessId);
  const { addAsks, setStatus, remove } = useRestockRequestActions(businessId);

  const [filter, setFilter] = useState<Filter>('open');
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [preset, setPreset] = useState<PickedItem | null>(null);
  const [declining, setDeclining] = useState<RestockRequest | null>(null);
  const [toast, setToast] = useState<string>('');

  const fs = (size: number) => (isMobile && size < 16 ? (size >= 13 ? 12 : 10) : size);

  // Opened from a product page: start the request with that item filled in.
  useEffect(() => {
    if (!params.productId) return;
    const product = products.find((p) => p.id === params.productId);
    if (!product) return;
    const variant = params.variantId ? product.variants.find((v) => v.id === params.variantId) : undefined;
    setPreset({ productId: product.id, variantId: variant?.id, itemName: product.name, variantLabel: variant ? variantLabelOf(variant) : undefined });
    setSheetOpen(true);
    router.setParams({ productId: undefined, variantId: undefined } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.productId, params.variantId, products.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const stockOf = (request: RestockRequest): { stock: number; low: boolean } | null => {
    if (!request.productId) return null;
    const product = products.find((p) => p.id === request.productId);
    if (!product) return null;
    const stock = request.variantId
      ? product.variants.find((v) => v.id === request.variantId)?.stock ?? 0
      : product.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
    return { stock, low: stock <= (product.lowStockThreshold ?? 0) };
  };

  const all = useMemo(() => sortRestockRequests(requestsQuery.data ?? []), [requestsQuery.data]);
  const counts = useMemo(() => ({
    open: all.filter((r) => r.status === 'requested').length,
    ordered: all.filter((r) => r.status === 'ordered').length,
    done: all.filter((r) => !isRestockRequestOpen(r)).length,
  }), [all]);
  const visible = useMemo(() => all.filter((r) => (
    filter === 'open' ? r.status === 'requested' : filter === 'ordered' ? r.status === 'ordered' : !isRestockRequestOpen(r)
  )), [all, filter]);

  // Summary card, same look as the Products stats card.
  const stats = useMemo(() => {
    const toBuy = all.filter((r) => r.status === 'requested');
    const open = all.filter(isRestockRequestOpen);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return {
      toBuy: toBuy.length,
      asks: toBuy.reduce((sum, r) => sum + r.asks.length, 0),
      people: new Set(toBuy.flatMap((r) => uniqueRequesters(r))).size,
      ordered: all.filter((r) => r.status === 'ordered').length,
      outOfStock: open.filter((r) => { const st = stockOf(r); return st ? st.stock <= 0 : false; }).length,
      notStocked: open.filter((r) => !r.productId).length,
      receivedThisMonth: all.filter((r) => r.status === 'received' && (r.statusChangedAt ?? '') >= monthStart.toISOString()).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, products]);

  const renderStats = () => {
    const tiles: { key: string; label: string; value: number; sub: string; dot?: string; filter?: Filter }[] = [
      { key: 'tobuy', label: 'To buy', value: stats.toBuy, sub: stats.toBuy ? `${stats.asks} asks from ${stats.people} ${stats.people === 1 ? 'teammate' : 'teammates'}` : 'Nothing waiting', filter: 'open' },
      { key: 'ordered', label: 'Ordered', value: stats.ordered, sub: 'Waiting to arrive', dot: palette.tones.review.dot, filter: 'ordered' },
      { key: 'out', label: 'Out of stock', value: stats.outOfStock, sub: 'Requested and at zero', dot: palette.danger },
      { key: 'new', label: 'Not stocked yet', value: stats.notStocked, sub: 'New items asked for', dot: palette.tones.verified.dot },
      { key: 'received', label: 'Received', value: stats.receivedThisMonth, sub: 'This month', dot: palette.tones.closed.dot, filter: 'done' },
    ];
    if (!isMobile) {
      return (
        <View style={{ flexDirection: 'row', borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, marginBottom: 18 }}>
          {tiles.map((tile, index) => {
            const tileStyle = { flex: index === 0 ? 1.3 : 1, minWidth: 0, gap: 4, paddingVertical: 18, paddingHorizontal: 22, borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: palette.hairline, justifyContent: 'center' as const };
            const content = (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {tile.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} /> : null}
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }} numberOfLines={1}>{tile.label}</Text>
                </View>
                {index === 0 ? (
                  <MoneyText style={{ color: palette.text, fontSize: 28, letterSpacing: -0.5 }}>{tile.value}</MoneyText>
                ) : (
                  <Text style={{ color: palette.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                )}
                <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{tile.sub}</Text>
              </>
            );
            const target = tile.filter;
            return target ? (
              <Pressable key={tile.key} onPress={() => setFilter(target)} style={(state) => ({ ...tileStyle, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>{content}</Pressable>
            ) : (
              <View key={tile.key} style={tileStyle}>{content}</View>
            );
          })}
        </View>
      );
    }
    const [hero, ...rest] = tiles;
    return (
      <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14, marginBottom: 14 }}>
        <Pressable onPress={() => setFilter('open')} style={{ gap: 4 }}>
          <Text maxFontSizeMultiplier={1} style={{ color: palette.muted, fontSize: 10, lineHeight: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{hero.label}</Text>
          <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -0.8 }}>{hero.value}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 12 }}>{hero.sub}</Text>
        </Pressable>
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {rest.slice(0, 3).map((tile) => (
            <Pressable key={tile.key} onPress={() => tile.filter && setFilter(tile.filter)} style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} />
                <Text maxFontSizeMultiplier={1} style={{ color: palette.muted, fontSize: 10, lineHeight: 12 }} numberOfLines={1}>{tile.label}</Text>
              </View>
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const changeStatus = (request: RestockRequest, status: RestockRequestStatus, note?: string) => {
    haptic();
    setStatus.mutate(
      { request, status, by: userName, note },
      {
        onSuccess: () => setToast(`${request.itemName} marked ${RESTOCK_STATUS_LABELS[status].toLowerCase()}`),
        onError: () => setToast('Could not update. Try again.'),
      },
    );
  };

  const askAgain = (request: RestockRequest) => {
    haptic();
    addAsks.mutate(
      [{ productId: request.productId, variantId: request.variantId, itemName: request.itemName, variantLabel: request.variantLabel, by: userName }],
      { onSuccess: () => setToast('Added your request'), onError: () => setToast('Could not add. Try again.') },
    );
  };

  // Managers can remove anything; teammates can remove a request only they asked for.
  const canRemove = (request: RestockRequest) => canManage || uniqueRequesters(request).every((name) => name === userName);

  const openNew = () => { haptic(); setPreset(null); setSheetOpen(true); };

  const ghostPill = { height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };

  const renderActions = (request: RestockRequest, compact = false) => {
    const pill = compact ? { ...ghostPill, height: 30, paddingHorizontal: 11 } : ghostPill;
    const font = compact ? 12.5 : fs(13);
    return (
      <>
            {request.status === 'requested' ? (
              <Pressable onPress={() => changeStatus(request, 'ordered')} style={(state) => ({ ...pill, borderColor: FYLL_LIME, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}>
                <Text style={{ color: FYLL_LIME_INK, fontSize: font, fontWeight: '600' }}>Mark ordered</Text>
              </Pressable>
            ) : null}
            {request.status === 'ordered' ? (
              <Pressable onPress={() => changeStatus(request, 'received')} style={(state) => ({ ...pill, borderColor: FYLL_LIME, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}>
                <Check size={14} color={FYLL_LIME_INK} strokeWidth={2.4} />
                <Text style={{ color: FYLL_LIME_INK, fontSize: font, fontWeight: '600' }}>Mark received</Text>
              </Pressable>
            ) : null}
            {isRestockRequestOpen(request) ? (
              <Pressable onPress={() => askAgain(request)} style={(state) => ({ ...pill, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Plus size={14} color={palette.text} strokeWidth={2.2} />
                <Text style={{ color: palette.text, fontSize: font, fontWeight: '600' }}>Me too</Text>
              </Pressable>
            ) : null}
            {isRestockRequestOpen(request) && canManage ? (
              <Pressable onPress={() => setDeclining(request)} style={(state) => ({ ...pill, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Text style={{ color: palette.muted, fontSize: font, fontWeight: '600' }}>Decline</Text>
              </Pressable>
            ) : null}
            {request.status === 'ordered' ? (
              <Pressable onPress={() => changeStatus(request, 'requested')} style={(state) => ({ ...pill, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Text style={{ color: palette.muted, fontSize: font, fontWeight: '600' }}>Undo</Text>
              </Pressable>
            ) : null}
            {!isRestockRequestOpen(request) ? (
              <Pressable onPress={() => changeStatus(request, 'requested')} style={(state) => ({ ...pill, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Text style={{ color: palette.text, fontSize: font, fontWeight: '600' }}>Reopen</Text>
              </Pressable>
            ) : null}
            {canRemove(request) ? (
              <Pressable accessibilityLabel="Remove from list" onPress={() => { haptic(); remove.mutate(request, { onSuccess: () => setToast(`${request.itemName} removed`) }); }} style={(state) => ({ ...pill, paddingHorizontal: 10, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                <Trash2 size={14} color={palette.faint} strokeWidth={2} />
              </Pressable>
            ) : null}
      </>
    );
  };

  // Table styled to match the Payments table: flex columns, 12px text, dot statuses, one lime action + a ⋮ menu.
  const COL = {
    item: { flex: 1.8, minWidth: 220 },
    asked: { flex: 0.6, minWidth: 80 },
    by: { flex: 1.2, minWidth: 140 },
    qty: { flex: 0.6, minWidth: 80, marginRight: 24 },
    stock: { flex: 0.9, minWidth: 110 },
    status: { flex: 0.9, minWidth: 110 },
    when: { flex: 0.7, minWidth: 90 },
    actions: { flex: 1.3, minWidth: 210 },
  } as const;
  const dotText = (text: string, dot: string, ink: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text style={{ color: ink, fontSize: 12 }} numberOfLines={1}>{text}</Text>
    </View>
  );
  const primaryAction = (request: RestockRequest): { label: string; status: RestockRequestStatus } | null => {
    if (request.status === 'requested') return { label: 'Ordered', status: 'ordered' };
    if (request.status === 'ordered') return { label: 'Received', status: 'received' };
    return null;
  };
  const menuItems = (request: RestockRequest) => [
    ...(isRestockRequestOpen(request) ? [{ key: 'metoo', label: 'Me too, I want this', onPress: () => askAgain(request) }] : []),
    ...(request.status === 'ordered' ? [{ key: 'undo', label: 'Move back to requested', onPress: () => changeStatus(request, 'requested') }] : []),
    ...(!isRestockRequestOpen(request) ? [{ key: 'reopen', label: 'Reopen', onPress: () => changeStatus(request, 'requested') }] : []),
    ...(canRemove(request) ? [{ key: 'remove', label: 'Remove from list', danger: true, onPress: () => { haptic(); remove.mutate(request, { onSuccess: () => setToast(`${request.itemName} removed`) }); } }] : []),
  ];
  const headers: [keyof typeof COL, string][] = [
    ['item', 'Item'], ['asked', 'Asked'], ['by', 'Requested by'], ['qty', 'Wanted'],
    ['stock', 'Stock'], ['status', 'Status'], ['when', 'Last asked'], ['actions', ''],
  ];

  const renderTable = () => (
    <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        {headers.map(([key, title]) => (
          <Text key={key} style={{ ...COL[key], color: tableHeaderColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingRight: 10, textAlign: key === 'actions' ? 'right' : 'left' }}>{title}</Text>
        ))}
      </View>
      {visible.map((request, index) => {
        const tone = statusTone(request.status, palette);
        const stock = stockOf(request);
        const people = uniqueRequesters(request);
        const qty = totalRequestedQuantity(request);
        const latestNote = request.asks.find((ask) => ask.note)?.note;
        const sub = [request.variantLabel, latestNote ? `“${latestNote}”` : null, !isRestockRequestOpen(request) && request.statusNote ? request.statusNote : null].filter(Boolean).join(' · ');
        const primary = primaryAction(request);
        const items = menuItems(request);
        return (
          <Pressable key={request.id} style={(state) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: index === visible.length - 1 ? 0 : 1, borderBottomColor: palette.hairline, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}>
            <View style={{ ...COL.item, paddingRight: 10 }}>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{request.itemName}</Text>
              {sub ? <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
            </View>
            <Text style={{ ...COL.asked, color: palette.textSoft, fontSize: 12, paddingRight: 10 }} numberOfLines={1}>{request.asks.length === 1 ? 'Once' : `${request.asks.length} times`}</Text>
            <Text style={{ ...COL.by, color: palette.textSoft, fontSize: 12, paddingRight: 10 }} numberOfLines={1}>{`${people.slice(0, 3).join(', ')}${people.length > 3 ? ` +${people.length - 3}` : ''}`}</Text>
            <Text style={{ ...COL.qty, color: qty > 0 ? palette.text : palette.faint, fontSize: 12, fontVariant: ['tabular-nums'], paddingRight: 10 }}>{qty > 0 ? qty : 'Any'}</Text>
            <View style={{ ...COL.stock, paddingRight: 10 }}>
              {stock
                ? dotText(stock.stock <= 0 ? 'Out of stock' : `${stock.stock} in stock`, stock.stock <= 0 ? palette.danger : stock.low ? palette.warn : palette.tones.verified.dot, stock.stock <= 0 ? palette.danger : stock.low ? palette.warn : palette.muted)
                : dotText('Not stocked', palette.tones.review.dot, palette.muted)}
            </View>
            <View style={{ ...COL.status, paddingRight: 10 }}>{dotText(RESTOCK_STATUS_LABELS[request.status], tone.dot, tone.ink)}</View>
            <Text style={{ ...COL.when, color: palette.faint, fontSize: 12, paddingRight: 10 }} numberOfLines={1}>{timeAgo(request.updatedAt)}</Text>
            <View style={{ ...COL.actions, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {primary ? (
                <Pressable onPress={() => changeStatus(request, primary.status)} style={(state) => ({ height: 28, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME, opacity: state.pressed ? 0.8 : 1 })}>
                  <Check size={13} color={FYLL_LIME_INK} strokeWidth={2.6} />
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 12.5, fontWeight: '600' }}>{primary.label}</Text>
                </Pressable>
              ) : null}
              {isRestockRequestOpen(request) && canManage ? (
                <Pressable onPress={() => setDeclining(request)} style={(state) => ({ height: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                  <Text style={{ color: palette.muted, fontSize: 12.5, fontWeight: '600' }}>Decline</Text>
                </Pressable>
              ) : null}
              {items.length > 0 ? (
                <RowMenu items={items} palette={palette} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  // Phones: one compact card of rows, like the Orders list. Actions live in the ⋮ menu.
  const renderMobileList = () => (
    <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}>
      {visible.map((request, index) => {
        const tone = statusTone(request.status, palette);
        const stock = stockOf(request);
        const qty = totalRequestedQuantity(request);
        const primary = primaryAction(request);
        const items = [
          ...(isRestockRequestOpen(request) && canManage ? [{ key: 'decline', label: 'Decline', onPress: () => setDeclining(request) }] : []),
          ...menuItems(request),
        ];
        const meta = [
          request.variantLabel,
          request.asks.length > 1 ? `${request.asks.length} asks` : null,
          qty > 0 ? `${qty} wanted` : null,
        ].filter(Boolean).join(' · ');
        const stockText = stock ? (stock.stock <= 0 ? 'Out' : `${stock.stock} left`) : 'New';
        const stockInk = stock ? (stock.stock <= 0 ? palette.danger : stock.low ? palette.warn : palette.muted) : palette.limeOnSurface;
        return (
          <View key={request.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{request.itemName}</Text>
              <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                {meta ? `${meta} · ` : ''}<Text style={{ color: stockInk }}>{stockText}</Text>
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot }} />
              <Text style={{ color: tone.ink, fontSize: 10, fontWeight: '600' }}>{RESTOCK_STATUS_LABELS[request.status]}</Text>
            </View>
            {primary ? (
              <Pressable onPress={() => changeStatus(request, primary.status)} style={(state) => ({ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: FYLL_LIME, opacity: state.pressed ? 0.8 : 1 })}>
                <Check size={11} color={FYLL_LIME_INK} strokeWidth={2.8} />
                <Text style={{ color: FYLL_LIME_INK, fontSize: 10, fontWeight: '600' }}>{primary.label}</Text>
              </Pressable>
            ) : null}
            {items.length > 0 ? <RowMenu items={items} palette={palette} /> : <View style={{ width: 30 }} />}
          </View>
        );
      })}
    </View>
  );

  const renderCard = (request: RestockRequest) => {
    const tone = statusTone(request.status, palette);
    const stock = stockOf(request);
    const people = uniqueRequesters(request);
    const qty = totalRequestedQuantity(request);
    const latestNote = request.asks.find((ask) => ask.note)?.note;
    const askCount = request.asks.length;
    return (
      <View key={request.id} style={{ backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: isMobile ? 14 : 18, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.inset, alignItems: 'center', justifyContent: 'center' }}>
            <MoneyText style={{ color: palette.text, fontSize: 17 }}>{askCount}×</MoneyText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }} numberOfLines={2}>
              {request.itemName}
              {request.variantLabel ? <Text style={{ color: palette.muted, fontWeight: '500' }}>{`  ${request.variantLabel}`}</Text> : null}
            </Text>
            <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 3 }} numberOfLines={2}>
              {`Asked ${askCount === 1 ? 'once' : `${askCount} times`} by ${people.slice(0, 3).join(', ')}${people.length > 3 ? ` +${people.length - 3}` : ''} · ${timeAgo(request.updatedAt)}`}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: tone.bg }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot }} />
                <Text style={{ color: tone.ink, fontSize: 11, fontWeight: '700' }}>{RESTOCK_STATUS_LABELS[request.status]}</Text>
              </View>
              {qty > 0 ? (
                <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: palette.softFill, justifyContent: 'center' }}>
                  <Text style={{ color: palette.textSoft, fontSize: 11, fontWeight: '600' }}>{qty} wanted</Text>
                </View>
              ) : null}
              {stock ? (
                <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: stock.stock <= 0 ? palette.dangerBg : stock.low ? palette.warnBg : palette.softFill, justifyContent: 'center' }}>
                  <Text style={{ color: stock.stock <= 0 ? palette.danger : stock.low ? palette.warn : palette.muted, fontSize: 11, fontWeight: '600' }}>
                    {stock.stock <= 0 ? 'Out of stock' : `${stock.stock} in stock`}
                  </Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: palette.nudgeBg, justifyContent: 'center' }}>
                  <Text style={{ color: palette.limeOnSurface, fontSize: 11, fontWeight: '600' }}>Not stocked yet</Text>
                </View>
              )}
            </View>
            {latestNote ? (
              <Text style={{ color: palette.textSoft, fontSize: fs(13), marginTop: 8, lineHeight: fs(13) * 1.45 }} numberOfLines={3}>“{latestNote}”</Text>
            ) : null}
            {request.statusNote && !isRestockRequestOpen(request) ? (
              <Text style={{ color: palette.muted, fontSize: fs(12.5), marginTop: 6 }}>{`${request.statusChangedBy ? `${request.statusChangedBy}: ` : ''}${request.statusNote}`}</Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {renderActions(request)}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={isMobile ? ['top'] : []}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 12 : 28, paddingBottom: 120, width: '100%', maxWidth: isMobile ? undefined : 1456, alignSelf: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            {isMobile ? <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/inventory' as never))} palette={palette} /> : null}
            <Text style={{ color: palette.text, ...pageHeadingStyle, flex: 1 }} numberOfLines={1}>Restock requests</Text>
            {!isMobile ? (
              <Pressable onPress={openNew} style={(state) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}>
                <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
                <ButtonText style={{ color: FYLL_LIME_INK }}>Request item</ButtonText>
              </Pressable>
            ) : null}
          </View>
          <Text style={{ color: palette.faint, fontSize: fs(14), marginBottom: 18, marginLeft: isMobile ? 52 : 0 }}>
            What the team wants us to buy next. Ask again to bump it up the list.
          </Text>

          {renderStats()}

          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {FILTERS.map((item) => {
              const on = filter === item.key;
              return (
                <Pressable key={item.key} onPress={() => setFilter(item.key)} style={(state) => ({ height: 32, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: on ? FYLL_LIME : palette.outline, backgroundColor: on ? FYLL_LIME : isHovered(state) ? palette.softFill : 'transparent' })}>
                  <Text style={{ color: on ? FYLL_LIME_INK : palette.textSoft, fontSize: fs(12.5), fontWeight: '600' }}>{item.label}</Text>
                  <Text style={{ color: on ? FYLL_LIME_INK : palette.textSoft, opacity: 0.55, fontSize: fs(12.5), fontWeight: '600' }}>{counts[item.key]}</Text>
                </Pressable>
              );
            })}
          </View>

          {requestsQuery.isLoading ? (
            <ActivityIndicator color={palette.muted} style={{ marginTop: 40 }} />
          ) : requestsQuery.isError ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
              <Text style={{ color: palette.muted, fontSize: fs(14), textAlign: 'center' }}>Couldn't load requests.</Text>
              <Pressable onPress={() => requestsQuery.refetch()} style={{ ...ghostPill }}>
                <Text style={{ color: palette.text, fontSize: fs(13), fontWeight: '600' }}>Try again</Text>
              </Pressable>
            </View>
          ) : visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10, backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border }}>
              <ClipboardList size={28} color={palette.faint} strokeWidth={1.6} />
              <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>
                {filter === 'open' ? 'Nothing on the list' : filter === 'ordered' ? 'Nothing ordered yet' : 'No finished requests'}
              </Text>
              {filter === 'open' ? (
                <Text style={{ color: palette.faint, fontSize: fs(13), textAlign: 'center', paddingHorizontal: 24 }}>
                  When customers ask for something we don't have, add it here.
                </Text>
              ) : null}
            </View>
          ) : (
            isMobile ? renderMobileList() : renderTable()
          )}
        </ScrollView>

        {isMobile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Request item"
            onPress={openNew}
            style={(state) => ({ position: 'absolute', right: 20, bottom: insets.bottom + 20, width: 56, height: 56, borderRadius: 28, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', transform: [{ scale: state.pressed ? 0.94 : 1 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 })}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.4} />
          </Pressable>
        ) : null}

        {toast ? (
          <View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', bottom: isMobile ? insets.bottom + 92 : 32, paddingHorizontal: 16, height: 40, borderRadius: 999, backgroundColor: FYLL_LIME, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
            <Text style={{ color: FYLL_LIME_INK, fontSize: 13.5, fontWeight: '600' }}>{toast}</Text>
          </View>
        ) : null}
      </SafeAreaView>

      <RequestSheet
        visible={sheetOpen}
        preset={preset}
        products={products}
        palette={palette}
        isMobile={isMobile}
        submitting={addAsks.isPending}
        onClose={() => setSheetOpen(false)}
        onSubmit={(picks, note) => {
          addAsks.mutate(
            picks.map((pick) => ({ ...pick.item, quantity: pick.quantity, note, by: userName })),
            {
              onSuccess: ({ count, stackedCount }) => {
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setSheetOpen(false);
                setFilter('open');
                setToast(count === 1
                  ? (stackedCount ? 'Already on the list, added your request' : 'Added to the list')
                  : `${count} items added to the list`);
              },
              onError: () => setToast('Could not save. Try again.'),
            },
          );
        }}
      />

      <DeclineSheet
        request={declining}
        palette={palette}
        onClose={() => setDeclining(null)}
        onConfirm={(note) => {
          if (declining) changeStatus(declining, 'declined', note);
          setDeclining(null);
        }}
      />
    </View>
  );
}

function RequestSheet({
  visible, preset, products, palette, isMobile, submitting, onClose, onSubmit,
}: {
  visible: boolean;
  preset: PickedItem | null;
  products: Product[];
  palette: PaymentsPalette;
  isMobile: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (picks: Pick[], note: string) => void;
}) {
  const [search, setSearch] = useState<string>('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (!visible) return;
    setPicks(preset ? [{ key: pickKey(preset), item: preset, quantity: 0 }] : []);
    setSearch('');
    setNote('');
  }, [visible, preset]);

  const pickedKeys = useMemo(() => new Set(picks.map((pick) => pick.key)), [picks]);
  const togglePick = (item: PickedItem) => {
    const key = pickKey(item);
    setPicks((previous) => (previous.some((pick) => pick.key === key)
      ? previous.filter((pick) => pick.key !== key)
      : [...previous, { key, item, quantity: 0 }]));
  };
  const setPickQuantity = (key: string, quantity: number) => {
    setPicks((previous) => previous.map((pick) => (pick.key === key ? { ...pick, quantity: Math.max(0, quantity) } : pick)));
  };

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const rows: { key: string; item: PickedItem; stock: number }[] = [];
    products.forEach((product) => {
      if (product.productType === 'service') return;
      const nameHit = product.name.toLowerCase().includes(term);
      const variants = product.variants ?? [];
      if (variants.length <= 1) {
        const variant = variants[0];
        if (nameHit || variant?.sku?.toLowerCase().includes(term)) {
          rows.push({ key: product.id, item: { productId: product.id, variantId: variant?.id, itemName: product.name, variantLabel: variant ? variantLabelOf(variant) || undefined : undefined }, stock: variant?.stock ?? 0 });
        }
        return;
      }
      variants.forEach((variant) => {
        const label = variantLabelOf(variant);
        if (nameHit || label.toLowerCase().includes(term) || variant.sku?.toLowerCase().includes(term)) {
          rows.push({ key: `${product.id}:${variant.id}`, item: { productId: product.id, variantId: variant.id, itemName: product.name, variantLabel: label || undefined }, stock: variant.stock ?? 0 });
        }
      });
    });
    return rows.slice(0, 30);
  }, [products, search]);

  const inputStyle = { backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.outline, borderRadius: 14, paddingHorizontal: 14, color: palette.text, fontSize: 15 } as const;
  const label = { color: palette.faint, fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 8 };

  return (
    <Modal visible={visible} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: isMobile ? 'flex-end' : 'center', alignItems: 'center' }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: isMobile ? undefined : 520, maxHeight: '88%', backgroundColor: palette.card, borderRadius: 24, borderBottomLeftRadius: isMobile ? 0 : 24, borderBottomRightRadius: isMobile ? 0 : 24, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
              <MoneyText style={{ color: palette.text, fontSize: 20 }}>Request items</MoneyText>
              <Pressable accessibilityLabel="Close" onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <X size={16} color={palette.text} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
              <Text style={label}>Items</Text>
              <View style={{ marginBottom: 18 }}>
                <View style={{ ...inputStyle, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48 }}>
                  <Search size={16} color={palette.faint} strokeWidth={2} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search inventory or type a new item"
                    placeholderTextColor={palette.faint}
                    autoFocus={!isMobile && !preset}
                    style={{ flex: 1, color: palette.text, fontSize: 15, height: '100%', outlineStyle: 'none' } as never}
                    selectionColor={FYLL_LIME}
                  />
                </View>
                {search.trim() ? (
                  <View style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
                    {options.map((option) => {
                      const on = pickedKeys.has(pickKey(option.item));
                      return (
                        <Pressable key={option.key} onPress={() => togglePick(option.item)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: on ? palette.nudgeBg : isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}>
                          <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: on ? 0 : 1.5, borderColor: palette.outline, backgroundColor: on ? FYLL_LIME : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {on ? <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{option.item.itemName}</Text>
                            {option.item.variantLabel ? <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>{option.item.variantLabel}</Text> : null}
                          </View>
                          <Text style={{ color: option.stock <= 0 ? palette.danger : palette.muted, fontSize: 12.5, fontWeight: '600' }}>{option.stock <= 0 ? 'Out' : `${option.stock} left`}</Text>
                        </Pressable>
                      );
                    })}
                    <Pressable onPress={() => { togglePick({ itemName: search.trim() }); setSearch(''); }} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: isHovered(state) || state.pressed ? palette.nudgeBg : 'transparent' })}>
                      <Plus size={15} color={palette.limeOnSurface} strokeWidth={2.4} />
                      <Text style={{ color: palette.limeOnSurface, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{`Add "${search.trim()}" as a new item`}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {picks.length > 0 ? (
                <View style={{ marginBottom: 18 }}>
                  <Text style={label}>{`Selected (${picks.length}) · how many`}</Text>
                  <View style={{ borderRadius: 14, backgroundColor: palette.inset, paddingHorizontal: 12 }}>
                    {picks.map((pick, index) => (
                      <View key={pick.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{pick.item.itemName}</Text>
                          <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{pick.item.variantLabel ?? (pick.item.productId ? 'From inventory' : 'New item, not stocked yet')}</Text>
                        </View>
                        <Pressable accessibilityLabel="Less" onPress={() => setPickQuantity(pick.key, pick.quantity - 1)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', opacity: pick.quantity <= 0 ? 0.4 : 1 }}>
                          <Minus size={14} color={palette.text} strokeWidth={2.2} />
                        </Pressable>
                        <TextInput
                          value={pick.quantity > 0 ? String(pick.quantity) : ''}
                          onChangeText={(text) => setPickQuantity(pick.key, parseInt(text.replace(/[^0-9]/g, ''), 10) || 0)}
                          placeholder="Any"
                          placeholderTextColor={palette.faint}
                          keyboardType="number-pad"
                          style={{ ...inputStyle, width: 58, height: 32, paddingHorizontal: 4, fontSize: 12, textAlign: 'center', fontWeight: '700' }}
                          selectionColor={FYLL_LIME}
                        />
                        <Pressable accessibilityLabel="More" onPress={() => setPickQuantity(pick.key, pick.quantity + 1)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={14} color={palette.text} strokeWidth={2.2} />
                        </Pressable>
                        <Pressable accessibilityLabel="Remove" onPress={() => togglePick(pick.item)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                          <X size={15} color={palette.faint} strokeWidth={2.2} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <Text style={label}>{picks.length > 1 ? 'Why (optional, for all)' : 'Why (optional)'}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. 3 customers asked this week"
                placeholderTextColor={palette.faint}
                multiline
                style={{ ...inputStyle, minHeight: 80, paddingTop: 12, textAlignVertical: 'top', marginBottom: 20 }}
                selectionColor={FYLL_LIME}
              />

              <Pressable
                disabled={picks.length === 0 || submitting}
                onPress={() => picks.length > 0 && onSubmit(picks, note)}
                style={(state) => ({ height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: picks.length > 0 ? (isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME) : palette.softFill, opacity: submitting ? 0.7 : 1 })}
              >
                {submitting ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Check size={17} color={picks.length > 0 ? FYLL_LIME_INK : palette.faint} strokeWidth={2.4} />}
                <ButtonText style={{ color: picks.length > 0 ? FYLL_LIME_INK : palette.faint }}>{picks.length > 1 ? `Add ${picks.length} items to list` : 'Add to list'}</ButtonText>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DeclineSheet({ request, palette, onClose, onConfirm }: { request: RestockRequest | null; palette: PaymentsPalette; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState<string>('');
  useEffect(() => { if (request) setNote(''); }, [request]);
  return (
    <Modal visible={Boolean(request)} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, backgroundColor: palette.card, borderRadius: 22, padding: 20 }}>
            <MoneyText style={{ color: palette.text, fontSize: 19 }}>Decline request?</MoneyText>
            <Text style={{ color: palette.muted, fontSize: 14, marginTop: 6, marginBottom: 14 }}>{request?.itemName} will move to Done. Add a reason so the team knows.</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Supplier discontinued it"
              placeholderTextColor={palette.faint}
              style={{ backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.outline, borderRadius: 14, paddingHorizontal: 14, height: 46, color: palette.text, fontSize: 15, marginBottom: 16 }}
              selectionColor={FYLL_LIME}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={onClose} style={{ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => onConfirm(note)} style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: palette.inverseBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: palette.inverseText, fontSize: 14, fontWeight: '600' }}>Decline</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type RowMenuItem = { key: string; label: string; danger?: boolean; onPress: () => void };
const ROW_MENU_WIDTH = 220;

// The ⋮ menu on a table row, same look as the Payments row menu.
function RowMenu({ items, palette }: { items: RowMenuItem[]; palette: PaymentsPalette }) {
  const ref = React.useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const open = () => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);
  const estimate = items.length * 38 + 12;
  return (
    <>
      <Pressable
        ref={ref}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel="More actions"
        onPress={open}
        style={(state) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
      >
        <MoreVertical size={16} color={palette.faint} strokeWidth={2.2} />
      </Pressable>
      {anchor ? (
        <Modal transparent visible animationType="fade" onRequestClose={close}>
          <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <Pressable
              onPress={(event) => event.stopPropagation?.()}
              style={{
                position: 'absolute',
                width: ROW_MENU_WIDTH,
                left: Math.max(12, Math.min(windowWidth - ROW_MENU_WIDTH - 12, anchor.x + anchor.width - ROW_MENU_WIDTH)),
                ...(anchor.y + anchor.height + 8 + estimate > windowHeight ? { bottom: windowHeight - anchor.y + 4 } : { top: anchor.y + anchor.height + 4 }),
                backgroundColor: palette.card,
                borderRadius: 16,
                padding: 6,
                borderWidth: 1,
                borderColor: palette.border,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              }}
            >
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => { close(); item.onPress(); }}
                  style={(state) => ({ height: 38, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.06)' : '#F4F4F4') : 'transparent' })}
                >
                  <Text style={{ color: item.danger ? palette.danger : palette.text, fontSize: 12, fontWeight: '500' }}>{item.label}</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
