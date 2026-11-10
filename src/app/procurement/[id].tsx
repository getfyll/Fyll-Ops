import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronRight, Truck, Pencil, Trash2, FileText, Package, Paperclip, Image as ImageIcon, MoreVertical, User, Calendar, Clock, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Procurement, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { openAttachmentPath } from '@/lib/storage-attachments';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { getProcurementActivity, getProcurementSubmitter } from '@/lib/procurement-activity';

// ── helpers ──

const extractMetadataValue = (source: string | undefined, key: string): string | null => {
  if (!source) return null;
  const pattern = /\[([a-z_]+):([^\]]+)\]/gi;
  const keyLower = key.toLowerCase();
  let match = pattern.exec(source);
  while (match) {
    if (match[1]?.toLowerCase() === keyLower) return match[2]?.trim() ?? null;
    match = pattern.exec(source);
  }
  return null;
};

const stripMetadata = (source: string | undefined): string => {
  if (!source) return '';
  return source.replace(/\[([a-z_]+):([^\]]+)\]/gi, '').replace(/\s+/g, ' ').trim();
};

const sanitizeMetadata = (value: string): string => value.replace(/\]/g, '').trim();

const buildProcurementNotes = (
  note: string,
  poNumber: string,
  status: string,
  receivedDate: string,
  extraMetadata?: Record<string, string | null | undefined>,
  existingNotes?: string
) => {
  const metadataEntries = new Map<string, string>();
  const metadataPattern = /\[([a-z_]+):([^\]]+)\]/gi;
  const source = existingNotes ?? '';
  let match = metadataPattern.exec(source);
  while (match) {
    const key = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim();
    if (key && value) {
      metadataEntries.set(key, sanitizeMetadata(value));
    }
    match = metadataPattern.exec(source);
  }

  metadataEntries.set('po', sanitizeMetadata(poNumber.trim().toUpperCase()));
  metadataEntries.set('status', sanitizeMetadata(status.toLowerCase()));
  metadataEntries.set('expected', sanitizeMetadata(receivedDate));

  Object.entries(extraMetadata ?? {}).forEach(([rawKey, rawValue]) => {
    const key = rawKey.trim().toLowerCase();
    if (!key) return;
    const value = (rawValue ?? '').trim();
    if (!value) {
      metadataEntries.delete(key);
      return;
    }
    metadataEntries.set(key, sanitizeMetadata(value));
  });

  const metadataChunks = Array.from(metadataEntries.entries()).map(
    ([key, value]) => `[${key}:${value}]`
  );
  if (note.trim()) {
    metadataChunks.unshift(note.trim());
  }
  return metadataChunks.join(' ').trim();
};

const resolvePONumber = (procurement: Procurement): string => {
  const meta = extractMetadataValue(procurement.notes, 'po');
  if (meta) return meta.toUpperCase();
  return `PO-${procurement.id.slice(-4).toUpperCase().padStart(4, '0')}`;
};

const resolveStatus = (procurement: Procurement): string => {
  const meta = extractMetadataValue(procurement.notes, 'status');
  if (meta) return meta.charAt(0).toUpperCase() + meta.slice(1);
  const src = (procurement.notes ?? '').toLowerCase();
  if (src.includes('cancelled') || src.includes('canceled')) return 'Cancelled';
  if (src.includes('draft')) return 'Draft';
  if (src.includes('sent')) return 'Sent';
  if (src.includes('confirm')) return 'Confirmed';
  return 'Received';
};

const resolvePaidDate = (procurement: Procurement): string => {
  const paidDate = extractMetadataValue(procurement.notes, 'paid_date');
  if (paidDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      const [year, month, day] = paidDate.split('-').map(Number);
      return new Date(year, (month ?? 1) - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const parsed = new Date(paidDate).getTime();
    if (!isNaN(parsed)) return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const legacyExpected = extractMetadataValue(procurement.notes, 'expected');
  if (legacyExpected) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(legacyExpected)) {
      const [year, month, day] = legacyExpected.split('-').map(Number);
      return new Date(year, (month ?? 1) - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const parsed = new Date(legacyExpected).getTime();
    if (!isNaN(parsed)) return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const created = new Date(procurement.createdAt).getTime();
  const fallback = isNaN(created) ? Date.now() : created;
  return new Date(fallback).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const resolveReceivedDate = (procurement: Procurement): string => {
  const receivedDate = extractMetadataValue(procurement.notes, 'received_date');
  if (receivedDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
      const [year, month, day] = receivedDate.split('-').map(Number);
      return new Date(year, (month ?? 1) - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const parsed = new Date(receivedDate).getTime();
    if (!isNaN(parsed)) return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const legacyExpected = extractMetadataValue(procurement.notes, 'expected');
  if (legacyExpected) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(legacyExpected)) {
      const [year, month, day] = legacyExpected.split('-').map(Number);
      return new Date(year, (month ?? 1) - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const parsed = new Date(legacyExpected).getTime();
    if (!isNaN(parsed)) return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return resolvePaidDate(procurement);
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'rgba(0,0,0,0.07)',          text: '#555555' },
  sent:      { bg: 'rgba(59, 130, 246, 0.16)',  text: '#3B82F6' },
  confirmed: { bg: 'rgba(139, 92, 246, 0.16)', text: '#8B5CF6' },
  received:  { bg: 'rgba(16, 185, 129, 0.16)', text: '#10B981' },
  cancelled: { bg: 'rgba(239, 68, 68, 0.16)',  text: '#EF4444' },
};

const capitalizeDisplayValue = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatPanelDate = (value: string | undefined): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString('en-GB');
};

export default function ProcurementDetailScreen() {
  const router = useRouter();
  const colors = useStatsColors();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPoItems, setShowPoItems] = useState<boolean>(false);
  const [statusListOpen, setStatusListOpen] = useState<boolean>(false);
  const procurements = useFyllStore((s) => s.procurements);
  const products = useFyllStore((s) => s.products);
  const deleteProcurement = useFyllStore((s) => s.deleteProcurement);
  const updateProcurement = useFyllStore((s) => s.updateProcurement);
  const procurementStatusOptions = useFyllStore((s) => s.procurementStatusOptions);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const procurement = useMemo(() => procurements.find((p) => p.id === id) ?? null, [procurements, id]);
  const poNumber = useMemo(() => procurement ? resolvePONumber(procurement) : '', [procurement]);
  const status = useMemo(() => procurement ? resolveStatus(procurement) : '', [procurement]);
  const paidDate = useMemo(() => procurement ? resolvePaidDate(procurement) : '', [procurement]);
  const receivedDate = useMemo(() => procurement ? resolveReceivedDate(procurement) : '', [procurement]);
  const createdAt = useMemo(() => {
    if (!procurement) return '';
    const ts = new Date(procurement.createdAt).getTime();
    return isNaN(ts) ? '' : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [procurement]);

  const statusColors = STATUS_COLORS[status.toLowerCase()] ?? { bg: 'rgba(0,0,0,0.07)', text: '#555555' };
  const visibleStatusOptions = useMemo(
    () => (procurementStatusOptions.length > 0
      ? procurementStatusOptions
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((option) => option.name)
      : ['Draft', 'Sent', 'Confirmed', 'Received', 'Cancelled']),
    [procurementStatusOptions]
  );
  const cleanNotes = useMemo(() => stripMetadata(procurement?.notes), [procurement]);
  const procurementSection = useMemo<'procurement' | 'costing'>(() => {
    const sectionParam = typeof section === 'string' ? section.trim().toLowerCase() : '';
    if (sectionParam === 'costing') return 'costing';
    const metadataMode = procurement ? extractMetadataValue(procurement.notes, 'mode')?.trim().toLowerCase() : '';
    if (metadataMode === 'costing') return 'costing';
    const hasCostingFields = procurement?.items.some((item) => (
      (item.serviceFee ?? 0) > 0
      || (item.deliveryFee ?? 0) > 0
      || (item.shippingClearanceFee ?? 0) > 0
      || (item.additionalFee ?? 0) > 0
      || (item.targetMarginPercent ?? 0) > 0
      || (item.currentSellingPrice ?? 0) > 0
    ));
    return hasCostingFields ? 'costing' : 'procurement';
  }, [procurement, section]);

  const itemRows = useMemo(() => {
    if (!procurement) return [];
    return procurement.items
    .filter((item) => item.productId !== 'charge-transfer-fees' && item.productId !== 'charge-stamp-duty')
    .map((item, index) => {
      const storedName = item.productName;
      const storedVariant = item.variantName ?? '';
      const product = products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      const resolvedName = product?.name;
      const resolvedVariant = variant ? Object.values(variant.variableValues ?? {}).join(', ') : '';
      const fallbackName = item.productId.startsWith('charge-payment-') ? `Payment ${index + 1}` : `Line item ${index + 1}`;
      const name = storedName?.trim() || resolvedName?.trim() || fallbackName;
      const variantLabel = storedVariant || resolvedVariant;
      return {
        id: `${item.productId}-${item.variantId}-${index}`,
        name: variantLabel ? `${name} — ${variantLabel}` : name,
        quantityPurchased: item.quantity && item.quantity > 0 ? item.quantity : 0,
        quantityReceived: item.quantityReceived && item.quantityReceived > 0 ? item.quantityReceived : (item.quantity && item.quantity > 0 ? item.quantity : 0),
        unitCost: item.unitCost && item.unitCost > 0 ? item.unitCost : 0,
        expectedProfit: item.expectedProfit ?? 0,
        costAtPurchase: item.costAtPurchase,
        total: item.costAtPurchase,
        paymentDate: formatPanelDate(item.paymentDate),
        isPaymentLine: item.productId.startsWith('charge-payment-'),
      };
    }) as {
      id: string;
      name: string;
      quantityPurchased: number;
      quantityReceived: number;
      unitCost: number;
      expectedProfit: number;
      costAtPurchase: number;
      total: number;
      paymentDate: string;
      isPaymentLine: boolean;
    }[];
  }, [procurement, products]);
  const paymentLineRows = useMemo(() => itemRows.filter((row) => row.isPaymentLine), [itemRows]);
  const poItemRows = useMemo(() => itemRows.filter((row) => !row.isPaymentLine), [itemRows]);
  const procurementChargeTotals = useMemo(() => {
    if (!procurement) return { transfer: 0, stampDuty: 0, total: 0, count: 0 };
    return procurement.items.reduce((acc, item) => {
      if (item.productId !== 'charge-transfer-fees' && item.productId !== 'charge-stamp-duty') {
        acc.count += 1;
      }
      if (item.productId === 'charge-transfer-fees') {
        acc.transfer += item.costAtPurchase;
      } else if (item.productId === 'charge-stamp-duty') {
        acc.stampDuty += item.costAtPurchase;
      }
      acc.total = acc.transfer + acc.stampDuty;
      return acc;
    }, { transfer: 0, stampDuty: 0, total: 0, count: 0 });
  }, [procurement]);
  const nonChargeLineCount = useMemo(
    () => procurement?.items.filter((item) => item.productId !== 'charge-transfer-fees' && item.productId !== 'charge-stamp-duty').length ?? 0,
    [procurement]
  );
  // Same list the PO side panel shows (src/lib/procurement-activity.ts).
  const activity = useMemo(() => (procurement ? getProcurementActivity(procurement) : []), [procurement]);
  const submittedBy = useMemo(() => (procurement ? getProcurementSubmitter(procurement) : ''), [procurement]);

  const handleDelete = () => {
    if (!procurement) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteProcurement(procurement.id, businessId);
    router.back();
  };

  const handleEdit = () => {
    if (!procurement) return;
    router.replace(`/(tabs)/finance?section=${procurementSection}&editProcurementId=${encodeURIComponent(procurement.id)}` as any);
  };

  const handleUpdateStatus = (nextStatus: string) => {
    if (!procurement) return;
    const normalizedStatus = nextStatus.trim();
    if (!normalizedStatus || status.trim().toLowerCase() === normalizedStatus.toLowerCase()) return;
    const nextNotes = buildProcurementNotes(
      stripMetadata(procurement.notes),
      poNumber,
      normalizedStatus,
      receivedDate,
      {
        paid_date: paidDate,
        received_date: receivedDate,
        requested_status: normalizedStatus,
      },
      procurement.notes
    );
    updateProcurement(procurement.id, { notes: nextNotes }, businessId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!procurement) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: palette.page }}>
        <Text style={{ color: palette.faint }} className="text-base">Purchase order not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl px-6 py-3" style={{ backgroundColor: palette.softFill }}>
          <Text style={{ color: palette.text }} className="font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const StatusBadge = () => (
    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: statusColors.bg }}>
      <Text style={{ color: statusColors.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>{status}</Text>
    </View>
  );

  const cardStyle = { borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card };

  const activityCard = activity.length > 0 ? (
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Activity</Text>
        <Text style={{ color: palette.faint, fontSize: 12 }}>{activity.length} {activity.length === 1 ? 'event' : 'events'}</Text>
      </View>
      <View style={{ gap: 14 }}>
        {activity.map((entry, index) => (
          <View key={`${entry.label}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: index === 0 ? palette.limeOnSurface : palette.outline, marginTop: 4 }} />
              {index < activity.length - 1 ? (
                <View style={{ width: 1, flex: 1, backgroundColor: palette.hairline, marginTop: 6, minHeight: 28 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: 10, lineHeight: 15, fontWeight: '600' }}>{entry.label}</Text>
              <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>
                {entry.actorName}{Number.isFinite(new Date(entry.at).getTime()) ? ` · ${new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  ) : null;


  return (
    <View className="flex-1" style={{ backgroundColor: palette.page }}>
      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 300, borderRadius: 28, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Trash2 size={22} color="#EF4444" strokeWidth={2} />
            </View>
            <MoneyText style={{ color: palette.text, fontSize: 18, marginBottom: 6 }}>Delete Purchase Order?</MoneyText>
            <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center', marginBottom: 22 }}>This action cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                <MoneyText style={{ color: palette.text, fontSize: 14 }}>Cancel</MoneyText>
              </Pressable>
              <Pressable onPress={handleDelete} style={{ flex: 1, height: 46, borderRadius: 23, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' }}>
                <MoneyText style={{ color: '#FFFFFF', fontSize: 14 }}>Delete</MoneyText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View
          className="flex-row items-center justify-between px-5"
          style={{
            paddingTop: isWebDesktop ? 14 : 24,
            paddingBottom: isWebDesktop ? 14 : 16,
            borderBottomWidth: 1,
            borderBottomColor: palette.hairline,
          }}
        >
          <Pressable onPress={() => router.back()} className="flex-row items-center" style={{ gap: 10 }}>
            <ArrowLeft size={22} color={palette.text} strokeWidth={2} />
            <MoneyText style={{ color: palette.text, fontSize: 20, lineHeight: 26 }}>PO Details</MoneyText>
          </Pressable>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={handleEdit}
              className="rounded-full flex-row items-center px-4"
              style={{ height: 40, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.card, gap: 6 }}
            >
              <Pencil size={14} color={palette.muted} strokeWidth={2} />
              <MoneyText style={{ color: palette.text, fontSize: 14 }}>Edit</MoneyText>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}
            >
              <MoreVertical size={18} color={palette.muted} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 32,
            gap: 12,
          }}
        >
          {/* Hero card */}
          <View style={cardStyle}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
              <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 }}>Procurement</Text>
                  <MoneyText style={{ color: palette.text, fontSize: 18, lineHeight: 24 }} numberOfLines={2}>
                    {capitalizeDisplayValue(procurement.title || poNumber)}
                  </MoneyText>
                  <Text style={{ color: palette.faint, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
                  </Text>
                </View>
                <StatusBadge />
              </View>
              <MoneyText style={{ color: palette.text, fontSize: isWebDesktop ? 40 : 32, lineHeight: isWebDesktop ? 46 : 38, marginTop: 14 }}>
                {formatCurrency(procurement.totalCost)}
              </MoneyText>
              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6 }}>
                {poNumber} · Paid on {paidDate}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Supplier</Text>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                  {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: palette.hairline }} />
              <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Line Items</Text>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                  {nonChargeLineCount > 0 ? nonChargeLineCount : procurement.items.length}
                </Text>
              </View>
            </View>
          </View>

          {/* Status */}
          <View style={{ ...cardStyle, padding: 16 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 12 }}>Status</Text>
            {(() => {
              // Same look as the status picker on an order: the current status in a tinted box, tap it to pick another.
              const currentColor = statusColors.text;
              return (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => setStatusListOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel="Change status"
                    style={{
                      minHeight: 50,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      borderRadius: 14,
                      backgroundColor: `${currentColor}1f`,
                      borderWidth: 1,
                      borderColor: `${currentColor}55`,
                    }}
                  >
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: currentColor }} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Current status</Text>
                      <Text style={{ color: currentColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{capitalizeDisplayValue(status)}</Text>
                    </View>
                    <ChevronDown size={16} color={palette.textSoft} strokeWidth={2.4} />
                  </Pressable>

                  {statusListOpen ? (
                    <View style={{ padding: 6, borderRadius: 16, backgroundColor: palette.cardHover, borderWidth: 1, borderColor: palette.outline }}>
                      {visibleStatusOptions.map((option) => {
                        const optionColor = (STATUS_COLORS[option.toLowerCase()] ?? { bg: palette.softFill, text: palette.muted }).text;
                        const isSelected = status.trim().toLowerCase() === option.trim().toLowerCase();
                        const isCancel = /cancel/i.test(option);
                        return (
                          <Pressable
                            key={option}
                            onPress={() => {
                              setStatusListOpen(false);
                              if (isSelected) return;
                              handleUpdateStatus(option);
                            }}
                            className="active:opacity-80"
                            style={{
                              minHeight: 42,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              backgroundColor: isSelected ? palette.softFill : 'transparent',
                            }}
                          >
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: optionColor }} />
                            <Text style={{ color: isCancel ? palette.danger : palette.text, fontSize: 14, fontWeight: isSelected ? '600' : '500', flex: 1 }}>
                              {capitalizeDisplayValue(option)}
                            </Text>
                            {isSelected ? <Check size={14} color={palette.text} strokeWidth={2.6} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })()}
          </View>

          {/* Details */}
          <View style={cardStyle}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Details</Text>
            </View>
            {[
              { label: 'PO Name', value: procurement.title || poNumber, icon: <FileText size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Supplier', value: procurement.supplierName || '—', icon: <User size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Status', value: status, icon: <Truck size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Submitted by', value: submittedBy || '—', icon: <User size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Date Paid', value: paidDate || '—', icon: <Calendar size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Date Received', value: receivedDate || '—', icon: <Calendar size={13} color={palette.faint} strokeWidth={2} /> },
              { label: 'Created', value: createdAt || '—', icon: <Clock size={13} color={palette.faint} strokeWidth={2} /> },
            ].map((row, index) => (
              <View
                key={row.label}
                className="flex-row justify-between"
                style={{
                  alignItems: 'flex-start',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderTopWidth: index === 0 ? 1 : 0,
                  borderTopColor: palette.hairline,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {row.icon}
                  <Text style={{ color: palette.faint, fontSize: 12 }}>{row.label}</Text>
                </View>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 20 }}>
                  {capitalizeDisplayValue(row.value)}
                </Text>
              </View>
            ))}
          </View>

          {/* PO Items (collapsed by default) */}
          {poItemRows.length > 0 ? (
            <View style={{ ...cardStyle, overflow: 'hidden' }}>
              <Pressable
                onPress={() => {
                  setShowPoItems((current) => !current);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="flex-row items-center justify-between"
                style={{ paddingHorizontal: 16, paddingVertical: 14 }}
              >
                <View>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>PO Items</Text>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                    {poItemRows.length} item{poItemRows.length === 1 ? '' : 's'}
                  </Text>
                </View>
                {showPoItems ? (
                  <ChevronDown size={16} color={palette.faint} strokeWidth={2} />
                ) : (
                  <ChevronRight size={16} color={palette.faint} strokeWidth={2} />
                )}
              </Pressable>
              {showPoItems ? poItemRows.map((item) => (
                <View
                  key={item.id}
                  className="flex-row justify-between"
                  style={{ alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline, gap: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Package size={13} color={palette.faint} strokeWidth={2} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: palette.text, fontSize: 12 }} numberOfLines={2}>{capitalizeDisplayValue(item.name)}</Text>
                      <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                        Qty {item.quantityPurchased || item.quantityReceived}{item.unitCost > 0 ? ` · Unit ${formatCurrency(item.unitCost)}` : ''}
                      </Text>
                    </View>
                  </View>
                  {item.total > 0 ? (
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>{formatCurrency(item.total)}</Text>
                  ) : null}
                </View>
              )) : null}
            </View>
          ) : null}

          {/* Payment Breakdown */}
          {itemRows.length > 0 ? (
            <View style={cardStyle}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Payment Breakdown</Text>
              </View>
              {paymentLineRows.map((item, index) => (
                <View
                  key={item.id}
                  className="flex-row justify-between"
                  style={{
                    alignItems: 'flex-start',
                    paddingHorizontal: 16,
                    paddingTop: index === 0 ? 4 : 8,
                    paddingBottom: 8,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Package size={13} color={palette.faint} strokeWidth={2} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: palette.text, fontSize: 12 }} numberOfLines={1}>{capitalizeDisplayValue(item.name)}</Text>
                      <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                        Qty {item.quantityReceived}/{item.quantityPurchased || item.quantityReceived} · Unit {formatCurrency(item.unitCost || 0)}
                      </Text>
                      {item.paymentDate ? (
                        <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                          Paid {item.paymentDate}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>{formatCurrency(item.total)}</Text>
                    <Text style={{ color: item.expectedProfit >= 0 ? colors.success : palette.danger, fontSize: 11, marginTop: 1 }}>
                      Profit {formatCurrency(item.expectedProfit)}
                    </Text>
                  </View>
                </View>
              ))}
              {procurementChargeTotals.total > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                  {procurementChargeTotals.transfer > 0 ? (
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: palette.faint, fontSize: 10 }}>
                        Transfer fees{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>
                        {formatCurrency(procurementChargeTotals.transfer)}
                      </Text>
                    </View>
                  ) : null}
                  {procurementChargeTotals.stampDuty > 0 ? (
                    <View className="flex-row items-center justify-between" style={{ marginTop: procurementChargeTotals.transfer > 0 ? 6 : 0 }}>
                      <Text style={{ color: palette.faint, fontSize: 10 }}>
                        Stamp duty{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>
                        {formatCurrency(procurementChargeTotals.stampDuty)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>Total Cost</Text>
                <MoneyText style={{ color: palette.text, fontSize: 16 }}>{formatCurrency(procurement.totalCost)}</MoneyText>
              </View>
            </View>
          ) : null}

          {/* Attachments */}
          {(procurement.attachments?.length ?? 0) > 0 ? (
            <View style={cardStyle}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Attachments</Text>
              </View>
              {procurement.attachments!.map((attachment, index) => (
                <Pressable
                  key={`${attachment.storagePath ?? attachment.uri}-${index}`}
                  onPress={() => {
                    void openAttachmentPath(attachment.storagePath ?? attachment.uri).catch(() => null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 1 : 0, borderTopColor: palette.border, gap: 12 }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                    {attachment.mimeType?.startsWith('image/') ? (
                      <ImageIcon size={16} color={palette.faint} strokeWidth={1.5} />
                    ) : (
                      <FileText size={16} color={palette.faint} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{attachment.name || `Attachment ${index + 1}`}</Text>
                    {attachment.mimeType ? <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>{attachment.mimeType}</Text> : null}
                  </View>
                  <Paperclip size={14} color={palette.faint} strokeWidth={1.5} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Notes */}
          {cleanNotes ? (
            <View style={{ ...cardStyle, padding: 16 }}>
              <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 8 }}>Notes</Text>
              <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18 }}>{cleanNotes}</Text>
            </View>
          ) : null}

          {activityCard}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
