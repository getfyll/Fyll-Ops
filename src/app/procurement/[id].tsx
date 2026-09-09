import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Truck, Pencil, Trash2, FileText, Package, Paperclip, Image as ImageIcon, MoreVertical, User, Calendar, Clock, CheckCircle, XCircle, Send, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Procurement, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { openAttachmentPath } from '@/lib/storage-attachments';

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
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    }[];
  }, [procurement, products]);
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
  type ProcActivityEventType = 'create' | 'submit' | 'approve' | 'reject';
  const activityEvents = useMemo<{ label: string; actor: string; ts: string; type: ProcActivityEventType }[]>(() => {
    if (!procurement) return [];
    const events: { label: string; actor: string; ts: string; type: ProcActivityEventType }[] = [];
    events.push({
      label: 'PO created',
      actor: extractMetadataValue(procurement.notes, 'submitted_by_name') || procurement.createdBy || 'Admin',
      ts: procurement.createdAt,
      type: 'create',
    });
    const approvalStatus = extractMetadataValue(procurement.notes, 'approval_status');
    const submittedByName = extractMetadataValue(procurement.notes, 'submitted_by_name');
    const submittedAt = extractMetadataValue(procurement.notes, 'submitted_at');
    const reviewedByName = extractMetadataValue(procurement.notes, 'reviewed_by_name');
    const reviewedAt = extractMetadataValue(procurement.notes, 'reviewed_at');
    if (approvalStatus === 'submitted' || approvalStatus === 'approved' || approvalStatus === 'rejected') {
      events.push({ label: 'Submitted for approval', actor: submittedByName || 'Team member', ts: submittedAt || procurement.createdAt, type: 'submit' });
    }
    if (approvalStatus === 'approved') {
      events.push({ label: 'PO approved', actor: reviewedByName || 'Admin', ts: reviewedAt || '', type: 'approve' });
    } else if (approvalStatus === 'rejected') {
      events.push({ label: 'PO declined', actor: reviewedByName || 'Admin', ts: reviewedAt || '', type: 'reject' });
    }
    return events;
  }, [procurement]);

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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.screen }}>
        <Text style={{ color: colors.text.muted }} className="text-base">Purchase order not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl px-6 py-3" style={{ backgroundColor: colors.bg.input }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const StatusBadge = () => (
    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: statusColors.bg }}>
      <Text className="text-xs font-semibold" style={{ color: statusColors.text }}>{status}</Text>
    </View>
  );

  const cardStyle = { borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 300, borderRadius: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Trash2 size={22} color="#EF4444" strokeWidth={2} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>Delete Purchase Order?</Text>
            <Text style={{ color: colors.text.muted, fontSize: 14, textAlign: 'center', marginBottom: 22 }}>This action cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Delete</Text>
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
            borderBottomColor: colors.divider,
          }}
        >
          <Pressable onPress={() => router.back()} className="flex-row items-center" style={{ gap: 10 }}>
            <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2} />
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold">PO Details</Text>
          </Pressable>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={handleEdit}
              className="rounded-full flex-row items-center px-4"
              style={{ height: 38, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, gap: 6 }}
            >
              <Pencil size={14} color={colors.text.secondary} strokeWidth={2} />
              <Text style={{ color: colors.text.secondary }} className="font-semibold text-sm">Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <MoreVertical size={18} color={colors.text.secondary} strokeWidth={2} />
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
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-1">Procurement</Text>
                  <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 22 : 20, fontWeight: '600', lineHeight: isWebDesktop ? 28 : 26 }} numberOfLines={2}>
                    {capitalizeDisplayValue(procurement.title || poNumber)}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: isWebDesktop ? 14 : 13, marginTop: 4 }} numberOfLines={1}>
                    {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
                  </Text>
                </View>
                <StatusBadge />
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 44, lineHeight: 48, marginTop: 14 }} className="font-medium">
                {formatCurrency(procurement.totalCost)}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: isWebDesktop ? 13 : 12, marginTop: 6 }}>
                {poNumber} · Paid on {paidDate}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold">Supplier</Text>
                <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 16 : 14, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                  {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold">Line Items</Text>
                <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 16 : 14, fontWeight: '600', marginTop: 4 }}>
                  {nonChargeLineCount > 0 ? nonChargeLineCount : procurement.items.length}
                </Text>
              </View>
            </View>
          </View>

          {/* Status */}
          <View style={{ ...cardStyle, padding: 16 }}>
            <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Status</Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {visibleStatusOptions.map((option) => {
                const optionColors = STATUS_COLORS[option.toLowerCase()] ?? { bg: colors.bg.input, text: colors.text.secondary };
                const isSelected = status.trim().toLowerCase() === option.trim().toLowerCase();
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      if (isSelected) return;
                      handleUpdateStatus(option);
                    }}
                    style={{
                      height: 34,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? optionColors.bg : colors.bg.input,
                      borderWidth: 1,
                      borderColor: isSelected ? optionColors.text : colors.divider,
                    }}
                  >
                    <Text style={{ color: isSelected ? optionColors.text : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                      {capitalizeDisplayValue(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Details */}
          <View style={cardStyle}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider">Details</Text>
            </View>
            {[
              { label: 'PO Name', value: procurement.title || poNumber, icon: <FileText size={13} color={colors.text.tertiary} strokeWidth={2} /> },
              { label: 'Supplier', value: procurement.supplierName || '—', icon: <User size={13} color={colors.text.tertiary} strokeWidth={2} /> },
              { label: 'Status', value: status, icon: <Truck size={13} color={colors.text.tertiary} strokeWidth={2} /> },
              { label: 'Date Paid', value: paidDate || '—', icon: <Calendar size={13} color={colors.text.tertiary} strokeWidth={2} /> },
              { label: 'Date Received', value: receivedDate || '—', icon: <Calendar size={13} color={colors.text.tertiary} strokeWidth={2} /> },
              { label: 'Created', value: createdAt || '—', icon: <Clock size={13} color={colors.text.tertiary} strokeWidth={2} /> },
            ].map((row, index) => (
              <View
                key={row.label}
                className="flex-row justify-between"
                style={{
                  alignItems: 'flex-start',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderTopWidth: index === 0 ? 1 : 0,
                  borderTopColor: colors.divider,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {row.icon}
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{row.label}</Text>
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 20 }}>
                  {capitalizeDisplayValue(row.value)}
                </Text>
              </View>
            ))}
          </View>

          {/* Payment Breakdown */}
          {itemRows.length > 0 ? (
            <View style={cardStyle}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider">Payment Breakdown</Text>
              </View>
              {itemRows.map((item, index) => (
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
                    <Package size={13} color={colors.text.tertiary} strokeWidth={2} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }} numberOfLines={1}>{capitalizeDisplayValue(item.name)}</Text>
                      <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                        Qty {item.quantityReceived}/{item.quantityPurchased || item.quantityReceived} · Unit {formatCurrency(item.unitCost || 0)}
                      </Text>
                      {item.paymentDate ? (
                        <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                          Paid {item.paymentDate}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>{formatCurrency(item.total)}</Text>
                    <Text style={{ color: item.expectedProfit >= 0 ? colors.success : colors.danger, fontSize: 11, marginTop: 1 }}>
                      Profit {formatCurrency(item.expectedProfit)}
                    </Text>
                  </View>
                </View>
              ))}
              {procurementChargeTotals.total > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  {procurementChargeTotals.transfer > 0 ? (
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                        Transfer fees{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                      </Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                        {formatCurrency(procurementChargeTotals.transfer)}
                      </Text>
                    </View>
                  ) : null}
                  {procurementChargeTotals.stampDuty > 0 ? (
                    <View className="flex-row items-center justify-between" style={{ marginTop: procurementChargeTotals.transfer > 0 ? 6 : 0 }}>
                      <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                        Stamp duty{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                      </Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                        {formatCurrency(procurementChargeTotals.stampDuty)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>Total Cost</Text>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '500' }}>{formatCurrency(procurement.totalCost)}</Text>
              </View>
            </View>
          ) : null}

          {/* Attachments */}
          {(procurement.attachments?.length ?? 0) > 0 ? (
            <View style={cardStyle}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider">Attachments</Text>
              </View>
              {procurement.attachments!.map((attachment, index) => (
                <Pressable
                  key={`${attachment.storagePath ?? attachment.uri}-${index}`}
                  onPress={() => {
                    void openAttachmentPath(attachment.storagePath ?? attachment.uri).catch(() => null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 1 : 0, borderTopColor: colors.divider, gap: 12 }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}>
                    {attachment.mimeType?.startsWith('image/') ? (
                      <ImageIcon size={16} color={colors.text.tertiary} strokeWidth={1.5} />
                    ) : (
                      <FileText size={16} color={colors.text.tertiary} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{attachment.name || `Attachment ${index + 1}`}</Text>
                    {attachment.mimeType ? <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>{attachment.mimeType}</Text> : null}
                  </View>
                  <Paperclip size={14} color={colors.text.muted} strokeWidth={1.5} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Notes */}
          {cleanNotes ? (
            <View style={{ ...cardStyle, padding: 16 }}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold mb-2">Notes</Text>
              <Text style={{ color: colors.text.primary, lineHeight: 22 }} className="text-sm">{cleanNotes}</Text>
            </View>
          ) : null}

          {/* Activity */}
          {activityEvents.length > 0 ? (
            <View style={cardStyle}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider">Activity</Text>
              </View>
              {activityEvents.map((event, index) => {
                const isLast = index === activityEvents.length - 1;
                const dotColor = event.type === 'approve' ? '#10B981' : event.type === 'reject' ? '#EF4444' : event.type === 'submit' ? '#3B82F6' : colors.text.muted;
                const dotBg = event.type === 'approve' ? 'rgba(16,185,129,0.12)' : event.type === 'reject' ? 'rgba(239,68,68,0.12)' : event.type === 'submit' ? 'rgba(59,130,246,0.12)' : colors.bg.input;
                const EventIcon = event.type === 'approve' ? CheckCircle : event.type === 'reject' ? XCircle : event.type === 'submit' ? Send : PlusCircle;
                const tsMs = new Date(event.ts).getTime();
                const tsLabel = (() => {
                  if (!Number.isFinite(tsMs)) return '';
                  const diffMs = Date.now() - tsMs;
                  const mins = Math.floor(diffMs / 60000);
                  if (mins < 1) return 'just now';
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  const days = Math.floor(hrs / 24);
                  if (days < 7) return `${days}d ago`;
                  return new Date(tsMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })();
                return (
                  <View key={`${event.label}-${index}`} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: isLast ? 16 : 0 }}>
                    <View style={{ width: 32, alignItems: 'center', paddingTop: 2 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center' }}>
                        <EventIcon size={13} color={dotColor} strokeWidth={2} />
                      </View>
                      {!isLast ? <View style={{ width: 1.5, flex: 1, backgroundColor: colors.divider, marginTop: 4 }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingLeft: 10, paddingTop: 4, paddingBottom: isLast ? 0 : 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1 }}>{event.label}</Text>
                        {tsLabel ? <Text style={{ color: colors.text.muted, fontSize: 10 }}>{tsLabel}</Text> : null}
                      </View>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }}>{event.actor}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
