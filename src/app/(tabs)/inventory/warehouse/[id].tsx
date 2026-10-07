import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Boxes, CalendarClock, CheckCircle2, ClipboardCheck, History, Package, Pencil, RefreshCcw, Ruler, Save, Trash2, UserRound, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { type WarehouseCountFrequency } from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { capitalizeDisplayLabel } from '@/lib/display-format';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, type PaymentsPalette, usePaymentsPalette } from '@/components/payments/payments-ui';

const addMonths = (isoDate: string, months: number) => {
  const next = new Date(isoDate);
  next.setMonth(next.getMonth() + months);
  return next;
};

const formatDate = (isoDate?: string) => {
  if (!isoDate) return 'Not counted yet';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Not counted yet';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (isoDate?: string) => {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function SectionTitle({ icon: Icon, children, palette }: { icon: typeof History; children: React.ReactNode; palette: PaymentsPalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon size={14} color={palette.faint} strokeWidth={2} />
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.65, textTransform: 'uppercase' }}>{children}</Text>
    </View>
  );
}

function DetailRow({ label, value, palette, last = false }: { label: string; value: string; palette: PaymentsPalette; last?: boolean }) {
  return (
    <View style={{ minHeight: 48, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline }}>
      <Text style={{ color: palette.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: palette.text, fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function FieldLabel({ children, palette }: { children: React.ReactNode; palette: PaymentsPalette }) {
  return <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', marginBottom: 7 }}>{children}</Text>;
}

export default function WarehouseItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDesktop } = useBreakpoint();
  const palette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const isWebDesktop = isDesktop && Platform.OS === 'web';

  const businessId = useAuthStore((state) => state.businessId ?? state.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((state) => state.currentUser);
  const warehouseItems = useFyllStore((state) => state.warehouseItems);
  const updateWarehouseItem = useFyllStore((state) => state.updateWarehouseItem);
  const deleteWarehouseItem = useFyllStore((state) => state.deleteWarehouseItem);
  const recordWarehouseCount = useFyllStore((state) => state.recordWarehouseCount);
  const item = useMemo(() => warehouseItems.find((entry) => entry.id === id), [warehouseItems, id]);

  const [showCountModal, setShowCountModal] = useState(false);
  const [countQuantity, setCountQuantity] = useState(String(item?.currentStock ?? 0));
  const [countNotes, setCountNotes] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [stock, setStock] = useState(String(item?.currentStock ?? 0));
  const [reorderLevel, setReorderLevel] = useState(item?.reorderLevel === undefined ? '' : String(item.reorderLevel));
  const [countFrequency, setCountFrequency] = useState<WarehouseCountFrequency>(item?.countFrequency ?? 'Monthly');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const nextCountDate = useMemo(() => {
    if (!item) return null;
    return addMonths(item.lastCountedAt ?? item.createdAt, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
  }, [item]);
  const isOverdue = Boolean(nextCountDate && nextCountDate.getTime() < Date.now());
  const stockState = !item || item.currentStock === 0 ? 'out' : typeof item.reorderLevel === 'number' && item.currentStock <= item.reorderLevel ? 'low' : 'in';
  const stockLabel = stockState === 'out' ? 'Out of stock' : stockState === 'low' ? 'Low stock' : 'In stock';
  const stockTone = stockState === 'out' ? palette.danger : stockState === 'low' ? palette.tones.awaiting.dot : palette.tones.verified.dot;
  const latestCounts = useMemo(() => [...(item?.countHistory ?? [])].sort((a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime()).slice(0, 12), [item?.countHistory]);

  const handleOpenCount = () => {
    if (!item) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCountQuantity(String(item.currentStock));
    setCountNotes('');
    setShowCountModal(true);
  };

  const handleSubmitCount = () => {
    if (!item) return;
    const quantity = Number(countQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    recordWarehouseCount(item.id, { quantity, countedBy: currentUser?.name, notes: countNotes.trim() }, businessId);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCountModal(false);
  };

  const handleOpenEdit = () => {
    if (!item) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setStock(String(item.currentStock));
    setReorderLevel(item.reorderLevel === undefined ? '' : String(item.reorderLevel));
    setCountFrequency(item.countFrequency);
    setNotes(item.notes ?? '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!item || !name.trim()) return;
    const parsedStock = Number(stock);
    const parsedReorderLevel = reorderLevel.trim() ? Number(reorderLevel) : undefined;
    updateWarehouseItem(item.id, {
      name: name.trim(),
      category: category.trim() || 'General',
      unit: unit.trim() || 'pcs',
      currentStock: Number.isFinite(parsedStock) ? Math.max(0, parsedStock) : item.currentStock,
      reorderLevel: parsedReorderLevel !== undefined && Number.isFinite(parsedReorderLevel) ? Math.max(0, parsedReorderLevel) : undefined,
      countFrequency,
      notes: notes.trim(),
    }, businessId);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEditModal(false);
  };

  const handleDelete = () => {
    if (!item) return;
    deleteWarehouseItem(item.id, businessId);
    setShowDeleteModal(false);
    router.replace('/inventory/warehouse');
  };

  const inputStyle = { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, paddingHorizontal: 13, color: palette.text, fontSize: 14 } as const;

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}><Package size={26} color={palette.faint} strokeWidth={1.7} /></View>
          <Text style={{ color: palette.text, fontSize: 19, fontWeight: '600', marginTop: 16 }}>Warehouse item not found</Text>
          <Text style={{ color: palette.faint, fontSize: 13, marginTop: 5, textAlign: 'center' }}>It may have been removed or is no longer available.</Text>
          <Pressable onPress={() => router.replace('/inventory/warehouse')} style={(state) => ({ marginTop: 20, height: 42, paddingHorizontal: 18, borderRadius: 999, backgroundColor: state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, alignItems: 'center', justifyContent: 'center' })}><Text style={{ color: FYLL_LIME_INK, fontSize: 13, fontWeight: '600' }}>Back to Warehouse</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const metrics = [
    { label: 'On hand', value: item.currentStock.toLocaleString(), sub: item.unit, color: palette.text },
    { label: 'Stock status', value: stockLabel, sub: item.reorderLevel === undefined ? 'No reorder point' : `Reorder at ${item.reorderLevel} ${item.unit}`, color: stockTone },
    { label: 'Last counted', value: formatDate(item.lastCountedAt), sub: item.lastCountedBy ? `By ${item.lastCountedBy}` : 'No counter recorded', color: palette.text },
    { label: 'Next count', value: nextCountDate ? formatDate(nextCountDate.toISOString()) : 'Not scheduled', sub: isOverdue ? 'Count overdue' : item.countFrequency, color: isOverdue ? palette.danger : palette.text },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ width: '100%', maxWidth: 1456, alignSelf: isWebDesktop ? 'flex-start' : 'center', paddingHorizontal: isWebDesktop ? 28 : 16, paddingTop: isWebDesktop ? 34 : 10, paddingBottom: isWebDesktop ? 36 : tabBarHeight + 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: isWebDesktop ? 'row' : 'column', alignItems: isWebDesktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <BackButton onPress={() => router.back()} palette={palette} label="Back to Warehouse" />
            <View style={{ width: isWebDesktop ? 48 : 42, height: isWebDesktop ? 48 : 42, borderRadius: isWebDesktop ? 14 : 12, overflow: 'hidden', marginLeft: 12, backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
              {item.imageUrl ? <ResolvedAttachmentImage imageUrl={item.imageUrl} style={{ width: isWebDesktop ? 48 : 42, height: isWebDesktop ? 48 : 42 }} resizeMode="cover" /> : <Package size={isWebDesktop ? 21 : 19} color={palette.faint} strokeWidth={1.7} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text style={{ color: palette.text, fontSize: isWebDesktop ? 30 : 20, lineHeight: isWebDesktop ? 36 : 25, fontWeight: '600', letterSpacing: isWebDesktop ? -0.6 : -0.2 }} numberOfLines={1}>{capitalizeDisplayLabel(item.name)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
                <Text style={{ color: palette.faint, fontSize: isWebDesktop ? 13 : 11 }} numberOfLines={1}>{item.category} · {item.countFrequency} count</Text>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: stockTone }} />
                <Text style={{ color: stockTone, fontSize: isWebDesktop ? 12 : 11, fontWeight: '600' }}>{stockLabel}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: isWebDesktop ? 0 : 52 }}>
            <Pressable onPress={handleOpenEdit} style={(state) => ({ height: 42, flex: isWebDesktop ? undefined : 1, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}><Pencil size={14} color={palette.text} strokeWidth={2.1} /><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Edit item</Text></Pressable>
            <Pressable onPress={handleOpenCount} style={(state) => ({ height: 42, flex: isWebDesktop ? undefined : 1.2, paddingHorizontal: 17, borderRadius: 999, backgroundColor: state.pressed || isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}><ClipboardCheck size={15} color={FYLL_LIME_INK} strokeWidth={2.2} /><Text style={{ color: FYLL_LIME_INK, fontSize: 13, fontWeight: '600' }}>Record count</Text></Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: isWebDesktop ? 'nowrap' : 'wrap', borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', marginTop: isWebDesktop ? 26 : 20 }}>
          {metrics.map((metric, index) => (
            <View key={metric.label} style={{ width: isWebDesktop ? undefined : '50%', flex: isWebDesktop ? 1 : undefined, minHeight: isWebDesktop ? 108 : 100, paddingVertical: 17, paddingHorizontal: isWebDesktop ? 22 : 15, justifyContent: 'center', borderLeftWidth: isWebDesktop && index > 0 ? 1 : 0, borderTopWidth: !isWebDesktop && index > 1 ? 1 : 0, borderRightWidth: !isWebDesktop && index % 2 === 0 ? 1 : 0, borderColor: palette.hairline }}>
              <Text style={{ color: palette.muted, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.55, textTransform: 'uppercase' }}>{metric.label}</Text>
              <Text style={{ color: metric.color, fontSize: metric.label === 'On hand' ? 25 : isWebDesktop ? 17 : 15, lineHeight: metric.label === 'On hand' ? 30 : 22, fontWeight: '600', marginTop: 5, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{metric.value}</Text>
              <Text style={{ color: metric.label === 'Next count' && isOverdue ? palette.danger : palette.faint, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{metric.sub}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: isWebDesktop ? 'row' : 'column', alignItems: 'flex-start', gap: 18, marginTop: 18 }}>
          <View style={{ flex: isWebDesktop ? 0.72 : undefined, width: '100%', gap: 18 }}>
            <View style={{ backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 18 }}>
              <SectionTitle icon={Boxes} palette={palette}>Item details</SectionTitle>
              <View style={{ marginTop: 9 }}>
                <DetailRow label="Category" value={item.category || 'General'} palette={palette} />
                <DetailRow label="Unit" value={item.unit} palette={palette} />
                <DetailRow label="Count cycle" value={item.countFrequency} palette={palette} />
                <DetailRow label="Reorder point" value={item.reorderLevel === undefined ? 'Not set' : `${item.reorderLevel} ${item.unit}`} palette={palette} />
                <DetailRow label="Added" value={formatDate(item.createdAt)} palette={palette} last />
              </View>
            </View>
            <View style={{ backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 18 }}>
              <SectionTitle icon={RefreshCcw} palette={palette}>Count schedule</SectionTitle>
              <View style={{ marginTop: 15, padding: 14, borderRadius: 14, backgroundColor: isOverdue ? palette.dangerBg : palette.inset, borderWidth: 1, borderColor: isOverdue ? palette.dangerBorder : palette.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: isOverdue ? palette.dangerBg : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>{isOverdue ? <AlertTriangle size={18} color={palette.danger} strokeWidth={2} /> : <CalendarClock size={18} color={palette.faint} strokeWidth={2} />}</View>
                <View style={{ flex: 1 }}><Text style={{ color: isOverdue ? palette.danger : palette.text, fontSize: 14, fontWeight: '600' }}>{isOverdue ? 'Physical count is overdue' : 'Next physical count'}</Text><Text style={{ color: isOverdue ? palette.danger : palette.faint, fontSize: 12, marginTop: 3 }}>{nextCountDate ? formatDate(nextCountDate.toISOString()) : 'No count date available'}</Text></View>
              </View>
            </View>
            {item.notes ? <View style={{ backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 18 }}><SectionTitle icon={Ruler} palette={palette}>Notes</SectionTitle><Text style={{ color: palette.textSoft, fontSize: 13.5, lineHeight: 21, marginTop: 13 }}>{item.notes}</Text></View> : null}
            <Pressable onPress={() => setShowDeleteModal(true)} style={(state) => ({ height: 46, borderRadius: 14, borderWidth: 1, borderColor: palette.dangerBorder, backgroundColor: state.pressed ? palette.dangerBg : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}><Trash2 size={15} color={palette.danger} strokeWidth={2} /><Text style={{ color: palette.danger, fontSize: 13, fontWeight: '600' }}>Delete warehouse item</Text></Pressable>
          </View>

          <View style={{ flex: isWebDesktop ? 1.28 : undefined, width: '100%', backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 18, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: palette.hairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><SectionTitle icon={History} palette={palette}>Count history</SectionTitle><Text style={{ color: palette.faint, fontSize: 11.5 }}>{latestCounts.length} {latestCounts.length === 1 ? 'record' : 'records'}</Text></View>
            {latestCounts.length === 0 ? (
              <View style={{ paddingHorizontal: 22, paddingVertical: 48, alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}><ClipboardCheck size={20} color={palette.faint} strokeWidth={1.8} /></View>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', marginTop: 13 }}>No count records yet</Text>
                <Text style={{ color: palette.faint, fontSize: 12, marginTop: 4, textAlign: 'center' }}>Record the first physical count to start this item’s history.</Text>
                <Pressable onPress={handleOpenCount} style={(state) => ({ marginTop: 16, height: 38, paddingHorizontal: 15, borderRadius: 999, backgroundColor: state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, alignItems: 'center', justifyContent: 'center' })}><Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '600' }}>Record first count</Text></Pressable>
              </View>
            ) : latestCounts.map((entry, index) => {
              const previous = latestCounts[index + 1];
              const change = previous ? entry.quantity - previous.quantity : null;
              return (
                <View key={entry.id} style={{ paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: index === latestCounts.length - 1 ? 0 : 1, borderBottomColor: palette.hairline }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CheckCircle2 size={17} color={palette.tones.verified.dot} strokeWidth={2} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{entry.quantity.toLocaleString()} {item.unit}</Text>{change !== null && change !== 0 ? <Text style={{ color: change > 0 ? palette.tones.verified.ink : palette.danger, fontSize: 11, fontWeight: '600' }}>{change > 0 ? '+' : ''}{change}</Text> : null}</View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>{entry.countedBy ? <UserRound size={11} color={palette.faint} strokeWidth={2} /> : null}<Text style={{ color: palette.faint, fontSize: 11.5 }} numberOfLines={1}>{entry.countedBy || 'Counter not recorded'}</Text></View>
                      {entry.notes ? <Text style={{ color: palette.textSoft, fontSize: 12, lineHeight: 17, marginTop: 7 }} numberOfLines={2}>{entry.notes}</Text> : null}
                    </View>
                    <Text style={{ color: palette.faint, fontSize: 11.5, textAlign: 'right', maxWidth: 112 }}>{formatDateTime(entry.countedAt)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showCountModal} transparent animationType="fade" onRequestClose={() => setShowCountModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable onPress={() => setShowCountModal(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}><View style={{ flex: 1 }}><Text style={{ color: palette.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.2 }}>Record physical count</Text><Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 5 }}>Update the on-hand quantity for {capitalizeDisplayLabel(item.name)}.</Text></View><Pressable onPress={() => setShowCountModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={palette.faint} strokeWidth={2.2} /></Pressable></View>
              <View style={{ marginTop: 20 }}><FieldLabel palette={palette}>Quantity ({item.unit})</FieldLabel><TextInput value={countQuantity} onChangeText={setCountQuantity} keyboardType="decimal-pad" selectTextOnFocus style={inputStyle} selectionColor={palette.text} /></View>
              <View style={{ marginTop: 14 }}><FieldLabel palette={palette}>Count note <Text style={{ color: palette.faint }}>(optional)</Text></FieldLabel><TextInput value={countNotes} onChangeText={setCountNotes} placeholder="Add context for this count" placeholderTextColor={palette.faint} multiline style={[inputStyle, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]} selectionColor={palette.text} /></View>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 20 }}><Pressable onPress={() => setShowCountModal(false)} style={(state) => ({ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', alignItems: 'center', justifyContent: 'center' })}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Cancel</Text></Pressable><Pressable onPress={handleSubmitCount} style={(state) => ({ flex: 1.35, height: 44, borderRadius: 999, backgroundColor: state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}><Save size={15} color={FYLL_LIME_INK} strokeWidth={2.2} /><Text style={{ color: FYLL_LIME_INK, fontSize: 13, fontWeight: '600' }}>Save count</Text></Pressable></View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable onPress={() => setShowEditModal(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 15, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.hairline }}><View><Text style={{ color: palette.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.2 }}>Edit warehouse item</Text><Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 4 }}>Update item details and count settings.</Text></View><Pressable onPress={() => setShowEditModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={palette.faint} strokeWidth={2.2} /></Pressable></View>
              <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <FieldLabel palette={palette}>Item name</FieldLabel><TextInput value={name} onChangeText={setName} placeholder="Item name" placeholderTextColor={palette.faint} style={inputStyle} selectionColor={palette.text} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}><View style={{ flex: 1 }}><FieldLabel palette={palette}>Category</FieldLabel><TextInput value={category} onChangeText={setCategory} placeholder="General" placeholderTextColor={palette.faint} style={inputStyle} selectionColor={palette.text} /></View><View style={{ flex: 1 }}><FieldLabel palette={palette}>Unit</FieldLabel><TextInput value={unit} onChangeText={setUnit} placeholder="pcs" placeholderTextColor={palette.faint} style={inputStyle} selectionColor={palette.text} /></View></View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}><View style={{ flex: 1 }}><FieldLabel palette={palette}>On hand</FieldLabel><TextInput value={stock} onChangeText={setStock} keyboardType="decimal-pad" style={inputStyle} selectionColor={palette.text} /></View><View style={{ flex: 1 }}><FieldLabel palette={palette}>Reorder point</FieldLabel><TextInput value={reorderLevel} onChangeText={setReorderLevel} keyboardType="decimal-pad" placeholder="Not set" placeholderTextColor={palette.faint} style={inputStyle} selectionColor={palette.text} /></View></View>
                <View style={{ marginTop: 14 }}><FieldLabel palette={palette}>Count cycle</FieldLabel><View style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}>{(['Monthly', 'Bi-Monthly'] as WarehouseCountFrequency[]).map((frequency) => { const active = countFrequency === frequency; return <Pressable key={frequency} onPress={() => setCountFrequency(frequency)} style={{ flex: 1, height: 38, borderRadius: 10, backgroundColor: active ? palette.inverseBg : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: active ? palette.inverseText : palette.muted, fontSize: 12, fontWeight: '600' }}>{frequency}</Text></Pressable>; })}</View></View>
                <View style={{ marginTop: 14 }}><FieldLabel palette={palette}>Notes</FieldLabel><TextInput value={notes} onChangeText={setNotes} placeholder="Storage location, handling notes, or supplier details" placeholderTextColor={palette.faint} multiline style={[inputStyle, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]} selectionColor={palette.text} /></View>
                <Pressable onPress={handleSaveEdit} style={(state) => ({ marginTop: 20, height: 46, borderRadius: 999, backgroundColor: state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}><Save size={15} color={FYLL_LIME_INK} strokeWidth={2.2} /><Text style={{ color: FYLL_LIME_INK, fontSize: 13, fontWeight: '600' }}>Save changes</Text></Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable onPress={() => setShowDeleteModal(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 390, borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 20 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: palette.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={19} color={palette.danger} strokeWidth={2} /></View>
            <Text style={{ color: palette.text, fontSize: 19, fontWeight: '600', marginTop: 15 }}>Delete warehouse item?</Text>
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>This permanently removes {capitalizeDisplayLabel(item.name)} and its complete count history.</Text>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 20 }}><Pressable onPress={() => setShowDeleteModal(false)} style={(state) => ({ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', alignItems: 'center', justifyContent: 'center' })}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Cancel</Text></Pressable><Pressable onPress={handleDelete} style={(state) => ({ flex: 1, height: 44, borderRadius: 999, backgroundColor: state.pressed ? palette.dangerBorder : palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder, alignItems: 'center', justifyContent: 'center' })}><Text style={{ color: palette.danger, fontSize: 13, fontWeight: '600' }}>Delete item</Text></Pressable></View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
